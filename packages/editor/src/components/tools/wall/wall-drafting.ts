import { useScene, type WallNode, WallNode as WallSchema } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import { DEFAULT_WALL_TYPE, WALL_TYPE_BY_ID, type WallType } from './wall-types'
export type WallPlanPoint = [number, number]

// 默认 0.5m，但实际使用 store 中的 wallGridStep
export const WALL_GRID_STEP = 0.5
export const WALL_JOIN_SNAP_RADIUS = 0.35
/** 最小有效墙长 5cm —— 门垛/窗垛通常 12-24cm，5cm 是安全下限同时防止误触 */
export const WALL_MIN_LENGTH = 0.05

/** 获取当前生效的网格步长 */
export function getEffectiveGridStep(): number {
  return (useEditor.getState() as any).wallGridStep ?? WALL_GRID_STEP
}

/**
 * 判断当前是否有可见的底图 — 有底图时自动关闭网格吸附
 * 让描摹精度跟随鼠标，不被网格强制对齐
 */
function hasVisibleGuide(): boolean {
  const nodes = useScene.getState().nodes
  const showGuides = useViewer.getState().showGuides
  if (!showGuides) return false
  return Object.values(nodes).some(
    (n) => n?.type === 'guide' && n.visible !== false && (n as any).opacity > 0,
  )
}

function distanceSquared(a: WallPlanPoint, b: WallPlanPoint): number {
  const dx = a[0] - b[0]
  const dz = a[1] - b[1]
  return dx * dx + dz * dz
}
function snapScalarToGrid(value: number, step = WALL_GRID_STEP): number {
  return Math.round(value / step) * step
}
export function snapPointToGrid(point: WallPlanPoint, step?: number): WallPlanPoint {
  const s = step ?? getEffectiveGridStep()
  return [snapScalarToGrid(point[0], s), snapScalarToGrid(point[1], s)]
}
export function snapPointTo45Degrees(start: WallPlanPoint, cursor: WallPlanPoint): WallPlanPoint {
  const dx = cursor[0] - start[0]
  const dz = cursor[1] - start[1]
  const angle = Math.atan2(dz, dx)
  const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  const distance = Math.sqrt(dx * dx + dz * dz)
  const endPoint: WallPlanPoint = [
    start[0] + Math.cos(snappedAngle) * distance,
    start[1] + Math.sin(snappedAngle) * distance,
  ]
  // 有底图时不做网格吸附，保持描摹精度
  return hasVisibleGuide() ? endPoint : snapPointToGrid(endPoint)
}
function projectPointOntoWall(point: WallPlanPoint, wall: WallNode): WallPlanPoint | null {
  const [x1, z1] = wall.start
  const [x2, z2] = wall.end
  const dx = x2 - x1
  const dz = z2 - z1
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared < 1e-9) {
    return null
  }
  const t = ((point[0] - x1) * dx + (point[1] - z1) * dz) / lengthSquared
  if (t <= 0 || t >= 1) {
    return null
  }
  return [x1 + dx * t, z1 + dz * t]
}
/** 墙体吸附命中类型 —— UI 层据此显示不同的反馈（颜色/形状/文案） */
export type WallSnapKind = 'endpoint' | 'projection'

export interface WallSnapHit {
  /** 吸附到的世界坐标点 */
  point: WallPlanPoint
  /** 吸附种类 —— 端点 vs 墙身投影 */
  kind: WallSnapKind
  /** 命中的那面墙 */
  wall: WallNode
}

/**
 * 在一组墙里寻找离 `point` 最近的吸附目标。
 *
 * 优先级规则（两轮遍历）：
 *   1. 端点（wall.start / wall.end）—— 最高优先级
 *   2. 墙身投影（projectPointOntoWall）—— 仅在无端点命中时
 *
 * 为什么端点要放第一轮：投影点到光标的距离数学上永远 ≤ 端点距离
 * （投影最小化到线段的距离）。若和端点放同一轮 PK，光标靠近墙端点时
 * 投影会以浮点级微弱优势抢赢，导致存储带浮点误差的坐标而非精确端点
 * —— 产生 ~1mm 错位。端点优先从根源上杜绝这个 bug。
 */
