'use client'

import { useScene } from '@pascal-app/core'
import { DEVICE_CATALOG } from '@vilhil/smarthome'
import { Cpu, ListChecks, PackageCheck } from 'lucide-react'
import { useMemo } from 'react'

export function DeviceWorkspace() {
  const nodes = useScene((s) => s.nodes)

  const stats = useMemo(() => {
    const deviceNodes = Object.values(nodes).filter((n: any) => n?.type === 'device') as any[]
    const placedCountByProductId = new Map<string, number>()

    for (const node of deviceNodes) {
      const productId = `${node.productId ?? ''}`
      if (!productId) continue
      placedCountByProductId.set(productId, (placedCountByProductId.get(productId) ?? 0) + 1)
    }

    const placedTypes = Array.from(placedCountByProductId.keys()).filter((id) =>
      DEVICE_CATALOG.some((d) => d.catalogId === id),
    ).length

    const unplacedTypes = DEVICE_CATALOG.length - placedTypes

    return {
      totalDeviceNodes: deviceNodes.length,
      catalogTypes: DEVICE_CATALOG.length,
      placedTypes,
      unplacedTypes,
    }
  }, [nodes])

  return (
    <div className="h-full w-full overflow-y-auto bg-background px-6 py-5">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Cpu className="h-4 w-4" />
            设备目录
          </div>
          <div className="mt-2 font-semibold text-2xl">{stats.catalogTypes}</div>
          <div className="text-muted-foreground text-xs">可选设备型号</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <ListChecks className="h-4 w-4" />
            已入场
          </div>
          <div className="mt-2 font-semibold text-2xl">{stats.totalDeviceNodes}</div>
          <div className="text-muted-foreground text-xs">当前场景设备实例</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <PackageCheck className="h-4 w-4" />
            待入场
          </div>
          <div className="mt-2 font-semibold text-2xl">{stats.unplacedTypes}</div>
          <div className="text-muted-foreground text-xs">未放置设备型号</div>
        </div>
      </div>

      <div className="mx-auto mt-5 max-w-5xl rounded-xl border border-dashed border-border/70 bg-card/40 p-4 text-muted-foreground text-sm leading-6">
        当前为“设备方案页”，默认不显示 2D/3D 户型。请在左侧设备面板中选择设备后点击“去放置”，系统将自动切回建筑页进行拖放。
      </div>
    </div>
  )
}

