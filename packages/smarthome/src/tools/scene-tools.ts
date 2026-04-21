/**
 * 场景工具函数
 *
 * S3 核心工具：创建 / 更新 / 删除 / 执行场景
 * 所有函数不依赖 React 组件，可被 UI / AI / 测试脚本直接调用。
 * 自动获得 Undo/Redo + 持久化。
 */

import { generateId, SceneNode, useScene } from '@pascal-app/core'
import type { AnyNode, SceneEffect, SceneNodeType } from '@pascal-app/core'
import { setDeviceState } from './set-device-params'

let activeSceneRunToken: symbol | null = null
let activeRunEndTimer: ReturnType<typeof setTimeout> | null = null

export interface SceneRunStatus {
  sceneId: string | null
  running: boolean
  startedAt: number | null
  expectedEndAt: number | null
  completedAt: number | null
}

const sceneRunSubscribers = new Set<(status: SceneRunStatus) => void>()
let sceneRunStatus: SceneRunStatus = {
  sceneId: null,
  running: false,
  startedAt: null,
  expectedEndAt: null,
  completedAt: null,
}

function emitSceneRunStatus(next: SceneRunStatus): void {
  sceneRunStatus = next
  for (const subscriber of sceneRunSubscribers) subscriber(next)
}

export function subscribeSceneRunStatus(
  subscriber: (status: SceneRunStatus) => void,
): () => void {
  sceneRunSubscribers.add(subscriber)
  subscriber(sceneRunStatus)
  return () => {
    sceneRunSubscribers.delete(subscriber)
  }
}

export function getSceneRunStatus(): SceneRunStatus {
  return sceneRunStatus
}

// ═══════════════════════════════════════════════════════════════
// 场景 CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * createScene — 创建新场景
 *
 * @param parentId 父节点 ID（通常是 levelId）
 * @param name     场景名称，如"回家模式"
 * @param effects  初始效果列表（可为空，之后用 updateScene 补充）
 * @param icon     场景图标（emoji 或图标名）
 * @returns 新建场景的 ID
 */
export function createScene(
  parentId: string,
  name: string,
  effects: SceneEffect[] = [],
  icon?: string,
): string {
  const id = generateId('scene')

  const node = SceneNode.parse({
    id,
    parentId,
    name,
    icon: icon ?? '✨',
    effects,
    object: 'node',
    visible: true,
    metadata: {},
    type: 'scene',
  })

  useScene.getState().createNode(node as AnyNode, parentId as any)
  return id
}

/**
 * updateScene — 更新场景属性或效果列表
 *
 * @param sceneId  场景 ID
 * @param updates  要更新的字段（name / icon / effects）
 */
export function updateScene(
  sceneId: string,
  updates: Partial<Pick<SceneNodeType, 'name' | 'icon' | 'effects'>>,
): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[sceneId as AnyNode['id']] as SceneNodeType | undefined
  if (!node || node.type !== 'scene') return
  updateNode(sceneId as AnyNode['id'], updates as Partial<AnyNode>)
}

/**
 * deleteScene — 删除场景
 *
 * @param sceneId  场景 ID
 */
export function deleteScene(sceneId: string): void {
  useScene.getState().deleteNode(sceneId as AnyNode['id'])
}

/**
 * addSceneEffect — 为场景添加或更新一个设备效果
 *
 * 如果该设备已在 effects 中，更新其 state；否则追加。
 *
 * @param sceneId   场景 ID
 * @param deviceId  设备 ID
 * @param state     目标状态
 * @param delay     延迟秒数（S4 时间线用，当前忽略）
 * @param duration  渐变时间（S4 渐变用，当前忽略）
 */
export function addSceneEffect(
  sceneId: string,
  deviceId: string,
  state: Record<string, unknown>,
  delay = 0,
  duration = 0,
): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[sceneId as AnyNode['id']] as SceneNodeType | undefined
  if (!node || node.type !== 'scene') return

  const existing = node.effects.findIndex((e) => e.deviceId === deviceId)
  let newEffects: SceneEffect[]

  if (existing === -1) {
    newEffects = [...node.effects, { deviceId, state, delay, duration }]
  } else {
    newEffects = node.effects.map((e, i) =>
      i === existing ? { ...e, state: { ...e.state, ...state }, delay, duration } : e,
    )
  }

  updateNode(sceneId as AnyNode['id'], { effects: newEffects } as Partial<AnyNode>)
}

/**
 * removeSceneEffect — 从场景中移除某个设备的效果
 */
export function removeSceneEffect(sceneId: string, deviceId: string): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[sceneId as AnyNode['id']] as SceneNodeType | undefined
  if (!node || node.type !== 'scene') return

  updateNode(sceneId as AnyNode['id'], {
    effects: node.effects.filter((e) => e.deviceId !== deviceId),
  } as Partial<AnyNode>)
}

