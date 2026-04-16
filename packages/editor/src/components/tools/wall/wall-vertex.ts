import {
  positionKey,
  quantizePoint,
  useScene,
  VertexNode,
  type LevelNode,
  type WallNode,
} from '@pascal-app/core'

/**
 * F2 最小版 —— 墙端点 vertex 管理工具
 *
 * 这组函数是 F2 完整版的起点：它们负责"在某个位置查找/创建/引用共享的 VertexNode"。
 * 目前还没被 wall 画墙工具调用（那是下一个 sprint），但作为独立工具函数已经完全可用：
 *
 * - AI 能调用它预先建好一套节点系统
 * - 迁移脚本用它把老墙数据转换成节点引用
 * - F2 完整版接入画墙工具时，直接调用这些函数
 *
 * 功能即工具：无 React 依赖，可从任意上下文调用。
 */

type Pt = [number, number]

/**
 * 获取或创建某个位置上的 input VertexNode。
 *
 * 查找逻辑：
 *   1. 先在同一 level 下找位置 key 相同（1cm 整数）的已有 vertex
 *   2. 找到 → 返回既有 vertex，不创建新的
 *   3. 找不到 → 创建一个新的 VertexNode，parent = level
 *
 * 返回值是 vertex 的 id，调用方用它填 WallNode.startNodeId / endNodeId。
 */
export function getOrCreateInputVertex(
  levelId: string,
  position: Pt,
): string {
  const { nodes, createNode } = useScene.getState()
  const level = nodes[levelId as keyof typeof nodes] as
    | LevelNode
    | undefined
  if (!level || level.type !== 'level') {
    throw new Error(`[wall-vertex] level ${levelId} not found or not a level`)
  }

  const snapped = quantizePoint(position)
  const targetKey = positionKey(snapped)

  // 1. 在当前 level 下找已有 vertex
  for (const childId of level.children) {
    const child = nodes[childId as keyof typeof nodes] as any
    if (child?.type !== 'vertex') continue
    if (child.kind !== 'input') continue
    if (positionKey(child.position as Pt) === targetKey) {
      return child.id
    }
  }

  // 2. 创建新的 VertexNode
  const vertex = VertexNode.parse({
    kind: 'input',
    position: snapped,
    referencedByWallIds: [],
  })
  createNode(vertex, levelId as LevelNode['id'])
  return vertex.id
}

/**
 * 创建一个派生 vertex —— 依附在某面墙上，position 由 parentWallId + t 运行时计算。
 *
 * 注意：派生 vertex 的 `position` 写入时 **不量化**（传什么存什么），
 * 因为量化会破坏共线性（见 F3 斜墙打断隐患）。
 * 为绕过 schema 的 quantize transform，这里用 `z.parse` 之后覆写 position。
 */
export function createDerivedVertex(
  levelId: string,
  parentWallId: string,
  t: number,
): string {
  const { nodes, createNode, updateNode } = useScene.getState()
  const parentWall = nodes[parentWallId as keyof typeof nodes] as any
  if (parentWall?.type !== 'wall') {
    throw new Error(`[wall-vertex] parent wall ${parentWallId} not found`)
  }
  const a = parentWall.start as Pt
  const b = parentWall.end as Pt
  const exactPosition: Pt = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ]

  // parse 时 transform 会量化 position，我们需要 derived 节点保留精确值
  const vertex = VertexNode.parse({
    kind: 'derived',
    position: [0, 0], // placeholder，下面会覆写
    parentWallId,
    parentT: t,
    referencedByWallIds: [],
  })
  createNode(vertex, levelId as LevelNode['id'])
  // 覆写为精确位置（绕过 transform）
  updateNode(vertex.id as any, { position: exactPosition } as any)
  return vertex.id
}

/**
 * 把一个 wall 的某个端点绑定到一个 vertex。
 *
 * 做两件事：
 *   1. 把 wall 的 startNodeId / endNodeId 更新为 vertex.id
 *   2. 在 vertex 的 referencedByWallIds 里追加 wall.id（去重）
 */
export function bindWallEndpointToVertex(
  wallId: string,
  which: 'start' | 'end',
  vertexId: string,
): void {
  const { nodes, updateNode } = useScene.getState()
  const wall = nodes[wallId as keyof typeof nodes] as WallNode | undefined
  const vertex = nodes[vertexId as keyof typeof nodes] as any
  if (!wall || wall.type !== 'wall') return
  if (!vertex || vertex.type !== 'vertex') return

  updateNode(wallId as any, {
    [which === 'start' ? 'startNodeId' : 'endNodeId']: vertexId,
  } as any)

  const existing = (vertex.referencedByWallIds ?? []) as string[]
  if (!existing.includes(wallId)) {
    updateNode(vertexId as any, {
      referencedByWallIds: [...existing, wallId],
    } as any)
  }
}

/**
 * 迁移工具：把一个 level 下所有墙体的端点转成 VertexNode 引用。
 *
 * 对每面墙的 start/end：
 *   1. 若已经有 startNodeId/endNodeId，跳过
 *   2. 否则调用 `getOrCreateInputVertex` 建立节点
 *   3. 调用 `bindWallEndpointToVertex` 完成绑定
 *
 * 运行完后，该 level 上所有墙体都是"节点引用"模式，F2 完整版的联动/打断功能可立即可用。
 */
export function migrateLevelToVertexNodes(levelId: string): {
  walls: number
  verticesCreated: number
  endpointsBound: number
} {
  const { nodes } = useScene.getState()
  const level = nodes[levelId as keyof typeof nodes] as
    | LevelNode
    | undefined
  if (!level || level.type !== 'level') {
    return { walls: 0, verticesCreated: 0, endpointsBound: 0 }
  }

  const walls = level.children
    .map((id) => nodes[id as keyof typeof nodes])
    .filter((n): n is WallNode => (n as any)?.type === 'wall')

  const seenVertexKeys = new Set<string>()
  let verticesCreated = 0
  let endpointsBound = 0

  for (const wall of walls) {
    if (!wall.startNodeId) {
      const before = seenVertexKeys.size
      seenVertexKeys.add(positionKey(wall.start as Pt))
      if (seenVertexKeys.size > before) verticesCreated++
      const vId = getOrCreateInputVertex(levelId, wall.start as Pt)
      bindWallEndpointToVertex(wall.id, 'start', vId)
      endpointsBound++
    }
    if (!wall.endNodeId) {
      const before = seenVertexKeys.size
      seenVertexKeys.add(positionKey(wall.end as Pt))
      if (seenVertexKeys.size > before) verticesCreated++
      const vId = getOrCreateInputVertex(levelId, wall.end as Pt)
      bindWallEndpointToVertex(wall.id, 'end', vId)
      endpointsBound++
    }
  }

  return { walls: walls.length, verticesCreated, endpointsBound }
}