export function findWallSnapTarget(
  point: WallPlanPoint,
  walls: WallNode[],
  options?: { ignoreWallIds?: string[]; radius?: number },
): WallSnapHit | null {
  const ignoreWallIds = new Set(options?.ignoreWallIds ?? [])
  const radiusSquared = (options?.radius ?? WALL_JOIN_SNAP_RADIUS) ** 2

  // 第一轮：端点优先
  let bestEndpoint: WallSnapHit | null = null
  let bestEndpointDistSq = Number.POSITIVE_INFINITY
  for (const wall of walls) {
    if (ignoreWallIds.has(wall.id)) continue
    for (const ep of [wall.start as WallPlanPoint, wall.end as WallPlanPoint]) {
      const d = distanceSquared(point, ep)
      if (d <= radiusSquared && d < bestEndpointDistSq) {
        bestEndpoint = { point: ep, kind: 'endpoint', wall }
        bestEndpointDistSq = d
      }
    }
  }
  if (bestEndpoint) return bestEndpoint

  // 第二轮：无端点命中时才走投影（用于 T 型插入）
  let bestProjection: WallSnapHit | null = null
  let bestProjectionDistSq = Number.POSITIVE_INFINITY
  for (const wall of walls) {
    if (ignoreWallIds.has(wall.id)) continue
    const proj = projectPointOntoWall(point, wall)
    if (!proj) continue
    const d = distanceSquared(point, proj)
    if (d <= radiusSquared && d < bestProjectionDistSq) {
      bestProjection = { point: proj, kind: 'projection', wall }
      bestProjectionDistSq = d
    }
  }
  return bestProjection
}
/**
 * 根据屏幕像素密度计算自适应吸附半径。
 * 屏幕上始终保持约 14 像素的手感，同时给定最小/最大世界单位限制。
 */
export function getEffectiveSnapRadius(worldUnitsPerPixel: number): number {
  const SNAP_PIXELS = 14   // 屏幕目标像素（接近"指尖"大小）
  const MIN_WORLD = 0.01   // 最小 1cm — 极端放大时也不会消失
  const MAX_WORLD = 0.5    // 最大 50cm — 极端缩小时不会抢光标
  return Math.min(MAX_WORLD, Math.max(MIN_WORLD, SNAP_PIXELS * worldUnitsPerPixel))
}

export interface SnapWallDraftArgs {
  point: WallPlanPoint
  walls: WallNode[]
  start?: WallPlanPoint
  angleSnap?: boolean
  ignoreWallIds?: string[]
  noGridSnap?: boolean
  /**
   * 当前视图的世界单位/像素比。提供时使用自适应吸附半径（随缩放变化），
   * 不提供时退回默认常量 WALL_JOIN_SNAP_RADIUS。
   */
  worldUnitsPerPixel?: number
}

/** 非墙体吸附时的 fallback 类型 —— 用于 UI 区分"吸到墙" vs 其他 */
export type WallSnapFallback = 'grid' | 'angle' | 'free'

export interface WallSnapResult {
  /** 最终光标位置 */
  point: WallPlanPoint
  /**
   * 吸附结果类型：
   *   - endpoint: 吸到了某面墙的端点（最高优先级）
   *   - projection: 吸到了某面墙的身上（T 型插入点）
   *   - grid: 没吸到墙，落在网格上
   *   - angle: 没吸到墙，沿 45°/90° 方向
   *   - free: 没吸到墙，自由跟随鼠标（有底图时）
   */
  kind: WallSnapKind | WallSnapFallback
  /** 吸到墙时的命中信息，未命中为 null */
  hit: WallSnapHit | null
}

/**
 * 完整的墙体吸附流程 —— 带命中信息。
 * UI 层需要视觉反馈时用这个；只要坐标时用 `snapWallDraftPoint`。
 */
