'use client'

import type { Subsystem } from '@pascal-app/core'
import { SUBSYSTEM_META, SUBSYSTEM_ORDER } from '@vilhil/smarthome'
import { useDeviceState } from '@vilhil/smarthome'
import { cn } from '../../lib/utils'
import { Button } from '../ui/primitives/button'

interface SubsystemBarProps {
  className?: string
  onSubsystemClick?: (subsystem: Subsystem) => void
}

/**
 * 子系统侧边栏 — 9 大子系统图标 + 中文名称
 * 点击名称行切换聚焦，高亮当前子系统；
 * 点击右侧“显/隐”切换该子系统可见性。
 */
export function SubsystemBar({ className, onSubsystemClick }: SubsystemBarProps) {
  const visibleSubsystems = useDeviceState((s) => s.visibleSubsystems)
  const selectedSubsystem = useDeviceState((s) => s.selectedSubsystem)
  const selectSubsystem = useDeviceState((s) => s.selectSubsystem)
  const toggleSubsystem = useDeviceState((s) => s.toggleSubsystem)

  const handleSelect = (subsystem: Subsystem) => {
    if (selectedSubsystem === subsystem) {
      selectSubsystem(null)
    } else {
      selectSubsystem(subsystem)
    }
    onSubsystemClick?.(subsystem)
  }

  return (
    <div
      className={cn(
        'vh-panel flex flex-col gap-0.5 px-1.5 py-2',
        className,
      )}
    >
      {SUBSYSTEM_ORDER.map((subsystem) => {
        const meta = SUBSYSTEM_META[subsystem]
        const isVisible = visibleSubsystems[subsystem]
        const isSelected = selectedSubsystem === subsystem

        return (
          <div
            key={subsystem}
            className={cn(
              'group relative',
              !isVisible && 'opacity-40 grayscale'
            )}
          >
            <Button
              className={cn(
                'h-auto w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-7 transition-all duration-200',
                isSelected ? 'shadow-md' : 'hover:bg-accent/50',
              )}
              onClick={() => handleSelect(subsystem)}
              size="sm"
              style={{
                backgroundColor: isSelected ? meta.color : undefined,
              }}
              type="button"
              variant="ghost"
            >
              {/* 子系统色块图标 */}
              <div
                className={cn(
                  'h-4 w-4 shrink-0 rounded-full transition-transform duration-200',
                  isSelected ? 'scale-90' : 'group-hover:scale-110',
                )}
                style={{
                  backgroundColor: isSelected ? 'white' : meta.color,
                }}
              />

              {/* 子系统名称 */}
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap transition-colors duration-200',
                  isSelected
                    ? 'text-white'
                    : 'text-muted-foreground/80 group-hover:text-foreground',
                )}
              >
                {meta.label}
              </span>
            </Button>

            <span
              aria-hidden="true"
              className={cn(
                'absolute right-7 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full transition-opacity',
                isVisible ? 'opacity-100' : 'opacity-25',
              )}
              style={{ backgroundColor: meta.color }}
            />

            <Button
              aria-label={isVisible ? `隐藏${meta.label}` : `显示${meta.label}`}
              className={cn(
                'absolute right-1 top-1/2 h-auto min-h-0 -translate-y-1/2 rounded px-1 py-0.5 text-[10px] font-medium transition-colors',
                isSelected ? 'text-white/90 hover:bg-white/15' : 'text-muted-foreground hover:bg-accent',
              )}
              onClick={(e) => {
                e.stopPropagation()
                toggleSubsystem(subsystem)
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isVisible ? '显' : '隐'}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