// ═══════════════════════════════════════════════════════════════
// 场景执行
// ═══════════════════════════════════════════════════════════════

/**
 * applyScene — 执行场景（批量更新设备状态）
 *
 * 按顺序执行场景效果，支持 delay / duration：
 * - delay: 在当前步骤前等待（秒）
 * - duration: 对数值字段做线性插值（秒）
 *
 * @param sceneId 场景 ID
 * @returns 场景中可执行的设备效果数量
 */
export function applyScene(sceneId: string): number {
  const { nodes } = useScene.getState()
  const sceneNode = nodes[sceneId as AnyNode['id']] as SceneNodeType | undefined

  if (!sceneNode || sceneNode.type !== 'scene') {
    console.warn(`[applyScene] 找不到场景: ${sceneId}`)
    return 0
  }

  if (sceneNode.effects.length === 0) {
    console.warn(`[applyScene] 场景"${sceneNode.name}"没有配置任何效果`)
    return 0
  }

  const runToken = Symbol(`scene-run-${sceneId}`)
  activeSceneRunToken = runToken
  if (activeRunEndTimer) {
    clearTimeout(activeRunEndTimer)
    activeRunEndTimer = null
  }

  const startedAt = Date.now()
  let elapsedMs = 0
  let maxEndMs = 0
  let count = 0

  for (const effect of sceneNode.effects) {
    const deviceNode = nodes[effect.deviceId as AnyNode['id']]
    if (!deviceNode || deviceNode.type !== 'device') continue

    elapsedMs += Math.max(0, (effect.delay ?? 0) * 1000)
    maxEndMs = Math.max(maxEndMs, elapsedMs + Math.max(0, (effect.duration ?? 0) * 1000))
    scheduleEffect(effect, elapsedMs, runToken)
    count++
  }

  if (count === 0) {
    emitSceneRunStatus({
      sceneId,
      running: false,
      startedAt,
      expectedEndAt: startedAt,
      completedAt: startedAt,
    })
    return 0
  }

  emitSceneRunStatus({
    sceneId,
    running: true,
    startedAt,
    expectedEndAt: startedAt + maxEndMs,
    completedAt: null,
  })

  activeRunEndTimer = setTimeout(() => {
    if (activeSceneRunToken !== runToken) return
    emitSceneRunStatus({
      sceneId,
      running: false,
      startedAt,
      expectedEndAt: startedAt + maxEndMs,
      completedAt: Date.now(),
    })
  }, maxEndMs + 16)

  return count
}

function scheduleEffect(effect: SceneEffect, atMs: number, runToken: symbol): void {
  setTimeout(() => {
    if (activeSceneRunToken !== runToken) return

    const durationMs = Math.max(0, (effect.duration ?? 0) * 1000)
    if (durationMs === 0) {
      setDeviceState(effect.deviceId as any, effect.state)
      return
    }

    animateNumericState(effect, durationMs, runToken)
  }, atMs)
}

function animateNumericState(effect: SceneEffect, durationMs: number, runToken: symbol): void {
  const current = useScene.getState().nodes[effect.deviceId as AnyNode['id']]
  if (!current || current.type !== 'device') return

  const currentState = (current.state ?? {}) as Record<string, unknown>
  const targetState = effect.state as Record<string, unknown>

  const numericKeys = Object.keys(targetState).filter(
    (key) => typeof targetState[key] === 'number' && typeof currentState[key] === 'number',
  )
  const immediateKeys = Object.keys(targetState).filter((key) => !numericKeys.includes(key))

  if (immediateKeys.length > 0) {
    const immediatePatch: Record<string, unknown> = {}
    for (const key of immediateKeys) immediatePatch[key] = targetState[key]
    setDeviceState(effect.deviceId as any, immediatePatch)
  }

  if (numericKeys.length === 0) return

  const start = Date.now()

  const tick = () => {
    if (activeSceneRunToken !== runToken) return
    const progress = Math.min(1, (Date.now() - start) / durationMs)

    const patch: Record<string, unknown> = {}
    for (const key of numericKeys) {
      const from = currentState[key] as number
      const to = targetState[key] as number
      patch[key] = from + (to - from) * progress
    }
    setDeviceState(effect.deviceId as any, patch)

    if (progress < 1) {
      requestAnimationFrame(tick)
    }
  }

  requestAnimationFrame(tick)
}

/**
 * getSceneNodes — 获取当前 scene store 中所有场景节点
 * 按创建顺序返回（Zustand store 保留插入顺序）
 */
export function getSceneNodes(): SceneNodeType[] {
  const { nodes } = useScene.getState()
  return Object.values(nodes)
    .filter((n): n is SceneNodeType => n?.type === 'scene')
}
