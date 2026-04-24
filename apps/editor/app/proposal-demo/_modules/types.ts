import type { AnyNode, AnyNodeId, DeviceNode, WallNode } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import type { SceneGraph } from '@pascal-app/editor'

const LOCAL_STORAGE_KEY = 'pascal-editor-scene'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface OpeningData {
  id: string
  wallId: string
  kind: 'window' | 'door'
  position: [number, number, number]  // 墙局部坐标 [沿墙距起点, 中心高度, 0]
  width: number
  height: number
}

export interface DeviceData {
  id: string
  name: string         // 房间名（来自 zone.name），用作灯标签
  renderType: string
  position: [number, number, number]
  on: boolean
  brightness: number   // 0-100
  colorTemp: number    // 2700-6500K
  beamAngle: number    // degrees
}

export interface ConvertedWall {
  start: { x: number; y: number }
  end: { x: number; y: number }
  thickness: number
  height: number
  id: string
}

export interface SlabData {
  polygon: [number, number][]    // 多边形外轮廓点（2D，Pascal 坐标）
  holes: [number, number][][]    // 多边形孔洞（每个孔洞是一组点）
}

export interface ItemData {
  id: string
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  asset: {
    id: string
    src: string
    offset: [number, number, number]
    rotation: [number, number, number]
    scale: [number, number, number]
    dimensions: [number, number, number]
  }
}

// ─── 房间灯位计算工具 ──────────────────────────────────────────────────────────

/** 射线法判断 [x, z] 是否在多边形内 */
export function pointInPoly(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!, [xj, zj] = poly[j]!
    if (((zi > z) !== (zj > z)) && x < (xj - xi) * (z - zi) / (zj - zi) + xi)
      inside = !inside
  }
  return inside
}

/**
 * 根据房间多边形，计算均匀分布的灯具位置 [x, z][]
 * - 面积估算灯具数：~1 盏/12m²，上限 4 盏（避免过多）
 * - 格点采样 → 多边形过滤 → 贪心最远点选取（覆盖最均匀）
 */
export function computeLightPositions(poly: [number, number][]): [number, number][] {
  if (poly.length < 3) return []

  // Shoelace 面积
  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const pi = poly[i]!, pj = poly[(i + 1) % poly.length]!
    area += pi[0] * pj[1] - pj[0] * pi[1]
  }
  area = Math.abs(area) / 2

  // 灯具数：按面积线性，最少 1、最多 4
  const numLights = Math.max(1, Math.min(4, Math.round(area / 12)))

  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)

  // 格点步长：让每盏灯覆盖约 numLights 等份，再加一点余量
  const spacing = Math.sqrt(area / numLights) * 0.85
  const cols = Math.max(1, Math.ceil((maxX - minX) / spacing))
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / spacing))
  const stepX = (maxX - minX) / cols
  const stepZ = (maxZ - minZ) / rows

  // 格点居中于每格，过滤到多边形内部
  const candidates: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minX + stepX * (c + 0.5)
      const z = minZ + stepZ * (r + 0.5)
      if (pointInPoly(x, z, poly)) candidates.push([x, z])
    }
  }

  if (candidates.length === 0) {
    // 兜底：质心
    return [[xs.reduce((a, b) => a + b) / xs.length, zs.reduce((a, b) => a + b) / zs.length]]
  }

  if (candidates.length <= numLights) return candidates

  // 贪心最远点采样：从最靠 bbox 中心的候选点开始，逐步选离已选集合最远的点
  const bcx = (minX + maxX) / 2, bcz = (minZ + maxZ) / 2
  candidates.sort((a, b) =>
    Math.hypot(a[0] - bcx, a[1] - bcz) - Math.hypot(b[0] - bcx, b[1] - bcz)
  )
  const sel: [number, number][] = [candidates[0]!]
  while (sel.length < numLights) {
    let bestDist = -Infinity, bestIdx = -1
    for (let i = 0; i < candidates.length; i++) {
      const [cx, cz] = candidates[i]!
      const minD = Math.min(...sel.map(([sx, sz]) => Math.hypot(cx - sx, cz - sz)))
      if (minD > bestDist) { bestDist = minD; bestIdx = i }
    }
    if (bestIdx < 0) break
    sel.push(candidates[bestIdx]!)
  }
  return sel
}

