import type { WallNode } from '../../schema'

// ============================================================================
// TYPES
// ============================================================================

export interface Point2D {
  x: number
  y: number
}

interface LineEquation {
  a: number
  b: number
  c: number // ax + by + c = 0
}

// Map of wallId -> { left?: Point2D, right?: Point2D } for each junction
type WallIntersections = Map<string, { left?: Point2D; right?: Point2D }>

// Map of junctionKey -> WallIntersections
type JunctionData = Map<string, WallIntersections>

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const TOLERANCE = 0.001

function pointToKey(p: Point2D, tolerance = TOLERANCE): string {
  const snap = 1 / tolerance
  return `${Math.round(p.x * snap)},${Math.round(p.y * snap)}`
}

function createLineFromPointAndVector(p: Point2D, v: Point2D): LineEquation {
  const a = -v.y
  const b = v.x
  const c = -(a * p.x + b * p.y)
  return { a, b, c }
}

/**
 * Checks if a point lies on a wall segment (not at its endpoints)
 */
function pointOnWallSegment(point: Point2D, wall: WallNode, tolerance = TOLERANCE): boolean {
  const start: Point2D = { x: wall.start[0], y: wall.start[1] }
  const end: Point2D = { x: wall.end[0], y: wall.end[1] }

  // Check if point is at endpoints (those are handled separately)
  if (pointToKey(point, tolerance) === pointToKey(start, tolerance)) return false
  if (pointToKey(point, tolerance) === pointToKey(end, tolerance)) return false

  // Vector from start to end
  const v = { x: end.x - start.x, y: end.y - start.y }
  const L = Math.sqrt(v.x * v.x + v.y * v.y)
  if (L < 1e-9) return false

  // Vector from start to point
  const w = { x: point.x - start.x, y: point.y - start.y }

  // Project point onto wall line (t is parametric position along segment)
  const t = (v.x * w.x + v.y * w.y) / (L * L)

  // Check if projection is within segment (not at endpoints)
  if (t < tolerance || t > 1 - tolerance) return false

  // Check distance from point to line
  const projX = start.x + t * v.x
  const projY = start.y + t * v.y
  const dist = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)

  return dist < tolerance
}

// ============================================================================
// JUNCTION DETECTION (exactly like demo)
// ============================================================================

interface Junction {
  meetingPoint: Point2D
  connectedWalls: Array<{ wall: WallNode; endType: 'start' | 'end' | 'passthrough' }>
}

function findJunctions(walls: WallNode[]): Map<string, Junction> {
  const junctions = new Map<string, Junction>()

  // First pass: group walls by their endpoints
  for (const wall of walls) {
    const startPt: Point2D = { x: wall.start[0], y: wall.start[1] }
    const endPt: Point2D = { x: wall.end[0], y: wall.end[1] }

    const keyStart = pointToKey(startPt)
    const keyEnd = pointToKey(endPt)

    if (!junctions.has(keyStart)) {
      junctions.set(keyStart, { meetingPoint: startPt, connectedWalls: [] })
    }
    junctions.get(keyStart)?.connectedWalls.push({ wall, endType: 'start' })

    if (!junctions.has(keyEnd)) {
      junctions.set(keyEnd, { meetingPoint: endPt, connectedWalls: [] })
    }
    junctions.get(keyEnd)?.connectedWalls.push({ wall, endType: 'end' })
  }

  // Second pass: detect T-junctions (walls passing through junction points)
  for (const [_key, junction] of junctions.entries()) {
    for (const wall of walls) {
      // Skip if wall already in this junction
      if (junction.connectedWalls.some((cw) => cw.wall.id === wall.id)) continue

      // Check if junction point lies on this wall's segment (not at endpoints)
      if (pointOnWallSegment(junction.meetingPoint, wall)) {
        junction.connectedWalls.push({ wall, endType: 'passthrough' })
      }
    }
  }

  // Filter to only junctions with 2+ walls
  const actualJunctions = new Map<string, Junction>()
  for (const [key, junction] of junctions.entries()) {
    if (junction.connectedWalls.length >= 2) {
      actualJunctions.set(key, junction)
    }
  }

  return actualJunctions
}

// ============================================================================
// MITER CALCULATION (exactly like demo)
// ============================================================================

interface ProcessedWall {
  wallId: string
  angle: number
  edgeA: LineEquation // Left edge
  edgeB: LineEquation // Right edge
  pA: Point2D // Left offset point at junction (on edgeA)
  pB: Point2D // Right offset point at junction (on edgeB)
  isPassthrough: boolean // True if wall passes through junction (T-junction)
}

