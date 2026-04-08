'use client'

import type { Subsystem } from '@pascal-app/core'
import {
  CATALOG_BY_SUBSYSTEM,
  type DeviceDefinition,
  SUBSYSTEM_META,
  SUBSYSTEM_ORDER,
} from '@vilhil/smarthome'
import { useEffect, useState } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './../../../components/ui/primitives/tooltip'
import { cn } from './../../../lib/utils'
import useEditor from './../../../store/use-editor'

export function DeviceCatalog() {
  const selectedDevice = useEditor((state) => state.selectedDevice)
  const setSelectedDevice = useEditor((state) => state.setSelectedDevice)
  const [activeSubsystem, setActiveSubsystem] = useState<Subsystem | null>('lighting')

  const devices = activeSubsystem ? CATALOG_BY_SUBSYSTEM[activeSubsystem] ?? [] : []

  // Auto-select first device if none selected
  useEffect(() => {
    if (!selectedDevice && devices.length > 0) {
      setSelectedDevice(devices[0])
    }
  }, [devices, selectedDevice, setSelectedDevice])

  return (
    <div className="flex flex-col gap-2">
      {/* Subsystem filter chips */}
      <div className="flex flex-wrap gap-1">
        {SUBSYSTEM_ORDER.map((subsystem) => {
          const meta = SUBSYSTEM_META[subsystem]
          const isActive = activeSubsystem === subsystem
          const count = CATALOG_BY_SUBSYSTEM[subsystem]?.length ?? 0
          return (
            <button
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded-md py-0.5 pr-1.5 pl-2 font-medium text-xs transition-colors',
                isActive
                  ? 'text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )}
              key={subsystem}
              onClick={() => setActiveSubsystem(isActive ? null : subsystem)}
              style={{
                backgroundColor: isActive ? meta.color : undefined,
              }}
              type="button"
            >
              {meta.label}
              <span
                className={cn(
                  'text-[10px]',
                  isActive ? 'text-white/80' : 'text-zinc-500/70',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Device grid */}
      {activeSubsystem ? (
        <div className="-mx-2 -my-2 flex max-w-xl gap-2 overflow-x-auto p-2">
          {devices.map((device) => {
            const isSelected = selectedDevice?.catalogId === device.catalogId
            const meta = SUBSYSTEM_META[device.subsystem]
            return (
              <Tooltip key={device.catalogId}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      'relative flex h-16 min-h-16 w-20 min-w-20 flex-col items-center justify-center gap-1 rounded-lg border border-border/50 bg-muted/50 transition-all duration-200 ease-out hover:scale-105 hover:cursor-pointer hover:bg-muted',
                      isSelected && 'ring-2 ring-primary',
                    )}
                    onClick={() => setSelectedDevice(device)}
                    type="button"
                  >
                    {/* Color indicator */}
                    <div
                      className="h-6 w-6 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    {/* Device name */}
                    <span className="max-w-full truncate px-1 text-[10px]">
                      {device.name}
                    </span>
                    {/* Mount type indicator */}
                    <span className="text-[8px] text-muted-foreground capitalize">
                      {device.mountType}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs" side="top">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{device.name}</span>
                    <span className="text-muted-foreground">{device.brand}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      ) : (
        <div className="py-4 text-center text-muted-foreground text-sm">
          选择子系统查看设备
        </div>
      )}
    </div>
  )
}
