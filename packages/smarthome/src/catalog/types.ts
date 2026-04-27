/**
 * DeviceDefinition — 编辑器内部使用的精简产品信息
 *
 * 独立成模块避免 device-catalog.ts / devices.ts / product-meta.ts 之间循环引用。
 */

import type { Subsystem, MountType } from '@pascal-app/core'
import type { SmartProduct } from '../meta'

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
  /**
   * 不在 catalog UI 选择器里出现，但仍保留在 lookup 表里。
   *
   * 用途：合并产品时，老的 catalogId（比如 LIGHT-STRIP-WASH-WALL）已经被 LIGHT-STRIP +
   * `params.emissionDirection='wall'` 替代，但旧数据里还引用着原 catalogId —— 设备节点
   * 的 productId 在加载时还要能 resolve 到 DeviceDefinition（拿到 size / mountType 等）。
   * 隐藏避免选择器里"看着像两种产品"，但不破坏老数据。
   */
  hiddenFromCatalog?: boolean
}