export function snapWallDraftPointDetailed(args: SnapWallDraftArgs): WallSnapResult {
  const { point, walls, start, angleSnap = false, ignoreWallIds, noGridSnap = false, worldUnitsPerPixel } = args

  // 有可见底图时自动跳过网格吸附，保持描摹精度
  const skipGrid = noGridSnap || hasVisibleGuide()

  let basePoint: WallPlanPoint
  let fallback: WallSnapFallback
  if (skipGrid) {
    // 无网格吸附：角度吸附仍然生效（保持直线），位置跟随鼠标
    if (start && angleSnap) {
      basePoint = snapPointTo45Degrees(start, point)
      fallback = 'angle'
    } else {
      basePoint = point
      fallback = 'free'
    }
  } else {
    if (start && angleSnap) {
      basePoint = snapPointTo45Degrees(start, point)
      fallback = 'angle'
    } else {
      basePoint = snapPointToGrid(point)
      fallback = 'grid'
    }
  }

  // 自适应半径：提供 worldUnitsPerPixel 时按像素密度计算，否则用默认常量
  const radius = worldUnitsPerPixel
    ? getEffectiveSnapRadius(worldUnitsPerPixel)
    : WALL_JOIN_SNAP_RADIUS

  const hit = findWallSnapTarget(basePoint, walls, { ignoreWallIds, radius })

  // 死区保护：从起点刚出发（cursor 仍在 start 附近 12px 内），
  // 如果 snapTarget 恰好就是 start 本身，则忽略此次吸附。
  // 解决"Z 字墙变 T 字墙"问题：短边起点与前段终点重合，鼠标会被吸回。
  if (hit && start && worldUnitsPerPixel) {
    const DEAD_ZONE_PX = 12
    const deadZoneWorld = DEAD_ZONE_PX * worldUnitsPerPixel
    const distToStartSq = distanceSquared(basePoint, start)
    if (distToStartSq < deadZoneWorld * deadZoneWorld) {
      if (distanceSquared(hit.point, start) < 1e-8) {
        return { point: basePoint, kind: fallback, hit: null }
      }
    }
  }

  if (hit) return { point: hit.point, kind: hit.kind, hit }
  return { point: basePoint, kind: fallback, hit: null }
}

/**
 * 只要坐标的便捷版 —— 保持旧接口不变，调用方无需迁移。
 */
export function snapWallDraftPoint(args: SnapWallDraftArgs): WallPlanPoint {
  return snapWallDraftPointDetailed(args).point
}
export function isWallLongEnough(start: WallPlanPoint, end: WallPlanPoint): boolean {
  return distanceSquared(start, end) >= WALL_MIN_LENGTH * WALL_MIN_LENGTH
}

/**
 * 自动参考线 —— 端点正交追踪
 *
 * 对每一个候选锚点（通常是已有墙的端点 + 当前 draftStart）：
 *   - 检查光标的 x 坐标是否接近锚点的 x（= 光标接近该锚点的垂直射线）
 *   - 检查光标的 z 坐标是否接近锚点的 z（= 光标接近该锚点的水平射线）
 *
 * 如果只命中水平：把光标 z 吸到锚点 z（保持 x）→ 光标落在锚点的水平线上
 * 如果只命中垂直：把光标 x 吸到锚点 x（保持 z）→ 光标落在锚点的垂直线上
 * 同时命中水平 + 垂直（两个不同锚点）：落在两条线的交点
 *
 * 返回 null 表示没有命中任何追踪。
 */
export interface OrthogonalTrackingHit {
  snappedPoint: WallPlanPoint
  /** 命中水平线（"横线"）的锚点 —— 光标 z 被对齐到这个锚点的 z */
  horizontalAnchor: WallPlanPoint | null
  /** 命中垂直线（"竖线"）的锚点 —— 光标 x 被对齐到这个锚点的 x */
  verticalAnchor: WallPlanPoint | null
}

