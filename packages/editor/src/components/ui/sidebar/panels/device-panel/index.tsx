'use client'

import { useScene } from '@pascal-app/core'
import {
  CATALOG_BY_SUBSYSTEM,
  SUBSYSTEM_ORDER,
  getSubsystemColor,
  getSubsystemLabel,
} from '@vilhil/smarthome'
import {
  Building2,
  Cpu,
  Layers,
  Lightbulb,
  Music,
  Package,
  Radio,
  Shield,
  ToggleLeft,
  Wifi,
  Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { cn } from '../../../../../lib/utils'

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

export function DevicePanel() {
  const nodes = useScene((s) => s.nodes)

  const { subsystemStats, totalPlaced, totalCatalog } = useMemo(() => {
    const deviceNodes = Object.values(nodes).filter((n: any) => n?.type === 'device') as any[]
    const stats: Record<string, { catalog: number; placed: number }> = {}
    let placed = 0
    let catalog = 0
    for (const sub of SUBSYSTEM_ORDER) {
      const catCount = (CATALOG_BY_SUBSYSTEM[sub] ?? []).filter((d) => !d.hiddenFromCatalog).length
      const placedCount = deviceNodes.filter((n: any) => n.subsystem === sub).length
      stats[sub] = { catalog: catCount, placed: placedCount }
      placed += placedCount
      catalog += catCount
    }
    return { subsystemStats: stats, totalPlaced: placed, totalCatalog: catalog }
  }, [nodes])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5">
        <Package className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">项目设备</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-4 rounded-2xl border border-border/40 bg-muted/20 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-foreground">{totalPlaced}</span>
            <span className="text-xs text-muted-foreground">设备已放入场景</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground/50">
            设备库共 {totalCatalog} 款可用
          </div>
        </div>

        <div className="space-y-1">
          {SUBSYSTEM_ORDER.map((sub) => {
            const color = getSubsystemColor(sub)
            const label = getSubsystemLabel(sub)
            const Icon = SUBSYSTEM_ICONS[sub] ?? Cpu
            const stats = subsystemStats[sub] ?? { catalog: 0, placed: 0 }

            return (
              <div
                key={sub}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2',
                  stats.placed > 0 ? 'bg-background' : 'opacity-50',
                )}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${color}18` }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                </div>
                <span className="flex-1 text-xs text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground/50">{stats.catalog} 款</span>
                {stats.placed > 0 && (
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ color, backgroundColor: `${color}14` }}
                  >
                    {stats.placed}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 rounded-xl bg-muted/30 px-3 py-2.5 text-center text-[11px] text-muted-foreground/50">
          在右侧工作台中浏览设备目录、查看详情和放入场景
        </div>
      </div>
    </div>
  )
}
