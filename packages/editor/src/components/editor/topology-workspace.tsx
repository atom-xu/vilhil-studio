'use client'

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
  SUBSYSTEM_ORDER,
  getSubsystemColor,
  getSubsystemLabel,
} from '@vilhil/smarthome'
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Cpu,
  GripHorizontal,
  Layers,
  Lightbulb,
  Music,
  Network,
  Package,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Thermometer,
  ToggleLeft,
  Wifi,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import { type LucideIcon, type LucideProps } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────

type LinkMedium = 'wired' | 'wireless'
type NetworkType = 'lan' | 'wan'
type Subsystem = keyof typeof SUBSYSTEM_META

type TopologyNode = { deviceId: string; x: number; y: number }
type TopologyEdge = { id: string; from: string; to: string; medium: LinkMedium; network: NetworkType }
type TopologyDraft = { placed: Record<string, TopologyNode>; edges: TopologyEdge[] }

type SceneDevice = {
  id: string; name: string; brand: string; subsystem: string
  levelId: string | null; protocol: string; renderType: string; mountType: string
}

type ApiTopologyController = {
  deviceId: string; name: string; levelId: string | null; protocol: string
  maxChildren: number; usedChildren: number; availableChildren: number; childIds: string[]
}
type ApiTopologyAssignment = {
  childId: string; parentId: string; slotIndex: number; assignedAt: number; reason: 'auto' | 'manual-lock'
}
type ApiTopologyData = {
  generatedAt: number
  controllers: ApiTopologyController[]
  assignments: ApiTopologyAssignment[]
  unassigned: string[]
}

// ─── Subsystem icons ────────────────────────────────────────────────────────

const SUBSYSTEM_ICONS: Record<string, LucideIcon> = {
  architecture: Building2,
  lighting: Lightbulb,
  panel: ToggleLeft,
  sensor: Radio,
  curtain: Layers,
  hvac: Wind,
  av: Music,
  security: Shield,
  network: Wifi,
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TOPOLOGY_DRAFT_KEY = 'vilhil-topology-editor-v2'
const SMART_ITEM_IDS = new Set(['apple-homepod', 'security-camera-dome', 'security-camera-bullet', 'smart-switch'])
const NODE_W = 160
const NODE_H = 86

// ─── Helpers ───────────────────────────────────────────────────────────────

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
  if (assetId.includes('homepod')) return { subsystem: 'av', protocol: 'matter', renderType: 'homepod', brand: 'Apple' } as const
  if (assetId.includes('camera')) return { subsystem: 'security', protocol: 'wifi', renderType: 'camera', brand: 'Generic' } as const
  if (assetId.includes('switch')) return { subsystem: 'panel', protocol: 'zigbee', renderType: 'switch_1key', brand: 'Generic' } as const
  return { subsystem: 'network', protocol: 'wifi', renderType: assetId || 'item_smart', brand: 'Generic' } as const
}

// ─── DeviceCard ─────────────────────────────────────────────────────────────

interface DeviceCardProps {
  device: SceneDevice
  x: number; y: number
  selected: boolean
  isPendingFrom: boolean
  controller: ApiTopologyController | undefined
  assignment: ApiTopologyAssignment | undefined
  parentName: string | null
  onConnect: () => void
  onPointerDown: (e: React.PointerEvent) => void
  onRemove: () => void
}