export function computeOrthogonalTracking(args: {
  cursor: WallPlanPoint
  candidates: WallPlanPoint[]
  /** 世界单位的容差（调用方用像素 × worldUnitsPerPixel 计算） */
  tolerance: number
}): OrthogonalTrackingHit | null {
  const { cursor, candidates, tolerance } = args
  if (tolerance <= 0 || candidates.length === 0) return null

  let bestHorizontal: { anchor: WallPlanPoint; dist: number } | null = null
  let bestVertical: { anchor: WallPlanPoint; dist: number } | null = null

  for (const c of candidates) {
    const dxAbs = Math.abs(cursor[0] - c[0]) // 到垂直射线的距离
    const dzAbs = Math.abs(cursor[1] - c[1]) // 到水平射线的距离

    if (dzAbs < tolerance && (!bestHorizontal || dzAbs < bestHorizontal.dist)) {
      bestHorizontal = { anchor: c, dist: dzAbs }
    }
    if (dxAbs < tolerance && (!bestVertical || dxAbs < bestVertical.dist)) {
      bestVertical = { anchor: c, dist: dxAbs }
    }
  }

  if (!(bestHorizontal || bestVertical)) return null

  let snapX = cursor[0]
  let snapZ = cursor[1]
  if (bestVertical) snapX = bestVertical.anchor[0]
  if (bestHorizontal) snapZ = bestHorizontal.anchor[1]

  return {
    snappedPoint: [snapX, snapZ],
    horizontalAnchor: bestHorizontal?.anchor ?? null,
    verticalAnchor: bestVertical?.anchor ?? null,
  }
}

/**
 * 延长线追踪 —— 光标在某条已有墙的"无限延长线"上时，吸到那条线并显示延长虚线。
 *
 * 检查方式：对每条墙，计算光标到"墙所在无限直线"的垂直距离。
 * 命中 = 距离 < tolerance 且光标到墙线段任一端点的距离 > 墙长度（即光标真的在延长区，不是在墙本体附近）
 *
 * 返回命中的墙 + 光标在墙线上的投影点 + 参考端点（离光标更近的那个墙端点）。
 */
export interface ExtensionTrackingHit {
  wall: WallNode
  /** 光标投影到墙的无限直线上的点 */
  snappedPoint: WallPlanPoint
  /** 参考端点 —— 离光标更近的那个墙端点（延长线的"起点"） */
  referencePoint: WallPlanPoint
  /** 从参考端点到投影点的世界距离（有符号，正数表示延长方向） */
  signedDistance: number
}

export function computeExtensionTracking(args: {
  cursor: WallPlanPoint
  walls: WallNode[]
  /** 世界单位容差：光标到延长线的垂直距离 */
  tolerance: number
  /** 忽略的墙 id（比如用户正在画 chain 时不想追踪到刚画完的那面墙自己） */
  ignoreWallIds?: string[]
}): ExtensionTrackingHit | null {
  const { cursor, walls, tolerance, ignoreWallIds } = args
  if (tolerance <= 0 || walls.length === 0) return null
  const ignore = new Set(ignoreWallIds ?? [])

  let best: ExtensionTrackingHit | null = null
  let bestPerpDist = Number.POSITIVE_INFINITY

  for (const wall of walls) {
    if (ignore.has(wall.id)) continue
    const [x1, z1] = wall.start
    const [x2, z2] = wall.end
    const dx = x2 - x1
    const dz = z2 - z1
    const lenSq = dx * dx + dz * dz
    if (lenSq < 1e-9) continue
    const len = Math.sqrt(lenSq)
    // 参数 t：光标在墙线段的投影位置。t in [0,1] = 在线段内，<0 或 >1 = 在延长区。
    const t = ((cursor[0] - x1) * dx + (cursor[1] - z1) * dz) / lenSq
    // 垂直距离（光标到无限直线）
    const projX = x1 + dx * t
    const projZ = z1 + dz * t
    const perpDx = cursor[0] - projX
    const perpDz = cursor[1] - projZ
    const perpDist = Math.sqrt(perpDx * perpDx + perpDz * perpDz)
    if (perpDist > tolerance) continue
    // 必须在延长区（t < -epsilon 或 t > 1 + epsilon），否则就是"在墙本体附近"—— 那种情况
    // 应该走 findWallSnapTarget 的 projectPointOntoWall 路径，不是延长线
    const epsilon = 0.05 // 5cm 的宽容，避免刚好在端点处来回闪烁
    if (t > -epsilon && t < 1 + epsilon) continue
    // 只保留最近的命中（垂直距离最小）
    if (perpDist >= bestPerpDist) continue

    // 参考端点：离投影点更近的那个端点
    const refPoint: WallPlanPoint = t < 0 ? wall.start : wall.end
    // 有符号距离：从参考端点到投影点沿墙方向的距离
    const signedDistance =
      t < 0 ? -(t * len) : (t - 1) * len
    best = {
      wall,
      snappedPoint: [projX, projZ],
      referencePoint: refPoint,
      signedDistance,
    }
    bestPerpDist = perpDist
  }
  return best
}

