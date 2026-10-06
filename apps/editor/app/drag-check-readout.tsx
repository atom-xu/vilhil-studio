'use client'

import { useScene } from '@pascal-app/core'
import { useEffect, useState } from 'react'

/** Development-only visible acceptance evidence; never a production control. */
export function DragCheckReadout() {
  const nodes = useScene(s => s.nodes)
  const [enabled, setEnabled] = useState(false)
  const [history, setHistory] = useState({ tracking: true, past: 0, future: 0 })
  useEffect(() => {
    const refresh = () => { const h = useScene.temporal.getState(); setHistory({ tracking: h.isTracking, past: h.pastStates.length, future: h.futureStates.length }) }; refresh(); return useScene.temporal.subscribe(refresh)
  }, [])
  useEffect(() => { setEnabled(process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).has('dragCheck')) }, [])
  if (!enabled) return null
  const devices = Object.values(nodes).filter(n => n?.type === 'device').map(n => {
    if (!n || n.type !== 'device') return null
    return { id: n.id, floorParent: n.parentId, product: n.productId, position: n.position, rotation: n.rotation,
      wallId: n.params.wallId, wallT: n.params.wallT, wallSide: n.params.wallSide, direction: n.params.direction }
  })
  return <details className="absolute left-2 top-10 z-50 max-w-[420px] rounded border bg-background p-2 text-xs"><summary>拖动验收读数（本机开发预览）</summary><p data-testid="drag-check-history">{JSON.stringify(history)}</p><pre data-testid="drag-check-readout" className="max-h-[350px] overflow-auto">{JSON.stringify(devices, null, 2)}</pre></details>
}
