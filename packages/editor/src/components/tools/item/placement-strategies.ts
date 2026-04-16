import type {
  AnyNode,
  AnyNodeId,
  CeilingEvent,
  CeilingNode,
  GridEvent,
  ItemEvent,
  ItemNode,
  WallEvent,
  WallNode,
} from '@pascal-app/core'
import { getScaledDimensions, sceneRegistry, useScene } from '@pascal-app/core'
import { Vector3 } from 'three'
import {
  calculateCursorRotation,
  calculateItemRotation,
  getSideFromNormal,
  isValidWallSideFace,
  snapToGrid,
  snapToHalf,
  stripTransient,
} from './placement-math'
import type {
  CommitResult,
  LevelResolver,
  PlacementContext,
  PlacementResult,
  SpatialValidators,
  TransitionResult,
} from './placement-types'

const DEFAULT_DIMENSIONS: [number, number, number] = [1, 1, 1]

/** Snap item edge flush to wall face when within this distance (metres). */
const WALL_SNAP_DIST = 0.20
/** Snap item edge to neighbouring item edge when within this distance (metres). */
const ITEM_SNAP_DIST = 0.12

/**
 * Apply two layers of proximity snapping on top of the 5 cm grid snap.
 *
 * Layer 1 – Wall-face snap: if any item edge is within WALL_SNAP_DIST of a
 * wall face, push the edge perfectly flush with that face.
 *
 * Layer 2 – Item-edge snap: if our edge is within ITEM_SNAP_DIST of another
 * floor item's edge (along the same axis), align the two edges.
 *
 * @param x   item centre X, already 5 cm grid-snapped
 * @param z   item centre Z, already 5 cm grid-snapped
 * @param hx  item half-width  (X axis)
 * @param hz  item half-depth  (Z axis)
 * @param levelId    parent level ID – used to filter walls and items
 * @param excludeIds node IDs to ignore (the transient draft itself)
 */