/**
 * 从已有墙列表 + 可选的 draftStart 中收集追踪候选锚点。
 * 只返回一定距离内（distanceLimit）的候选，避免大户型下追踪线满屏闪烁。
 */
export function collectTrackingCandidates(args: {
  walls: WallNode[]
  draftStart?: WallPlanPoint
  cursor: WallPlanPoint
  distanceLimit: number
}): WallPlanPoint[] {
  const { walls, draftStart, cursor, distanceLimit } = args
  const limitSq = distanceLimit * distanceLimit
  const out: WallPlanPoint[] = []

  // draftStart 永远是候选（用户常常想跟自己的起点对齐）
  if (draftStart) out.push(draftStart)

  for (const wall of walls) {
    for (const p of [wall.start, wall.end] as WallPlanPoint[]) {
      const dx = p[0] - cursor[0]
      const dz = p[1] - cursor[1]
      if (dx * dx + dz * dz <= limitSq) {
        out.push(p)
      }
    }
  }
  return out
}
/**
 * 垂直追踪命中结果
 */
export interface WallPerpendicularHit {
  /** 命中的参考墙 */
  wall: WallNode
  /** 使用的锚点（墙的某一端点） */
  anchorPoint: WallPlanPoint
  /** 光标投影到垂直线上的点 */
  snappedPoint: WallPlanPoint
  /** 墙的单位方向向量（用于绘制直角标记） */
  wallUnitVector: [number, number]
}

/**
 * 垂直追踪 —— 光标在某条已有墙的端点的垂直方向上时，吸附到该垂直线。
 *
 * 检测逻辑：对每条墙的每个端点，计算光标相对于端点的偏移向量。
 * 将偏移向量分解为"沿墙分量"和"垂直分量"：
 *   - 沿墙分量的绝对值 < tolerance → 光标基本沿垂直方向移动
 *   - 垂直分量足够大（≥ 5mm）→ 不是贴着端点点击
 * 命中时，把光标吸到 anchorPoint + 垂直分量 × 垂直单位向量 处。
 *
 * 解决问题：底图上的斜墙拐角时，世界坐标正交追踪无法给出"垂直于该墙"的参考线，
 * 此函数补足这个场景。
 */
