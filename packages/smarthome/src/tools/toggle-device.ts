/**
 * toggleDevice — 翻转设备开关状态（on ↔ off）
 *
 * 工具函数：自动获得 Undo/Redo + 持久化。
 * L2 交互入口：用户点击设备 → toggleDevice(id) → 3D 立即响应
 */

import { useScene } from '@pascal-app/core'
import type { DeviceNode } from '@pascal-app/core'

export function toggleDevice(deviceId: DeviceNode['id']): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[deviceId]
  if (!node || node.type !== 'device') return
  const deviceNode = node as DeviceNode
  const current = (deviceNode.state as Record<string, unknown>) ?? {}
  updateNode(deviceId, {
    state: { ...current, on: !current.on },
  })
}
