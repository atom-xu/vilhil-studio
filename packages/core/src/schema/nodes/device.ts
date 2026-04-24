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
const PanelActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('toggle'),
    deviceIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal('set'),
    deviceIds: z.array(z.string()),
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

export const SceneEffectSchema = z.object({
  deviceId: z.string(),
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
