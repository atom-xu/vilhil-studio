'use client'

import type { Subsystem } from '@pascal-app/core'
import {
  CATALOG_BY_SUBSYSTEM,
  DEVICE_CATALOG,
  type DeviceDefinition,
  SUBSYSTEM_META,
  SUBSYSTEM_ORDER,
} from '@vilhil/smarthome'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { cn } from './../../../lib/utils'
import useEditor from './../../../store/use-editor'

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

interface DeviceCatalogProps {
  filterCatalogIds?: string[]
  onPlaceDevice?: (catalogId: string) => void
}

export function DeviceCatalog({ filterCatalogIds, onPlaceDevice }: DeviceCatalogProps = {}) {
  const selectedDevice = useEditor((state) => state.selectedDevice)
  const setSelectedDevice = useEditor((state) => state.setSelectedDevice)
  const [activeSubsystem, setActiveSubsystem] = useState<Subsystem>('lighting')

  // hiddenFromCatalog: 旧 catalogId（如已合并到"灯带"主条目的 LIGHT-STRIP-WASH-WALL）
  // 仍在 lookup 表里以兼容老数据，但不在选择器里曝光。
  const devices: DeviceDefinition[] = (
    filterCatalogIds
      ? DEVICE_CATALOG.filter((d) => filterCatalogIds.includes(d.catalogId))
      : (CATALOG_BY_SUBSYSTEM[activeSubsystem] ?? [])
  ).filter((d) => !d.hiddenFromCatalog)

  function handlePlace(device: DeviceDefinition) {
    setSelectedDevice(device)
    onPlaceDevice?.(device.catalogId)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 子系统筛选 — 方案模式下隐藏 */}
      {!filterCatalogIds && (
        <div className="flex flex-wrap gap-1">
          {SUBSYSTEM_ORDER.map((subsystem) => {
            const meta = SUBSYSTEM_META[subsystem]
            const isActive = activeSubsystem === subsystem
            // 子系统数量徽章排除 hiddenFromCatalog（旧条目），和上面 devices 列表口径一致
            const count =
              CATALOG_BY_SUBSYSTEM[subsystem]?.filter((d) => !d.hiddenFromCatalog).length ?? 0
            return (
              <button
                className={cn(
                  'inline-flex items-center gap-1 rounded-md py-0.5 pr-1.5 pl-2 font-medium text-xs transition-colors',
                  isActive
                    ? 'text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                )}
                key={subsystem}
                onClick={() => setActiveSubsystem(subsystem)}
                style={{ backgroundColor: isActive ? meta.color : undefined }}
                type="button"
              >
                {meta.label}
                <span className={cn('text-[10px]', isActive ? 'text-white/80' : 'text-zinc-500/70')}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* 设备列表 — 2列卡片 */}
      {devices.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {devices.map((device) => {
            const isSelected = selectedDevice?.catalogId === device.catalogId
            const meta = SUBSYSTEM_META[device.subsystem]
            const mountLabel = MOUNT_LABEL[device.mountType] ?? device.mountType
            return (
              <button
                className={cn(
                  'group relative flex flex-col gap-1 overflow-hidden rounded-lg border px-2.5 py-2 text-left transition-all',
                  isSelected
                    ? 'border-primary/50 bg-primary/8 ring-1 ring-primary/25'
                    : 'border-border/50 bg-muted/40 hover:bg-muted/70',
                )}
                key={device.catalogId}
                onClick={() => handlePlace(device)}
                type="button"
              >
                {/* 子系统色条 */}
                <div
                  className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="truncate pl-1 text-[11px] font-medium leading-snug text-foreground">
                  {device.name}
                </span>
                <div className="flex items-center justify-between pl-1">
                  <span className="text-[10px] text-muted-foreground">
                    {meta.label} · {mountLabel}
                  </span>
                  <Plus
                    className={cn(
                      'h-3 w-3 shrink-0 transition-colors',
                      isSelected ? 'text-primary' : 'text-muted-foreground/40 group-hover:text-muted-foreground',
                    )}
                  />
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="py-4 text-center text-sm text-muted-foreground">暂无匹配设备</div>
      )}
    </div>
  )
}
