/**
 * VilHil 智能设备目录
 *
 * 从 3Dhouse 的 deviceCatalog.js 迁移
 * catalogId — 产品型号（稳定 ID，用于报价和 IoT 映射）
 */

import type { Subsystem, MountType } from '@pascal-app/core'

// ═══════════════════════════════════════════════════════════════
// 设备定义接口
// ═══════════════════════════════════════════════════════════════

export interface DeviceDefinition {
  catalogId: string
  name: string
  description: string
  type: 'light' | 'panel' | 'motor' | 'sensor' | 'lock' | 'ap' | 'gateway' | 'actuator' | 'equipment' | 'host'
  subtype: string
  color: string
  defaultH: number
  size: [number, number, number] // [w, h, d]
  subsystem: Subsystem
  mountType: MountType
  // 可选字段
  modelId?: string
  iconType?: string
  lightType?: 'point' | 'line' | 'physical'
  buttonCount?: number
  controlType?: 'switch' | 'dimmer' | 'scene' | 'touch' | 'thermostat'
  hasScreen?: boolean
  coverageRadius?: number
  requiresOpening?: 'door' | 'window'
}

// ═══════════════════════════════════════════════════════════════
// 子系统元数据
// ═══════════════════════════════════════════════════════════════

export const SUBSYSTEM_ORDER: Subsystem[] = [
  'architecture',
  'lighting',
  'panel',
  'sensor',
  'curtain',
  'hvac',
  'av',
  'security',
  'network',
]

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

export const getSubsystemColor = (key: Subsystem): string =>
  SUBSYSTEM_META[key]?.color ?? '#888'

export const getSubsystemLabel = (key: Subsystem): string =>
  SUBSYSTEM_META[key]?.label ?? key

// ═══════════════════════════════════════════════════════════════
// 设备目录
// ═══════════════════════════════════════════════════════════════

const LIGHTING_FIXTURES: DeviceDefinition[] = [
  {
    catalogId: 'LIGHT-DOWNLIGHT',
    name: '智能筒灯',
    description: '嵌入式筒灯，点光源',
    type: 'light',
    subtype: 'downlight',
    color: '#d4a853',
    defaultH: 2.7,
    size: [0.085, 0.055, 0.085],
    subsystem: 'lighting',
    mountType: 'ceiling',
    lightType: 'point',
  },
  {
    catalogId: 'LIGHT-STRIP',
    name: 'LED灯带',
    description: '线性灯带，线光源',
    type: 'light',
    subtype: 'strip',
    color: '#d4a853',
    defaultH: 2.6,
    size: [0.5, 0.005, 0.01],
    subsystem: 'lighting',
    mountType: 'hidden',
    lightType: 'line',
  },
  {
    catalogId: 'LIGHT-PENDANT',
    name: '吊灯',
    description: '悬挂式吊灯',
    type: 'light',
    subtype: 'pendant',
    color: '#d4a853',
    defaultH: 2.2,
    size: [0.25, 0.4, 0.25],
    subsystem: 'lighting',
    mountType: 'ceiling_suspended',
    lightType: 'physical',
  },
  {
    catalogId: 'LIGHT-WALL',
    name: '壁灯',
    description: '壁挂式壁灯',
    type: 'light',
    subtype: 'wall-light',
    color: '#d4a853',
    defaultH: 1.8,
    size: [0.12, 0.18, 0.1],
    subsystem: 'lighting',
    mountType: 'wall',
    lightType: 'physical',
  },
]

