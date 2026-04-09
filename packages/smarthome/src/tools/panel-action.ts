/**
 * Panel action tools — 面板按键联动
 *
 * 面板按键 → 批量控制灯具
 *
 * 数据模型:
 *   PanelKeyConfig 存储在 DeviceNode.params.panelKeys（数组）
 *   每个按键可以：toggle 一批设备 / set 一批设备到指定状态 / 触发场景
 */

import { useScene } from '@pascal-app/core'
import type { AnyNode, DeviceNode } from '@pascal-app/core'
import { toggleDevice } from './toggle-device'
import { setDeviceState } from './set-device-params'
import { applyScene } from './scene-tools'

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

export type PanelAction =
  | { type: 'toggle'; deviceIds: string[] }
  | { type: 'set'; deviceIds: string[]; state: Record<string, unknown> }
  | { type: 'scene'; sceneId: string }

export interface PanelKeyConfig {
  keyIndex: number  // 0-based，对应面板按键位置
  label: string     // "全开" / "全关" / "影院模式"
  action: PanelAction
}

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * executePanelAction — 执行面板按键动作
 *
 * 根据面板设备 ID 和按键索引，找到对应的 PanelKeyConfig 并执行动作。
 * 支持 toggle（翻转）、set（设置状态）两种动作。
 * scene 动作留到 S3 实现。
 *
 * @param panelDeviceId 面板设备的 ID
 * @param keyIndex 按键索引（0-based）
 */
export function executePanelAction(panelDeviceId: string, keyIndex: number): void {
  const { nodes } = useScene.getState()
  const panelNode = nodes[panelDeviceId as AnyNode['id']] as DeviceNode | undefined

  if (!panelNode || panelNode.type !== 'device' || panelNode.subsystem !== 'panel') {
    console.warn(`[executePanelAction] 找不到面板设备: ${panelDeviceId}`)
    return
  }

  const panelKeys = (panelNode.params?.panelKeys as PanelKeyConfig[] | undefined) ?? []
  const keyConfig = panelKeys.find((k) => k.keyIndex === keyIndex)

  if (!keyConfig) {
    console.warn(`[executePanelAction] 按键 ${keyIndex} 未配置`)
    return
  }

  _executeAction(keyConfig.action)
}

/**
 * setPanelKeyConfig — 配置面板按键
 *
 * @param panelDeviceId 面板设备 ID
 * @param keyIndex 按键索引
 * @param config 按键配置（null 表示清除该按键）
 */
export function setPanelKeyConfig(
  panelDeviceId: string,
  keyIndex: number,
  config: Omit<PanelKeyConfig, 'keyIndex'> | null,
): void {
  const { nodes, updateNode } = useScene.getState()
  const panelNode = nodes[panelDeviceId as AnyNode['id']] as DeviceNode | undefined

  if (!panelNode || panelNode.type !== 'device') return

  const currentKeys = (panelNode.params?.panelKeys as PanelKeyConfig[] | undefined) ?? []

  let newKeys: PanelKeyConfig[]
  if (config === null) {
    // 清除该按键配置
    newKeys = currentKeys.filter((k) => k.keyIndex !== keyIndex)
  } else {
    // 设置或更新
    const existing = currentKeys.findIndex((k) => k.keyIndex === keyIndex)
    const newEntry: PanelKeyConfig = { keyIndex, ...config }
    if (existing === -1) {
      newKeys = [...currentKeys, newEntry]
    } else {
      newKeys = currentKeys.map((k) => (k.keyIndex === keyIndex ? newEntry : k))
    }
  }

  updateNode(panelDeviceId as AnyNode['id'], {
    params: { ...panelNode.params, panelKeys: newKeys },
  })
}

// ─── 内部执行器 ─────────────────────────────────────────────────

function _executeAction(action: PanelAction): void {
  switch (action.type) {
    case 'toggle':
      for (const id of action.deviceIds) {
        toggleDevice(id as DeviceNode['id'])
      }
      break

    case 'set':
      for (const id of action.deviceIds) {
        setDeviceState(id as DeviceNode['id'], action.state)
      }
      break

    case 'scene':
      applyScene(action.sceneId)
      break
  }
}