export interface RoomCentroid {
  id: string
  label: string
  cx: number      // 3D x（质心，用于放置开关按钮）
  cz: number      // 3D z
  radius: number  // 整体覆盖半径
  width: number   // 房间在 X 轴上的跨度
  depth: number   // 房间在 Z 轴上的跨度
  lightPositions: [number, number][]  // 均匀分布的灯具位置 [x, z][]
}

export interface SceneSeed {
  walls: ConvertedWall[]
  openingsByWall: Record<string, OpeningData[]>
  devices: DeviceData[]
  /**
   * 本楼层所有子系统的原始 DeviceNode（去掉 lighting 过滤）—— 供新的 DeviceRenderer
   * 路径使用。lighting 设备仍由上面的 DemoStructure 自定义渲染（保留既有视觉质感），
   * 所以这里只在下方渲染非 lighting 子系统，避免双层重叠。
   */
  allDeviceNodes: DeviceNode[]
  slabs: SlabData[]              // 楼板节点（来自场景图，不是栅格化）
  items: ItemData[]              // 家具节点（GLB 资产）
  roomCentroids: RoomCentroid[]  // 每个房间的中心点，用于 base lighting
  bbox: { cx: number; cz: number; w: number; d: number }
  buildingName: string
  levelId: string
  levelName: string
  northAngle: number   // 顺时针度数，0 = 上北下南
  /** 项目内所有楼层（供 FloorSwitcher 切换；只 1 层时前端自动隐藏 switcher） */
  availableLevels: AvailableLevel[]
}

export interface AvailableLevel {
  id: string
  name: string
  level: number       // 楼层号（负 = 地下，0 = 一层，正 = 楼上）
  wallCount: number
  deviceCount: number
  area: number        // 粗略面积 m²，从墙 bbox 估
}

// ─── 数据加载 ─────────────────────────────────────────────────────────────────

