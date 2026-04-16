import { positionKey, quantizePoint, useScene, WallNode as WallSchema, type WallNode } from '@pascal-app/core'

/**
 * 墙体端点清理工具 —— 把一层里近似重合的墙端点合并到同一坐标。
 *
 * 典型用途：F1（全局精度守恒）之前画的历史数据可能有 1-10mm 的浮点漂移，
 * `WallNode` 的 Zod transform 只在首次 parse 时量化，对已存在内存里的脏数据
 * 无能为力。本工具一次性把漂移洗干净，让后续的外轮廓追踪 / 楼板生成拿到
 * 干净的拓扑。
 *
 * 功能即工具：不依赖 React / DOM，可被 AI / 脚本 / UI 共同调用。
 */

export interface CleanupOptions {
  /** 要清理的楼层 id */
  levelId: string
  /**
   * 合并阈值（米）。距离小于此值的端点会被合并到同一坐标。
   * 默认 0.02m = 2cm —— 比 F1 的 1cm 量化大一倍，能吃掉常见的历史漂移，
   * 又远小于最小墙长（0.5m），不会误合并真正不同的端点。
   */
  mergeTolerance?: number
}

export interface CleanupResult {
  wallsScanned: number
  /** 实际坐标发生变化的端点数量 */
  endpointsMerged: number
  /** 形成了多少个多成员的合并簇 */
  clustersFormed: number
}

const EMPTY_RESULT: CleanupResult = {
  wallsScanned: 0,
  endpointsMerged: 0,
  clustersFormed: 0,
}

type PointRef = {
  wallId: string
  which: 'start' | 'end'
  p: [number, number]
}

/**
 * 扫描指定楼层的所有墙端点，把位置相近的端点合并到同一坐标。
 *
 * 算法：
 *   1. 收集所有墙端点（每面墙 2 个）
 *   2. 简单阈值聚类（O(n²)，n 通常几十到几百）
 *   3. 每个多成员簇取量化后的质心作为规范坐标
 *   4. 通过 `updateNodes` 批量回写
 */
export function cleanupWallEndpoints(options: CleanupOptions): CleanupResult {
  const { levelId, mergeTolerance = 0.02 } = options
  const { nodes, updateNodes } = useScene.getState()

  const level = nodes[levelId as keyof typeof nodes] as
    | { type: string; children: string[] }
    | undefined
  if (!level || level.type !== 'level') return EMPTY_RESULT

  const walls = level.children
    .map((id) => nodes[id as keyof typeof nodes])
    .filter((n): n is WallNode => (n as any)?.type === 'wall')

  if (walls.length === 0) return EMPTY_RESULT

  // 1. 收集所有端点
  const refs: PointRef[] = []
  for (const w of walls) {
    refs.push({ wallId: w.id, which: 'start', p: w.start as [number, number] })
    refs.push({ wallId: w.id, which: 'end', p: w.end as [number, number] })
  }

  // 2. 聚类 —— 若端点到某个簇的质心距离 < tolerance，加入该簇；否则新开簇
  const clusterTolSq = mergeTolerance * mergeTolerance
  const clusters: Array<{ centroid: [number, number]; members: PointRef[] }> = []
  for (const ref of refs) {
    let placed = false
    for (const c of clusters) {
      const dx = ref.p[0] - c.centroid[0]
      const dz = ref.p[1] - c.centroid[1]
      if (dx * dx + dz * dz < clusterTolSq) {
        c.members.push(ref)
        // 累进平均更新质心
        const n = c.members.length
        c.centroid = [
          c.centroid[0] + (ref.p[0] - c.centroid[0]) / n,
          c.centroid[1] + (ref.p[1] - c.centroid[1]) / n,
        ]
        placed = true
        break
      }
    }
    if (!placed) clusters.push({ centroid: [ref.p[0], ref.p[1]], members: [ref] })
  }

  // 3. 只处理多成员簇（单点簇本来就没人和它合并）
  const canonical = new Map<number, [number, number]>() // cluster index → 规范坐标
  let endpointsMerged = 0
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i]!
    if (c.members.length <= 1) continue
    const snapped = quantizePoint(c.centroid)
    canonical.set(i, snapped)
    for (const m of c.members) {
      if (m.p[0] !== snapped[0] || m.p[1] !== snapped[1]) endpointsMerged++
    }
  }

  const clustersFormed = canonical.size
  if (clustersFormed === 0) {
    return { wallsScanned: walls.length, endpointsMerged: 0, clustersFormed: 0 }
  }

  // 4. 批量更新：合并每面墙上被动到的端点
  const updatesByWall = new Map<
    string,
    { start?: [number, number]; end?: [number, number] }
  >()
  for (let i = 0; i < clusters.length; i++) {
    const snapped = canonical.get(i)
    if (!snapped) continue
    for (const m of clusters[i]!.members) {
      const existing = updatesByWall.get(m.wallId) ?? {}
      existing[m.which] = snapped
      updatesByWall.set(m.wallId, existing)
    }
  }

  const updates = Array.from(updatesByWall, ([id, data]) => ({
    id: id as any,
    data: data as any,
  }))
  updateNodes(updates)

  return {
    wallsScanned: walls.length,
    endpointsMerged,
    clustersFormed,
  }
}

