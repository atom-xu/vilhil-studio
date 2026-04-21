'use client'

/**
 * DevicePanel — 设备面板
 *
 * 1) 显示设备目录（用于快速选型）
 * 2) 显示未入场/已入场清单（用于方案推进）
 */

import { useScene } from '@pascal-app/core'
import { DEVICE_CATALOG, getSubsystemLabel } from '@vilhil/smarthome'
import { Cpu } from 'lucide-react'
import { useMemo } from 'react'
import useEditor from '../../../../../store/use-editor'
import { DeviceCatalog } from '../../../device-catalog/device-catalog'
import { Button } from '../../../primitives/button'

export function DevicePanel() {
  const nodes = useScene((s) => s.nodes)
  const selectedDevice = useEditor((s) => s.selectedDevice)
  const setSelectedDevice = useEditor((s) => s.setSelectedDevice)
  const setPhase = useEditor((s) => s.setPhase)
  const setMode = useEditor((s) => s.setMode)
  const setTool = useEditor((s) => s.setTool)
  const setCatalogCategory = useEditor((s) => s.setCatalogCategory)
  const setActiveSidebarPanel = useEditor((s) => s.setActiveSidebarPanel)

  const stats = useMemo(() => {
    const deviceNodes = Object.values(nodes).filter((n: any) => n?.type === 'device') as any[]
    const countByCatalogId = new Map<string, number>()
    const unknownInScene: Array<{ productId: string; count: number }> = []

    for (const node of deviceNodes) {
      const productId = `${node.productId ?? ''}`
      if (!productId) continue
      countByCatalogId.set(productId, (countByCatalogId.get(productId) ?? 0) + 1)
    }

    const unplaced = DEVICE_CATALOG.filter((d) => !countByCatalogId.has(d.catalogId))
    const placed = DEVICE_CATALOG
      .filter((d) => countByCatalogId.has(d.catalogId))
      .map((d) => ({ def: d, count: countByCatalogId.get(d.catalogId) ?? 0 }))
      .sort((a, b) => b.count - a.count)

    for (const [productId, count] of countByCatalogId.entries()) {
      if (!DEVICE_CATALOG.some((d) => d.catalogId === productId)) {
        unknownInScene.push({ productId, count })
      }
    }

    return { unplaced, placed, unknownInScene, totalInScene: deviceNodes.length }
  }, [nodes])

  const enterPlacement = (catalogId: string) => {
    const target = DEVICE_CATALOG.find((d) => d.catalogId === catalogId) ?? null
    if (!target) return
    setSelectedDevice(target)
    setPhase('furnish')
    setMode('build')
    setTool('device')
    setCatalogCategory(null)
    setActiveSidebarPanel('building')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b px-3 py-2.5">
        <Cpu className="h-4 w-4 text-blue-400" />
        <span className="font-semibold text-foreground text-sm">设备</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          已入场 {stats.totalInScene}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-background p-2">
            <div className="mb-2 text-[11px] text-muted-foreground">设备目录（选型）</div>
            <DeviceCatalog />
          </div>

          <div className="rounded-lg border border-border/60 bg-background p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">未入场设备</span>
              <span className="text-[11px] text-muted-foreground">{stats.unplaced.length} 种</span>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {stats.unplaced.map((d) => (
                <Button variant="ghost"
                  className="flex w-full items-center justify-between rounded-md border border-border/50 px-2 py-1.5 text-left hover:bg-accent/50"
                  key={d.catalogId}
                  onClick={() => enterPlacement(d.catalogId)}
                  type="button"
                >
                  <span className="truncate text-xs">{d.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {getSubsystemLabel(d.subsystem)}
                  </span>
                </Button>
              ))}
              {stats.unplaced.length === 0 && (
                <div className="px-2 py-1 text-[11px] text-muted-foreground">全部设备已入场</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">已入场设备</span>
              <span className="text-[11px] text-muted-foreground">{stats.placed.length} 种</span>
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {stats.placed.map(({ def, count }) => (
                <div
                  className="flex items-center justify-between rounded-md border border-border/50 px-2 py-1.5"
                  key={def.catalogId}
                >
                  <span className="truncate text-xs">{def.name}</span>
                  <span className="text-[10px] text-muted-foreground">x{count}</span>
                </div>
              ))}
              {stats.placed.length === 0 && (
                <div className="px-2 py-1 text-[11px] text-muted-foreground">场景中暂未放置设备</div>
              )}
            </div>
          </div>

          {stats.unknownInScene.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
              <div className="mb-1 text-[11px] text-amber-600">已入场（未入库映射）</div>
              <div className="space-y-1">
                {stats.unknownInScene.map((x) => (
                  <div className="flex items-center justify-between text-[11px]" key={x.productId}>
                    <span className="truncate">{x.productId}</span>
                    <span className="text-muted-foreground">x{x.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedDevice && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5 text-[11px] text-muted-foreground">
              当前待放置：<span className="font-medium text-foreground">{selectedDevice.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
