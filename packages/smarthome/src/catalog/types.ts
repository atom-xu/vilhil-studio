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
}
