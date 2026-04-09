'use client'

/**
 * useDeviceInteraction — L2 设备直接操控 hook
 *
 * 全局注册一次，监听 device:click 事件，按设备子系统分派操作：
 *   - lighting / sensor / curtain / hvac / av / security / network →  toggleDevice
 *   - panel → executePanelAction（批量联动配置的灯具）
 *
 * 数据流:
 *   用户点击 3D 设备
 *   → R3F onPointerUp
 *   → useNodeEvents → emitter.emit('device:click', event)
 *   → useDeviceInteraction (此 hook)
 *   → toggleDevice(id) 或 executePanelAction(id, keyIndex)
 *   → Zustand updateNode → DeviceRenderer 重渲染
 *
 * 使用方式：在 Editor 和 ProposalLayout 中各调用一次即可。
 */

import { type DeviceEvent, emitter, useScene } from '@pascal-app/core'
import type { DeviceNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { executePanelAction, toggleDevice } from '@vilhil/smarthome'
import { useEffect } from 'react'

interface UseDeviceInteractionOptions {
  /**
   * 编辑模式 — true 时点击设备同时更新 viewer selection（触发 DevicePanel 显示）
   * 展示模式 — false 时只切换开关，不改变 selection
   */
  editMode?: boolean
}

export function useDeviceInteraction({ editMode = false }: UseDeviceInteractionOptions = {}) {
  useEffect(() => {
    const handleDeviceClick = (event: DeviceEvent) => {
      const node = event.node
      if (!node || node.type !== 'device') return

      // 编辑模式：更新选中，显示 DevicePanel（始终先执行，与操控互不干扰）
      if (editMode) {
        useViewer.getState().setSelection({ selectedIds: [node.id] })
      }

      // L2 操控：按子系统分派
      if (node.subsystem === 'panel') {
        // 面板设备：点击第一个按键（S3 会提供按键索引）
        // 当前简化：点击面板 body → 执行 key 0 的动作
        executePanelAction(node.id, 0)
      } else {
        // 其他设备：直接翻转开关
        toggleDevice(node.id)
      }
    }

    emitter.on('device:click', handleDeviceClick)
    return () => emitter.off('device:click', handleDeviceClick)
  }, [editMode])
}
