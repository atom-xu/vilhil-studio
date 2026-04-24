/**
 * VilHil 智能设备目录 — 主索引
 *
 * 元数据分层：
 * - DeviceDefinition        = 编辑器内部使用的精简产品信息（渲染/放置/报价）
 * - DeviceDefinition.productMeta = 完整的资产库产品定义（SmartProduct）
 * - DeviceNode（core）      = 场景图中的实例节点（位置/状态）
 *
 * 子模块：
 * - catalog/types.ts        — DeviceDefinition 接口
 * - catalog/devices.ts      — 各子系统设备数组
 * - catalog/product-meta.ts — PRODUCT_META_OVERRIDES + deriveProductMeta
 */

import type { Subsystem } from '@pascal-app/core'
import type { SmartProduct } from './meta'
import type { DeviceDefinition } from './catalog/types'
import {
  LIGHTING_FIXTURES,
  LIGHTING_CONTROLS,
  HVAC_DEVICES,
  CURTAIN_DEVICES,
  AV_DEVICES,
  SECURITY_DEVICES,
  NETWORK_DEVICES,
  INFRA_DEVICES,
} from './catalog/devices'
import { deriveProductMeta } from './catalog/product-meta'

// ─── re-exports ──────────────────────────────────────────────
export type { DeviceDefinition } from './catalog/types'
export {
  LIGHTING_FIXTURES,
  LIGHTING_CONTROLS,
  HVAC_DEVICES,
  CURTAIN_DEVICES,
  AV_DEVICES,
  SECURITY_DEVICES,
  NETWORK_DEVICES,
  INFRA_DEVICES,
} from './catalog/devices'
export { PRODUCT_META_OVERRIDES, deriveProductMeta } from './catalog/product-meta'

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
  lighting:     { label: '灯光', color: '#d4a853' },
  panel:        { label: '面板', color: '#c8b8a0' },
  sensor:       { label: '传感器', color: '#4ade80' },
  curtain:      { label: '窗帘', color: '#3dd9b6' },
  hvac:         { label: '暖通', color: '#9b7bea' },
  av:           { label: '影音', color: '#5ba0f5' },
  security:     { label: '安防', color: '#f59e0b' },
  network:      { label: '网络', color: '#60a5fa' },
}

export const getSubsystemColor = (key: Subsystem): string =>
  SUBSYSTEM_META[key]?.color ?? '#888'

export const getSubsystemLabel = (key: Subsystem): string =>
  SUBSYSTEM_META[key]?.label ?? key

// ═══════════════════════════════════════════════════════════════
// 合并目录 + 快速查找索引
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

export function getDeviceDefinition(catalogId: string): DeviceDefinition | undefined {
  return CATALOG_BY_ID[catalogId]
}

export function getDevicesBySubsystem(subsystem: Subsystem): DeviceDefinition[] {
  return CATALOG_BY_SUBSYSTEM[subsystem] || []
}

export function getLightingFixtures(): DeviceDefinition[] {
  return DEVICE_CATALOG.filter((d) => d.subsystem === 'lighting' && d.type === 'light')
}

export function getPanels(): DeviceDefinition[] {
  return DEVICE_CATALOG.filter((d) => d.subsystem === 'panel')
}

export function getSensors(): DeviceDefinition[] {
  return DEVICE_CATALOG.filter((d) => d.subsystem === 'sensor')
}

export function getDefaultDeviceHeight(catalogId: string): number {
  return CATALOG_BY_ID[catalogId]?.defaultH ?? 1.5
}

/** 获取设备的完整产品元数据（含自动推导） */
export function getProductMeta(catalogId: string): SmartProduct | undefined {
  const def = CATALOG_BY_ID[catalogId]
  return def ? deriveProductMeta(def) : undefined
}
