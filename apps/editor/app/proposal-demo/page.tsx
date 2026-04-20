'use client'

import type { WallNode } from '@pascal-app/core'
import type { SceneGraph } from '@pascal-app/editor'
import { Clone, Environment, Html, OrbitControls, Preload, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'

const csgEval = new Evaluator()
csgEval.useGroups = false

// ════════════════════════════════════════════════════════════════════════════
//
//  VilHil 演示渲染层 — 完全独立于编辑器 Viewer
//
//  核心技术（移植自 3Dhouse/WallGroup.jsx）：
//    节点方块 + 内缩墙段 → 合并单 mesh → 零拼缝，零 z-sorting 闪烁
//    ExtrudeGeometry with holes → 窗洞实际切开
//    顶面 cap shader → 符合光学的亮度渐变轮廓
//
// ════════════════════════════════════════════════════════════════════════════

const LOCAL_STORAGE_KEY = 'pascal-editor-scene'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface OpeningData {
  id: string
  wallId: string
  kind: 'window' | 'door'
  position: [number, number, number]  // 墙局部坐标 [沿墙距起点, 中心高度, 0]
  width: number
  height: number
}

interface DeviceData {
  id: string
  name: string         // 房间名（来自 zone.name），用作灯标签
  renderType: string
  position: [number, number, number]
  on: boolean
  brightness: number   // 0-100
  colorTemp: number    // 2700-6500K
  beamAngle: number    // degrees
}

interface ConvertedWall {
  start: { x: number; y: number }
  end: { x: number; y: number }
  thickness: number
  height: number
  id: string
}

interface SlabData {
  polygon: [number, number][]    // 多边形外轮廓点（2D，Pascal 坐标）
  holes: [number, number][][]    // 多边形孔洞（每个孔洞是一组点）
}

interface ItemData {
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
function pointInPoly(x: number, z: number, poly: [number, number][]): boolean {
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
function computeLightPositions(poly: [number, number][]): [number, number][] {
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
    sel.push(candidates[bestIdx])
  }
  return sel
}

interface RoomCentroid {
  id: string
  label: string
  cx: number      // 3D x（质心，用于放置开关按钮）
  cz: number      // 3D z
  radius: number  // 整体覆盖半径
  width: number   // 房间在 X 轴上的跨度
  depth: number   // 房间在 Z 轴上的跨度
  lightPositions: [number, number][]  // 均匀分布的灯具位置 [x, z][]
}

interface SceneSeed {
  walls: ConvertedWall[]
  openingsByWall: Record<string, OpeningData[]>
  devices: DeviceData[]
  slabs: SlabData[]              // 楼板节点（来自场景图，不是栅格化）
  items: ItemData[]              // 家具节点（GLB 资产）
  roomCentroids: RoomCentroid[]  // 每个房间的中心点，用于 base lighting
  bbox: { cx: number; cz: number; w: number; d: number }
  buildingName: string
  levelName: string
  northAngle: number   // 顺时针度数，0 = 上北下南
}

// ─── 数据加载 ─────────────────────────────────────────────────────────────────

function loadSeed(): SceneSeed | null {
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
  let livingLevelId: string | null = null
  let maxCount = 0
  for (const [lid, ws] of Object.entries(wallsByLevel)) {
    if (ws.length > maxCount) { maxCount = ws.length; livingLevelId = lid }
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

  return {
    walls,
    openingsByWall,
    devices,
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
    levelName,
    northAngle: (levelNode?.northAngle as number) ?? 0,
  }
}

const WALL_HEIGHT = 2.7
// Layer 1 = 室内专用光照层，室内光源只照这一层 → 室外地面（Layer 0）不受影响
const INTERIOR_LAYER = 1

// ─── 视角系统（Overview / Detail 两层 + Module 过滤）───────────────────────────
//
//  架构：
//    Overview（斜俯视）
//      ├─【lighting】房间胶囊 + 🔍 → Detail = 俯视该房间（浮层参数）
//      └─【其他板块】设备标签   → Detail = 单设备特写
//
//  状态机：
//    - level: 'overview' | 'detail'
//    - module: 'lighting' | 'av' | 'security' | ...
//    - targetId: detail 的目标（房间 id 或设备 id）
//

type ModuleKey = 'lighting' | 'curtain' | 'sensor' | 'panel' | 'hvac' | 'av' | 'security' | 'network'

type ViewLevel = 'overview' | 'detail'

interface ViewState {
  level: ViewLevel
  module: ModuleKey
  targetId?: string        // lighting detail → room id；其他 detail → device id
}

type Vec3Tuple = [number, number, number]

// 相机单段动画（一次推进 / 一次后退）
interface CameraShot {
  fromPos: Vec3Tuple
  fromTgt: Vec3Tuple
  toPos:   Vec3Tuple
  toTgt:   Vec3Tuple
  midPos?: Vec3Tuple                    // 贝塞尔中转点（弧线过墙顶），无则直线
  duration: number
  t: number                             // 0..1 动画进度
  onDone?: () => void                   // 落位回调（用于复合动画接力）
}

// 外部通过 ref 访问的相机 API
// play 的参数不含 t —— 由 play 内部初始化
type CameraShotInput = Omit<CameraShot, 't'>
interface CameraRigApi {
  play: (shot: CameraShotInput) => void
  isAnimating: () => boolean
  sampleCurrent: () => { pos: Vec3Tuple; tgt: Vec3Tuple }
}

// ─── 相机曲线 & 插值工具 ──────────────────────────────────────────────────────

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function bezier2(a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, t: number): Vec3Tuple {
  const u = 1 - t
  return [
    u * u * a[0] + 2 * u * t * b[0] + t * t * c[0],
    u * u * a[1] + 2 * u * t * b[1] + t * t * c[1],
    u * u * a[2] + 2 * u * t * b[2] + t * t * c[2],
  ]
}

function lerp3(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function sampleShot(shot: CameraShot, tRaw: number): { pos: Vec3Tuple; tgt: Vec3Tuple } {
  const t = easeInOutCubic(Math.min(1, Math.max(0, tRaw)))
  const pos = shot.midPos
    ? bezier2(shot.fromPos, shot.midPos, shot.toPos, t)
    : lerp3(shot.fromPos, shot.toPos, t)
  const tgt = lerp3(shot.fromTgt, shot.toTgt, t)   // target 永远直线插值
  return { pos, tgt }
}

// 弧线中转点：65% 偏终点、仅高出 0.3m → 推进为主，"上升"只是微弯不显著
function computeArcMidpoint(from: Vec3Tuple, to: Vec3Tuple): Vec3Tuple {
  const bias = 0.65
  const baseY = (from[1] + to[1]) * 0.5
  return [
    from[0] + (to[0] - from[0]) * bias,
    baseY + 0.3,
    from[2] + (to[2] - from[2]) * bias,
  ]
}

// ─── Pose Resolvers（每种视角的相机预设位姿）─────────────────────────────────

interface PoseInput {
  bboxCx: number
  bboxCz: number
  bboxSpan: number
  rooms: Array<{ id: string; cx: number; cz: number; radius: number; width: number; depth: number }>
  devices: Array<{ id: string; position: Vec3Tuple }>
}

// Canvas 相机 FOV（垂直），写死 50°（和 Canvas 设置一致）
const CAMERA_FOV_DEG = 50

// Overview：建筑外 30° 斜俯视
function resolveOverviewPose(input: PoseInput): { pos: Vec3Tuple; tgt: Vec3Tuple } {
  const dist = input.bboxSpan * 2.2
  const tgt: Vec3Tuple = [input.bboxCx, 0.6, input.bboxCz]
  const pos: Vec3Tuple = [tgt[0] + dist * 0.612, tgt[1] + dist * 0.5, tgt[2] + dist * 0.612]
  return { pos, tgt }
}

// Lighting Detail：房间近俯视（保留 8° 斜视避免 lookAt 奇异），
// xz 偏移方向继承当前相机的方位 → 不会"转正"到固定方向
// 相机至 targetY 的垂直距离 H 按 FOV + 长边精算
function resolveLightingDetailPose(
  input: PoseInput,
  roomId: string,
  fromPos?: Vec3Tuple,
): { pos: Vec3Tuple; tgt: Vec3Tuple } | null {
  const room = input.rooms.find((r) => r.id === roomId)
  if (!room) return null
  const longEdge = Math.max(room.width, room.depth)
  const halfFov  = (CAMERA_FOV_DEG * 0.5 * Math.PI) / 180
  const margin   = 1.3
  const camH     = Math.max((longEdge * 0.5) / Math.tan(halfFov) * margin, 3.0)

  // 俯视保留 14° 斜视（tan 14° ≈ 0.25）：
  //   - 远离 lookAt(up≈forward) 的奇异区（8° 在某些房间位置仍会触发轻微跳跃）
  //   - 设最小水平偏移 1.2m：保证不管房间多大、相机多高，forward 永远有明显横向分量
  const TILT_RATIO = 0.25
  const xzOffset = Math.max(camH * TILT_RATIO, 1.2)

  // 默认偏向 +z。如果提供了 fromPos 且 xz 距离足够，则沿用当前相机相对 target 的方位
  // 阈值放宽到 1.0m：如果相机几乎在目标正上方，继承的方位极其不稳定，退回默认
  let ox = 0, oz = 1
  if (fromPos) {
    const dx = fromPos[0] - room.cx
    const dz = fromPos[2] - room.cz
    const len = Math.hypot(dx, dz)
    if (len > 1.0) { ox = dx / len; oz = dz / len }
  }

  const tgt: Vec3Tuple = [room.cx, 0.1, room.cz]
  const pos: Vec3Tuple = [
    room.cx + ox * xzOffset,
    tgt[1] + camH,
    room.cz + oz * xzOffset,
  ]
  return { pos, tgt }
}

// Device Detail：设备前方 1.5m，仰角 15°
function resolveDeviceDetailPose(input: PoseInput, deviceId: string): { pos: Vec3Tuple; tgt: Vec3Tuple } | null {
  const device = input.devices.find((d) => d.id === deviceId)
  if (!device) return null
  const [dx, dy, dz] = device.position
  // 朝向房间中心的反方向（让设备"面对"相机）
  const dirToCenter = { x: input.bboxCx - dx, z: input.bboxCz - dz }
  const len = Math.hypot(dirToCenter.x, dirToCenter.z) || 1
  const nx = -dirToCenter.x / len  // 背对房间中心 = 朝外
  const nz = -dirToCenter.z / len
  const dist = 1.5
  const tgt: Vec3Tuple = [dx, dy, dz]
  const pos: Vec3Tuple = [
    dx + nx * dist,
    dy + dist * 0.28,     // 仰角 ~15°
    dz + nz * dist,
  ]
  return { pos, tgt }
}

function resolvePoseForView(
  view: ViewState,
  input: PoseInput,
  fromPos?: Vec3Tuple,   // 当前相机位置，用于继承方位（避免落位时"转正"）
): { pos: Vec3Tuple; tgt: Vec3Tuple } | null {
  if (view.level === 'overview') return resolveOverviewPose(input)
  if (!view.targetId) return resolveOverviewPose(input)
  if (view.module === 'lighting') return resolveLightingDetailPose(input, view.targetId, fromPos)
  return resolveDeviceDetailPose(input, view.targetId)
}

// ─── CameraRig：挂 Canvas 内，useFrame 每帧推进动画 ───────────────────────────

function CameraRig({
  apiRef,
  controlsRef,
}: {
  apiRef: React.MutableRefObject<CameraRigApi | null>
  controlsRef: React.MutableRefObject<any>
}) {
  const { camera } = useThree()
  const shotRef = useRef<CameraShot | null>(null)

  useEffect(() => {
    apiRef.current = {
      play: (incoming) => {
        // 打断规则：动画中再触发，从当前插值位姿接力
        if (shotRef.current) {
          const snap = sampleShot(shotRef.current, shotRef.current.t)
          shotRef.current = { ...incoming, fromPos: snap.pos, fromTgt: snap.tgt, t: 0 }
        } else {
          shotRef.current = { ...incoming, t: 0 }
        }
        // 清零 OrbitControls 的 damping 残留（sphericalDelta / panOffset）
        // 不清的话，动画结束 enable 时残留量会一次性释放造成"跳一下"
        const ctl = controlsRef.current
        if (ctl) {
          const wasDamping = ctl.enableDamping
          ctl.enableDamping = false
          ctl.update()              // enableDamping=false 时 update 会把 delta 清为 0
          ctl.enableDamping = wasDamping
          ctl.enabled = false
        }
      },
      isAnimating: () => shotRef.current !== null,
      sampleCurrent: () => {
        if (shotRef.current) return sampleShot(shotRef.current, shotRef.current.t)
        // 非动画状态：返回相机真实当前位姿
        const tgt: Vec3Tuple = controlsRef.current
          ? [controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z]
          : [0, 0, 0]
        return {
          pos: [camera.position.x, camera.position.y, camera.position.z],
          tgt,
        }
      },
    }
    return () => { apiRef.current = null }
  }, [apiRef, controlsRef, camera])

  useFrame((_, dt) => {
    const shot = shotRef.current
    if (!shot) return
    shot.t += dt / shot.duration

    if (shot.t >= 1) {
      // 落位：相机落到终点位置 + 朝向最终 target
      camera.position.set(shot.toPos[0], shot.toPos[1], shot.toPos[2])
      camera.lookAt(shot.toTgt[0], shot.toTgt[1], shot.toTgt[2])
      const ctl = controlsRef.current
      if (ctl) {
        ctl.target.set(shot.toTgt[0], shot.toTgt[1], shot.toTgt[2])
        // 清 damping delta 后再 enable，避免残留量释放造成"跳一下"
        const wasDamping = ctl.enableDamping
        ctl.enableDamping = false
        ctl.update()
        ctl.enableDamping = wasDamping
        ctl.enabled = true
      }
      const cb = shot.onDone
      shotRef.current = null
      cb?.()
      return
    }

    // 动画中：位置按贝塞尔/直线插值，朝向每帧 lookAt 当前插值 target
    // 这样相机"永远看着当前 target"，位置和朝向始终绑定，视觉上是推进/后退的自然运动
    // 奇异风险由俯视 14° tilt + 最小 1.2m xz 偏移共同消除
    const { pos, tgt } = sampleShot(shot, shot.t)
    camera.position.set(pos[0], pos[1], pos[2])
    if (controlsRef.current) controlsRef.current.target.set(tgt[0], tgt[1], tgt[2])
    camera.lookAt(tgt[0], tgt[1], tgt[2])
  })

  return null
}

// Shader 预热（首帧强制编译所有材质，避免首次视角切换时 GPU 同步编译卡顿）
function ShaderPreheat() {
  const { gl, scene, camera } = useThree()
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    try { gl.compile(scene, camera) } catch { /* 某些实现可能抛，忽略 */ }
  })
  return null
}

type RenderPresetKey = 'opslab' | 'balanced' | 'showcase' | 'smooth' | 'night'

type RenderTheme = {
  envPresetDay: 'apartment' | 'city' | 'studio' | 'warehouse'
  envPresetNight: 'night' | 'city' | 'warehouse' | 'studio'
  skyDay: string
  skyNight: string
  groundDay: string
  groundNight: string
  sunColorDay: string
  sunColorNight: string
  wallColor: string
  windowColor: string
  doorColor: string
  capColorA: string
  capColorB: string
  capOpacity: number
  padColorDay: string
  padColorNight: string
  padEmissiveDay: string
  padEmissiveNight: string
  bgColorDay: string
  bgColorNight: string
  overlayDay: string
  overlayNight: string
  panelBgDay: string
  panelBgNight: string
  panelBorderDay: string
  panelBorderNight: string
}

type RenderPreset = {
  key: RenderPresetKey
  label: string
  description: string
  toneMapping: THREE.ToneMapping
  exposure: number
  envDay: number
  envNight: number
  hemiDay: number
  hemiNight: number
  sunDay: number
  sunNight: number
  shadowMapSize: number
  shadowRadiusDay: number
  shadowRadiusNight: number
  theme: RenderTheme
}

const RENDER_PRESETS: Record<RenderPresetKey, RenderPreset> = {
  opslab: {
    key: 'opslab',
    label: 'OpenSpark',
    description: '白蓝孪生',
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1.02,
    envDay: 0.7,
    envNight: 0.2,
    hemiDay: 0.58,
    hemiNight: 0.35,
    sunDay: 1.65,
    sunNight: 0.16,
    shadowMapSize: 1024,
    shadowRadiusDay: 2,
    shadowRadiusNight: 7,
    theme: {
      envPresetDay: 'apartment',
      envPresetNight: 'city',
      skyDay: '#dce6f6',
      skyNight: '#1a2d4f',
      groundDay: '#d7deea',
      groundNight: '#101a2d',
      sunColorDay: '#ffffff',
      sunColorNight: '#8fc3ff',
      wallColor: '#e9eff8',
      windowColor: '#7fb7ff',
      doorColor: '#b8cce6',
      capColorA: '#2e87e8',
      capColorB: '#93c4ff',
      capOpacity: 0.5,
      padColorDay: '#d3e1f2',
      padColorNight: '#2b3a55',
      padEmissiveDay: '#bbd4ef',
      padEmissiveNight: '#6da7ea',
      bgColorDay: '#e3e9f3',
      bgColorNight: '#0c1422',
      overlayDay: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))',
      overlayNight: 'linear-gradient(180deg, rgba(78,140,230,0.16), rgba(9,16,28,0.12))',
      panelBgDay: 'rgba(255,255,255,0.92)',
      panelBgNight: 'rgba(18,28,46,0.72)',
      panelBorderDay: 'rgba(103,140,192,0.35)',
      panelBorderNight: 'rgba(127,171,235,0.35)',
    },
  },
  balanced: {
    key: 'balanced',
    label: '平衡',
    description: '居住演示',
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1.0,
    envDay: 0.65,
    envNight: 0.15,
    hemiDay: 0.55,
    hemiNight: 0.4,
    sunDay: 1.8,
    sunNight: 0.15,
    shadowMapSize: 1024,
    shadowRadiusDay: 2,
    shadowRadiusNight: 8,
    theme: {
      envPresetDay: 'apartment',
      envPresetNight: 'night',
      skyDay: '#d4e8ff',
      skyNight: '#1a2a3a',
      groundDay: '#c8b890',
      groundNight: '#0e1820',
      sunColorDay: '#fff4e0',
      sunColorNight: '#7bb8e8',
      wallColor: '#ccc4b8',
      windowColor: '#b8d0e8',
      doorColor: '#c8bfb0',
      capColorA: '#006FFF',
      capColorB: '#85BCFF',
      capOpacity: 0.5,
      padColorDay: '#c8c4bc',
      padColorNight: '#30333c',
      padEmissiveDay: '#c8c4bc',
      padEmissiveNight: '#8a8890',
      // 背景改垂直渐变，对齐 Ubiquiti 蓝白语言（HTML v2 sky 变量）
      // 白天：顶略深浅灰蓝 → 底更亮；夜间：深蓝灰渐变，不纯黑带灰感
      bgColorDay: 'linear-gradient(180deg, #CBD9EC 0%, #EAF0F7 100%)',
      bgColorNight: 'linear-gradient(180deg, #0F1525 0%, #1A2232 100%)',
      overlayDay: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.00))',
      overlayNight: 'linear-gradient(180deg, rgba(90,140,210,0.12), rgba(6,12,28,0.05))',
      panelBgDay: 'rgba(255,255,255,0.72)',
      panelBgNight: 'rgba(10,18,35,0.62)',
      panelBorderDay: 'rgba(0,0,0,0.08)',
      panelBorderNight: 'rgba(120,170,255,0.28)',
    },
  },
  showcase: {
    key: 'showcase',
    label: '命令中心',
    description: '数字孪生驾驶舱',
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1.14,
    envDay: 1.08,
    envNight: 0.3,
    hemiDay: 0.44,
    hemiNight: 0.3,
    sunDay: 2.6,
    sunNight: 0.24,
    shadowMapSize: 1024,
    shadowRadiusDay: 4,
    shadowRadiusNight: 10,
    theme: {
      envPresetDay: 'city',
      envPresetNight: 'city',
      skyDay: '#96c2f8',
      skyNight: '#081a36',
      groundDay: '#7392bd',
      groundNight: '#041026',
      sunColorDay: '#f7fbff',
      sunColorNight: '#6ad8ff',
      wallColor: '#9eb5cc',
      windowColor: '#5ed2ff',
      doorColor: '#84a0bb',
      capColorA: '#14ccff',
      capColorB: '#76ffe1',
      capOpacity: 0.97,
      padColorDay: '#7fa5c5',
      padColorNight: '#122845',
      padEmissiveDay: '#82cbff',
      padEmissiveNight: '#2cb8ff',
      bgColorDay: '#5f83ad',
      bgColorNight: '#020c22',
      overlayDay: 'repeating-linear-gradient(90deg, rgba(43,145,238,0.08) 0 1px, transparent 1px 22px), linear-gradient(170deg, rgba(145,228,255,0.24), rgba(10,32,67,0.02) 62%)',
      overlayNight: 'repeating-linear-gradient(90deg, rgba(36,173,255,0.14) 0 1px, transparent 1px 24px), linear-gradient(170deg, rgba(44,185,255,0.24), rgba(2,10,26,0.28) 66%)',
      panelBgDay: 'rgba(230,246,255,0.76)',
      panelBgNight: 'rgba(4,20,47,0.7)',
      panelBorderDay: 'rgba(34,113,210,0.34)',
      panelBorderNight: 'rgba(91,200,255,0.52)',
    },
  },
  smooth: {
    key: 'smooth',
    label: '巡检轻量',
    description: '移动交互优先',
    toneMapping: THREE.NeutralToneMapping,
    exposure: 0.95,
    envDay: 0.36,
    envNight: 0.14,
    hemiDay: 0.66,
    hemiNight: 0.45,
    sunDay: 1.16,
    sunNight: 0.12,
    shadowMapSize: 1024,
    shadowRadiusDay: 1,
    shadowRadiusNight: 6,
    theme: {
      envPresetDay: 'warehouse',
      envPresetNight: 'night',
      skyDay: '#e4e9f0',
      skyNight: '#1d252f',
      groundDay: '#c3c8cf',
      groundNight: '#181e27',
      sunColorDay: '#fff5df',
      sunColorNight: '#8ba5c0',
      wallColor: '#cfd1d3',
      windowColor: '#c2d0de',
      doorColor: '#c4bdb2',
      capColorA: '#9fb1c8',
      capColorB: '#dee6f0',
      capOpacity: 0.78,
      padColorDay: '#d0d0cc',
      padColorNight: '#2b313a',
      padEmissiveDay: '#d4d6d3',
      padEmissiveNight: '#7a8391',
      bgColorDay: '#b8c1cc',
      bgColorNight: '#0f141d',
      overlayDay: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.00))',
      overlayNight: 'linear-gradient(180deg, rgba(188,199,214,0.1), rgba(17,21,29,0.06))',
      panelBgDay: 'rgba(255,255,255,0.8)',
      panelBgNight: 'rgba(22,27,36,0.68)',
      panelBorderDay: 'rgba(76,86,101,0.16)',
      panelBorderNight: 'rgba(152,167,188,0.3)',
    },
  },
  night: {
    key: 'night',
    label: '夜间运维',
    description: '告警与监控',
    toneMapping: THREE.ACESFilmicToneMapping,
    exposure: 0.8,
    envDay: 0.58,
    envNight: 0.42,
    hemiDay: 0.36,
    hemiNight: 0.24,
    sunDay: 1.52,
    sunNight: 0.34,
    shadowMapSize: 1024,
    shadowRadiusDay: 3,
    shadowRadiusNight: 9,
    theme: {
      envPresetDay: 'studio',
      envPresetNight: 'night',
      skyDay: '#c4d0ff',
      skyNight: '#1f1230',
      groundDay: '#927fac',
      groundNight: '#10091b',
      sunColorDay: '#efe6ff',
      sunColorNight: '#e773ff',
      wallColor: '#b39fc0',
      windowColor: '#8d72c8',
      doorColor: '#87759a',
      capColorA: '#8e44ff',
      capColorB: '#ff5db1',
      capOpacity: 0.96,
      padColorDay: '#ab96be',
      padColorNight: '#281638',
      padEmissiveDay: '#af99c7',
      padEmissiveNight: '#c459ff',
      bgColorDay: '#7f6b9f',
      bgColorNight: '#0d0616',
      overlayDay: 'linear-gradient(180deg, rgba(230,205,255,0.16), rgba(255,255,255,0.00))',
      overlayNight: 'repeating-linear-gradient(0deg, rgba(209,96,255,0.09) 0 2px, transparent 2px 14px), linear-gradient(180deg, rgba(193,69,255,0.26), rgba(10,6,18,0.16))',
      panelBgDay: 'rgba(255,240,255,0.76)',
      panelBgNight: 'rgba(25,10,35,0.72)',
      panelBorderDay: 'rgba(136,80,199,0.31)',
      panelBorderNight: 'rgba(245,130,255,0.54)',
    },
  },
}

