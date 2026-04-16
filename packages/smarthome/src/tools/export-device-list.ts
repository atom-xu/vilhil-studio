/**
 * exportDeviceList — 导出设备清单
 *
 * 从 useScene 提取所有设备节点，按子系统分组，
 * 生成结构化清单（可用于 UI 展示、CSV 导出、PDF 生成）。
 *
 * 功能即工具：不依赖 React，可被 UI / AI / API 直接调用。
 */

import type { AnyNode, DeviceNode } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import { getDeviceDefinition, SUBSYSTEM_META, SUBSYSTEM_ORDER } from '../device-catalog'
import type { Subsystem } from '@pascal-app/core'

// ─── 导出数据结构 ─────────────────────────────────────────────────────────

export interface DeviceListItem {
  id: string
  name: string
  subsystem: string
  subsystemLabel: string
  productId: string
  brand: string
  renderType: string
  mountType: string
  position: [number, number, number]
  unitPrice: number
  quantity: number // 同型号设备计数
}

export interface SubsystemGroup {
  subsystem: string
  label: string
  color: string
  devices: DeviceListItem[]
  subtotal: number
  count: number
}

export interface DeviceListExport {
  groups: SubsystemGroup[]
  totalDevices: number
  totalPrice: number
  generatedAt: string
}

// ─── 核心导出函数 ─────────────────────────────────────────────────────────

/**
 * 导出设备清单 — 按子系统分组、汇总价格
 */
export function exportDeviceList(): DeviceListExport {
  const { nodes } = useScene.getState()

  const deviceNodes = Object.values(nodes).filter(
    (n): n is DeviceNode => n?.type === 'device',
  )

  // 按子系统分组
  const groupMap = new Map<string, DeviceListItem[]>()

  for (const device of deviceNodes) {
    const def = device.productId ? getDeviceDefinition(device.productId) : undefined
    const item: DeviceListItem = {
      id: device.id,
      name: (device.productName as string) ?? device.productId ?? '未知设备',
      subsystem: device.subsystem,
      subsystemLabel: SUBSYSTEM_META[device.subsystem as Subsystem]?.label ?? device.subsystem,
      productId: device.productId ?? '',
      brand: (device.brand as string) ?? '',
      renderType: device.renderType,
      mountType: device.mountType,
      position: device.position,
      unitPrice: def?.price ?? 0,
      quantity: 1,
    }

    const list = groupMap.get(device.subsystem) ?? []
    list.push(item)
    groupMap.set(device.subsystem, list)
  }

  // 按固定子系统顺序输出
  const groups: SubsystemGroup[] = SUBSYSTEM_ORDER
    .filter((sub) => groupMap.has(sub))
    .map((sub) => {
      const devices = groupMap.get(sub) ?? []
      const meta = SUBSYSTEM_META[sub]
      const subtotal = devices.reduce((sum, d) => sum + d.unitPrice, 0)
      return {
        subsystem: sub,
        label: meta?.label ?? sub,
        color: meta?.color ?? '#888888',
        devices,
        subtotal,
        count: devices.length,
      }
    })

  const totalDevices = deviceNodes.length
  const totalPrice = groups.reduce((sum, g) => sum + g.subtotal, 0)

  return {
    groups,
    totalDevices,
    totalPrice,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * 生成 CSV 字符串 — 适用于下载或粘贴到 Excel
 */
export function exportDeviceListCSV(): string {
  const data = exportDeviceList()
  const rows: string[] = []

  // 表头
  rows.push('子系统,设备名称,品牌,型号,安装方式,单价(元)')

  for (const group of data.groups) {
    for (const device of group.devices) {
      rows.push(
        [
          device.subsystemLabel,
          device.name,
          device.brand,
          device.productId,
          device.mountType,
          device.unitPrice > 0 ? device.unitPrice.toString() : '-',
        ].join(','),
      )
    }
  }

  // 汇总行
  rows.push('')
  rows.push(`设备总数,${data.totalDevices}`)
  rows.push(`总价(元),${data.totalPrice > 0 ? data.totalPrice : '-'}`)

  return rows.join('\n')
}
