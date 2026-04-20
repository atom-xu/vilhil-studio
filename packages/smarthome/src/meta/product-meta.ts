/**
 * 智能设备产品元数据（Product Layer）
 *
 * 产品定义 = 这个设备本身是什么，不依赖于任何项目。
 * 一份产品信息被多个项目的多个实例引用，是资产库的 SSOT。
 *
 * 设计原则：
 * 1. 所有字段均为可选，允许渐进式填充
 * 2. 与 DeviceDefinition（device-catalog.ts）的现有字段互补，不冲突
 * 3. category / subcategory 使用枚举，杜绝自由文本导致的不一致
 */

// ═══════════════════════════════════════════════════════════════
// 分类体系（枚举主表）
// ═══════════════════════════════════════════════════════════════

/** 设备大类 —— 资产库分类的顶层枚举 */
export type DeviceCategory =
  | 'control_panel'
  | 'sensor'
  | 'actuator'
  | 'gateway'
  | 'lighting'
  | 'curtain'
  | 'hvac'
  | 'security'
  | 'network'
  | 'audio_video'

/** 设备子类 —— 从属于大类的细分 */
export type DeviceSubcategory =
  | 'touch_panel_with_screen'
  | 'touch_panel_no_screen'
  | 'mechanical_switch'
  | 'pir'
  | 'door_sensor'
  | 'smoke'
  | 'camera_dome'
  | 'camera_bullet'
  | 'relay'
  | 'dimmer'
  | 'gateway_knx'
  | 'gateway_zigbee'
  | 'gateway_wifi'
  | 'smart_host'
  | 'downlight'
  | 'spotlight'
  | 'strip'
  | 'pendant'
  | 'wall_light'
  | 'track_motor'
  | 'blind_motor'
  | 'thermostat'
  | 'vent'
  | 'ac_unit'
  | 'door_lock'
  | 'access_control'
  | 'ap_ceiling'
  | 'ap_wall'
  | 'router'
  | 'smart_speaker'
  | 'media_player'
  | 'unknown'

// ═══════════════════════════════════════════════════════════════
// 产品身份
// ═══════════════════════════════════════════════════════════════

export interface ProductIdentity {
  brand: string
  model: string
  name_zh: string
  name_en?: string
  category: DeviceCategory
  subcategory: DeviceSubcategory
}

// ═══════════════════════════════════════════════════════════════
// 物理规格
// ═══════════════════════════════════════════════════════════════

export interface ProductPhysical {
  /** 单位：毫米 */
  dimensions_mm: { w: number; h: number; d: number }
  mount_type: string
  mount_face?: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right'
  weight_g?: number
  color_options?: string[]
}

// ═══════════════════════════════════════════════════════════════
// 电气规格
// ═══════════════════════════════════════════════════════════════

export interface ProductElectrical {
  power_source: 'bus_powered' | 'mains_powered' | 'battery' | 'poe' | 'usb'
  voltage?: string
  power_consumption_w?: number
  /** 最大负载功率（W）或 null 表示不适用 */
  max_load_w?: number | null
}

// ═══════════════════════════════════════════════════════════════
// 通讯协议
// ═══════════════════════════════════════════════════════════════

export interface ProductProtocol {
  primary: string
  supported?: string[]
  gateway_required?: boolean
  compatible_gateways?: string[]
}

// ═══════════════════════════════════════════════════════════════
// 能力特征
// ═══════════════════════════════════════════════════════════════

export interface ProductCapabilities {
  scenes?: boolean
  has_screen?: boolean
  screen_type?: 'none' | 'monochrome' | 'color_touch' | 'e_ink'
  /** 物理按键数量，0 表示纯触屏 */
  buttons?: number
  sensors?: string[]
  voice_control?: boolean
}

// ═══════════════════════════════════════════════════════════════
// 商业信息
// ═══════════════════════════════════════════════════════════════

export interface ProductCommercial {
  /** 参考售价（人民币） */
  price_rmb?: number
  price_tier?: 'budget' | 'mid' | 'premium' | 'luxury'
  lifecycle_status?: 'active' | 'eol' | 'discontinued' | 'upcoming'
  release_year?: number
}

// ═══════════════════════════════════════════════════════════════
// 3D 资产
// ═══════════════════════════════════════════════════════════════

export interface FallbackGeometry {
  type: 'box' | 'cylinder' | 'sphere' | 'capsule'
  dimensions: [number, number, number]
}

export interface ProductAssets {
  /** GLB 模型路径 */
  model_3d?: string
  model_quality?: 'low' | 'medium' | 'high'
  thumbnail?: string
  product_image?: string
  /** 无模型时的兜底几何体 —— 保证系统永不显示空白 */
  fallback_geometry?: FallbackGeometry
}

// ═══════════════════════════════════════════════════════════════
// 元数据追踪
// ═══════════════════════════════════════════════════════════════

export interface ProductMetadata {
  created_at?: string
  updated_at?: string
  source?: 'manual' | 'import' | 'api_sync'
  verified?: boolean
}

// ═══════════════════════════════════════════════════════════════
// 完整产品定义
// ═══════════════════════════════════════════════════════════════

/**
 * SmartProduct —— 资产库中的产品完整定义
 *
 * 与 DeviceDefinition（device-catalog.ts）的关系：
 * - DeviceDefinition 是精简版，面向编辑器内部使用（渲染、放置、报价）
 * - SmartProduct 是完整版，面向资产库管理和外部系统集成
 * - 两者通过 catalogId / productId 关联
 */
export interface SmartProduct {
  /** 稳定唯一 ID，如 lifesmart_ls268wp1 */
  id: string
  version?: string

  identity: ProductIdentity
  physical?: ProductPhysical
  electrical?: ProductElectrical
  protocol?: ProductProtocol
  capabilities?: ProductCapabilities
  commercial?: ProductCommercial
  assets?: ProductAssets
  metadata?: ProductMetadata
}

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/** 判断产品是否有屏幕 */
export function productHasScreen(product: SmartProduct): boolean {
  return product.capabilities?.has_screen ?? false
}

/** 判断产品支持场景 */
export function productSupportsScenes(product: SmartProduct): boolean {
  return product.capabilities?.scenes ?? false
}

/** 获取产品显示名称（优先中文） */
export function getProductDisplayName(product: SmartProduct): string {
  return product.identity.name_zh || product.identity.name_en || product.identity.model
}

/** 生成默认 fallback geometry（box，尺寸取自 physical 或兜底 86mm 方盒） */
export function getFallbackGeometry(product: SmartProduct): FallbackGeometry {
  if (product.assets?.fallback_geometry) {
    return product.assets.fallback_geometry
  }
  const dims = product.physical?.dimensions_mm
  if (dims) {
    return {
      type: 'box',
      dimensions: [dims.w, dims.h, dims.d],
    }
  }
  return { type: 'box', dimensions: [86, 86, 13] }
}