export interface CollinearCleanupResult {
  wallsScanned: number
  /** 完全重复被删除的墙数 */
  duplicatesRemoved: number
  /** 部分重叠被合并成一面新墙的操作次数 */
  wallsMerged: number
}

/**
 * 检测并修复共线重叠墙体 —— 把在同一直线上有实质重叠的两面墙合并或去重。
 *
 * 最常见场景：描摹底图时同一段墙画了两遍，或 F3 自动打断后产生重叠段。
 *
 * 处理规则：
 *   - B 完全在 A 内 → 删除 B，保留 A
 *   - A 完全在 B 内 → 删除 A，保留 B
 *   - 部分重叠 → 合并为覆盖两者的最长段，删除原墙
 *   - 有子节点（门窗）的墙跳过（无法自动重分配子节点）
 *
 * 功能即工具：不依赖 React / DOM。
 */
export function cleanupCollinearDuplicates(levelId: string): CollinearCleanupResult {
  const { nodes, createNode, deleteNodes } = useScene.getState()

  const level = nodes[levelId as keyof typeof nodes] as
    | { type: string; children: string[] }
    | undefined
  if (!level || level.type !== 'level') {
    return { wallsScanned: 0, duplicatesRemoved: 0, wallsMerged: 0 }
  }

  const walls = level.children
    .map((id) => nodes[id as keyof typeof nodes])
    .filter((n): n is WallNode => (n as any)?.type === 'wall')

  if (walls.length < 2) return { wallsScanned: walls.length, duplicatesRemoved: 0, wallsMerged: 0 }

  // 数值容差
  const PARALLEL_TOL_RATIO = 1e-4  // cross(dA,dB)/(|dA||dB|) < this → parallel
  const COLLINEAR_TOL = 3e-3       // 垂直距离 < 3mm → 共线
  const OVERLAP_MIN = 0.01         // 实质重叠最小值 1cm（参数空间）

  const toDelete = new Set<string>()
  const toCreate: Array<WallNode> = []
  const processed = new Set<string>()

  for (let i = 0; i < walls.length; i++) {
    const a = walls[i]
    if (!a || processed.has(a.id)) continue
    if ((a.children?.length ?? 0) > 0) continue // 有子节点，跳过

    const [a0x, a0z] = a.start as [number, number]
    const [a1x, a1z] = a.end as [number, number]
    const adx = a1x - a0x, adz = a1z - a0z
    const alenSq = adx * adx + adz * adz
    if (alenSq < 1e-9) continue

    const aLen = Math.sqrt(alenSq)

    for (let j = i + 1; j < walls.length; j++) {
      const b = walls[j]
      if (!b || processed.has(b.id)) continue
      if ((b.children?.length ?? 0) > 0) continue

      const [b0x, b0z] = b.start as [number, number]
      const [b1x, b1z] = b.end as [number, number]
      const bdx = b1x - b0x, bdz = b1z - b0z
      const blenSq = bdx * bdx + bdz * bdz
      if (blenSq < 1e-9) continue

      const bLen = Math.sqrt(blenSq)

      // 1. 平行判定
      const cross = adx * bdz - adz * bdx
      if (Math.abs(cross) > PARALLEL_TOL_RATIO * aLen * bLen) continue

      // 2. 共线判定：B.start 到 A 所在直线的垂直距离
      const perpCross = adx * (b0z - a0z) - adz * (b0x - a0x)
      if (Math.abs(perpCross) > COLLINEAR_TOL * aLen) continue

      // 3. 把 B 的两端点投影到 A 的参数轴 t ∈ [0,1]
      const tB0 = ((b0x - a0x) * adx + (b0z - a0z) * adz) / alenSq
      const tB1 = ((b1x - a0x) * adx + (b1z - a0z) * adz) / alenSq
      const tMin = Math.min(tB0, tB1)
      const tMax = Math.max(tB0, tB1)

      // 实质重叠检测
      const overlapStart = Math.max(tMin, 0)
      const overlapEnd = Math.min(tMax, 1)
      if (overlapEnd <= overlapStart + OVERLAP_MIN / aLen) continue

      // ── 有实质共线重叠 ──

      // B 完全在 A 内（删 B）
      if (tMin >= -1e-5 && tMax <= 1 + 1e-5) {
        processed.add(b.id)
        toDelete.add(b.id)
        continue
      }

      // A 完全在 B 内（删 A）
      if (tMin <= 1e-5 && tMax >= 1 - 1e-5) {
        processed.add(a.id)
        processed.add(b.id)
        toDelete.add(a.id)
        break // a 已处理，跳出内层循环
      }

      // 部分重叠 → 合并成覆盖两者的最长段
      processed.add(a.id)
      processed.add(b.id)
      toDelete.add(a.id)
      toDelete.add(b.id)

      const mergedT0 = Math.min(0, tMin)
      const mergedT1 = Math.max(1, tMax)
      const mergedStart: [number, number] = [a0x + mergedT0 * adx, a0z + mergedT0 * adz]
      const mergedEnd: [number, number] = [a0x + mergedT1 * adx, a0z + mergedT1 * adz]

      const merged = WallSchema.parse({
        name: a.name,
        start: mergedStart,
        end: mergedEnd,
        thickness: a.thickness,
        height: a.height,
        material: a.material,
        frontSide: a.frontSide,
        backSide: a.backSide,
        metadata: a.metadata,
      })
      toCreate.push(merged)
      break
    }
  }

  const duplicatesRemoved = toDelete.size - toCreate.length
  const wallsMerged = toCreate.length

  if (toDelete.size > 0) {
    deleteNodes(Array.from(toDelete) as any)
  }
  for (const node of toCreate) {
    createNode(node, levelId as any)
  }

  return { wallsScanned: walls.length, duplicatesRemoved, wallsMerged }
}

