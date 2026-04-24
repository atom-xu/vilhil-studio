'use client'

import type { DeviceNode, Subsystem } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import { setDeviceState, SUBSYSTEM_META } from '@vilhil/smarthome'
import { Lock, Power, Sun, Thermometer, Unlock, Wind } from 'lucide-react'
import { useCallback } from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/primitives/button'

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
            <Button
              className={cn(
                'h-auto w-full justify-between rounded-xl px-3 py-2 transition-all duration-200',
                isOn ? 'bg-accent/60' : 'bg-muted/50 hover:bg-muted',
              )}
              onClick={() => setState({ on: !isOn })}
              type="button"
              variant="ghost"
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
            </Button>
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
                  background:
                    'linear-gradient(to right, rgb(255 147 41), rgb(255 245 224), rgb(204 232 255))',
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

        {/* ── 目标温度 + 冷/热/关 模式 (HVAC) */}
        {device.subsystem === 'hvac' && isOn && (
          <div className="space-y-2">
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

            {/* 冷/热/关 模式切换（hvac 专用） */}
            <div className="grid grid-cols-3 gap-1 pt-1">
              {([
                { key: 'cold', label: '制冷', color: 'text-sky-400', bg: 'bg-sky-500/15' },
                { key: 'hot',  label: '制热', color: 'text-orange-400', bg: 'bg-orange-500/15' },
                { key: 'off',  label: '关闭', color: 'text-muted-foreground', bg: 'bg-muted/60' },
              ] as const).map(({ key, label, color, bg }) => {
                const active = (deviceState.mode as string | undefined) === key
                  || (!deviceState.mode && key === 'cold')   // 未设 mode 时默认冷风
                return (
                  <Button
                    key={key}
                    className={cn(
                      'h-auto rounded-md py-1 text-[11px] transition-colors',
                      active ? `${bg} ${color}` : 'bg-muted/40 text-muted-foreground hover:bg-muted',
                    )}
                    onClick={() => setState({ mode: key })}
                    type="button"
                    variant="ghost"
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 窗帘控制 (curtain) —— 支持多层 + 百叶角度 */}
        {device.subsystem === 'curtain' && (() => {
          const layers = (device.params?.layers as Array<{ material: 'blackout' | 'sheer' }> | undefined) ?? [{ material: 'blackout' }]
          const layerPositionsRaw = (deviceState.layerPositions as number[] | undefined)
          const legacyPosition = (deviceState.position as number | undefined) ?? 0
          // 各层当前位置：优先 layerPositions[i]，层 0 fallback legacyPosition
          const getLayerPos = (i: number) => {
            if (Array.isArray(layerPositionsRaw) && layerPositionsRaw[i] !== undefined) return layerPositionsRaw[i] as number
            if (i === 0) return legacyPosition
            return 50
          }
          const setLayerPos = (i: number, value: number) => {
            const next = Array.isArray(layerPositionsRaw)
              ? [...layerPositionsRaw]
              : layers.map((_, k) => (k === 0 ? legacyPosition : 50))
            next[i] = value
            setState({ layerPositions: next, ...(i === 0 ? { position: value } : {}) })
          }
          const isVenetian = device.renderType === 'curtain-venetian'
          const slatAngle = (deviceState.slatAngleDeg as number | undefined) ?? 0
          return (
            <div className="space-y-3">
              {layers.map((layer, i) => {
                const pos = getLayerPos(i)
                const label = layer.material === 'sheer' ? '纱帘' : '布帘'
                const showLayerTag = layers.length > 1
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Wind className="h-3 w-3" />
                        <span>
                          {showLayerTag ? `第 ${i + 1} 层 · ${label}` : '开合度'}
                        </span>
                      </div>
                      <span className="tabular-nums">{pos}%</span>
                    </div>
                    <input
                      className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                      max={100}
                      min={0}
                      onChange={(e) => setLayerPos(i, Number(e.target.value))}
                      type="range"
                      value={pos}
                    />
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { label: '开', value: 0 },
                        { label: '半', value: 50 },
                        { label: '关', value: 100 },
                      ].map(({ label: l, value }) => (
                        <Button
                          key={value}
                          className={cn(
                            'h-auto rounded-md py-0.5 text-[10px] transition-colors',
                            pos === value ? 'bg-primary/20 text-primary' : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                          )}
                          onClick={() => setLayerPos(i, value)}
                          type="button"
                          variant="ghost"
                        >
                          {l}
                        </Button>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* 百叶窗独有：叶片角度 */}
              {isVenetian && (
                <div className="space-y-1.5 border-t border-border/30 pt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>叶片角度</span>
                    <span className="tabular-nums">{slatAngle}°</span>
                  </div>
                  <input
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                    max={90}
                    min={0}
                    onChange={(e) => setState({ slatAngleDeg: Number(e.target.value) })}
                    type="range"
                    value={slatAngle}
                  />
                  <div className="flex justify-between text-[9px] text-muted-foreground/60">
                    <span>平放（遮光）</span>
                    <span>垂直（透光）</span>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── 门锁 (security + door-lock 专用) */}
        {device.subsystem === 'security' && device.renderType === 'door-lock' && (
          <Button
            className={cn(
              'h-auto w-full justify-center gap-2 rounded-xl py-2 transition-all duration-200',
              (deviceState.locked as boolean)
                ? 'bg-green-500/15 text-green-400'
                : 'bg-red-500/15 text-red-400',
            )}
            onClick={() => setState({ locked: !(deviceState.locked as boolean) })}
            type="button"
            variant="ghost"
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
          </Button>
        )}

        {/* ── 安防摄像头：FOV 视场角 + 探测距离（dome / bullet 专用）
             state 优先（实时编辑），fallback 到 params（catalog 初始）*/}
        {device.subsystem === 'security' && (device.renderType === 'dome' || device.renderType === 'camera-bullet') && (() => {
          const fov = (deviceState.coverageAngle as number | undefined) ?? (device.params?.coverageAngle as number | undefined) ?? 90
          const range = (deviceState.coverageRadius as number | undefined) ?? (device.params?.coverageRadius as number | undefined) ?? 5
          return (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>视场角 FOV</span>
                  <span className="tabular-nums">{fov}°</span>
                </div>
                <input
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  max={120}
                  min={60}
                  step={5}
                  onChange={(e) => setState({ coverageAngle: Number(e.target.value) })}
                  type="range"
                  value={fov}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>探测距离</span>
                  <span className="tabular-nums">{range} m</span>
                </div>
                <input
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  max={15}
                  min={3}
                  step={0.5}
                  onChange={(e) => setState({ coverageRadius: Number(e.target.value) })}
                  type="range"
                  value={range}
                />
              </div>
            </div>
          )
        })()}

        {/* ── 传感器状态 + 参数 —— PIR / 烟感 */}
        {device.subsystem === 'sensor' && (() => {
          const triggered = Boolean(deviceState.triggered)
          const isPir = device.renderType === 'pir'
          const isSmoke = device.renderType === 'smoke'
          const radius = (deviceState.coverageRadius as number | undefined) ?? (device.params?.coverageRadius as number | undefined) ?? 5
          const sensitivity = (deviceState.sensitivity as 'low' | 'medium' | 'high' | undefined) ?? 'medium'
          const muted = Boolean(deviceState.muted)
          return (
            <div className="space-y-2.5">
              {/* 状态卡片 */}
              <div
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl px-3 py-2 transition-colors',
                  triggered ? 'bg-red-500/15 text-red-400' : 'bg-green-500/10 text-green-400',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', triggered ? 'bg-red-400 animate-pulse' : 'bg-green-400')} />
                <span className="text-xs">{triggered ? (isSmoke ? '烟雾报警中' : '检测到人体') : '待机中'}</span>
              </div>

              {/* PIR 专用：探测半径 */}
              {isPir && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>探测半径</span>
                    <span className="tabular-nums">{radius} m</span>
                  </div>
                  <input
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                    max={10}
                    min={3}
                    step={0.5}
                    onChange={(e) => setState({ coverageRadius: Number(e.target.value) })}
                    type="range"
                    value={radius}
                  />
                </div>
              )}

              {/* 灵敏度（两种共用） */}
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">灵敏度</div>
                <div className="grid grid-cols-3 gap-1">
                  {(['low', 'medium', 'high'] as const).map((lv) => (
                    <Button
                      key={lv}
                      className={cn(
                        'h-auto rounded-md py-1 text-[11px] transition-colors',
                        sensitivity === lv ? 'bg-primary/20 text-primary' : 'bg-muted/40 text-muted-foreground hover:bg-muted',
                      )}
                      onClick={() => setState({ sensitivity: lv })}
                      type="button"
                      variant="ghost"
                    >
                      {lv === 'low' ? '低' : lv === 'medium' ? '中' : '高'}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 烟感专用：静音 + 模拟触发（调试用） */}
              {isSmoke && (
                <Button
                  className={cn(
                    'h-auto w-full rounded-md py-1.5 text-[11px] transition-colors',
                    muted ? 'bg-muted/30 text-muted-foreground/60' : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                  )}
                  onClick={() => setState({ muted: !muted })}
                  type="button"
                  variant="ghost"
                >
                  {muted ? '已静音' : '静音 15 分钟'}
                </Button>
              )}
            </div>
          )
        })()}

        {/* ── 网络设备 — 只读 */}
        {device.subsystem === 'network' && (
          <div className="rounded-xl bg-muted/40 px-3 py-2">
            <p className="text-center text-muted-foreground text-xs">正常运行</p>
          </div>
        )}

        {/* ── 面板（switch / scene / dimmer）—— 最重要 1-2 项 */}
        {device.subsystem === 'panel' && (() => {
          const buttonCount = Math.max(1, (device.params?.buttonCount as number | undefined) ?? 1)
          const isDimmer = device.renderType === 'dimmer-knob'
          const isScene  = device.renderType?.startsWith('scene-')
          const brightness = (deviceState.brightness as number | undefined) ?? 0
          return (
            <div className="space-y-2.5">
              {/* 调光旋钮：亮度滑杆 */}
              {isDimmer && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>亮度</span>
                    <span className="tabular-nums">{brightness}%</span>
                  </div>
                  <input
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                    max={100}
                    min={0}
                    onChange={(e) => setState({ brightness: Number(e.target.value), on: Number(e.target.value) > 0 })}
                    type="range"
                    value={brightness}
                  />
                </div>
              )}
              {/* 场景面板：按键网格（仅展示） */}
              {isScene && (
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">场景按键（点亮 = 该按键已绑定）</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Array.from({ length: buttonCount }).map((_, i) => (
                      <div
                        key={i}
                        className="flex h-8 items-center justify-center rounded-md border border-border/30 bg-muted/40 text-muted-foreground text-[11px]"
                      >
                        键 {i + 1}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">按键与场景的绑定在"设备面板 → 按键编辑器"配置</p>
                </div>
              )}
              {/* 开关面板：状态标签 */}
              {!isDimmer && !isScene && (
                <div className={cn(
                  'rounded-xl px-3 py-2 text-center text-xs transition-colors',
                  isOn ? 'bg-green-500/15 text-green-400' : 'bg-muted/50 text-muted-foreground',
                )}>
                  <span>{buttonCount} 键开关 · {isOn ? '已触发' : '待机'}</span>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── 影音音箱 —— 音量 + 播放 */}
        {device.subsystem === 'av' && device.renderType === 'smart-speaker' && (() => {
          const volume = (deviceState.volume as number | undefined) ?? 60
          return (
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>音量</span>
                  <span className="tabular-nums">{volume}%</span>
                </div>
                <input
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  max={100}
                  min={0}
                  onChange={(e) => setState({ volume: Number(e.target.value) })}
                  type="range"
                  value={volume}
                />
              </div>
              <div className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs',
                isOn ? 'bg-blue-500/15 text-blue-400' : 'bg-muted/50 text-muted-foreground',
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', isOn ? 'bg-blue-400 animate-pulse' : 'bg-muted-foreground/40')} />
                <span>{isOn ? '正在播放' : '已暂停'}</span>
              </div>
            </div>
          )
        })()}

        {/* ── 架构（KNX 网关 / 智能主机）—— 只读 + 协议 + 挂载数 */}
        {device.subsystem === 'architecture' && (() => {
          const isKnx = device.renderType === 'knx'
          const protocolName = isKnx ? 'KNX / IP' : '全协议（KNX · Zigbee · WiFi · Matter）'
          const linkedCount = (deviceState.linkedCount as number | undefined) ?? 0
          return (
            <div className="space-y-2">
              <div className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs',
                isOn ? 'bg-amber-500/15 text-amber-400' : 'bg-muted/50 text-muted-foreground',
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', isOn ? 'bg-amber-400 animate-pulse' : 'bg-muted-foreground/40')} />
                <span>{isOn ? '运行中' : '已下线'}</span>
              </div>
              <div className="space-y-1 rounded-xl bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>协议</span>
                  <span className="text-foreground/80">{protocolName}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>在线设备</span>
                  <span className="tabular-nums text-foreground/80">{linkedCount}</span>
                </div>
              </div>
            </div>
          )
        })()}
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