export function computeWallPerpendicularTracking(args: {
  cursor: WallPlanPoint
  walls: WallNode[]
  /** 世界单位的容差（调用方用像素 × worldUnitsPerPixel 计算） */
  tolerance: number
  /** 忽略的墙 id */
  ignoreWallIds?: string[]
}): WallPerpendicularHit | null {
  const { cursor, walls, tolerance, ignoreWallIds } = args
  if (tolerance <= 0 || walls.length === 0) return null
  const ignore = new Set(ignoreWallIds ?? [])

  let best: WallPerpendicularHit | null = null
  let bestAlongWall = Number.POSITIVE_INFINITY

  for (const wall of walls) {
    if (ignore.has(wall.id)) continue
    const [x1, z1] = wall.start
    const [x2, z2] = wall.end
    const dx = x2 - x1
    const dz = z2 - z1
    const lenSq = dx * dx + dz * dz
    if (lenSq < 1e-9) continue
    const len = Math.sqrt(lenSq)

    // 墙的单位方向向量
    const ux = dx / len
    const uz = dz / len
    // 墙的垂直单位向量（沿墙 90° CCW）
    const vx = -uz
    const vz = ux

    for (const endpoint of [wall.start, wall.end] as WallPlanPoint[]) {
      const deltaX = cursor[0] - endpoint[0]
      const deltaZ = cursor[1] - endpoint[1]

      // 光标偏离"垂直线"的距离 = 偏移量在墙方向上的分量
      const alongWall = Math.abs(deltaX * ux + deltaZ * uz)
      if (alongWall > tolerance) continue

      // 光标在垂直方向上的移动量（有符号）
      const alongPerp = deltaX * vx + deltaZ * vz

      // 太靠近端点本身时跳过（避免与端点吸附冲突）
      if (Math.abs(alongPerp) < 0.005) continue

      if (alongWall < bestAlongWall) {
        best = {
          wall,
          anchorPoint: endpoint,
          snappedPoint: [endpoint[0] + alongPerp * vx, endpoint[1] + alongPerp * vz],
          wallUnitVector: [ux, uz],
        }
        bestAlongWall = alongWall
      }
    }
  }

  return best
}

/**
 * F3 安全版 —— 墙壁自动打断支持函数
 *
 * 核心问题回顾：直墙在非轴对齐角度上被"任意点"打断后，1cm 量化可能让打断点
 * 偏离原直线，导致"一条直墙变两条微斜的墙"。
 *
 * 安全判据：打断点 P 必须满足两个条件
 *   1. 严格在墙段内部（离两端至少 10cm，避免误触发）
 *   2. 跨乘积 cross(b-a, P-a) = 0 —— P 精确在 a→b 的无限直线上
 *
 * 量化后的 P 满足条件 2 的情形：
 *   - 轴对齐墙（水平 / 垂直）：任意 1cm 网格点都满足（cross 恒为 0）
 *   - 斜墙：仅当 P 恰好是整条线上的 1cm 格点时满足
 *
 * 不满足时：静默跳过打断，维持原墙不被破坏。设计师的新墙端点 T 型落在
 * 墙身上时会被吸附指示器的琥珀色投影模式提示（A 项已落地）。
 */

interface WallSplitTarget {
  wall: WallNode
  /**
   * 精确投影点 —— point 投影到 wall 所在直线上的精确坐标（未量化）。
   * 用这个点打断而非原始量化端点，避免斜墙两段方向微偏。
   */
  splitPoint: WallPlanPoint
}

/**
 * 在墙列表里找一个可以安全地在 `point` 附近打断的墙，返回墙 + 精确投影点。
 *
 * 容差设计（解决斜墙量化漂移问题）：
 *   - 原来用 cross < 1e-6（绝对值），对斜墙太严：投影点量化后 cross 可达 ~0.02
 *   - 改用垂直距离 < 5mm：cross / wallLen < 5mm，与 splitTJunctions 保持一致
 *   - 打断点使用精确投影（wall.start + t * dir），不使用量化端点，保证两段不变形
 *
 * `newWallDir` 是新墙方向向量，用于共线防护：
 *   新墙与被打断墙方向平行时跳过（防止打断后产生与新墙重叠的结果段）。
 */
