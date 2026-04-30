'use client'

import { useScene } from '@pascal-app/core'
import type { Subsystem } from '@pascal-app/core'
import {
  CATALOG_BY_ID,
  CATALOG_BY_SUBSYSTEM,
  SUBSYSTEM_META,
  SUBSYSTEM_ORDER,
  getSubsystemColor,
  getSubsystemLabel,
} from '@vilhil/smarthome'
import type { DeviceDefinition } from '@vilhil/smarthome'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Layers,
  Lightbulb,
  Minus,
  Music,
  Plus,
  Radio,
  Shield,
  ToggleLeft,
  Wifi,
  Wind,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import useEditor from '../../store/use-editor'

// ─── Subsystem icons ────────────────────────────────────────────────────────

const SUBSYSTEM_ICONS: Record<string, LucideIcon> = {
  architecture: Building2,
  lighting:     Lightbulb,
  panel:        ToggleLeft,
  sensor:       Radio,
  curtain:      Layers,
  hvac:         Wind,
  av:           Music,
  security:     Shield,
  network:      Wifi,
}

// ─── Mount labels ───────────────────────────────────────────────────────────

const MOUNT_LABEL: Record<string, string> = {
  ceiling:           '吸顶',
  wall:              '壁挂',
  wall_switch:       '墙面',
  floor:             '落地',
  door:              '门上',
  din_rail:          '导轨',
  track:             '轨道',
  hidden:            '暗装',
  ceiling_suspended: '悬挂',
}

// ─── Queue type (mirrors DevicePanel) ───────────────────────────────────────

type QueueItem = { catalogId: string; name: string; remaining: number; total: number }

// ─── DeviceWorkspace ─────────────────────────────────────────────────────────