const LIGHTING_CONTROLS: DeviceDefinition[] = [
  {
    catalogId: 'PANEL-SWITCH-1KEY',
    name: '单路开关',
    description: '单键智能开关面板',
    type: 'panel',
    subtype: 'switch-1key',
    color: '#94A3B8',
    defaultH: 1.35,
    size: [0.086, 0.008, 0.086],
    subsystem: 'panel',
    mountType: 'wall_switch',
    buttonCount: 1,
    controlType: 'switch',
  },
  {
    catalogId: 'PANEL-SWITCH-2KEY',
    name: '双路开关',
    description: '双键智能开关面板',
    type: 'panel',
    subtype: 'switch-2key',
    color: '#94A3B8',
    defaultH: 1.35,
    size: [0.086, 0.008, 0.086],
    subsystem: 'panel',
    mountType: 'wall_switch',
    buttonCount: 2,
    controlType: 'switch',
  },
  {
    catalogId: 'PANEL-SWITCH-3KEY',
    name: '三路开关',
    description: '三键智能开关面板',
    type: 'panel',
    subtype: 'switch-3key',
    color: '#94A3B8',
    defaultH: 1.35,
    size: [0.086, 0.008, 0.086],
    subsystem: 'panel',
    mountType: 'wall_switch',
    buttonCount: 3,
    controlType: 'switch',
  },
  {
    catalogId: 'PANEL-DIMMER-KNOB',
    name: '调光旋钮',
    description: '旋钮式调光面板',
    type: 'panel',
    subtype: 'dimmer-knob',
    color: '#94A3B8',
    defaultH: 1.35,
    size: [0.086, 0.012, 0.086],
    subsystem: 'panel',
    mountType: 'wall_switch',
    controlType: 'dimmer',
  },
  {
    catalogId: 'PANEL-SCENE-4KEY',
    name: '四键场景面板',
    description: '四键场景控制面板',
    type: 'panel',
    subtype: 'scene-4key',
    color: '#94A3B8',
    defaultH: 1.35,
    size: [0.086, 0.008, 0.086],
    subsystem: 'panel',
    mountType: 'wall_switch',
    buttonCount: 4,
    controlType: 'scene',
  },
  {
    catalogId: 'PANEL-SCENE-6KEY',
    name: '六键场景面板',
    description: '六键场景控制面板',
    type: 'panel',
    subtype: 'scene-6key',
    color: '#94A3B8',
    defaultH: 1.35,
    size: [0.086, 0.008, 0.146],
    subsystem: 'panel',
    mountType: 'wall_switch',
    buttonCount: 6,
    controlType: 'scene',
  },
]

const HVAC_DEVICES: DeviceDefinition[] = [
  {
    catalogId: 'HVAC-THERMOSTAT',
    name: '温控面板',
    description: '暖通温度控制面板',
    type: 'panel',
    subtype: 'thermostat',
    color: '#9b7bea',
    defaultH: 1.35,
    size: [0.086, 0.012, 0.086],
    subsystem: 'hvac',
    mountType: 'wall_switch',
    hasScreen: true,
    controlType: 'thermostat',
  },
  {
    catalogId: 'HVAC-VENT-4WAY',
    name: '四向出风口',
    description: '中央空调四向出风口',
    type: 'equipment',
    subtype: 'vent-4way',
    color: '#E0E0E0',
    defaultH: 2.7,
    size: [0.3, 0.05, 0.3],
    subsystem: 'hvac',
    mountType: 'ceiling',
  },
]

const CURTAIN_DEVICES: DeviceDefinition[] = [
  {
    catalogId: 'CURTAIN-TRACK-MOTOR',
    name: '窗帘轨道电机',
    description: '电动窗帘轨道电机',
    type: 'motor',
    subtype: 'track',
    color: '#3dd9b6',
    defaultH: 2.5,
    size: [0.05, 0.3, 0.05],
    subsystem: 'curtain',
    mountType: 'hidden',
  },
]

const SECURITY_DEVICES: DeviceDefinition[] = [
  {
    catalogId: 'SECURITY-DOOR-LOCK',
    name: '智能门锁',
    description: '智能电子门锁',
    type: 'lock',
    subtype: 'door-lock',
    color: '#FFD700',
    defaultH: 1.0,
    size: [0.07, 0.18, 0.06],
    subsystem: 'security',
    mountType: 'door',
  },
  {
    catalogId: 'SECURITY-PIR',
    name: '人体感应器',
    description: '吸顶式人体红外感应',
    type: 'sensor',
    subtype: 'pir',
    color: '#4ade80',
    defaultH: 2.7,
    size: [0.085, 0.045, 0.085],
    subsystem: 'sensor',
    mountType: 'ceiling',
    coverageRadius: 5,
  },
  {
    catalogId: 'SECURITY-CAMERA-DOME',
    name: '半球摄像头',
    description: '吸顶式半球监控',
    type: 'sensor',
    subtype: 'dome',
    color: '#f59e0b',
    defaultH: 2.7,
    size: [0.12, 0.08, 0.12],
    subsystem: 'security',
    mountType: 'ceiling',
  },
  {
    catalogId: 'SECURITY-SMOKE',
    name: '烟感报警器',
    description: '吸顶式烟雾探测',
    type: 'sensor',
    subtype: 'smoke',
    color: '#4ade80',
    defaultH: 2.7,
    size: [0.11, 0.04, 0.11],
    subsystem: 'sensor',
    mountType: 'ceiling',
  },
]

