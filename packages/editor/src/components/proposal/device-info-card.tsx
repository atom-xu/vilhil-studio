'use client'

import type { DeviceNode, Subsystem } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import { setDeviceState, SUBSYSTEM_META } from '@vilhil/smarthome'
import { Lock, Power, Sun, Thermometer, Unlock, Wind } from 'lucide-react'
import { useCallback } from 'react'
import { cn } from '../../lib/utils'

interface DeviceInfoCardProps {
  device: DeviceNode
  className?: string
}

/**
 * 设备信息卡片 - L4 设备详情
 *
 * 状态读取：useScene（与 DeviceRenderer 同一数据源）
 * 状态写入：setDeviceState 工具函数（写入 useScene，触发 3D 重渲染）
 */
export function DeviceInfoCard({ device, className }: DeviceInfoCardProps) {
  // 直接从 useScene 读取 — 与 DeviceRenderer 使用同一数据源
  const deviceState = useScene((s) => {
    const node = s.nodes[device.id] as DeviceNode | undefined
    return (node?.state as Record<string, unknown>) ?? {}
  })

  const setState = useCallback(
    (partial: Record<string, unknown>) => {
      setDeviceState(device.id, partial)
    },
    [device.id],
  )

  const meta = SUBSYSTEM_META[device.subsystem as Subsystem]
  const isOn = (deviceState.on as boolean) ?? false

  return (
    <div
      className={cn(
        'w-64 rounded-2xl border border-border/40 bg-background/95 p-4 shadow-lg backdrop-blur-xl',
        className,
      )}
    >
      {/* 头部 */}
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${meta.color}33` }}
        >
          <DeviceIcon subsystem={device.subsystem as Subsystem} color={meta.color} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-foreground">{device.productName || '设备'}</h3>
          <p className="text-muted-foreground text-xs">{meta.label}</p>
        </div>
      </div>

      {/* 控制区域 */}
      <div className="space-y-3">
        {/* ── 开关按钮 (curtain / sensor / network 除外) */}
        {device.subsystem !== 'curtain' &&
          device.subsystem !== 'sensor' &&
          device.subsystem !== 'network' && (
            <button
              className={cn(
                'flex w-full items-center justify-between rounded-xl px-3 py-2 transition-all duration-200',
                isOn ? 'bg-accent/60' : 'bg-muted/50 hover:bg-muted',
              )}
              onClick={() => setState({ on: !isOn })}
              type="button"
            >
              <span className="text-sm">{isOn ? '已开启' : '已关闭'}</span>
              <div
                className={cn(
                  'h-5 w-9 rounded-full p-0.5 transition-colors duration-200',
                  isOn ? 'bg-green-500' : 'bg-muted-foreground/30',
                )}
              >
                <div
                  className={cn(
                    'h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                    isOn ? 'translate-x-4' : 'translate-x-0',
                  )}
                />
              </div>
            </button>
          )}

        {/* ── 亮度滑块 (灯光) */}
        {device.subsystem === 'lighting' && isOn && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Sun className="h-3 w-3" />
                <span>亮度</span>
              </div>
              <span className="tabular-nums">
                {(deviceState.brightness as number) ?? 100}%
              </span>
            </div>
            <input
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              max={100}
              min={1}
              onChange={(e) => setState({ brightness: Number(e.target.value) })}
              type="range"
              value={(deviceState.brightness as number) ?? 100}
            />
          </div>
        )}

        {/* ── 色温滑块 (灯光) */}
        {device.subsystem === 'lighting' && isOn && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold">K</span>
                <span>色温</span>
              </div>
              <span className="tabular-nums">
                {(deviceState.colorTemp as number) ?? 4000}K
              </span>
            </div>
            <div className="relative">
              <div
                className="pointer-events-none absolute inset-x-0 rounded-full"
                style={{
                  background: 'linear-gradient(to right, #ff9329, #fff5e0, #cce8ff)',
                  height: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              />
              <input
                className="relative h-1 w-full cursor-pointer appearance-none rounded-full bg-transparent"
                max={6500}
                min={2700}
                onChange={(e) => setState({ colorTemp: Number(e.target.value) })}
                step={100}
                type="range"
                value={(deviceState.colorTemp as number) ?? 4000}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground/60">
              <span>暖白 2700K</span>
              <span>冷白 6500K</span>
            </div>
          </div>
        )}

        {/* ── 目标温度 (HVAC) */}
        {device.subsystem === 'hvac' && isOn && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Thermometer className="h-3 w-3" />
                <span>目标温度</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/60">
                  当前 {(deviceState.currentTemp as number) ?? 22}°C
                </span>
                <span className="tabular-nums text-foreground">
                  → {(deviceState.targetTemp as number) ?? 24}°C
                </span>
              </div>
            </div>
            <input
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              max={30}
              min={16}
              onChange={(e) => setState({ targetTemp: Number(e.target.value) })}
              type="range"
              value={(deviceState.targetTemp as number) ?? 24}
            />
          </div>
        )}

        {/* ── 窗帘开合 (curtain) */}
        {device.subsystem === 'curtain' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Wind className="h-3 w-3" />
                <span>开合度</span>
              </div>
              <span className="tabular-nums">
                {(deviceState.position as number) ?? 0}%
              </span>
            </div>
            <input
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              max={100}
              min={0}
              onChange={(e) => setState({ position: Number(e.target.value) })}
              type="range"
              value={(deviceState.position as number) ?? 0}
            />
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: '全开', value: 100 },
                { label: '一半', value: 50 },
                { label: '全关', value: 0 },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  className={cn(
                    'rounded-lg py-1 text-xs transition-colors',
                    (deviceState.position as number) === value
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                  )}
                  onClick={() => setState({ position: value })}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 门锁 (security) */}
        {device.subsystem === 'security' && (
          <button
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl py-2 transition-all duration-200',
              (deviceState.locked as boolean)
                ? 'bg-green-500/15 text-green-400'
                : 'bg-red-500/15 text-red-400',
            )}
            onClick={() => setState({ locked: !(deviceState.locked as boolean) })}
            type="button"
          >
            {(deviceState.locked as boolean) ? (
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

        {/* ── 传感器 / 网络 — 只读 */}
        {(device.subsystem === 'sensor' || device.subsystem === 'network') && (
          <div className="rounded-xl bg-muted/40 px-3 py-2">
            <p className="text-center text-muted-foreground text-xs">
              {device.subsystem === 'sensor'
                ? (deviceState.triggered as boolean)
                  ? '⚡ 已触发'
                  : '🟢 待机中'
                : '📶 正常运行'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 子系统图标 ───────────────────────────────────────────────────────────────

function DeviceIcon({ subsystem, color }: { subsystem: Subsystem; color: string }) {
  const style = { color }
  switch (subsystem) {
    case 'lighting':
      return <Sun className="h-5 w-5" style={style} />
    case 'security':
      return <Lock className="h-5 w-5" style={style} />
    case 'hvac':
      return <Thermometer className="h-5 w-5" style={style} />
    case 'curtain':
      return <Wind className="h-5 w-5" style={style} />
    default:
      return <Power className="h-5 w-5" style={style} />
  }
}
