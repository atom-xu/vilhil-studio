'use client'

/**
 * LightPropertyPopup —— 灯具运行时属性浮卡（核心新组件）
 *
 * 真智能家居体验的关键交互：
 *   - 点单灯端点 / 回路 pill / 房间 base pill 都打开同一个组件
 *   - 控件：开关 + 亮度 slider + 色温 slider
 *   - 修改实时写入 useScene store（throttle，避免狂抖）
 *
 * 多目标统一：targetIds 是数组，一个 popup 同时控制 1-N 盏灯
 *   - 1 盏 → 单灯模式
 *   - N 盏 → 回路 / 房间 / 全屋模式（值代表"统一目标"，apply 到所有 member）
 *
 * 持久化：所有改动通过 setDeviceState 写入 useScene。本地 lightStates 在 page.tsx
 * 同步更新（保证 RoomBaseLight / DemoLightBulb 立刻响应）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScene, type AnyNodeId, type DeviceNode } from '@pascal-app/core'
import { setDeviceState } from '@vilhil/smarthome'
import { LIGHTING_CONFIG } from './lighting-config'
import type { LightState } from './lighting'
import { colorTempToColor } from '@pascal-app/viewer'

export interface LightPopupTarget {
  /** 模式：决定标题和"应用到..."按钮显隐 */
  mode: 'single' | 'circuit' | 'room' | 'global'
  /** 受控 device id 列表 */
  ids: string[]
  /** 显示标题 */
  title: string
  /** 副标题（如"5 灯回路"）*/
  subtitle?: string
}

export interface LightPopupApi {
  /** 打开 popup，replace 当前目标 */
  open: (target: LightPopupTarget) => void
  /** 关闭 */
  close: () => void
}

export function useLightPopup(): {
  api: LightPopupApi
  target: LightPopupTarget | null
} {
  const [target, setTarget] = useState<LightPopupTarget | null>(null)
  const api = useMemo<LightPopupApi>(
    () => ({
      open: (t) => setTarget(t),
      close: () => setTarget(null),
    }),
    [],
  )
  return { api, target }
}

interface LightPropertyPopupProps {
  target: LightPopupTarget
  onClose: () => void
  /** 上层把改动同步到本地 lightStates，保证 RoomBaseLight / DemoLightBulb 立刻响应 */
  onApplyToLocal: (
    ids: string[],
    patch: Partial<LightState> & { colorTemp?: number },
  ) => void
}

