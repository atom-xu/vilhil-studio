'use client'

import type { WallNode } from '@pascal-app/core'
import type { SceneGraph } from '@pascal-app/editor'
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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

interface ConvertedWall {
  start: { x: number; y: number }
  end: { x: number; y: number }
  thickness: number
  height: number
  id: string
}

interface SceneSeed {
  walls: ConvertedWall[]
  openingsByWall: Record<string, OpeningData[]>
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

  return {
    walls,
    openingsByWall,
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

// ─── 风格常量 ─────────────────────────────────────────────────────────────────

const STYLE = {
  wallColor:   '#ccc4b8',   // 玻璃墙体色
  capColorA:   '#2D7FF9',   // VilHil 品牌蓝（渐变起点）
  capColorB:   '#A8D4FF',   // 浅冰蓝（渐变终点）
  capOpacity:  0.72,
  windowColor: '#b8d0e8',   // 窗玻璃蓝
  doorColor:   '#c8bfb0',   // 门洞暗色
  floorColor:  '#ede8df',
  bgColor:     '#f4f0eb',
}

const WALL_HEIGHT = 2.7


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
  const midH = wallHeight * 0.5   // 顶面 y 坐标 > midH，底面 < midH
  for (let i = 0; i < pos.count; i += 3) {
    // 用三角面重心的 y 坐标判断是否为顶面（避免依赖法线方向）
    const avgY = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
    const isTop = Math.abs(nor.getY(i)) > 0.9 && avgY > midH
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

/** 从墙段 body 中移除端面（法线平行于墙方向），只保留侧面 */
function stripEndFaces(geo: THREE.BufferGeometry, ux: number, uz: number): THREE.BufferGeometry {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const newP: number[] = [], newN: number[] = []
  for (let i = 0; i < pos.count; i += 3) {
    // 端面：法线与墙走向的点积 ≈ ±1
    if (Math.abs(nor.getX(i) * ux + nor.getZ(i) * uz) > 0.9) continue
    for (let v = 0; v < 3; v++) {
      const j = i + v
      newP.push(pos.getX(j), pos.getY(j), pos.getZ(j))
      newN.push(nor.getX(j), nor.getY(j), nor.getZ(j))
    }
  }
  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute(newP, 3))
  result.setAttribute('normal',   new THREE.Float32BufferAttribute(newN, 3))
  return result
}

function buildWallGeo(walls: ConvertedWall[]): { bodyGeo: THREE.BufferGeometry | null; capGeo: THREE.BufferGeometry | null } {
  const resolved = walls.filter(
    (w) => w.start && w.end &&
      isFinite(w.start.x) && isFinite(w.end.x) &&
      isFinite(w.start.y) && isFinite(w.end.y) &&
      w.thickness > 0 && w.height > 0,
  )
  if (resolved.length === 0) return { bodyGeo: null, capGeo: null }

  const ptKey = (x: number, y: number) =>
    `${Math.round(x * 1000)},${Math.round(y * 1000)}`

  // 端点邻接表 — 找哪些端点是连接点（接 2+ 面墙）
  const adj = new Map<string, { wall: ConvertedWall; atStart: boolean }[]>()
  for (const w of resolved) {
    const sk = ptKey(w.start.x, w.start.y)
    const ek = ptKey(w.end.x, w.end.y)
    if (!adj.has(sk)) adj.set(sk, [])
    if (!adj.has(ek)) adj.set(ek, [])
    adj.get(sk)!.push({ wall: w, atStart: true })
    adj.get(ek)!.push({ wall: w, atStart: false })
  }

  const allBodyGeos: THREE.BufferGeometry[] = []
  const allCapGeos:  THREE.BufferGeometry[] = []

  // ── 内缩墙段：连接端精确缩进 T/2，侧面与节点方块首尾相邻（无重叠无缝隙）──
  for (const w of resolved) {
    const dx = w.end.x - w.start.x, dz = w.end.y - w.start.y
    const rawLen = Math.hypot(dx, dz)
    if (rawLen < 0.001) continue

    const ux = dx / rawLen, uz = dz / rawLen
    const half = w.thickness / 2

    const sk = ptKey(w.start.x, w.start.y)
    const ek = ptKey(w.end.x, w.end.y)
    const shrinkS = (adj.get(sk)?.length ?? 0) > 1
    const shrinkE = (adj.get(ek)?.length ?? 0) > 1

    const sx = w.start.x + (shrinkS ? ux * half : 0)
    const sz = w.start.y + (shrinkS ? uz * half : 0)
    const ex = w.end.x   - (shrinkE ? ux * half : 0)
    const ez = w.end.y   - (shrinkE ? uz * half : 0)

    const len = Math.max(Math.hypot(ex - sx, ez - sz), 0.001)
    const geo = new THREE.BoxGeometry(len, w.height, w.thickness)
    geo.applyMatrix4(
      new THREE.Matrix4()
        .makeRotationY(-Math.atan2(ez - sz, ex - sx))
        .setPosition((sx + ex) / 2, w.height / 2, (sz + ez) / 2),
    )
    const { body: rawBody, cap } = splitCapBody(geo, w.height)
    geo.dispose()
    const body = stripEndFaces(rawBody, ux, uz)
    rawBody.dispose()
    allBodyGeos.push(body)
    if (cap) allCapGeos.push(cap)
  }

  // ── 节点方块：每个连接点（接 2+ 面墙）放一个 T×T×H 方块 ──────────────────
  const processedJunctions = new Set<string>()
  for (const w of resolved) {
    for (const [px, py] of [[w.start.x, w.start.y], [w.end.x, w.end.y]] as [number, number][]) {
      const key = ptKey(px, py)
      if (processedJunctions.has(key)) continue
      if ((adj.get(key)?.length ?? 0) < 2) continue
      processedJunctions.add(key)

      const T = w.thickness, H = w.height
      const nodeGeo = new THREE.BoxGeometry(T, H, T)
      nodeGeo.applyMatrix4(new THREE.Matrix4().setPosition(px, H / 2, py))
      const { body, cap } = splitCapBody(nodeGeo, H)
      nodeGeo.dispose()
      allBodyGeos.push(body)
      if (cap) allCapGeos.push(cap)
    }
  }

  if (allBodyGeos.length === 0) return { bodyGeo: null, capGeo: null }

  const bodyGeo = mergeGeometries(allBodyGeos) ?? null
  const capGeo  = allCapGeos.length > 0 ? (mergeGeometries(allCapGeos) ?? null) : null
  for (const g of allBodyGeos) g.dispose()
  for (const g of allCapGeos)  g.dispose()
  return { bodyGeo, capGeo }
}

// ─── 演示结构渲染器 ───────────────────────────────────────────────────────────

interface StructureProps {
  walls: ConvertedWall[]
  openingsByWall: Record<string, OpeningData[]>
  bbox: SceneSeed['bbox']
  lightPos: [number, number, number]
}

function DemoStructure({ walls, openingsByWall, bbox, lightPos }: StructureProps) {
  const { bodyGeo, capGeo } = useMemo(() => buildWallGeo(walls), [walls])
  // 清理几何体
  useEffect(() => {
    return () => {
      bodyGeo?.dispose()
      capGeo?.dispose()
    }
  }, [bodyGeo, capGeo])

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
      {/* 超大地面，边缘移出视野 */}
      <mesh position={[bbox.cx, 0, bbox.cz]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={STYLE.floorColor} roughness={0.8} metalness={0} />
      </mesh>

      {/* 合并墙体 — 内缩墙段 + 节点方块，几何体无叠加，FrontSide 背面剔除端面 */}
      {bodyGeo && (
        <mesh geometry={bodyGeo} castShadow receiveShadow>
          <meshStandardMaterial
            color={STYLE.wallColor}
            transparent
            opacity={0.48}
            roughness={0.08}
            metalness={0.02}
            depthWrite={true}
            side={THREE.FrontSide}
          />
        </mesh>
      )}

      {/* 顶面 cap — 位置驱动渐变：品牌蓝 → 浅冰蓝，叠加光源高光 */}
      {capGeo && (
        <mesh geometry={capGeo} renderOrder={2}>
          <shaderMaterial
            key={STYLE.capColorA + STYLE.capColorB}
            transparent
            depthWrite={false}
            uniforms={{
              uColorA:  { value: new THREE.Color(STYLE.capColorA) },
              uColorB:  { value: new THREE.Color(STYLE.capColorB) },
              uOpacity: { value: STYLE.capOpacity },
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

      {/* 窗 / 门面板 — depthTest=false 确保始终可见（面板在墙体中心，否则被深度缓冲遮挡）*/}
      {openingPanels.map((p) => (
        <mesh key={p.key} position={p.position} rotation={p.rotation} renderOrder={3}>
          {/* 厚度贯穿整面墙，从内外都能看到 */}
          <boxGeometry args={[p.width, p.height, p.thickness + 0.01]} />
          <meshBasicMaterial
            color={p.kind === 'window' ? STYLE.windowColor : STYLE.doorColor}
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

// ─── 演示灯光环境 ─────────────────────────────────────────────────────────────

function DemoEnvironment({
  lightPos, isNight,
}: { lightPos: [number, number, number]; isNight: boolean }) {
  return (
    <>
      <hemisphereLight
        skyColor={isNight ? '#0d1a2e' : '#d4e8ff'}
        groundColor={isNight ? '#060c14' : '#c8b890'}
        intensity={isNight ? 0.2 : 1.3}
      />
      <directionalLight
        castShadow
        color={isNight ? '#7bb8e8' : '#fff8ef'}
        intensity={isNight ? 0.15 : 0.35}
        position={lightPos}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-radius={isNight ? 8 : 4}
      />
    </>
  )
}

// ─── 顶部信息条 ───────────────────────────────────────────────────────────────

function DemoHeader({
  buildingName, levelName, wallCount,
  displayHour, realHour, isPreviewing, isNight,
  onSliderChange, onSliderDown, onSyncNow,
}: {
  buildingName: string
  levelName: string
  wallCount: number
  displayHour: number
  realHour: number
  isPreviewing: boolean
  isNight: boolean
  onSliderChange: (h: number) => void
  onSliderDown: () => void
  onSyncNow: () => void
}) {
  const fmt = (h: number) => {
    const hh = Math.floor(h).toString().padStart(2, '0')
    const mm = Math.round((h % 1) * 60).toString().padStart(2, '0')
    return `${hh}:${mm}`
  }

  return (
    <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 flex items-start justify-between p-5">
      {/* 左：建筑信息 */}
      <div className="pointer-events-auto rounded-2xl border border-black/8 bg-white/70 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <a
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-black/5 hover:text-neutral-700"
            href="/" title="返回主编辑器"
          >←</a>
          <div>
            <div className="font-semibold text-neutral-800 text-sm">{buildingName}</div>
            <div className="text-neutral-400 text-xs">{levelName} · {wallCount} 面墙</div>
          </div>
        </div>
      </div>

      {/* 右：时间 + 滑块 */}
      <div className="pointer-events-auto w-56 rounded-2xl border border-black/8 bg-white/70 px-4 py-3 backdrop-blur-xl">
        {/* 时间显示行 */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none">{isNight ? '🌙' : '☀️'}</span>
            <span className="font-mono font-semibold text-neutral-800 text-sm tabular-nums">
              {fmt(displayHour)}
            </span>
            {isPreviewing && (
              <span className="rounded bg-[#2D7FF9]/10 px-1 py-0.5 text-[10px] text-[#2D7FF9]">预览</span>
            )}
          </div>
          <button
            onClick={onSyncNow}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-black/5 hover:text-[#2D7FF9]"
            title={`同步到现在 ${fmt(realHour)}`}
          >
            ↺ {fmt(realHour)}
          </button>
        </div>

        {/* 滑块 */}
        <input
          type="range"
          min={0}
          max={24}
          step={0.25}
          value={displayHour}
          onPointerDown={onSliderDown}
          onChange={(e) => onSliderChange(Number(e.target.value))}
          className="w-full cursor-pointer accent-[#2D7FF9]"
        />

        {/* 刻度标签 */}
        <div className="mt-0.5 flex justify-between text-[10px] text-neutral-300">
          <span>0</span>
          <span>6</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>
    </div>
  )
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function ProposalDemoPage() {
  const [seed, setSeed] = useState<SceneSeed | null>(null)
  const [status, setStatus] = useState<'loading' | 'no-data' | 'ready'>('loading')

  // 当前真实时间（每分钟自动更新）
  const [realHour, setRealHour] = useState(getRealHour)
  // 拖动滑块时的预览时间（null = 不在预览，使用 realHour）
  const [previewHour, setPreviewHour] = useState<number | null>(null)
  const isDraggingRef = useRef(false)

  const displayHour = previewHour ?? realHour
  const isPreviewing = previewHour !== null

  useEffect(() => {
    const s = loadSeed()
    if (!s) { setStatus('no-data'); return }
    setSeed(s); setStatus('ready')
  }, [])

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

  return (
    <div
      className="h-screen w-screen transition-colors duration-700"
      style={{ background: isNight ? '#0a0f1a' : STYLE.bgColor }}
    >
      <DemoHeader
        buildingName={seed.buildingName}
        levelName={seed.levelName}
        wallCount={seed.walls.length}
        displayHour={displayHour}
        realHour={realHour}
        isPreviewing={isPreviewing}
        isNight={isNight}
        onSliderChange={handleSliderChange}
        onSliderDown={handleSliderDown}
        onSyncNow={handleSyncNow}
      />
      <Canvas
        key={`${seed.bbox.cx}-${seed.bbox.cz}`}
        camera={{ fov: 50, near: 0.1, far: 500, position: [camX, camY, camZ] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        shadows="soft"
        style={{ background: isNight ? '#0a0f1a' : STYLE.bgColor }}
      >
        <DemoEnvironment lightPos={lightPos} isNight={isNight} />
        <DemoStructure
          walls={seed.walls}
          openingsByWall={seed.openingsByWall}
          bbox={seed.bbox}
          lightPos={lightPos}
        />
        {/* 30° 仰角初始，允许垂直旋转 + 缩放 */}
        <OrbitControls
          target={tgt}
          dampingFactor={0.08}
          enableDamping
          enablePan={false}
          enableZoom
          minDistance={3}
          maxDistance={dist * 2}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI * 17 / 36}
        />
      </Canvas>
    </div>
  )
}
