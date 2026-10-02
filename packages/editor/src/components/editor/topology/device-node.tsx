/**
 * VilHilDeviceNode — React Flow 自定义节点
 *
 * 参考 homelable 设计：
 * - 顶部：节点类型 badge + 状态指示灯（online/offline/pending/unknown）
 * - 中部：图标 + 设备名 + 品牌
 * - 底部：协议 badge + 可选 IP
 * - 多端口 Handle（switch/gateway 显示多个底部连接点）
 * - 选中时：glow box-shadow（与节点颜色同色）
 */

import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { memo } from 'react'
import { cn } from '../../../lib/utils'
import { NODE_TYPE_CONFIG, STATUS_COLOR } from './catalog'
import type { DeviceNodeData } from './types'

// Handle 样式工厂
function handleStyle(color: string) {
  return {
    background: color,
    width: 9,
    height: 9,
    border: '2px solid white',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
  } as React.CSSProperties
}

export const VilHilDeviceNode = memo(function VilHilDeviceNode({
  data,
  selected,
}: NodeProps<Node<DeviceNodeData>>) {
  const { device, topoType, status, portCount, ip, hostname, controller, assignment, parentName } =
    data

  const cfg = NODE_TYPE_CONFIG[topoType]
  const Icon = cfg.icon
  const color = cfg.color
  const statusColor = STATUS_COLOR[status]

  // 动态 glow（选中时显示发光效果，参考 homelable online+selected 的 glow）
  const glowStyle: React.CSSProperties = selected
    ? { boxShadow: `0 0 0 2px ${color}, 0 4px 16px ${color}40`, borderColor: color }
    : {}

  // 底部端口数（交换机/网关可多 Handle）
  const ports = Math.min(Math.max(portCount ?? cfg.defaultPortCount, 1), 8)
  const bottomHandleIds = Array.from({ length: ports }, (_, i) =>
    ports === 1 ? 'bottom' : `bottom-${i + 1}`,
  )

  // 角色展示
  const roleText = controller
    ? `控制器 ${controller.usedChildren}/${controller.maxChildren}`
    : assignment
      ? `→ ${parentName ?? assignment.parentId}`
      : null

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border bg-card/95 shadow-sm backdrop-blur-sm transition-all duration-150 select-none',
        status === 'offline' && 'opacity-55',
      )}
      style={{
        width: 172,
        borderLeftWidth: 3,
        borderLeftColor: color,
        borderColor: selected ? color : undefined,
        ...glowStyle,
      }}
    >
      {/* ── 顶部：类型 badge + 状态灯 ── */}
      <div className="flex items-center justify-between px-2.5 pt-2">
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {cfg.label}
        </span>
        {/* 状态指示灯 */}
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              status === 'online' && 'animate-pulse',
            )}
            style={{ backgroundColor: statusColor }}
            title={
              status === 'online'
                ? '在线'
                : status === 'offline'
                  ? '离线'
                  : status === 'pending'
                    ? '等待中'
                    : '未知'
            }
          />
        </div>
      </div>

      {/* ── 主体：图标 + 名称 + 品牌 ── */}
      <div className="flex items-start gap-2.5 px-2.5 pb-2 pt-1.5">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon className="h-[18px] w-[18px]" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground leading-tight">
            {device.name}
          </div>
          <div className="truncate text-[10px] text-muted-foreground/70">{device.brand}</div>

          {/* 协议 badge */}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {device.protocol && device.protocol !== 'unknown' && (
              <span className="rounded bg-muted px-1 py-0 text-[9px] font-medium uppercase text-muted-foreground/80">
                {device.protocol}
              </span>
            )}
            {roleText && (
              <span className="truncate text-[9px] text-muted-foreground/60">{roleText}</span>
            )}
          </div>

          {/* IP / hostname（可选） */}
          {(ip || hostname) && (
            <div className="mt-0.5 truncate text-[9px] font-mono text-muted-foreground/50">
              {hostname ?? ip}
            </div>
          )}
        </div>
      </div>

      {/* ── Top Handle ── */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        style={handleStyle(color)}
      />

      {/* ── Bottom Handles（多端口支持） ── */}
      {bottomHandleIds.map((hid, i) => {
        const fraction = ports === 1 ? 0.5 : (i + 1) / (ports + 1)
        return (
          <Handle
            key={hid}
            id={hid}
            type="source"
            position={Position.Bottom}
            style={{
              ...handleStyle(color),
              left: `${fraction * 100}%`,
              transform: 'translateX(-50%) translateY(50%)',
            }}
          />
        )
      })}
    </div>
  )
})
