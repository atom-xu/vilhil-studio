import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import type { ConvertedWall, OpeningData, SlabData } from './types'

export const csgEval = new Evaluator()
csgEval.useGroups = false

export const WALL_HEIGHT = 2.7
// Layer 1 = 室内专用光照层，室内光源只照这一层 → 室外地面（Layer 0）不受影响
export const INTERIOR_LAYER = 1

// ─── 墙体几何构建 — 内缩墙段 + 节点方块（零叠加，零拼缝）──────────────────────
//
//  原理：每个连接端点放一个 T×T×H 节点方块，墙段两端向内缩进 T/2（嵌入 eps）
//  使端面完全藏入节点方块内部，背面剔除后不可见。几何体完全不重叠。

/**
 * 把几何体拆成顶面 cap 和侧面 body。
 * wallHeight：用于区分顶面（y ≈ H）与底面（y ≈ 0），不依赖法线方向，
 * 这样即使法线因坐标变换被翻转也能正确识别。
 */
export function splitCapBody(geoIn: THREE.BufferGeometry, wallHeight: number) {
  // ExtrudeGeometry / BoxGeometry 都是索引几何体，需先展开为非索引才能按三角面遍历
  const isIndexed = !!geoIn.index
  const geo = isIndexed ? geoIn.toNonIndexed() : geoIn
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nor = geo.attributes.normal as THREE.BufferAttribute
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
export function mergeCollinearWalls(walls: ConvertedWall[]): ConvertedWall[] {
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
export const PAD_THICKNESS = 0.10  // 10 cm
// slab.polygon 沿墙体中线；外扩量 = 墙体半厚 (0.12m) + 2cm 台阶
export const PAD_OUTSET    = 0.14
// 反射层单独外扩到 2m — 让建筑外围也有反射地板（像环绕着的"倒影水面"）
export const PAD_REFLECT_OUTSET = 2.0
// Pad 垂直偏移：顶面贴地面（y=0），底面在 y = -PAD_THICKNESS（-10cm）
// 从地下 10cm "填"到 0，不突出地面；重叠靠 buildPadGeo 的 dedup 解决
export const PAD_Y_OFFSET  = 0

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

export function outsetPolygon(poly: [number, number][], dist: number): [number, number][] {
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
export function buildPadTopGeo(slabs: SlabData[], outset: number = PAD_OUTSET): THREE.BufferGeometry | null {
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

export function buildPadGeo(slabs: SlabData[]): THREE.BufferGeometry | null {
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

export function splitPadFaces(geo: THREE.BufferGeometry): {
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
export function buildWallGeo(
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
  let wallHeight = merged[0]!.height

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
      const next: Brush = csgEval.evaluate(combined, brush, ADDITION)
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

      const next: Brush = csgEval.evaluate(combined!, brush, SUBTRACTION)
      combined!.geometry.dispose()
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
