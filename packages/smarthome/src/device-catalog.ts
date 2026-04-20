/**
 * VilHil 智能设备目录
 *
 * 从 3Dhouse 的 deviceCatalog.js 迁移
 * catalogId — 产品型号（稳定 ID，用于报价和 IoT 映射）
 *
 * 元数据分层：
 * - DeviceDefinition        = 编辑器内部使用的精简产品信息（渲染/放置/报价）
 * - DeviceDefinition.productMeta = 完整的资产库产品定义（SmartProduct）
 * - DeviceNode（core）      = 场景图中的实例节点（位置/状态）
 * - DeviceNode.instanceConfig/delivery = 实例业务配置（控制绑定/交付追踪）
 */

import type { Subsystem, MountType } from '@pascal-app/core'
import type { SmartProduct } from './meta'

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
  /** 参考售价（元人民币） */
  price?: number
  // 可选字段
  modelId?: string
  iconType?: string
  lightType?: 'point' | 'line' | 'physical'
  buttonCount?: number
  controlType?: 'switch' | 'dimmer' | 'scene' | 'touch' | 'thermostat'
  hasScreen?: boolean
  coverageRadius?: number
  requiresOpening?: 'door' | 'window'
  /** 完整产品元数据（资产库 SSOT） */
  productMeta?: SmartProduct
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
    price: 680,
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
    price: 280,
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
    price: 1200,
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
    price: 550,
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
    price: 380,
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
    price: 480,
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
    price: 580,
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
    price: 680,
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
    price: 880,
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
    price: 1200,
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
    price: 1800,
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
    price: 600,
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
    price: 1200,
  },
]