function snapWithProximity(
  x: number,
  z: number,
  hx: number,
  hz: number,
  levelId: string,
  excludeIds: string[],
): [number, number] {
  const nodes = useScene.getState().nodes

  // ── Layer 1: Wall-face snap ────────────────────────────────────────────────
  let bestWallGap = WALL_SNAP_DIST
  let wallDeltaX = 0
  let wallDeltaZ = 0

  for (const node of Object.values(nodes)) {
    if (node.type !== 'wall') continue
    if (node.parentId !== levelId) continue

    const wall = node as WallNode
    const halfThick = (wall.thickness ?? 0.2) / 2

    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 0.01) continue

    const wdirX = dx / len   // unit vec along wall (XZ world)
    const wdirZ = dz / len
    const wnX = -wdirZ       // unit normal (left of direction)
    const wnZ = wdirX

    // Item centre relative to wall start
    const relX = x - wall.start[0]
    const relZ = z - wall.start[1]

    const perp  = relX * wnX   + relZ * wnZ    // signed ⊥ distance to centreline
    const along = relX * wdirX + relZ * wdirZ  // signed ∥ distance from start

    // Item's projected half-extents
    const itemHalfAlong = hx * Math.abs(wdirX) + hz * Math.abs(wdirZ)
    const itemHalfPerp  = hx * Math.abs(wnX)   + hz * Math.abs(wnZ)

    // No lateral overlap with this wall segment → skip
    if (along + itemHalfAlong < 0 || along - itemHalfAlong > len) continue

    // Front face (+halfThick) — item must lie on the positive normal side
    if (perp > halfThick) {
      const nearEdge = perp - itemHalfPerp          // item edge closest to face
      const gap = nearEdge - halfThick              // positive = outside wall
      if (gap >= 0 && gap < bestWallGap) {
        bestWallGap = gap
        const delta = halfThick + itemHalfPerp - perp
        wallDeltaX = wnX * delta
        wallDeltaZ = wnZ * delta
      }
    }

    // Back face (−halfThick) — item must lie on the negative normal side
    if (perp < -halfThick) {
      const nearEdge = perp + itemHalfPerp
      const gap = -halfThick - nearEdge
      if (gap >= 0 && gap < bestWallGap) {
        bestWallGap = gap
        const delta = -halfThick - itemHalfPerp - perp
        wallDeltaX = wnX * delta
        wallDeltaZ = wnZ * delta
      }
    }
  }

  // Apply wall snap correction
  x += wallDeltaX
  z += wallDeltaZ

  // ── Layer 2: Item-edge snap ────────────────────────────────────────────────
  let bestXGap = ITEM_SNAP_DIST
  let bestZGap = ITEM_SNAP_DIST
  let snapX = x
  let snapZ = z

  for (const node of Object.values(nodes)) {
    if (node.type !== 'item') continue
    if (excludeIds.includes(node.id)) continue

    const item = node as ItemNode
    if (item.asset.attachTo) continue       // wall/ceiling items — skip
    if (item.parentId !== levelId) continue

    const [ox, , oz] = item.position
    const [odimX, , odimZ] = getScaledDimensions(item)
    const ohx = odimX / 2
    const ohz = odimZ / 2

    // X-axis edge snap — only when Z footprints overlap
    const zOverlap = Math.min(z + hz, oz + ohz) - Math.max(z - hz, oz - ohz)
    if (zOverlap > 0) {
      // Our right edge → their left edge
      const rToL = Math.abs((x + hx) - (ox - ohx))
      if (rToL < bestXGap) { bestXGap = rToL; snapX = ox - ohx - hx }
      // Our left edge → their right edge
      const lToR = Math.abs((x - hx) - (ox + ohx))
      if (lToR < bestXGap) { bestXGap = lToR; snapX = ox + ohx + hx }
    }

    // Z-axis edge snap — only when X footprints overlap
    const xOverlap = Math.min(x + hx, ox + ohx) - Math.max(x - hx, ox - ohx)
    if (xOverlap > 0) {
      // Our front edge → their back edge
      const fToB = Math.abs((z + hz) - (oz - ohz))
      if (fToB < bestZGap) { bestZGap = fToB; snapZ = oz - ohz - hz }
      // Our back edge → their front edge
      const bToF = Math.abs((z - hz) - (oz + ohz))
      if (bToF < bestZGap) { bestZGap = bToF; snapZ = oz + ohz + hz }
    }
  }

  return [snapX, snapZ]
}

// ============================================================================
// FLOOR STRATEGY
// ============================================================================

export const floorStrategy = {
  /**
   * Handle grid:move — update position when on floor surface.
   * Returns null if currently on wall/ceiling.
   */
  move(ctx: PlacementContext, event: GridEvent): PlacementResult | null {
    if (ctx.state.surface !== 'floor') return null

    const dims = ctx.draftItem
      ? getScaledDimensions(ctx.draftItem)
      : (ctx.asset.dimensions ?? DEFAULT_DIMENSIONS)
    const [dimX, , dimZ] = dims

    // 1. Coarse 5 cm grid snap
    const gx = snapToGrid(event.position[0])
    const gz = snapToGrid(event.position[2])

    // 2. Proximity snap: flush to wall faces and neighbouring item edges
    const excludeIds = ctx.draftItem ? [ctx.draftItem.id] : []
    const [x, z] = ctx.levelId
      ? snapWithProximity(gx, gz, dimX / 2, dimZ / 2, ctx.levelId, excludeIds)
      : [gx, gz]

    return {
      gridPosition: [x, 0, z],
      cursorPosition: [x, event.position[1], z],
      cursorRotationY: 0,
      nodeUpdate: { position: [x, 0, z] },
      stopPropagation: false,
      dirtyNodeId: null,
    }
  },

  /**
   * Handle grid:click — commit placement on floor.
   * Returns null if on wall/ceiling or validation fails.
   */
  click(
    ctx: PlacementContext,
    _event: GridEvent,
    validators: SpatialValidators,
  ): CommitResult | null {
    if (ctx.state.surface !== 'floor') return null
    if (!(ctx.levelId && ctx.draftItem)) return null

    const pos: [number, number, number] = [ctx.gridPosition.x, 0, ctx.gridPosition.z]
    const valid = validators.canPlaceOnFloor(
      ctx.levelId,
      pos,
      getScaledDimensions(ctx.draftItem),
      [0, 0, 0],
      [ctx.draftItem.id],
    ).valid

    if (!valid) return null

    return {
      nodeUpdate: {
        position: pos,
        parentId: ctx.levelId,
        metadata: stripTransient(ctx.draftItem.metadata),
      },
      stopPropagation: false,
      dirtyNodeId: null,
    }
  },
}

