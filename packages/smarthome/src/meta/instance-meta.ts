/**
 * 智能设备实例元数据（Instance Layer）
 *
 * 实例属性 = 这个设备在某个具体项目里的状态与配置。
 * 跟着项目走，项目删了它就没了。
 *
 * 与 DeviceNode（core schema）的关系：
 * - DeviceNode 是场景图中的节点，含位置、旋转、运行时状态
 * - DeviceInstanceMeta 是业务层配置，含控制逻辑、交付状态
 * - 两者通过 deviceId 关联，合并后构成完整的"项目中的设备"
 */

// ═══════════════════════════════════════════════════════════════
// 控制绑定
// ═══════════════════════════════════════════════════════════════

/** 单个控制目标的功能类型 */
export type ControlFunction =
  | 'on_off'
  | 'dimming'
  | 'open_close'
  | 'temp_mode'
  | 'fan_speed'
  | 'scene_trigger'
  | 'lock_unlock'
  | 'unknown'

/** 设备控制绑定 —— 这个设备的某个通道控制哪个目标 */
export interface DeviceControl {
  target_id: string
  function: ControlFunction
  /** 用户自定义标签，如"客厅主灯" */
  label?: string
}

// ═══════════════════════════════════════════════════════════════
// 项目内配置
// ═══════════════════════════════════════════════════════════════

export interface DeviceConfiguration {
  /** 用户自定义标签，如"3F会议室B-主控面板" */
  custom_label?: string
  /** 控制绑定：这个设备的各个通道分别控制什么 */
  controls?: DeviceControl[]
  /** 关联的场景 ID 列表 */
  scenes?: string[]
  /** 总线地址（KNX / Zigbee 等） */
  bus_address?: string
  /** 网关/主机分配 */
  gateway_id?: string
  /** 任意扩展配置 */
  custom?: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════
// 交付追踪
// ═══════════════════════════════════════════════════════════════

export interface DeviceDelivery {
  /** 是否已报价 */
  quoted: boolean
  /** 实际报价（可能区别于产品参考价） */
  quoted_price_rmb?: number
  /** 是否已采购 */
  purchased: boolean
  /** 是否已安装 */
  installed: boolean
  /** 是否已调试 */
  commissioned: boolean
}

// ═══════════════════════════════════════════════════════════════
// 实例元数据
// ═══════════════════════════════════════════════════════════════

export interface DeviceInstanceMetadata {
  created_at?: string
  updated_at?: string
  /** 备注，如"客户指定白色，需搭配金色边框" */
  notes?: string
}

// ═══════════════════════════════════════════════════════════════
// 完整实例业务层定义
// ═══════════════════════════════════════════════════════════════

/**
 * DeviceInstanceMeta —— 项目中设备的业务层元数据
 *
 * 注意：不含placement（position/rotation/mountType/levelId），
 * 因为这些信息已在 DeviceNode（场景图节点）中维护，避免双写。
 */
export interface DeviceInstanceMeta {
  configuration?: DeviceConfiguration
  delivery?: DeviceDelivery
  metadata?: DeviceInstanceMetadata
}

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/** 获取实例的自定义标签，fallback 到 productName 或 deviceId */
export function getInstanceLabel(meta: DeviceInstanceMeta | undefined, fallback?: string): string {
  return meta?.configuration?.custom_label || fallback || '未命名设备'
}

/** 获取交付状态的中文描述 */
export function getDeliveryStatusText(delivery: DeviceDelivery | undefined): string {
  if (!delivery) return '未开始'
  if (delivery.commissioned) return '已调试'
  if (delivery.installed) return '已安装'
  if (delivery.purchased) return '已采购'
  if (delivery.quoted) return '已报价'
  return '未开始'
}

/** 判断实例是否已完成全生命周期 */
export function isDeliveryComplete(delivery: DeviceDelivery | undefined): boolean {
  return delivery?.commissioned ?? false
}

/** 创建默认交付状态（全部 false） */
export function createDefaultDelivery(): DeviceDelivery {
  return {
    quoted: false,
    purchased: false,
    installed: false,
    commissioned: false,
  }
}