export function DeviceWorkspace() {
  const nodes = useScene((s) => s.nodes)
  const setSelectedDevice = useEditor((s) => s.setSelectedDevice)
  const setPhase          = useEditor((s) => s.setPhase)
  const setMode           = useEditor((s) => s.setMode)
  const setTool           = useEditor((s) => s.setTool)
  const setActiveSidebarPanel = useEditor((s) => s.setActiveSidebarPanel)

  const [activeSub, setActiveSub] = useState<Subsystem | null>(null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isQueuing, setIsQueuing] = useState(false)

  // ── Device count (for queue advancement) ─────────────────────────────────
  const deviceCount = useMemo(
    () => Object.values(nodes).filter((n: any) => n?.type === 'device').length,
    [nodes],
  )
  const prevDeviceCountRef = useRef(deviceCount)

  // ── Subsystem stats (device count + placed count) ─────────────────────────
  const subsystemStats = useMemo(() => {
    const result: Record<string, { catalog: number; placed: number; selected: number }> = {}
    const deviceNodes = Object.values(nodes).filter((n: any) => n?.type === 'device') as any[]
    for (const sub of SUBSYSTEM_ORDER) {
      const catalogDevices = (CATALOG_BY_SUBSYSTEM[sub] ?? []).filter((d) => !d.hiddenFromCatalog)
      const placed = deviceNodes.filter((n) => n?.subsystem === sub).length
      const selected = catalogDevices.reduce((s, d) => s + (cart[d.catalogId] ?? 0), 0)
      result[sub] = { catalog: catalogDevices.length, placed, selected }
    }
    return result
  }, [nodes, cart])

  const totalSelected = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart])

  const cartTotalPrice = useMemo(() => {
    let total = 0
    for (const [catalogId, qty] of Object.entries(cart)) {
      const price = CATALOG_BY_ID[catalogId]?.price
      if (price) total += price * qty
    }
    return total
  }, [cart])

  // ── Cart ops ──────────────────────────────────────────────────────────────
  const setQty = useCallback((catalogId: string, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) { const next = { ...prev }; delete next[catalogId]; return next }
      return { ...prev, [catalogId]: qty }
    })
  }, [])

  // ── Placement queue (mirrors DevicePanel logic) ────────────────────────────
  const advanceQueue = useCallback(
    (currentQueue: QueueItem[]) => {
      if (currentQueue.length === 0) {
        setIsQueuing(false); setSelectedDevice(null); setQueue([]); return
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
        setIsQueuing(false); setSelectedDevice(null); setQueue([]); setCart({})
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
    setQueue(items); setIsQueuing(true); prevDeviceCountRef.current = deviceCount
    const firstDef = CATALOG_BY_ID[items[0]!.catalogId]
    if (firstDef) {
      setSelectedDevice(firstDef)
      setPhase('furnish'); setMode('build'); setTool('device')
      setActiveSidebarPanel('building')
    }
  }, [cart, deviceCount, setSelectedDevice, setPhase, setMode, setTool, setActiveSidebarPanel])

  const cancelPlacement = useCallback(() => {
    setIsQueuing(false); setQueue([]); setSelectedDevice(null)
  }, [setSelectedDevice])

  // ── Queuing overlay ───────────────────────────────────────────────────────
  if (isQueuing) {
    const head = queue[0]
    const queueTotal = queue.reduce((s, i) => s + i.remaining, 0)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-background px-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/40">
          <span className="relative flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-amber-500" />
          </span>
        </div>
        <div className="text-center">
          <div className="text-base font-semibold text-foreground">
            正在放置 · {head?.name}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            还剩 {queueTotal} 台 · 在 3D 场景中点击位置放置
          </div>
        </div>

        {/* Queue list */}
        <div className="w-full max-w-sm space-y-1.5">
          {queue.map((item, i) => (
            <div
              key={item.catalogId}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2',
                i === 0 ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-muted/40',
              )}
            >
              <div className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                i === 0 ? 'animate-pulse bg-amber-500' : 'bg-muted-foreground/25',
              )} />
              <span className={cn('flex-1 text-sm', i === 0 && 'font-medium text-amber-800 dark:text-amber-300')}>
                {item.name}
              </span>
              <span className="text-xs text-muted-foreground/60">×{item.remaining}</span>
            </div>
          ))}
        </div>

        <button
          className="flex items-center gap-1.5 rounded-xl border border-border/50 px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={cancelPlacement}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
          取消放置
        </button>
      </div>
    )
  }

  // ── Device list view (subsystem selected) ────────────────────────────────
  if (activeSub) {
    const devices = (CATALOG_BY_SUBSYSTEM[activeSub] ?? []).filter((d) => !d.hiddenFromCatalog)
    const color = getSubsystemColor(activeSub)
    const label = getSubsystemLabel(activeSub)
    const Icon = SUBSYSTEM_ICONS[activeSub] ?? Cpu

    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        {/* Sub-header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 px-6 py-3">
          <button
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => setActiveSub(null)}
            type="button"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            全部子系统
          </button>

          <div className="h-4 w-px bg-border/60" />

          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${color}18` }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color }} />
            </div>
            <span className="text-sm font-semibold" style={{ color }}>{label}</span>
            <span className="text-xs text-muted-foreground">{devices.length} 款</span>
          </div>

          {totalSelected > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                已选 <strong className="text-foreground">{totalSelected}</strong> 台
                {cartTotalPrice > 0 && (
                  <span className="ml-1 text-muted-foreground/70">· ¥{cartTotalPrice.toLocaleString()}</span>
                )}
              </span>
              <button
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
                onClick={startPlacement}
                type="button"
              >
                开始放置
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Device list */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-2xl space-y-2">
            {devices.map((device) => {
              const qty = cart[device.catalogId] ?? 0
              const mount = MOUNT_LABEL[device.mountType] ?? device.mountType

              return (
                <div
                  key={device.catalogId}
                  className={cn(
                    'group flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-all',
                    qty > 0
                      ? 'border-primary/20 bg-primary/5 shadow-sm'
                      : 'border-border/40 hover:border-border/70 hover:bg-accent/30',
                  )}
                >
                  {/* Device icon */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${color}14` }}
                  >
                    <Icon className="h-5 w-5" style={{ color }} />
                  </div>

                  {/* Name + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{device.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {mount}
                      {device.price !== undefined && (
                        <span className="ml-2 text-muted-foreground/60">¥{device.price} / 台</span>
                      )}
                    </div>
                  </div>

                  {/* Qty control */}
                  <div className="flex shrink-0 items-center gap-2">
                    {qty > 0 ? (
                      <>
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          onClick={() => setQty(device.catalogId, qty - 1)}
                          type="button"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold text-primary">{qty}</span>
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                          onClick={() => setQty(device.catalogId, qty + 1)}
                          type="button"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/40 text-muted-foreground/50 transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                        onClick={() => setQty(device.catalogId, 1)}
                        type="button"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom bar */}
        {totalSelected > 0 && (
          <div className="shrink-0 border-t border-border/40 bg-background/95 px-6 py-3.5">
            <div className="mx-auto flex max-w-2xl items-center gap-4">
              <div className="flex-1 text-sm text-muted-foreground">
                已选{' '}
                <strong className="text-foreground">{totalSelected}</strong>{' '}
                台设备
                {cartTotalPrice > 0 && (
                  <span className="ml-2 text-muted-foreground/60">
                    · 预估 ¥{cartTotalPrice.toLocaleString()}
                  </span>
                )}
              </div>
              <button
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
                onClick={startPlacement}
                type="button"
              >
                开始放置
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Category grid (default view) ─────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-background px-8 py-7">
      {/* Page header */}
      <div className="mb-7 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">选择设备</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            选择子系统分类，为方案添加智能设备
          </p>
        </div>

        {totalSelected > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              已选 <strong className="text-foreground">{totalSelected}</strong> 台
              {cartTotalPrice > 0 && (
                <span className="ml-1.5 text-muted-foreground/60">
                  · ¥{cartTotalPrice.toLocaleString()}
                </span>
              )}
            </span>
            <button
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
              onClick={startPlacement}
              type="button"
            >
              开始放置
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Subsystem grid — 3 columns */}
      <div className="grid grid-cols-3 gap-4 xl:grid-cols-3">
        {SUBSYSTEM_ORDER.map((sub) => {
          const color = getSubsystemColor(sub)
          const label = getSubsystemLabel(sub)
          const Icon = SUBSYSTEM_ICONS[sub] ?? Cpu
          const stats = subsystemStats[sub] ?? { catalog: 0, placed: 0, selected: 0 }

          return (
            <button
              key={sub}
              className={cn(
                'group relative flex flex-col items-start rounded-2xl border p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
                stats.selected > 0
                  ? 'border-primary/25 bg-primary/5 shadow-sm'
                  : 'border-border/50 bg-card hover:border-border',
              )}
              onClick={() => setActiveSub(sub)}
              type="button"
            >
              {/* Selection badge */}
              {stats.selected > 0 && (
                <div
                  className="absolute right-4 top-4 flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: color }}
                >
                  {stats.selected}
                </div>
              )}

              {/* Icon */}
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105"
                style={{ backgroundColor: `${color}18` }}
              >
                <Icon className="h-7 w-7" style={{ color }} />
              </div>

              {/* Label */}
              <div className="mb-1 text-base font-semibold" style={{ color }}>
                {label}
              </div>

              {/* Stats */}
              <div className="text-xs text-muted-foreground">
                {stats.catalog} 款设备
                {stats.placed > 0 && (
                  <span className="ml-1.5">
                    · <span className="text-emerald-500">已放 {stats.placed}</span>
                  </span>
                )}
              </div>

              {/* Arrow */}
              <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground/20 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground/50" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
