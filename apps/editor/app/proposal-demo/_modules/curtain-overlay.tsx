'use client'

/**
 * CurtainOverlay —— 窗帘 3D 场景内悬浮 pill
 *
 * 锚点：窗户中心 + 上方一点（避开窗帘 mesh）
 * 交互：
 *   - 点 pill 主体 → 快速 toggle（0% ↔ 100%）
 *   - 点 ⚙ 齿轮  → 打开 CurtainPropertyPopup（精细调节）
 *
 * 数据源：
 *   - 窗户/墙世界几何由 viewer 包的 computeWindowWorldGeometry 计算
 *   - 窗帘当前状态从 useScene.nodes[id].state.position 读
 */

import { Html } from '@react-three/drei'
import { useScene, type AnyNodeId, type DeviceNode, type WallNode, type WindowNode } from '@pascal-app/core'
import { useState } from 'react'

interface Props {
  node: DeviceNode
  /** 主点击：快速 toggle */
  onQuickToggle: () => void
  /** 齿轮点击：打开 popup */
  onOpenPopup: () => void
}

/** 计算窗帘 pill 的世界坐标（窗户中心稍上方，朝室内一点） */
function useCurtainAnchor(node: DeviceNode): {
  cx: number; cy: number; cz: number
  label: string
} | null {
  const openingId = (node.params?.openingId as string | undefined) ?? undefined
  const windowNode = useScene((s) => {
    if (!openingId) return undefined
    const n = (s.nodes as Record<string, unknown>)[openingId] as { type?: string } | undefined
    return n?.type === 'window' ? (n as WindowNode) : undefined
  })
  const wallNode = useScene((s) => {
    if (!windowNode?.wallId) return undefined
    const n = (s.nodes as Record<string, unknown>)[windowNode.wallId] as { type?: string } | undefined
    return n?.type === 'wall' ? (n as WallNode) : undefined
  })
  if (!windowNode || !wallNode) {
    // fallback：用 device.position
    const [x, y, z] = node.position
    return { cx: x, cy: y + 0.3, cz: z, label: (node.name as string) ?? '窗帘' }
  }
  // 窗中心
  const [sx, sz] = wallNode.start
  const [ex, ez] = wallNode.end
  const wallLen = Math.hypot(ex - sx, ez - sz)
  if (wallLen < 0.001) return null
  const u = (windowNode.position?.[0] ?? 0) / wallLen
  const cx = sx + (ex - sx) * u
  const cz = sz + (ez - sz) * u
  const cy = (windowNode.position?.[1] ?? 1.2) + (windowNode.height ?? 1.4) / 2 + 0.2
  return { cx, cy, cz, label: (node.name as string) ?? '窗帘' }
}

export function CurtainOverlay({ node, onQuickToggle, onOpenPopup }: Props) {
  const [hovered, setHovered] = useState(false)
  const state = useScene((s) => {
    const dn = s.nodes[node.id as AnyNodeId] as DeviceNode | undefined
    return dn?.state as Record<string, unknown> | undefined
  })
  const position = (state?.position as number | undefined) ?? 50
  const isOpen = position > 5

  const anchor = useCurtainAnchor(node)
  if (!anchor) return null

  const accent = '#5fb1ff'
  const bg = isOpen ? `${accent}1f` : 'rgba(15, 18, 26, 0.78)'
  const border = isOpen ? `${accent}66` : 'rgba(255,255,255,0.12)'
  const text = isOpen ? '#dceefc' : 'rgba(229,240,255,0.85)'

  return (
    <Html
      position={[anchor.cx, anchor.cy, anchor.cz]}
      center
      zIndexRange={[1, 6]}
      style={{ pointerEvents: 'none' }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          pointerEvents: 'auto',
          display: 'inline-flex', alignItems: 'stretch',
          borderRadius: 999,
          background: bg,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: `1px solid ${border}`,
          color: text,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
          boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.20)',
          transform: hovered ? 'scale(1.04)' : 'scale(1)',
          transition: 'transform 0.15s, box-shadow 0.2s, background 0.3s, border-color 0.3s, color 0.3s',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onQuickToggle() }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 12px',
            background: 'transparent', border: 'none', color: 'inherit',
            font: 'inherit', cursor: 'pointer',
          }}
        >
          {/* 状态指示：垂直短条（区别灯具的圆点）*/}
          <span style={{
            width: 4, height: 12, borderRadius: 2,
            background: isOpen ? accent : 'rgba(150,150,160,0.5)',
            boxShadow: isOpen ? `0 0 6px 1px ${accent}88` : 'none',
            transition: 'background 0.3s, box-shadow 0.3s',
          }} />
          <span>{anchor.label}</span>
          <span style={{ opacity: 0.75, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
            {isOpen ? `${position}%` : '关'}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenPopup() }}
          title="精细调节"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, padding: 0,
            background: 'transparent',
            border: 'none',
            borderLeft: `1px solid ${border}`,
            color: 'inherit', cursor: 'pointer',
            fontSize: 13, opacity: 0.85,
          }}
        >
          ⚙
        </button>
      </div>
    </Html>
  )
}
