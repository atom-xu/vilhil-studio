'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Network } from 'lucide-react'
import { useMemo } from 'react'

export function TopologyPanel() {
  const nodes = useScene((s) => s.nodes)
  const selectedLevelId = useViewer((s) => s.selection.levelId)

  const stats = useMemo(() => {
    const devices = Object.values(nodes).filter((n: any) => n?.type === 'device') as any[]
    const levelDevices = selectedLevelId
      ? devices.filter((d) => d.parentId === selectedLevelId)
      : devices

    const brands = new Set(levelDevices.map((d) => d.brand || 'Unknown'))
    const protocols = new Set(levelDevices.map((d) => d.params?.protocol || 'unknown'))

    return {
      total: levelDevices.length,
      brands: brands.size,
      protocols: protocols.size,
    }
  }, [nodes, selectedLevelId])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b px-3 py-2.5">
        <Network className="h-4 w-4 text-blue-400" />
        <span className="font-semibold text-foreground text-sm">拓扑</span>
      </div>

      <div className="space-y-3 p-3 text-xs">
        <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
          <div className="text-[11px] text-muted-foreground">当前设备池</div>
          <div className="mt-1 text-sm font-semibold">{stats.total} 台设备</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{stats.brands} 个品牌 · {stats.protocols} 类协议</div>
        </div>

        <div className="rounded-lg border border-border/60 bg-background px-3 py-2 leading-5 text-muted-foreground">
          <p>拓扑编辑在右侧主画布中进行。</p>
          <p className="mt-1">
            从设备池拖拽设备到画布，点击两个设备可创建连接，支持有线/无线、LAN/WAN 与品牌/协议筛选。
          </p>
        </div>
      </div>
    </div>
  )
}
