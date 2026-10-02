'use client'

/**
 * TopologyWorkspace — React Flow 版（深度参考 homelable-hacs）
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  层级模型（homelable TB 分层思路）                                  │
 * │  ISP → Router → Switch → AP/Gateway/Hub → 终端设备                │
 * │                                                                  │
 * │  节点类型：18 种（infra/control/device 三层）                       │
 * │  边类型：6 种协议（ethernet/wifi/zigbee/matter/knx/rs485）          │
 * │  状态：online/offline/pending/unknown                             │
 * │  动画：边流动动画（animated toggle）                               │
 * │  布局：dagre TB + peer-group Y 对齐                               │
 * │  撤销：50步 undo/redo                                             │
 * └──────────────────────────────────────────────────────────────────┘
 */

import '@xyflow/react/dist/style.css'

import {
  type AnyNode,
  type AnyNodeId,
  DeviceNode,
  generateId,
  resolveLevelId,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  SUBSYSTEM_META,
} from '@vilhil/smarthome'
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  reconnectEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  Panel,
  MarkerType,
} from '@xyflow/react'
import {
  ChevronDown,
  ChevronUp,
  Network,
  Package,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  X,
  Zap,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

// ── Topology module imports ───────────────────────────────────────────────────
import type {
  DeviceNodeData,
  HistoryEntry,
  NodeStatus,
  SceneDevice,
  TopologyEdgeType,
  TopologyNodeType,
  VilHilEdgeData,
} from './topology/types'
import {
  EDGE_TYPE_CONFIG,
  NODE_TYPE_CONFIG,
  STATUS_COLOR,
  deriveDefaultEdgeType,
  deriveTopologyType,
} from './topology/catalog'
import { getLayoutedElements } from './topology/layout'
import { VilHilDeviceNode } from './topology/device-node'
import { VilHilEdge } from './topology/edge'

// ─── Re-exported types (for topology/types.ts DeviceNodeData imports) ─────────
export type ApiTopologyController = {
  deviceId: string
  name: string
  levelId: string | null
  protocol: string
  maxChildren: number
  usedChildren: number
  availableChildren: number
  childIds: string[]
}
export type ApiTopologyAssignment = {
  childId: string
  parentId: string
  slotIndex: number
  assignedAt: number
  reason: 'auto' | 'manual-lock'
}
type ApiTopologyData = {
  generatedAt: number
  controllers: ApiTopologyController[]
  assignments: ApiTopologyAssignment[]
  unassigned: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOPOLOGY_DRAFT_KEY = 'vilhil-topology-rf-v2'
const MAX_HISTORY = 50
const NODE_W = 172
const NODE_H = 96
const SMART_ITEM_IDS = new Set([
  'apple-homepod',
  'security-camera-dome',
  'security-camera-bullet',
  'smart-switch',
])

// ─── Node/edge type registries ─────────────────────────────────────────────────

const nodeTypes = { deviceNode: VilHilDeviceNode }
const edgeTypes = { vilhilEdge: VilHilEdge }

// ─── Scene helpers ─────────────────────────────────────────────────────────────

function toSceneDevice(raw: any): SceneDevice {
  return {
    id: raw.id,
    name: raw.productName || raw.productId || raw.name || raw.id,
    brand: raw.brand || 'Unknown',
    subsystem: raw.subsystem || 'unknown',
    levelId: raw.parentId || null,
    protocol: raw.params?.protocol || 'unknown',
    renderType: raw.renderType || 'unknown',
    mountType: raw.mountType || 'unknown',
  }
}

function inferItemSubsystem(item: any): string {
  const id = `${item?.asset?.id ?? ''}`.toLowerCase()
  const tags = (item?.asset?.tags ?? []).map((t: string) => t.toLowerCase())
  if (id.includes('camera') || tags.includes('security')) return 'security'
  if (id.includes('homepod') || tags.includes('audio') || tags.includes('electronics')) return 'av'
  if (id.includes('switch') || tags.includes('electrical')) return 'panel'
  if (tags.includes('network') || id.includes('router') || id.includes('ap')) return 'network'
  return 'unknown'
}

function inferItemProtocol(item: any): string {
  const id = `${item?.asset?.id ?? ''}`.toLowerCase()
  if (id.includes('homepod')) return 'matter'
  if (id.includes('camera')) return 'wifi'
  if (id.includes('switch')) return 'zigbee'
  return 'unknown'
}

function resolveItemLevelId(node: any, nodes: Record<string, any>): string | null {
  let current: any = node
  let steps = 0
  while (current && steps < 12) {
    if (current.type === 'level') return current.id
    if (!current.parentId) return null
    current = nodes[current.parentId]
    steps += 1
  }
  return null
}

function isSmartItemNode(node: any): boolean {
  if (!node || node.type !== 'item') return false
  const assetId = `${node.asset?.id ?? ''}`
  const tags = (node.asset?.tags ?? []) as string[]
  return SMART_ITEM_IDS.has(assetId) || tags.includes('smarthome')
}

function toSceneDeviceFromItem(raw: any, nodes: Record<string, any>): SceneDevice {
  return {
    id: raw.id,
    name: raw.asset?.name || raw.name || raw.asset?.id || raw.id,
    brand: raw.metadata?.brand || 'Unknown',
    subsystem: inferItemSubsystem(raw),
    levelId: resolveItemLevelId(raw, nodes),
    protocol: inferItemProtocol(raw),
    renderType: raw.asset?.id || raw.type || 'item',
    mountType: raw.asset?.attachTo || 'floor',
  }
}

function smartItemDeviceProfile(item: any) {
  const assetId = `${item?.asset?.id ?? ''}`.toLowerCase()
  if (assetId.includes('homepod'))
    return { subsystem: 'av', protocol: 'matter', renderType: 'homepod', brand: 'Apple' } as const
  if (assetId.includes('camera'))
    return { subsystem: 'security', protocol: 'wifi', renderType: 'camera', brand: 'Generic' } as const
  if (assetId.includes('switch'))
    return { subsystem: 'panel', protocol: 'zigbee', renderType: 'switch_1key', brand: 'Generic' } as const
  return { subsystem: 'network', protocol: 'wifi', renderType: assetId || 'item_smart', brand: 'Generic' } as const
}

// ─── Device Pool Panel ────────────────────────────────────────────────────────

interface DevicePoolPanelProps {
  devices: SceneDevice[]
  placedIds: Set<string>
  query: string
  onQuery: (q: string) => void
  typeFilter: 'all' | TopologyNodeType
  onTypeFilter: (v: 'all' | TopologyNodeType) => void
  onAddDevice: (id: string) => void
  onAddAll: () => void
}

function DevicePoolPanel({
  devices,
  placedIds,
  query,
  onQuery,
  typeFilter,
  onTypeFilter,
  onAddDevice,
  onAddAll,
}: DevicePoolPanelProps) {
  // Group by topology type for quick-filter tabs
  const typeGroups = useMemo(() => {
    const m = new Map<TopologyNodeType, number>()
    for (const d of devices) {
      const t = deriveTopologyType(d)
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    return m
  }, [devices])

  const tierLabels: Record<string, string> = { infra: '基础设施', control: '控制器', device: '终端设备' }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/96 shadow-xl backdrop-blur-md"
      style={{ width: 296, maxHeight: 460 }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-2.5">
        <span className="text-xs font-semibold text-foreground">设备池</span>
        <button
          className="rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
          onClick={onAddAll}
          type="button"
        >
          全部上图
        </button>
      </div>

      {/* Search */}
      <div className="flex shrink-0 gap-1.5 border-b border-border/40 px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/40" />
          <input
            className="h-7 w-full rounded-lg border border-border/50 bg-muted/40 pl-6 pr-2 text-[11px] outline-none focus:border-primary/40"
            onChange={(e) => onQuery(e.target.value)}
            placeholder="搜索设备…"
            value={query}
          />
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="shrink-0 overflow-x-auto px-2 pt-1.5 scrollbar-none">
        <div className="flex gap-1 pb-1">
          <button
            className={cn(
              'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
              typeFilter === 'all' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
            )}
            onClick={() => onTypeFilter('all')}
            type="button"
          >
            全部
          </button>
          {Array.from(typeGroups.entries()).map(([t, count]) => {
            const cfg = NODE_TYPE_CONFIG[t]
            return (
              <button
                key={t}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
                  typeFilter === t ? 'text-white' : 'text-muted-foreground hover:bg-accent',
                )}
                onClick={() => onTypeFilter(t)}
                style={typeFilter === t ? { backgroundColor: cfg.color } : undefined}
                type="button"
              >
                {cfg.label} {count}
              </button>
            )
          })}
        </div>
      </div>

      {/* Device list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {devices.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-muted-foreground/40">没有符合条件的设备</div>
        ) : (
          <div className="space-y-0.5 pt-1">
            {devices.map((d) => {
              const topo = deriveTopologyType(d)
              const cfg = NODE_TYPE_CONFIG[topo]
              const Icon = cfg.icon
              const isPlaced = placedIds.has(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-xs transition-colors',
                    isPlaced ? 'cursor-default opacity-40' : 'hover:bg-accent/60 active:bg-accent',
                  )}
                  onClick={() => !isPlaced && onAddDevice(d.id)}
                  disabled={isPlaced}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${cfg.color}18` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate font-medium text-foreground">{d.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground/60">
                      {d.brand} · {d.protocol}
                    </div>
                  </div>
                  {isPlaced && (
                    <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
                      已上图
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Detail Sidebar ───────────────────────────────────────────────────────────

interface DetailSidebarProps {
  selectedNode: Node<DeviceNodeData> | null
  selectedEdge: Edge<VilHilEdgeData> | null
  deviceById: Map<string, SceneDevice>
  onUpdateEdge: (id: string, patch: Partial<VilHilEdgeData>) => void
  onDeleteEdge: (id: string) => void
  onDeleteNode: (id: string) => void
  onUpdateNodeStatus: (id: string, status: NodeStatus) => void
  onUpdateNodeMeta: (id: string, meta: Partial<Pick<DeviceNodeData, 'ip' | 'hostname' | 'notes' | 'portCount'>>) => void
  onClose: () => void
}

function DetailSidebar({
  selectedNode,
  selectedEdge,
  deviceById,
  onUpdateEdge,
  onDeleteEdge,
  onDeleteNode,
  onUpdateNodeStatus,
  onUpdateNodeMeta,
  onClose,
}: DetailSidebarProps) {
  return (
    <div className="flex h-full w-[272px] shrink-0 flex-col border-l border-border/50 bg-sidebar">
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-2.5">
        <span className="text-xs font-semibold text-foreground">
          {selectedNode ? '节点详情' : '连接详情'}
        </span>
        <button
          className="rounded-lg p-1 text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {selectedNode && (() => {
          const { device, topoType, status, ip, hostname, notes, portCount, controller, assignment, parentName } =
            selectedNode.data
          const cfg = NODE_TYPE_CONFIG[topoType]
          const Icon = cfg.icon
          return (
            <>
              {/* Device card */}
              <div
                className="rounded-xl border border-border/50 p-3"
                style={{ borderLeftWidth: 3, borderLeftColor: cfg.color }}
              >
                <div className="mb-2 flex items-center gap-2.5">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${cfg.color}18` }}
                  >
                    <Icon className="h-[18px] w-[18px]" style={{ color: cfg.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{device.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {device.brand} · <span className="uppercase">{device.protocol}</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <div>类型</div>
                  <div className="font-medium text-foreground text-right">{cfg.label}</div>
                  <div>子系统</div>
                  <div className="font-medium text-foreground text-right capitalize">{device.subsystem}</div>
                  <div>挂装</div>
                  <div className="font-medium text-foreground text-right">{device.mountType}</div>
                </div>
              </div>

              {/* 接入角色 */}
              <div className="rounded-xl border border-border/50 px-3 py-2.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  接入角色
                </div>
                {controller ? (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-400" />
                    <span className="text-xs text-foreground">控制器</span>
                    <span className="ml-auto text-xs font-semibold text-blue-500">
                      {controller.usedChildren}/{controller.maxChildren}
                    </span>
                  </div>
                ) : assignment ? (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-xs text-foreground">子设备</span>
                    <span className="ml-auto text-xs text-muted-foreground">→ {parentName} #{assignment.slotIndex}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="text-xs text-muted-foreground">待接入</span>
                  </div>
                )}
              </div>

              {/* 在线状态 */}
              <div className="rounded-xl border border-border/50 px-3 py-2.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  在线状态
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(['online', 'offline', 'pending', 'unknown'] as NodeStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={cn(
                        'rounded-lg py-1 text-[10px] font-medium transition-colors',
                        status === s ? 'text-white' : 'bg-muted/40 text-muted-foreground hover:bg-muted',
                      )}
                      style={status === s ? { backgroundColor: STATUS_COLOR[s] } : undefined}
                      onClick={() => onUpdateNodeStatus(selectedNode.id, s)}
                    >
                      {s === 'online' ? '在线' : s === 'offline' ? '离线' : s === 'pending' ? '等待' : '未知'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 节点元数据 */}
              <div className="rounded-xl border border-border/50 px-3 py-2.5 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  节点信息
                </div>
                <div className="space-y-1.5">
                  <input
                    className="h-7 w-full rounded-lg border border-border/50 bg-muted/40 px-2 text-[11px] outline-none focus:border-primary/40"
                    placeholder="IP 地址（可选）"
                    value={ip ?? ''}
                    onChange={(e) => onUpdateNodeMeta(selectedNode.id, { ip: e.target.value || undefined })}
                  />
                  <input
                    className="h-7 w-full rounded-lg border border-border/50 bg-muted/40 px-2 text-[11px] outline-none focus:border-primary/40"
                    placeholder="主机名（可选）"
                    value={hostname ?? ''}
                    onChange={(e) => onUpdateNodeMeta(selectedNode.id, { hostname: e.target.value || undefined })}
                  />
                  {(topoType === 'switch' || topoType === 'gateway') && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground shrink-0">端口数</span>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        className="h-7 w-full rounded-lg border border-border/50 bg-muted/40 px-2 text-[11px] outline-none focus:border-primary/40"
                        value={portCount ?? cfg.defaultPortCount}
                        onChange={(e) => onUpdateNodeMeta(selectedNode.id, { portCount: Number(e.target.value) })}
                      />
                    </div>
                  )}
                  <textarea
                    className="h-14 w-full resize-none rounded-lg border border-border/50 bg-muted/40 px-2 py-1.5 text-[11px] outline-none focus:border-primary/40"
                    placeholder="备注（可选）"
                    value={notes ?? ''}
                    onChange={(e) => onUpdateNodeMeta(selectedNode.id, { notes: e.target.value || undefined })}
                  />
                </div>
              </div>

              <button
                className="h-8 w-full rounded-lg border border-red-200/60 bg-red-50/60 text-xs text-red-500 transition-colors hover:bg-red-50 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400"
                onClick={() => onDeleteNode(selectedNode.id)}
                type="button"
              >
                从拓扑图中移除
              </button>
            </>
          )
        })()}

        {selectedEdge && (() => {
          const edgeType = selectedEdge.data?.edgeType ?? 'ethernet'
          const animated = selectedEdge.data?.animated ?? false
          const speed = selectedEdge.data?.speed ?? ''
          const vlanId = selectedEdge.data?.vlanId
          const from = deviceById.get(selectedEdge.source)
          const to = deviceById.get(selectedEdge.target)
          const cfg = EDGE_TYPE_CONFIG[edgeType]

          return (
            <>
              {/* Edge summary */}
              <div className="rounded-xl border border-border/50 px-3 py-2.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <div
                    className="h-1 w-8 rounded-full"
                    style={{
                      background: cfg.color,
                      opacity: 0.8,
                      borderTop: cfg.strokeDasharray ? `2px dashed ${cfg.color}` : `2px solid ${cfg.color}`,
                    }}
                  />
                  <span className="text-xs font-semibold" style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <div><span className="font-medium text-foreground">{from?.name ?? selectedEdge.source}</span></div>
                  <div className="pl-2 text-muted-foreground/50">↓</div>
                  <div><span className="font-medium text-foreground">{to?.name ?? selectedEdge.target}</span></div>
                </div>
              </div>

              {/* Edge type */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  连接类型
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(EDGE_TYPE_CONFIG) as TopologyEdgeType[]).map((et) => {
                    const ec = EDGE_TYPE_CONFIG[et]
                    return (
                      <button
                        key={et}
                        type="button"
                        className={cn(
                          'rounded-lg py-1 text-[10px] font-medium transition-colors border',
                          edgeType === et ? 'text-white border-transparent' : 'border-border/50 text-muted-foreground hover:bg-accent',
                        )}
                        style={edgeType === et ? { backgroundColor: ec.color } : undefined}
                        onClick={() => onUpdateEdge(selectedEdge.id, { edgeType: et })}
                      >
                        {ec.label}
                      </button>
                    )
                  })}
                </div>

                {/* Speed & VLAN */}
                <div className="flex gap-2">
                  <input
                    className="h-7 flex-1 rounded-lg border border-border/50 bg-muted/40 px-2 text-[11px] outline-none focus:border-primary/40"
                    placeholder="速率（1G / 2.4G）"
                    value={speed}
                    onChange={(e) => onUpdateEdge(selectedEdge.id, { speed: e.target.value || undefined })}
                  />
                  {edgeType === 'ethernet' && (
                    <input
                      type="number"
                      min={1}
                      max={4094}
                      className="h-7 w-20 rounded-lg border border-border/50 bg-muted/40 px-2 text-[11px] outline-none focus:border-primary/40"
                      placeholder="VLAN"
                      value={vlanId ?? ''}
                      onChange={(e) =>
                        onUpdateEdge(selectedEdge.id, { vlanId: e.target.value ? Number(e.target.value) : undefined })
                      }
                    />
                  )}
                </div>

                {/* Animation toggle */}
                <button
                  type="button"
                  className={cn(
                    'flex h-8 w-full items-center justify-center gap-2 rounded-lg border text-xs font-medium transition-colors',
                    animated
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/50 text-muted-foreground hover:bg-accent',
                  )}
                  onClick={() => onUpdateEdge(selectedEdge.id, { animated: !animated })}
                >
                  <Zap className="h-3.5 w-3.5" />
                  {animated ? '流动动画 开' : '流动动画 关'}
                </button>

                <button
                  className="h-8 w-full rounded-lg border border-red-200/60 bg-red-50/60 text-xs text-red-500 transition-colors hover:bg-red-50 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400"
                  onClick={() => onDeleteEdge(selectedEdge.id)}
                  type="button"
                >
                  删除此连接
                </button>
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

interface CtxMenuState {
  x: number
  y: number
  type: 'node' | 'edge' | 'pane'
  targetId?: string
}

const CTX_BTN =
  'flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors'
const CTX_DANGER =
  'flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50/60 dark:hover:bg-red-950/30 transition-colors'

function ContextMenuOverlay({
  menu,
  selectedNodeCount,
  onClose,
  onDeleteNode,
  onDeleteEdge,
  onSetStatus,
  onDeleteSelected,
  onAutoLayout,
  onAddAll,
}: {
  menu: CtxMenuState
  selectedNodeCount: number
  onClose: () => void
  onDeleteNode: (id: string) => void
  onDeleteEdge: (id: string) => void
  onSetStatus: (id: string, s: NodeStatus) => void
  onDeleteSelected: () => void
  onAutoLayout: () => void
  onAddAll: () => void
}) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const left = Math.min(menu.x, vw - 172)
  const top = Math.min(menu.y, vh - 240)

  const STATUS_LABELS: Record<NodeStatus, string> = {
    online: '在线', offline: '离线', pending: '等待', unknown: '未知',
  }

  return (
    <>
      {/* 透明遮罩捕获关闭 */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose() }}
      />
      {/* 菜单本体 */}
      <div
        className="fixed z-50 min-w-[152px] overflow-hidden rounded-xl border border-border/60 bg-popover py-1 shadow-xl"
        style={{ left, top }}
      >
        {menu.type === 'node' && menu.targetId && (
          <>
            <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
              状态
            </div>
            {(['online', 'offline', 'pending', 'unknown'] as NodeStatus[]).map((s) => (
              <button
                key={s}
                className={CTX_BTN}
                type="button"
                onClick={() => { onSetStatus(menu.targetId!, s); onClose() }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_COLOR[s] }}
                />
                {STATUS_LABELS[s]}
              </button>
            ))}
            <div className="mx-2 my-1 border-t border-border/40" />
            <button
              className={CTX_DANGER}
              type="button"
              onClick={() => { onDeleteNode(menu.targetId!); onClose() }}
            >
              删除节点
            </button>
          </>
        )}

        {menu.type === 'edge' && menu.targetId && (
          <button
            className={CTX_DANGER}
            type="button"
            onClick={() => { onDeleteEdge(menu.targetId!); onClose() }}
          >
            删除连接
          </button>
        )}

        {menu.type === 'pane' && (
          <>
            <button
              className={CTX_BTN}
              type="button"
              onClick={() => { onAddAll(); onClose() }}
            >
              全部上图
            </button>
            <button
              className={CTX_BTN}
              type="button"
              onClick={() => { onAutoLayout(); onClose() }}
            >
              自动排布
            </button>
          </>
        )}

        {selectedNodeCount > 1 && menu.type !== 'edge' && (
          <>
            <div className="mx-2 my-1 border-t border-border/40" />
            <button
              className={CTX_DANGER}
              type="button"
              onClick={() => { onDeleteSelected(); onClose() }}
            >
              删除已选 {selectedNodeCount} 台
            </button>
          </>
        )}
      </div>
    </>
  )
}

// ─── Inner Canvas ─────────────────────────────────────────────────────────────

function TopologyCanvas() {
  const sceneNodes = useScene((s) => s.nodes)
  const selectedLevelId = useViewer((s) => s.selection.levelId)
  const { fitView } = useReactFlow()

  const [nodes, setNodes] = useState<Node<DeviceNodeData>[]>([])
  const [edges, setEdges] = useState<Edge<VilHilEdgeData>[]>([])

  // Current edge defaults
  const [edgeType, setEdgeType] = useState<TopologyEdgeType>('ethernet')
  const [edgeAnimated, setEdgeAnimated] = useState(false)

  // Pool state
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | TopologyNodeType>('all')
  const [showDevicePool, setShowDevicePool] = useState(false)

  // Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  // Multi-select tracking
  const [multiSelIds, setMultiSelIds] = useState<{ nodeIds: string[]; edgeIds: string[] }>({
    nodeIds: [], edgeIds: [],
  })

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)

  // Topology API
  const [apiTopology, setApiTopology] = useState<ApiTopologyData | null>(null)
  const [apiLoading, setApiLoading] = useState(false)

  // Undo/redo
  const historyRef = useRef<HistoryEntry[]>([])
  const historyIdxRef = useRef(-1)
  const suppressHistory = useRef(false)

  const pushHistory = useCallback(
    (ns: Node<DeviceNodeData>[], es: Edge<VilHilEdgeData>[]) => {
      if (suppressHistory.current) return
      historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1)
      historyRef.current.push({ nodes: ns, edges: es })
      if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
      historyIdxRef.current = historyRef.current.length - 1
    },
    [],
  )

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current--
    const entry = historyRef.current[historyIdxRef.current]
    if (!entry) return
    suppressHistory.current = true
    setNodes(entry.nodes)
    setEdges(entry.edges)
    suppressHistory.current = false
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current++
    const entry = historyRef.current[historyIdxRef.current]
    if (!entry) return
    suppressHistory.current = true
    setNodes(entry.nodes)
    setEdges(entry.edges)
    suppressHistory.current = false
  }, [])

  // ── Derived scene data ──────────────────────────────────────────────────────

  const allDevices = useMemo(() => {
    const values = Object.values(sceneNodes) as any[]
    const sceneNodeMap = sceneNodes as Record<string, any>
    const devices = values.filter((n: any) => n?.type === 'device').map((n: any) => toSceneDevice(n))
    const smartItems = values
      .filter((n: any) => {
        if (!isSmartItemNode(n)) return false
        const linkedDeviceId = `${n?.metadata?.smartDeviceId ?? ''}`
        return !linkedDeviceId || !sceneNodeMap[linkedDeviceId]
      })
      .map((n: any) => toSceneDeviceFromItem(n, sceneNodes))
    return [...devices, ...smartItems]
  }, [sceneNodes])

  const deviceById = useMemo(() => {
    const map = new Map<string, SceneDevice>()
    for (const d of allDevices) map.set(d.id, d)
    return map
  }, [allDevices])

  const levelDevices = useMemo(() => {
    if (!selectedLevelId) return allDevices
    return allDevices.filter((d) => d.levelId === selectedLevelId)
  }, [allDevices, selectedLevelId])

  const visiblePoolDevices = useMemo(() => {
    const q = query.trim().toLowerCase()
    return levelDevices.filter((d) => {
      if (q && !`${d.name} ${d.id}`.toLowerCase().includes(q)) return false
      if (typeFilter !== 'all' && deriveTopologyType(d) !== typeFilter) return false
      return true
    })
  }, [levelDevices, query, typeFilter])

  const assignmentByChildId = useMemo(() => {
    const map = new Map<string, ApiTopologyAssignment>()
    for (const a of apiTopology?.assignments ?? []) map.set(a.childId, a)
    return map
  }, [apiTopology])

  const controllerById = useMemo(() => {
    const map = new Map<string, ApiTopologyController>()
    for (const c of apiTopology?.controllers ?? []) map.set(c.deviceId, c)
    return map
  }, [apiTopology])

  // Enrich nodes with topology metadata
  const enrichedNodes = useMemo(() => {
    return nodes.map((n) => {
      const device = deviceById.get(n.id)
      if (!device) return n
      const controller = controllerById.get(n.id)
      const assignment = assignmentByChildId.get(n.id)
      const parentName = assignment
        ? deviceById.get(assignment.parentId)?.name ?? assignment.parentId
        : undefined
      return {
        ...n,
        data: { ...n.data, device, controller, assignment, parentName },
      }
    })
  }, [nodes, deviceById, controllerById, assignmentByChildId])

  const placedIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])
  const unplacedCount = levelDevices.filter((d) => !placedIds.has(d.id)).length

  const selectedNode = useMemo(
    () => enrichedNodes.find((n) => n.id === selectedNodeId) ?? null,
    [enrichedNodes, selectedNodeId],
  )
  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  )
  const hasSelection = !!(selectedNode || selectedEdge)

  // ── RF event handlers ───────────────────────────────────────────────────────

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev) as Node<DeviceNodeData>[]
        if (changes.some((c) => c.type === 'remove' || c.type === 'position')) {
          pushHistory(next, edges)
        }
        return next
      })
    },
    [edges, pushHistory],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => {
        const next = applyEdgeChanges(changes, prev) as Edge<VilHilEdgeData>[]
        if (changes.some((c) => c.type === 'remove')) pushHistory(nodes, next)
        return next
      })
    },
    [nodes, pushHistory],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      // Auto-detect best edge type from source/target topology types
      const srcNode = nodes.find((n) => n.id === connection.source)
      const tgtNode = nodes.find((n) => n.id === connection.target)
      const autoType =
        srcNode && tgtNode
          ? deriveDefaultEdgeType(
              srcNode.data.topoType,
              tgtNode.data.topoType,
              srcNode.data.device.protocol,
            )
          : edgeType

      const newEdge: Edge<VilHilEdgeData> = {
        ...connection,
        id: `edge_${connection.source}_${connection.target}_${Date.now()}`,
        type: 'vilhilEdge',
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
        data: { edgeType: autoType, animated: edgeAnimated },
        source: connection.source ?? '',
        target: connection.target ?? '',
      }
      setEdges((prev) => {
        const next = addEdge(newEdge, prev) as Edge<VilHilEdgeData>[]
        pushHistory(nodes, next)
        return next
      })
    },
    [edgeType, edgeAnimated, nodes, pushHistory],
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
  }, [])

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id)
    setSelectedNodeId(null)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setCtxMenu(null)
  }, [])

  // ── Selection change（多选追踪）────────────────────────────────────────────

  const onSelectionChange = useCallback(
    ({ nodes: sns, edges: ses }: { nodes: Node[]; edges: Edge[] }) => {
      setMultiSelIds({ nodeIds: sns.map((n) => n.id), edgeIds: ses.map((e) => e.id) })
      if (sns.length === 1 && ses.length === 0) {
        setSelectedNodeId(sns[0]?.id ?? null)
        setSelectedEdgeId(null)
      } else if (ses.length === 1 && sns.length === 0) {
        setSelectedEdgeId(ses[0]?.id ?? null)
        setSelectedNodeId(null)
      } else if (sns.length === 0 && ses.length === 0) {
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
      }
    },
    [],
  )

  // ── Context menus ─────────────────────────────────────────────────────────

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, type: 'node', targetId: node.id })
    setSelectedNodeId(node.id)
  }, [])

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, type: 'edge', targetId: edge.id })
    setSelectedEdgeId(edge.id)
  }, [])

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY, type: 'pane' })
  }, [])

  // ── 全选 ─────────────────────────────────────────────────────────────────

  const selectAll = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: true })))
    setEdges((prev) => prev.map((e) => ({ ...e, selected: true })))
  }, [])

  // ── 批量删除 ───────────────────────────────────────────────────────────────

  const deleteSelectedNodes = useCallback(() => {
    const ids = new Set(multiSelIds.nodeIds)
    if (ids.size === 0) return
    setNodes((prev) => {
      const next = prev.filter((n) => !ids.has(n.id))
      setEdges((prevEdges) => {
        const nextEdges = prevEdges.filter((e) => !ids.has(e.source) && !ids.has(e.target))
        pushHistory(next, nextEdges)
        return nextEdges
      })
      return next
    })
    setMultiSelIds({ nodeIds: [], edgeIds: [] })
    setSelectedNodeId(null)
  }, [multiSelIds.nodeIds, pushHistory])

  // ── 连接校验 ──────────────────────────────────────────────────────────────

  const isValidConnection = useCallback(
    (connection: { source?: string | null; target?: string | null }) => {
      if (!connection.source || !connection.target) return false
      if (connection.source === connection.target) return false
      // 防止重复连线（双向都算重复）
      return !edges.some(
        (e) =>
          (e.source === connection.source && e.target === connection.target) ||
          (e.source === connection.target && e.target === connection.source),
      )
    },
    [edges],
  )

  // ── 边重连 ────────────────────────────────────────────────────────────────

  const onReconnect = useCallback(
    (oldEdge: Edge<VilHilEdgeData>, newConn: Connection) => {
      setEdges((prev) => {
        const next = reconnectEdge(oldEdge, newConn, prev) as Edge<VilHilEdgeData>[]
        pushHistory(nodes, next)
        return next
      })
    },
    [nodes, pushHistory],
  )

  // ── Node actions ────────────────────────────────────────────────────────────

  const makeNode = useCallback(
    (device: SceneDevice, idx: number): Node<DeviceNodeData> => {
      const topoType = deriveTopologyType(device)
      const col = idx % 5
      const row = Math.floor(idx / 5)
      return {
        id: device.id,
        type: 'deviceNode',
        position: { x: 32 + col * (NODE_W + 44), y: 32 + row * (NODE_H + 52) },
        data: {
          device,
          topoType,
          status: 'unknown',
          portCount: NODE_TYPE_CONFIG[topoType].defaultPortCount,
        },
      }
    },
    [],
  )

  const addDevice = useCallback(
    (deviceId: string) => {
      const device = deviceById.get(deviceId)
      if (!device || placedIds.has(deviceId)) return
      setNodes((prev) => {
        const next = [...prev, makeNode(device, prev.length)]
        pushHistory(next, edges)
        return next
      })
    },
    [deviceById, placedIds, edges, pushHistory, makeNode],
  )

  const addAllDevices = useCallback(() => {
    const toAdd = levelDevices.filter((d) => !placedIds.has(d.id))
    if (toAdd.length === 0) return
    setNodes((prev) => {
      const newNodes = toAdd.map((d, i) => makeNode(d, prev.length + i))
      const next = [...prev, ...newNodes]
      pushHistory(next, edges)
      return next
    })
    setShowDevicePool(false)
  }, [levelDevices, placedIds, edges, pushHistory, makeNode])

  const doAutoLayout = useCallback(() => {
    setNodes((prevNodes) => {
      const { nodes: layouted } = getLayoutedElements(prevNodes, edges)
      pushHistory(layouted, edges)
      setTimeout(() => fitView({ padding: 0.12, duration: 400 }), 50)
      return layouted
    })
  }, [edges, fitView, pushHistory])

  const clearAllEdges = useCallback(() => {
    setEdges([])
    setSelectedEdgeId(null)
    pushHistory(nodes, [])
  }, [nodes, pushHistory])

  const clearAll = useCallback(() => {
    setNodes([]); setEdges([])
    setSelectedNodeId(null); setSelectedEdgeId(null)
    pushHistory([], [])
  }, [pushHistory])

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((prev) => {
        const next = prev.filter((n) => n.id !== id)
        setEdges((prevEdges) => {
          const nextEdges = prevEdges.filter((e) => e.source !== id && e.target !== id)
          pushHistory(next, nextEdges)
          return nextEdges
        })
        return next
      })
      setSelectedNodeId((prev) => (prev === id ? null : prev))
    },
    [pushHistory],
  )

  const deleteEdge = useCallback(
    (id: string) => {
      setEdges((prev) => {
        const next = prev.filter((e) => e.id !== id)
        pushHistory(nodes, next)
        return next
      })
      setSelectedEdgeId((prev) => (prev === id ? null : prev))
    },
    [nodes, pushHistory],
  )

  const updateEdge = useCallback(
    (id: string, patch: Partial<VilHilEdgeData>) => {
      setEdges((prev) =>
        prev.map((e) => (e.id === id ? { ...e, data: { ...e.data!, ...patch } } : e)),
      )
    },
    [],
  )

  const updateNodeStatus = useCallback((id: string, status: NodeStatus) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, status } } : n)),
    )
  }, [])

  const updateNodeMeta = useCallback(
    (id: string, meta: Partial<Pick<DeviceNodeData, 'ip' | 'hostname' | 'notes' | 'portCount'>>) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...meta } } : n)),
      )
    },
    [],
  )

  // ── Persistence ─────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TOPOLOGY_DRAFT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { nodes: Node<DeviceNodeData>[]; edges: Edge<VilHilEdgeData>[] }
      if (parsed.nodes) setNodes(parsed.nodes)
      if (parsed.edges) setEdges(parsed.edges)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(TOPOLOGY_DRAFT_KEY, JSON.stringify({ nodes, edges }))
    } catch { /* ignore */ }
  }, [nodes, edges])

  // ── Prune stale nodes ────────────────────────────────────────────────────────

  useEffect(() => {
    const valid = new Set(allDevices.map((d) => d.id))
    setNodes((prev) => {
      const next = prev.filter((n) => valid.has(n.id))
      if (next.length === prev.length) return prev
      setEdges((prevEdges) => prevEdges.filter((e) => valid.has(e.source) && valid.has(e.target)))
      return next
    })
  }, [allDevices])

  // ── Auto-add new level devices ──────────────────────────────────────────────

  useEffect(() => {
    setNodes((prev) => {
      const existing = new Set(prev.map((n) => n.id))
      const toAdd = levelDevices.filter((d) => !existing.has(d.id))
      if (toAdd.length === 0) return prev
      const newNodes = toAdd.map((d, i) => makeNode(d, prev.length + i))
      return [...prev, ...newNodes]
    })
    setTimeout(() => fitView({ padding: 0.12, duration: 300 }), 120)
  }, [levelDevices]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Smart item backfill ──────────────────────────────────────────────────────

  useEffect(() => {
    const state = useScene.getState()
    const stateNodes = state.nodes as Record<string, AnyNode>
    for (const node of Object.values(stateNodes)) {
      if (!isSmartItemNode(node)) continue
      const existingLinkedId = (node.metadata as any)?.smartDeviceId as string | undefined
      if (existingLinkedId && stateNodes[existingLinkedId as AnyNodeId]?.type === 'device') continue
      const profile = smartItemDeviceProfile(node)
      const levelId = resolveLevelId(node as AnyNode, stateNodes)
      if (!levelId) continue
      const linkedId = generateId('device') as string
      const linkedDevice = DeviceNode.parse({
        id: linkedId, parentId: levelId, subsystem: profile.subsystem,
        renderType: profile.renderType, position: (node as any).position ?? [0, 0, 0],
        rotation: (node as any).rotation ?? [0, 0, 0], mountType: 'floor',
        productId: (node as any).asset?.id,
        productName: (node as any).asset?.name ?? (node as any).name, brand: profile.brand,
        params: { protocol: profile.protocol, custom: { source: 'item', sourceItemId: node.id } },
        metadata: { sourceItemId: node.id, generatedBy: 'topology-backfill' },
      })
      state.createNode(linkedDevice, levelId as AnyNodeId)
      state.updateNode(node.id as AnyNodeId, {
        metadata: {
          ...(typeof node.metadata === 'object' && node.metadata
            ? (node.metadata as Record<string, unknown>) : {}),
          smartDeviceId: linkedId,
        },
      })
    }
  }, [sceneNodes])

  // ── API topology ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setApiLoading(true)
      try {
        const res = await fetch('/api/topology/graph', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            devices: allDevices.map((d) => ({
              id: d.id, name: d.name, brand: d.brand, subsystem: d.subsystem,
              levelId: d.levelId, protocol: d.protocol, renderType: d.renderType, mountType: d.mountType,
            })),
            levelId: selectedLevelId ?? null,
          }),
        })
        const payload = (await res.json()) as { ok: boolean; data?: ApiTopologyData }
        if (!cancelled && res.ok && payload.ok && payload.data) setApiTopology(payload.data)
      } catch { /* ignore */ } finally {
        if (!cancelled) setApiLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [allDevices, selectedLevelId])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      const ctrl = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') { setCtxMenu(null); return }
      if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo() }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
      if (ctrl && e.key === 'a') { e.preventDefault(); selectAll() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selectAll])

  // ── Render ───────────────────────────────────────────────────────────────────

  // Edge connection line style based on selected type
  const edgeCfg = EDGE_TYPE_CONFIG[edgeType]

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={enrichedNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onSelectionChange={onSelectionChange}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onEdgeDoubleClick={onEdgeClick}
          isValidConnection={isValidConnection}
          onReconnect={onReconnect}
          edgesReconnectable
          selectionOnDrag
          snapToGrid
          snapGrid={[16, 16]}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: 'vilhilEdge',
            reconnectable: true,
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
          }}
          connectionLineStyle={{
            stroke: edgeCfg.color,
            strokeWidth: edgeCfg.strokeWidth,
            strokeDasharray: edgeCfg.strokeDasharray,
          }}
          deleteKeyCode="Delete"
          selectionKeyCode="Shift"
          multiSelectionKeyCode="Shift"
          className="bg-background"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(10,26,57,0.08)" />

          <Controls
            showInteractive={false}
            className="rounded-xl border border-border/50 bg-background/90 shadow-sm backdrop-blur-sm"
          />

          <MiniMap
            nodeColor={(n) => NODE_TYPE_CONFIG[(n.data as DeviceNodeData)?.topoType ?? 'generic']?.color ?? '#888'}
            className="rounded-xl border border-border/50 bg-background/90 backdrop-blur-sm"
            maskColor="rgba(0,0,0,0.04)"
          />

          {/* Toolbar */}
          <Panel position="top-left" className="m-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
              {/* 当前边类型选择器 */}
              <span className="text-[11px] font-medium text-muted-foreground">连接</span>
              <div className="flex gap-1">
                {(Object.keys(EDGE_TYPE_CONFIG) as TopologyEdgeType[]).map((et) => {
                  const ec = EDGE_TYPE_CONFIG[et]
                  return (
                    <button
                      key={et}
                      type="button"
                      className={cn(
                        'rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors',
                        edgeType === et ? 'text-white' : 'text-muted-foreground hover:bg-accent',
                      )}
                      style={edgeType === et ? { backgroundColor: ec.color } : undefined}
                      onClick={() => setEdgeType(et)}
                      title={ec.label}
                    >
                      {ec.label}
                    </button>
                  )
                })}
              </div>

              {/* 动画开关 */}
              <button
                type="button"
                className={cn(
                  'rounded-lg p-1.5 transition-colors',
                  edgeAnimated ? 'text-primary' : 'text-muted-foreground hover:bg-accent',
                )}
                onClick={() => setEdgeAnimated((v) => !v)}
                title="边流动动画"
              >
                <Zap className="h-3.5 w-3.5" />
              </button>

              <div className="mx-0.5 h-4 w-px bg-border/50" />

              {/* Undo/redo */}
              <button
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent"
                onClick={undo}
                title="撤销 Ctrl+Z"
                type="button"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent"
                onClick={redo}
                title="重做 Ctrl+Y"
                type="button"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>

              <div className="mx-0.5 h-4 w-px bg-border/50" />

              {/* Layout + clear */}
              <button
                className="rounded-lg border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                onClick={doAutoLayout}
                type="button"
              >
                自动排布
              </button>
              <button
                className="rounded-lg border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                onClick={clearAllEdges}
                type="button"
              >
                清空连接
              </button>
              <button
                className="rounded-lg border border-red-200/60 px-2.5 py-1 text-[11px] text-red-400/70 hover:bg-red-50 dark:border-red-800/30 dark:hover:bg-red-950/30"
                onClick={clearAll}
                type="button"
              >
                清空拓扑
              </button>

              {/* Stats */}
              <span className="ml-0.5 text-[11px] text-muted-foreground/50">
                {nodes.length}台 · {edges.length}连
              </span>
            </div>
          </Panel>

          {/* 多选批量操作浮条 */}
          {multiSelIds.nodeIds.length > 1 && (
            <Panel position="top-center" className="m-2">
              <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/92 px-3 py-1.5 shadow-sm backdrop-blur-sm">
                <span className="text-[11px] text-muted-foreground">
                  已选{' '}
                  <strong className="font-semibold text-foreground">{multiSelIds.nodeIds.length}</strong>{' '}
                  台
                </span>
                <div className="h-3.5 w-px bg-border/50" />
                <button
                  className="rounded-lg bg-red-50 px-2.5 py-1 text-[10px] font-medium text-red-500 transition-colors hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50"
                  onClick={deleteSelectedNodes}
                  type="button"
                >
                  批量删除
                </button>
              </div>
            </Panel>
          )}

          {/* API status */}
          <Panel position="top-right" className="m-2">
            <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-background/80 px-2.5 py-1 text-[10px] text-muted-foreground/60 backdrop-blur-sm">
              {apiLoading ? (
                <><RefreshCw className="h-2.5 w-2.5 animate-spin" /><span>计算中</span></>
              ) : (
                <><div className="h-1.5 w-1.5 rounded-full bg-emerald-400" /><span>后端已同步</span></>
              )}
            </div>
          </Panel>

          {/* Device pool */}
          <Panel position="bottom-left" className="m-4">
            {showDevicePool && (
              <div className="mb-2">
                <DevicePoolPanel
                  devices={visiblePoolDevices}
                  placedIds={placedIds}
                  query={query}
                  onQuery={setQuery}
                  typeFilter={typeFilter}
                  onTypeFilter={setTypeFilter}
                  onAddDevice={addDevice}
                  onAddAll={addAllDevices}
                />
              </div>
            )}
            <button
              className={cn(
                'flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-medium shadow-md backdrop-blur-sm transition-all',
                showDevicePool
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/60 bg-background/90 text-foreground hover:border-border',
              )}
              onClick={() => setShowDevicePool((v) => !v)}
              type="button"
            >
              <Package className="h-3.5 w-3.5" />
              设备池
              {unplacedCount > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {unplacedCount}
                </span>
              )}
              {showDevicePool ? <ChevronDown className="h-3 w-3 opacity-60" /> : <ChevronUp className="h-3 w-3 opacity-60" />}
            </button>
          </Panel>

          {/* Empty state */}
          {nodes.length === 0 && (
            <Panel position="top-center" className="pointer-events-none mt-24">
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-border/50 bg-background/60">
                  <Network className="h-7 w-7 text-muted-foreground/30" />
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium text-foreground/60">尚无设备上图</div>
                  <div className="mt-1 text-[11px] text-muted-foreground/40">
                    从设备池添加，或点击"全部上图"
                  </div>
                </div>
                {levelDevices.length > 0 && (
                  <button
                    className="pointer-events-auto rounded-xl bg-primary/10 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/20"
                    onClick={addAllDevices}
                    type="button"
                  >
                    全部上图 ({levelDevices.length} 台)
                  </button>
                )}
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* 右键菜单 */}
        {ctxMenu && (
          <ContextMenuOverlay
            menu={ctxMenu}
            selectedNodeCount={multiSelIds.nodeIds.length}
            onClose={() => setCtxMenu(null)}
            onDeleteNode={deleteNode}
            onDeleteEdge={deleteEdge}
            onSetStatus={updateNodeStatus}
            onDeleteSelected={deleteSelectedNodes}
            onAutoLayout={doAutoLayout}
            onAddAll={addAllDevices}
          />
        )}
      </div>

      {/* Selection sidebar */}
      {hasSelection && (
        <DetailSidebar
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          deviceById={deviceById}
          onUpdateEdge={updateEdge}
          onDeleteEdge={deleteEdge}
          onDeleteNode={deleteNode}
          onUpdateNodeStatus={updateNodeStatus}
          onUpdateNodeMeta={updateNodeMeta}
          onClose={() => { setSelectedNodeId(null); setSelectedEdgeId(null) }}
        />
      )}
    </div>
  )
}

// ─── Public export ─────────────────────────────────────────────────────────────

export function TopologyWorkspace() {
  return (
    <ReactFlowProvider>
      <TopologyCanvas />
    </ReactFlowProvider>
  )
}