export function LightPropertyPopup({
  target,
  onClose,
  onApplyToLocal,
}: LightPropertyPopupProps) {
  // 从 store 读第一盏灯的当前 state 作为 popup 初值
  const firstNode = useScene((s) => {
    const id = target.ids[0]
    return id ? (s.nodes[id as AnyNodeId] as DeviceNode | undefined) : undefined
  })
  const initialOn =
    (firstNode?.state as { on?: boolean } | undefined)?.on ?? false
  const initialBrightness =
    (firstNode?.state as { brightness?: number } | undefined)?.brightness ?? 80
  const initialColorTemp =
    (firstNode?.state as { colorTemp?: number } | undefined)?.colorTemp ??
    LIGHTING_CONFIG.attribute.colorTemp.default

  const [on, setOn] = useState(initialOn)
  const [brightness, setBrightness] = useState(initialBrightness)
  const [colorTemp, setColorTemp] = useState(initialColorTemp)

  // target 切换时（用户先点 A 灯再点 B 灯，popup 不关闭只换 target）
  const targetKey = target.ids.join(',') + ':' + target.mode
  const lastTargetKeyRef = useRef(targetKey)
  useEffect(() => {
    if (lastTargetKeyRef.current !== targetKey) {
      lastTargetKeyRef.current = targetKey
      setOn(initialOn)
      setBrightness(initialBrightness)
      setColorTemp(initialColorTemp)
    }
  }, [targetKey, initialOn, initialBrightness, initialColorTemp])

  // throttle 写入 store —— slider 拖动时不每帧 dispatch
  const writeRafRef = useRef<number | null>(null)
  const pendingPatchRef = useRef<Partial<LightState> & { colorTemp?: number }>({})
  const flush = useCallback(() => {
    const patch = pendingPatchRef.current
    pendingPatchRef.current = {}
    writeRafRef.current = null
    if (Object.keys(patch).length === 0) return
    for (const id of target.ids) {
      setDeviceState(id as never, patch as Record<string, unknown>)
    }
    onApplyToLocal(target.ids, patch)
  }, [target.ids, onApplyToLocal])
  const queueWrite = useCallback(
    (patch: Partial<LightState> & { colorTemp?: number }) => {
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch }
      if (writeRafRef.current === null) {
        writeRafRef.current = requestAnimationFrame(flush)
      }
    },
    [flush],
  )
  useEffect(
    () => () => {
      if (writeRafRef.current !== null) cancelAnimationFrame(writeRafRef.current)
    },
    [],
  )

  // === Handlers ===
  const handleToggleOn = () => {
    const next = !on
    setOn(next)
    queueWrite({ on: next })
  }
  const handleBrightness = (v: number) => {
    setBrightness(v)
    queueWrite({ brightness: v, on: v > 0 || on })
    if (v > 0 && !on) setOn(true)
  }
  const handleColorTemp = (v: number) => {
    setColorTemp(v)
    queueWrite({ colorTemp: v })
  }

  // 色温 slider 的视觉颜色
  const colorTempCol = colorTempToColor(colorTemp)
  const tempHex = `#${colorTempCol.getHexString()}`

  const cfg = LIGHTING_CONFIG.attribute

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        bottom: 80,
        zIndex: 60,
        width: 280,
        background: 'rgba(15, 18, 26, 0.92)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 14,
        padding: '14px 14px 12px',
        color: 'rgba(229,240,255,0.92)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{target.title}</div>
          {target.subtitle && (
            <div style={{ fontSize: 10, color: 'rgba(166,190,222,0.65)' }}>{target.subtitle}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 22, height: 22, borderRadius: 11,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(229,240,255,0.7)',
            fontSize: 14, lineHeight: '20px', cursor: 'pointer',
          }}
        >×</button>
      </div>

      {/* On/off 大开关 */}
      <button
        type="button"
        onClick={handleToggleOn}
        style={{
          width: '100%',
          padding: '10px',
          marginBottom: 14,
          borderRadius: 10,
          border: `1px solid ${on ? tempHex + '88' : 'rgba(255,255,255,0.10)'}`,
          background: on ? `${tempHex}22` : 'rgba(255,255,255,0.04)',
          color: on ? tempHex : 'rgba(166,190,222,0.7)',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        {on ? '● 已开启' : '○ 已关闭'}
      </button>

      {/* 亮度 slider */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11 }}>
          <span style={{ color: 'rgba(166,190,222,0.85)' }}>亮度</span>
          <span style={{ color: 'rgba(229,240,255,0.95)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {brightness}%
          </span>
        </div>
        <input
          type="range"
          min={cfg.brightness.min}
          max={cfg.brightness.max}
          step={cfg.brightness.step}
          value={brightness}
          onChange={(e) => handleBrightness(Number(e.target.value))}
          style={{
            width: '100%', height: 20,
            accentColor: tempHex,
            cursor: 'pointer',
          }}
        />
      </div>

      {/* 色温 slider，底色随值变化 */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11 }}>
          <span style={{ color: 'rgba(166,190,222,0.85)' }}>色温</span>
          <span style={{ color: 'rgba(229,240,255,0.95)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {colorTemp}K
          </span>
        </div>
        <div
          style={{
            position: 'relative',
            height: 8,
            borderRadius: 4,
            background: `linear-gradient(to right, ${LIGHTING_CONFIG.attribute.colorTempVisual.warm}, ${LIGHTING_CONFIG.attribute.colorTempVisual.neutral}, ${LIGHTING_CONFIG.attribute.colorTempVisual.cool})`,
            marginBottom: 4,
          }}
        >
          <input
            type="range"
            min={cfg.colorTemp.min}
            max={cfg.colorTemp.max}
            step={cfg.colorTemp.step}
            value={colorTemp}
            onChange={(e) => handleColorTemp(Number(e.target.value))}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: 0, cursor: 'pointer',
            }}
          />
          {/* 自定义滑块拇指 */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `${((colorTemp - cfg.colorTemp.min) / (cfg.colorTemp.max - cfg.colorTemp.min)) * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: 18, height: 18, borderRadius: 9,
              background: tempHex,
              border: '2px solid rgba(255,255,255,0.85)',
              boxShadow: `0 0 6px 1px ${tempHex}cc`,
              pointerEvents: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(166,190,222,0.55)' }}>
          <span>暖 {cfg.colorTemp.min}K</span>
          <span>冷 {cfg.colorTemp.max}K</span>
        </div>
      </div>
    </div>
  )
}