function parsePresetKey(value: string | null): RenderPresetKey {
  if (value === 'opslab' || value === 'showcase' || value === 'smooth' || value === 'night' || value === 'balanced') return value
  return 'opslab'
}

function getDemoChromePalette(isNight: boolean) {
  return isNight
    ? {
        bg: '#0E1C33',
        border: '#274A73',
        text: '#E8F2FF',
        text2: '#B8CCE7',
        text3: '#8FA9CA',
        track: '#162A47',
        chip: 'rgba(52,127,255,0.2)',
        chipBorder: 'rgba(100,166,255,0.5)',
        tile: 'rgba(182,216,255,0.08)',
        hover: 'rgba(114,172,255,0.12)',
      }
    : {
        bg: '#FFFFFF',
        border: '#D7E5F7',
        text: '#0E223D',
        text2: '#37557F',
        text3: '#6D87A9',
        track: '#EAF2FC',
        chip: 'rgba(0,111,255,0.12)',
        chipBorder: 'rgba(0,111,255,0.36)',
        tile: 'rgba(17,89,190,0.06)',
        hover: 'rgba(0,111,255,0.08)',
      }
}

function getPillColors(presetKey: RenderPresetKey, isNight: boolean, on: boolean) {
  if (presetKey === 'opslab') {
    return isNight
      ? {
          bg: on ? 'rgba(96,170,255,0.24)' : 'rgba(96,170,255,0.10)',
          border: on ? 'rgba(130,192,255,0.55)' : 'rgba(130,192,255,0.28)',
          text: on ? 'rgba(231,244,255,0.95)' : 'rgba(170,198,230,0.68)',
          meta: on ? 'rgba(188,224,255,0.82)' : 'rgba(141,169,199,0.48)',
        }
      : {
          bg: on ? 'rgba(44,132,235,0.24)' : 'rgba(44,132,235,0.10)',
          border: on ? 'rgba(64,150,245,0.48)' : 'rgba(64,150,245,0.24)',
          text: on ? 'rgba(19,60,110,0.95)' : 'rgba(64,98,142,0.78)',
          meta: on ? 'rgba(25,92,160,0.75)' : 'rgba(88,122,162,0.58)',
        }
  }

  if (presetKey === 'showcase') {
    return isNight
      ? {
          bg: on ? 'rgba(43,188,255,0.20)' : 'rgba(43,188,255,0.10)',
          border: on ? 'rgba(84,229,255,0.58)' : 'rgba(84,229,255,0.28)',
          text: on ? 'rgba(218,250,255,0.95)' : 'rgba(168,225,242,0.65)',
          meta: on ? 'rgba(178,241,255,0.78)' : 'rgba(132,189,206,0.48)',
        }
      : {
          bg: on ? 'rgba(40,137,237,0.30)' : 'rgba(40,137,237,0.14)',
          border: on ? 'rgba(73,184,255,0.66)' : 'rgba(73,184,255,0.36)',
          text: on ? 'rgba(236,250,255,0.95)' : 'rgba(162,205,230,0.72)',
          meta: on ? 'rgba(199,240,255,0.84)' : 'rgba(124,161,183,0.58)',
        }
  }

  if (presetKey === 'night') {
    return isNight
      ? {
          bg: on ? 'rgba(191,98,255,0.22)' : 'rgba(191,98,255,0.10)',
          border: on ? 'rgba(242,128,255,0.56)' : 'rgba(209,124,255,0.3)',
          text: on ? 'rgba(255,231,255,0.95)' : 'rgba(224,177,242,0.62)',
          meta: on ? 'rgba(253,194,255,0.78)' : 'rgba(177,131,191,0.46)',
        }
      : {
          bg: on ? 'rgba(165,101,255,0.34)' : 'rgba(165,101,255,0.16)',
          border: on ? 'rgba(244,145,255,0.66)' : 'rgba(198,124,238,0.38)',
          text: on ? 'rgba(255,237,255,0.95)' : 'rgba(222,178,236,0.72)',
          meta: on ? 'rgba(245,188,255,0.84)' : 'rgba(175,135,189,0.56)',
        }
  }

  if (presetKey === 'smooth') {
    return isNight
      ? {
          bg: on ? 'rgba(244,246,250,0.18)' : 'rgba(244,246,250,0.08)',
          border: on ? 'rgba(222,226,236,0.52)' : 'rgba(182,188,202,0.28)',
          text: on ? 'rgba(249,250,252,0.93)' : 'rgba(198,204,216,0.6)',
          meta: on ? 'rgba(224,230,241,0.72)' : 'rgba(142,149,164,0.42)',
        }
      : {
          bg: on ? 'rgba(230,233,238,0.56)' : 'rgba(205,211,220,0.34)',
          border: on ? 'rgba(181,189,202,0.72)' : 'rgba(160,168,182,0.46)',
          text: on ? 'rgba(50,56,66,0.94)' : 'rgba(82,90,103,0.64)',
          meta: on ? 'rgba(78,85,96,0.75)' : 'rgba(96,104,117,0.46)',
        }
  }

  return isNight
    ? {
        bg: on ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)',
        border: on ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.13)',
        text: on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.42)',
        meta: on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)',
      }
    : {
        bg: on ? 'rgba(245,158,11,0.35)' : 'rgba(180,120,30,0.20)',
        border: on ? 'rgba(217,119,6,0.6)' : 'rgba(180,120,30,0.35)',
        text: on ? 'rgba(60,30,0,0.95)' : 'rgba(90,55,15,0.55)',
        meta: on ? 'rgba(80,40,0,0.7)' : 'rgba(100,65,20,0.35)',
      }
}


// ─── 太阳位置计算（无需第三方库）────────────────────────────────────────────
//
//  坐标约定（Pascal 户型标准朝向：上北下南）：
//    +X = 东    -X = 西
//    +Z = 北    -Z = 南   ← 平面图"上"对应 3D +Z
//    +Y = 上
//
//  参数：
//    hour      本地时间（如 8.0 = 早8点，14.5 = 下午2点半）
//    lat       纬度，默认 31.2°N（上海）
//    dayOfYear 一年第几天，默认 100（约4月中旬）
//
//  返回：朝太阳方向的单位向量，日出前/日落后返回 null
//
function computeSunDirection(
  hour: number,
  lat = 31.2,
  dayOfYear = 100,
): [number, number, number] | null {
  const latR  = (lat * Math.PI) / 180
  // 太阳赤纬
  const declR = (23.45 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365)
  // 时角：正午=0，每小时±15°
  const ha    = ((hour - 12) * 15 * Math.PI) / 180

  // 高度角
  const sinAlt = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(ha)
  const alt    = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  if (alt <= 0.04) return null  // 低于地平线

  const cosAlt = Math.cos(alt)

  // 方位角（从正南顺时针，正值=西，负值=东）
  const cosAzRaw = (Math.sin(declR) - Math.sin(alt) * Math.sin(latR)) / (cosAlt * Math.cos(latR) + 1e-9)
  const cosAz    = Math.max(-1, Math.min(1, cosAzRaw))
  // 上午太阳在东（负方向），下午在西（正方向）
  const azFromSouth = hour <= 12 ? -Math.acos(cosAz) : Math.acos(cosAz)

  // 转换为世界坐标（+Z=北, +X=东）
  const x =  -Math.sin(azFromSouth) * cosAlt   // 东=+X, 西=-X（注意：方位角从南顺时针为正，东=-sin）
  const z =  -Math.cos(azFromSouth) * cosAlt   // 北=+Z, 南=-Z（正午太阳在南=−Z方向）
  const y =   Math.sin(alt)
  return [x, y, z]
}

