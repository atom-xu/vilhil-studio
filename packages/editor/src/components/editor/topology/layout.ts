/**
 * Dagre Layout — 参考 homelable 的分层布局
 *
 * 增强点（homelable 技术方案）：
 * 1. Peer group detection（同层同类型节点 Y 对齐）
 *    - infra 层：switch / router 同级
 *    - control 层：gateway / hub 同级
 * 2. 只布局顶层节点（无 parentId），子节点保持相对位置
 * 3. 上游→下游 TB 方向
 */

import { Graph, layout } from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { DeviceNodeData, VilHilEdgeData } from './types'
import { NODE_TYPE_CONFIG } from './catalog'

const NODE_W = 172
const NODE_H = 96

export function getLayoutedElements(
  nodes: Node<DeviceNodeData>[],
  edges: Edge<VilHilEdgeData>[],
): { nodes: Node<DeviceNodeData>[]; edges: Edge<VilHilEdgeData>[] } {
  if (nodes.length === 0) return { nodes, edges }

  // ── 仅布局顶层节点（无 parentId）────────────────────────────────
  const topLevel = nodes.filter((n) => !n.parentId)
  const childNodes = nodes.filter((n) => n.parentId)

  const g = new Graph()
  g.setGraph({
    rankdir: 'TB',
    nodesep: 56,
    ranksep: 72,
    marginx: 40,
    marginy: 40,
  })
  g.setDefaultEdgeLabel(() => ({}))

  topLevel.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }))

  // ── Peer group 检测：同 tier 的节点连接不影响 rank（仿 homelable union-find）──
  const peerTypes = new Set(['switch', 'router', 'ap', 'gateway', 'hub'])
  const peerEdgeIds = new Set<string>()

  edges.forEach((e) => {
    const src = nodes.find((n) => n.id === e.source)
    const tgt = nodes.find((n) => n.id === e.target)
    if (!src || !tgt) return
    const srcType = src.data.topoType
    const tgtType = tgt.data.topoType
    // 同 tier 的 peer 类节点之间的连线不加入 dagre（避免强制分层）
    if (
      peerTypes.has(srcType) &&
      peerTypes.has(tgtType) &&
      NODE_TYPE_CONFIG[srcType].tier === NODE_TYPE_CONFIG[tgtType].tier
    ) {
      peerEdgeIds.add(e.id)
      return
    }
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target)
    }
  })

  layout(g)

  // ── Post-pass：对齐 peer group 到相同 Y ──────────────────────────
  const tierYMap = new Map<string, number[]>()
  topLevel.forEach((n) => {
    const pos = g.node(n.id)
    if (!pos) return
    const tier = NODE_TYPE_CONFIG[n.data.topoType].tier
    if (!tierYMap.has(tier)) tierYMap.set(tier, [])
    tierYMap.get(tier)!.push(pos.y)
  })

  // 同 tier 内：peer 类型节点取平均 Y，然后按原始 X 排序
  const layouted = topLevel.map((n) => {
    const pos = g.node(n.id)
    if (!pos) return n

    const tier = NODE_TYPE_CONFIG[n.data.topoType].tier
    const isPeer = peerTypes.has(n.data.topoType)

    let y = pos.y - NODE_H / 2
    if (isPeer) {
      const ys = tierYMap.get(tier) ?? []
      const avgY = ys.reduce((a, b) => a + b, 0) / (ys.length || 1)
      y = avgY - NODE_H / 2
    }

    return {
      ...n,
      position: { x: pos.x - NODE_W / 2, y },
    }
  })

  return { nodes: [...layouted, ...childNodes], edges }
}
