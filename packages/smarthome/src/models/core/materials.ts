/**
 * VilHil 智能设备 3D 模型库 - 材质系统
 *
 * 设计师定义的标准材质库
 * 所有材质使用 MeshStandardMaterial 基础
 */

import * as THREE from 'three'
import type { MaterialDefinition, MaterialType } from './types'

// ═══════════════════════════════════════════════════════════════
// 材质参数模板（设计师调色板）
// ═══════════════════════════════════════════════════════════════

const MATERIAL_TEMPLATES: Record<MaterialType, Partial<MaterialDefinition>> = {
  plastic: {
    roughness: 0.6,
    metalness: 0.0,
  },
  metal: {
    roughness: 0.3,
    metalness: 0.8,
  },
  'brushed-metal': {
    roughness: 0.4,
    metalness: 0.7,
  },
  glass: {
    roughness: 0.1,
    metalness: 0.0,
    transparent: true,
    opacity: 0.3,
  },
  ceramic: {
    roughness: 0.2,
    metalness: 0.0,
  },
  rubber: {
    roughness: 0.9,
    metalness: 0.0,
  },
  led: {
    roughness: 0.2,
    metalness: 0.0,
    emissiveIntensity: 1.0,
  },
  circuit: {
    roughness: 0.8,
    metalness: 0.1,
  },
}

// ═══════════════════════════════════════════════════════════════
// 品牌色系（设计师定义）
// ═══════════════════════════════════════════════════════════════

export const BRAND_PALETTE = {
  // 基础色
  white: '#fafafa',
  offWhite: '#f5f5f5',
  lightGray: '#e0e0e0',
  gray: '#9e9e9e',
  darkGray: '#424242',
  black: '#212121',

  // 子系统色
  lighting: '#d4a853',    // 暖金色
  panel: '#c8b8a0',       // 米金色
  sensor: '#4ade80',      // 科技绿
  curtain: '#3dd9b6',     // 青绿色
  hvac: '#9b7bea',        // 紫罗兰
  network: '#60a5fa',     // 科技蓝
  security: '#f59e0b',    // 警示橙
  architecture: '#94a3b8', // 工业灰

  // 状态色
  active: '#22c55e',      // 激活绿
  inactive: '#6b7280',    // 未激活灰
  warning: '#f59e0b',     // 警告橙
  error: '#ef4444',       // 错误红
} as const

// ═══════════════════════════════════════════════════════════════
// 材质创建函数
// ═══════════════════════════════════════════════════════════════

/**
 * 根据材质定义创建 Three.js 材质
 */
export function createMaterial(def: MaterialDefinition): THREE.MeshStandardMaterial {
  const template = MATERIAL_TEMPLATES[def.type]

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color),
    roughness: def.roughness ?? template.roughness ?? 0.5,
    metalness: def.metalness ?? template.metalness ?? 0.0,
    transparent: def.transparent ?? template.transparent ?? false,
    opacity: def.opacity ?? template.opacity ?? 1.0,
  })

  if (def.emissive) {
    material.emissive = new THREE.Color(def.emissive)
    material.emissiveIntensity = def.emissiveIntensity ?? 1.0
  }

  return material
}

/**
 * 创建材质变体（基于基础材质微调）
 */