function calculateJunctionIntersections(
  junction: Junction,
  getThickness: (wall: WallNode) => number,
): { wallIntersections: WallIntersections; junctionCap: Point2D[] } {
  const { meetingPoint, connectedWalls } = junction
  const processedWalls: ProcessedWall[] = []

  for (const { wall, endType } of connectedWalls) {
    const halfT = getThickness(wall) / 2

    if (endType === 'passthrough') {
      // For passthrough walls (T-junctions), add both directions
      // This allows walls meeting the middle of this wall to miter against it
      const v1 = { x: wall.end[0] - wall.start[0], y: wall.end[1] - wall.start[1] }
      const v2 = { x: -v1.x, y: -v1.y }

      for (const v of [v1, v2]) {
        const L = Math.sqrt(v.x * v.x + v.y * v.y)
        if (L < 1e-9) continue

        const nUnit = { x: -v.y / L, y: v.x / L }
        const pA = { x: meetingPoint.x + nUnit.x * halfT, y: meetingPoint.y + nUnit.y * halfT }
        const pB = { x: meetingPoint.x - nUnit.x * halfT, y: meetingPoint.y - nUnit.y * halfT }

        const edgeA = createLineFromPointAndVector(pA, v)
        const edgeB = createLineFromPointAndVector(pB, v)
        const angle = Math.atan2(v.y, v.x)

        processedWalls.push({ wallId: wall.id, angle, edgeA, edgeB, pA, pB, isPassthrough: true })
      }
    } else {
      // Normal wall endpoint (start or end)
      const v =
        endType === 'start'
          ? { x: wall.end[0] - wall.start[0], y: wall.end[1] - wall.start[1] }
          : { x: wall.start[0] - wall.end[0], y: wall.start[1] - wall.end[1] }

      const L = Math.sqrt(v.x * v.x + v.y * v.y)
      if (L < 1e-9) continue

      const nUnit = { x: -v.y / L, y: v.x / L }
      const pA = { x: meetingPoint.x + nUnit.x * halfT, y: meetingPoint.y + nUnit.y * halfT }
      const pB = { x: meetingPoint.x - nUnit.x * halfT, y: meetingPoint.y - nUnit.y * halfT }

      const edgeA = createLineFromPointAndVector(pA, v)
      const edgeB = createLineFromPointAndVector(pB, v)
      const angle = Math.atan2(v.y, v.x)

      processedWalls.push({ wallId: wall.id, angle, edgeA, edgeB, pA, pB, isPassthrough: false })
    }
  }

  // Sort by outgoing angle
  processedWalls.sort((a, b) => a.angle - b.angle)

  const wallIntersections = new Map<string, { left?: Point2D; right?: Point2D }>()
  const n = processedWalls.length

  if (n < 2) return { wallIntersections, junctionCap: [] }

  // Calculate intersections between adjacent walls (exactly like demo)
  for (let i = 0; i < n; i++) {
    const wall1 = processedWalls[i]!
    const wall2 = processedWalls[(i + 1) % n]!

    // Intersect left edge of wall1 with right edge of wall2
    const det = wall1.edgeA.a * wall2.edgeB.b - wall2.edgeB.a * wall1.edgeA.b

    // det = v1 × v2（叉积）为零时（平行/反向平行），直接 skip。
    // 缝隙由 junctionCap 凸包覆盖，不修改墙体角点（避免渐变边）。
    if (Math.abs(det) < 1e-9) {
      continue
    }

    const p = {
      x: (wall1.edgeA.b * wall2.edgeB.c - wall2.edgeB.b * wall1.edgeA.c) / det,
      y: (wall2.edgeB.a * wall1.edgeA.c - wall1.edgeA.a * wall2.edgeB.c) / det,
    }

    // Miter limit（参考 SVG stroke-linejoin:miter / Sweet Home 3D 的距离上限）：
    // 当两段墙近似共线（夹角接近 180°）但 det 不恰好为零时，
    // 交点会被算到极远处，导致墙体角点被"拉飞"出屏幕。
    // 以两墙最大半厚度的 10 倍为上限，超过则视为平行跳过。
    // 10x 允许约 12° 以上的合法夹角（覆盖所有实用平面图场景）。
    const halfT1 = Math.hypot(wall1.pA.x - meetingPoint.x, wall1.pA.y - meetingPoint.y)
    const halfT2 = Math.hypot(wall2.pA.x - meetingPoint.x, wall2.pA.y - meetingPoint.y)
    const MITER_LIMIT = 10
    const maxDist = Math.max(halfT1, halfT2) * MITER_LIMIT
    if ((p.x - meetingPoint.x) ** 2 + (p.y - meetingPoint.y) ** 2 > maxDist * maxDist) {
      continue
    }

    // Only assign intersection to non-passthrough walls
    // Passthrough walls don't receive junction data (their geometry doesn't change)
    if (!wall1.isPassthrough) {
      if (!wallIntersections.has(wall1.wallId)) {
        wallIntersections.set(wall1.wallId, {})
      }
      wallIntersections.get(wall1.wallId)!.left = p
    }

    if (!wall2.isPassthrough) {
      if (!wallIntersections.has(wall2.wallId)) {
        wallIntersections.set(wall2.wallId, {})
      }
      wallIntersections.get(wall2.wallId)!.right = p
    }
  }

  // Junction cap：收集所有非 passthrough 墙在此节点处的两个偏移点（pA/pB），
  // 计算凸包，形成一个覆盖节点区域的填充多边形。
  // 当不同厚度的墙在同轴（反向平行）相接时，此凸包会填补较厚墙超出较薄墙的缝隙。
  const capPoints: Point2D[] = []
  for (const pw of processedWalls) {
    if (!pw.isPassthrough) {
      capPoints.push(pw.pA, pw.pB)
    }
  }
  const junctionCap = computeConvexHull(capPoints)

  return { wallIntersections, junctionCap }
}

