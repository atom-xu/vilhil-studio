import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

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

export const DeviceParamsSchema = z.object({
  direction: z.number().min(0).max(360).optional(),
  elevation: z.number().min(-90).max(90).optional(),
  coverageRadius: z.number().optional(),
  coverageAngle: z.number().optional(),
  wallId: z.string().optional(),
  wallT: z.number().min(0).max(1).optional(),
  openingId: z.string().optional(),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  protocol: z.enum(['knx', 'zigbee', 'zwave', 'wifi', 'bluetooth', 'matter']).optional(),
  custom: z.any().optional(),
})

export type DeviceParams = z.infer<typeof DeviceParamsSchema>

// ═══════════════════════════════════════════════════════════════
// 设备节点 Schema
// ═══════════════════════════════════════════════════════════════

export const DeviceNode = BaseNode.extend({
  id: objectId('device'),
  type: nodeType('device'),
  parentId: z.string(),
  subsystem: SubsystemEnum,
  renderType: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  mountType: MountTypeEnum.default('ceiling'),
  productId: z.string().optional(),
  productName: z.string().optional(),
  brand: z.string().optional(),
  params: DeviceParamsSchema.default({}),
  state: z.any().default({}),
  showAnimation: z.boolean().default(true),
  linkedScenes: z.array(z.string()).default([]),
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