const NETWORK_DEVICES: DeviceDefinition[] = [
  {
    catalogId: 'NETWORK-AP-CEILING',
    name: '吸顶AP',
    description: '吸顶式无线AP',
    type: 'ap',
    subtype: 'ceiling',
    color: '#60a5fa',
    defaultH: 2.7,
    size: [0.2, 0.04, 0.2],
    subsystem: 'network',
    mountType: 'ceiling',
    coverageRadius: 10,
  },
  {
    catalogId: 'NETWORK-AP-WALL',
    name: '面板AP',
    description: '86型面板无线AP',
    type: 'ap',
    subtype: 'wall',
    color: '#60a5fa',
    defaultH: 2.4,
    size: [0.086, 0.03, 0.086],
    subsystem: 'network',
    mountType: 'wall_switch',
    coverageRadius: 8,
  },
]

const INFRA_DEVICES: DeviceDefinition[] = [
  {
    catalogId: 'INFRA-GATEWAY-KNX',
    name: 'KNX网关',
    description: 'KNX/IP协议网关',
    type: 'gateway',
    subtype: 'knx',
    color: '#94a3b8',
    defaultH: 1.8,
    size: [0.09, 0.06, 0.072],
    subsystem: 'architecture',
    mountType: 'din_rail',
  },
  {
    catalogId: 'INFRA-SMART-HOST',
    name: '智能主机',
    description: '智能家居控制中心',
    type: 'host',
    subtype: 'smart',
    color: '#455A64',
    defaultH: 1.8,
    size: [0.3, 0.1, 0.4],
    subsystem: 'architecture',
    mountType: 'wall',
  },
]

// ═══════════════════════════════════════════════════════════════
// 合并所有设备
// ═══════════════════════════════════════════════════════════════

export const DEVICE_CATALOG: DeviceDefinition[] = [
  ...LIGHTING_FIXTURES,
  ...LIGHTING_CONTROLS,
  ...HVAC_DEVICES,
  ...CURTAIN_DEVICES,
  ...SECURITY_DEVICES,
  ...NETWORK_DEVICES,
  ...INFRA_DEVICES,
]

/** 按 catalogId 快速查找 */
export const CATALOG_BY_ID: Record<string, DeviceDefinition> =
  Object.fromEntries(DEVICE_CATALOG.map((d) => [d.catalogId, d]))

/** 按 subsystem 分组 */
export const CATALOG_BY_SUBSYSTEM: Record<string, DeviceDefinition[]> =
  DEVICE_CATALOG.reduce((acc, d) => {
    ;(acc[d.subsystem] ??= []).push(d)
    return acc
  }, {} as Record<string, DeviceDefinition[]>)

/** 按 type 分组 */
export const CATALOG_BY_TYPE: Record<string, DeviceDefinition[]> =
  DEVICE_CATALOG.reduce((acc, d) => {
    ;(acc[d.type] ??= []).push(d)
    return acc
  }, {} as Record<string, DeviceDefinition[]>)

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/** 获取设备定义 */
export function getDeviceDefinition(catalogId: string): DeviceDefinition | undefined {
  return CATALOG_BY_ID[catalogId]
}

/** 按子系统获取设备 */
export function getDevicesBySubsystem(subsystem: Subsystem): DeviceDefinition[] {
  return CATALOG_BY_SUBSYSTEM[subsystem] || []
}

/** 获取所有灯具 */
export function getLightingFixtures(): DeviceDefinition[] {
  return DEVICE_CATALOG.filter(
    (d) => d.subsystem === 'lighting' && d.type === 'light'
  )
}

/** 获取所有面板 */
export function getPanels(): DeviceDefinition[] {
  return DEVICE_CATALOG.filter((d) => d.subsystem === 'panel')
}

/** 获取所有传感器 */
export function getSensors(): DeviceDefinition[] {
  return DEVICE_CATALOG.filter((d) => d.subsystem === 'sensor')
}

/** 获取默认设备高度 */
export function getDefaultDeviceHeight(catalogId: string): number {
  return CATALOG_BY_ID[catalogId]?.defaultH ?? 1.5
}
