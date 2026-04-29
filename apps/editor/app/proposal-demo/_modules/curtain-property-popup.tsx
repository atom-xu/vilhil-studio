'use client'

/**
 * CurtainPropertyPopup —— 窗帘运行时属性浮卡
 *
 * 控件：
 *   - 大开关（全开 100% / 全关 0%）
 *   - 开合度 slider 0-100%
 *
 * 持久化：通过 setDeviceState 写入 useScene.nodes[id].state.position。
 * 多目标：targetIds 数组，支持单窗帘 / 房间联动。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScene, type AnyNodeId, type DeviceNode } from '@pascal-app/core'
import { setDeviceState } from '@vilhil/smarthome'

export interface CurtainPopupTarget {
  mode: 'single' | 'room'
  ids: string[]
  title: string
  subtitle?: string
}

export interface CurtainPopupApi {
  open: (target: CurtainPopupTarget) => void
  close: () => void
}

export function useCurtainPopup(): {
  api: CurtainPopupApi
  target: CurtainPopupTarget | null
} {
  const [target, setTarget] = useState<CurtainPopupTarget | null>(null)
  const api = useMemo<CurtainPopupApi>(
    () => ({
      open: (t) => setTarget(t),
      close: () => setTarget(null),
    }),
    [],
  )
  return { api, target }
}

interface CurtainPropertyPopupProps {
  target: CurtainPopupTarget
  onClose: () => void
}

export function CurtainPropertyPopup({ target, onClose }: CurtainPropertyPopupProps) {
  // 第一只窗帘的 state 作为 popup 初值
  const firstNode = useScene((s) => {
    const id = target.ids[0]
    return id ? (s.nodes[id as AnyNodeId] as DeviceNode | undefined) : undefined
  })
  const initialPosition =
    (firstNode?.state as { position?: number } | undefined)?.position ?? 50

  const [position, setPosition] = useState(initialPosition)

  // target 切换时重置（先点 A 再点 B 的窗帘）
  const targetKey = target.ids.join(',') + ':' + target.mode
  const lastTargetKeyRef = useRef(targetKey)
  useEffect(() => {
    if (lastTargetKeyRef.current !== targetKey) {
      lastTargetKeyRef.current = targetKey
      setPosition(initialPosition)
    }
  }, [targetKey, initialPosition])

  // throttle 写 store
  const writeRafRef = useRef<number | null>(null)
  const pendingPosRef = useRef<number | null>(null)
  const flush = useCallback(() => {
    const v = pendingPosRef.current
    pendingPosRef.current = null
    writeRafRef.current = null
    if (v === null) return
    for (const id of target.ids) {
      setDeviceState(id as never, { position: v })
    }
  }, [target.ids])
  const queueWrite = useCallback(
    (v: number) => {
      pendingPosRef.current = v
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
  const setPos = useCallback(
    (v: number) => {
      setPosition(v)
      queueWrite(v)
    },
    [queueWrite],
  )
  const isOpen = position > 5
  const accent = '#5fb1ff' // 窗帘统一用淡蓝（区别灯光的暖色）

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

      {/* 全开 / 全关 双按钮 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setPos(0)}
          style={{
            flex: 1, padding: '10px',
            borderRadius: 10,
            border: `1px solid ${!isOpen && position === 0 ? `${accent}88` : 'rgba(255,255,255,0.10)'}`,
            background: !isOpen && position === 0 ? `${accent}22` : 'rgba(255,255,255,0.04)',
            color: !isOpen && position === 0 ? accent : 'rgba(166,190,222,0.7)',
            fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          关
        </button>
        <button
          type="button"
          onClick={() => setPos(100)}
          style={{
            flex: 1, padding: '10px',
            borderRadius: 10,
            border: `1px solid ${position === 100 ? `${accent}88` : 'rgba(255,255,255,0.10)'}`,
            background: position === 100 ? `${accent}22` : 'rgba(255,255,255,0.04)',
            color: position === 100 ? accent : 'rgba(166,190,222,0.7)',
            fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          开
        </button>
      </div>

      {/* 开合度 slider */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11 }}>
          <span style={{ color: 'rgba(166,190,222,0.85)' }}>开合度</span>
          <span style={{ color: 'rgba(229,240,255,0.95)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {position}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          onChange={(e) => setPos(Number(e.target.value))}
          style={{
            width: '100%', height: 20,
            accentColor: accent,
            cursor: 'pointer',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(166,190,222,0.55)', marginTop: 2 }}>
          <span>全关</span>
          <span>全开</span>
        </div>
      </div>
    </div>
  )
}