export interface SplitTJunctionsResult {
  wallsScanned: number
  /** 发生打断的墙数 */
  wallsSplit: number
  /** 新生成的墙段数 */
  segmentsCreated: number
}

/**
 * 追溯修复 T 型交叉 —— 扫描当前层，把所有"墙端点落在另一面墙体内部"的位置补做打断。
 *
 * F3 自动打断只在创建新墙时触发，不会追溯历史数据。
 * 本工具补足这个缺口：一次性把所有未打断的 T 型交点全部修复。
 *
 * 安全判据（与 F3 相同）：
 *   1. 打断墙不能有子节点（门/窗）
 *   2. 打断点必须共线（cross ≈ 0）
 *   3. 打断点不能与被打断墙方向平行（防止同向墙打断出重叠段）
 *   4. 参数 t 必须严格在墙段内部（离两端至少 WALL_MIN_LENGTH）
 */
export function splitTJunctions(levelId: string): SplitTJunctionsResult {
  const MIN_LENGTH = 0.05   // 与 wall-drafting.ts WALL_MIN_LENGTH 保持一致
  const COLLINEAR_TOL = 1e-6
  const PARALLEL_RATIO = 1e-3
  const PROXIMITY_TOL = 5e-3  // 端点距离被打断墙体的最大垂直距离（5mm）

  const { nodes, createNode, deleteNodes } = useScene.getState()

  const level = nodes[levelId as keyof typeof nodes] as
    | { type: string; children: string[] }
    | undefined
  if (!level || level.type !== 'level') {
    return { wallsScanned: 0, wallsSplit: 0, segmentsCreated: 0 }
  }

  // 每次操作前重新从 store 读取，因为 createNode/deleteNodes 会更新 store
  const getWalls = () => {
    const fresh = useScene.getState().nodes
    const lv = fresh[levelId as keyof typeof fresh] as any
    return ((lv?.children ?? []) as string[])
      .map((id: string) => fresh[id as keyof typeof fresh])
      .filter((n: any): n is WallNode => n?.type === 'wall')
  }

  // 一次完整扫描：找出所有需要打断的 (wallId → splitPoints[]) 映射
  // 迭代直到没有新的打断（一次扫描可能暴露新的交叉点）
  let totalWallsSplit = 0
  let totalSegmentsCreated = 0
  const MAX_PASSES = 20

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const walls = getWalls()

    // wallId → 按 t 排序的打断点列表
    const splitMap = new Map<string, Array<{ t: number; point: [number, number] }>>()

    for (const A of walls) {
      if ((A.children?.length ?? 0) > 0) continue  // 有子节点，跳过
      const [a0, a1] = A.start as [number, number]
      const [b0, b1] = A.end as [number, number]
      const adx = b0 - a0, adz = b1 - a1
      const aLenSq = adx * adx + adz * adz
      if (aLenSq < 1e-9) continue
      const aLen = Math.sqrt(aLenSq)

      for (const B of walls) {
        if (B.id === A.id) continue
        // 检查 B 的两个端点是否落在 A 的体内
        for (const ep of [B.start as [number, number], B.end as [number, number]]) {
          // 1. 垂直距离（ep 到 A 所在直线）
          const cross = adx * (ep[1] - a1) - adz * (ep[0] - a0)
          if (Math.abs(cross) > PROXIMITY_TOL * aLen) continue

          // 2. 参数 t
          const t = ((ep[0] - a0) * adx + (ep[1] - a1) * adz) / aLenSq
          const minT = MIN_LENGTH / aLen
          const maxT = 1 - minT
          if (t <= minT || t >= maxT) continue

          // 3. 不能与 B 的方向平行（防止共线墙打断出重叠段）
          const [bdx, bdz] = [
            (B.end as [number, number])[0] - (B.start as [number, number])[0],
            (B.end as [number, number])[1] - (B.start as [number, number])[1],
          ]
          const bLen = Math.sqrt(bdx * bdx + bdz * bdz)
          if (bLen > 1e-9 && Math.abs(adx * bdz - adz * bdx) < PARALLEL_RATIO * aLen * bLen) continue

          // 4. 打断点精确投影到 A 上（消除 cross 误差）
          const splitPt: [number, number] = [a0 + adx * t, a1 + adz * t]

          const existing = splitMap.get(A.id) ?? []
          // 去重（距离 < 1cm 的点算同一个）
          const dup = existing.some(s => Math.abs(s.t - t) < MIN_LENGTH / aLen)
          if (!dup) {
            existing.push({ t, point: splitPt })
            splitMap.set(A.id, existing)
          }
        }
      }
    }

    if (splitMap.size === 0) break  // 本轮没有新交叉，收敛

    const toDelete: string[] = []
    for (const [wallId, splits] of splitMap) {
      const wall = getWalls().find(w => w.id === wallId)
      if (!wall) continue

      // 按 t 升序排序，顺序切割
      splits.sort((a, b) => a.t - b.t)

      const points: [number, number][] = [
        wall.start as [number, number],
        ...splits.map(s => s.point),
        wall.end as [number, number],
      ]

      const common = {
        thickness: wall.thickness,
        height: wall.height,
        material: wall.material,
        frontSide: wall.frontSide,
        backSide: wall.backSide,
        metadata: wall.metadata,
      }

      let valid = true
      const segments: WallNode[] = []
      for (let i = 0; i < points.length - 1; i++) {
        const seg = WallSchema.parse({
          name: wall.name ? `${wall.name}(${i + 1})` : undefined,
          start: points[i],
          end: points[i + 1],
          ...common,
        })
        const dx = (seg.end as [number,number])[0] - (seg.start as [number,number])[0]
        const dz = (seg.end as [number,number])[1] - (seg.start as [number,number])[1]
        if (dx * dx + dz * dz < MIN_LENGTH * MIN_LENGTH) { valid = false; break }
        segments.push(seg)
      }
      if (!valid || segments.length < 2) continue

      toDelete.push(wallId)
      for (const seg of segments) createNode(seg, levelId as any)
      totalWallsSplit++
      totalSegmentsCreated += segments.length
    }

    if (toDelete.length > 0) deleteNodes(toDelete as any)
  }

  return {
    wallsScanned: getWalls().length,
    wallsSplit: totalWallsSplit,
    segmentsCreated: totalSegmentsCreated,
  }
}

