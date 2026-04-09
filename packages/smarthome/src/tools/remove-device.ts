/**
 * removeDevice — 从场景中删除设备
 *
 * 工具函数：自动获得 Undo/Redo。
 */

import { useScene } from '@pascal-app/core'
import type { DeviceNode } from '@pascal-app/core'

export function removeDevice(deviceId: DeviceNode['id']): void {
  useScene.getState().deleteNode(deviceId)
}
