import { isObject } from '@pascal-app/core'

/** 地板家具吸附网格：5 cm */
export const FLOOR_SNAP_GRID = 0.05

/**
 * Snaps a position to the 5 cm grid.
 * The `dimension` parameter is kept for API compatibility but no longer used —
 * with proximity wall/item snapping handling edge alignment, pure 5 cm center
 * snap is sufficient and more predictable.
 */
export function snapToGrid(position: number, _dimension?: number): number {
  return Math.round(position / FLOOR_SNAP_GRID) * FLOOR_SNAP_GRID
}

/**
 * Snap a value to the 5 cm grid (used for wall/ceiling item local positions).
 */
export function snapToHalf(value: number): number {
  return Math.round(value / FLOOR_SNAP_GRID) * FLOOR_SNAP_GRID
}

/**
 * Calculate cursor rotation in WORLD space from wall normal and orientation.
 */
export function calculateCursorRotation(
  normal: [number, number, number] | undefined,
  wallStart: [number, number],
  wallEnd: [number, number],
): number {
  if (!normal) return 0

  // Wall direction angle in world XZ plane
  const wallAngle = Math.atan2(wallEnd[1] - wallStart[1], wallEnd[0] - wallStart[0])

  // In local wall space, front face has normal.z < 0, back face has normal.z > 0
  if (normal[2] < 0) {
    return -wallAngle
  }
  return Math.PI - wallAngle
}

/**
 * Calculate item rotation in WALL-LOCAL space from normal.
 * Items are children of the wall mesh, so their rotation is relative to wall's local space.
 */
export function calculateItemRotation(normal: [number, number, number] | undefined): number {
  if (!normal) return 0

  return normal[2] > 0 ? 0 : Math.PI
}

/**
 * Determine which side of the wall based on the normal vector.
 * In wall-local space, the wall runs along X-axis, so the normal points along Z-axis.
 * Positive Z normal = 'front', Negative Z normal = 'back'
 */
export function getSideFromNormal(normal: [number, number, number] | undefined): 'front' | 'back' {
  if (!normal) return 'front'
  return normal[2] >= 0 ? 'front' : 'back'
}

/**
 * Check if the normal indicates a valid wall side face (front or back).
 * Filters out top face and thickness edges.
 *
 * In wall-local geometry space (after ExtrudeGeometry + rotateX):
 * - X axis: along wall direction
 * - Y axis: up (height)
 * - Z axis: perpendicular to wall (thickness direction)
 *
 * So valid side faces have normals pointing in ±Z direction (local space).
 */
export function isValidWallSideFace(normal: [number, number, number] | undefined): boolean {
  if (!normal) return false
  return Math.abs(normal[2]) > 0.7
}

/**
 * Strip the `isTransient` flag from node metadata before committing.
 */
export function stripTransient(meta: any): any {
  if (!isObject(meta)) return meta
  const { isTransient, ...rest } = meta as Record<string, any>
  return rest
}