const AV_DEVICES: DeviceDefinition[] = [
  {
    catalogId: 'AV-SMART-SPEAKER',
    name: '智能音箱',
    description: '桌面智能语音音箱（HomePod 类）',
    type: 'equipment',
    subtype: 'ap-ceiling',
    color: '#5ba0f5',
    defaultH: 0.12,
    size: [0.14, 0.17, 0.14],
    subsystem: 'av',
    mountType: 'floor',
    price: 1999,
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
    price: 2800,
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
    price: 320,
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
    price: 1500,
  },
  {
    catalogId: 'SECURITY-CAMERA-BULLET',
    name: '枪机摄像头',
    description: '壁挂式枪机监控',
    type: 'sensor',
    subtype: 'camera-bullet',
    color: '#f59e0b',
    defaultH: 2.4,
    size: [0.16, 0.08, 0.08],
    subsystem: 'security',
    mountType: 'wall',
    price: 1680,
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
    price: 280,
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
    price: 1200,
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
    price: 800,
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
    price: 3500,
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
    price: 8000,
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
  ...AV_DEVICES,
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

// ═══════════════════════════════════════════════════════════════
// 产品元数据工具
// ═══════════════════════════════════════════════════════════════

/**
 * 从 DeviceDefinition 推导基础 SmartProduct 信息
 *
 * 用于现有设备目录的渐进式迁移：
 * - 若 device.productMeta 已存在，直接返回
 * - 否则从 DeviceDefinition 的现有字段推导一个基础版本
 */
const PRODUCT_META_OVERRIDES: Record<string, SmartProduct> = {
  'INFRA-GATEWAY-KNX': {
    id: 'INFRA-GATEWAY-KNX',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Gateway-KNX',
      name_zh: 'KNX网关',
      name_en: 'KNX Gateway',
      category: 'gateway',
      subcategory: 'gateway_knx',
    },
    physical: {
      dimensions_mm: { w: 90, h: 60, d: 72 },
      mount_type: 'din_rail',
      mount_face: 'front',
      color_options: ['white', 'gray'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 6,
      max_load_w: null,
    },
    protocol: {
      primary: 'knx',
      supported: ['knx', 'ip'],
      gateway_required: false,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 0,
      sensors: ['bus_health'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 3500,
      price_tier: 'premium',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [90, 60, 72],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'INFRA-SMART-HOST': {
    id: 'INFRA-SMART-HOST',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Smart-Host',
      name_zh: '智能主机',
      name_en: 'Smart Host',
      category: 'gateway',
      subcategory: 'smart_host',
    },
    physical: {
      dimensions_mm: { w: 300, h: 100, d: 400 },
      mount_type: 'wall',
      mount_face: 'back',
      color_options: ['black'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 18,
      max_load_w: null,
    },
    protocol: {
      primary: 'matter',
      supported: ['matter', 'wifi', 'zigbee', 'knx'],
      gateway_required: false,
      compatible_gateways: ['INFRA-GATEWAY-KNX'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 0,
      sensors: [],
      voice_control: true,
    },
    commercial: {
      price_rmb: 8000,
      price_tier: 'luxury',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [300, 100, 400],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'SECURITY-CAMERA-DOME': {
    id: 'SECURITY-CAMERA-DOME',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Cam-Dome-01',
      name_zh: '半球摄像头',
      name_en: 'Dome Camera',
      category: 'security',
      subcategory: 'camera_dome',
    },
    physical: {
      dimensions_mm: { w: 120, h: 80, d: 120 },
      mount_type: 'ceiling',
      mount_face: 'top',
      color_options: ['white'],
    },
    electrical: {
      power_source: 'poe',
      voltage: '48V PoE',
      power_consumption_w: 7,
      max_load_w: null,
    },
    protocol: {
      primary: 'wifi',
      supported: ['wifi', 'rtsp', 'onvif'],
      gateway_required: false,
    },
    capabilities: {
      scenes: false,
      has_screen: false,
      buttons: 0,
      sensors: ['motion', 'luminance'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 1500,
      price_tier: 'mid',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'sphere',
        dimensions: [120, 80, 120],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'PANEL-SWITCH-1KEY': {
    id: 'PANEL-SWITCH-1KEY',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Panel-1Key',
      name_zh: '单路开关',
      name_en: '1-Gang Smart Switch',
      category: 'control_panel',
      subcategory: 'mechanical_switch',
    },
    physical: {
      dimensions_mm: { w: 86, h: 8, d: 86 },
      mount_type: 'wall_switch',
      mount_face: 'front',
      color_options: ['white', 'black', 'champagne'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 1.5,
      max_load_w: 800,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: false,
      has_screen: false,
      buttons: 1,
      sensors: [],
      voice_control: false,
    },
    commercial: {
      price_rmb: 380,
      price_tier: 'budget',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [86, 8, 86],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'PANEL-SWITCH-2KEY': {
    id: 'PANEL-SWITCH-2KEY',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Panel-2Key',
      name_zh: '双路开关',
      name_en: '2-Gang Smart Switch',
      category: 'control_panel',
      subcategory: 'mechanical_switch',
    },
    physical: {
      dimensions_mm: { w: 86, h: 8, d: 86 },
      mount_type: 'wall_switch',
      mount_face: 'front',
      color_options: ['white', 'black', 'champagne'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 1.8,
      max_load_w: 1200,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: false,
      has_screen: false,
      buttons: 2,
      sensors: [],
      voice_control: false,
    },
    commercial: {
      price_rmb: 480,
      price_tier: 'budget',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [86, 8, 86],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'PANEL-SWITCH-3KEY': {
    id: 'PANEL-SWITCH-3KEY',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Panel-3Key',
      name_zh: '三路开关',
      name_en: '3-Gang Smart Switch',
      category: 'control_panel',
      subcategory: 'mechanical_switch',
    },
    physical: {
      dimensions_mm: { w: 86, h: 8, d: 86 },
      mount_type: 'wall_switch',
      mount_face: 'front',
      color_options: ['white', 'black', 'champagne'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 2.1,
      max_load_w: 1800,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: false,
      has_screen: false,
      buttons: 3,
      sensors: [],
      voice_control: false,
    },
    commercial: {
      price_rmb: 580,
      price_tier: 'budget',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [86, 8, 86],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'SECURITY-CAMERA-BULLET': {
    id: 'SECURITY-CAMERA-BULLET',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Cam-Bullet-01',
      name_zh: '枪机摄像头',
      name_en: 'Bullet Camera',
      category: 'security',
      subcategory: 'camera_bullet',
    },
    physical: {
      dimensions_mm: { w: 160, h: 80, d: 80 },
      mount_type: 'wall',
      mount_face: 'back',
      color_options: ['white', 'black'],
    },
    electrical: {
      power_source: 'poe',
      voltage: '48V PoE',
      power_consumption_w: 8,
      max_load_w: null,
    },
    protocol: {
      primary: 'wifi',
      supported: ['wifi', 'rtsp', 'onvif'],
      gateway_required: false,
    },
    capabilities: {
      scenes: false,
      has_screen: false,
      buttons: 0,
      sensors: ['motion', 'infrared'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 1680,
      price_tier: 'mid',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'cylinder',
        dimensions: [160, 80, 80],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'NETWORK-AP-CEILING': {
    id: 'NETWORK-AP-CEILING',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'AP-Ceiling-01',
      name_zh: '吸顶AP',
      name_en: 'Ceiling Access Point',
      category: 'network',
      subcategory: 'ap_ceiling',
    },
    physical: {
      dimensions_mm: { w: 200, h: 40, d: 200 },
      mount_type: 'ceiling',
      mount_face: 'top',
      color_options: ['white'],
    },
    electrical: {
      power_source: 'poe',
      voltage: '48V PoE',
      power_consumption_w: 10,
      max_load_w: null,
    },
    protocol: {
      primary: 'wifi',
      supported: ['wifi', 'ethernet'],
      gateway_required: false,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: false,
      has_screen: false,
      buttons: 0,
      sensors: ['signal_strength'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 1200,
      price_tier: 'mid',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'cylinder',
        dimensions: [200, 40, 200],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'NETWORK-AP-WALL': {
    id: 'NETWORK-AP-WALL',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'AP-Wall-86',
      name_zh: '面板AP',
      name_en: 'Wall Access Point',
      category: 'network',
      subcategory: 'ap_wall',
    },
    physical: {
      dimensions_mm: { w: 86, h: 30, d: 86 },
      mount_type: 'wall_switch',
      mount_face: 'front',
      color_options: ['white'],
    },
    electrical: {
      power_source: 'poe',
      voltage: '48V PoE',
      power_consumption_w: 7,
      max_load_w: null,
    },
    protocol: {
      primary: 'wifi',
      supported: ['wifi', 'ethernet'],
      gateway_required: false,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: false,
      has_screen: false,
      buttons: 0,
      sensors: ['signal_strength'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 800,
      price_tier: 'budget',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [86, 30, 86],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'LIGHT-DOWNLIGHT': {
    id: 'LIGHT-DOWNLIGHT',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Light-Downlight-01',
      name_zh: '智能筒灯',
      name_en: 'Smart Downlight',
      category: 'lighting',
      subcategory: 'downlight',
    },
    physical: {
      dimensions_mm: { w: 85, h: 55, d: 85 },
      mount_type: 'ceiling',
      mount_face: 'top',
      color_options: ['white', 'black'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 9,
      max_load_w: null,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee', 'matter'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 0,
      sensors: [],
      voice_control: true,
    },
    commercial: {
      price_rmb: 680,
      price_tier: 'budget',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'cylinder',
        dimensions: [85, 55, 85],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'LIGHT-STRIP': {
    id: 'LIGHT-STRIP',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Light-Strip-01',
      name_zh: 'LED灯带',
      name_en: 'LED Strip',
      category: 'lighting',
      subcategory: 'strip',
    },
    physical: {
      dimensions_mm: { w: 500, h: 5, d: 10 },
      mount_type: 'hidden',
      mount_face: 'top',
      color_options: ['warm_white', 'rgbw'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '24V DC',
      power_consumption_w: 12,
      max_load_w: null,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee', 'matter'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 0,
      sensors: [],
      voice_control: true,
    },
    commercial: {
      price_rmb: 280,
      price_tier: 'budget',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [500, 5, 10],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'LIGHT-PENDANT': {
    id: 'LIGHT-PENDANT',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Light-Pendant-01',
      name_zh: '吊灯',
      name_en: 'Pendant Light',
      category: 'lighting',
      subcategory: 'pendant',
    },
    physical: {
      dimensions_mm: { w: 400, h: 1200, d: 400 },
      mount_type: 'ceiling',
      mount_face: 'top',
      color_options: ['black', 'white', 'gold'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 24,
      max_load_w: null,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee', 'matter'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 0,
      sensors: [],
      voice_control: true,
    },
    commercial: {
      price_rmb: 1880,
      price_tier: 'mid',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'cylinder',
        dimensions: [400, 1200, 400],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'LIGHT-WALL': {
    id: 'LIGHT-WALL',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Light-Wall-01',
      name_zh: '壁灯',
      name_en: 'Wall Light',
      category: 'lighting',
      subcategory: 'wall_light',
    },
    physical: {
      dimensions_mm: { w: 120, h: 280, d: 120 },
      mount_type: 'wall',
      mount_face: 'back',
      color_options: ['white', 'black', 'champagne'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 12,
      max_load_w: null,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee', 'matter'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 0,
      sensors: [],
      voice_control: true,
    },
    commercial: {
      price_rmb: 760,
      price_tier: 'budget',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [120, 280, 120],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'PANEL-DIMMER-KNOB': {
    id: 'PANEL-DIMMER-KNOB',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Panel-Dimmer-Knob',
      name_zh: '旋钮调光面板',
      name_en: 'Rotary Dimmer Panel',
      category: 'control_panel',
      subcategory: 'dimmer',
    },
    physical: {
      dimensions_mm: { w: 86, h: 12, d: 86 },
      mount_type: 'wall_switch',
      mount_face: 'front',
      color_options: ['white', 'black', 'champagne'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 1.8,
      max_load_w: 500,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 1,
      sensors: [],
      voice_control: true,
    },
    commercial: {
      price_rmb: 680,
      price_tier: 'mid',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'cylinder',
        dimensions: [86, 12, 86],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'PANEL-SCENE-4KEY': {
    id: 'PANEL-SCENE-4KEY',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Panel-Scene-4Key',
      name_zh: '四键场景面板',
      name_en: '4-Key Scene Panel',
      category: 'control_panel',
      subcategory: 'touch_panel_no_screen',
    },
    physical: {
      dimensions_mm: { w: 86, h: 10, d: 86 },
      mount_type: 'wall_switch',
      mount_face: 'front',
      color_options: ['white', 'black'],
    },
    electrical: {
      power_source: 'bus_powered',
      voltage: 'KNX 30V DC',
      power_consumption_w: 1.2,
      max_load_w: null,
    },
    protocol: {
      primary: 'knx',
      supported: ['knx'],
      gateway_required: true,
      compatible_gateways: ['INFRA-GATEWAY-KNX', 'INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 4,
      sensors: [],
      voice_control: false,
    },
    commercial: {
      price_rmb: 980,
      price_tier: 'mid',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [86, 10, 86],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'PANEL-SCENE-6KEY': {
    id: 'PANEL-SCENE-6KEY',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Panel-Scene-6Key',
      name_zh: '六键场景面板',
      name_en: '6-Key Scene Panel',
      category: 'control_panel',
      subcategory: 'touch_panel_no_screen',
    },
    physical: {
      dimensions_mm: { w: 86, h: 10, d: 86 },
      mount_type: 'wall_switch',
      mount_face: 'front',
      color_options: ['white', 'black'],
    },
    electrical: {
      power_source: 'bus_powered',
      voltage: 'KNX 30V DC',
      power_consumption_w: 1.4,
      max_load_w: null,
    },
    protocol: {
      primary: 'knx',
      supported: ['knx'],
      gateway_required: true,
      compatible_gateways: ['INFRA-GATEWAY-KNX', 'INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 6,
      sensors: [],
      voice_control: false,
    },
    commercial: {
      price_rmb: 1280,
      price_tier: 'premium',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [86, 10, 86],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'HVAC-THERMOSTAT': {
    id: 'HVAC-THERMOSTAT',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'HVAC-Thermostat-01',
      name_zh: '温控器',
      name_en: 'Thermostat',
      category: 'hvac',
      subcategory: 'thermostat',
    },
    physical: {
      dimensions_mm: { w: 86, h: 15, d: 86 },
      mount_type: 'wall_switch',
      mount_face: 'front',
      color_options: ['white', 'black'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '24V DC',
      power_consumption_w: 3,
      max_load_w: null,
    },
    protocol: {
      primary: 'knx',
      supported: ['knx', 'modbus'],
      gateway_required: true,
      compatible_gateways: ['INFRA-GATEWAY-KNX', 'INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: true,
      screen_type: 'color_touch',
      buttons: 2,
      sensors: ['temperature', 'humidity'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 1680,
      price_tier: 'premium',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [86, 15, 86],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'HVAC-VENT-4WAY': {
    id: 'HVAC-VENT-4WAY',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'HVAC-Vent-4Way',
      name_zh: '四向风口',
      name_en: '4-Way Vent',
      category: 'hvac',
      subcategory: 'vent',
    },
    physical: {
      dimensions_mm: { w: 600, h: 60, d: 600 },
      mount_type: 'ceiling',
      mount_face: 'top',
      color_options: ['white'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '24V DC',
      power_consumption_w: 6,
      max_load_w: null,
    },
    protocol: {
      primary: 'modbus',
      supported: ['modbus', 'knx'],
      gateway_required: true,
      compatible_gateways: ['INFRA-GATEWAY-KNX', 'INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 0,
      sensors: ['airflow'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 980,
      price_tier: 'mid',
      lifecycle_status: 'active',
      release_year: 2024,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [600, 60, 600],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'CURTAIN-TRACK-MOTOR': {
    id: 'CURTAIN-TRACK-MOTOR',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Curtain-Track-Motor',
      name_zh: '窗帘轨道电机',
      name_en: 'Curtain Track Motor',
      category: 'curtain',
      subcategory: 'track_motor',
    },
    physical: {
      dimensions_mm: { w: 70, h: 300, d: 70 },
      mount_type: 'ceiling',
      mount_face: 'top',
      color_options: ['white'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 45,
      max_load_w: null,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee', 'matter'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 1,
      sensors: ['position_feedback'],
      voice_control: true,
    },
    commercial: {
      price_rmb: 1480,
      price_tier: 'mid',
      lifecycle_status: 'active',
      release_year: 2024,
    },
    assets: {
      fallback_geometry: {
        type: 'cylinder',
        dimensions: [70, 300, 70],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'SECURITY-DOOR-LOCK': {
    id: 'SECURITY-DOOR-LOCK',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Door-Lock-01',
      name_zh: '智能门锁',
      name_en: 'Smart Door Lock',
      category: 'security',
      subcategory: 'door_lock',
    },
    physical: {
      dimensions_mm: { w: 80, h: 320, d: 35 },
      mount_type: 'door',
      mount_face: 'front',
      color_options: ['black', 'gray'],
    },
    electrical: {
      power_source: 'battery',
      voltage: '7.4V DC',
      power_consumption_w: 2.5,
      max_load_w: null,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee', 'bluetooth'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 12,
      sensors: ['door_state', 'tamper'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 2299,
      price_tier: 'premium',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [80, 320, 35],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'SECURITY-PIR': {
    id: 'SECURITY-PIR',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'PIR-Sensor-01',
      name_zh: '人体传感器',
      name_en: 'PIR Sensor',
      category: 'sensor',
      subcategory: 'pir',
    },
    physical: {
      dimensions_mm: { w: 58, h: 58, d: 58 },
      mount_type: 'ceiling',
      mount_face: 'top',
      color_options: ['white'],
    },
    electrical: {
      power_source: 'battery',
      voltage: '3V DC',
      power_consumption_w: 0.2,
      max_load_w: null,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 0,
      sensors: ['motion', 'luminance'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 199,
      price_tier: 'budget',
      lifecycle_status: 'active',
      release_year: 2024,
    },
    assets: {
      fallback_geometry: {
        type: 'sphere',
        dimensions: [58, 58, 58],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'SECURITY-SMOKE': {
    id: 'SECURITY-SMOKE',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Smoke-Sensor-01',
      name_zh: '烟雾传感器',
      name_en: 'Smoke Detector',
      category: 'sensor',
      subcategory: 'smoke',
    },
    physical: {
      dimensions_mm: { w: 100, h: 45, d: 100 },
      mount_type: 'ceiling',
      mount_face: 'top',
      color_options: ['white'],
    },
    electrical: {
      power_source: 'battery',
      voltage: '3V DC',
      power_consumption_w: 0.25,
      max_load_w: null,
    },
    protocol: {
      primary: 'zigbee',
      supported: ['zigbee'],
      gateway_required: true,
      compatible_gateways: ['INFRA-SMART-HOST'],
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 1,
      sensors: ['smoke', 'temperature'],
      voice_control: false,
    },
    commercial: {
      price_rmb: 269,
      price_tier: 'budget',
      lifecycle_status: 'active',
      release_year: 2024,
    },
    assets: {
      fallback_geometry: {
        type: 'cylinder',
        dimensions: [100, 45, 100],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
  'AV-SMART-SPEAKER': {
    id: 'AV-SMART-SPEAKER',
    version: '1.0.0',
    identity: {
      brand: 'VilHil',
      model: 'Smart-Speaker-01',
      name_zh: '智能音箱',
      name_en: 'Smart Speaker',
      category: 'audio_video',
      subcategory: 'smart_speaker',
    },
    physical: {
      dimensions_mm: { w: 140, h: 170, d: 140 },
      mount_type: 'floor',
      mount_face: 'bottom',
      color_options: ['black', 'white'],
    },
    electrical: {
      power_source: 'mains_powered',
      voltage: '220V AC',
      power_consumption_w: 15,
      max_load_w: null,
    },
    protocol: {
      primary: 'matter',
      supported: ['matter', 'wifi', 'bluetooth'],
      gateway_required: false,
    },
    capabilities: {
      scenes: true,
      has_screen: false,
      buttons: 0,
      sensors: ['voice_wake'],
      voice_control: true,
    },
    commercial: {
      price_rmb: 1999,
      price_tier: 'premium',
      lifecycle_status: 'active',
      release_year: 2025,
    },
    assets: {
      fallback_geometry: {
        type: 'cylinder',
        dimensions: [140, 170, 140],
      },
    },
    metadata: {
      source: 'manual',
      verified: true,
    },
  },
}

export function deriveProductMeta(def: DeviceDefinition): SmartProduct {
  if (def.productMeta) {
    return def.productMeta
  }

  const override = PRODUCT_META_OVERRIDES[def.catalogId]
  if (override) {
    return override
  }

  const [w, h, d] = def.size
  const categoryMap: Record<Subsystem, SmartProduct['identity']['category']> = {
    architecture: 'gateway',
    lighting: 'lighting',
    panel: 'control_panel',
    sensor: 'sensor',
    curtain: 'curtain',
    hvac: 'hvac',
    av: 'audio_video',
    security: 'security',
    network: 'network',
  }

  return {
    id: def.catalogId,
    identity: {
      brand: 'Generic',
      model: def.modelId || def.catalogId,
      name_zh: def.name,
      category: categoryMap[def.subsystem] ?? 'gateway',
      subcategory: (def.subtype as SmartProduct['identity']['subcategory']) ?? 'unknown',
    },
    physical: {
      dimensions_mm: { w: Math.round(w * 1000), h: Math.round(h * 1000), d: Math.round(d * 1000) },
      mount_type: def.mountType,
    },
    commercial: def.price
      ? {
          price_rmb: def.price,
          price_tier: def.price > 2000 ? 'premium' : def.price > 800 ? 'mid' : 'budget',
        }
      : undefined,
    capabilities: {
      has_screen: def.hasScreen ?? false,
      buttons: def.buttonCount,
      scenes: def.controlType === 'scene',
    },
    assets: {
      fallback_geometry: {
        type: 'box',
        dimensions: [Math.round(w * 1000), Math.round(h * 1000), Math.round(d * 1000)],
      },
    },
  }
}

/** 获取设备的完整产品元数据（含自动推导） */
export function getProductMeta(catalogId: string): SmartProduct | undefined {
  const def = CATALOG_BY_ID[catalogId]
  return def ? deriveProductMeta(def) : undefined
}
