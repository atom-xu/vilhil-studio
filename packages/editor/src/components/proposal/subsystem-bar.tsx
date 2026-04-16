'use client'

import type { Subsystem } from '@pascal-app/core'
import { SUBSYSTEM_META, SUBSYSTEM_ORDER } from '@vilhil/smarthome'
import { useDeviceState } from '@vilhil/smarthome'
import { cn } from '../../lib/utils'

interface SubsystemBarProps {
  className?: string
  onSubsystemClick?: (subsystem: Subsystem) => void
}

/**
 * 子系统侧边栏 — 9 大子系统图标 + 中文名称
 * 点击切换子系统显隐 / 高亮
 */
export function SubsystemBar({ className, onSubsystemClick }: SubsystemBarProps) {
  const visibleSubsystems = useDeviceState((s) => s.visibleSubsystems)
  const selectedSubsystem = useDeviceState((s) => s.selectedSubsystem)
  const selectSubsystem = useDeviceState((s) => s.selectSubsystem)
  const toggleSubsystem = useDeviceState((s) => s.toggleSubsystem)

  const handleClick = (subsystem: Subsystem) => {
    if (selectedSubsystem === subsystem) {
      selectSubsystem(null)
    } else {
      selectSubsystem(subsystem)
    }
    toggleSubsystem(subsystem)
    onSubsystemClick?.(subsystem)
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-2xl border border-border/40 bg-background/95 px-1.5 py-2 shadow-lg backdrop-blur-xl',
        className,
      )}
    >
      {SUBSYSTEM_ORDER.map((subsystem) => {
        const meta = SUBSYSTEM_META[subsystem]
        const isVisible = visibleSubsystems[subsystem]
        const isSelected = selectedSubsystem === subsystem

        return (
          <button
            key={subsystem}
            className={cn(
              'group relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-all duration-200',
              isSelected
                ? 'shadow-md'
                : 'hover:bg-accent/50',
              !isVisible && 'opacity-40 grayscale',
            )}
            onClick={() => handleClick(subsystem)}
            style={{
              backgroundColor: isSelected ? meta.color : undefined,
            }}
            type="button"
          >
            {/* 子系统色块图标 */}
            <div
              className={cn(
                'h-4 w-4 shrink-0 rounded-full transition-transform duration-200',
                isSelected ? 'scale-90' : 'group-hover:scale-110',
              )}
              style={{
                backgroundColor: isSelected ? '#ffffff' : meta.color,
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

            {/* 可见指示器 */}
            {isVisible && !isSelected && (
              <span
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