function findWallToSplitAt(
  walls: WallNode[],
  point: WallPlanPoint,
  excludeWallIds: Set<string>,
  newWallDir?: [number, number],
): WallSplitTarget | null {
  const PERP_TOL = 5e-3  // 5mm 垂直距离容差（容纳 1cm 量化产生的漂移）

  for (const wall of walls) {
    if (excludeWallIds.has(wall.id)) continue
    // 有子节点（门窗等 item）时不做自动打断 —— 需要重分配子节点到两段上，
    // 当前阶段不处理。F2 完整版会支持。
    if ((wall.children?.length ?? 0) > 0) continue

    const [a0, a1] = wall.start as [number, number]
    const [b0, b1] = wall.end as [number, number]
    const dx = b0 - a0
    const dz = b1 - a1
    const lenSq = dx * dx + dz * dz
    if (lenSq < 1e-9) continue
    const wallLen = Math.sqrt(lenSq)

    // 垂直距离判据：point 到 wall 所在直线的距离 < 5mm
    // cross = |dx*(py-a1) - dz*(px-a0)| = perpDist * wallLen
    const cross = dx * (point[1] - a1) - dz * (point[0] - a0)
    if (Math.abs(cross) > PERP_TOL * wallLen) continue

    // 新墙方向共线防护：新墙与本墙平行时跳过，防止打断后产生重叠段
    if (newWallDir) {
      const [ndx, ndz] = newWallDir
      const newLen = Math.sqrt(ndx * ndx + ndz * ndz)
      const cross2 = dx * ndz - dz * ndx
      if (Math.abs(cross2) < 1e-3 * wallLen * newLen) continue
    }

    // 参数 t：point 在 wall 上的投影位置
    const t = ((point[0] - a0) * dx + (point[1] - a1) * dz) / lenSq
    const minT = WALL_MIN_LENGTH / wallLen
    const maxT = 1 - minT
    if (t <= minT || t >= maxT) continue

    // 精确投影点（在墙的无限直线上，消除量化误差）
    const splitPoint: WallPlanPoint = [a0 + dx * t, a1 + dz * t]

    return { wall, splitPoint }
  }
  return null
}

/**
 * 把一面墙 `original` 在 `point` 处打断成两段，返回两段墙节点。
 * 调用方负责批量 create/delete。
 */
function buildSplitWalls(
  original: WallNode,
  point: WallPlanPoint,
): { a1: WallNode; a2: WallNode } | null {
  // 复用原墙的所有属性，只改 start/end
  const common = {
    thickness: original.thickness,
    height: original.height,
    material: original.material,
    frontSide: original.frontSide,
    backSide: original.backSide,
    metadata: original.metadata,
  }
  const a1 = WallSchema.parse({
    name: original.name ? `${original.name} (1)` : undefined,
    start: original.start,
    end: point,
    ...common,
  })
  const a2 = WallSchema.parse({
    name: original.name ? `${original.name} (2)` : undefined,
    start: point,
    end: original.end,
    ...common,
  })
  if (!isWallLongEnough(a1.start, a1.end) || !isWallLongEnough(a2.start, a2.end)) {
    return null
  }
  return { a1, a2 }
}

