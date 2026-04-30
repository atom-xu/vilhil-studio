'use client'

import { useScene } from '@pascal-app/core'
import type { Subsystem } from '@pascal-app/core'
import {
  CATALOG_BY_ID,
  CATALOG_BY_SUBSYSTEM,
  SUBSYSTEM_META,
  SUBSYSTEM_ORDER,
  getSubsystemLabel,
} from '@vilhil/smarthome'
import { ChevronRight, Cpu, Minus, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../../../../lib/utils'
import useEditor from '../../../../../store/use-editor'

// ─── 挂装方式中文标签 ─────────────────────────────────────────────────────────
const MOUNT_LABEL: Record<string, string> = {
  ceiling: '吸顶',
  wall: '壁挂',
  wall_switch: '墙面',
  floor: '落地',
  door: '门上',
  din_rail: '导轨',
  track: '轨道',
  hidden: '暗装',
  ceiling_suspended: '悬挂',
}

// ─── 放置队列项 ───────────────────────────────────────────────────────────────
type QueueItem = {
  catalogId: string
  name: string
  remaining: number
  total: number
}

export function DevicePanel() {
  const nodes = useScene((s) => s.nodes)
  const selectedDevice = useEditor((s) => s.selectedDevice)
  const setSelectedDevice = useEditor((s) => s.setSelectedDevice)
  const setPhase = useEditor((s) => s.setPhase)
  const setMode = useEditor((s) => s.setMode)
  const setTool = useEditor((s) => s.setTool)
  const setActiveSidebarPanel = useEditor((s) => s.setActiveSidebarPanel)

  // ── 本地状态 ──────────────────────────────────────────────────────────────
  const [activeSub, setActiveSub] = useState<Subsystem>('lighting')
  const [searchQuery, setSearchQuery] = useState('')
  // cart: catalogId → 数量
  const [cart, setCart] = useState<Record<string, number>>({})
  // 放置队列
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isQueuing, setIsQueuing] = useState(false)

  // 监听场景设备数量变化（用于推进放置队列）
  const deviceCount = useMemo(
    () => Object.values(nodes).filter((n: any) => n?.type === 'device').length,
    [nodes],
  )
  const prevDeviceCountRef = useRef(deviceCount)

  // ── 已放置统计 ────────────────────────────────────────────────────────────
  const placedStats = useMemo(() => {
    const deviceNodes = Object.values(nodes).filter((n: any) => n?.type === 'device') as any[]
    const bySubsystem = new Map<string, number>()
    for (const node of deviceNodes) {
      const sub: string = node.subsystem ?? 'unknown'
      bySubsystem.set(sub, (bySubsystem.get(sub) ?? 0) + 1)
    }
    return { total: deviceNodes.length, bySubsystem }
  }, [nodes])

  // ── 当前子系统设备列表（过滤隐藏 + 搜索）────────────────────────────────
  const visibleDevices = useMemo(() => {
    const list = (CATALOG_BY_SUBSYSTEM[activeSub] ?? []).filter(
      (d) => !d.hiddenFromCatalog,
    )
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q),
    )
  }, [activeSub, searchQuery])

  // ── Cart 操作 ──────────────────────────────────────────────────────────
  const totalSelected = useMemo(
    () => Object.values(cart).reduce((s, q) => s + q, 0),
    [cart],
  )

  const setQty = useCallback((catalogId: string, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) {
        const next = { ...prev }
        delete next[catalogId]
        return next
      }
      return { ...prev, [catalogId]: qty }
    })
  }, [])

  // 某子系统在 cart 中的选中数量（用于 tab 徽章）
  const subCartCount = useCallback(
    (sub: Subsystem) => {
      const list = CATALOG_BY_SUBSYSTEM[sub] ?? []
      return list.reduce((s, d) => s + (cart[d.catalogId] ?? 0), 0)
    },
    [cart],
  )

  // ── 放置队列逻辑 ─────────────────────────────────────────────────────────
  const advanceQueue = useCallback(
    (currentQueue: QueueItem[]) => {
      if (currentQueue.length === 0) {
        setIsQueuing(false)
        setSelectedDevice(null)
        setQueue([])
        return
      }

      const [head, ...tail] = currentQueue
      if (!head) return

      if (head.remaining > 1) {
        const updated: QueueItem = { ...head, remaining: head.remaining - 1 }
        const next = [updated, ...tail]
        setQueue(next)
        const def = CATALOG_BY_ID[updated.catalogId]
        if (def) setSelectedDevice(def)
      } else if (tail.length > 0) {
        setQueue(tail)
        const def = CATALOG_BY_ID[tail[0]!.catalogId]
        if (def) setSelectedDevice(def)
      } else {
        setIsQueuing(false)
        setSelectedDevice(null)
        setQueue([])
        setCart({})
      }
    },
    [setSelectedDevice],
  )

  useEffect(() => {
    if (!isQueuing) return
    if (deviceCount > prevDeviceCountRef.current) {
      prevDeviceCountRef.current = deviceCount
      advanceQueue(queue)
    }
  }, [deviceCount, isQueuing, queue, advanceQueue])

  // 更新 prevDeviceCountRef（非 queuing 时也要保持最新）
  useEffect(() => {
    if (!isQueuing) prevDeviceCountRef.current = deviceCount
  }, [deviceCount, isQueuing])

  const startPlacement = useCallback(() => {
    const items: QueueItem[] = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([catalogId, qty]) => {
        const def = CATALOG_BY_ID[catalogId]
        return { catalogId, name: def?.name ?? catalogId, remaining: qty, total: qty }
      })

    if (items.length === 0) return

    setQueue(items)
    setIsQueuing(true)
    prevDeviceCountRef.current = deviceCount

    const firstDef = CATALOG_BY_ID[items[0]!.catalogId]
    if (firstDef) {
      setSelectedDevice(firstDef)
      setPhase('furnish')
      setMode('build')
      setTool('device')
      setActiveSidebarPanel('building')
    }
  }, [cart, deviceCount, setSelectedDevice, setPhase, setMode, setTool, setActiveSidebarPanel])

  const cancelPlacement = useCallback(() => {
    setIsQueuing(false)
    setQueue([])
    setSelectedDevice(null)
  }, [setSelectedDevice])

  // ── 放置队列信息 ─────────────────────────────────────────────────────────
  const queueTotal = useMemo(
    () => queue.reduce((s, i) => s + i.remaining, 0),
    [queue],
  )
  const currentQueueHead = queue[0] ?? null

  // ── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── 顶栏 ─────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5">
        <Cpu className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">添加设备</span>
        {totalSelected > 0 && !isQueuing && (
          <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {totalSelected}
          </span>
        )}
        {placedStats.total > 0 && totalSelected === 0 && !isQueuing && (
          <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            已放置 {placedStats.total}
          </span>
        )}
      </div>

      {/* ── 放置进度条（队列模式）─────────────────────────────────────────── */}
      {isQueuing && currentQueueHead && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200/40 bg-amber-50/80 px-3 py-2 dark:border-amber-700/30 dark:bg-amber-950/30">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-amber-800 dark:text-amber-300">
              点击场景放置 · {currentQueueHead.name}
            </div>
            <div className="text-[10px] text-amber-600/70 dark:text-amber-500/70">
              队列还剩 {queueTotal} 台
            </div>
          </div>
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-amber-700/50 transition-colors hover:bg-amber-100 hover:text-amber-800 dark:text-amber-400/60 dark:hover:bg-amber-900/50"
            onClick={cancelPlacement}
            title="取消放置"
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── 搜索框（非队列模式）──────────────────────────────────────────── */}
      {!isQueuing && (
        <div className="shrink-0 px-3 pb-2 pt-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <input
              className="h-8 w-full rounded-lg border border-border/50 bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/15"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索设备名称…"
              type="text"
              value={searchQuery}
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground"
                onClick={() => setSearchQuery('')}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 子系统 Tab（非队列模式）──────────────────────────────────────── */}
      {!isQueuing && (
        <div className="shrink-0 overflow-x-auto px-3 pb-2 scrollbar-none">
          <div className="flex gap-1">
            {SUBSYSTEM_ORDER.map((sub) => {
              const count = subCartCount(sub)
              const isActive = activeSub === sub
              return (
                <button
                  key={sub}
                  onClick={() => setActiveSub(sub)}
                  className={cn(
                    'relative shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  type="button"
                >
                  {getSubsystemLabel(sub)}
                  {count > 0 && (
                    <span className="ml-1 rounded-full bg-primary px-1 py-0 text-[9px] leading-3 text-white">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 主内容区 ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {!isQueuing ? (
          // 设备列表（含数量控制器）
          <div className="space-y-0.5">
            {visibleDevices.map((device) => {
              const qty = cart[device.catalogId] ?? 0
              const mount = MOUNT_LABEL[device.mountType] ?? device.mountType
              const dotColor =
                SUBSYSTEM_META[device.subsystem as Subsystem]?.color ?? '#888'

              return (
                <div
                  key={device.catalogId}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors',
                    qty > 0
                      ? 'border-primary/20 bg-primary/5'
                      : 'border-transparent hover:border-border/40 hover:bg-accent/40',
                  )}
                >
                  {/* 子系统色点 */}
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />

                  {/* 名称 + 挂装方式 */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">
                      {device.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60">{mount}</div>
                  </div>

                  {/* 价格（如果有）*/}
                  {device.price !== undefined && qty === 0 && (
                    <div className="shrink-0 text-[10px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                      ¥{device.price}
                    </div>
                  )}

                  {/* 数量控制器 */}
                  <div className="flex shrink-0 items-center gap-1">
                    {qty > 0 ? (
                      <>
                        <button
                          className="flex h-5 w-5 items-center justify-center rounded-md border border-border/50 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          onClick={() => setQty(device.catalogId, qty - 1)}
                          type="button"
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold text-primary">
                          {qty}
                        </span>
                        <button
                          className="flex h-5 w-5 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                          onClick={() => setQty(device.catalogId, qty + 1)}
                          type="button"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        className="flex h-5 w-5 items-center justify-center rounded-md border border-border/40 text-muted-foreground/50 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                        onClick={() => setQty(device.catalogId, 1)}
                        type="button"
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {visibleDevices.length === 0 && (
              <div className="py-10 text-center text-[11px] text-muted-foreground/40">
                {searchQuery
                  ? `没有找到"${searchQuery}"`
                  : '该子系统暂无设备'}
              </div>
            )}

            {/* 已放置统计（仅 cart 空时显示）*/}
            {totalSelected === 0 && placedStats.total > 0 && (
              <div className="mt-4 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  已放置
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {Array.from(placedStats.bySubsystem.entries()).map(([sub, count]) => (
                    <span className="text-[11px] text-muted-foreground" key={sub}>
                      <span
                        style={{
                          color:
                            SUBSYSTEM_META[sub as Subsystem]?.color ?? '#888',
                        }}
                      >
                        ●
                      </span>{' '}
                      {getSubsystemLabel(sub as Subsystem)} {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          // 放置队列视图
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              放置队列
            </p>
            {queue.map((item, i) => (
              <div
                key={item.catalogId}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs',
                  i === 0
                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'text-muted-foreground',
                )}
              >
                <div
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    i === 0 ? 'animate-pulse bg-amber-500' : 'bg-muted-foreground/30',
                  )}
                />
                <span className={cn('flex-1 truncate', i === 0 && 'font-medium')}>
                  {item.name}
                </span>
                <span className="shrink-0 text-[11px] opacity-60">×{item.remaining}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 底部操作栏（有选中时显示）────────────────────────────────────── */}
      {totalSelected > 0 && !isQueuing && (
        <div className="shrink-0 border-t border-border/40 bg-background/95 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-muted-foreground">
              已选{' '}
              <span className="font-semibold text-foreground">{totalSelected}</span>{' '}
              台设备
            </span>
            <button
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
              onClick={startPlacement}
              type="button"
            >
              开始放置
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
