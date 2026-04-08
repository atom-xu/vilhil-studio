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
 * 子系统侧边栏 - 9大子系统图标
 * 用于提案模式，切换子系统显隐
 */
export function SubsystemBar({ className, onSubsystemClick }: SubsystemBarProps) {
  const visibleSubsystems = useDeviceState((s) => s.visibleSubsystems)
  const selectedSubsystem = useDeviceState((s) => s.selectedSubsystem)
  const selectSubsystem = useDeviceState((s) => s.selectSubsystem)
  const toggleSubsystem = useDeviceState((s) => s.toggleSubsystem)

  const handleClick = (subsystem: Subsystem) => {
    // 切换选中状态
    if (selectedSubsystem === subsystem) {
      selectSubsystem(null)
    } else {
      selectSubsystem(subsystem)
    }
    // 切换显隐
    toggleSubsystem(subsystem)
    onSubsystemClick?.(subsystem)
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-2xl border border-border/40 bg-background/95 p-2 shadow-lg backdrop-blur-xl',
        className
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
              'group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200',
              isSelected
                ? 'scale-110 shadow-lg'
                : 'hover:scale-105 hover:bg-accent/50',
              !isVisible && 'opacity-40 grayscale'
            )}
            onClick={() => handleClick(subsystem)}
            style={{
              backgroundColor: isSelected ? meta.color : undefined,
            }}
            title={meta.label}
            type="button"
          >
            {/* 子系统图标 - 使用颜色块表示 */}
            <div
              className={cn(
                'h-5 w-5 rounded-full transition-transform duration-200',
                isSelected ? 'scale-90' : 'group-hover:scale-110'
              )}
              style={{
                backgroundColor: isSelected ? '#ffffff' : meta.color,
              }}
            />

            {/* 选中指示器 */}
            {isVisible && (
              <span
                className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                style={{ backgroundColor: meta.color }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
