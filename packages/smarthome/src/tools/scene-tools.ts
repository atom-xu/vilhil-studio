/**
 * 场景工具函数
 *
 * S3 核心工具：创建 / 更新 / 删除 / 执行场景
 * 所有函数不依赖 React 组件，可被 UI / AI / 测试脚本直接调用。
 * 自动获得 Undo/Redo + 持久化。
 *
 * 动画层：使用 @tweenjs/tween.js 替代手写 requestAnimationFrame 插值。
 * 参考 iCraft 技术方案 —— TWEEN 支持 chain/yoyo/easing，
 * 比裸 lerp 更容易组合复杂场景时间线。
 */

import TWEEN, { type Tween } from '@tweenjs/tween.js'
import { generateId, SceneNode, useScene } from '@pascal-app/core'
import type { AnyNode, SceneEffect, SceneNodeType } from '@pascal-app/core'
import { setDeviceState } from './set-device-params'
import { listCircuitMembers } from './circuit-tools'

// 独立组：Tween 25 不会自动加入全局组；完成时从组中移除。
const sceneTweens = new TWEEN.Group()
let _tweenRafId: ReturnType<typeof requestAnimationFrame> | null = null
const pendingEffects = new Set<ReturnType<typeof setTimeout>>()
const deviceTweens = new Map<string, Tween<Record<string, number>>>()

function ensureTweenLoop(): void {
  if (_tweenRafId !== null) return
  const loop = (time: number) => {
    sceneTweens.update(time)
    _tweenRafId = sceneTweens.getAll().length ? requestAnimationFrame(loop) : null
  }
  _tweenRafId = requestAnimationFrame(loop)
}

function cancelPreviousRun(): void {
  activeSceneRunToken = null
  for (const timer of pendingEffects) clearTimeout(timer)
  pendingEffects.clear()
  for (const tween of deviceTweens.values()) tween.stop()
  deviceTweens.clear()
  sceneTweens.removeAll()
  if (_tweenRafId !== null) cancelAnimationFrame(_tweenRafId)
  _tweenRafId = null
}

/**
 * 把一条 SceneEffect 解析为它实际要影响的 deviceId 列表。
 * - circuitId 非空 → 该回路所有成员
 * - 否则 → 单个 deviceId（包成单元素数组；undefined 时返回空数组，调用方跳过）
 */
function resolveEffectTargets(effect: SceneEffect): string[] {
  if (effect.circuitId) {
    return listCircuitMembers(effect.circuitId).map((d) => d.id)
  }
  return effect.deviceId ? [effect.deviceId] : []
}

let activeSceneRunToken: symbol | null = null

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
 * @param delay     延迟秒数（相对上一步的启动时间）
 * @param duration  数值渐变秒数
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

  // 同一个 deviceId 已经有 effect 就更新，没有就追加
  const existing = node.effects.findIndex(
    (e) => e.deviceId === deviceId && !e.circuitId,
  )
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
 * addSceneCircuitEffect — 为场景添加"整条回路"的效果
 *
 * 和 `addSceneEffect` 平行：前者绑单灯、这个绑回路。运行时（applyScene）会按
 * 当前回路成员展开应用 state；之后回路里加灯/减灯，**不需要改场景配置**。
 */
export function addSceneCircuitEffect(
  sceneId: string,
  circuitId: string,
  state: Record<string, unknown>,
  delay = 0,
  duration = 0,
): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[sceneId as AnyNode['id']] as SceneNodeType | undefined
  if (!node || node.type !== 'scene') return

  const existing = node.effects.findIndex((e) => e.circuitId === circuitId)
  let newEffects: SceneEffect[]

  if (existing === -1) {
    newEffects = [...node.effects, { circuitId, state, delay, duration }]
  } else {
    newEffects = node.effects.map((e, i) =>
      i === existing ? { ...e, state: { ...e.state, ...state }, delay, duration } : e,
    )
  }

  updateNode(sceneId as AnyNode['id'], { effects: newEffects } as Partial<AnyNode>)
}

/**
 * removeSceneEffect — 从场景中移除某个设备的效果（按 deviceId 匹配，不动 circuit 类）
 */
export function removeSceneEffect(sceneId: string, deviceId: string): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[sceneId as AnyNode['id']] as SceneNodeType | undefined
  if (!node || node.type !== 'scene') return

  updateNode(sceneId as AnyNode['id'], {
    effects: node.effects.filter((e) => !(e.deviceId === deviceId && !e.circuitId)),
  } as Partial<AnyNode>)
}

