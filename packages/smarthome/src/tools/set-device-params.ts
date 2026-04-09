/**
 * setDeviceParams — 更新设备参数（方向、光束角、覆盖范围等）
 * setDeviceState  — 更新设备运行状态（开关、亮度、色温等）
 *
 * 工具函数：自动获得 Undo/Redo + 持久化。
 */

import { useScene } from '@pascal-app/core'
import type { DeviceNode, DeviceParams } from '@pascal-app/core'

export function setDeviceParams(
  deviceId: DeviceNode['id'],
  params: Partial<DeviceParams>,
): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[deviceId]
  if (!node || node.type !== 'device') return
  const deviceNode = node as DeviceNode
  updateNode(deviceId, {
    params: { ...deviceNode.params, ...params },
  })
}

export function setDeviceState(
  deviceId: DeviceNode['id'],
  state: Record<string, unknown>,
): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[deviceId]
  if (!node || node.type !== 'device') return
  const deviceNode = node as DeviceNode
  updateNode(deviceId, {
    state: { ...(deviceNode.state as object), ...state },
  })
}