export function loadSeed(requestedLevelId?: string): SceneSeed | null {
  if (typeof window === 'undefined') return null
  let raw: SceneGraph
  try {
    const txt = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!txt) return null
    raw = JSON.parse(txt) as SceneGraph
  } catch {
    return null
  }
  if (!raw.nodes) return null

  const all = Object.values(raw.nodes) as any[]
  const buildings = all.filter((n) => n.type === 'building')
  const buildingName = buildings[0]?.name ?? '建筑'

  const rawWalls = all.filter((n) => n.type === 'wall') as WallNode[]
  const wallsByLevel: Record<string, WallNode[]> = {}
  for (const w of rawWalls) {
    const pid = w.parentId as string
    if (!pid) continue
    ;(wallsByLevel[pid] ??= []).push(w)
  }

  // ── 计算"可用楼层"列表 —— 供 FloorSwitcher 使用 ───────────────────────────
  // 只收录"至少有 1 面墙"的楼层（空楼层 demo 展示无意义）
  const availableLevels: AvailableLevel[] = []
  for (const [lid, ws] of Object.entries(wallsByLevel)) {
    if (ws.length === 0) continue
    const levelN = raw.nodes[lid] as any
    if (!levelN || levelN.type !== 'level') continue
    let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity
    for (const w of ws) {
      mnX = Math.min(mnX, w.start[0], w.end[0])
      mxX = Math.max(mxX, w.start[0], w.end[0])
      mnZ = Math.min(mnZ, w.start[1], w.end[1])
      mxZ = Math.max(mxZ, w.start[1], w.end[1])
    }
    const deviceCount = all.filter(
      (n) => n.type === 'device' && n.parentId === lid,
    ).length
    availableLevels.push({
      id: lid,
      name: (levelN.name as string) ?? `L${(levelN.level as number) ?? 0}`,
      level: (levelN.level as number) ?? 0,
      wallCount: ws.length,
      deviceCount,
      area: Math.round((mxX - mnX) * (mxZ - mnZ)),
    })
  }
  availableLevels.sort((a, b) => b.level - a.level) // 顶层在上，地下在下

  // ── 选择当前展示楼层 —— 优先请求的 id，否则挑墙体最多的 ────────────────
  let livingLevelId: string | null = null
  if (requestedLevelId && wallsByLevel[requestedLevelId]) {
    livingLevelId = requestedLevelId
  } else {
    let maxCount = 0
    for (const [lid, ws] of Object.entries(wallsByLevel)) {
      if (ws.length > maxCount) { maxCount = ws.length; livingLevelId = lid }
    }
  }
  const targetWalls = livingLevelId ? wallsByLevel[livingLevelId] ?? [] : []
  if (targetWalls.length === 0) return null

  const levelNode = livingLevelId ? (raw.nodes[livingLevelId] as any) : null
  const levelName = levelNode?.name ?? '楼层'

  // 收集窗户和门，按 wallId 分组（Pascal schema 用 wallId，不是 parentId）
  const openingsByWall: Record<string, OpeningData[]> = {}
  for (const n of all) {
    if (n.type !== 'window' && n.type !== 'door') continue
    const wid = (n.wallId ?? n.parentId) as string
    if (!wid) continue
    ;(openingsByWall[wid] ??= []).push({
      id:       n.id,
      wallId:   wid,
      kind:     n.type as 'window' | 'door',
      position: (n.position ?? [0, n.type === 'door' ? (n.height ?? 2.1) / 2 : 1.2, 0]) as [number, number, number],
      width:    n.width  ?? (n.type === 'door' ? 0.9 : 1.5),
      height:   n.height ?? (n.type === 'door' ? 2.1 : 1.2),
    })
  }

  // 收集当前楼层的楼板节点（polygon + holes，编辑器在数据层就已经算好了）
  const slabs: SlabData[] = []
  for (const n of all) {
    if (n.type !== 'slab') continue
    if (n.parentId !== livingLevelId) continue
    const poly = (n.polygon ?? []) as [number, number][]
    if (poly.length < 3) continue
    slabs.push({
      polygon: poly,
      holes: (n.holes ?? []) as [number, number][][],
    })
  }

  // 收集当前楼层的灯具设备
  const devices: DeviceData[] = []
  for (const n of all) {
    if (n.type !== 'device' || n.subsystem !== 'lighting') continue
    if (n.parentId !== livingLevelId) continue
    const st  = (n.state  as any) ?? {}
    const par = (n.params as any) ?? {}
    devices.push({
      id:         n.id,
      name:       (n.name as string) ?? '灯光',
      renderType: (n.renderType as string) ?? 'downlight',
      position:   (n.position ?? [0, 2.7, 0]) as [number, number, number],
      on:         (st.on        as boolean) ?? false,
      brightness: (st.brightness as number) ?? 100,
      colorTemp:  (st.colorTemp  as number) ?? 3000,
      beamAngle:  (par.beamAngle as number) ?? 30,
    })
  }

  // 收集当前楼层的家具节点
  const items: ItemData[] = []
  for (const n of all) {
    if (n.type !== 'item') continue
    if (n.parentId !== livingLevelId) continue
    const asset = n.asset as any
    if (!asset?.src) continue
    items.push({
      id:       n.id,
      name:     (n.name as string) ?? asset.name ?? '家具',
      position: (n.position ?? [0, 0, 0]) as [number, number, number],
      rotation: (n.rotation ?? [0, 0, 0]) as [number, number, number],
      scale:    (n.scale    ?? [1, 1, 1]) as [number, number, number],
      asset: {
        id:         asset.id,
        src:        asset.src,
        offset:     (asset.offset   ?? [0, 0, 0]) as [number, number, number],
        rotation:   (asset.rotation ?? [0, 0, 0]) as [number, number, number],
        scale:      (asset.scale    ?? [1, 1, 1]) as [number, number, number],
        dimensions: (asset.dimensions ?? [1, 1, 1]) as [number, number, number],
      },
    })
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  const walls: ConvertedWall[] = targetWalls.map((w) => {
    minX = Math.min(minX, w.start[0], w.end[0])
    maxX = Math.max(maxX, w.start[0], w.end[0])
    minZ = Math.min(minZ, w.start[1], w.end[1])
    maxZ = Math.max(maxZ, w.start[1], w.end[1])
    return {
      id:        w.id,
      start:     { x: w.start[0], y: w.start[1] },
      end:       { x: w.end[0],   y: w.end[1]   },
      thickness: w.thickness ?? 0.24,
      height:    w.height    ?? 2.7,
    }
  })

  // 计算每个房间（空间）的质心和覆盖半径，供 base lighting 层使用
  // 优先级：zone 节点（用户定义的空间，有名字和多边形）> slab 节点 > bbox 兜底
  const roomCentroids: RoomCentroid[] = []

  // ── 层级 id 集合，用于两级查找 ─────────────────────────────────────────
  // zone 直接挂在 level 下
  const zoneNodes = all.filter((n: any) =>
    n.type === 'zone' && n.parentId === livingLevelId
  )

  // ── 优先使用 zone 节点（每个 zone = 一个用户定义的空间）──────────────
  for (const zone of zoneNodes) {
    const poly = (zone.polygon ?? []) as [number, number][]
    if (poly.length < 3) continue
    const xs = poly.map((p: [number, number]) => p[0])
    const ys = poly.map((p: [number, number]) => p[1])
    const bMinX = Math.min(...xs), bMaxX = Math.max(...xs)
    const bMinY = Math.min(...ys), bMaxY = Math.max(...ys)
    const cx = xs.reduce((a: number, b: number) => a + b, 0) / xs.length
    const cy = ys.reduce((a: number, b: number) => a + b, 0) / ys.length
    const width = bMaxX - bMinX
    const depth = bMaxY - bMinY
    const radius = Math.hypot(width, depth) * 0.55
    const label = (zone.name as string) || `空间 ${roomCentroids.length + 1}`
    roomCentroids.push({ id: zone.id as string, label, cx, cz: cy, radius, width, depth, lightPositions: computeLightPositions(poly) })
  }

  // ── 若无 zone，回退到 slab 节点（直接挂 level 或挂 zone 的子节点）──
  if (roomCentroids.length === 0) {
    // 收集本楼层所有 slab（直接 parentId=levelId，或 parentId 是本楼层 zone 的）
    const levelZoneIds = new Set(zoneNodes.map((z: any) => z.id as string))
    const slabNodesAll = all.filter((n: any) =>
      n.type === 'slab' &&
      (n.parentId === livingLevelId || levelZoneIds.has(n.parentId as string))
    )
    for (const sn of slabNodesAll) {
      const poly = (sn.polygon ?? []) as [number, number][]
      if (poly.length < 3) continue
      const xs = poly.map((p: [number, number]) => p[0])
      const ys = poly.map((p: [number, number]) => p[1])
      const bMinX = Math.min(...xs), bMaxX = Math.max(...xs)
      const bMinY = Math.min(...ys), bMaxY = Math.max(...ys)
      const cx = xs.reduce((a: number, b: number) => a + b, 0) / xs.length
      const cy = ys.reduce((a: number, b: number) => a + b, 0) / ys.length
      const width = bMaxX - bMinX
      const depth = bMaxY - bMinY
      const radius = Math.hypot(width, depth) * 0.55
      const label = (sn.name as string) || `空间 ${roomCentroids.length + 1}`
      roomCentroids.push({ id: sn.id as string, label, cx, cz: cy, radius, width, depth, lightPositions: computeLightPositions(poly) })
    }
  }

  // ── 最终兜底：没有任何空间节点，用 bbox 中心放一个主照明 ─────────────
  if (roomCentroids.length === 0) {
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const width = maxX - minX
    const depth = maxZ - minZ
    const radius = Math.hypot(width, depth) * 0.55
    roomCentroids.push({ id: 'room-fallback', label: '主照明', cx, cz, radius, width, depth, lightPositions: [[cx, cz]] })
  }

  // ── 收集本楼层全部 device 节点（所有子系统，不再过滤 lighting）──────────
  // 这部分被新的 DeviceRenderer + DeviceEffects 使用；lighting 仍由既有的
  // DemoStructure 自定义渲染，所以我们在下游只渲染非 lighting 设备。
  const allDeviceNodes: DeviceNode[] = []
  for (const n of all) {
    if (n.type !== 'device') continue
    if (n.parentId !== livingLevelId) continue
    allDeviceNodes.push(n as DeviceNode)
  }

  // ── 喂给 useScene —— 新 DeviceRenderer / overlay 都从 store 读取 ──────
  try {
    useScene
      .getState()
      .setScene(raw.nodes as Record<AnyNodeId, AnyNode>, (raw.rootNodeIds ?? []) as AnyNodeId[])
  } catch (err) {
    // 加载失败不致命 —— 既有渲染路径仍然工作
    console.warn('[proposal-demo] useScene.setScene 失败，将仅走旧渲染路径:', err)
  }

  return {
    walls,
    openingsByWall,
    devices,
    allDeviceNodes,
    slabs,
    items,
    roomCentroids,
    bbox: {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      w: maxX - minX,
      d: maxZ - minZ,
    },
    buildingName,
    levelId: livingLevelId as string,
    levelName,
    northAngle: (levelNode?.northAngle as number) ?? 0,
    availableLevels,
  }
}
