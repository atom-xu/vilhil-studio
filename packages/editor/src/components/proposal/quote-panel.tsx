'use client'

import { useScene } from '@pascal-app/core'
import type { Subsystem } from '@pascal-app/core'
import { getDeviceDefinition, SUBSYSTEM_META } from '@vilhil/smarthome'
import { X } from 'lucide-react'
import { useMemo } from 'react'
import { useShallow } from 'zustand/shallow'
import { cn } from '../../lib/utils'

interface QuoteItem {
  id: string
  name: string
  subsystem: Subsystem
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface QuotePanelProps {
  className?: string
  isOpen: boolean
  onClose: () => void
  items?: QuoteItem[]
}

/**
 * 报价面板
 * 显示设备清单和报价明细
 */
export function QuotePanel({ className, isOpen, onClose, items = [] }: QuotePanelProps) {
  const nodes = useScene(useShallow((s: any) => s.nodes))
  const allNodes = useMemo(() => Object.values(nodes), [nodes])
  const deviceNodes = useMemo(() => allNodes.filter((n: any) => n?.type === 'device'), [allNodes])

  // 如果没有传入报价项，从设备节点生成（价格来自产品目录）
  const displayItems: QuoteItem[] =
    items.length > 0
      ? items
      : deviceNodes.map((n: any) => {
          const device = n
          const def = device.productId ? getDeviceDefinition(device.productId) : undefined
          const unitPrice = def?.price ?? 0
          return {
            id: device.id,
            name: device.productName || def?.name || '未知设备',
            subsystem: device.subsystem,
            quantity: 1,
            unitPrice,
            totalPrice: unitPrice,
          }
        })

  // 按子系统分组
  const groupedItems = displayItems.reduce((acc, item) => {
    if (!acc[item.subsystem]) {
      acc[item.subsystem] = []
    }
    acc[item.subsystem].push(item)
    return acc
  }, {} as Record<Subsystem, QuoteItem[]>)

  const totalPrice = displayItems.reduce((sum, item) => sum + item.totalPrice, 0)

  if (!isOpen) return null

  return (
    <div
      className={cn(
        'absolute right-4 top-4 z-30 w-80 rounded-2xl border border-border/40 bg-background/95 shadow-lg backdrop-blur-xl',
        className
      )}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <h2 className="font-semibold text-foreground text-lg">报价明细</h2>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-accent/50"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 内容 */}
      <div className="max-h-[60vh] overflow-y-auto p-4">
        {Object.entries(groupedItems).map(([subsystem, subsystemItems]) => {
          const meta = SUBSYSTEM_META[subsystem as Subsystem]
          const subsystemTotal = subsystemItems.reduce((sum, item) => sum + item.totalPrice, 0)

          return (
            <div key={subsystem} className="mb-4">
              {/* 子系统标题 */}
              <div className="mb-2 flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="font-medium text-foreground text-sm">{meta.label}</span>
                <span className="text-muted-foreground text-xs">({subsystemItems.length})</span>
              </div>

              {/* 设备列表 */}
              <div className="space-y-1 pl-5">
                {subsystemItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-1 text-sm"
                  >
                    <span className="text-muted-foreground truncate">{item.name}</span>
                    <span className="font-mono text-foreground">
                      ¥{item.totalPrice.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              {/* 子系统小计 */}
              <div className="mt-2 flex items-center justify-between border-t border-border/20 pl-5 pt-2">
                <span className="text-muted-foreground text-xs">小计</span>
                <span className="font-mono font-medium text-foreground">
                  ¥{subsystemTotal.toLocaleString()}
                </span>
              </div>
            </div>
          )
        })}

        {displayItems.length === 0 && (
          <div className="py-8 text-center text-muted-foreground text-sm">暂无设备数据</div>
        )}
      </div>

      {/* 底部总计 */}
      <div className="border-t border-border/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">总计</span>
          <span className="font-mono text-xl font-bold text-primary">
            ¥{totalPrice.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