/**
 * 诊断工具：统计楼层里有多少悬挂端点（degree = 1），不修改数据。
 *
 * degree = 1 的端点通常是"外轮廓没闭合"的信号，用来在 UI 层决定是否
 * 引导用户先清理再生成楼板。
 */
export function diagnoseWallGraph(levelId: string): {
  walls: number
  uniqueVertices: number
  danglingVertices: number
} {
  const { nodes } = useScene.getState()
  const level = nodes[levelId as keyof typeof nodes] as
    | { type: string; children: string[] }
    | undefined
  if (!level || level.type !== 'level') {
    return { walls: 0, uniqueVertices: 0, danglingVertices: 0 }
  }
  const walls = level.children
    .map((id) => nodes[id as keyof typeof nodes])
    .filter((n): n is WallNode => (n as any)?.type === 'wall')

  const degree = new Map<string, number>()
  for (const w of walls) {
    const ak = positionKey(w.start as [number, number])
    const bk = positionKey(w.end as [number, number])
    if (ak === bk) continue
    degree.set(ak, (degree.get(ak) ?? 0) + 1)
    degree.set(bk, (degree.get(bk) ?? 0) + 1)
  }

  let dangling = 0
  for (const d of degree.values()) if (d === 1) dangling++

  return {
    walls: walls.length,
    uniqueVertices: degree.size,
    danglingVertices: dangling,
  }
}
