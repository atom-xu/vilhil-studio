'use client'

import { type AnyNode, type AnyNodeId, DeviceNode, generateId, resolveLevelId, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useMemo, useRef, useState } from 'react'

type LinkMedium = 'wired' | 'wireless'
type NetworkType = 'lan' | 'wan'

type TopologyNode = {
  deviceId: string
  x: number
  y: number
}

type TopologyEdge = {
  id: string
  from: string
  to: string
  medium: LinkMedium
  network: NetworkType
}

type TopologyDraft = {
  placed: Record<string, TopologyNode>
  edges: TopologyEdge[]
}

type SceneDevice = {
  id: string
  name: string
  brand: string
  subsystem: string
  levelId: string | null
  protocol: string
  renderType: string
  mountType: string
}

type ApiTopologyController = {
  deviceId: string
  name: string
  levelId: string | null
  protocol: string
  maxChildren: number
  usedChildren: number
  availableChildren: number
  childIds: string[]
}

type ApiTopologyAssignment = {
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

const TOPOLOGY_DRAFT_KEY = 'vilhil-topology-editor-v2'
const SMART_ITEM_IDS = new Set([
  'apple-homepod',
  'security-camera-dome',
  'security-camera-bullet',
  'smart-switch',
])

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
  const tags = (item?.asset?.tags ?? []).map((tag: string) => tag.toLowerCase())
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
  if (assetId.includes('homepod')) {
    return { subsystem: 'av', protocol: 'matter', renderType: 'homepod', brand: 'Apple' } as const
  }
  if (assetId.includes('camera')) {
    return { subsystem: 'security', protocol: 'wifi', renderType: 'camera', brand: 'Generic' } as const
  }
  if (assetId.includes('switch')) {
    return { subsystem: 'panel', protocol: 'zigbee', renderType: 'switch_1key', brand: 'Generic' } as const
  }
  return { subsystem: 'network', protocol: 'wifi', renderType: assetId || 'item_smart', brand: 'Generic' } as const
}

function usageLabel(count: number, total: number) {
  if (total <= 0) return `${count}`
  return `${count}/${total}`
}