/** removeSceneCircuitEffect — 移除场景里某条回路的效果（按 circuitId 匹配） */
export function removeSceneCircuitEffect(sceneId: string, circuitId: string): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[sceneId as AnyNode['id']] as SceneNodeType | undefined
  if (!node || node.type !== 'scene') return

  updateNode(sceneId as AnyNode['id'], {
    effects: node.effects.filter((e) => e.circuitId !== circuitId),
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
 * - duration: 对数值字段做平滑插值（秒）
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

  cancelPreviousRun()
  const runToken = Symbol(`scene-run-${sceneId}`)
  activeSceneRunToken = runToken
  const startedAt = Date.now()
  let elapsedMs = 0
  let maxEndMs = 0
  const scheduled: Array<{ effect: SceneEffect; atMs: number }> = []
  for (const effect of sceneNode.effects) {
    elapsedMs += Math.max(0, (effect.delay ?? 0) * 1000)
    for (const tid of resolveEffectTargets(effect)) {
      if (nodes[tid as AnyNode['id']]?.type !== 'device') continue
      scheduled.push({ effect: { ...effect, deviceId: tid, circuitId: undefined }, atMs: elapsedMs })
      maxEndMs = Math.max(maxEndMs, elapsedMs + Math.max(0, (effect.duration ?? 0) * 1000))
    }
  }
  let remaining = scheduled.length
  const finishEffect = () => {
    if (activeSceneRunToken !== runToken || --remaining !== 0) return
    emitSceneRunStatus({ sceneId, running: false, startedAt,
      expectedEndAt: startedAt + maxEndMs, completedAt: Date.now() })
  }
  emitSceneRunStatus({ sceneId, running: remaining > 0, startedAt,
    expectedEndAt: startedAt + maxEndMs, completedAt: remaining ? null : startedAt })
  for (const { effect, atMs } of scheduled) {
    const timer = setTimeout(() => {
      pendingEffects.delete(timer)
      if (activeSceneRunToken !== runToken) return
      animateNumericState(effect, Math.max(0, (effect.duration ?? 0) * 1000), runToken, finishEffect)
    }, atMs)
    pendingEffects.add(timer)
  }
  return scheduled.length
}

function animateNumericState(
  effect: SceneEffect, durationMs: number, runToken: symbol, done: () => void,
): void {
  const id = effect.deviceId as AnyNode['id']
  // 同一设备的新步骤取代旧过渡；旧步骤不再写入最终值。
  deviceTweens.get(id)?.stop()
  const current = useScene.getState().nodes[id]
  if (!current || current.type !== 'device') { done(); return }
  const currentState = (current.state ?? {}) as Record<string, unknown>
  const targetState = effect.state as Record<string, unknown>
  const defaults: Record<string, number> = { brightness: 100, colorTemp: 4000, position: 50 }
  const fromObj: Record<string, number> = {}
  const toObj: Record<string, number> = {}
  const immediatePatch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(targetState)) {
    const initial = currentState[key] ?? defaults[key]
    if (durationMs > 0 && typeof value === 'number' && Number.isFinite(value)
      && typeof initial === 'number' && Number.isFinite(initial)) {
      fromObj[key] = initial
      toObj[key] = value
    } else if (key !== 'on' || value !== false || durationMs === 0) {
      immediatePatch[key] = value
    }
  }
  const finish = () => {
    if (activeSceneRunToken === runToken) setDeviceState(id as any, targetState)
    done()
  }
  if (!Object.keys(toObj).length) { finish(); return }
  if (Object.keys(immediatePatch).length) setDeviceState(id as any, immediatePatch)
  let settled = false
  const settle = () => {
    if (settled) return
    settled = true
    sceneTweens.remove(tween)
    if (deviceTweens.get(id) === tween) deviceTweens.delete(id)
    done()
  }
  const tween = new TWEEN.Tween(fromObj, sceneTweens)
    .to(toObj, durationMs)
    .easing(TWEEN.Easing.Quadratic.InOut)
    .onUpdate((obj) => {
      if (activeSceneRunToken === runToken) setDeviceState(id as any, { ...obj })
    })
    .onComplete(() => {
      if (activeSceneRunToken === runToken) setDeviceState(id as any, targetState)
      settle()
    })
    .onStop(settle)
    .start()
  deviceTweens.set(id, tween)
  ensureTweenLoop()
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