// 示例：上午8点 上海纬度 春季 → 东偏北低角度阳光
// 月光方向：满月近似 = 太阳位置偏移 12 小时（月亮与太阳在天球上相对）
function computeMoonDirection(hour: number): [number, number, number] {
  const shifted = (hour + 12) % 24
  const d = computeSunDirection(shifted)
  if (d) return d
  return [0.3, 0.5, -0.4]  // fallback
}

// 获取当前实际小时数（含分钟小数）
function getRealHour() {
  const now = new Date()
  return now.getHours() + now.getMinutes() / 60
}

// ─── 墙体几何构建 — 内缩墙段 + 节点方块（零叠加，零拼缝）──────────────────────
//
//  原理：每个连接端点放一个 T×T×H 节点方块，墙段两端向内缩进 T/2（嵌入 eps）
//  使端面完全藏入节点方块内部，背面剔除后不可见。几何体完全不重叠。

/**
 * 把几何体拆成顶面 cap 和侧面 body。
 * wallHeight：用于区分顶面（y ≈ H）与底面（y ≈ 0），不依赖法线方向，
 * 这样即使法线因坐标变换被翻转也能正确识别。
 */
function splitCapBody(geoIn: THREE.BufferGeometry, wallHeight: number) {
  // ExtrudeGeometry / BoxGeometry 都是索引几何体，需先展开为非索引才能按三角面遍历
  const isIndexed = !!geoIn.index
  const geo = isIndexed ? geoIn.toNonIndexed() : geoIn
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const bP: number[] = [], bN: number[] = []
  const cP: number[] = [], cN: number[] = []
  // 只有紧贴墙顶（y ≈ wallHeight，10cm 容差）且法线朝上的面才是 cap
  // 之前用 y > midH 会把窗洞顶部（y ≈ 1.8m > 1.35m）误判为 cap → 窗顶出现蓝色
  const capYMin = wallHeight - 0.10
  for (let i = 0; i < pos.count; i += 3) {
    const avgY = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
    const isTop = nor.getY(i) > 0.9 && avgY > capYMin
    for (let v = 0; v < 3; v++) {
      const j = i + v
      const px = pos.getX(j), py = pos.getY(j), pz = pos.getZ(j)
      if (isTop) { cP.push(px, py + 0.002, pz); cN.push(0, 1, 0) }
      else       { bP.push(px, py, pz); bN.push(nor.getX(j), nor.getY(j), nor.getZ(j)) }
    }
  }
  const body = new THREE.BufferGeometry()
  body.setAttribute('position', new THREE.Float32BufferAttribute(bP, 3))
  body.setAttribute('normal',   new THREE.Float32BufferAttribute(bN, 3))
  let cap: THREE.BufferGeometry | null = null
  if (cP.length > 0) {
    cap = new THREE.BufferGeometry()
    cap.setAttribute('position', new THREE.Float32BufferAttribute(cP, 3))
    cap.setAttribute('normal',   new THREE.Float32BufferAttribute(cN, 3))
  }
  if (isIndexed) geo.dispose()
  return { body, cap }
}

/**
 * 把方向相同、端点相连的共线墙合并成一段，避免 CSG 共面面精度问题。
 */
function mergeCollinearWalls(walls: ConvertedWall[]): ConvertedWall[] {
  const ptKey = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`
  const adj = new Map<string, ConvertedWall[]>()
  for (const w of walls) {
    for (const k of [ptKey(w.start.x, w.start.y), ptKey(w.end.x, w.end.y)]) {
      if (!adj.has(k)) adj.set(k, [])
      adj.get(k)!.push(w)
    }
  }
  const used = new Set<string>()
  const result: ConvertedWall[] = []

  for (const w of walls) {
    if (used.has(w.id)) continue
    used.add(w.id)
    const dx = w.end.x - w.start.x, dz = w.end.y - w.start.y
    const len0 = Math.hypot(dx, dz)
    if (len0 < 0.001) { result.push(w); continue }
    const ux = dx / len0, uz = dz / len0

    let startPt = { ...w.start }, endPt = { ...w.end }

    // 向 end 方向延伸
    for (;;) {
      const key = ptKey(endPt.x, endPt.y)
      const next = (adj.get(key) ?? []).find(n => {
        if (used.has(n.id) || Math.abs(n.thickness - w.thickness) > 0.001) return false
        const ndx = n.end.x - n.start.x, ndz = n.end.y - n.start.y
        const nl = Math.hypot(ndx, ndz)
        return nl > 0.001 &&
          ptKey(n.start.x, n.start.y) === key &&
          Math.abs((ndx / nl) * ux + (ndz / nl) * uz - 1) < 0.01
      })
      if (!next) break
      used.add(next.id); endPt = { ...next.end }
    }

    // 向 start 方向延伸
    for (;;) {
      const key = ptKey(startPt.x, startPt.y)
      const prev = (adj.get(key) ?? []).find(n => {
        if (used.has(n.id) || Math.abs(n.thickness - w.thickness) > 0.001) return false
        const pdx = n.end.x - n.start.x, pdz = n.end.y - n.start.y
        const pl = Math.hypot(pdx, pdz)
        return pl > 0.001 &&
          ptKey(n.end.x, n.end.y) === key &&
          Math.abs((pdx / pl) * ux + (pdz / pl) * uz - 1) < 0.01
      })
      if (!prev) break
      used.add(prev.id); startPt = { ...prev.start }
    }

    result.push({ ...w, start: startPt, end: endPt })
  }
  return result
}

/**
 * 基于楼板多边形构建 Pad 几何体（与 3D 编辑器完全一致的方案）
 *
 * 原理：
 *   - 编辑器的每个 SlabNode 自带 polygon + holes（2D 点列表，已经计算好）
 *   - 直接用 THREE.Shape + ExtrudeGeometry 拉伸出 10cm 厚的板
 *   - 坐标变换：shape 在 XY 平面，拉伸后 rotateX(-π/2) 变成 XZ 平面
 *
 * 结果：Pad 精确跟随楼板外轮廓（有凸有凹），天然支持孔洞，无需栅格化。
 */
const PAD_THICKNESS = 0.10  // 10 cm
// slab.polygon 沿墙体中线；外扩量 = 墙体半厚 (0.12m) + 2cm 台阶
const PAD_OUTSET    = 0.14
// 反射层单独外扩到 2m — 让建筑外围也有反射地板（像环绕着的"倒影水面"）
const PAD_REFLECT_OUTSET = 2.0
// Pad 垂直偏移：顶面贴地面（y=0），底面在 y = -PAD_THICKNESS（-10cm）
// 从地下 10cm "填"到 0，不突出地面；重叠靠 buildPadGeo 的 dedup 解决
const PAD_Y_OFFSET  = 0

// 判断两个 polygon 是否近似重复（bbox 中心 < 0.3m 且面积差 < 20%）
// 主编辑器的"自动生成地板"有时会叠加多个几乎相同的 slab，不去重会 z-fighting
function isRedundantSlab(a: SlabData, b: SlabData): boolean {
  const bboxOf = (poly: [number, number][]) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, y] of poly) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    return { cx: (minX + maxX) * 0.5, cy: (minY + maxY) * 0.5, w: maxX - minX, h: maxY - minY }
  }
  const A = bboxOf(a.polygon)
  const B = bboxOf(b.polygon)
  const centerDist = Math.hypot(A.cx - B.cx, A.cy - B.cy)
  const areaA = A.w * A.h
  const areaB = B.w * B.h
  const areaRatio = Math.min(areaA, areaB) / Math.max(areaA, areaB, 0.001)
  return centerDist < 0.3 && areaRatio > 0.8
}

function outsetPolygon(poly: [number, number][], dist: number): [number, number][] {
  const n = poly.length
  if (n < 3 || dist === 0) return poly
  // 计算多边形朝向（正值=逆时针）
  let area = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i]!
    const [x1, y1] = poly[(i + 1) % n]!
    area += x0 * y1 - x1 * y0
  }
  const sign = area >= 0 ? 1 : -1
  // 对每条边计算向外偏移后的端点，然后相邻两条偏移线求交点
  const result: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!
    const cur  = poly[i]!
    const next = poly[(i + 1) % n]!
    // 前一段边方向
    const ax = cur[0] - prev[0], ay = cur[1] - prev[1]
    const alen = Math.hypot(ax, ay) || 1
    // 后一段边方向
    const bx = next[0] - cur[0], by = next[1] - cur[1]
    const blen = Math.hypot(bx, by) || 1
    // 两条边的外法线（向外偏移方向）
    const nax =  (ay / alen) * sign, nay = -(ax / alen) * sign
    const nbx =  (by / blen) * sign, nby = -(bx / blen) * sign
    // 平均法线
    let mx = nax + nbx, my = nay + nby
    const mlen = Math.hypot(mx, my) || 1
    mx /= mlen; my /= mlen
    // 根据内外角调整长度
    const cosHalf = nax * mx + nay * my
    const d = dist / Math.max(cosHalf, 0.3)
    result.push([cur[0] + mx * d, cur[1] + my * d])
  }
  return result
}

/** 构建 pad 顶面平面（2D Shape，不 extrude）— 给 MeshReflectorMaterial 用做倒影承载面
 * outset：向外扩展的距离，反射层通常比 visible pad 更大 */
function buildPadTopGeo(slabs: SlabData[], outset: number = PAD_OUTSET): THREE.BufferGeometry | null {
  if (slabs.length === 0) return null
  const geometries: THREE.BufferGeometry[] = []
  for (const slab of slabs) {
    const outPoly = outsetPolygon(slab.polygon, outset)
    if (outPoly.length < 3) continue
    const shape = new THREE.Shape()
    shape.moveTo(outPoly[0]![0], -outPoly[0]![1])
    for (let i = 1; i < outPoly.length; i++) shape.lineTo(outPoly[i]![0], -outPoly[i]![1])
    shape.closePath()
    for (const holePoly of slab.holes) {
      if (holePoly.length < 3) continue
      const path = new THREE.Path()
      path.moveTo(holePoly[0]![0], -holePoly[0]![1])
      for (let i = 1; i < holePoly.length; i++) path.lineTo(holePoly[i]![0], -holePoly[i]![1])
      path.closePath()
      shape.holes.push(path)
    }
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)  // XY → XZ 平面（地板在 y=0）
    geo.computeVertexNormals()
    geometries.push(geo)
  }
  if (geometries.length === 0) return null
  if (geometries.length === 1) return geometries[0]!
  // 合并
  let totalV = 0, totalI = 0
  for (const g of geometries) {
    totalV += g.attributes.position!.count
    totalI += g.index ? g.index.count : g.attributes.position!.count
  }
  const pos = new Float32Array(totalV * 3)
  const nor = new Float32Array(totalV * 3)
  const idx = new Uint32Array(totalI)
  let vo = 0, io = 0
  for (const g of geometries) {
    const gp = g.attributes.position!.array as ArrayLike<number>
    const gn = g.attributes.normal!.array as ArrayLike<number>
    pos.set(gp, vo * 3); nor.set(gn, vo * 3)
    if (g.index) {
      const gi = g.index.array as ArrayLike<number>
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i]! + vo
      io += gi.length
    } else {
      for (let i = 0; i < g.attributes.position!.count; i++) idx[io + i] = vo + i
      io += g.attributes.position!.count
    }
    vo += g.attributes.position!.count
    g.dispose()
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  merged.setAttribute('normal',   new THREE.BufferAttribute(nor, 3))
  merged.setIndex(new THREE.BufferAttribute(idx, 1))
  return merged
}

function buildPadGeo(slabs: SlabData[]): THREE.BufferGeometry | null {
  if (slabs.length === 0) return null

  // 去重：剔除和已有 slab 近似重复的多边形，避免 z-fighting
  const uniqueSlabs: SlabData[] = []
  for (const s of slabs) {
    if (uniqueSlabs.some((u) => isRedundantSlab(s, u))) continue
    uniqueSlabs.push(s)
  }

  // 把所有楼板合并为一个几何体（一个楼层可能有多个 slab node）
  const geometries: THREE.BufferGeometry[] = []

  for (const slab of uniqueSlabs) {
    const outPoly = outsetPolygon(slab.polygon, PAD_OUTSET)
    if (outPoly.length < 3) continue

    // ── 构建 Shape ──────────────────────────────────────────────────────
    // 编辑器里 polygon 是 (x, y)，其中 y 在 3D 里是 z。取反保证拉伸后朝向正确。
    const shape = new THREE.Shape()
    shape.moveTo(outPoly[0]![0], -outPoly[0]![1])
    for (let i = 1; i < outPoly.length; i++) {
      shape.lineTo(outPoly[i]![0], -outPoly[i]![1])
    }
    shape.closePath()

    // ── 加孔洞（不往外扩，孔洞原样） ───────────────────────────────────
    for (const holePoly of slab.holes) {
      if (holePoly.length < 3) continue
      const path = new THREE.Path()
      path.moveTo(holePoly[0]![0], -holePoly[0]![1])
      for (let i = 1; i < holePoly.length; i++) {
        path.lineTo(holePoly[i]![0], -holePoly[i]![1])
      }
      path.closePath()
      shape.holes.push(path)
    }

    // ── 拉伸 + 变换到 XZ 平面 ─────────────────────────────────────────
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: PAD_THICKNESS,
      bevelEnabled: false,
    })
    // ExtrudeGeometry 沿 +Z 方向拉伸，rotateX(-π/2) 后变成沿 -Y 拉伸
    // 即：shape 层（z=0）变成 y=0，拉伸层（z=depth）变成 y=-depth
    geo.rotateX(-Math.PI / 2)
    geo.computeVertexNormals()
    geometries.push(geo)
  }

  if (geometries.length === 0) return null
  if (geometries.length === 1) return geometries[0]!

  // 合并多个楼板几何体
  const merged = new THREE.BufferGeometry()
  let totalVerts = 0, totalIdx = 0
  for (const g of geometries) {
    totalVerts += g.attributes.position!.count
    totalIdx += g.index ? g.index.count : g.attributes.position!.count
  }
  const pos = new Float32Array(totalVerts * 3)
  const nor = new Float32Array(totalVerts * 3)
  const idx = new Uint32Array(totalIdx)
  let vo = 0, io = 0
  for (const g of geometries) {
    const gp = g.attributes.position!.array as ArrayLike<number>
    const gn = g.attributes.normal!.array   as ArrayLike<number>
    pos.set(gp, vo * 3)
    nor.set(gn, vo * 3)
    if (g.index) {
      const gi = g.index.array as ArrayLike<number>
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i]! + vo
      io += gi.length
    } else {
      for (let i = 0; i < g.attributes.position!.count; i++) idx[io + i] = vo + i
      io += g.attributes.position!.count
    }
    vo += g.attributes.position!.count
    g.dispose()
  }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  merged.setAttribute('normal',   new THREE.BufferAttribute(nor, 3))
  merged.setIndex(new THREE.BufferAttribute(idx, 1))
  return merged
}

function splitPadFaces(geo: THREE.BufferGeometry): {
  topGeo: THREE.BufferGeometry
  sideGeo: THREE.BufferGeometry
} {
  const src = geo.index ? geo.toNonIndexed() : geo
  const pos = src.attributes.position!
  const nor = src.attributes.normal!
  const tP: number[] = [], tN: number[] = []
  const sP: number[] = [], sN: number[] = []
  for (let i = 0; i < pos.count; i += 3) {
    const ny = (nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2)) / 3
    const bucket  = ny > 0.5 ? tP : sP
    const bucketN = ny > 0.5 ? tN : sN
    for (let v = 0; v < 3; v++) {
      const j = i + v
      bucket.push(pos.getX(j), pos.getY(j), pos.getZ(j))
      bucketN.push(nor.getX(j), nor.getY(j), nor.getZ(j))
    }
  }
  if (src !== geo) src.dispose()
  const make = (p: number[], n: number[]) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3))
    g.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(n), 3))
    return g
  }
  return { topGeo: make(tP, tN), sideGeo: make(sP, sN) }
}

/**
 * 用 CSG union（three-bvh-csg）把所有墙的 BoxGeometry 求并集，
 * 再用 CSG subtraction 切出门窗洞口。
 * 无论 L / T / X 形接头、是否正交，结果都是零重叠的单一网格，且窗洞干净无重叠。
 */
function buildWallGeo(
  walls: ConvertedWall[],
  openingsByWall: Record<string, OpeningData[]>,
): { bodyGeo: THREE.BufferGeometry | null; capGeo: THREE.BufferGeometry | null } {
  const valid = walls.filter(
    (w) => w.start && w.end &&
      isFinite(w.start.x) && isFinite(w.end.x) &&
      isFinite(w.start.y) && isFinite(w.end.y) &&
      w.thickness > 0 && w.height > 0,
  )
  if (valid.length === 0) return { bodyGeo: null, capGeo: null }

  // Step 1: 合并共线墙，消除 CSG 共面面问题，再求 union
  const merged = mergeCollinearWalls(valid)

  let combined: Brush | null = null
  let wallHeight = merged[0].height

  for (const w of merged) {
    const dx = w.end.x - w.start.x, dz = w.end.y - w.start.y
    const len = Math.hypot(dx, dz)
    if (len < 0.001) continue

    // 两端各延伸 T/2，与相邻墙的延伸部分重叠，CSG union 自然填满角落缺口
    const geo = new THREE.BoxGeometry(len + w.thickness, w.height, w.thickness)
    geo.applyMatrix4(
      new THREE.Matrix4()
        .makeRotationY(-Math.atan2(dz, dx))
        .setPosition((w.start.x + w.end.x) / 2, w.height / 2, (w.start.y + w.end.y) / 2),
    )

    const brush = new Brush(geo)
    brush.updateMatrixWorld()

    if (combined === null) {
      combined = brush
    } else {
      const next = csgEval.evaluate(combined, brush, ADDITION)
      combined.geometry.dispose()
      brush.geometry.dispose()
      combined = next
    }
    wallHeight = Math.max(wallHeight, w.height)
  }

  if (!combined) return { bodyGeo: null, capGeo: null }

  // Step 2: 从原始墙（未合并）切出门窗洞口
  for (const w of valid) {
    const openings = openingsByWall[w.id] ?? []
    if (openings.length === 0) continue

    const dx = w.end.x - w.start.x, dz = w.end.y - w.start.y
    const len = Math.hypot(dx, dz)
    if (len < 0.001) continue
    const angle = Math.atan2(dz, dx)

    for (const op of openings) {
      // 洞口中心的世界坐标（position[0] = 沿墙方向距起点的距离）
      const cx = w.start.x + (dx / len) * op.position[0]
      const cz = w.start.y + (dz / len) * op.position[0]
      const cy = op.position[1]

      // 洞口 box：沿墙方向宽 op.width，高 op.height，深度超过墙厚确保完全切穿
      const geo = new THREE.BoxGeometry(op.width, op.height, w.thickness * 2 + 0.02)
      geo.applyMatrix4(
        new THREE.Matrix4()
          .makeRotationY(-angle)
          .setPosition(cx, cy, cz),
      )

      const brush = new Brush(geo)
      brush.updateMatrixWorld()

      const next = csgEval.evaluate(combined, brush, SUBTRACTION)
      combined.geometry.dispose()
      brush.geometry.dispose()
      combined = next
    }
  }

  const { body, cap } = splitCapBody(combined.geometry, wallHeight)
  combined.geometry.dispose()
  // 合并重复顶点（1mm 容差）→ 同平面相邻三角形的法线一致
  // → EdgesGeometry 能正确识别"同平面对角线"并忽略它们，只留真正的凸/凹边
  const bodyMerged = body ? mergeVertices(body, 1e-4) : null
  if (body && bodyMerged !== body) body.dispose()
  return { bodyGeo: bodyMerged, capGeo: cap }
}

// ─── 灯具渲染 ────────────────────────────────────────────────────────────────

/** 色温（K）→ Three.js Color */
function colorTempToColor(k: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (k - 2700) / (6500 - 2700)))
  // 暖白 #ffc87a → 冷白 #cfe0ff
  return new THREE.Color(
    1,
    0.78 + t * 0.10,
    0.48 + t * 0.52,
  )
}

interface LightState { on: boolean; brightness: number }

// ─── 家具渲染器 — 加载 GLB 模型 + 统一视觉语言 ──────────────────────────────
//
// 视觉规范：
//   - 灰模（默认）：不可交互，接受灯光打亮
//   - 白模+勾勒（interactive=true）：本视图可交互，勾勒由 drei <Outlines> 实现（TODO）
// 双层 group：外层 runtime transform，内层 Clone 应用 asset 矫正 transform。
// 遍历 clone 场景把所有 mesh 原材质替换为统一灰模/白模材质（忽略 GLB 原色）。

// 灰模 / 白模颜色常量
const ITEM_COLOR_GRAY  = '#c0bdb6'   // 非交互
const ITEM_COLOR_WHITE = '#f2efea'   // 可交互

// ─── Keynote 式倒影 — 给任意 material 注入 y-based alpha fade ─────────────────
//
// 方案：每个 mesh 再渲染一份镜像版本（scale Y = -1），放在 y=0 之下。
// 镜像 material 的 fragment shader 根据 world.y 衰减 alpha：y=0 不透，y=-FADE_DIST 完全透明。
// 不需要实时反射 RenderTarget → 不会有摩尔纹/横线/性能瓶颈。
// 倒影 = 水面斜视角感：贴地面 25cm 内有淡淡倒影，再高就看不到
// 不是"物体立在镜面上"的完整镜像，只是湿地面的接触感
const REFLECTION_FADE_DIST = 0.9  // 倒影衰减距离（m）
const REFLECTION_STRENGTH  = 0.28 // 贴地面那一小段的 alpha 起始值
const mirrorMatCache = new Map<string, THREE.Material>()

/** 把一个 material 转为"镜像 fade"版本（alpha 按 world.y 衰减）。同原 material 共享一个镜像版本。 */
function makeMirrorMaterial(orig: THREE.Material): THREE.Material {
  const key = `mirror:${orig.uuid}`
  const cached = mirrorMatCache.get(key)
  if (cached) return cached
  const cloned = orig.clone()
  cloned.transparent = true
  cloned.depthWrite = false
  cloned.side = THREE.DoubleSide  // 镜像后法线翻转，用 DoubleSide 简单处理
  cloned.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeDist   = { value: REFLECTION_FADE_DIST }
    shader.uniforms.uStartAlpha = { value: REFLECTION_STRENGTH }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying float vMirrorY;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvMirrorY = worldPosition.y;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        `#include <common>\nvarying float vMirrorY;\nuniform float uFadeDist;\nuniform float uStartAlpha;`)
      .replace('#include <dithering_fragment>',
        `#include <dithering_fragment>\nfloat mirrorFade = uStartAlpha * smoothstep(-uFadeDist, 0.0, vMirrorY);\ngl_FragColor.a *= mirrorFade;\nif (gl_FragColor.a < 0.01) discard;`)
  }
  mirrorMatCache.set(key, cloned)
  return cloned
}

