import {
  type AnyNodeId,
  DoorNode,
  emitter,
  sceneRegistry,
  spatialGridManager,
  useScene,
  type WallEvent,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useRef } from 'react'
import { BoxGeometry, EdgesGeometry, type Group, type LineSegments } from 'three'
import { LineBasicNodeMaterial } from 'three/webgpu'
import { EDITOR_LAYER } from '../../../lib/constants'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import {
  calculateCursorRotation,
  calculateItemRotation,
  getSideFromNormal,
  isValidWallSideFace,
} from '../item/placement-math'
import { clampToWall, hasWallChildOverlap, wallLocalToWorld } from './door-math'
import { getDoorPreset } from './door-presets'

// ─── Snap constants ──────────────────────────────────────────────────────────
const SNAP_GRID = 0.05    // 5 cm fine grid
const SNAP_ENDPOINT = 0.12 // 12 cm — snap to wall start/end
const MIN_DOOR_WIDTH = 0.5 // reject commits narrower than this

// ─── Unit-box cursor (1×1×0.07) — scaled at runtime via group.scale ──────────
const _tmpBox = new BoxGeometry(1, 1, 0.07)
const CURSOR_EDGES = new EdgesGeometry(_tmpBox)
_tmpBox.dispose()

const edgeMaterial = new LineBasicNodeMaterial({
  color: 0xef_44_44,
  linewidth: 3,
  depthTest: false,
  depthWrite: false,
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Snap X to 5 cm grid, with endpoint gravity at wall start/end. */
function snapWallX(rawX: number, wallLen: number): number {
  if (rawX < SNAP_ENDPOINT) return 0
  if (rawX > wallLen - SNAP_ENDPOINT) return wallLen
  return Math.round(rawX / SNAP_GRID) * SNAP_GRID
}

function getWallLength(node: { start: [number, number]; end: [number, number] }): number {
  const dx = node.end[0] - node.start[0]
  const dz = node.end[1] - node.start[1]
  return Math.sqrt(dx * dx + dz * dz)
}

/** Resolve drawn size from anchor → cursor position. */
function resolveDrawn(
  anchorX: number,
  curX: number,
): { width: number; centerX: number; tooNarrow: boolean } {
  const left = Math.min(anchorX, curX)
  const right = Math.max(anchorX, curX)
  const width = right - left
  if (width < MIN_DOOR_WIDTH) {
    return { width: MIN_DOOR_WIDTH, centerX: anchorX, tooNarrow: true }
  }
  return { width, centerX: (left + right) / 2, tooNarrow: false }
}

/**
 * Door tool — draw-to-size placement (like wall drawing).
 *
 * Interaction:
 *   • Hover wall  → preview door at preset size (green/red cursor)
 *   • Click 1     → anchor start edge, enter drawing phase
 *   • Move        → stretch door width from anchor to cursor
 *   • Click 2     → commit (reject if too narrow or overlapping)
 *   • Leave wall  → cancel back to idle
 *   • ESC         → cancel
 */
export const DoorTool: React.FC = () => {
  const draftRef = useRef<DoorNode | null>(null)
  const cursorGroupRef = useRef<Group>(null!)
  const edgesRef = useRef<LineSegments>(null!)

  // Drawing state — all mutable refs, zero React re-renders
  const phase = useRef<'idle' | 'drawing'>('idle')
  const anchorX = useRef(0)
  const cachedItemRotation = useRef(0)
  const cachedCursorRotation = useRef(0)
  const cachedSide = useRef<'front' | 'back'>('front')

  useEffect(() => {
    useScene.temporal.getState().pause()

    const getLevelId = () => useViewer.getState().selection.levelId
    const getLevelYOffset = () => {
      const id = getLevelId()
      return id ? (sceneRegistry.nodes.get(id as AnyNodeId)?.position.y ?? 0) : 0
    }
    const getSlabElevation = (e: WallEvent) =>
      spatialGridManager.getSlabElevationForWall(
        e.node.parentId ?? '',
        e.node.start,
        e.node.end,
      )

    const markWallDirty = (wallId: string) => {
      useScene.getState().dirtyNodes.add(wallId as AnyNodeId)
    }

    const destroyDraft = () => {
      if (!draftRef.current) return
      const wallId = draftRef.current.parentId
      useScene.getState().deleteNode(draftRef.current.id)
      draftRef.current = null
      if (wallId) markWallDirty(wallId)
    }

    const hideCursor = () => {
      if (cursorGroupRef.current) cursorGroupRef.current.visible = false
    }

    /** Position + scale the wireframe cursor. */
    const showCursor = (
      worldPos: [number, number, number],
      rotY: number,
      w: number,
      h: number,
      valid: boolean,
    ) => {
      const g = cursorGroupRef.current
      if (!g) return
      g.visible = true
      g.position.set(...worldPos)
      g.rotation.y = rotY
      g.scale.set(w, h, 1)
      edgeMaterial.color.setHex(valid ? 0x22_c5_5e : 0xef_44_44)
    }

    /** Create or update the transient draft node. */
    const upsertDraft = (
      event: WallEvent,
      centerX: number,
      centerY: number,
      width: number,
      height: number,
    ) => {
      const preset = getDoorPreset(useEditor.getState().doorPresetId)
      const iRot = cachedItemRotation.current
      const side = cachedSide.current

      if (draftRef.current) {
        useScene.getState().updateNode(draftRef.current.id, {
          position: [centerX, centerY, 0],
          rotation: [0, iRot, 0],
          side,
          parentId: event.node.id,
          wallId: event.node.id,
          width,
          height,
        })
      } else {
        const node = DoorNode.parse({
          position: [centerX, centerY, 0],
          rotation: [0, iRot, 0],
          side,
          wallId: event.node.id,
          parentId: event.node.id,
          width,
          height,
          hingesSide: preset.hingesSide,
          swingDirection: preset.swingDirection,
          metadata: { isTransient: true },
        })
        useScene.getState().createNode(node, event.node.id as AnyNodeId)
        draftRef.current = node
      }
    }

    // ── Event handlers ──────────────────────────────────────────────────────

    const onWallEnter = (event: WallEvent) => {
      if (!isValidWallSideFace(event.normal)) return
      const levelId = getLevelId()
      if (!levelId) return
      if (event.node.parentId !== levelId) return
      if (phase.current === 'drawing') return // ignore re-enters mid-draw

      destroyDraft()

      // Cache wall face orientation
      cachedItemRotation.current = calculateItemRotation(event.normal)
      cachedCursorRotation.current = calculateCursorRotation(
        event.normal,
        event.node.start,
        event.node.end,
      )
      cachedSide.current = getSideFromNormal(event.normal)

      const preset = getDoorPreset(useEditor.getState().doorPresetId)
      const wLen = getWallLength(event.node)
      const snappedX = snapWallX(event.localPosition[0], wLen)
      const { clampedX, clampedY } = clampToWall(event.node, snappedX, preset.width, preset.height)

      upsertDraft(event, clampedX, clampedY, preset.width, preset.height)

      const valid = !hasWallChildOverlap(
        event.node.id,
        clampedX,
        clampedY,
        preset.width,
        preset.height,
        draftRef.current?.id,
      )

      showCursor(
        wallLocalToWorld(event.node, clampedX, clampedY, getLevelYOffset(), getSlabElevation(event)),
        cachedCursorRotation.current,
        preset.width,
        preset.height,
        valid,
      )
      event.stopPropagation()
    }

    const onWallMove = (event: WallEvent) => {
      if (!isValidWallSideFace(event.normal)) return
      if (event.node.parentId !== getLevelId()) return

      const preset = getDoorPreset(useEditor.getState().doorPresetId)
      const wLen = getWallLength(event.node)
      const snappedX = snapWallX(event.localPosition[0], wLen)

      // In idle phase: keep orientation updated to the hovered face
      if (phase.current !== 'drawing') {
        cachedItemRotation.current = calculateItemRotation(event.normal)
        cachedCursorRotation.current = calculateCursorRotation(
          event.normal,
          event.node.start,
          event.node.end,
        )
        cachedSide.current = getSideFromNormal(event.normal)
      }

      let width: number
      let centerX: number
      const height = preset.height

      if (phase.current === 'drawing') {
        const { width: w, centerX: cx } = resolveDrawn(anchorX.current, snappedX)
        width = w
        const { clampedX } = clampToWall(event.node, cx, width, height)
        centerX = clampedX
      } else {
        width = preset.width
        const { clampedX } = clampToWall(event.node, snappedX, width, height)
        centerX = clampedX
      }

      const clampedY = height / 2 // doors always sit at floor level

      upsertDraft(event, centerX, clampedY, width, height)

      const tooNarrow =
        phase.current === 'drawing' && resolveDrawn(anchorX.current, snappedX).tooNarrow
      const hasOverlap = hasWallChildOverlap(
        event.node.id,
        centerX,
        clampedY,
        width,
        height,
        draftRef.current?.id,
      )

      showCursor(
        wallLocalToWorld(event.node, centerX, clampedY, getLevelYOffset(), getSlabElevation(event)),
        cachedCursorRotation.current,
        width,
        height,
        !tooNarrow && !hasOverlap,
      )
      event.stopPropagation()
    }

    const onWallClick = (event: WallEvent) => {
      if (!isValidWallSideFace(event.normal)) return
      if (event.node.parentId !== getLevelId()) return

      const preset = getDoorPreset(useEditor.getState().doorPresetId)
      const wLen = getWallLength(event.node)
      const snappedX = snapWallX(event.localPosition[0], wLen)

      if (phase.current === 'idle') {
        // First click — anchor start edge, enter drawing mode
        phase.current = 'drawing'
        anchorX.current = snappedX
        event.stopPropagation()
        return
      }

      // Second click — commit if valid
      if (!draftRef.current) return

      const { width, centerX, tooNarrow } = resolveDrawn(anchorX.current, snappedX)
      if (tooNarrow) return // force the user to draw a meaningful size

      const height = preset.height
      const { clampedX, clampedY } = clampToWall(event.node, centerX, width, height)

      const hasOverlap = hasWallChildOverlap(
        event.node.id,
        clampedX,
        clampedY,
        width,
        height,
        draftRef.current.id,
      )
      if (hasOverlap) return

      // Commit
      const draft = draftRef.current
      draftRef.current = null
      phase.current = 'idle'

      useScene.getState().deleteNode(draft.id)
      useScene.temporal.getState().resume()

      const levelId = getLevelId()
      const state = useScene.getState()
      const doorCount = Object.values(state.nodes).filter((n) => {
        if (n.type !== 'door') return false
        const wall = n.parentId ? state.nodes[n.parentId as AnyNodeId] : undefined
        return wall?.parentId === levelId
      }).length
      const name = `Door ${doorCount + 1}`

      const node = DoorNode.parse({
        name,
        position: [clampedX, clampedY, 0],
        rotation: [0, cachedItemRotation.current, 0],
        side: cachedSide.current,
        wallId: event.node.id,
        parentId: event.node.id,
        width,
        height,
        hingesSide: draft.hingesSide,
        swingDirection: draft.swingDirection,
        frameThickness: draft.frameThickness,
        frameDepth: draft.frameDepth,
        threshold: draft.threshold,
        thresholdHeight: draft.thresholdHeight,
        segments: draft.segments,
        handle: draft.handle,
        handleHeight: draft.handleHeight,
        handleSide: draft.handleSide,
        doorCloser: draft.doorCloser,
        panicBar: draft.panicBar,
        panicBarHeight: draft.panicBarHeight,
      })

      useScene.getState().createNode(node, event.node.id as AnyNodeId)
      useViewer.getState().setSelection({ selectedIds: [node.id] })
      useScene.temporal.getState().pause()
      sfxEmitter.emit('sfx:item-place')

      event.stopPropagation()
    }

    const onWallLeave = () => {
      // Cancel drawing when leaving the wall
      phase.current = 'idle'
      destroyDraft()
      hideCursor()
    }

    const onCancel = () => {
      phase.current = 'idle'
      destroyDraft()
      hideCursor()
    }

    emitter.on('wall:enter', onWallEnter)
    emitter.on('wall:move', onWallMove)
    emitter.on('wall:click', onWallClick)
    emitter.on('wall:leave', onWallLeave)
    emitter.on('tool:cancel', onCancel)

    return () => {
      phase.current = 'idle'
      destroyDraft()
      hideCursor()
      useScene.temporal.getState().resume()
      emitter.off('wall:enter', onWallEnter)
      emitter.off('wall:move', onWallMove)
      emitter.off('wall:click', onWallClick)
      emitter.off('wall:leave', onWallLeave)
      emitter.off('tool:cancel', onCancel)
    }
  }, [])

  return (
    <group ref={cursorGroupRef} visible={false}>
      <lineSegments
        geometry={CURSOR_EDGES}
        layers={EDITOR_LAYER}
        material={edgeMaterial}
        ref={edgesRef}
      />
    </group>
  )
}
