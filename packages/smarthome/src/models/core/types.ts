/**
 * VilHil 智能设备 3D 模型库 - 类型定义
 *
 * 设计师维护的模型系统规范
 * - 所有尺寸单位为：米
 * - 坐标系：Y轴向上，右手坐标系
 * - 原点：设备中心点或安装基准点
 */

import type * as THREE from 'three'

// ═══════════════════════════════════════════════════════════════
// 基础类型
// ═══════════════════════════════════════════════════════════════

/** 模型渲染类型标识 */
export type ModelRenderType =
  // 灯光
  | 'downlight' | 'strip' | 'pendant' | 'wall-light' | 'spotlight'
  // 面板
  | 'switch-1key' | 'switch-2key' | 'switch-3key' | 'dimmer-knob' | 'scene-4key' | 'scene-6key' | 'thermostat'
  // 传感器
  | 'pir' | 'dome' | 'smoke' | 'door-sensor' | 'window-sensor'
  // 窗帘
  | 'curtain-motor' | 'blind-motor'
  // 暖通
  | 'vent-4way' | 'vent-linear' | 'ac-unit'
  // 网络
  | 'ap-ceiling' | 'ap-wall' | 'router'
  // 安防
  | 'door-lock' | 'camera-bullet' | 'camera-dome'
  // 架构
  | 'gateway' | 'smart-host'

/** 设备状态 */
export interface DeviceVisualState {
  on?: boolean
  brightness?: number // 0-100
  color?: string // hex color
  colorTemp?: number // 2700-6500K
  position?: number // 窗帘位置 0-100
  angle?: number // 百叶角度 0-90
  targetTemp?: number // 目标温度
  currentTemp?: number // 当前温度
  locked?: boolean
  triggered?: boolean
  signalStrength?: number // 0-100
}

/** 模型复杂度级别 */
export type ModelComplexity = 'low' | 'medium' | 'high'

// ═══════════════════════════════════════════════════════════════
// 几何体定义
// ═══════════════════════════════════════════════════════════════

/** 几何体生成函数签名 */
export type GeometryGenerator = (params: GeometryParams) => THREE.BufferGeometry

/** 几何体参数 */
export interface GeometryParams {
  width: number
  height: number
  depth: number
  radius?: number
  segments?: number
  [key: string]: any
}

// ═══════════════════════════════════════════════════════════════
// 材质定义
// ═══════════════════════════════════════════════════════════════

/** 材质类型 */
export type MaterialType =
  | 'plastic'      // 塑料
  | 'metal'        // 金属
  | 'glass'        // 玻璃
  | 'ceramic'      // 陶瓷
  | 'rubber'       // 橡胶
  | 'led'          // LED 发光
  | 'circuit'      // 电路板
  | 'brushed-metal' // 拉丝金属

/** 材质定义 */
export interface MaterialDefinition {
  type: MaterialType
  color: string
  roughness: number
  metalness: number
  emissive?: string
  emissiveIntensity?: number
  transparent?: boolean
  opacity?: number
}

// ═══════════════════════════════════════════════════════════════
// 动画定义
// ═══════════════════════════════════════════════════════════════

/** 动画类型 */
export type AnimationType = 'onoff' | 'dim' | 'openclose' | 'rotate' | 'pulse'

/** 动画关键帧 */
export interface AnimationKeyframe {
  time: number // 0-1
  value: number | [number, number, number]
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

/** 动画定义 */
export interface AnimationDefinition {
  type: AnimationType
  duration: number // 秒
  keyframes: AnimationKeyframe[]
  loop?: boolean
}

// ═══════════════════════════════════════════════════════════════
// 模型定义
// ═══════════════════════════════════════════════════════════════

/** 模型部件 */
export interface ModelPart {
  name: string
  geometry: GeometryGenerator | THREE.BufferGeometry
  material: MaterialDefinition
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  /** 是否参与动画 */
  animated?: boolean
  /** 动画属性路径 */
  animationProperty?: 'position' | 'rotation' | 'scale' | 'material.emissiveIntensity'
}

/** 完整模型定义 */
export interface DeviceModelDefinition {
  /** 渲染类型标识 */
  renderType: ModelRenderType

  /** 显示名称 */
  displayName: string

  /** 物理尺寸 [宽, 高, 深] 单位：米 */
  dimensions: [number, number, number]

  /** 默认安装高度 */
  defaultHeight: number

  /** 模型复杂度 */
  complexity: ModelComplexity

  /** 几何体部件列表 */
  parts: ModelPart[]

  /** 支持的动画 */
  animations?: AnimationDefinition[]

  /** 发光效果定义 */
  lightEffects?: LightEffectDefinition[]

  /** 覆盖范围可视化 */
  coverage?: CoverageDefinition

  /** 预览缩略图颜色 */
  thumbnailColor: string
}

/** 灯光效果定义 */
export interface LightEffectDefinition {
  /** 关联的部件名称 */
  partName: string
  /** 状态属性映射 */
  stateMapping: {
    on: string // 如 'on', 'brightness', 'color'
    intensity?: string
    color?: string
  }
  /** 基础强度 */
  baseIntensity: number
  /** 颜色 */
  color: string
}

/** 覆盖范围定义 */
export interface CoverageDefinition {
  type: 'sphere' | 'cone' | 'cylinder'
  radius: number
  angle?: number // 锥形角度
  height?: number
  color: string
  opacity: number
}

// ═══════════════════════════════════════════════════════════════
// 模型实例
// ═══════════════════════════════════════════════════════════════

/** 模型实例（运行时） */
export interface DeviceModelInstance {
  definition: DeviceModelDefinition
  rootGroup: THREE.Group
  parts: Map<string, THREE.Mesh>
  materials: Map<string, THREE.Material>
  /** 更新视觉状态 */
  updateState(state: DeviceVisualState): void
  /** 播放动画 */
  playAnimation(type: AnimationType, targetValue: number): void
  /** 销毁释放资源 */
  dispose(): void
}

// ═══════════════════════════════════════════════════════════════
// 模型库配置
// ═══════════════════════════════════════════════════════════════

/** 模型库配置选项 */
export interface ModelLibraryConfig {
  /** 默认复杂度 */
  defaultComplexity: ModelComplexity
  /** 是否启用阴影 */
  shadows: boolean
  /** 是否启用发光效果 */
  emissiveEffects: boolean
  /** 是否启用覆盖范围可视化 */
  coverageVisualization: boolean
}

/** 全局默认配置 */
export const DEFAULT_MODEL_CONFIG: ModelLibraryConfig = {
  defaultComplexity: 'medium',
  shadows: true,
  emissiveEffects: true,
  coverageVisualization: true,
}