// ============================================================================
// WALL STRATEGY
// ============================================================================

export const wallStrategy = {
  /**
   * Handle wall:enter — transition from floor to wall surface.
   * Returns null if item doesn't attach to walls, face is invalid, or wrong level.
   * Auto-adjusts Y position to fit within wall bounds.
   */
  enter(
    ctx: PlacementContext,
    event: WallEvent,
    resolveLevelId: LevelResolver,
    nodes: Record<string, AnyNode>,
    validators: SpatialValidators,
  ): TransitionResult | null {
    const attachTo = ctx.asset.attachTo
    if (attachTo !== 'wall' && attachTo !== 'wall-side') return null
    if (!isValidWallSideFace(event.normal)) return null

    // Level guard
    const wallLevelId = resolveLevelId(event.node, nodes)
    if (ctx.levelId !== wallLevelId) return null

    const side = getSideFromNormal(event.normal)
    const itemRotation = calculateItemRotation(event.normal)
    const cursorRotation = calculateCursorRotation(event.normal, event.node.start, event.node.end)

    const x = snapToHalf(event.localPosition[0])
    const y = snapToHalf(event.localPosition[1])
    const z = snapToHalf(event.localPosition[2])

    // Get auto-adjusted Y position from validator
    const validation = validators.canPlaceOnWall(
      ctx.levelId,
      event.node.id,
      x,
      y,
      ctx.draftItem
        ? getScaledDimensions(ctx.draftItem)
        : (ctx.asset.dimensions ?? DEFAULT_DIMENSIONS),
      attachTo,
      side,
      [],
    )

    const adjustedY = validation.adjustedY ?? y

    return {
      stateUpdate: { surface: 'wall', wallId: event.node.id },
      nodeUpdate: {
        position: [x, adjustedY, z],
        parentId: event.node.id,
        side,
        rotation: [0, itemRotation, 0],
      },
      cursorRotationY: cursorRotation,
      gridPosition: [x, adjustedY, z],
      cursorPosition: [
        snapToHalf(event.position[0]),
        snapToHalf(event.position[1]),
        snapToHalf(event.position[2]),
      ],
      stopPropagation: true,
    }
  },

  /**
   * Handle wall:move — update position while on wall.
   * Returns null if not on a wall or face is invalid.
   * Auto-adjusts Y position to fit within wall bounds.
   */
  move(
    ctx: PlacementContext,
    event: WallEvent,
    validators: SpatialValidators,
  ): PlacementResult | null {
    if (ctx.state.surface !== 'wall') return null
    if (!(ctx.draftItem && ctx.levelId)) return null
    if (!isValidWallSideFace(event.normal)) return null

    const side = getSideFromNormal(event.normal)
    const itemRotation = calculateItemRotation(event.normal)
    const cursorRotation = calculateCursorRotation(event.normal, event.node.start, event.node.end)

    const snappedX = snapToHalf(event.localPosition[0])
    const snappedY = snapToHalf(event.localPosition[1])
    const snappedZ = snapToHalf(event.localPosition[2])

    // Get auto-adjusted Y position from validator
    const validation = validators.canPlaceOnWall(
      ctx.levelId,
      event.node.id,
      snappedX,
      snappedY,
      getScaledDimensions(ctx.draftItem),
      ctx.draftItem.asset.attachTo as 'wall' | 'wall-side',
      side,
      [ctx.draftItem.id],
    )

    const adjustedY = validation.adjustedY ?? snappedY

    return {
      gridPosition: [snappedX, adjustedY, snappedZ],
      cursorPosition: [
        snapToHalf(event.position[0]),
        snapToHalf(event.position[1]),
        snapToHalf(event.position[2]),
      ],
      cursorRotationY: cursorRotation,
      nodeUpdate: {
        position: [snappedX, adjustedY, snappedZ],
        side,
        rotation: [0, itemRotation, 0],
      },
      stopPropagation: true,
      dirtyNodeId: event.node.id,
    }
  },

  /**
   * Handle wall:click — commit placement on wall.
   * Returns null if not on wall, face invalid, or validation fails.
   */
  click(
    ctx: PlacementContext,
    event: WallEvent,
    validators: SpatialValidators,
  ): CommitResult | null {
    if (ctx.state.surface !== 'wall') return null
    if (!isValidWallSideFace(event.normal)) return null
    if (!(ctx.levelId && ctx.draftItem)) return null

    const valid = validators.canPlaceOnWall(
      ctx.levelId,
      ctx.state.wallId as WallNode['id'],
      ctx.gridPosition.x,
      ctx.gridPosition.y,
      getScaledDimensions(ctx.draftItem),
      ctx.draftItem.asset.attachTo as 'wall' | 'wall-side',
      ctx.draftItem.side,
      [ctx.draftItem.id],
    ).valid

    if (!valid) return null

    return {
      nodeUpdate: {
        position: [ctx.gridPosition.x, ctx.gridPosition.y, ctx.gridPosition.z],
        parentId: event.node.id,
        side: ctx.draftItem.side,
        rotation: ctx.draftItem.rotation,
        metadata: stripTransient(ctx.draftItem.metadata),
      },
      stopPropagation: true,
      dirtyNodeId: event.node.id,
    }
  },

  /**
   * Handle wall:leave — transition back to floor surface.
   */
  leave(ctx: PlacementContext): TransitionResult | null {
    if (ctx.state.surface !== 'wall') return null

    return {
      stateUpdate: { surface: 'floor', wallId: null },
      nodeUpdate: {
        position: [ctx.gridPosition.x, ctx.gridPosition.y, ctx.gridPosition.z],
        parentId: ctx.levelId,
      },
      cursorRotationY: 0,
      gridPosition: [ctx.gridPosition.x, ctx.gridPosition.y, ctx.gridPosition.z],
      cursorPosition: [ctx.gridPosition.x, ctx.gridPosition.y, ctx.gridPosition.z],
      stopPropagation: true,
    }
  },
}

