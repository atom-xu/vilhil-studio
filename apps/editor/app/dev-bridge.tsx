'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEditor } from '@pascal-app/editor'
import { placeDevice, removeDevice, setDeviceParams, setDeviceState, toggleDevice } from '@vilhil/smarthome'
import { useEffect } from 'react'

/**
 * 开发调试桥 — 仅在 development 环境激活。
 * 把核心 store 和工具函数挂到 window.__vilhil，方便在浏览器控制台测试。
 *
 * 使用示例：
 *   const levelId = window.__vilhil.getLevelId()
 *   window.__vilhil.placeDevice(levelId, 'downlight_ceiling', [0, 2.7, 0])
 */
export function DevBridge() {
  if (process.env.NODE_ENV !== 'development') return null

  return <DevBridgeInner />
}

function DevBridgeInner() {
  useEffect(() => {
    // 暴露工具函数
    const bridge = {
      // 获取当前选中 level id
      getLevelId: () => useViewer.getState().selection.levelId,
      // 获取当前 scene 所有节点
      getNodes: () => useScene.getState().nodes,
      // 获取 editor 状态
      getEditorState: () => useEditor.getState(),
      // 智能家居工具函数
      placeDevice,
      removeDevice,
      setDeviceParams,
      setDeviceState,
      toggleDevice,
      // 选中节点（触发 PanelManager 渲染对应面板）
      selectNode: (id: string) => {
        const { setSelection, selection } = useViewer.getState() as any
        if (setSelection) {
          setSelection({ ...selection, selectedIds: [id] })
        }
      },
      // 直接访问 store
      useScene,
      useEditor,
      useViewer,
    }

    ;(window as any).__vilhil = bridge
    console.log('[DevBridge] window.__vilhil ready. 示例：',
      'window.__vilhil.placeDevice(window.__vilhil.getLevelId(), "downlight_ceiling", [0, 2.7, 0])')

    return () => {
      delete (window as any).__vilhil
    }
  }, [])

  return null
}
