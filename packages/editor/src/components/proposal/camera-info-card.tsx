'use client'

import type { ItemNode } from '@pascal-app/core'
import { Camera } from 'lucide-react'
import { cn } from '../../lib/utils'

interface CameraInfoCardProps {
  node: ItemNode
  className?: string
}

/**
 * 安防摄像头信息卡片 — Proposal L4 展示
 *
 * 展示 cameraParams：朝向 / 照射角度 / 覆盖距离
 * 附带俯视 FOV 弧形可视化（SVG）
 */
export function CameraInfoCard({ node, className }: CameraInfoCardProps) {
  const fov = node.cameraParams?.fov ?? 60
  const range = node.cameraParams?.range ?? 8
  const yaw = node.cameraParams?.yaw ?? 0

  return (
    <div
      className={cn(
        'w-64 rounded-2xl border border-border/40 bg-background/95 p-4 shadow-lg backdrop-blur-xl',
        className,
      )}
    >
      {/* 头部 */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20">
          <Camera className="h-5 w-5 text-orange-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-foreground">
            {node.name || node.asset?.name || '摄像头'}
          </h3>
          <p className="text-muted-foreground text-xs">安防摄像头</p>
        </div>
      </div>

      {/* FOV 弧形可视化 */}
      <div className="mb-3 flex justify-center">
        <FovArc fov={fov} range={range} yaw={yaw} />
      </div>

      {/* 参数列表 */}
      <div className="space-y-1.5 rounded-xl bg-muted/40 px-3 py-2.5">
        <StatRow
          label="朝向"
          value={`${yaw >= 0 ? '+' : ''}${yaw}°`}
        />
        <StatRow
          label="照射角度"
          value={`${fov}°`}
        />
        <StatRow
          label="覆盖距离"
          value={`${range} m`}
        />
      </div>
    </div>
  )
}

// ─── FOV 弧形 SVG ─────────────────────────────────────────────────────────────

function FovArc({ fov, range, yaw }: { fov: number; range: number; yaw: number }) {
  const SIZE = 100
  const cx = SIZE / 2
  const cy = SIZE / 2
  // scale range to fit inside SVG (max range → 44px radius)
  const MAX_RANGE = 20
  const r = Math.min(44, (range / MAX_RANGE) * 44)
  const halfRad = ((fov / 2) * Math.PI) / 180
  // yaw offset: 0° = forward (up in top-down view), yaw rotates clockwise
  const baseAngle = -Math.PI / 2 // "up" in SVG coords
  const yawRad = (yaw * Math.PI) / 180
  const a1 = baseAngle + yawRad - halfRad
  const a2 = baseAngle + yawRad + halfRad

  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const x2 = cx + r * Math.cos(a2)
  const y2 = cy + r * Math.sin(a2)
  const largeArc = fov > 180 ? 1 : 0

  const pathD = [
    `M ${cx} ${cy}`,
    `L ${x1} ${y1}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
    'Z',
  ].join(' ')

  // range ring labels (1/3 and 2/3 of range)
  const ringRadii = [r * 0.4, r * 0.75]

  return (
    <svg
      className="overflow-visible"
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
    >
      {/* Range rings */}
      {ringRadii.map((rr, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          fill="none"
          r={rr}
          stroke="currentColor"
          strokeDasharray="2 3"
          strokeOpacity={0.15}
          strokeWidth={0.8}
        />
      ))}
      {/* Full range ring */}
      <circle
        cx={cx}
        cy={cy}
        fill="none"
        r={r}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={0.8}
      />

      {/* FOV fill */}
      <path
        d={pathD}
        fill="rgb(249 115 22)"
        fillOpacity={0.12}
      />
      {/* FOV border lines */}
      <line
        stroke="rgb(249 115 22)"
        strokeOpacity={0.5}
        strokeWidth={1}
        x1={cx} y1={cy} x2={x1} y2={y1}
      />
      <line
        stroke="rgb(249 115 22)"
        strokeOpacity={0.5}
        strokeWidth={1}
        x1={cx} y1={cy} x2={x2} y2={y2}
      />
      {/* FOV arc */}
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
        fill="none"
        stroke="rgb(249 115 22)"
        strokeOpacity={0.7}
        strokeWidth={1.2}
      />

      {/* Camera icon dot */}
      <circle cx={cx} cy={cy} fill="rgb(249 115 22)" r={2.5} />
    </svg>
  )
}

// ─── 参数行 ────────────────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  )
}