// ============================================================================
// CEILING STRATEGY
// ============================================================================

export const ceilingStrategy = {
  /**
   * Handle ceiling:enter — transition from floor to ceiling surface.
   * Returns null if item doesn't attach to ceilings or wrong level.
   */
  enter(
    ctx: PlacementContext,
    event: CeilingEvent,
    resolveLevelId: LevelResolver,
    nodes: Record<string, AnyNode>,
  ): TransitionResult | null {
    if (ctx.asset.attachTo !== 'ceiling') return null

    // Level guard
    const ceilingLevelId = resolveLevelId(event.node, nodes)
    if (ctx.levelId !== ceilingLevelId) return null

    const dims = ctx.draftItem
      ? getScaledDimensions(ctx.draftItem)
      : (ctx.asset.dimensions ?? DEFAULT_DIMENSIONS)
    const [dimX, , dimZ] = dims
    const itemHeight = dims[1]

    const x = snapToGrid(event.position[0], dimX)
    const z = snapToGrid(event.position[2], dimZ)

    return {
      stateUpdate: { surface: 'ceiling', ceilingId: event.node.id },
      nodeUpdate: {
        position: [x, -itemHeight, z],
        parentId: event.node.id,
      },
      cursorRotationY: 0,
      gridPosition: [x, -itemHeight, z],
      cursorPosition: [x, event.position[1] - itemHeight, z],
      stopPropagation: true,
    }
  },

  /**
   * Handle ceiling:move — update position while on ceiling.
   */
  move(ctx: PlacementContext, event: CeilingEvent): PlacementResult | null {
    if (ctx.state.surface !== 'ceiling') return null
    if (!ctx.draftItem) return null

    const dims = getScaledDimensions(ctx.draftItem)
    const [dimX, , dimZ] = dims
    const itemHeight = dims[1]

    const x = snapToGrid(event.position[0], dimX)
    const z = snapToGrid(event.position[2], dimZ)

    return {
      gridPosition: [x, -itemHeight, z],
      cursorPosition: [x, event.position[1] - itemHeight, z],
      cursorRotationY: 0,
      nodeUpdate: null,
      stopPropagation: true,
      dirtyNodeId: null,
    }
  },

  /**
   * Handle ceiling:click — commit placement on ceiling.
   */
  click(
    ctx: PlacementContext,
    event: CeilingEvent,
    validators: SpatialValidators,
  ): CommitResult | null {
    if (ctx.state.surface !== 'ceiling') return null
    if (!ctx.draftItem) return null

    const pos: [number, number, number] = [
      ctx.gridPosition.x,
      ctx.gridPosition.y,
      ctx.gridPosition.z,
    ]

    const valid = validators.canPlaceOnCeiling(
      ctx.state.ceilingId as CeilingNode['id'],
      pos,
      getScaledDimensions(ctx.draftItem),
      ctx.draftItem.rotation,
      [ctx.draftItem.id],
    ).valid

    if (!valid) return null

    return {
      nodeUpdate: {
        position: pos,
        parentId: event.node.id,
        metadata: stripTransient(ctx.draftItem.metadata),
      },
      stopPropagation: true,
      dirtyNodeId: null,
    }
  },

  /**
   * Handle ceiling:leave — transition back to floor surface.
   */
  leave(ctx: PlacementContext): TransitionResult | null {
    if (ctx.state.surface !== 'ceiling') return null

    return {
      stateUpdate: { surface: 'floor', ceilingId: null },
      nodeUpdate: {
        position: [ctx.gridPosition.x, ctx.gridPosition.y, ctx.gridPosition.z],
        parentId: ctx.levelId,
      },
      cursorRotationY: 0,
      gridPosition: [ctx.gridPosition.x, ctx.gridPosition.y, ctx.gridPosition.z],
      cursorPosition: [ctx.gridPosition.x, ctx.gridPosition.y, ctx.gridPosition.z],
      stopPropagation: true,
    }
  },
}

