/**
 * VilHilEdge — React Flow 自定义边
 *
 * 参考 homelable HomelableEdge 设计：
 * - 6 种协议类型各有独特 dash 模式
 * - animated 模式：流动点动画（CSS animation + stroke-dasharray）
 * - VLAN 颜色循环（ethernet 边可附 vlanId）
 * - 速率/VLAN 标签显示
 */

import { BaseEdge, getBezierPath, useViewport } from '@xyflow/react'
import type { EdgeProps, Edge } from '@xyflow/react'
import { memo } from 'react'
import { EDGE_TYPE_CONFIG, getVlanColor } from './catalog'
import type { VilHilEdgeData } from './types'

export const VilHilEdge = memo(function VilHilEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<Edge<VilHilEdgeData>>) {
  const edgeType = data?.edgeType ?? 'ethernet'
  const animated = data?.animated ?? false
  const vlanId = data?.vlanId
  const speed = data?.speed
  const customLabel = data?.label

  const cfg = EDGE_TYPE_CONFIG[edgeType]
  const { zoom } = useViewport()
  const showLabel = zoom > 0.42   // 缩小到 42% 以下时隐藏标签

  // VLAN 边颜色优先
  const color = edgeType === 'ethernet' && vlanId ? getVlanColor(vlanId) : cfg.color

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const baseWidth = selected ? cfg.strokeWidth + 1 : cfg.strokeWidth
  const opacity = selected ? 1 : 0.7

  // 动画：snake 风格（stroke-dashoffset 滚动）
  const animationStyle: React.CSSProperties = animated
    ? {
        strokeDasharray: cfg.strokeDasharray ?? '8 4',
        animation: 'vilhil-edge-flow 1.2s linear infinite',
      }
    : {}

  // 显示标签：速率 / VLAN ID / 自定义
  const displayLabel = customLabel ?? (vlanId ? `VLAN ${vlanId}` : speed ?? null)
  const typeLabel = cfg.label

  return (
    <>
      {/* 宽透明点击区 */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="pointer-events-auto cursor-pointer"
      />

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: baseWidth,
          strokeDasharray: animated ? undefined : cfg.strokeDasharray,
          opacity,
          ...animationStyle,
        }}
        markerEnd={markerEnd}
      />

      {/* 类型标签 + 速率/VLAN（缩放 < 42% 时自动隐藏）*/}
      {showLabel && (
        <foreignObject
          x={labelX - 32}
          y={labelY - 14}
          width={64}
          height={28}
          className="pointer-events-none overflow-visible"
        >
          <div
            className="flex flex-col items-center gap-0.5"
            style={{ opacity: selected ? 1 : 0.75 }}
          >
            <span
              className="rounded px-1 py-0 text-[8px] font-semibold uppercase leading-tight"
              style={{ backgroundColor: `${color}22`, color }}
            >
              {typeLabel}
            </span>
            {displayLabel && (
              <span className="text-[8px] font-mono leading-tight text-muted-foreground/70">
                {displayLabel}
              </span>
            )}
          </div>
        </foreignObject>
      )}

      {/* 动画 keyframe（只注入一次） */}
      <style>{`
        @keyframes vilhil-edge-flow {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </>
  )
})