function DeviceCard({
  device, x, y, selected, isPendingFrom,
  controller, assignment, parentName,
  onConnect, onPointerDown, onRemove,
}: DeviceCardProps) {
  const color = getSubsystemColor(device.subsystem as Subsystem) ?? '#888'
  const label = getSubsystemLabel(device.subsystem as Subsystem)
  const Icon: LucideIcon = SUBSYSTEM_ICONS[device.subsystem] ?? Cpu

  const statusColor = controller ? '#60a5fa' : assignment ? '#4ade80' : '#fbbf24'
  const statusText = controller
    ? `控制器 ${controller.usedChildren}/${controller.maxChildren}`
    : assignment
    ? `→ ${parentName ?? assignment.parentId}`
    : device.protocol

  const isHighlighted = selected || isPendingFrom

  return (
    <div
      data-topology-card
      className={cn(
        'absolute flex flex-col rounded-xl border bg-card/95 shadow-sm backdrop-blur-sm transition-all duration-150',
        isHighlighted
          ? 'shadow-lg ring-2'
          : 'border-border/50 hover:border-border hover:shadow-md',
      )}
      style={{
        left: x,
        top: y,
        width: NODE_W,
        borderLeftWidth: 3,
        borderLeftColor: color,
        // ring color via CSS variable trick
        ...(isHighlighted ? { '--tw-ring-color': color } as React.CSSProperties : {}),
      }}
    >
      {/* Header row: subsystem pill + actions */}
      <div className="flex items-center justify-between px-2.5 pt-2">
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {label}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            className="cursor-grab rounded p-0.5 text-muted-foreground/30 transition-colors hover:text-muted-foreground"
            onPointerDown={onPointerDown}
            type="button"
          >
            <GripHorizontal className="h-3 w-3" />
          </button>
          <button
            className="rounded p-0.5 text-muted-foreground/30 transition-colors hover:text-red-400"
            onClick={onRemove}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Body: icon + name, click to connect */}
      <button
        className="flex items-start gap-2.5 px-2.5 pb-2.5 pt-1.5 text-left"
        onClick={onConnect}
        type="button"
      >
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">{device.name}</div>
          <div className="truncate text-[10px] text-muted-foreground">{device.brand}</div>
          <div className="mt-1 flex items-center gap-1">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
            <span className="truncate text-[10px] text-muted-foreground/70">{statusText}</span>
          </div>
        </div>
      </button>
    </div>
  )
}

// ─── Edge SVG ──────────────────────────────────────────────────────────────

