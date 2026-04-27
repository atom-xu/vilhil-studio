/**
 * 灯光回路工具
 *
 * 设计原则（CLAUDE.md 硬规则 2）：先做工具函数，再做 UI 包装。
 *
 * 回路（circuit）模型：
 *   - 共享 params.circuitId 的一组灯 = 一条回路
 *   - 没有 params.circuitId 的灯 = 自己一条"单灯回路"（fallback 用灯 id 当 circuitId）
 *     这条规则保证：每盏灯都有可被开关绑定的回路 id，不会出现"开关绑不上灯"的情况
 *
 * 编号（circuit number）：
 *   - 楼层范围内，按"该回路里第一盏灯的出现顺序"分配 1, 2, 3, ...
 *   - 单灯回路也参与编号（和多灯回路混排）
 *   - 编号是 derived value，不写进 schema —— 增删灯会自动重排，永远连续
 *
 * 暴露的 API：
 *   - mergeCircuits(a, b)              合并两条回路
 *   - separateLightToOwnCircuit(id)    剥离一盏灯到独立回路
 *   - listCircuitMembers(circuitId)    回路成员
 *   - getEffectiveCircuitId(device)    取灯的有效回路 id（含单灯 fallback）
 *   - getLightCircuits(levelId)        楼层内所有回路（按编号排序）
 *   - getCircuitNumber(deviceId, levelId)  某盏灯所在回路的显示编号
 */

import { useScene, type AnyNodeId, type DeviceNode, type LevelNode } from '@pascal-app/core'

/** 生成一个短 circuit id —— 楼层内唯一即可，不需要 cryptographic 强度 */
export function makeCircuitId(): string {
  return `ckt_${Math.random().toString(36).slice(2, 8)}`
}

/** 读出某盏灯当前的 circuitId（没有就返回 null） */
function readCircuitId(device: DeviceNode): string | null {
  return ((device.params as { circuitId?: string } | undefined)?.circuitId ?? null) || null
}

/**
 * 灯的"有效回路 id" —— 主流程都用这个，自动处理 fallback。
 *
 * 有 circuitId → 直接返回
 * 没 → 用灯自己的 id 当回路 id（视为单灯回路）
 *
 * 这样：开关绑定 / 场景效果 / 显示编号都可以无差别处理"灯属于哪条回路"。
 */
export function getEffectiveCircuitId(device: DeviceNode): string {
  return readCircuitId(device) || device.id
}

/** 同一楼层下，给定 circuitId 包含的所有灯节点（含单灯回路的处理） */
export function listCircuitMembers(circuitId: string): DeviceNode[] {
  const { nodes } = useScene.getState()
  const out: DeviceNode[] = []
  for (const n of Object.values(nodes)) {
    if (!n || n.type !== 'device') continue
    const d = n as DeviceNode
    if (d.subsystem !== 'lighting') continue
    if (getEffectiveCircuitId(d) === circuitId) out.push(d)
  }
  return out
}

/**
 * 楼层内所有回路 —— 按显示编号排序的列表。
 *
 * 每条回路含：
 *   - circuitId：用于 schema 写入（merge 等）
 *   - number：1, 2, 3... 在 UI 里展示
 *   - displayName："回路 N"
 *   - members：该回路的所有灯
 *   - isImplicit：true 表示这是 fallback 出来的单灯回路（灯没有 params.circuitId）
 *
 * 编号规则：按楼层下灯出现的顺序，第一次见到的 circuitId 拿 1，下一个新 id 拿 2，依此类推。
 * 增删灯都会让编号重新计算（始终连续 1..N）。
 */
export interface CircuitInfo {
  circuitId: string
  number: number
  /**
   * UI 上显示的名字。优先级：
   *   1) `LevelNode.circuitMeta[circuitId].name`（用户起的名）
   *   2) `回路 ${number}`（默认）
   */
  displayName: string
  /** 用户起的自定义名（无值时为 undefined）—— 区分 displayName 是否被改过 */
  name?: string
  /** 用户自定义颜色（HEX）—— 用于回路徽章；无值由调用方决定默认色 */
  color?: string
  members: DeviceNode[]
  isImplicit: boolean
}