// ============================================================================
// CONVEX HULL (Andrew's monotone chain)
// ============================================================================

function cross(O: Point2D, A: Point2D, B: Point2D): number {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x)
}

function computeConvexHull(points: Point2D[]): Point2D[] {
  const n = points.length
  if (n < 3) return points.slice()

  // Sort by x, then y
  const sorted = points.slice().sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y)

  const lower: Point2D[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: Point2D[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  // Remove last point of each half (it's the same as the first of the other)
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export interface WallMiterData {
  // Junction data keyed by junction position key
  junctionData: JunctionData
  // All junctions for quick lookup
  junctions: Map<string, Junction>
  // Junction cap polygons (convex hulls) to fill gaps between walls of different thickness
  // Key = junction position key, Value = convex hull of all pA/pB points at junction
  junctionCaps: Map<string, Point2D[]>
}

/**
 * Calculates miter data for all walls on a level
 */
export function calculateLevelMiters(walls: WallNode[]): WallMiterData {
  const getThickness = (wall: WallNode) => wall.thickness ?? 0.1
  const junctions = findJunctions(walls)
  const junctionData: JunctionData = new Map()
  const junctionCaps: Map<string, Point2D[]> = new Map()

  for (const [key, junction] of junctions.entries()) {
    const { wallIntersections, junctionCap } = calculateJunctionIntersections(junction, getThickness)
    junctionData.set(key, wallIntersections)
    if (junctionCap.length >= 3) {
      junctionCaps.set(key, junctionCap)
    }
  }

  return { junctionData, junctions, junctionCaps }
}

/**
 * Gets wall IDs that share junctions with the given walls
 */
export function getAdjacentWallIds(allWalls: WallNode[], dirtyWallIds: Set<string>): Set<string> {
  const adjacent = new Set<string>()

  for (const dirtyId of dirtyWallIds) {
    const dirtyWall = allWalls.find((w) => w.id === dirtyId)
    if (!dirtyWall) continue

    const dirtyStart: Point2D = { x: dirtyWall.start[0], y: dirtyWall.start[1] }
    const dirtyEnd: Point2D = { x: dirtyWall.end[0], y: dirtyWall.end[1] }

    for (const wall of allWalls) {
      if (wall.id === dirtyId) continue

      const wallStart: Point2D = { x: wall.start[0], y: wall.start[1] }
      const wallEnd: Point2D = { x: wall.end[0], y: wall.end[1] }

      // Check corner connections (endpoints meeting)
      const startKey = pointToKey(wallStart)
      const endKey = pointToKey(wallEnd)
      const dirtyStartKey = pointToKey(dirtyStart)
      const dirtyEndKey = pointToKey(dirtyEnd)

      if (
        startKey === dirtyStartKey ||
        startKey === dirtyEndKey ||
        endKey === dirtyStartKey ||
        endKey === dirtyEndKey
      ) {
        adjacent.add(wall.id)
        continue
      }

      // Check T-junction connections (dirty wall endpoint on other wall's segment)
      if (pointOnWallSegment(dirtyStart, wall) || pointOnWallSegment(dirtyEnd, wall)) {
        adjacent.add(wall.id)
        continue
      }

      // Check reverse T-junction (other wall endpoint on dirty wall's segment)
      if (pointOnWallSegment(wallStart, dirtyWall) || pointOnWallSegment(wallEnd, dirtyWall)) {
        adjacent.add(wall.id)
      }
    }
  }

  return adjacent
}

// Re-export for backwards compatibility
export { pointToKey }
