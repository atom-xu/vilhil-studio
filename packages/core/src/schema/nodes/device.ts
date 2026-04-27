import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { quantizePoint3 } from '../precision'

// ═══════════════════════════════════════════════════════════════
// 子系统枚举 - 9大子系统
// ═══════════════════════════════════════════════════════════════

export const SubsystemEnum = z.enum([
  'architecture',
  'lighting',
  'panel',
  'sensor',
  'curtain',
  'hvac',
  'av',
  'security',
  'network',
])

export type Subsystem = z.infer<typeof SubsystemEnum>

// ═══════════════════════════════════════════════════════════════
// 设备安装类型
// ═══════════════════════════════════════════════════════════════

export const MountTypeEnum = z.enum([
  'ceiling',
  'wall',
  'floor',
  'wall_switch',
  'door',
  'window',
  'din_rail',
  'track',
  'hidden',
  'ceiling_suspended',
])

export type MountType = z.infer<typeof MountTypeEnum>

// ═══════════════════════════════════════════════════════════════
// 设备参数定义
// ═══════════════════════════════════════════════════════════════

// 面板按键动作类型
//
// 【回路优先模式】toggle / set 分支支持两种目标：
//   - circuitId（推荐）：指向一条回路，运行时查 `params.circuitId === X` 的全部灯。
//                      好处：回路里增减灯不用改面板配置。
//   - deviceIds（向后兼容）：老数据或手动自选的灯 id 列表。
//
// 优先级：`circuitId` 非空 → 用回路；否则 fall back 到 `deviceIds`。
// 两者可以共存但 **运行时只认 circuitId**（同时填 deviceIds 被忽略）。
const PanelActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('toggle'),
    circuitId: z.string().optional(),
    deviceIds: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal('set'),
    circuitId: z.string().optional(),
    deviceIds: z.array(z.string()).default([]),
    state: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('scene'),
    sceneId: z.string(),
  }),
])

const PanelKeyConfigSchema = z.object({
  keyIndex: z.number().int().min(0),
  label: z.string(),
  action: PanelActionSchema,
})

/** 窗帘层配置（curtain 子系统专用）
 *  - 单层：[{ material: 'blackout' }]
 *  - 双层：[{ material: 'sheer' }, { material: 'blackout' }]（内外层顺序）
 *  - 可任意 N 层；运行时每层开合度存在 state.layerPositions[i] */
const CurtainLayerSchema = z.object({
  material: z.enum(['blackout', 'sheer']).default('blackout'),
})

export const DeviceParamsSchema = z.object({
  direction: z.number().min(0).max(360).optional(),
  elevation: z.number().min(-90).max(90).optional(),
  coverageRadius: z.number().optional(),
  coverageAngle: z.number().optional(),
  beamAngle: z.number().optional(),
  curtainWidth: z.number().optional(),
  /** 窗帘层配置（多层任意，每层独立材质） */
  layers: z.array(CurtainLayerSchema).optional(),
  /** 面板按键数量（面板子系统专用） */
  buttonCount: z.number().int().min(1).max(8).optional(),
  /**
   * 回路 id —— 同一 circuitId 的灯共享一条回路。
   * 自动归组规则：连续放置同一种灯 → 同一回路；
   *             切换设备种类 / 退出放置模式 → 新回路；
   *             右侧"连接/独立"按钮可以手动合并或拆开。
   *
   * 面板按键后续可以直接绑定回路 id（而不是设备 id 列表），
   * 数据上更稳健（回路里增减灯不影响按键配置）。
   */
  circuitId: z.string().optional(),
  /**
   * 灯带 / 线性发光设备的折线路径（plan 坐标，[x, z] 列表）。
   *
   * 出现条件：catalog 里 type === 'light-strip' 的灯带类设备
   *   - 用户用画线工具一段段画出来
   *   - 至少 2 个点；可以是任意 N 段折线
   *   - 渲染时 2D 画 SVG polyline、3D 沿路径拉细圆柱
   *
   * device.position 仍然存在（取 path 中点），用于：
   *   - 选中后右侧面板的"位置"显示
   *   - 回路虚线连接时取这个点做贪心串联
   *   - 3D 视口聚焦相机时的 lookAt 目标
   */
  path: z.array(z.tuple([z.number(), z.number()])).optional(),
  /**
   * 灯带的发光朝向 —— 决定 3D 光源往哪打、洗墙 vs 洗顶 vs 普通隐藏。
   *
   *   - 'down'  普通灯带（朝下，吊顶藏灯/橱柜底）
   *   - 'up'    回形灯槽（朝顶，反射柔和氛围光）
   *   - 'wall'  洗墙灯（朝单侧墙面）
   *   - 'omni'  全向（默认 LED 灯带）
   */
  emissionDirection: z.enum(['down', 'up', 'wall', 'omni']).optional(),
  wallId: z.string().optional(),
  wallT: z.number().min(0).max(1).optional(),
  /**
   * 墙挂设备所在的墙面（2D 放置时自动识别）
   * - 'front' = 墙的左法线方向（墙 start→end 顺时针转 90°）
   * - 'back'  = 墙的右法线方向
   * 影响 3D 渲染时设备朝向 + 偏移到墙的哪一侧
   */
  wallSide: z.enum(['front', 'back']).optional(),
  openingId: z.string().optional(),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  protocol: z.enum(['knx', 'zigbee', 'zwave', 'wifi', 'bluetooth', 'matter']).optional(),
  /** 面板按键配置（panel 子系统专用） */
  panelKeys: z.array(PanelKeyConfigSchema).optional(),
  custom: z.any().optional(),
})