// ============================================================================
// ITEM SURFACE STRATEGY
// ============================================================================

export const itemSurfaceStrategy = {
  /**
   * Handle item:enter — transition from floor to an item surface.
   * Returns null if: item has no surface, our item doesn't fit, or it's the draft itself.
   */
  enter(ctx: PlacementContext, event: ItemEvent): TransitionResult | null {
    // Only floor items can be placed on surfaces
    if (ctx.asset.attachTo) return null

    const surfaceItem = event.node as ItemNode
    // Don't surface-place on the draft itself
    if (surfaceItem.id === ctx.draftItem?.id) return null
    // Surface item must declare a surface
    if (!surfaceItem.asset.surface) return null

    // Size check: our footprint must fit on surface item's footprint
    const ourDims = ctx.draftItem
      ? getScaledDimensions(ctx.draftItem)
      : (ctx.asset.dimensions ?? DEFAULT_DIMENSIONS)
    const surfDims = getScaledDimensions(surfaceItem)
    if (ourDims[0] > surfDims[0] || ourDims[2] > surfDims[2]) return null

    const surfaceMesh = sceneRegistry.nodes.get(surfaceItem.id)
    if (!surfaceMesh) return null

    const worldPos = new Vector3(event.position[0], event.position[1], event.position[2])
    const localPos = surfaceMesh.worldToLocal(worldPos)

    const x = snapToGrid(localPos.x, ourDims[0])
    const z = snapToGrid(localPos.z, ourDims[2])
    const y = surfaceItem.asset.surface.height * surfaceItem.scale[1]

    const worldSnapped = surfaceMesh.localToWorld(new Vector3(x, y, z))

    return {
      stateUpdate: { surface: 'item-surface', surfaceItemId: surfaceItem.id },
      nodeUpdate: { position: [x, y, z], parentId: surfaceItem.id },
      cursorRotationY: 0,
      gridPosition: [x, y, z],
      cursorPosition: [worldSnapped.x, worldSnapped.y, worldSnapped.z],
      stopPropagation: true,
    }
  },

  /**
   * Handle item:move — update position while on an item surface.
   */
  move(ctx: PlacementContext, event: ItemEvent): PlacementResult | null {
    if (ctx.state.surface !== 'item-surface') return null
    if (!(ctx.state.surfaceItemId && ctx.draftItem)) return null

    const nodes = useScene.getState().nodes
    const surfaceItem = nodes[ctx.state.surfaceItemId as AnyNodeId] as ItemNode | undefined
    if (!surfaceItem?.asset.surface) return null

    const surfaceMesh = sceneRegistry.nodes.get(ctx.state.surfaceItemId)
    if (!surfaceMesh) return null

    const ourDims = getScaledDimensions(ctx.draftItem)
    const worldPos = new Vector3(event.position[0], event.position[1], event.position[2])
    const localPos = surfaceMesh.worldToLocal(worldPos)

    const x = snapToGrid(localPos.x, ourDims[0])
    const z = snapToGrid(localPos.z, ourDims[2])
    const y = surfaceItem.asset.surface.height * surfaceItem.scale[1]

    const worldSnapped = surfaceMesh.localToWorld(new Vector3(x, y, z))

    return {
      gridPosition: [x, y, z],
      cursorPosition: [worldSnapped.x, worldSnapped.y, worldSnapped.z],
      cursorRotationY: 0,
      nodeUpdate: { position: [x, y, z] },
      stopPropagation: true,
      dirtyNodeId: null,
    }
  },

  /**
   * Handle item:click — commit placement on item surface.
   */
  click(ctx: PlacementContext, _event: ItemEvent): CommitResult | null {
    if (ctx.state.surface !== 'item-surface') return null
    if (!(ctx.draftItem && ctx.state.surfaceItemId)) return null

    return {
      nodeUpdate: {
        position: [ctx.gridPosition.x, ctx.gridPosition.y, ctx.gridPosition.z],
        parentId: ctx.state.surfaceItemId,
        metadata: stripTransient(ctx.draftItem.metadata),
      },
      stopPropagation: true,
      dirtyNodeId: null,
    }
  },
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Unified validation: check if the current draft item can be placed at its current position.
 * Switches on the active surface type and calls the appropriate spatial validator.
 */
export function checkCanPlace(ctx: PlacementContext, validators: SpatialValidators): boolean {
  if (!(ctx.levelId && ctx.draftItem)) return false

  // Item surface: valid if we entered (size check was in enter)
  if (ctx.state.surface === 'item-surface') {
    return ctx.state.surfaceItemId !== null
  }

  const attachTo = ctx.draftItem.asset.attachTo

  if (attachTo === 'ceiling') {
    if (ctx.state.surface !== 'ceiling' || !ctx.state.ceilingId) return false
    return validators.canPlaceOnCeiling(
      ctx.state.ceilingId as CeilingNode['id'],
      [ctx.gridPosition.x, ctx.gridPosition.y, ctx.gridPosition.z],
      getScaledDimensions(ctx.draftItem),
      ctx.draftItem.rotation,
      [ctx.draftItem.id],
    ).valid
  }

  if (attachTo === 'wall' || attachTo === 'wall-side') {
    if (ctx.state.surface !== 'wall' || !ctx.state.wallId) return false
    return validators.canPlaceOnWall(
      ctx.levelId,
      ctx.state.wallId as WallNode['id'],
      ctx.gridPosition.x,
      ctx.gridPosition.y,
      getScaledDimensions(ctx.draftItem),
      attachTo,
      ctx.draftItem.side,
      [ctx.draftItem.id],
    ).valid
  }

  // Floor (no attachTo)
  return validators.canPlaceOnFloor(
    ctx.levelId,
    [ctx.gridPosition.x, 0, ctx.gridPosition.z],
    getScaledDimensions(ctx.draftItem),
    [0, 0, 0],
    [ctx.draftItem.id],
  ).valid
}
