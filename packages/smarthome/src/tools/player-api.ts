/**
 * VilHil Player API
 *
 * 参考 iCraft @icraft/player-react 设计思路：
 * 将展示模式（ProposalLayout / 分享落地页）需要的所有业务动作
 * 收拢为一套稳定的门面接口，与内部 useScene/useDeviceState 状态树解耦。
 *
 * 调用方（UI 组件、AI 编排、分享落地页）只需要面向这套接口编程，
 * 无需感知 Zustand store 的内部结构。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  UI / AI / 分享落地页                                  │
 * │        ↓  VilHilPlayerAPI（本文件）                    │
 * │        ↓  Tool Functions（place/toggle/applyScene…）  │
 * │        ↓  useScene / useDeviceState（真值）            │
 * │        ↓  Renderer（Three.js 渲染）                   │
 * └──────────────────────────────────────────────────────┘
 */

import { useScene } from '@pascal-app/core'
import type { AnyNode, DeviceNode, SceneNodeType } from '@pascal-app/core'

// 将外部传入的任意 deviceId 字符串安全转为 DeviceNode['id'] 类型
// deviceId 可能已经带 "device_" 前缀，也可能只是裸 UUID
function toDeviceId(deviceId: string): DeviceNode['id'] {
  const raw = deviceId.startsWith('device_') ? deviceId : `device_${deviceId}`
  return raw as DeviceNode['id']
}
import { useDeviceState } from '../device-state'
import { toggleDevice } from './toggle-device'
import { setDeviceParams } from './set-device-params'
import { applyScene, getSceneNodes, subscribeSceneRunStatus, type SceneRunStatus } from './scene-tools'

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

export interface PlayerDeviceSummary {
  id: string
  name: string
  subsystem: string
  on: boolean
  levelId: string | null
}

export interface PlayerSceneSummary {
  id: string
  name: string
  icon: string
  effectCount: number
}

export interface PlayerSubsystemFocus {
  subsystem: string | null
}

// ─── 设备操作 ──────────────────────────────────────────────────────────────────

/**
 * 切换设备开关状态。
 * 对应 iCraft `player.playAnimationByElementKey()` 的最简形式。
 */
export function playerToggleDevice(deviceId: string): void {
  toggleDevice(toDeviceId(deviceId))
}

/**
 * 批量设置设备参数（亮度、色温、音量等）。
 * 对应 iCraft Element3D 实例方法的参数驱动模式。
 */
export function playerSetDeviceParam(
  deviceId: string,
  params: Record<string, unknown>,
): void {
  setDeviceParams(toDeviceId(deviceId), params)
}

// ─── 场景控制 ──────────────────────────────────────────────────────────────────

/**
 * 执行场景（回家模式、离家模式等）。
 * 对应 iCraft `player.playAnimationByElementKey()` 的场景级调用。
 *
 * @returns 触发的设备效果数量，0 表示场景为空或找不到场景
 */
export function playerApplyScene(sceneId: string): number {
  return applyScene(sceneId)
}

/**
 * 获取所有场景的摘要列表（供 SceneBar 等 UI 消费）。
 * 对应 iCraft 的 sub-scene 列表。
 */
export function playerListScenes(): PlayerSceneSummary[] {
  return getSceneNodes().map((n: SceneNodeType) => ({
    id: n.id,
    name: n.name,
    icon: n.icon ?? '✨',
    effectCount: n.effects.length,
  }))
}

/**
 * 订阅场景执行状态（running / completed）。
 * 返回取消订阅函数，组件卸载时调用。
 */
export function playerSubscribeSceneStatus(
  listener: (status: SceneRunStatus) => void,
): () => void {
  return subscribeSceneRunStatus(listener)
}

// ─── 子系统聚焦 ────────────────────────────────────────────────────────────────

/**
 * 聚焦某个子系统（灯光/安防/网络…）或取消聚焦（传 null）。
 * 对应 iCraft 的视角切换 + 子场景进入语义。
 * 渲染层由 SubsystemBar 订阅 useDeviceState.selectedSubsystem 响应。
 */
export function playerFocusSubsystem(subsystem: string | null): void {
  useDeviceState.getState().selectSubsystem(subsystem as any)
}

/**
 * 切换子系统可见性（眼睛图标）。
 * 聚焦与显隐分离 — CLAUDE.md 硬规则 #4。
 */
export function playerToggleSubsystemVisibility(subsystem: string): void {
  useDeviceState.getState().toggleSubsystem(subsystem as any)
}

// ─── 楼层导航 ──────────────────────────────────────────────────────────────────

/**
 * 切换当前楼层。
 * 对应 iCraft `enterSubScene()` 的楼层语义。
 * 实际效果：useViewer.selectLevel(levelId) —— 因 viewer 在 peer 包，
 * 此处通过 useScene 间接读取楼层 ID，调用方负责调 viewer store。
 */
export function playerListLevels(): Array<{ id: string; name: string; level: number }> {
  const nodes = useScene.getState().nodes
  return Object.values(nodes)
    .filter((n): n is any => n?.type === 'level')
    .sort((a: any, b: any) => a.level - b.level)
    .map((n: any) => ({ id: n.id, name: n.name ?? `F${n.level}`, level: n.level }))
}

// ─── 只读数据查询 ──────────────────────────────────────────────────────────────

/**
 * 获取指定楼层所有设备的摘要（供分享落地页初始化）。
 * 对应 iCraft `getElementsByName()` 的批量查询语义。
 */
export function playerGetDevices(levelId?: string): PlayerDeviceSummary[] {
  const nodes = useScene.getState().nodes
  return Object.values(nodes)
    .filter((n): n is DeviceNode => {
      if (!n || n.type !== 'device') return false
      if (levelId && (n as any).levelId !== levelId) return false
      return true
    })
    .map((n: DeviceNode) => ({
      id: n.id,
      name: n.name ?? (n as any).renderType ?? '设备',
      subsystem: (n as any).subsystem ?? 'unknown',
      on: Boolean((n.state as any)?.on),
      levelId: (n as any).levelId ?? null,
    }))
}

/**
 * 获取单个设备的完整运行时状态。
 */
export function playerGetDeviceState(deviceId: string): Record<string, unknown> | null {
  const node = useScene.getState().nodes[deviceId as AnyNode['id']]
  if (!node || node.type !== 'device') return null
  return ((node as DeviceNode).state ?? {}) as Record<string, unknown>
}