function EdgeLayer({
  edges,
  placed,
  selectedEdgeId,
  onSelectEdge,
}: {
  edges: TopologyEdge[]
  placed: Record<string, TopologyNode>
  selectedEdgeId: string | null
  onSelectEdge: (id: string) => void
}) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <defs>
        {['wired', 'wireless'].map((m) => (
          <marker
            key={m}
            id={`arrow-${m}`}
            markerHeight="6"
            markerWidth="6"
            orient="auto"
            refX="5"
            refY="3"
          >
            <path
              d="M0,0 L0,6 L6,3 z"
              fill={m === 'wired' ? '#006FFF' : '#10b981'}
              opacity={0.75}
            />
          </marker>
        ))}
      </defs>

      {edges.map((edge) => {
        const fromNode = placed[edge.from]
        const toNode = placed[edge.to]
        if (!fromNode || !toNode) return null

        const x1 = fromNode.x + NODE_W / 2
        const y1 = fromNode.y + NODE_H / 2
        const x2 = toNode.x + NODE_W / 2
        const y2 = toNode.y + NODE_H / 2

        // Quadratic bezier control point: perpendicular offset for curve
        const dx = x2 - x1
        const dy = y2 - y1
        const len = Math.hypot(dx, dy) || 1
        const curveOffset = Math.min(80, len * 0.35)
        const px = (-dy / len) * curveOffset
        const py = (dx / len) * curveOffset
        const cx = (x1 + x2) / 2 + px
        const cy = (y1 + y2) / 2 + py

        const d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`
        const selected = edge.id === selectedEdgeId
        const color = edge.medium === 'wired' ? '#006FFF' : '#10b981'

        return (
          <g key={edge.id}>
            {/* Wide invisible hit target */}
            <path
              className="pointer-events-auto cursor-pointer"
              d={d}
              fill="none"
              onClick={() => onSelectEdge(edge.id)}
              stroke="transparent"
              strokeWidth={14}
            />
            {/* Visible line */}
            <path
              className="pointer-events-none"
              d={d}
              fill="none"
              markerEnd={`url(#arrow-${edge.medium})`}
              opacity={selected ? 1 : 0.55}
              stroke={color}
              strokeDasharray={edge.medium === 'wireless' ? '7 4' : undefined}
              strokeWidth={selected ? 2.5 : 1.5}
            />
            {/* Label */}
            <text
              dominantBaseline="middle"
              fill={color}
              fontSize="9"
              fontWeight={selected ? 700 : 500}
              opacity={selected ? 1 : 0.7}
              textAnchor="middle"
              x={cx}
              y={cy - 9}
            >
              {edge.network.toUpperCase()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── DevicePoolPanel ────────────────────────────────────────────────────────

interface DevicePoolPanelProps {
  devices: SceneDevice[]
  placedIds: Set<string>
  query: string
  onQuery: (q: string) => void
  mediumFilter: 'all' | LinkMedium
  onMediumFilter: (v: 'all' | LinkMedium) => void
  brands: string[]
  brandFilter: 'all' | string
  onBrandFilter: (v: string) => void
  onDragStart: (e: React.DragEvent, deviceId: string) => void
  onAddAll: () => void
}

function DevicePoolPanel({
  devices, placedIds, query, onQuery,
  mediumFilter, onMediumFilter, brands, brandFilter, onBrandFilter,
  onDragStart, onAddAll,
}: DevicePoolPanelProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/96 shadow-xl backdrop-blur-md"
         style={{ width: 296, maxHeight: 440 }}>
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

      {/* Filters */}
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
        <select
          className="h-7 rounded-lg border border-border/50 bg-muted/40 px-1.5 text-[11px] outline-none"
          onChange={(e) => onMediumFilter(e.target.value as 'all' | LinkMedium)}
          value={mediumFilter}
        >
          <option value="all">全部</option>
          <option value="wired">有线</option>
          <option value="wireless">无线</option>
        </select>
      </div>

      {/* Subsystem group tabs */}
      <div className="shrink-0 overflow-x-auto px-2 pt-1.5 scrollbar-none">
        <div className="flex gap-1 pb-1">
          <button
            className={cn(
              'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
              brandFilter === 'all' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
            )}
            onClick={() => onBrandFilter('all')}
            type="button"
          >
            全部品牌
          </button>
          {brands.map((b) => (
            <button
              key={b}
              className={cn(
                'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium whitespace-nowrap transition-colors',
                brandFilter === b ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
              )}
              onClick={() => onBrandFilter(b)}
              type="button"
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Device list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {devices.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-muted-foreground/40">
            没有符合条件的设备
          </div>
        ) : (
          <div className="space-y-0.5 pt-1">
            {devices.map((d) => {
              const color = getSubsystemColor(d.subsystem as Subsystem) ?? '#888'
              const Icon = SUBSYSTEM_ICONS[d.subsystem] ?? Cpu
              const isPlaced = placedIds.has(d.id)
              return (
                <div
                  key={d.id}
                  className={cn(
                    'flex cursor-grab items-center gap-2 rounded-xl px-2 py-1.5 text-xs transition-colors',
                    isPlaced
                      ? 'opacity-40'
                      : 'hover:bg-accent/60 active:bg-accent',
                  )}
                  draggable={!isPlaced}
                  onDragStart={isPlaced ? undefined : (e) => onDragStart(e, d.id)}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${color}18` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">{d.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground/60">{d.brand} · {d.protocol}</div>
                  </div>
                  {isPlaced && (
                    <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">已上图</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SelectionPanel ─────────────────────────────────────────────────────────

interface SelectionPanelProps {
  selectedNode: SceneDevice | null
  selectedEdge: TopologyEdge | null
  deviceById: Map<string, SceneDevice>
  controllerById: Map<string, ApiTopologyController>
  assignmentByChildId: Map<string, ApiTopologyAssignment>
  onRemoveEdge: (id: string) => void
  onUpdateEdge: (id: string, patch: Partial<Pick<TopologyEdge, 'medium' | 'network'>>) => void
  onClose: () => void
}

function SelectionPanel({
  selectedNode, selectedEdge, deviceById,
  controllerById, assignmentByChildId,
  onRemoveEdge, onUpdateEdge, onClose,
}: SelectionPanelProps) {
  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-l border-border/50 bg-sidebar">
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-2.5">
        <span className="text-xs font-semibold text-foreground">
          {selectedNode ? '设备详情' : '连接详情'}
        </span>
        <button
          className="rounded-lg p-1 text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {selectedNode && (() => {
          const color = getSubsystemColor(selectedNode.subsystem as Subsystem) ?? '#888'
          const Icon = SUBSYSTEM_ICONS[selectedNode.subsystem] ?? Cpu
          const ctrl = controllerById.get(selectedNode.id)
          const assign = assignmentByChildId.get(selectedNode.id)
          const parentName = assign ? deviceById.get(assign.parentId)?.name ?? assign.parentId : null

          return (
            <div className="space-y-3">
              {/* Device card */}
              <div className="rounded-xl border border-border/50 p-3" style={{ borderLeftWidth: 3, borderLeftColor: color }}>
                <div className="mb-2 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                       style={{ backgroundColor: `${color}18` }}>
                    <Icon className="h-4.5 w-4.5" style={{ color }} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{selectedNode.name}</div>
                    <div className="text-[11px] text-muted-foreground">{selectedNode.brand}</div>
                  </div>
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <div className="flex justify-between">
                    <span>子系统</span>
                    <span className="font-medium text-foreground">{getSubsystemLabel(selectedNode.subsystem as Subsystem)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>协议</span>
                    <span className="font-medium text-foreground">{selectedNode.protocol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>挂装</span>
                    <span className="font-medium text-foreground">{selectedNode.mountType}</span>
                  </div>
                </div>
              </div>

              {/* Role */}
              <div className="rounded-xl border border-border/50 px-3 py-2.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  接入角色
                </div>
                {ctrl ? (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-400" />
                    <span className="text-xs text-foreground">控制器</span>
                    <span className="ml-auto text-xs font-semibold text-blue-500">{ctrl.usedChildren}/{ctrl.maxChildren}</span>
                  </div>
                ) : assign ? (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-xs text-foreground">子设备</span>
                    <span className="ml-auto text-xs text-muted-foreground">→ {parentName} #{assign.slotIndex}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="text-xs text-muted-foreground">待接入</span>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {selectedEdge && (() => {
          const from = deviceById.get(selectedEdge.from)
          const to = deviceById.get(selectedEdge.to)
          const edgeColor = selectedEdge.medium === 'wired' ? '#006FFF' : '#10b981'

          return (
            <div className="space-y-3">
              {/* Edge info */}
              <div className="rounded-xl border border-border/50 px-3 py-2.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <div className="h-2 w-8 rounded-full" style={{ backgroundColor: `${edgeColor}40` }}>
                    <div className="h-full w-full rounded-full" style={{ backgroundColor: edgeColor, opacity: 0.8 }} />
                  </div>
                  <span className="text-xs font-medium" style={{ color: edgeColor }}>
                    {selectedEdge.medium === 'wired' ? '有线' : '无线'} · {selectedEdge.network.toUpperCase()}
                  </span>
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <div><span className="font-medium text-foreground">{from?.name ?? selectedEdge.from}</span></div>
                  <div className="pl-2 text-muted-foreground/50">↓</div>
                  <div><span className="font-medium text-foreground">{to?.name ?? selectedEdge.to}</span></div>
                </div>
              </div>

              {/* Edit */}
              <div className="space-y-2">
                <select
                  className="h-8 w-full rounded-lg border border-border/50 bg-background px-2.5 text-xs outline-none focus:border-primary/40"
                  onChange={(e) => onUpdateEdge(selectedEdge.id, { medium: e.target.value as LinkMedium })}
                  value={selectedEdge.medium}
                >
                  <option value="wired">有线</option>
                  <option value="wireless">无线</option>
                </select>
                <select
                  className="h-8 w-full rounded-lg border border-border/50 bg-background px-2.5 text-xs outline-none focus:border-primary/40"
                  onChange={(e) => onUpdateEdge(selectedEdge.id, { network: e.target.value as NetworkType })}
                  value={selectedEdge.network}
                >
                  <option value="lan">LAN</option>
                  <option value="wan">WAN</option>
                </select>
                <button
                  className="h-8 w-full rounded-lg border border-red-200/60 bg-red-50/60 text-xs text-red-500 transition-colors hover:bg-red-50 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400"
                  onClick={() => onRemoveEdge(selectedEdge.id)}
                  type="button"
                >
                  删除此连接
                </button>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── TopologyWorkspace ──────────────────────────────────────────────────────

export function TopologyWorkspace() {
  const sceneNodes = useScene((s) => s.nodes)
  const selectedLevelId = useViewer((s) => s.selection.levelId)

  const [placed, setPlaced] = useState<Record<string, TopologyNode>>({})
  const [edges, setEdges] = useState<TopologyEdge[]>([])

  const [query, setQuery] = useState('')
  const [mediumFilter, setMediumFilter] = useState<'all' | LinkMedium>('all')
  const [brandFilter, setBrandFilter] = useState<'all' | string>('all')
  const [protocolFilter] = useState<'all' | string>('all')

  const [linkMedium, setLinkMedium] = useState<LinkMedium>('wired')
  const [networkType, setNetworkType] = useState<NetworkType>('lan')

  const [edgeMediumFilter] = useState<'all' | LinkMedium>('all')
  const [edgeNetworkFilter] = useState<'all' | NetworkType>('all')

  const [pendingFrom, setPendingFrom] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [apiTopology, setApiTopology] = useState<ApiTopologyData | null>(null)
  const [apiLoading, setApiLoading] = useState(false)
  const [showDevicePool, setShowDevicePool] = useState(false)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ deviceId: string; offsetX: number; offsetY: number } | null>(null)

  // ── Derived data ───────────────────────────────────────────────────────

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

  const levelDeviceIdSet = useMemo(() => new Set(levelDevices.map((d) => d.id)), [levelDevices])

  const brands = useMemo(() => Array.from(new Set(levelDevices.map((d) => d.brand))).sort(), [levelDevices])

  const visibleDevices = useMemo(() => {
    const q = query.trim().toLowerCase()
    return levelDevices.filter((d) => {
      if (q && !`${d.name} ${d.id}`.toLowerCase().includes(q)) return false
      if (brandFilter !== 'all' && d.brand !== brandFilter) return false
      if (protocolFilter !== 'all' && d.protocol !== protocolFilter) return false
      if (mediumFilter === 'wired') return ['network', 'architecture', 'av', 'security'].includes(d.subsystem)
      if (mediumFilter === 'wireless') return ['sensor', 'lighting', 'panel', 'curtain', 'hvac'].includes(d.subsystem)
      return true
    })
  }, [levelDevices, query, brandFilter, protocolFilter, mediumFilter])

  const placedIds = useMemo(() => new Set(Object.keys(placed)), [placed])

  const filteredEdges = useMemo(() => {
    return edges.filter((e) => {
      if (!levelDeviceIdSet.has(e.from) || !levelDeviceIdSet.has(e.to)) return false
      if (edgeMediumFilter !== 'all' && e.medium !== edgeMediumFilter) return false
      if (edgeNetworkFilter !== 'all' && e.network !== edgeNetworkFilter) return false
      return true
    })
  }, [edges, levelDeviceIdSet, edgeMediumFilter, edgeNetworkFilter])

  const selectedNode = selectedNodeId ? deviceById.get(selectedNodeId) ?? null : null
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) ?? null : null

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

  const placedCountOnLevel = Object.keys(placed).filter((id) => levelDeviceIdSet.has(id)).length
  const unplacedCount = levelDevices.filter((d) => !placedIds.has(d.id)).length

  const hasSelection = !!(selectedNode || selectedEdge)

  // ── Actions ────────────────────────────────────────────────────────────

  const addToCanvas = (deviceId: string, x = 80, y = 80) => {
    setPlaced((prev) => {
      if (prev[deviceId]) return prev
      return { ...prev, [deviceId]: { deviceId, x, y } }
    })
  }

  const addFilteredToCanvas = () => {
    setPlaced((prev) => {
      const next = { ...prev }
      let index = 0
      for (const d of visibleDevices) {
        if (next[d.id]) continue
        const col = index % 5
        const row = Math.floor(index / 5)
        next[d.id] = { deviceId: d.id, x: 32 + col * (NODE_W + 32), y: 32 + row * (NODE_H + 40) }
        index++
      }
      return next
    })
    setShowDevicePool(false)
  }

  const autoLayout = () => {
    setPlaced((prev) => {
      const ids = Object.keys(prev).filter((id) => levelDeviceIdSet.has(id))
      const next = { ...prev }
      ids.forEach((id, i) => {
        const col = i % 5
        const row = Math.floor(i / 5)
        next[id] = { deviceId: id, x: 32 + col * (NODE_W + 32), y: 32 + row * (NODE_H + 40) }
      })
      return next
    })
  }

  const removeFromCanvas = (deviceId: string) => {
    setPlaced((prev) => { const next = { ...prev }; delete next[deviceId]; return next })
    setEdges((prev) => prev.filter((e) => e.from !== deviceId && e.to !== deviceId))
    setPendingFrom((prev) => (prev === deviceId ? null : prev))
    setSelectedNodeId((prev) => (prev === deviceId ? null : prev))
  }

  const removeEdge = (edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId))
    setSelectedEdgeId((prev) => (prev === edgeId ? null : prev))
  }

  const updateEdge = (edgeId: string, patch: Partial<Pick<TopologyEdge, 'medium' | 'network'>>) => {
    setEdges((prev) => prev.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)))
  }

  const connectNode = (deviceId: string) => {
    setSelectedNodeId(deviceId)
    setSelectedEdgeId(null)
    if (!pendingFrom) { setPendingFrom(deviceId); return }
    if (pendingFrom === deviceId) { setPendingFrom(null); return }
    const exists = edges.some(
      (e) => (e.from === pendingFrom && e.to === deviceId) || (e.from === deviceId && e.to === pendingFrom),
    )
    if (!exists) {
      const id = `edge_${pendingFrom}_${deviceId}_${Date.now()}`
      setEdges((prev) => [...prev, { id, from: pendingFrom, to: deviceId, medium: linkMedium, network: networkType }])
      setSelectedEdgeId(id)
    }
    setPendingFrom(null)
  }

  const clearTopology = () => {
    setPlaced({}); setEdges([]); setPendingFrom(null); setSelectedNodeId(null); setSelectedEdgeId(null)
  }
  const clearEdges = () => {
    setEdges([]); setPendingFrom(null); setSelectedEdgeId(null)
  }

  const onDropDevice = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const deviceId = event.dataTransfer.getData('text/topology-device')
    if (!deviceId) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(12, Math.min(rect.width - NODE_W - 12, event.clientX - rect.left - NODE_W / 2))
    const y = Math.max(12, Math.min(rect.height - NODE_H - 12, event.clientY - rect.top - NODE_H / 2))
    addToCanvas(deviceId, x, y)
  }

  const closeSelection = () => { setSelectedNodeId(null); setSelectedEdgeId(null) }

  // ── Persistence ────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TOPOLOGY_DRAFT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as TopologyDraft
      setPlaced(parsed.placed ?? {}); setEdges(parsed.edges ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(TOPOLOGY_DRAFT_KEY, JSON.stringify({ placed, edges }))
    } catch { /* ignore */ }
  }, [placed, edges])

  // Prune stale nodes when scene changes
  useEffect(() => {
    const valid = new Set(allDevices.map((d) => d.id))
    setPlaced((prev) => {
      let changed = false
      const next: Record<string, TopologyNode> = {}
      for (const [id, node] of Object.entries(prev)) {
        if (!valid.has(id)) { changed = true; continue }
        next[id] = node
      }
      return changed ? next : prev
    })
    setEdges((prev) => prev.filter((e) => valid.has(e.from) && valid.has(e.to)))
  }, [allDevices])

  // Auto-add newly placed devices to canvas
  useEffect(() => {
    setPlaced((prev) => {
      const next = { ...prev }
      let index = Object.keys(next).length
      let changed = false
      for (const device of levelDevices) {
        if (next[device.id]) continue
        const col = index % 5
        const row = Math.floor(index / 5)
        next[device.id] = { deviceId: device.id, x: 32 + col * (NODE_W + 32), y: 32 + row * (NODE_H + 40) }
        index++; changed = true
      }
      return changed ? next : prev
    })
  }, [levelDevices])

  // Smart item backfill
  useEffect(() => {
    const state = useScene.getState()
    const nodes = state.nodes as Record<string, AnyNode>
    for (const node of Object.values(nodes)) {
      if (!isSmartItemNode(node)) continue
      const existingLinkedId = (node.metadata as any)?.smartDeviceId as string | undefined
      if (existingLinkedId && nodes[existingLinkedId as AnyNodeId]?.type === 'device') continue
      const profile = smartItemDeviceProfile(node)
      const levelId = resolveLevelId(node as AnyNode, nodes)
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
          ...(typeof node.metadata === 'object' && node.metadata ? (node.metadata as Record<string, unknown>) : {}),
          smartDeviceId: linkedId,
        },
      })
    }
  }, [sceneNodes])

  // Auto-topology API
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
        const payload = (await res.json()) as { ok: boolean; data?: ApiTopologyData; error?: string }
        if (cancelled) return
        if (res.ok && payload.ok && payload.data) setApiTopology(payload.data)
      } catch { /* ignore */ } finally {
        if (!cancelled) setApiLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [allDevices, selectedLevelId])

  // Canvas drag (move node)
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!drag || !rect) return
      const x = Math.max(12, Math.min(rect.width - NODE_W - 12, e.clientX - rect.left - drag.offsetX))
      const y = Math.max(12, Math.min(rect.height - NODE_H - 12, e.clientY - rect.top - drag.offsetY))
      setPlaced((prev) => {
        const target = prev[drag.deviceId]
        if (!target) return prev
        return { ...prev, [drag.deviceId]: { ...target, x, y } }
      })
    }
    const onPointerUp = () => { dragRef.current = null }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      {/* ── Main area ── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Toolbar */}
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 px-4 backdrop-blur-sm">
          {/* Connection mode */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-medium text-muted-foreground">连接器</span>
            <select
              className="h-7 cursor-pointer rounded-lg border border-border/50 bg-background px-2 text-xs outline-none hover:border-border focus:border-primary/40"
              onChange={(e) => setLinkMedium(e.target.value as LinkMedium)}
              value={linkMedium}
            >
              <option value="wired">有线</option>
              <option value="wireless">无线</option>
            </select>
            <select
              className="h-7 cursor-pointer rounded-lg border border-border/50 bg-background px-2 text-xs outline-none hover:border-border focus:border-primary/40"
              onChange={(e) => setNetworkType(e.target.value as NetworkType)}
              value={networkType}
            >
              <option value="lan">LAN</option>
              <option value="wan">WAN</option>
            </select>
          </div>

          {/* Pending connection hint */}
          {pendingFrom && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
              </span>
              已选起点 · {deviceById.get(pendingFrom)?.name ?? pendingFrom} · 再点一个设备创建连接
            </div>
          )}

          {/* Stats + actions (right side) */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/60">
              {placedCountOnLevel} 台 · {filteredEdges.length} 连接
            </span>
            <button
              className="rounded-lg border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={autoLayout}
              type="button"
            >
              自动排布
            </button>
            <button
              className="rounded-lg border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={clearEdges}
              type="button"
            >
              清空连接
            </button>
            <button
              className="rounded-lg border border-red-200/60 px-2.5 py-1 text-[11px] text-red-400/70 transition-colors hover:bg-red-50 hover:text-red-500 dark:border-red-800/30 dark:hover:bg-red-950/30"
              onClick={clearTopology}
              type="button"
            >
              清空拓扑
            </button>
          </div>
        </div>

        {/* Canvas + selection panel row */}
        <div className="relative flex min-h-0 flex-1">
          {/* Canvas */}
          <div
            ref={canvasRef}
            className="relative min-h-0 flex-1 overflow-hidden"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropDevice}
            style={{
              backgroundImage: `
                radial-gradient(circle at 50% 0%, rgba(0,111,255,0.05) 0%, transparent 60%),
                radial-gradient(circle_at_1px_1px, rgba(10,26,57,0.08) 1px, transparent 0)`,
              backgroundSize: '100% 100%, 24px 24px',
            }}
            onClick={(e) => {
              // Deselect when clicking canvas background
              const target = e.target as HTMLElement
              if (target === canvasRef.current) closeSelection()
            }}
          >
            {/* SVG edges */}
            <EdgeLayer
              edges={filteredEdges}
              onSelectEdge={(id) => { setSelectedEdgeId(id); setSelectedNodeId(null) }}
              placed={placed}
              selectedEdgeId={selectedEdgeId}
            />

            {/* Device nodes */}
            {Object.values(placed).map((item) => {
              if (!levelDeviceIdSet.has(item.deviceId)) return null
              const device = deviceById.get(item.deviceId)
              if (!device) return null
              return (
                <DeviceCard
                  key={item.deviceId}
                  assignment={assignmentByChildId.get(item.deviceId)}
                  controller={controllerById.get(item.deviceId)}
                  device={device}
                  isPendingFrom={pendingFrom === item.deviceId}
                  onConnect={() => connectNode(item.deviceId)}
                  onPointerDown={(e) => {
                    const cardEl = (e.currentTarget.closest('[data-topology-card]') as HTMLDivElement | null)
                    const rect = cardEl?.getBoundingClientRect()
                    if (!rect) return
                    dragRef.current = {
                      deviceId: item.deviceId,
                      offsetX: e.clientX - rect.left,
                      offsetY: e.clientY - rect.top,
                    }
                  }}
                  onRemove={() => removeFromCanvas(item.deviceId)}
                  parentName={
                    assignmentByChildId.get(item.deviceId)
                      ? deviceById.get(assignmentByChildId.get(item.deviceId)!.parentId)?.name ?? null
                      : null
                  }
                  selected={selectedNodeId === item.deviceId}
                  x={item.x}
                  y={item.y}
                />
              )
            })}

            {/* Empty state */}
            {placedCountOnLevel === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-border/50 bg-background/60">
                  <Network className="h-7 w-7 text-muted-foreground/30" />
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium text-foreground/60">尚无设备上图</div>
                  <div className="mt-1 text-[11px] text-muted-foreground/40">
                    从下方设备池拖拽设备到画布，或点击"全部上图"
                  </div>
                </div>
                {levelDevices.length > 0 && (
                  <button
                    className="rounded-xl bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    onClick={addFilteredToCanvas}
                    type="button"
                  >
                    全部上图 ({levelDevices.length} 台)
                  </button>
                )}
              </div>
            )}

            {/* API status pill (top-right of canvas) */}
            <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-border/40 bg-background/80 px-2.5 py-1 text-[10px] text-muted-foreground/60 backdrop-blur-sm">
              {apiLoading ? (
                <>
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                  <span>计算中</span>
                </>
              ) : (
                <>
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>后端已同步</span>
                </>
              )}
            </div>

            {/* Device pool toggle button (bottom-left of canvas) */}
            <div className="absolute bottom-4 left-4 z-10">
              {showDevicePool && (
                <div className="mb-2">
                  <DevicePoolPanel
                    brandFilter={brandFilter}
                    brands={brands}
                    devices={visibleDevices}
                    mediumFilter={mediumFilter}
                    onAddAll={addFilteredToCanvas}
                    onBrandFilter={setBrandFilter}
                    onDragStart={(e, id) => e.dataTransfer.setData('text/topology-device', id)}
                    onMediumFilter={setMediumFilter}
                    onQuery={setQuery}
                    placedIds={placedIds}
                    query={query}
                  />
                </div>
              )}
              <button
                className={cn(
                  'flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-medium shadow-md backdrop-blur-sm transition-all',
                  showDevicePool
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/60 bg-background/90 text-foreground hover:border-border hover:bg-background',
                )}
                onClick={() => setShowDevicePool((v) => !v)}
                type="button"
              >
                <Package className="h-3.5 w-3.5" />
                设备池
                {unplacedCount > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-semibold text-primary">
                    {unplacedCount}
                  </span>
                )}
                {showDevicePool
                  ? <ChevronDown className="h-3 w-3 opacity-60" />
                  : <ChevronUp className="h-3 w-3 opacity-60" />}
              </button>
            </div>
          </div>

          {/* Selection detail panel (slides in from right) */}
          {hasSelection && (
            <SelectionPanel
              assignmentByChildId={assignmentByChildId}
              controllerById={controllerById}
              deviceById={deviceById}
              onClose={closeSelection}
              onRemoveEdge={removeEdge}
              onUpdateEdge={updateEdge}
              selectedEdge={selectedEdge}
              selectedNode={selectedNode}
            />
          )}
        </div>
      </div>
    </div>
  )
}
