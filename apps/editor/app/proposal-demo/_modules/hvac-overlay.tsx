'use client'

import type { DeviceNode } from '@pascal-app/core'
import { Search } from 'lucide-react'

/** A focus-only entry. Existing DeviceInfoCard owns all device controls. */
export function DeviceDetailEntry({ node, onEnterDetail }: { node: DeviceNode; onEnterDetail: () => void }) {
  const label = node.name || node.productName || '设备'
  return (
      <button
        type="button"
        aria-label={`查看${label}`}
        onClick={(event) => { event.stopPropagation(); onEnterDetail() }}
        className="flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full border border-border/40 bg-background/95 px-3 text-xs font-medium text-foreground shadow-lg backdrop-blur-xl"
      >
        <span>{label}</span><Search size={14} aria-hidden="true" />
      </button>
  )
}