export function createWallOnCurrentLevel(
  start: WallPlanPoint,
  end: WallPlanPoint,
): WallNode | null {
  const currentLevelId = useViewer.getState().selection.levelId
  const { createNode, deleteNodes, nodes } = useScene.getState()
  if (!(currentLevelId && isWallLongEnough(start, end))) {
    return null
  }

  // 从 store 读当前墙种类 — 只派生 thickness，不做偏移（保持 Pascal 的中心线语义）
  // 偏移通过属性面板的"向左/右偏移"按钮手动调整，避免破坏 chain 画墙
  const wallTypeId = ((useEditor.getState() as any).wallType ?? DEFAULT_WALL_TYPE) as WallType
  const wallDef = WALL_TYPE_BY_ID[wallTypeId] ?? WALL_TYPE_BY_ID[DEFAULT_WALL_TYPE]
  const thickness = wallDef.thickness

  const wallCount = Object.values(nodes).filter((node) => node.type === 'wall').length
  const wall = WallSchema.parse({
    name: `${wallDef.label} ${wallCount + 1}`,
    start,
    end,
    thickness,
    metadata: { wallType: wallTypeId },
  })

  // 先收集当前层的墙（后续共线检查和 F3 打断都需要）
  const level = nodes[currentLevelId as keyof typeof nodes] as any
  const levelWalls = ((level?.children ?? []) as string[])
    .map((id: string) => nodes[id as keyof typeof nodes])
    .filter((n: any): n is WallNode => n?.type === 'wall')

  // ── 共线重叠防护 ─────────────────────────────────────────────────────────
  // 若新墙完全在某面已有墙的范围内（同向/反向皆检测），静默拒绝创建。
  // 这是最常见的"重复描摹"场景：用户在底图上把同一段墙画了两遍。
  // 部分重叠（一端在外）的情形由 F3 打断后 cleanupCollinearDuplicates 来处理。
  {
    const PARA_TOL = 1e-4
    const COL_TOL = 3e-3
    const dx = end[0] - start[0], dz = end[1] - start[1]
    const newLenSq = dx * dx + dz * dz
    const newLen = Math.sqrt(newLenSq)
    for (const existing of levelWalls) {
      const [ex0, ez0] = existing.start as [number, number]
      const [ex1, ez1] = existing.end as [number, number]
      const edx = ex1 - ex0, edz = ez1 - ez0
      const eLenSq = edx * edx + edz * edz
      if (eLenSq < 1e-9) continue
      const eLen = Math.sqrt(eLenSq)
      // 平行判定
      if (Math.abs(dx * edz - dz * edx) > PARA_TOL * newLen * eLen) continue
      // 共线判定
      if (Math.abs(edx * (start[1] - ez0) - edz * (start[0] - ex0)) > COL_TOL * eLen) continue
      // 投影到已有墙参数轴
      const tS = ((start[0] - ex0) * edx + (start[1] - ez0) * edz) / eLenSq
      const tE = ((end[0] - ex0) * edx + (end[1] - ez0) * edz) / eLenSq
      const tMin = Math.min(tS, tE), tMax = Math.max(tS, tE)
      // 有实质重叠（完全包含、部分重叠、反向穿越均拒绝）
      // 注：不能只检查"完全在内"——新墙从端点向另侧延伸时 tMin 会越界但仍有 100% 重叠
      const overlapStart = Math.max(tMin, 0)
      const overlapEnd = Math.min(tMax, 1)
      if (overlapEnd > overlapStart + 0.01 / eLen) return null
    }
  }

  // ── F3 自动打断 ──────────────────────────────────────────────────────────
  // 若新墙的 start / end 落在当前层某面已有墙的身上（T 型插入），
  // 在该位置把那面墙打断成两段 —— 前提是打断点共线（不会变斜墙）且墙上没有子节点。

  const excluded = new Set<string>([wall.id])
  const splitOps: Array<{ original: WallNode; point: WallPlanPoint }> = []

  // 新墙方向向量：传给 findWallToSplitAt 避免在共线墙上打断（会产生重叠段）
  const wallDir: [number, number] = [
    (wall.end as [number, number])[0] - (wall.start as [number, number])[0],
    (wall.end as [number, number])[1] - (wall.start as [number, number])[1],
  ]

  const startHit = findWallToSplitAt(levelWalls, wall.start as WallPlanPoint, excluded, wallDir)
  if (startHit) {
    splitOps.push({ original: startHit.wall, point: startHit.splitPoint })
    excluded.add(startHit.wall.id)
  }
  const endHit = findWallToSplitAt(levelWalls, wall.end as WallPlanPoint, excluded, wallDir)
  if (endHit && endHit.wall.id !== startHit?.wall.id) {
    splitOps.push({ original: endHit.wall, point: endHit.splitPoint })
    excluded.add(endHit.wall.id)
  }

  // 先执行打断：删除原墙 + 创建两段新墙
  const toDelete: string[] = []
  for (const op of splitOps) {
    const parts = buildSplitWalls(op.original, op.point)
    if (!parts) continue
    toDelete.push(op.original.id)
    createNode(parts.a1, currentLevelId)
    createNode(parts.a2, currentLevelId)
  }
  if (toDelete.length > 0) {
    deleteNodes(toDelete as any)
  }

  // 再创建新墙本身
  createNode(wall, currentLevelId)
  sfxEmitter.emit('sfx:structure-build')
  return wall
}