export function getLightCircuits(levelId: string | null): CircuitInfo[] {
  if (!levelId) return []
  const { nodes } = useScene.getState()
  const level = nodes[levelId as AnyNodeId]
  if (!level || level.type !== 'level') return []

  const orderedCircuitIds: string[] = []
  const membersByCircuit = new Map<string, DeviceNode[]>()
  const isImplicitMap = new Map<string, boolean>()

  // 按楼层 children 顺序遍历，第一次见到的 circuitId 决定它的编号
  for (const childId of level.children) {
    const n = nodes[childId]
    if (!n || n.type !== 'device') continue
    const d = n as DeviceNode
    if (d.subsystem !== 'lighting') continue

    const explicitCid = readCircuitId(d)
    const cid = explicitCid || d.id // 单灯 fallback

    if (!membersByCircuit.has(cid)) {
      membersByCircuit.set(cid, [])
      isImplicitMap.set(cid, !explicitCid)
      orderedCircuitIds.push(cid)
    }
    membersByCircuit.get(cid)!.push(d)
  }

  // 一并查 LevelNode.circuitMeta 把自定义名 / 颜色拼上去
  const meta = ((level as LevelNode).circuitMeta ?? {}) as Record<
    string,
    { name?: string; color?: string }
  >

  return orderedCircuitIds.map((cid, i) => {
    const m = meta[cid] ?? {}
    return {
      circuitId: cid,
      number: i + 1,
      displayName: m.name && m.name.trim().length > 0 ? m.name : `回路 ${i + 1}`,
      name: m.name,
      color: m.color,
      members: membersByCircuit.get(cid)!,
      isImplicit: isImplicitMap.get(cid) ?? false,
    }
  })
}

/**
 * setCircuitMeta — 给某条回路设置/清空自定义名 + 颜色
 *
 * 数据层方法，UI 直接调。`patch.name === ''` / `patch.color === ''` 视为清空。
 * 写在 LevelNode.circuitMeta（避免每盏灯重复存）。
 */
export function setCircuitMeta(
  levelId: string,
  circuitId: string,
  patch: { name?: string; color?: string },
): void {
  const { nodes, updateNode } = useScene.getState()
  const level = nodes[levelId as AnyNodeId]
  if (!level || level.type !== 'level') return
  const cur = ((level as LevelNode).circuitMeta ?? {}) as Record<
    string,
    { name?: string; color?: string }
  >
  const prev = cur[circuitId] ?? {}
  const next: { name?: string; color?: string } = { ...prev }
  if ('name' in patch) {
    if (!patch.name) delete next.name
    else next.name = patch.name
  }
  if ('color' in patch) {
    if (!patch.color) delete next.color
    else next.color = patch.color
  }
  // 整条 entry 都空 → 删 key（避免长期累积空对象）
  const newCircuitMeta = { ...cur }
  if (!next.name && !next.color) delete newCircuitMeta[circuitId]
  else newCircuitMeta[circuitId] = next

  updateNode(levelId as AnyNodeId, { circuitMeta: newCircuitMeta } as Partial<LevelNode>)
}

/** 取某盏灯所在回路的显示编号（找不到返回 null） */
export function getCircuitNumber(deviceId: string, levelId: string | null): number | null {
  const circuits = getLightCircuits(levelId)
  for (const c of circuits) {
    if (c.members.some((m) => m.id === deviceId)) return c.number
  }
  return null
}