// 灰模/白模 material 缓存 — 同一原 material 按 interactive 状态各缓存一份
// 保留 GLB 的细节贴图（normalMap/aoMap/roughnessMap）让灰模有真实的凹凸和阴影质感
const matByKey = new Map<string, THREE.Material>()
function grayify(orig: THREE.Material | THREE.Material[], isInteractive: boolean): THREE.Material | THREE.Material[] {
  if (Array.isArray(orig)) return orig.map((m) => grayify(m, isInteractive) as THREE.Material)
  const key = `${orig.uuid}:${isInteractive ? 'white' : 'gray'}`
  const cached = matByKey.get(key)
  if (cached) return cached
  const std = orig as THREE.MeshStandardMaterial
  const newMat = new THREE.MeshStandardMaterial({
    color: isInteractive ? ITEM_COLOR_WHITE : ITEM_COLOR_GRAY,
    normalMap:      std.normalMap      ?? null,
    normalScale:    std.normalScale    ? std.normalScale.clone() : undefined,
    aoMap:          std.aoMap          ?? null,
    aoMapIntensity: std.aoMapIntensity ?? 1,
    roughnessMap:   std.roughnessMap   ?? null,
    metalnessMap:   std.metalnessMap   ?? null,
    roughness:      typeof std.roughness === 'number' ? std.roughness : 0.62,
    metalness:      Math.min(typeof std.metalness === 'number' ? std.metalness : 0.04, 0.3),
    transparent:    std.transparent ?? false,
    opacity:        typeof std.opacity === 'number' ? std.opacity : 1,
  })
  matByKey.set(key, newMat)
  return newMat
}

function DemoItem({ item, interactive = false }: { item: ItemData; interactive?: boolean }) {
  const gltf = useGLTF(item.asset.src)
  const cloneRef = useRef<THREE.Group>(null!)
  const mirrorRef = useRef<THREE.Group>(null!)

  useEffect(() => {
    // 原 Clone：灰模材质
    const root = cloneRef.current
    if (root) {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh || !mesh.material) return
        mesh.material      = grayify(mesh.material, interactive)
        mesh.castShadow    = true
        mesh.receiveShadow = true
        obj.layers.enable(INTERIOR_LAYER)   // 家具加入室内层，接收室内光照
      })
    }
    // 镜像 Clone：对每个 mesh 用 mirror 版本的灰模材质（y-fade）
    const mirror = mirrorRef.current
    if (mirror) {
      mirror.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh || !mesh.material) return
        const grayMat = grayify(mesh.material, interactive) as THREE.Material
        mesh.material   = makeMirrorMaterial(grayMat)
        mesh.castShadow = false
        mesh.receiveShadow = false
      })
    }
  }, [gltf.scene, interactive])

  return (
    <>
      <group position={item.position} rotation={item.rotation} scale={item.scale}>
        <Clone
          ref={cloneRef}
          object={gltf.scene}
          position={item.asset.offset}
          rotation={item.asset.rotation}
          scale={item.asset.scale}
        />
      </group>
      {/* 家具倒影 — 整体镜像 scale Y=-1，材质 fade */}
      <group
        position={[item.position[0], -item.position[1], item.position[2]]}
        rotation={[-item.rotation[0], item.rotation[1], -item.rotation[2]]}
        scale={[item.scale[0], -item.scale[1], item.scale[2]]}
      >
        <Clone
          ref={mirrorRef}
          object={gltf.scene}
          position={item.asset.offset}
          rotation={item.asset.rotation}
          scale={item.asset.scale}
        />
      </group>
    </>
  )
}

// ─── 单灯点（RoomBaseLight 的子单元）─────────────────────────────────────────
// 每个灯位一个实例：SpotLight（主光）+ PointLight（补光），共用 brightness 目标值。
function RoomLightPoint({
  px, pz, brightness, lightY, wallHeight, col, perRadius,
}: {
  px: number; pz: number
  brightness: number   // 0-100（与所在房间同步）
  lightY: number
  wallHeight: number
  col: THREE.Color
  perRadius: number    // 此单灯负责的覆盖半径
}) {
  const mainRef   = useRef<THREE.SpotLight>(null!)
  const targetRef = useRef<THREE.Object3D>(null!)
  const fillRef   = useRef<THREE.PointLight>(null!)
  const cur       = useRef(brightness / 100)

  const halfAngle = Math.min(Math.PI * 0.415, Math.atan2(perRadius * 1.3, lightY))

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.target = targetRef.current
      mainRef.current.layers.set(INTERIOR_LAYER)
    }
    if (fillRef.current) fillRef.current.layers.set(INTERIOR_LAYER)
  }, [])

  useFrame((_, dt) => {
    const target = brightness / 100
    cur.current += (target - cur.current) * Math.min(1, dt * 14)
    const i = cur.current
    if (mainRef.current) {
      mainRef.current.intensity = i * 38
      mainRef.current.visible   = i > 0.01
    }
    if (fillRef.current) {
      fillRef.current.intensity = i * 8
      fillRef.current.visible   = i > 0.01
    }
  })

  return (
    <group>
      <object3D ref={targetRef} position={[px, 0, pz]} />
      <spotLight
        ref={mainRef}
        position={[px, lightY, pz]}
        color={col} intensity={0}
        distance={Math.hypot(lightY, perRadius * 1.3)}
        angle={halfAngle} penumbra={0.6} decay={2}
        visible={false}
      />
      <pointLight
        ref={fillRef}
        position={[px, wallHeight * 0.42, pz]}
        color={col} intensity={0}
        distance={perRadius * 1.2} decay={2}
        visible={false}
      />
    </group>
  )
}

// ─── 房间基础照明（Base Lighting Layer）────────────────────────────────────────
// 根据房间多边形自动分布多个灯点（1-4 盏），共用一个开关按钮。
// 小房间 1 盏居中，长条形沿长轴布灯，L 型沿两翼布灯，正方形 2×2 格布灯。
function RoomBaseLight({
  centroid,
  brightness,
  wallHeight,
  label = '主照明',
  colorTemp = 3000,
  onToggle,
  onZoomIn,
  hidden = false,
}: {
  centroid: RoomCentroid
  brightness: number
  wallHeight: number
  label?: string
  colorTemp?: number
  onToggle: () => void
  onZoomIn?: () => void   // 灯光板块下点击放大镜图标进房间 Detail
  hidden?: boolean        // Room-Detail 下其他房间胶囊 hidden，或非灯板块下全隐
}) {
  const col   = colorTempToColor(colorTemp)
  const isOn  = brightness > 0
  const [hovered, setHovered] = useState(false)

  const lightY = wallHeight * 0.92
  const { lightPositions } = centroid
  // 每个灯点的覆盖半径 = 整体半径 / sqrt(灯数)，保证总覆盖面积不变
  const perRadius = centroid.radius / Math.sqrt(lightPositions.length)

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [hovered])

  return (
    <group>
      {/* 多灯点 — 每个位置独立渲染 SpotLight + PointLight，共用 brightness 目标 */}
      {lightPositions.map(([px, pz], i) => (
        <RoomLightPoint
          key={i}
          px={px} pz={pz}
          brightness={brightness}
          lightY={lightY}
          wallHeight={wallHeight}
          col={col}
          perRadius={perRadius}
        />
      ))}

      {/* 3D 场景内开关按钮 — 文字胶囊，点击切换，hover 高亮
          hidden=true 时 opacity 0 + pointerEvents none（不 unmount 避免 React 抖动） */}
      <Html
        position={[centroid.cx, 1.2, centroid.cz]}
        center
        zIndexRange={[1, 5]}
        style={{ pointerEvents: 'none', opacity: hidden ? 0 : 1, transition: 'opacity 0.35s ease' }}
      >
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            pointerEvents: hidden ? 'none' : 'auto',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 20,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            // 开：暖黄半透底 + 细描边；关：深色半透底
            background: isOn
              ? hovered ? 'rgba(255,210,80,0.22)' : 'rgba(255,210,80,0.14)'
              : hovered ? 'rgba(30,35,50,0.72)'   : 'rgba(20,24,36,0.56)',
            border: isOn
              ? '1px solid rgba(255,210,80,0.45)'
              : '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: isOn ? '0 0 10px 2px rgba(255,200,60,0.18)' : 'none',
            transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
          }}
        >
          {/* 状态指示圆点 */}
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: isOn ? '#ffdc82' : 'rgba(150,160,180,0.5)',
            boxShadow: isOn ? '0 0 5px 1px rgba(255,200,60,0.55)' : 'none',
            transition: 'background 0.3s, box-shadow 0.3s',
          }} />
          {/* 空间名 */}
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
            color: isOn ? 'rgba(255,238,170,0.95)' : 'rgba(180,190,210,0.75)',
            transition: 'color 0.25s',
          }}>
            {label}
          </span>
          {/* 亮度 / 关 */}
          <span style={{
            fontSize: 10, fontVariantNumeric: 'tabular-nums',
            color: isOn ? 'rgba(255,220,130,0.75)' : 'rgba(120,135,160,0.6)',
            transition: 'color 0.25s',
          }}>
            {isOn ? `${brightness}%` : '关'}
          </span>

          {/* 放大镜 — 点击 = 进入该房间的俯视 Detail；与胶囊主体（开关灯）职能分离
              仅灯光板块下且 onZoomIn 存在时显示 */}
          {onZoomIn && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onZoomIn() }}
              aria-label="进入房间"
              style={{
                marginLeft: 6,
                paddingLeft: 6,
                borderLeft: '1px solid rgba(255,255,255,0.14)',
                width: 20, height: 20,
                border: 'none', background: 'transparent',
                color: hovered
                  ? (isOn ? 'rgba(255,240,180,1)' : 'rgba(220,230,250,1)')
                  : (isOn ? 'rgba(255,230,160,0.8)' : 'rgba(180,195,220,0.7)'),
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.25s, transform 0.25s',
                transform: hovered ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
                <path d="M11 8v6M8 11h6" />
              </svg>
            </button>
          )}
        </div>
      </Html>
    </group>
  )
}

