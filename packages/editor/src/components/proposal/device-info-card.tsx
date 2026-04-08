'use client'

import type { DeviceNode, Subsystem } from '@pascal-app/core'
import { SUBSYSTEM_META, useDevice } from '@vilhil/smarthome'
import { Lock, Power, Sun, Thermometer, Unlock } from 'lucide-react'
import { cn } from '../../lib/utils'

interface DeviceInfoCardProps {
  device: DeviceNode
  className?: string
}

/**
 * 设备信息卡片
 * 显示设备详情和控制按钮
 */
export function DeviceInfoCard({ device, className }: DeviceInfoCardProps) {
  const { state, setState } = useDevice(device.id)
  const meta = SUBSYSTEM_META[device.subsystem as Subsystem]

  const isOn = state?.on ?? false

  return (
    <div
      className={cn(
        'w-64 rounded-2xl border border-border/40 bg-background/95 p-4 shadow-lg backdrop-blur-xl',
        className
      )}
    >
      {/* 头部 */}
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: meta.color }}
        >
          <DeviceIcon subsystem={device.subsystem as Subsystem} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground truncate">{device.productName || '设备'}</h3>
          <p className="text-muted-foreground text-xs">{meta.label}</p>
        </div>
      </div>

      {/* 控制区域 */}
      <div className="space-y-3">
        {/* 开关按钮 */}
        <button
          className={cn(
            'flex w-full items-center justify-between rounded-xl px-3 py-2 transition-all duration-200',
            isOn ? 'bg-accent/50' : 'bg-muted/50 hover:bg-muted'
          )}
          onClick={() => setState({ on: !isOn })}
          type="button"
        >
          <span className="text-sm">{isOn ? '开启' : '关闭'}</span>
          <div
            className={cn(
              'h-5 w-9 rounded-full p-0.5 transition-colors duration-200',
              isOn ? 'bg-green-500' : 'bg-muted-foreground/30'
            )}
          >
            <div
              className={cn(
                'h-4 w-4 rounded-full bg-white transition-transform duration-200',
                isOn ? 'translate-x-4' : 'translate-x-0'
              )}
            />
          </div>
        </button>

        {/* 亮度滑块 - 仅灯光 */}
        {device.subsystem === 'lighting' && isOn && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Sun className="h-3 w-3" />
              <span>{state?.brightness ?? 100}%</span>
            </div>
            <input
              className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              max={100}
              min={0}
              onChange={(e) => setState({ brightness: Number(e.target.value) })}
              type="range"
              value={state?.brightness ?? 100}
            />
          </div>
        )}

        {/* 温度控制 - 仅HVAC */}
        {device.subsystem === 'hvac' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Thermometer className="h-3 w-3" />
              <span>{state?.targetTemp ?? 24}°C</span>
            </div>
            <input
              className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              max={30}
              min={16}
              onChange={(e) => setState({ targetTemp: Number(e.target.value) })}
              type="range"
              value={state?.targetTemp ?? 24}
            />
          </div>
        )}

        {/* 门锁状态 - 仅安防 */}
        {device.subsystem === 'security' && (
          <button
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl py-2 transition-all duration-200',
              state?.locked
                ? 'bg-green-500/20 text-green-500'
                : 'bg-red-500/20 text-red-500'
            )}
            onClick={() => setState({ locked: !state?.locked })}
            type="button"
          >
            {state?.locked ? (
              <>
                <Lock className="h-4 w-4" />
                <span className="text-sm">已上锁</span>
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4" />
                <span className="text-sm">未上锁</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * 子系统图标
 */
function DeviceIcon({ subsystem }: { subsystem: Subsystem }) {
  switch (subsystem) {
    case 'lighting':
      return <Sun className="h-5 w-5 text-white" />
    case 'security':
      return <Lock className="h-5 w-5 text-white" />
    default:
      return <Power className="h-5 w-5 text-white" />
  }
}