/**
 * 合并两条回路：把 sourceLightId 所在回路的所有灯，全部改成
 * targetLightId 所在回路的 circuitId。
 *
 * 规则：
 *   - 两盏都没显式 circuitId（都是单灯回路）→ 新生成一个 id 给它俩
 *   - 一盏有显式一盏没 → 没的并入有的那条
 *   - 都有不同的 → source 那条全部改成 target 的 id
 *   - 都有同一个 → no-op
 */
export function mergeCircuits(sourceLightId: string, targetLightId: string): void {
  const sceneState = useScene.getState()
  const { nodes, updateNode } = sceneState

  const source = nodes[sourceLightId as AnyNodeId] as DeviceNode | undefined
  const target = nodes[targetLightId as AnyNodeId] as DeviceNode | undefined
  if (!source || source.type !== 'device' || source.subsystem !== 'lighting') return
  if (!target || target.type !== 'device' || target.subsystem !== 'lighting') return
  if (sourceLightId === targetLightId) return

  const sCidExplicit = readCircuitId(source)
  const tCidExplicit = readCircuitId(target)

  // 都已经在同一显式回路，啥都不用改
  if (sCidExplicit && tCidExplicit && sCidExplicit === tCidExplicit) return

  // 决定最终 circuitId：优先用 target 的显式 id；都没就新建
  const finalCid = tCidExplicit || sCidExplicit || makeCircuitId()

  const toUpdate = new Set<string>()
  toUpdate.add(sourceLightId)
  toUpdate.add(targetLightId)
  // 如果 source 之前有显式回路，把那条的所有成员一起搬过来
  if (sCidExplicit && sCidExplicit !== finalCid) {
    for (const m of listCircuitMembers(sCidExplicit)) toUpdate.add(m.id)
  }

  for (const id of toUpdate) {
    const n = nodes[id as AnyNodeId] as DeviceNode | undefined
    if (!n) continue
    if (readCircuitId(n) === finalCid) continue
    updateNode(id as AnyNodeId, {
      params: { ...(n.params ?? {}), circuitId: finalCid },
    })
  }
}

/**
 * 把一盏灯从当前回路剥离 —— 给它分配一个全新的 circuitId。
 * 之后它自己一条回路（直到再 merge）。
 */
export function separateLightToOwnCircuit(lightId: string): void {
  const { nodes, updateNode } = useScene.getState()
  const node = nodes[lightId as AnyNodeId] as DeviceNode | undefined
  if (!node || node.type !== 'device' || node.subsystem !== 'lighting') return

  const newCid = makeCircuitId()
  updateNode(lightId as AnyNodeId, {
    params: { ...(node.params ?? {}), circuitId: newCid },
  })
}

/**
 * 一次性回填：把楼层下所有缺 circuitId 的灯都补上真实 id。
 *
 * 用途：老数据（schema 加 circuitId 之前放的灯）打开时一键迁移，
 *      之后右侧面板 / 开关绑定都按"显式回路 id"工作，不再走 fallback。
 *
 * 调用时机：楼层切换时（FloorplanPanel useEffect on levelId）。
 *
 * 行为：每盏没 circuitId 的灯各自分配一条新的（每盏一回路）—— 不做"按位置
 *      聚合成大回路"的猜测，因为我们没法知道当时设计师的意图。
 *
 * 返回：实际改动的灯数（用于日志 / 测试）。已经有 circuitId 的灯不动。
 */
export function assignMissingCircuitIds(levelId: string | null): number {
  if (!levelId) return 0
  const { nodes, updateNode } = useScene.getState()
  const level = nodes[levelId as AnyNodeId]
  if (!level || level.type !== 'level') return 0

  let count = 0
  for (const childId of level.children) {
    const n = nodes[childId]
    if (!n || n.type !== 'device') continue
    const d = n as DeviceNode
    if (d.subsystem !== 'lighting') continue
    if (readCircuitId(d)) continue
    updateNode(childId as AnyNodeId, {
      params: { ...(d.params ?? {}), circuitId: makeCircuitId() },
    })
    count++
  }
  return count
}