export type DeviceParams = z.infer<typeof DeviceParamsSchema>

// ═══════════════════════════════════════════════════════════════
// 实例业务配置（Instance Layer）
// ═══════════════════════════════════════════════════════════════

const DeviceControlSchema = z.object({
  target_id: z.string(),
  function: z.enum([
    'on_off',
    'dimming',
    'open_close',
    'temp_mode',
    'fan_speed',
    'scene_trigger',
    'lock_unlock',
    'unknown',
  ]),
  label: z.string().optional(),
})

export type DeviceControl = z.infer<typeof DeviceControlSchema>

const DeviceConfigurationSchema = z.object({
  custom_label: z.string().optional(),
  controls: z.array(DeviceControlSchema).optional(),
  scenes: z.array(z.string()).optional(),
  bus_address: z.string().optional(),
  gateway_id: z.string().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
})

export type DeviceConfiguration = z.infer<typeof DeviceConfigurationSchema>

const DeviceDeliverySchema = z.object({
  quoted: z.boolean().default(false),
  quoted_price_rmb: z.number().optional(),
  purchased: z.boolean().default(false),
  installed: z.boolean().default(false),
  commissioned: z.boolean().default(false),
})

export type DeviceDelivery = z.infer<typeof DeviceDeliverySchema>

const DeviceInstanceMetadataSchema = z.object({
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  notes: z.string().optional(),
})

export type DeviceInstanceMetadata = z.infer<typeof DeviceInstanceMetadataSchema>

// ═══════════════════════════════════════════════════════════════
// 设备节点 Schema
// ═══════════════════════════════════════════════════════════════

export const DeviceNode = BaseNode.extend({
  id: objectId('device'),
  type: nodeType('device'),
  parentId: z.string().nullable(),
  subsystem: SubsystemEnum,
  renderType: z.string(),
  // 设备世界坐标 (x, y, z)。挂 1cm 量化。
  // 说明：国内设备安装高度（筒灯 2.7m / 面板 1.3m / 开关 1.1m / 插座 0.3m）
  // 全部天然对齐 1cm。若未来有特定设备需要 mm 精度（极少数情况），
  // 可以在 params.custom 里额外存一个精确字段。
  position: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 0])
    .transform(quantizePoint3),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  mountType: MountTypeEnum.default('ceiling'),
  productId: z.string().optional(),
  productName: z.string().optional(),
  brand: z.string().optional(),
  params: DeviceParamsSchema.default({}),
  state: z.any().default({}),
  showAnimation: z.boolean().default(true),
  linkedScenes: z.array(z.string()).default([]),
  // 实例业务配置（控制绑定、场景关联、总线地址等）
  instanceConfig: DeviceConfigurationSchema.optional(),
  // 交付追踪（报价→采购→安装→调试）
  delivery: DeviceDeliverySchema.optional(),
  // 实例元数据（备注、创建时间等）
  instanceMeta: DeviceInstanceMetadataSchema.optional(),
}).describe(dedent`Device node - 智能家居设备`)

export type DeviceNode = z.infer<typeof DeviceNode>

// ═══════════════════════════════════════════════════════════════
// 场景 Schema
// ═══════════════════════════════════════════════════════════════

/**
 * 场景效果（SceneEffect）的目标二选一：
 *   - `deviceId`：单个具体设备
 *   - `circuitId`：整条回路（运行时展开为该回路所有灯，对每盏灯都应用 state）
 *
 * 优先级：`circuitId` 非空 → 走回路；否则用 `deviceId`。
 * 这样回路里增减灯，场景效果不用改。
 *
 * 加载阶段两个字段都是 optional —— 历史数据只有 deviceId，新数据可能只有 circuitId。
 * 写入侧（`addSceneEffect` / `addSceneCircuitEffect`）保证至少有一个非空。
 */
export const SceneEffectSchema = z.object({
  deviceId: z.string().optional(),
  circuitId: z.string().optional(),
  delay: z.number().default(0),
  duration: z.number().default(0),
  state: z.any(),
})

export type SceneEffect = z.infer<typeof SceneEffectSchema>

export const SceneNode = BaseNode.extend({
  id: objectId('scene'),
  type: nodeType('scene'),
  name: z.string(),
  icon: z.string().optional(),
  effects: z.array(SceneEffectSchema).default([]),
}).describe(dedent`Scene node - 智能场景`)

export type SceneNode = z.infer<typeof SceneNode>

// ═══════════════════════════════════════════════════════════════
// 子系统元数据
// ═══════════════════════════════════════════════════════════════

export const SUBSYSTEM_META: Record<Subsystem, { label: string; color: string }> = {
  architecture: { label: '架构', color: '#94a3b8' },
  lighting: { label: '灯光', color: '#d4a853' },
  panel: { label: '面板', color: '#c8b8a0' },
  sensor: { label: '传感器', color: '#4ade80' },
  curtain: { label: '窗帘', color: '#3dd9b6' },
  hvac: { label: '暖通', color: '#9b7bea' },
  av: { label: '影音', color: '#5ba0f5' },
  security: { label: '安防', color: '#f59e0b' },
  network: { label: '网络', color: '#60a5fa' },
}

export const getSubsystemLabel = (subsystem: Subsystem): string =>
  SUBSYSTEM_META[subsystem]?.label ?? subsystem

export const getSubsystemColor = (subsystem: Subsystem): string =>
  SUBSYSTEM_META[subsystem]?.color ?? '#888'