export function createMaterialVariant(
  baseDef: MaterialDefinition,
  overrides: Partial<MaterialDefinition>
): MaterialDefinition {
  return {
    ...baseDef,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════
// 预设材质（常用组合）
// ═══════════════════════════════════════════════════════════════

export const PRESET_MATERIALS = {
  // 面板主体 - 白色塑料
  panelBody: (color: string = BRAND_PALETTE.offWhite): MaterialDefinition => ({
    type: 'plastic',
    color,
    roughness: 0.5,
    metalness: 0.0,
  }),

  // 面板按钮 - 子系统色塑料
  panelButton: (color: string): MaterialDefinition => ({
    type: 'plastic',
    color,
    roughness: 0.4,
    metalness: 0.1,
  }),

  // 金属边框
  metalFrame: (color: string = BRAND_PALETTE.lightGray): MaterialDefinition => ({
    type: 'brushed-metal',
    color,
    roughness: 0.35,
    metalness: 0.75,
  }),

  // LED 发光体
  ledEmitter: (color: string, intensity: number = 1.0): MaterialDefinition => ({
    type: 'led',
    color: '#000000', // LED 本体黑色
    roughness: 0.2,
    metalness: 0.0,
    emissive: color,
    emissiveIntensity: intensity,
  }),

  // 玻璃/透镜
  glassLens: (color: string = '#ffffff'): MaterialDefinition => ({
    type: 'glass',
    color,
    roughness: 0.1,
    metalness: 0.0,
    transparent: true,
    opacity: 0.4,
  }),

  // 筒灯外壳
  downlightHousing: (): MaterialDefinition => ({
    type: 'metal',
    color: '#ffffff',
    roughness: 0.3,
    metalness: 0.6,
  }),

  // 筒灯反光杯
  downlightReflector: (): MaterialDefinition => ({
    type: 'metal',
    color: '#e8e8e8',
    roughness: 0.15,
    metalness: 0.9,
  }),

  // 传感器外壳
  sensorHousing: (color: string = BRAND_PALETTE.white): MaterialDefinition => ({
    type: 'plastic',
    color,
    roughness: 0.6,
    metalness: 0.0,
  }),

  // 传感器透镜
  sensorLens: (color: string = BRAND_PALETTE.sensor): MaterialDefinition => ({
    type: 'glass',
    color,
    roughness: 0.05,
    metalness: 0.0,
    transparent: true,
    opacity: 0.6,
  }),

  // 窗帘电机
  curtainMotor: (): MaterialDefinition => ({
    type: 'metal',
    color: '#f0f0f0',
    roughness: 0.25,
    metalness: 0.8,
  }),

  // 窗帘布料
  curtainFabric: (color: string = '#e8dfd0'): MaterialDefinition => ({
    type: 'plastic',
    color,
    roughness: 0.9,
    metalness: 0.0,
  }),

  // 温控屏幕
  thermostatScreen: (): MaterialDefinition => ({
    type: 'glass',
    color: '#1a1a1a',
    roughness: 0.1,
    metalness: 0.0,
    transparent: true,
    opacity: 0.9,
  }),

  // 出风口
  ventGrille: (): MaterialDefinition => ({
    type: 'plastic',
    color: '#e0e0e0',
    roughness: 0.5,
    metalness: 0.0,
  }),

  // AP 设备
  apDevice: (): MaterialDefinition => ({
    type: 'plastic',
    color: '#ffffff',
    roughness: 0.4,
    metalness: 0.1,
  }),

  // 门锁
  doorLock: (): MaterialDefinition => ({
    type: 'brushed-metal',
    color: '#2d2d2d',
    roughness: 0.3,
    metalness: 0.85,
  }),

  // 网关/主机
  gateway: (): MaterialDefinition => ({
    type: 'plastic',
    color: BRAND_PALETTE.architecture,
    roughness: 0.5,
    metalness: 0.1,
  }),
} as const

// ═══════════════════════════════════════════════════════════════
// 材质缓存（避免重复创建）
// ═══════════════════════════════════════════════════════════════

const materialCache = new Map<string, THREE.MeshStandardMaterial>()

/**
 * 获取缓存的材质（如果存在）或创建新材质
 */
export function getOrCreateMaterial(def: MaterialDefinition): THREE.MeshStandardMaterial {
  const key = JSON.stringify(def)

  if (materialCache.has(key)) {
    return materialCache.get(key)!
  }

  const material = createMaterial(def)
  materialCache.set(key, material)
  return material
}

/**
 * 清空材质缓存（用于内存释放）
 */
export function clearMaterialCache(): void {
  materialCache.forEach((material) => material.dispose())
  materialCache.clear()
}

/**
 * 生成材质唯一标识（用于调试）
 */
export function generateMaterialId(def: MaterialDefinition): string {
  return `${def.type}_${def.color}_${def.roughness}_${def.metalness}`
}
