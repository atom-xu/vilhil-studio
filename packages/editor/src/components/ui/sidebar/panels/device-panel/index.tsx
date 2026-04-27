'use client'

import { useScene } from '@pascal-app/core'
import { DEVICE_CATALOG, SUBSYSTEM_META, getSubsystemLabel } from '@vilhil/smarthome'
import { Cpu, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../../../../lib/utils'
import useEditor from '../../../../../store/use-editor'
import { DeviceCatalog } from '../../../device-catalog/device-catalog'

// 按房间类型预设的常用设备组合，方便设计师快速选型
const ROOM_BUNDLES: { id: string; label: string; catalogIds: string[] }[] = [
  {
    id: 'living',
    label: '客厅',
    catalogIds: [
      'LIGHT-DOWNLIGHT',
      'LIGHT-PENDANT',
      'PANEL-SCENE-4KEY',
      'HVAC-AC-WALL',
      'CURTAIN-SIDE-OPEN',
    ],
  },
  {
    id: 'bedroom',
    label: '卧室',
    catalogIds: [
      'LIGHT-DOWNLIGHT',
      'PANEL-SWITCH-2KEY',
      'PANEL-DIMMER-KNOB',
      'HVAC-AC-WALL',
      'CURTAIN-SIDE-OPEN',
    ],
  },
  {
    id: 'security',
    label: '安防',
    catalogIds: [
      'SECURITY-DOOR-LOCK',
      'SECURITY-CAMERA-DOME',
      'SECURITY-CAMERA-BULLET',
      'SECURITY-PIR',
      'SECURITY-SMOKE',
    ],
  },
  {
    id: 'network',
    label: '网络',
    catalogIds: [
      'NETWORK-AP-CEILING',
      'NETWORK-AP-WALL',
      'NETWORK-CABINET-WALL',
      'NETWORK-ROUTER',
      'INFRA-SMART-HOST',
    ],
  },
]

export function DevicePanel() {
  const nodes = useScene((s) => s.nodes)
  const selectedDevice = useEditor((s) => s.selectedDevice)
  const setSelectedDevice = useEditor((s) => s.setSelectedDevice)
  const setPhase = useEditor((s) => s.setPhase)
  const setMode = useEditor((s) => s.setMode)
  const setTool = useEditor((s) => s.setTool)
  const setCatalogCategory = useEditor((s) => s.setCatalogCategory)
  const setActiveSidebarPanel = useEditor((s) => s.setActiveSidebarPanel)

  const [activeBundleId, setActiveBundleId] = useState<string | null>(null)

  const placedStats = useMemo(() => {
    const deviceNodes = Object.values(nodes).filter((n: any) => n?.type === 'device') as any[]
    const bySubsystem = new Map<string, number>()
    for (const node of deviceNodes) {
      const sub: string = node.subsystem ?? 'unknown'
      bySubsystem.set(sub, (bySubsystem.get(sub) ?? 0) + 1)
    }
    return { total: deviceNodes.length, bySubsystem }
  }, [nodes])

  // 进入放置模式：选中设备并切换到 furnish/build 阶段
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

  const activeBundle = ROOM_BUNDLES.find((b) => b.id === activeBundleId) ?? null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶栏 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5">
        <Cpu className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">设备</span>
        {placedStats.total > 0 && (
          <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            已放置 {placedStats.total}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 正在放置提示 */}
        {selectedDevice && (
          <div className="flex items-center gap-2 border-b border-border/30 bg-primary/5 px-3 py-2">
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: SUBSYSTEM_META[selectedDevice.subsystem]?.color }}
            />
            <span className="flex-1 truncate text-[11px] font-medium text-foreground">
              点击场景放置 · {selectedDevice.name}
            </span>
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setSelectedDevice(null)}
              title="取消"
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="space-y-4 p-3">
          {/* 快速方案 */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              快速方案
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ROOM_BUNDLES.map((bundle) => {
                const isActive = activeBundleId === bundle.id
                return (
                  <button
                    className={cn(
                      'rounded-lg border px-3 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/50 bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    key={bundle.id}
                    onClick={() => setActiveBundleId((prev) => (prev === bundle.id ? null : bundle.id))}
                    type="button"
                  >
                    {bundle.label}
                    <span
                      className={cn(
                        'ml-1 text-[10px]',
                        isActive ? 'text-primary/60' : 'text-muted-foreground/50',
                      )}
                    >
                      {bundle.catalogIds.length}件
                    </span>
                  </button>
                )
              })}
            </div>
            {activeBundle && (
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {activeBundle.label}常用设备，点击卡片进入放置
              </p>
            )}
          </div>

          {/* 设备目录 */}
          <div>
            {!activeBundle && (
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                所有设备
              </p>
            )}
            <DeviceCatalog
              filterCatalogIds={activeBundle?.catalogIds}
              onPlaceDevice={enterPlacement}
            />
          </div>

          {/* 已放置统计 */}
          {placedStats.total > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                已放置统计
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Array.from(placedStats.bySubsystem.entries()).map(([sub, count]) => (
                  <span className="text-[11px] text-muted-foreground" key={sub}>
                    <span style={{ color: SUBSYSTEM_META[sub as keyof typeof SUBSYSTEM_META]?.color ?? '#888' }}>
                      ●
                    </span>{' '}
                    {getSubsystemLabel(sub as any)} {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