export function TopologyWorkspace() {
  const sceneNodes = useScene((s) => s.nodes)
  const selectedLevelId = useViewer((s) => s.selection.levelId)

  const [placed, setPlaced] = useState<Record<string, TopologyNode>>({})
  const [edges, setEdges] = useState<TopologyEdge[]>([])

  const [query, setQuery] = useState('')
  const [mediumFilter, setMediumFilter] = useState<'all' | LinkMedium>('all')
  const [brandFilter, setBrandFilter] = useState<'all' | string>('all')
  const [protocolFilter, setProtocolFilter] = useState<'all' | string>('all')

  const [linkMedium, setLinkMedium] = useState<LinkMedium>('wired')
  const [networkType, setNetworkType] = useState<NetworkType>('lan')

  const [edgeMediumFilter, setEdgeMediumFilter] = useState<'all' | LinkMedium>('all')
  const [edgeNetworkFilter, setEdgeNetworkFilter] = useState<'all' | NetworkType>('all')

  const [pendingFrom, setPendingFrom] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [apiTopology, setApiTopology] = useState<ApiTopologyData | null>(null)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ deviceId: string; offsetX: number; offsetY: number } | null>(null)

  const allDevices = useMemo(() => {
    const values = Object.values(sceneNodes) as any[]
    const sceneNodeMap = sceneNodes as Record<string, any>
    const devices = values
      .filter((n: any) => n?.type === 'device')
      .map((n: any) => toSceneDevice(n))
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
  const protocols = useMemo(() => Array.from(new Set(levelDevices.map((d) => d.protocol))).sort(), [levelDevices])

  const visibleDevices = useMemo(() => {
    const q = query.trim().toLowerCase()
    return levelDevices.filter((d) => {
      if (q && !`${d.name} ${d.id}`.toLowerCase().includes(q)) return false
      if (brandFilter !== 'all' && d.brand !== brandFilter) return false
      if (protocolFilter !== 'all' && d.protocol !== protocolFilter) return false

      if (mediumFilter === 'wired') {
        return ['network', 'architecture', 'av', 'security'].includes(d.subsystem)
      }
      if (mediumFilter === 'wireless') {
        return ['sensor', 'lighting', 'panel', 'curtain', 'hvac'].includes(d.subsystem)
      }

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

  const selectedNode = selectedNodeId ? deviceById.get(selectedNodeId) : null
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) ?? null : null
  const assignmentByChildId = useMemo(() => {
    const map = new Map<string, ApiTopologyAssignment>()
    for (const assignment of apiTopology?.assignments ?? []) {
      map.set(assignment.childId, assignment)
    }
    return map
  }, [apiTopology])

  const controllerById = useMemo(() => {
    const map = new Map<string, ApiTopologyController>()
    for (const controller of apiTopology?.controllers ?? []) {
      map.set(controller.deviceId, controller)
    }
    return map
  }, [apiTopology])

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
        const col = index % 6
        const row = Math.floor(index / 6)
        next[d.id] = {
          deviceId: d.id,
          x: 24 + col * 168,
          y: 24 + row * 86,
        }
        index += 1
      }
      return next
    })
  }

  const autoLayout = () => {
    setPlaced((prev) => {
      const ids = Object.keys(prev).filter((id) => levelDeviceIdSet.has(id))
      const next = { ...prev }
      ids.forEach((id, i) => {
        const col = i % 6
        const row = Math.floor(i / 6)
        next[id] = { deviceId: id, x: 24 + col * 168, y: 24 + row * 86 }
      })
      return next
    })
  }

  const removeFromCanvas = (deviceId: string) => {
    setPlaced((prev) => {
      const next = { ...prev }
      delete next[deviceId]
      return next
    })
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

  const onDropDevice = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const deviceId = event.dataTransfer.getData('text/topology-device')
    if (!deviceId) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = Math.max(12, Math.min(rect.width - 152, event.clientX - rect.left - 72))
    const y = Math.max(12, Math.min(rect.height - 64, event.clientY - rect.top - 28))
    addToCanvas(deviceId, x, y)
  }

  const connectNode = (deviceId: string) => {
    setSelectedNodeId(deviceId)
    setSelectedEdgeId(null)

    if (!pendingFrom) {
      setPendingFrom(deviceId)
      return
    }
    if (pendingFrom === deviceId) {
      setPendingFrom(null)
      return
    }

    const exists = edges.some(
      (e) => (e.from === pendingFrom && e.to === deviceId) || (e.from === deviceId && e.to === pendingFrom),
    )

    if (!exists) {
      const id = `edge_${pendingFrom}_${deviceId}_${Date.now()}`
      setEdges((prev) => [
        ...prev,
        { id, from: pendingFrom, to: deviceId, medium: linkMedium, network: networkType },
      ])
      setSelectedEdgeId(id)
    }

    setPendingFrom(null)
  }

  const clearTopology = () => {
    setPlaced({})
    setEdges([])
    setPendingFrom(null)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }

  const clearEdges = () => {
    setEdges([])
    setPendingFrom(null)
    setSelectedEdgeId(null)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(TOPOLOGY_DRAFT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as TopologyDraft
      setPlaced(parsed.placed ?? {})
      setEdges(parsed.edges ?? [])
    } catch {
      // ignore broken draft
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const payload: TopologyDraft = { placed, edges }
      window.localStorage.setItem(TOPOLOGY_DRAFT_KEY, JSON.stringify(payload))
    } catch {
      // ignore storage failure
    }
  }, [placed, edges])

  useEffect(() => {
    // scene devices changed: prune stale nodes/edges
    const valid = new Set(allDevices.map((d) => d.id))

    setPlaced((prev) => {
      let changed = false
      const next: Record<string, TopologyNode> = {}
      for (const [id, node] of Object.entries(prev)) {
        if (!valid.has(id)) {
          changed = true
          continue
        }
        next[id] = node
      }
      return changed ? next : prev
    })

    setEdges((prev) => prev.filter((e) => valid.has(e.from) && valid.has(e.to)))
  }, [allDevices])

  useEffect(() => {
    // Backfill: smart items placed before the bridge rule should get a linked device node.
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
        id: linkedId,
        parentId: levelId,
        subsystem: profile.subsystem,
        renderType: profile.renderType,
        position: (node as any).position ?? [0, 0, 0],
        rotation: (node as any).rotation ?? [0, 0, 0],
        mountType: 'floor',
        productId: (node as any).asset?.id,
        productName: (node as any).asset?.name ?? (node as any).name,
        brand: profile.brand,
        params: {
          protocol: profile.protocol,
          custom: { source: 'item', sourceItemId: node.id },
        },
        metadata: {
          sourceItemId: node.id,
          generatedBy: 'topology-backfill',
        },
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

  useEffect(() => {
    // Auto-add new level devices to canvas so newly placed devices are visible immediately.
    setPlaced((prev) => {
      const next = { ...prev }
      let index = Object.keys(next).length
      let changed = false
      for (const device of levelDevices) {
        if (next[device.id]) continue
        const col = index % 6
        const row = Math.floor(index / 6)
        next[device.id] = {
          deviceId: device.id,
          x: 24 + col * 168,
          y: 24 + row * 86,
        }
        index += 1
        changed = true
      }
      return changed ? next : prev
    })
  }, [levelDevices])

  useEffect(() => {
    let cancelled = false

    const loadTopology = async () => {
      setApiLoading(true)
      setApiError(null)

      try {
        const response = await fetch('/api/topology/graph', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            devices: allDevices.map((device) => ({
              id: device.id,
              name: device.name,
              brand: device.brand,
              subsystem: device.subsystem,
              levelId: device.levelId,
              protocol: device.protocol,
              renderType: device.renderType,
              mountType: device.mountType,
            })),
            levelId: selectedLevelId ?? null,
          }),
        })

        const payload = (await response.json()) as { ok: boolean; data?: ApiTopologyData; error?: string }
        if (cancelled) return
        if (!response.ok || !payload.ok || !payload.data) {
          setApiError(payload.error ?? '拓扑接口返回异常')
          setApiTopology(null)
          return
        }
        setApiTopology(payload.data)
      } catch (error) {
        if (cancelled) return
        setApiError(error instanceof Error ? error.message : '网络错误')
        setApiTopology(null)
      } finally {
        if (!cancelled) setApiLoading(false)
      }
    }

    loadTopology()

    return () => {
      cancelled = true
    }
  }, [allDevices, selectedLevelId])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!drag || !rect) return

      const x = Math.max(12, Math.min(rect.width - 152, event.clientX - rect.left - drag.offsetX))
      const y = Math.max(12, Math.min(rect.height - 64, event.clientY - rect.top - drag.offsetY))

      setPlaced((prev) => {
        const target = prev[drag.deviceId]
        if (!target) return prev
        return { ...prev, [drag.deviceId]: { ...target, x, y } }
      })
    }

    const onPointerUp = () => {
      dragRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  const placedCountOnLevel = Object.keys(placed).filter((id) => levelDeviceIdSet.has(id)).length

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="flex h-full w-[320px] flex-col border-border/60 border-r bg-sidebar">
        <div className="border-border/50 border-b px-3 py-2">
          <div className="text-xs font-semibold">Topology Editor</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {selectedLevelId ? '当前楼层设备池' : '全项目设备池'} · 拖拽到右侧画布
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            后端分配：{apiLoading ? '计算中...' : apiError ? `异常 (${apiError})` : '已同步'}
          </div>
        </div>

        <div className="space-y-2 border-border/40 border-b px-3 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索设备"
            className="h-8 w-full rounded-md border border-border/70 bg-background px-2 text-xs outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={mediumFilter}
              onChange={(e) => setMediumFilter(e.target.value as 'all' | LinkMedium)}
              className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs"
            >
              <option value="all">全部链路</option>
              <option value="wired">有线设备优先</option>
              <option value="wireless">无线设备优先</option>
            </select>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs"
            >
              <option value="all">全部品牌</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              value={protocolFilter}
              onChange={(e) => setProtocolFilter(e.target.value)}
              className="col-span-2 h-8 rounded-md border border-border/70 bg-background px-2 text-xs"
            >
              <option value="all">全部协议</option>
              {protocols.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={addFilteredToCanvas} className="flex-1 rounded border border-border/70 px-2 py-1 text-[11px] hover:bg-accent">批量上图</button>
            <button type="button" onClick={autoLayout} className="flex-1 rounded border border-border/70 px-2 py-1 text-[11px] hover:bg-accent">自动排布</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div className="space-y-1">
            {visibleDevices.map((d) => (
              <div
                key={d.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/topology-device', d.id)}
                className="flex cursor-grab items-center justify-between rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{d.brand} · {d.protocol}</div>
                  {controllerById.has(d.id) ? (
                    <div className="truncate text-[10px] text-blue-600">
                      控制器 · {controllerById.get(d.id)?.usedChildren ?? 0}/{controllerById.get(d.id)?.maxChildren ?? 0}
                    </div>
                  ) : assignmentByChildId.has(d.id) ? (
                    <div className="truncate text-[10px] text-emerald-600">
                      子设备 · {deviceById.get(assignmentByChildId.get(d.id)?.parentId ?? '')?.name ?? assignmentByChildId.get(d.id)?.parentId} · 槽位 #{assignmentByChildId.get(d.id)?.slotIndex}
                    </div>
                  ) : (
                    <div className="truncate text-[10px] text-amber-600">子设备 · 待接入</div>
                  )}
                </div>
                <div className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {placedIds.has(d.id) ? '已放置' : '可拖拽'}
                </div>
              </div>
            ))}
            {visibleDevices.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
                当前筛选没有设备
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 items-center justify-between border-border/50 border-b px-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">连接器</span>
              <select value={linkMedium} onChange={(e) => setLinkMedium(e.target.value as LinkMedium)} className="h-7 rounded border border-border/70 bg-background px-2 text-xs">
                <option value="wired">有线</option>
                <option value="wireless">无线</option>
              </select>
              <select value={networkType} onChange={(e) => setNetworkType(e.target.value as NetworkType)} className="h-7 rounded border border-border/70 bg-background px-2 text-xs">
                <option value="lan">LAN</option>
                <option value="wan">WAN</option>
              </select>
              <span className="text-muted-foreground">点击两个设备创建连接</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">设备 {usageLabel(placedCountOnLevel, levelDevices.length)}</span>
              <span className="text-muted-foreground">连接 {filteredEdges.length}</span>
              <button type="button" onClick={clearEdges} className="rounded border border-border/70 px-2 py-1 hover:bg-accent">清空连接</button>
              <button type="button" onClick={clearTopology} className="rounded border border-border/70 px-2 py-1 hover:bg-accent">清空拓扑</button>
            </div>
          </div>

          {pendingFrom ? (
            <div className="border-border/40 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
              已选择起点：{deviceById.get(pendingFrom)?.name ?? pendingFrom}，请再点击一个设备完成连接
            </div>
          ) : null}

          <div
            ref={canvasRef}
            className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(0,111,255,0.06),transparent_35%),linear-gradient(0deg,rgba(10,26,57,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(10,26,57,0.02)_1px,transparent_1px)] [background-size:100%_100%,24px_24px,24px_24px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropDevice}
          >
            <svg className="absolute inset-0 h-full w-full">
              {filteredEdges.map((edge) => {
                const from = placed[edge.from]
                const to = placed[edge.to]
                if (!from || !to) return null

                const x1 = from.x + 72
                const y1 = from.y + 28
                const x2 = to.x + 72
                const y2 = to.y + 28
                const selected = edge.id === selectedEdgeId
                const color = selected ? '#f59e0b' : edge.medium === 'wired' ? '#1976d2' : '#00b894'

                return (
                  <g
                    key={edge.id}
                    onClick={() => {
                      setSelectedEdgeId(edge.id)
                      setSelectedNodeId(null)
                    }}
                  >
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth="12"
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={color}
                      strokeWidth={selected ? '3' : '2'}
                      strokeDasharray={edge.medium === 'wireless' ? '6 4' : undefined}
                    />
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} fill={color} fontSize="10" textAnchor="middle">
                      {edge.network.toUpperCase()}
                    </text>
                  </g>
                )
              })}
            </svg>

            {Object.values(placed).map((item) => {
              if (!levelDeviceIdSet.has(item.deviceId)) return null
              const device = deviceById.get(item.deviceId)
              if (!device) return null
              const selected = pendingFrom === device.id || selectedNodeId === device.id
              const controller = controllerById.get(device.id)
              const assignment = assignmentByChildId.get(device.id)
              const parentName = assignment ? deviceById.get(assignment.parentId)?.name ?? assignment.parentId : null

              return (
                <div
                  key={item.deviceId}
                  data-topology-card
                  className={[
                    'absolute w-36 rounded-md border bg-background px-2 py-1.5 text-xs shadow-sm',
                    selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-border/70',
                  ].join(' ')}
                  style={{ left: item.x, top: item.y }}
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <button
                      type="button"
                      className="cursor-grab rounded px-1 hover:bg-accent"
                      onPointerDown={(event) => {
                        const cardRect = (event.currentTarget.closest('[data-topology-card]') as HTMLDivElement | null)?.getBoundingClientRect()
                        if (!cardRect) return
                        dragRef.current = {
                          deviceId: item.deviceId,
                          offsetX: event.clientX - cardRect.left,
                          offsetY: event.clientY - cardRect.top,
                        }
                      }}
                    >
                      拖拽
                    </button>
                    <span>{device.subsystem}</span>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => connectNode(device.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-medium">{device.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{device.brand} · {device.protocol}</div>
                      {controller ? (
                        <div className="truncate text-[10px] text-blue-600">
                          控制器 {controller.usedChildren}/{controller.maxChildren}
                        </div>
                      ) : assignment ? (
                        <div className="truncate text-[10px] text-emerald-600">
                          子设备 → {parentName} · #{assignment.slotIndex}
                        </div>
                      ) : (
                        <div className="truncate text-[10px] text-amber-600">待接入</div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCanvas(device.id)}
                      className="rounded px-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )
            })}

            {placedCountOnLevel === 0 ? (
              <div className="absolute inset-0 grid place-items-center text-center">
                <div className="rounded-lg border border-dashed border-border/80 bg-background/70 px-4 py-3 text-xs text-muted-foreground">
                  从左侧设备池拖拽设备到画布，开始构建拓扑
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex h-full w-[300px] flex-col border-border/60 border-l bg-sidebar">
          <div className="border-border/50 border-b px-3 py-2 text-xs font-semibold">连接与详情</div>

          <div className="space-y-2 border-border/40 border-b px-3 py-2">
            <div className="text-[11px] text-muted-foreground">连接筛选</div>
            <div className="grid grid-cols-2 gap-2">
              <select value={edgeMediumFilter} onChange={(e) => setEdgeMediumFilter(e.target.value as 'all' | LinkMedium)} className="h-7 rounded border border-border/70 bg-background px-2 text-xs">
                <option value="all">全部介质</option>
                <option value="wired">有线</option>
                <option value="wireless">无线</option>
              </select>
              <select value={edgeNetworkFilter} onChange={(e) => setEdgeNetworkFilter(e.target.value as 'all' | NetworkType)} className="h-7 rounded border border-border/70 bg-background px-2 text-xs">
                <option value="all">全部网络</option>
                <option value="lan">LAN</option>
                <option value="wan">WAN</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {selectedNode ? (
              <div className="mb-3 rounded-md border border-border/60 bg-background px-2 py-2 text-xs">
                <div className="mb-1 text-[11px] font-semibold">选中设备</div>
                <div className="truncate font-medium">{selectedNode.name}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">品牌：{selectedNode.brand}</div>
                <div className="text-[10px] text-muted-foreground">协议：{selectedNode.protocol}</div>
                <div className="text-[10px] text-muted-foreground">子系统：{selectedNode.subsystem}</div>
                {controllerById.has(selectedNode.id) ? (
                  <div className="mt-1 text-[10px] text-blue-600">
                    角色：控制器（{controllerById.get(selectedNode.id)?.usedChildren}/{controllerById.get(selectedNode.id)?.maxChildren}）
                  </div>
                ) : assignmentByChildId.has(selectedNode.id) ? (
                  <div className="mt-1 text-[10px] text-emerald-600">
                    角色：子设备 → {deviceById.get(assignmentByChildId.get(selectedNode.id)?.parentId ?? '')?.name ?? assignmentByChildId.get(selectedNode.id)?.parentId}（槽位 #{assignmentByChildId.get(selectedNode.id)?.slotIndex}）
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-amber-600">角色：子设备（待接入）</div>
                )}
              </div>
            ) : null}

            <div className="mb-3 rounded-md border border-border/60 bg-background px-2 py-2 text-xs">
              <div className="mb-1 text-[11px] font-semibold">自动接入状态</div>
              <div className="text-[10px] text-muted-foreground">
                控制器：{apiTopology?.controllers.length ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground">
                已分配子设备：{apiTopology?.assignments.length ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground">
                待接入：{apiTopology?.unassigned.length ?? 0}
              </div>
            </div>

            {selectedEdge ? (
              <div className="mb-3 rounded-md border border-border/60 bg-background px-2 py-2 text-xs">
                <div className="mb-1 text-[11px] font-semibold">选中连接</div>
                <div className="mb-2 text-[10px] text-muted-foreground">
                  {(deviceById.get(selectedEdge.from)?.name ?? selectedEdge.from)} → {(deviceById.get(selectedEdge.to)?.name ?? selectedEdge.to)}
                </div>
                <div className="space-y-2">
                  <select
                    value={selectedEdge.medium}
                    onChange={(e) => updateEdge(selectedEdge.id, { medium: e.target.value as LinkMedium })}
                    className="h-7 w-full rounded border border-border/70 bg-background px-2 text-xs"
                  >
                    <option value="wired">有线</option>
                    <option value="wireless">无线</option>
                  </select>
                  <select
                    value={selectedEdge.network}
                    onChange={(e) => updateEdge(selectedEdge.id, { network: e.target.value as NetworkType })}
                    className="h-7 w-full rounded border border-border/70 bg-background px-2 text-xs"
                  >
                    <option value="lan">LAN</option>
                    <option value="wan">WAN</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeEdge(selectedEdge.id)}
                    className="h-7 w-full rounded border border-red-200 bg-red-50 text-xs text-red-600 hover:bg-red-100"
                  >
                    删除此连接
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              {filteredEdges.map((edge) => {
                const from = deviceById.get(edge.from)?.name ?? edge.from
                const to = deviceById.get(edge.to)?.name ?? edge.to
                const selected = selectedEdgeId === edge.id
                return (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => {
                      setSelectedEdgeId(edge.id)
                      setSelectedNodeId(null)
                    }}
                    className={[
                      'w-full rounded border px-2 py-1 text-left text-[11px]',
                      selected ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-border/60 bg-background hover:bg-accent',
                    ].join(' ')}
                  >
                    <div className="truncate">{from} → {to}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{edge.medium} · {edge.network.toUpperCase()}</div>
                  </button>
                )
              })}
              {filteredEdges.length === 0 ? (
                <div className="rounded border border-dashed border-border/70 p-2 text-center text-[11px] text-muted-foreground">暂无连接</div>
              ) : null}
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
