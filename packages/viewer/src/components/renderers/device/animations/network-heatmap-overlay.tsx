'use client'

import { type DeviceNode, type WallNode, useScene } from '@pascal-app/core'
import { useMemo } from 'react'
import { useSelectedSubsystem, useSubsystemVisibility } from '@vilhil/smarthome'
import { type HeatmapAP, WifiVolumetricHeatmap } from './wifi-heatmap'

/**
 * NetworkHeatmapOverlay
 *
 * 自动从 useScene 派生 AP 数据 + 房间 AABB，并渲染 WiFi 体积热力图。
 *
 * 渲染条件：
 * 1. 网络子系统处于可见状态（visibleSubsystems.network === true）
 * 2. 当前聚焦子系统为 network（selectedSubsystem === 'network'）
 *    —— 仅在"聚焦网络"时才铺满房间的热力图，避免平时干扰
 * 3. 场景中至少有 1 个可发射信号的设备（router / ap-ceiling / ap-wall）
 *
 * AP 判定：subsystem='network' 且 renderType ∈ {router, ap-ceiling, ap-wall}
 *   - router / ap-ceiling 方向朝下（天花挂）
 *   - ap-wall 方向由 params.direction 派生（朝屋内）
 */

const HEATMAP_AP_RENDER_TYPES = new Set(['router', 'ap-ceiling', 'ap-wall'])

function degToDirXZ(deg: number): [number, number, number] {
  // direction=0 → +Z；顺时针旋转
  const rad = (deg * Math.PI) / 180
  return [Math.sin(rad), 0, Math.cos(rad)]
}

export const NetworkHeatmapOverlay = () => {
  const isVisible = useSubsystemVisibility('network')
  const selected = useSelectedSubsystem()

  // 仅在"聚焦 network"时显示——平时不干扰
  const shouldRender = isVisible && selected === 'network'

  const nodes = useScene((s) => s.nodes)

  const { aps, bbox } = useMemo(() => {
    if (!shouldRender) return { aps: [] as HeatmapAP[], bbox: null as null | { center: [number, number, number]; size: [number, number, number] } }

    const apList: HeatmapAP[] = []
    // bbox 取所有 wall 端点 + AP 位置的并集（xz 由墙决定，y 由层高 + 设备高度决定）
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    let maxWallHeight = 0

    for (const n of Object.values(nodes)) {
      if (!n) continue
      if (n.type === 'wall') {
        const w = n as WallNode
        const [sx, sz] = w.start
        const [ex, ez] = w.end
        if (sx < minX) minX = sx
        if (sx > maxX) maxX = sx
        if (sz < minZ) minZ = sz
        if (sz > maxZ) maxZ = sz
        if (ex < minX) minX = ex
        if (ex > maxX) maxX = ex
        if (ez < minZ) minZ = ez
        if (ez > maxZ) maxZ = ez
        const h = w.height ?? 2.8
        if (h > maxWallHeight) maxWallHeight = h
      } else if (n.type === 'device') {
        const d = n as DeviceNode
        if (d.subsystem !== 'network') continue
        if (!HEATMAP_AP_RENDER_TYPES.has(d.renderType)) continue

        const [x, y, z] = d.position
        // 方向：ceiling/router 朝下；wall-mount 朝屋内（由 params.direction 决定）
        let dir: [number, number, number] = [0, -1, 0]
        if (d.renderType === 'ap-wall') {
          const deg = (d.params?.direction as number | undefined) ?? 0
          dir = degToDirXZ(deg)
        }

        // 功率 / 方向性默认值（后续可读 params.custom）
        const power = (d.params?.custom as { power?: number } | undefined)?.power ?? 1.0
        const dw = (d.params?.custom as { dw?: number } | undefined)?.dw ?? (d.renderType === 'ap-wall' ? 0.6 : 0.7)

        apList.push({
          pos: [x, y, z],
          dir,
          power: Math.max(0, Math.min(1, power)),
          dw: Math.max(0, Math.min(1, dw)),
        })
      }
    }

    if (apList.length === 0 || !isFinite(minX) || !isFinite(maxX)) {
      return { aps: [] as HeatmapAP[], bbox: null }
    }

    // 扩展 bbox：padding 0.5m 避免热力图贴墙截断感
    const padXZ = 0.5
    minX -= padXZ; maxX += padXZ; minZ -= padXZ; maxZ += padXZ

    const roomH = Math.max(maxWallHeight, 2.8)
    const roomW = Math.max(maxX - minX, 1)
    const roomD = Math.max(maxZ - minZ, 1)
    const cx = (minX + maxX) / 2
    const cy = roomH / 2
    const cz = (minZ + maxZ) / 2

    return {
      aps: apList,
      bbox: { center: [cx, cy, cz] as [number, number, number], size: [roomW, roomH, roomD] as [number, number, number] },
    }
  }, [nodes, shouldRender])

  if (!shouldRender || !bbox || aps.length === 0) return null

  return <WifiVolumetricHeatmap aps={aps} roomCenter={bbox.center} roomSize={bbox.size} opacity={0.9} />
}