function DemoLightBulb({
  device,
  state,
  onToggle,
  isNight,
  preset,
}: {
  device: DeviceData
  state: LightState
  onToggle: () => void
  isNight: boolean
  preset: RenderPreset
}) {
  const lightRef  = useRef<THREE.SpotLight>(null!)
  const fillRef   = useRef<THREE.PointLight>(null!)
  const targetRef = useRef<THREE.Object3D>(null!)
  const cur       = useRef(state.on ? state.brightness / 100 : 0)
  const [labelHovered, setLabelHovered] = useState(false)

  const col = colorTempToColor(device.colorTemp)
  const [px, py, pz] = device.position
  const labelY = 1.15
  const pill = getPillColors(preset.key, isNight, state.on)
  // 把 device.beamAngle（度数）转为弧度，SpotLight.angle 是半角，默认 60° 全开角
  const coneHalfAngle = THREE.MathUtils.degToRad((device.beamAngle ?? 60) / 2)

  // SpotLight target + 设置室内 Layer（灯具光源同样只照室内）
  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current
      lightRef.current.layers.set(INTERIOR_LAYER)
    }
    if (fillRef.current) {
      fillRef.current.layers.set(INTERIOR_LAYER)
    }
  }, [])

  const isPanel = device.renderType === 'panel'

  useFrame((_, dt) => {
    const target = state.on ? state.brightness / 100 : 0
    cur.current  += (target - cur.current) * Math.min(1, dt * 10)
    const i = cur.current

    if (lightRef.current) {
      // panel 主灯强度更高（广角覆盖整个房间）
      lightRef.current.intensity = i * (isPanel ? 32 : 25)
      lightRef.current.visible   = i > 0.01
    }
    // panel 用 PointLight 补全环境漫反射（让地板/侧墙也被照亮）
    if (isPanel && fillRef.current) {
      fillRef.current.intensity = i * 18
      fillRef.current.visible   = i > 0.01
    }
  })

  useEffect(() => {
    document.body.style.cursor = labelHovered ? 'pointer' : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [labelHovered])

  return (
    <group>
      {/* 目标点：正下方地板，作为 SpotLight.target */}
      <object3D ref={targetRef} position={[px, 0, pz]} />

      {/* SpotLight — 射灯/主灯，beamAngle 控制开角
          不用 castShadow：同 RoomBaseLight，shadowMaterial 会采样所有投影光源
          distance 收紧到 py * 1.5（约 4m），与房间尺度匹配，不会到达室外 */}
      <spotLight
        ref={lightRef}
        position={[px, py - 0.05, pz]}
        color={col}
        intensity={0}
        distance={py * 1.5}
        angle={coneHalfAngle}
        penumbra={isPanel ? 0.9 : 0.45}
        decay={2}
        visible={false}
      />

      {/* panel 补光：PointLight 提供环境漫反射，让地板和侧墙也被照亮
          distance 收紧到 py * 1.8，不超出房间范围 */}
      {isPanel && (
        <pointLight
          ref={fillRef}
          position={[px, py * 0.6, pz]}
          color={col}
          intensity={0}
          distance={py * 1.8}
          decay={2}
          visible={false}
        />
      )}

      {/* panel 主灯：天花板矩形发光面 */}
      {isPanel && (
        <mesh position={[px, py - 0.005, pz]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.6, 0.6]} />
          <meshStandardMaterial
            color={state.on ? col : '#555'}
            emissive={col}
            emissiveIntensity={state.on ? (state.brightness / 100) * 4 : 0}
            transparent
            opacity={state.on ? 0.95 : 0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* 灯具标记 — 默认小点（射灯）或矩形已做，hover 弹出 tooltip */}
      <Html
        position={[px, labelY, pz]}
        center
        zIndexRange={[1, 5]}
        style={{ pointerEvents: 'none' }}
      >
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          onMouseEnter={() => setLabelHovered(true)}
          onMouseLeave={() => setLabelHovered(false)}
          style={{ pointerEvents: 'auto', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        >
          {/* 射灯小点（panel 有自己的矩形面，这里只渲染非 panel 的圆点） */}
          {!isPanel && (
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: state.on ? pill.text : 'rgba(150,150,160,0.5)',
              boxShadow: state.on ? `0 0 6px 2px ${pill.text}55` : 'none',
              transition: 'background 0.4s, box-shadow 0.4s',
            }} />
          )}

          {/* Hover tooltip */}
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            pointerEvents: 'none',
            opacity: labelHovered ? 1 : 0,
            transition: 'opacity 0.15s',
            background: 'rgba(10,12,18,0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 8,
            padding: '4px 10px',
            whiteSpace: 'nowrap',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ color: 'rgba(229,240,255,0.9)', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em' }}>
              {device.name}
            </span>
            <span style={{ color: 'rgba(166,190,222,0.7)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
              {state.on ? `${state.brightness}%` : '关'}
            </span>
          </div>
        </div>
      </Html>
    </group>
  )
}

// ─── 演示结构渲染器 ───────────────────────────────────────────────────────────

interface StructureProps {
  walls: ConvertedWall[]
  openingsByWall: Record<string, OpeningData[]>
  devices: DeviceData[]
  slabs: SlabData[]
  items: ItemData[]
  roomCentroids: RoomCentroid[]            // base lighting 层数据
  roomStates: Record<string, number>       // key=roomId, value=brightness 0-100
  lightStates: Record<string, LightState>
  bbox: SceneSeed['bbox']
  lightPos: [number, number, number]
  isNight: boolean
  preset: RenderPreset
  onToggleLight: (id: string) => void
  onToggleRoom: (id: string) => void       // 切换单个房间 base lighting
  view: ViewState                           // 当前视角，决定胶囊显隐
  onEnterLightingDetail?: (roomId: string) => void   // 进入该房间的灯光俯视 Detail
}

function DemoStructure({ walls, openingsByWall, devices, slabs, items, roomCentroids, roomStates, lightStates, bbox, lightPos, isNight, preset, onToggleLight, onToggleRoom, view, onEnterLightingDetail }: StructureProps) {
  const { bodyGeo, capGeo } = useMemo(() => buildWallGeo(walls, openingsByWall), [walls, openingsByWall])
  const padGeo = useMemo(() => buildPadGeo(slabs), [slabs])
  const { padSideGeo, padTopGeo } = useMemo(() => {
    if (!padGeo) return { padSideGeo: null, padTopGeo: null }
    const { sideGeo, topGeo } = splitPadFaces(padGeo)
    return { padSideGeo: sideGeo, padTopGeo: topGeo }
  }, [padGeo])

  // 清理几何体
  useEffect(() => {
    return () => {
      bodyGeo?.dispose()
      capGeo?.dispose()
      padGeo?.dispose()
      padSideGeo?.dispose()
      padTopGeo?.dispose()
    }
  }, [bodyGeo, capGeo, padGeo, padSideGeo, padTopGeo])

  const wallMeshRef = useRef<THREE.Mesh>(null!)
  const padSideRef  = useRef<THREE.Mesh>(null!)
  const padTopRef   = useRef<THREE.Mesh>(null!)

  // 墙体阴影材质 — shadow camera 默认在 Layer 0，与光源 layer 无关
  // 墙体保持 Layer 0：SpotLight（Layer 1）不会照亮墙面 → 不会向外发光
  // castShadow + customDepthMaterial：shadow camera 把透明墙视为不透明 → 室内光被正确遮挡
  useEffect(() => {
    const mesh = wallMeshRef.current
    if (!mesh || !bodyGeo) return
    const depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.FrontSide,
    })
    const distMat = new THREE.MeshDistanceMaterial({ side: THREE.FrontSide })
    mesh.customDepthMaterial    = depthMat
    mesh.customDistanceMaterial = distMat
    return () => { depthMat.dispose(); distMat.dispose() }
  }, [bodyGeo])

  // 室内地板加入 INTERIOR_LAYER — 被室内 SpotLight 照亮
  useEffect(() => {
    padSideRef.current?.layers.enable(INTERIOR_LAYER)
    padTopRef.current?.layers.enable(INTERIOR_LAYER)
  }, [padSideGeo, padTopGeo])

  // 墙体 material — 用 MeshStandardMaterial 替代 MeshPhysicalMaterial
  // clearcoat/ior 会触发双层物理着色器，每 fragment 费用翻倍；
  // 去掉后换用 envMapIntensity 模拟反光，视觉差异极小，GPU 负担大幅减少
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.theme.wallColor),
    roughness: 0.22,
    metalness: 0.08,
    envMapIntensity: 1.2,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.FrontSide,
  }), [preset.theme.wallColor])
  useEffect(() => () => wallMat.dispose(), [wallMat])
  // 墙体倒影材质 — 用不透明底色，让倒影和家具倒影一样清晰（不受墙体透明度拖累）
  const wallMirrorMat = useMemo(() => {
    const base = new THREE.MeshStandardMaterial({
      color: new THREE.Color(preset.theme.wallColor),
      roughness: 0.24,
      metalness: 0.03,
    })
    const m = makeMirrorMaterial(base)
    base.dispose()
    return m
  }, [preset.theme.wallColor])

  // 地板 Pad 侧面材质 — 实心，让 10cm 台阶从所有角度可见
  const padMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.theme.padColorDay),
    emissive: new THREE.Color(preset.theme.padEmissiveDay),
    emissiveIntensity: 0.2,
    roughness: 1.0,
    metalness: 0,
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
  }), [preset])
  useEffect(() => () => padMat.dispose(), [padMat])

  // 地板 Pad 顶面材质 — 半透明，让倒影从顶面透出
  const padTopMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.theme.padColorDay),
    emissive: new THREE.Color(preset.theme.padEmissiveDay),
    emissiveIntensity: 0.2,
    roughness: 1.0,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.FrontSide,
  }), [preset])
  useEffect(() => () => padTopMat.dispose(), [padTopMat])

  // 昼夜过渡因子（0=白天 1=夜间），每帧朝 target 缓动 → 颜色/发光平滑切换
  const nightFactorRef = useRef(isNight ? 1 : 0)
  const C = useMemo(() => ({
    padDay:     new THREE.Color(preset.theme.padColorDay),
    padNight:   new THREE.Color(preset.theme.padColorNight),
    padEmDay:   new THREE.Color(preset.theme.padEmissiveDay),
    padEmNight: new THREE.Color(preset.theme.padEmissiveNight),
  }), [preset])
  useFrame((_, dt) => {
    const target = isNight ? 1 : 0
    // 速率 4 → 约 1.1s 过渡，与 DemoEnvironment 保持一致（之前 1.5 约 3s 太慢）
    nightFactorRef.current += (target - nightFactorRef.current) * Math.min(1, dt * 4)
    const f = nightFactorRef.current
    padMat.color.lerpColors(C.padDay, C.padNight, f)
    padMat.emissive.lerpColors(C.padEmDay, C.padEmNight, f)
    // 夜间 emissive 大幅压低：避免发光地板透过玻璃墙在建筑外部可见（台阶状光斑问题）
    padMat.emissiveIntensity = 0.3 + f * 0.5   // 0.3 → 0.8（原 0.4 → 2.5）
    padTopMat.color.lerpColors(C.padDay, C.padNight, f)
    padTopMat.emissive.lerpColors(C.padEmDay, C.padEmNight, f)
    padTopMat.emissiveIntensity = 0.3 + f * 0.5
  })

  // 窗 / 门面板世界坐标
  const openingPanels = useMemo(() => {
    const panels: {
      key: string
      kind: 'window' | 'door'
      position: [number, number, number]
      rotation: [number, number, number]
      width: number
      height: number
      thickness: number
    }[] = []

    for (const wall of walls) {
      const openings = openingsByWall[wall.id] ?? []
      if (openings.length === 0) continue
      const dx  = wall.end.x - wall.start.x
      const dz  = wall.end.y - wall.start.y
      const len = Math.hypot(dx, dz)
      if (len < 0.001) continue
      const angle   = Math.atan2(dz, dx)
      const wallDir = { x: dx / len, z: dz / len }

      for (const op of openings) {
        // 沿墙方向 position[0] 米处为中心，position[1] 为高度中心
        const wx = wall.start.x + wallDir.x * op.position[0]
        const wz = wall.start.y + wallDir.z * op.position[0]
        const wy = op.position[1]
        panels.push({
          key:       op.id,
          kind:      op.kind,
          position:  [wx, wy, wz],
          rotation:  [0, -angle, 0],
          width:     op.width,
          height:    op.height,
          thickness: wall.thickness,
        })
      }
    }
    return panels
  }, [walls, openingsByWall])

  return (
    <group>
      {/* 地板 Pad 侧面 — 实心。沉到 PAD_Y_OFFSET 避免和其他 y≈0 地板几何 z-fighting */}
      {padSideGeo && (
        <mesh
          ref={padSideRef}
          geometry={padSideGeo}
          material={padMat}
          position={[0, PAD_Y_OFFSET, 0]}
          renderOrder={-2}
        />
      )}
      {/* 地板 Pad 顶面 — 半透明，倒影（镜像克隆）从此处透出 */}
      {padTopGeo && (
        <mesh
          ref={padTopRef}
          geometry={padTopGeo}
          material={padTopMat}
          position={[0, PAD_Y_OFFSET, 0]}
          renderOrder={0}
        />
      )}


      {/* 接触阴影锚点 — 让建筑底部和地面更“贴”，减少漂浮感 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[bbox.cx, -0.006, bbox.cz]}
        receiveShadow
      >
        <circleGeometry args={[Math.max(bbox.w, bbox.d) * 0.86, 64]} />
        {/* 夜间几乎不显示：墙体阴影在月光下投到此圆上会产生锯齿轮廓，压低到近乎不可见 */}
        <shadowMaterial transparent opacity={isNight ? 0.04 : 0.10} />
      </mesh>

      {/* 合并墙体 — 透明玻璃视觉（Layer 0）+ castShadow 让 shadow camera 把它当不透明
          SpotLight 在 Layer 1 → 不照亮墙面 → 墙体不向外发光
          shadow camera 在 Layer 0 → 看到此墙 → 室内光被正确遮挡，不穿墙 */}
      {bodyGeo && (
        <>
          <mesh ref={wallMeshRef} geometry={bodyGeo} castShadow receiveShadow material={wallMat} />
          {/* 墙体倒影 — 镜像副本 scale Y=-1，alpha 按 world.y 衰减 */}
          <mesh geometry={bodyGeo} scale={[1, -1, 1]} material={wallMirrorMat} renderOrder={1} />
        </>
      )}

      {/* 顶面 cap — 位置驱动渐变：品牌蓝 → 浅冰蓝，叠加光源高光 */}
      {capGeo && (
        <mesh geometry={capGeo} renderOrder={2}>
          <shaderMaterial
            key={preset.theme.capColorA + preset.theme.capColorB}
            transparent
            depthWrite={false}
            uniforms={{
              uColorA:  { value: new THREE.Color(preset.theme.capColorA) },
              uColorB:  { value: new THREE.Color(preset.theme.capColorB) },
              uOpacity: { value: preset.theme.capOpacity },
              uCenter:  { value: new THREE.Vector2(bbox.cx, bbox.cz) },
              uLightPos:{ value: new THREE.Vector3(...lightPos) },
            }}
            vertexShader={`
              varying vec3 vWorldPos;
              void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
              }
            `}
            fragmentShader={`
              uniform vec3  uColorA;
              uniform vec3  uColorB;
              uniform float uOpacity;
              uniform vec2  uCenter;
              uniform vec3  uLightPos;
              varying vec3  vWorldPos;
              void main() {
                // 太阳水平投影方向 → 渐变轴
                vec2 sunDir = normalize(uLightPos.xz - uCenter);
                vec2 rel    = vWorldPos.xz - uCenter;
                float span  = max(length(uLightPos.xz - uCenter) * 0.5, 6.0);
                float t     = dot(rel, sunDir) / span;
                t = clamp(t * 0.5 + 0.5, 0.0, 1.0);
                // 朝太阳那侧偏浅（uColorB），背太阳那侧偏深（uColorA）
                vec3 col = mix(uColorA, uColorB, t);
                gl_FragColor = vec4(col, uOpacity);
              }
            `}
          />
        </mesh>
      )}

      {/* Base Lighting 层 — 每个房间一组 PointLight + 胶囊开关
          胶囊显隐规则：
            - module 非 lighting：全部 hidden
            - lighting + Overview：全部显示，每个胶囊带🔍进 Detail
            - lighting + Detail：仅 target 房间胶囊显示 + 无🔍（已经在 Detail 里） */}
      {roomCentroids.map((c, i) => {
        const inLighting = view.module === 'lighting'
        const inDetail   = view.level === 'detail'
        const isTarget   = inDetail && view.targetId === c.id
        const hidden     = !inLighting || (inDetail && !isTarget)
        const allowZoom  = inLighting && !inDetail && !!onEnterLightingDetail
        return (
          <RoomBaseLight
            key={`room-base-${c.id || i}`}
            centroid={c}
            brightness={roomStates[c.id] ?? 0}
            wallHeight={WALL_HEIGHT}
            label={c.label}
            colorTemp={3000}
            onToggle={() => onToggleRoom(c.id)}
            onZoomIn={allowZoom ? () => onEnterLightingDetail!(c.id) : undefined}
            hidden={hidden}
          />
        )
      })}

      {/* 灯具（已配置灯光设计才有）— 细节层，拉近镜头后的交互单元 */}
      {devices.map((d) => (
        <DemoLightBulb
          key={d.id}
          device={d}
          state={lightStates[d.id] ?? { on: d.on, brightness: d.brightness }}
          onToggle={() => onToggleLight(d.id)}
          isNight={isNight}
          preset={preset}
        />
      ))}

      {/* 家具 — GLB 模型，useGLTF 自动缓存 */}
      <Suspense fallback={null}>
        {items.map((it) => (
          <DemoItem key={it.id} item={it} />
        ))}
      </Suspense>

      {/* 窗 / 门面板 — depthTest=false 确保始终可见（面板在墙体中心，否则被深度缓冲遮挡）*/}
      {openingPanels.map((p) => (
        <mesh key={p.key} position={p.position} rotation={p.rotation} renderOrder={3}>
          {/* 厚度贯穿整面墙，从内外都能看到 */}
          <boxGeometry args={[p.width, p.height, p.thickness + 0.01]} />
          <meshBasicMaterial
            color={p.kind === 'window' ? preset.theme.windowColor : preset.theme.doorColor}
            transparent
            opacity={p.kind === 'window' ? 0.22 : 0.08}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── 雾 颜色 动画 ──────────────────────────────────────────────────────────────
// fog attach 只能设初始色，这里在 useFrame 里做昼夜插值，避免日夜切换时颜色突变

function FogAnimator({ isNight, preset }: { isNight: boolean; preset: RenderPreset }) {
  const { scene } = useThree()
  const fRef = useRef(isNight ? 1 : 0)
  const C = useMemo(() => ({
    day:   new THREE.Color(preset.theme.bgColorDay),
    night: new THREE.Color(preset.theme.bgColorNight),
  }), [preset])
  useFrame((_, dt) => {
    const target = isNight ? 1 : 0
    fRef.current += (target - fRef.current) * Math.min(1, dt * 4)
    const fog = scene.fog as THREE.Fog | null
    if (fog) fog.color.lerpColors(C.day, C.night, fRef.current)
  })
  return null
}

// ─── 演示灯光环境 ─────────────────────────────────────────────────────────────

function DemoEnvironment({
  lightPos, isNight, preset,
}: { lightPos: [number, number, number]; isNight: boolean; preset: RenderPreset }) {
  const hemiRef = useRef<THREE.HemisphereLight>(null!)
  const dirRef  = useRef<THREE.DirectionalLight>(null!)
  const fRef    = useRef(isNight ? 1 : 0)          // 昼夜因子 0=白天 1=夜间

  const C = useMemo(() => ({
    skyDay:    new THREE.Color(preset.theme.skyDay),
    skyNight:  new THREE.Color(preset.theme.skyNight),
    gndDay:    new THREE.Color(preset.theme.groundDay),
    gndNight:  new THREE.Color(preset.theme.groundNight),
    sunDay:    new THREE.Color(preset.theme.sunColorDay),
    sunNight:  new THREE.Color(preset.theme.sunColorNight),
  }), [preset])

  // 所有光源颜色/强度在 useFrame 中平滑过渡，不依赖 React re-render
  // 速率 4 → ~1.1s 完成过渡，视觉上平滑而不拖沓
  useFrame((_, dt) => {
    const target = isNight ? 1 : 0
    fRef.current += (target - fRef.current) * Math.min(1, dt * 4)
    const f = fRef.current

    if (hemiRef.current) {
      hemiRef.current.color.lerpColors(C.skyDay, C.skyNight, f)
      hemiRef.current.groundColor.lerpColors(C.gndDay, C.gndNight, f)
      hemiRef.current.intensity = preset.hemiDay + (preset.hemiNight - preset.hemiDay) * f
    }
    if (dirRef.current) {
      dirRef.current.color.lerpColors(C.sunDay, C.sunNight, f)
      dirRef.current.intensity = preset.sunDay + (preset.sunNight - preset.sunDay) * f
      // 过渡到夜间时逐渐关闭投影，避免切换时阴影贴图刷新闪烁
      dirRef.current.castShadow = f < 0.5
    }
  })

  return (
    <>
      {/* HDRI 环境贴图 — 给 MeshPhysicalMaterial 的 clearcoat 提供反光源 */}
      <Environment
        preset={isNight ? preset.theme.envPresetNight : preset.theme.envPresetDay}
        environmentIntensity={isNight ? preset.envNight : preset.envDay}
      />
      {/* 以下属性由 useFrame 接管，JSX 仅做初始化用 */}
      <hemisphereLight
        ref={hemiRef}
        color={C.skyDay}
        groundColor={C.gndDay}
        intensity={preset.hemiDay}
      />
      <directionalLight
        ref={dirRef}
        castShadow={!isNight}
        color={C.sunDay}
        intensity={preset.sunDay}
        position={lightPos}
        shadow-mapSize={[preset.shadowMapSize, preset.shadowMapSize]}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-radius={preset.shadowRadiusDay}
        shadow-bias={-0.0005}
      />
    </>
  )
}

// ─── FPS 计数器 ────────────────────────────────────────────────────────────────
// 直接写 DOM（不走 React state），零 re-render 开销
// 颜色：绿色 ≥55fps，黄色 30-54fps，红色 <30fps

function FpsBadge({ topBorder, topBg }: { topBorder: string; topBg: string }) {
  const numRef  = useRef<HTMLSpanElement>(null)
  const dotRef  = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frames = 0
    let last   = performance.now()
    let raf: number

    const tick = () => {
      frames++
      const now = performance.now()
      const delta = now - last
      if (delta >= 500) {
        const fps = Math.round(frames * 1000 / delta)
        frames = 0
        last   = now
        if (numRef.current)  numRef.current.textContent  = String(fps)
        const color = fps >= 55 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171'
        if (numRef.current)  numRef.current.style.color  = color
        if (dotRef.current)  dotRef.current.style.background = color
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      style={{
        marginLeft: 4,
        display: 'flex', alignItems: 'center', gap: 5,
        height: 34, padding: '0 10px',
        border: `1px solid ${topBorder}`, borderRadius: 7,
        background: topBg,
        fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
        flexShrink: 0,
      }}
    >
      {/* 状态点 */}
      <span
        ref={dotRef}
        style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', flexShrink: 0, transition: 'background 0.6s' }}
      />
      {/* 数字 */}
      <span ref={numRef} style={{ fontSize: 11, fontWeight: 600, color: '#4ade80', minWidth: 22, textAlign: 'right', transition: 'color 0.6s' }}>
        --
      </span>
      {/* 单位 */}
      <span style={{ fontSize: 9, color: 'rgba(150,165,190,0.55)', letterSpacing: '0.04em' }}>FPS</span>
    </div>
  )
}

// ─── 顶栏 ─────────────────────────────────────────────────────────────────────

function DemoTopBar({
  buildingName, levelName, wallCount,
  displayHour, realHour, isPreviewing, isNight,
  preset,
  activePresetKey, onPresetChange,
  onSliderChange, onSliderDown, onSyncNow,
}: {
  buildingName: string
  levelName: string
  wallCount: number
  displayHour: number
  realHour: number
  isPreviewing: boolean
  isNight: boolean
  preset: RenderPreset
  activePresetKey: RenderPresetKey
  onPresetChange: (key: RenderPresetKey) => void
  onSliderChange: (h: number) => void
  onSliderDown: () => void
  onSyncNow: () => void
}) {
  const fmt = (h: number) => {
    const hh = Math.floor(h).toString().padStart(2, '0')
    const mm = Math.round((h % 1) * 60).toString().padStart(2, '0')
    return `${hh}:${mm}`
  }
  const [tweaksOpen, setTweaksOpen] = useState(false)

  const chrome = getDemoChromePalette(isNight)
  const topBg     = chrome.bg
  const topBorder = chrome.border
  const inkColor  = chrome.text
  const ink2      = chrome.text2
  const ink3      = chrome.text3
  const trackBg   = chrome.track

  const swatchPalette: Record<RenderPresetKey, [string, string, string]> = {
    opslab:   ['#18293d', '#24496f', '#5f7f9c'],
    balanced: ['#2a2f34', '#495562', '#7b8794'],
    showcase: ['#102437', '#1e3f58', '#4b697f'],
    smooth:   ['#2e3136', '#4f5560', '#7a838e'],
    night:    ['#231a30', '#44305d', '#6b4f88'],
  }

  return (
    <div
      className="flex shrink-0 items-center gap-0 px-5 z-20"
      style={{ height: 56, background: topBg, borderBottom: `1px solid ${topBorder}`, transition: 'background 0.4s, border-color 0.4s' }}
    >
      {/* Brand */}
      <a href="/" className="flex items-center gap-2 no-underline" title="返回编辑器" style={{ color: inkColor, fontFamily: 'var(--font-inter), sans-serif' }}>
        <div className="relative shrink-0" style={{ width: 14, height: 14, borderRadius: 3, background: '#006FFF' }}>
          <div style={{ position: 'absolute', top: 3, right: 3, width: 4, height: 4, borderRadius: 1, background: '#fff' }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em' }}>VilHil</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: ink3, letterSpacing: '0.06em', marginLeft: 1 }}>STUDIO</span>
      </a>

      <div style={{ width: 1, height: 20, background: topBorder, margin: '0 16px', flexShrink: 0 }} />

      {/* Project */}
      <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: ink3, letterSpacing: '0.06em' }}>PROJECT</span>
        <span style={{ fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontStyle: 'italic', fontSize: 15, color: inkColor }}>{buildingName}</span>
        <span style={{ color: ink3, fontSize: 12 }}>·</span>
        <span style={{ fontSize: 13, color: ink2 }}>{levelName}</span>
        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,111,255,0.10)', color: '#006FFF', letterSpacing: '0.04em', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
          {wallCount}W
        </span>
      </div>

      <div className="flex-1" />

      {/* Time slider widget */}
      <div
        className="relative flex items-center gap-2.5 px-3.5"
        style={{ height: 34, border: `1px solid ${topBorder}`, borderRadius: 7, background: topBg, minWidth: 220, flexShrink: 0 }}
      >
        {isNight ? (
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={ink3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M20 14.5A8 8 0 119.5 4 6.5 6.5 0 0020 14.5z"/>
          </svg>
        ) : (
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={ink3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6"/>
          </svg>
        )}
        <div className="relative flex-1 cursor-pointer" style={{ height: 4, borderRadius: 2, background: trackBg }}>
          <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${(displayHour / 24) * 100}%`, background: '#006FFF', borderRadius: 2 }} />
          <div style={{
            position: 'absolute', top: '50%', left: `${(displayHour / 24) * 100}%`,
            width: 12, height: 12, borderRadius: '50%', background: '#006FFF',
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 0 0 3px ${topBg}, 0 0 0 4px #006FFF`,
            pointerEvents: 'none',
          }} />
          <input
            type="range" min={0} max={24} step={0.25}
            value={displayHour}
            onPointerDown={onSliderDown}
            onChange={(e) => onSliderChange(Number(e.target.value))}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', margin: 0 }}
          />
        </div>
        <span className="tabular-nums text-right shrink-0" style={{ minWidth: 38, fontSize: 11, color: ink2, fontFamily: '"JetBrains Mono",monospace' }}>
          {fmt(displayHour)}
        </span>
        {isPreviewing && (
          <button
            type="button"
            onClick={onSyncNow}
            style={{ fontSize: 10, color: '#006FFF', background: 'rgba(0,111,255,0.10)', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', flexShrink: 0 }}
            title={`同步到现在 ${fmt(realHour)}`}
          >↺</button>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: topBorder, margin: '0 12px', flexShrink: 0 }} />

      {/* ⚙ Tweaks */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setTweaksOpen((o) => !o)}
          style={{
            width: 34, height: 34, border: `1px solid ${topBorder}`, borderRadius: 7,
            background: tweaksOpen ? (isNight ? '#1F2431' : '#F6F7F9') : topBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: tweaksOpen ? inkColor : ink2, cursor: 'pointer',
          }}
          title="渲染风格"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
        {tweaksOpen && (
          <div
            className="absolute right-0 top-full mt-2 rounded-xl border overflow-hidden z-30"
            style={{ background: topBg, borderColor: topBorder, minWidth: 200, boxShadow: isNight ? '0 20px 60px rgba(2,8,18,.38)' : '0 20px 60px rgba(10,14,20,.12)' }}
          >
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b" style={{ borderColor: topBorder }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: inkColor }}>渲染风格</span>
              <button type="button" onClick={() => setTweaksOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ink3, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
            <div className="px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                {Object.values(RENDER_PRESETS).map((p) => {
                  const active = p.key === activePresetKey
                  const [c0, c1, c2] = swatchPalette[p.key]
                  const swatchBg = `radial-gradient(125% 125% at 18% 14%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0) 58%), linear-gradient(145deg, ${c0} 0%, ${c1} 56%, ${c2} 100%)`
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => { onPresetChange(p.key); setTweaksOpen(false) }}
                      className="relative transition-all duration-200"
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: swatchBg,
                        border: `1px solid ${active ? 'rgba(41,74,112,0.9)' : 'rgba(110,132,158,0.34)'}`,
                        opacity: active ? 1 : 0.72,
                        transform: active ? 'scale(1.18)' : 'scale(1)',
                        cursor: 'pointer',
                      }}
                      title={`${p.label} · ${p.description}`}
                    >
                      {active && (
                        <span className="pointer-events-none absolute -inset-1 rounded-full border"
                          style={{ borderColor: isNight ? 'rgba(186,210,238,0.82)' : 'rgba(78,124,178,0.72)' }} />
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 text-[10px]" style={{ color: ink3 }}>当前：{preset.label}</div>
            </div>
          </div>
        )}
      </div>

      {/* FPS 计数器 */}
      <FpsBadge topBorder={topBorder} topBg={topBg} />

      {/* Share */}
      <button
        type="button"
        style={{
          marginLeft: 4, width: 34, height: 34, border: `1px solid ${topBorder}`, borderRadius: 7,
          background: topBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: ink2, cursor: 'pointer',
        }}
        title="分享"
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"/><path d="M16 6l-4-4-4 4M12 2v13"/>
        </svg>
      </button>
    </div>
  )
}

function DemoTwinHud({
  preset,
  isNight,
  devicesTotal,
  devicesOn,
  windowsTotal,
  wallCount,
}: {
  preset: RenderPreset
  isNight: boolean
  devicesTotal: number
  devicesOn: number
  windowsTotal: number
  wallCount: number
}) {
  const chrome = getDemoChromePalette(isNight)
  const panelBg = isNight ? 'rgba(14,28,51,0.78)' : 'rgba(255,255,255,0.92)'
  const panelBorder = chrome.border
  const titleColor = chrome.text
  const mutedColor = chrome.text3

  return (
    <div className="pointer-events-none absolute bottom-5 left-5 z-10">
      <div className="w-64 rounded-2xl border px-4 py-3 backdrop-blur-xl" style={{ background: panelBg, borderColor: panelBorder }}>
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold text-xs tracking-[0.08em]" style={{ color: titleColor }}>DIGITAL TWIN</div>
          <div className="rounded px-1.5 py-0.5 text-[10px]" style={{ color: mutedColor, border: `1px solid ${panelBorder}` }}>LIVE</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg px-2 py-1.5" style={{ background: chrome.tile }}>
            <div className="text-[10px]" style={{ color: mutedColor }}>在线灯具</div>
            <div className="font-semibold text-sm" style={{ color: titleColor }}>{devicesOn}/{devicesTotal}</div>
          </div>
          <div className="rounded-lg px-2 py-1.5" style={{ background: chrome.tile }}>
            <div className="text-[10px]" style={{ color: mutedColor }}>墙体节点</div>
            <div className="font-semibold text-sm" style={{ color: titleColor }}>{wallCount}</div>
          </div>
          <div className="rounded-lg px-2 py-1.5" style={{ background: chrome.tile }}>
            <div className="text-[10px]" style={{ color: mutedColor }}>门窗开口</div>
            <div className="font-semibold text-sm" style={{ color: titleColor }}>{windowsTotal}</div>
          </div>
          <div className="rounded-lg px-2 py-1.5" style={{ background: chrome.tile }}>
            <div className="text-[10px]" style={{ color: mutedColor }}>风格模式</div>
            <div className="font-semibold text-sm" style={{ color: titleColor }}>{preset.label}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 左侧导航栏 ────────────────────────────────────────────────────────────────

function DemoRail({ isNight }: { isNight: boolean }) {
  const chrome = getDemoChromePalette(isNight)
  const railBg     = chrome.bg
  const railBorder = chrome.border
  const ink3       = chrome.text3

  type RailEntry = { id: string; tip: string; color: string; icon: React.ReactNode; active?: boolean }

  const entries: (RailEntry | null)[] = [
    {
      id: 'overview', tip: '全屋总览', color: '#006AFF', active: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z"/>
          <path d="M9 21V14h6v7"/>
        </svg>
      ),
    },
    null,
    {
      id: 'architecture', tip: '架构', color: '#94a3b8',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <rect x="7" y="7" width="10" height="10" rx="2"/>
          <line x1="7" y1="10" x2="4" y2="10"/><line x1="7" y1="14" x2="4" y2="14"/>
          <line x1="17" y1="10" x2="20" y2="10"/><line x1="17" y1="14" x2="20" y2="14"/>
          <line x1="10" y1="7" x2="10" y2="4"/><line x1="14" y1="7" x2="14" y2="4"/>
          <line x1="10" y1="17" x2="10" y2="20"/><line x1="14" y1="17" x2="14" y2="20"/>
        </svg>
      ),
    },
    {
      id: 'lighting', tip: '灯光', color: '#d4a853',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <path d="M9 18h6"/>
          <path d="M10 21h4"/>
          <path d="M9 18c-1.2-1-3-3.2-3-6a6 6 0 1112 0c0 2.8-1.8 5-3 6"/>
          <path d="M12 2v1.5" opacity="0.5"/>
          <path d="M18.5 5.5l-1 1" opacity="0.5"/>
          <path d="M5.5 5.5l1 1" opacity="0.5"/>
        </svg>
      ),
    },
    {
      id: 'panel', tip: '面板', color: '#c8b8a0',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <rect x="4" y="4" width="16" height="16" rx="2.5"/>
          <line x1="12" y1="6" x2="12" y2="18"/>
          <circle cx="8" cy="10" r="1"/>
          <circle cx="16" cy="14" r="1"/>
        </svg>
      ),
    },
    {
      id: 'sensor', tip: '传感器', color: '#4ade80',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" width={20} height={20}>
          <circle cx="12" cy="12" r="2"/>
          <path d="M16.24 7.76a6 6 0 010 8.49"/>
          <path d="M19.07 4.93a10 10 0 010 14.14"/>
          <path d="M7.76 16.24a6 6 0 010-8.49"/>
          <path d="M4.93 19.07a10 10 0 010-14.14"/>
        </svg>
      ),
    },
    {
      id: 'curtain', tip: '遮阳', color: '#3dd9b6',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <line x1="3" y1="4" x2="21" y2="4"/>
          <line x1="5" y1="4" x2="5" y2="6"/><line x1="19" y1="4" x2="19" y2="6"/>
          <line x1="5" y1="8" x2="19" y2="8"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
          <line x1="5" y1="16" x2="19" y2="16"/>
          <line x1="5" y1="20" x2="19" y2="20"/>
        </svg>
      ),
    },
    {
      id: 'hvac', tip: '暖通', color: '#9b7bea',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <path d="M10 17.66V6a2 2 0 014 0v11.66a4 4 0 11-4 0z"/>
          <line x1="12" y1="17" x2="12" y2="10"/>
          <path d="M18 9a3 3 0 010 4" opacity="0.5"/>
          <path d="M20.5 7.5a6 6 0 010 7" opacity="0.3"/>
        </svg>
      ),
    },
    {
      id: 'av', tip: '影音', color: '#5ba0f5',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <rect x="2" y="4" width="20" height="13" rx="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      ),
    },
    {
      id: 'security', tip: '安防', color: '#f59e0b',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <path d="M12 3L4 7v4c0 5 3.3 9.3 8 11 4.7-1.7 8-6 8-11V7l-8-4z"/>
          <circle cx="12" cy="12" r="2.5"/>
          <circle cx="12" cy="12" r="0.8"/>
        </svg>
      ),
    },
    {
      id: 'network', tip: '网络', color: '#60a5fa',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" width={20} height={20}>
          <circle cx="12" cy="19" r="1.5"/>
          <path d="M8.5 15.5a5 5 0 017 0"/>
          <path d="M5.5 12.5a9 9 0 0113 0"/>
          <path d="M2.5 9.5a13 13 0 0119 0"/>
        </svg>
      ),
    },
  ]

  return (
    <div
      className="flex shrink-0 flex-col py-3 z-10"
      style={{ width: 64, background: railBg, borderRight: `1px solid ${railBorder}`, transition: 'background 0.4s' }}
    >
      {entries.map((entry, i) => {
        if (entry === null) {
          return <div key={i} style={{ height: 1, background: railBorder, margin: '6px 12px' }} />
        }
        const { id, tip, color, icon, active } = entry
        const activeBg = `color-mix(in srgb, ${color} ${isNight ? '14%' : '8%'}, transparent)`
        return (
          <div key={id} className="group relative flex justify-center">
            {/* v0.3 left-border active indicator */}
            {active && (
              <div style={{
                position: 'absolute', left: 0, top: 9, height: 26, width: 2.5,
                borderRadius: '0 2px 2px 0', background: color, pointerEvents: 'none',
              }} />
            )}
            <button
              type="button"
              style={{
                width: 44, height: 44, borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none',
                color: active ? color : ink3,
                background: active ? activeBg : 'transparent',
                cursor: 'pointer', position: 'relative',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.color = isNight ? '#E0E4EC' : '#1E2329'
                  b.style.background = 'rgba(0,106,255,0.04)'
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.color = ink3
                  b.style.background = 'transparent'
                }
              }}
              title={tip}
            >
              {icon}
            </button>
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{
                position: 'absolute', left: 56, top: '50%', transform: 'translateY(-50%)',
                background: chrome.bg,
                color: chrome.text,
                border: `1px solid ${chrome.border}`,
                padding: '4px 8px', borderRadius: 5, fontSize: 11, whiteSpace: 'nowrap' as const,
                zIndex: 30,
              }}
            >
              {tip}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── 场景 dock ────────────────────────────────────────────────────────────────

interface SceneConfig {
  id: string
  label: string
  icon: React.ReactNode
  roomBrightness: number                                          // 0-100，控制 base lighting 层亮度
  getStates: (devices: DeviceData[]) => Record<string, LightState>  // 控制已配置灯具（可以没有）
}

const DEMO_SCENES: SceneConfig[] = [
  {
    id: 'arrive',
    label: '回家',
    roomBrightness: 75,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M2 7L8 2l6 5v7H2z" /><path d="M6 14V9h4v5" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: true, brightness: 75 }])),
  },
  {
    id: 'leave',
    label: '离家',
    roomBrightness: 0,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M10 11l4-3-4-3" /><path d="M14 8H6" /><path d="M6 13H3a1 1 0 01-1-1V4a1 1 0 011-1h3" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: false, brightness: 0 }])),
  },
  {
    id: 'morning',
    label: '晨起',
    roomBrightness: 45,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M11.5 4.5l1.4-1.4M3.1 12.9l1.4-1.4" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: true, brightness: 45 }])),
  },
  {
    id: 'dining',
    label: '用餐',
    roomBrightness: 92,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M5 2v5a2 2 0 002 2v5M9 2v12M11 2v4a2 2 0 002 2v6" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: true, brightness: 92 }])),
  },
  {
    id: 'cinema',
    label: '观影',
    roomBrightness: 8,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><rect x="1" y="3" width="14" height="10" rx="1" /><path d="M8 13v2M5 15h6" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map((d, i) => [d.id, { on: i === 0, brightness: 12 }])),
  },
  {
    id: 'sleep',
    label: '睡眠',
    roomBrightness: 0,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M12 8A6 6 0 014 4a6 6 0 108 8z" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: false, brightness: 0 }])),
  },
]

function SceneDock({
  activeSceneId,
  isNight,
  onExecute,
  onAllOn,
  onAllOff,
}: {
  activeSceneId: string | null
  isNight: boolean
  onExecute: (scene: SceneConfig) => void
  onAllOn: () => void
  onAllOff: () => void
}) {
  const chrome = getDemoChromePalette(isNight)
  const panelBg     = isNight ? 'rgba(14,28,51,0.78)' : 'rgba(255,255,255,0.92)'
  const panelBorder = chrome.border
  const textColor   = chrome.text
  const mutedColor  = chrome.text3

  return (
    <div className="pointer-events-none absolute bottom-5 left-0 right-0 z-10 flex justify-center">
      <div
        className="pointer-events-auto flex items-center gap-0.5 rounded-2xl border px-2 py-1.5 backdrop-blur-xl"
        style={{ background: panelBg, borderColor: panelBorder }}
      >
        {DEMO_SCENES.map((scene) => {
          const isActive = activeSceneId === scene.id
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onExecute(scene)}
              className="flex flex-col items-center gap-1.5 rounded-xl px-3.5 py-2 transition-all duration-200"
              style={{
                background:  isActive ? chrome.chip : 'transparent',
                border:      `1px solid ${isActive ? chrome.chipBorder : 'transparent'}`,
                color:       isActive ? '#006FFF' : textColor,
                minWidth:    52,
              }}
            >
              <div style={{ opacity: isActive ? 1 : 0.6 }}>{scene.icon}</div>
              <span className="font-medium text-[10px] leading-none tracking-[0.03em]">{scene.label}</span>
            </button>
          )
        })}

        <div className="mx-1.5 h-7 w-px self-center" style={{ background: panelBorder }} />

        <button
          type="button"
          onClick={onAllOn}
          className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-all duration-200"
          onMouseEnter={(e) => { e.currentTarget.style.background = chrome.hover }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          style={{ color: mutedColor, minWidth: 40 }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
            <circle cx="8" cy="8" r="3" fill="currentColor" fillOpacity={0.25} />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M11.5 4.5l1.4-1.4M3.1 12.9l1.4-1.4" />
          </svg>
          <span className="text-[9px] leading-none tracking-[0.03em]">全开</span>
        </button>

        <button
          type="button"
          onClick={onAllOff}
          className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-all duration-200"
          onMouseEnter={(e) => { e.currentTarget.style.background = chrome.hover }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          style={{ color: mutedColor, minWidth: 40 }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
            <circle cx="8" cy="8" r="5" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
          </svg>
          <span className="text-[9px] leading-none tracking-[0.03em]">全关</span>
        </button>
      </div>
    </div>
  )
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function ProposalDemoPage() {
  const [seed, setSeed] = useState<SceneSeed | null>(null)
  const [status, setStatus] = useState<'loading' | 'no-data' | 'ready'>('loading')
  const [lightStates, setLightStates] = useState<Record<string, LightState>>({})
  // Base lighting 层：每个房间独立亮度，key = roomCentroid.id
  // 初始为空 {}，等 seed 加载后按 roomCentroids 初始化
  const [roomStates, setRoomStates] = useState<Record<string, number>>({})
  const [activePresetKey, setActivePresetKey] = useState<RenderPresetKey>('opslab')
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)

  // ── 视角系统 ─────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewState>({ level: 'overview', module: 'lighting' })
  const cameraApiRef = useRef<CameraRigApi | null>(null)
  const controlsRef  = useRef<any>(null)

  // 当前真实时间（每分钟自动更新）
  const [realHour, setRealHour] = useState(getRealHour)
  // 拖动滑块时的预览时间（null = 不在预览，使用 realHour）
  const [previewHour, setPreviewHour] = useState<number | null>(null)
  const isDraggingRef = useRef(false)

  const displayHour = previewHour ?? realHour
  const isPreviewing = previewHour !== null
  const activePreset = RENDER_PRESETS[activePresetKey]

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setActivePresetKey(parsePresetKey(params.get('preset')))
  }, [])

  useEffect(() => {
    const s = loadSeed()
    if (!s) { setStatus('no-data'); return }
    setSeed(s)
    setLightStates(
      Object.fromEntries(s.devices.map((d) => [d.id, { on: d.on, brightness: d.brightness }]))
    )
    // 每个房间默认开灯 80%
    setRoomStates(Object.fromEntries(s.roomCentroids.map((c) => [c.id, 80])))
    setStatus('ready')
  }, [])

  // 切换单个房间 base lighting：0 ↔ 80
  const toggleRoomLight = useCallback((roomId: string) => {
    setActiveSceneId(null)
    setRoomStates((prev) => ({ ...prev, [roomId]: (prev[roomId] ?? 80) > 0 ? 0 : 80 }))
  }, [])

  const toggleLight = useCallback((id: string) => {
    setLightStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { on: false, brightness: 100 }), on: !(prev[id]?.on ?? false) },
    }))
  }, [])

  // ── 视角切换函数 ───────────────────────────────────────────────────────

  // 基于当前 seed 构造 PoseInput
  const buildPoseInput = useCallback((s: SceneSeed): PoseInput => ({
    bboxCx: s.bbox.cx,
    bboxCz: s.bbox.cz,
    bboxSpan: Math.max(s.bbox.w, s.bbox.d, 8),
    rooms: s.roomCentroids.map((r) => ({ id: r.id, cx: r.cx, cz: r.cz, radius: r.radius, width: r.width, depth: r.depth })),
    devices: s.devices.map((d) => ({ id: d.id, position: d.position })),
  }), [])

  // 通用推进到指定 ViewState；自动按距离自适应时长
  const playTo = useCallback((nextView: ViewState, opts?: { duration?: number; onDone?: () => void }) => {
    if (!seed || !cameraApiRef.current) return
    const input = buildPoseInput(seed)
    const from = cameraApiRef.current.sampleCurrent()
    const to = resolvePoseForView(nextView, input, from.pos)   // 传当前位姿 → 俯视继承方位
    if (!to) return
    const dist = Math.hypot(to.pos[0] - from.pos[0], to.pos[1] - from.pos[1], to.pos[2] - from.pos[2])
    const refDist = input.bboxSpan * 2
    const tRaw = Math.min(1, Math.max(0.08, dist / refDist))
    const duration = opts?.duration ?? (0.4 + 0.8 * Math.sqrt(tRaw))
    cameraApiRef.current.play({
      fromPos: from.pos, fromTgt: from.tgt,
      toPos: to.pos,     toTgt: to.tgt,
      midPos: computeArcMidpoint(from.pos, to.pos),
      duration,
      onDone: opts?.onDone,
    })
    setView(nextView)
  }, [seed, buildPoseInput])

  // 进入某房间的灯光 Detail（俯视）
  const enterLightingDetail = useCallback((roomId: string) => {
    playTo({ level: 'detail', module: 'lighting', targetId: roomId })
  }, [playTo])

  // 返回 Overview
  const backToOverview = useCallback(() => {
    playTo({ level: 'overview', module: view.module }, { duration: 0.75 })
  }, [playTo, view.module])

  // 切换 Module：若当前在 Detail，走复合动画（先返回 Overview，再留在新 module 的 Overview）
  const switchModule = useCallback((nextModule: ModuleKey) => {
    if (nextModule === view.module) return
    if (view.level === 'detail') {
      // 两段动画：Detail 原 module → Overview（0.6s），到位后 setView 改 module
      playTo({ level: 'overview', module: view.module }, {
        duration: 0.6,
        onDone: () => setView({ level: 'overview', module: nextModule }),
      })
    } else {
      setView({ level: 'overview', module: nextModule })
    }
  }, [view.level, view.module, playTo])

  // Esc 返回
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && view.level === 'detail') {
        e.preventDefault()
        backToOverview()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [view.level, backToOverview])

  // 每分钟同步真实时间
  useEffect(() => {
    const tick = () => setRealHour(getRealHour())
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  // 松手时（无论在哪里松手）恢复真实时间
  useEffect(() => {
    const onUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        setPreviewHour(null)
      }
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [])

  const handleSliderDown = useCallback(() => {
    isDraggingRef.current = true
  }, [])

  const handleSliderChange = useCallback((h: number) => {
    if (isDraggingRef.current) setPreviewHour(h)
  }, [])

  const handleSyncNow = useCallback(() => {
    setPreviewHour(null)
    setRealHour(getRealHour())
  }, [])

  const executeScene = useCallback((scene: SceneConfig) => {
    setActiveSceneId(scene.id)
    // Base lighting 先响应（瞬发，动画由 RoomBaseLight useFrame 负责平滑）
    if (seed) {
      setRoomStates(Object.fromEntries(seed.roomCentroids.map((c) => [c.id, scene.roomBrightness])))
    }
    if (!seed) return
    // 已配置灯具逐个延迟（演示感）
    const targets = scene.getStates(seed.devices)
    Object.entries(targets).forEach(([deviceId, state], i) => {
      setTimeout(() => {
        setLightStates((prev) => ({ ...prev, [deviceId]: { ...prev[deviceId], ...state } }))
      }, i * 160)
    })
  }, [seed])

  const handleAllOn = useCallback(() => {
    setActiveSceneId(null)
    if (seed) setRoomStates(Object.fromEntries(seed.roomCentroids.map((c) => [c.id, 80])))
    if (!seed) return
    seed.devices.forEach((d, i) => {
      setTimeout(() => {
        setLightStates((prev) => ({ ...prev, [d.id]: { ...prev[d.id], on: true, brightness: 80 } }))
      }, i * 100)
    })
  }, [seed])

  const handleAllOff = useCallback(() => {
    setActiveSceneId(null)
    if (seed) setRoomStates(Object.fromEntries(seed.roomCentroids.map((c) => [c.id, 0])))
    if (!seed) return
    seed.devices.forEach((d, i) => {
      setTimeout(() => {
        setLightStates((prev) => ({ ...prev, [d.id]: { ...prev[d.id], on: false } }))
      }, i * 80)
    })
  }, [seed])

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50 text-neutral-400">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-400" />
          <p className="text-sm">正在加载方案…</p>
        </div>
      </div>
    )
  }

  if (status === 'no-data') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50 text-neutral-800">
        <div className="max-w-md text-center">
          <h2 className="mb-3 font-semibold text-xl">还没有方案</h2>
          <p className="mb-6 text-sm text-neutral-400">请先在主编辑器画一个方案，数据会自动同步到这里。</p>
          <a className="inline-block rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700" href="/">
            打开主编辑器
          </a>
        </div>
      </div>
    )
  }

  if (!seed) return null

  // 相机初始位置：30° 仰角（elevation = 30°，polar from zenith = 60°）
  const span  = Math.max(seed.bbox.w, seed.bbox.d, 8)
  const dist  = span * 2.2
  const tgt:  [number, number, number] = [seed.bbox.cx, 0.6, seed.bbox.cz]
  const camX  = tgt[0] + dist * 0.612   // cos(30°) * cos(45°) ≈ 0.612
  const camY  = tgt[1] + dist * 0.5     // sin(30°)
  const camZ  = tgt[2] + dist * 0.612
  // 太阳/月亮方向（随 displayHour 实时更新）
  const sunDir    = computeSunDirection(displayHour)
  const isNight   = sunDir === null
  const lightDir0 = sunDir ?? computeMoonDirection(displayHour)
  // 按楼层 northAngle 旋转光源方向（绕 Y 轴，顺时针）
  const _nr  = (seed.northAngle * Math.PI) / 180
  const _c   = Math.cos(_nr), _s = Math.sin(_nr)
  const lightDir: [number, number, number] = [
    lightDir0[0] * _c - lightDir0[2] * _s,
    lightDir0[1],
    lightDir0[0] * _s + lightDir0[2] * _c,
  ]
  const lightDist = span * 4
  const lightPos: [number, number, number] = [
    seed.bbox.cx + lightDir[0] * lightDist,
    lightDir[1] * lightDist,
    seed.bbox.cz + lightDir[2] * lightDist,
  ]
  const openingsTotal = Object.values(seed.openingsByWall).reduce((acc, arr) => acc + arr.length, 0)
  const lightsOn = Object.values(lightStates).filter((s) => s.on).length
  const canvasFilter = (() => {
    if (activePresetKey === 'opslab') {
      return isNight
        ? 'contrast(1.08) saturate(1.02) brightness(0.96)'
        : 'contrast(1.06) saturate(1.08) brightness(1.01)'
    }
    if (activePresetKey === 'showcase') return isNight ? 'contrast(1.16) saturate(1.2) brightness(0.95)' : 'contrast(1.12) saturate(1.16) brightness(1.02)'
    if (activePresetKey === 'night') return isNight ? 'contrast(1.2) saturate(1.18) brightness(0.88)' : 'contrast(1.08) saturate(1.1) brightness(0.98)'
    if (activePresetKey === 'smooth') return isNight ? 'contrast(1.02) saturate(0.9) brightness(0.96)' : 'contrast(1.01) saturate(0.92) brightness(1.01)'
    return isNight ? 'contrast(1.05) saturate(1.0)' : 'contrast(1.04) saturate(1.04)'
  })()
  const vignetteOpacity = (() => {
    if (activePresetKey === 'showcase') return isNight ? 0.32 : 0.22
    if (activePresetKey === 'night') return isNight ? 0.36 : 0.2
    if (activePresetKey === 'smooth') return isNight ? 0.18 : 0.1
    if (activePresetKey === 'opslab') return isNight ? 0.24 : 0.14
    return isNight ? 0.24 : 0.14
  })()
  const grainOpacity = (() => {
    if (activePresetKey === 'showcase') return isNight ? 0.17 : 0.1
    if (activePresetKey === 'night') return isNight ? 0.2 : 0.12
    if (activePresetKey === 'smooth') return isNight ? 0.06 : 0.04
    if (activePresetKey === 'opslab') return isNight ? 0.14 : 0.09
    return isNight ? 0.12 : 0.07
  })()
  const overlayBlendMode = (() => {
    if (activePresetKey === 'showcase') return isNight ? 'screen' : 'soft-light'
    if (activePresetKey === 'night') return isNight ? 'color-dodge' : 'soft-light'
    if (activePresetKey === 'smooth') return 'normal'
    return isNight ? 'screen' : 'normal'
  })()
  // 只有 showcase（命令中心/数字孪生）保留扫描线装饰，其他 preset 去掉（之前的横纹就是这个）
  const grainPattern = activePresetKey === 'showcase'
    ? 'repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(120,200,255,0.05) 0 1px, transparent 1px 30px)'
    : 'none'

  // 背景径向渐变 — 中心 = 地板色（与反射层 fade 边缘无缝融合），外圈 = 环境背景色
  const bgGradient = isNight
    ? `radial-gradient(ellipse 70% 55% at 50% 58%, ${activePreset.theme.padColorNight} 0%, ${activePreset.theme.bgColorNight} 70%)`
    : `radial-gradient(ellipse 70% 55% at 50% 58%, ${activePreset.theme.padColorDay} 0%, ${activePreset.theme.bgColorDay} 70%)`

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {/* ── 顶栏 ── */}
      <DemoTopBar
        buildingName={seed.buildingName}
        levelName={seed.levelName}
        wallCount={seed.walls.length}
        displayHour={displayHour}
        realHour={realHour}
        isPreviewing={isPreviewing}
        isNight={isNight}
        preset={activePreset}
        activePresetKey={activePresetKey}
        onPresetChange={setActivePresetKey}
        onSliderChange={handleSliderChange}
        onSliderDown={handleSliderDown}
        onSyncNow={handleSyncNow}
      />

      {/* ── 主区域：左栏 + 舞台 ── */}
      <div className="flex min-h-0 flex-1">
        <DemoRail isNight={isNight} />

        {/* ── 舞台（3D + 浮动控件）── */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          style={{ background: bgGradient, transition: 'background 0.7s ease' }}
        >
          {/* 返回按钮 — Detail 模式下左上浮层（Esc 的兜底入口） */}
          {view.level === 'detail' && (
            <button
              type="button"
              onClick={backToOverview}
              className="absolute z-20 flex items-center gap-1.5 rounded-lg px-3 py-2 backdrop-blur-xl transition-all"
              style={{
                top: 16, left: 16,
                background: isNight ? 'rgba(14,28,51,0.82)' : 'rgba(255,255,255,0.88)',
                border: `1px solid ${isNight ? 'rgba(186,210,238,0.22)' : 'rgba(40,60,100,0.12)'}`,
                color: isNight ? 'rgba(230,240,255,0.95)' : 'rgba(30,45,75,0.9)',
                fontSize: 12, fontWeight: 500,
                boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(-2px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateX(0)' }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>返回总览</span>
              <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 4 }}>Esc</span>
            </button>
          )}

          {/* 叠层效果 */}
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              backgroundImage: isNight ? activePreset.theme.overlayNight : activePreset.theme.overlayDay,
              opacity: 1,
              mixBlendMode: overlayBlendMode,
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-[2]"
            style={{
              background: 'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.02), rgba(0,0,0,0.42) 88%)',
              opacity: vignetteOpacity,
              mixBlendMode: 'multiply',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-[2]"
            style={{
              backgroundImage: grainPattern,
              opacity: grainOpacity,
              mixBlendMode: isNight ? 'screen' : 'soft-light',
            }}
          />

          {/* 左下角 Digital Twin HUD */}
          <DemoTwinHud
            preset={activePreset}
            isNight={isNight}
            devicesTotal={seed.devices.length}
            devicesOn={lightsOn}
            windowsTotal={openingsTotal}
            wallCount={seed.walls.length}
          />

          {/* 场景 dock */}
          <SceneDock
            activeSceneId={activeSceneId}
            isNight={isNight}
            onExecute={executeScene}
            onAllOn={handleAllOn}
            onAllOff={handleAllOff}
          />

          {/* 3D Canvas */}
          <Canvas
            key={`${seed.bbox.cx}-${seed.bbox.cz}`}
            camera={{ fov: 50, near: 0.1, far: 500, position: [camX, camY, camZ] }}
            frameloop="always"
            dpr={[1, 1.5]}
            gl={{
              // Retina(2x) 自带像素级 AA，无需 MSAA；antialias 在高 DPR 下反而是性能杀手
              antialias: false,
              toneMapping: activePreset.toneMapping,
              toneMappingExposure: activePreset.exposure,
              powerPreference: 'high-performance',
            }}
            shadows={{ type: THREE.PCFSoftShadowMap }}
            onCreated={({ camera }) => {
              camera.layers.enableAll()
            }}
            style={{
              position: 'absolute', inset: 0,
              background: 'transparent',
              filter: canvasFilter,
              // CSS filter 값이 바뀔 때 즉시 점프하지 않도록 부드럽게 전환
              transition: 'filter 1.0s ease',
            }}
          >
        <fog attach="fog" args={[activePreset.theme.bgColorDay, span * 2.2, span * 6]} />
        <FogAnimator isNight={isNight} preset={activePreset} />
        <DemoEnvironment lightPos={lightPos} isNight={isNight} preset={activePreset} />
        <DemoStructure
          walls={seed.walls}
          openingsByWall={seed.openingsByWall}
          devices={seed.devices}
          slabs={seed.slabs}
          items={seed.items}
          roomCentroids={seed.roomCentroids}
          roomStates={roomStates}
          lightStates={lightStates}
          bbox={seed.bbox}
          lightPos={lightPos}
          isNight={isNight}
          preset={activePreset}
          onToggleLight={toggleLight}
          onToggleRoom={toggleRoomLight}
          view={view}
          onEnterLightingDetail={enterLightingDetail}
        />
        {/* CameraRig — Overview ↔ Detail 动画；ShaderPreheat + Preload 减少首次卡顿 */}
        <CameraRig apiRef={cameraApiRef} controlsRef={controlsRef} />
        <ShaderPreheat />
        <Preload all />
        {/* OrbitControls 参数随 Level 动态调整：
            Overview：大范围 orbit；
            灯光 Detail（俯视）：限制在接近俯视的小范围，缩放限制房间尺度内 */}
        <OrbitControls
          ref={controlsRef}
          target={tgt}
          dampingFactor={0.08}
          enableDamping
          enablePan={false}
          enableZoom
          minDistance={view.level === 'detail' ? 2 : 3}
          maxDistance={view.level === 'detail' ? 8 : dist * 2}
          minPolarAngle={view.level === 'detail' ? 0.02 : Math.PI / 6}
          maxPolarAngle={view.level === 'detail' ? Math.PI * 0.22 : Math.PI * 17 / 36}
        />
          </Canvas>
        </div>
      </div>
    </div>
  )
}
