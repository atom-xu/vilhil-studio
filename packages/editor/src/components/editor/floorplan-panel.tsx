'use client'

import { Icon } from '@iconify/react'
import {
  type AnyNodeId,
  type BuildingNode,
  calculateLevelMiters,
  DoorNode,
  emitter,
  type GuideNode,
  getWallPlanFootprint,
  type LevelNode,
  loadAssetUrl,
  type Point2D,
  type SiteNode,
  SlabNode,
  useScene,
  type WallNode,
  WindowNode,
  ZoneNode as ZoneNodeSchema,
  type ZoneNode as ZoneNodeType,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { CheckCircle2, Command } from 'lucide-react'
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useShallow } from 'zustand/react/shallow'
import { sfxEmitter } from '../../lib/sfx-bus'
import { cn } from '../../lib/utils'
import useEditor from '../../store/use-editor'
import { snapToHalf } from '../tools/item/placement-math'
import {
  collectTrackingCandidates,
  computeExtensionTracking,
  computeOrthogonalTracking,
  computeWallPerpendicularTracking,
  createWallOnCurrentLevel,
  type ExtensionTrackingHit,
  findWallSnapTarget,
  getEffectiveSnapRadius,
  isWallLongEnough,
  type OrthogonalTrackingHit,
  snapWallDraftPoint,
  WALL_GRID_STEP,
  type WallPlanPoint,
  type WallPerpendicularHit,
} from '../tools/wall/wall-drafting'
import { WALL_TYPE_BY_ID } from '../tools/wall/wall-types'
import { furnishTools } from '../ui/action-menu/furnish-tools'
import { tools as structureTools } from '../ui/action-menu/structure-tools'

import { PALETTE_COLORS } from '../ui/primitives/color-dot'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/primitives/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/primitives/tooltip'
import { NodeActionMenu } from './node-action-menu'

const FALLBACK_VIEW_SIZE = 12
const FLOORPLAN_PADDING = 2
const MIN_VIEWPORT_WIDTH_RATIO = 0.08
const MAX_VIEWPORT_WIDTH_RATIO = 40
const PANEL_MIN_WIDTH = 420
const PANEL_MIN_HEIGHT = 320
const PANEL_DEFAULT_WIDTH = 560
const PANEL_DEFAULT_HEIGHT = 360
const PANEL_MARGIN = 16
const PANEL_DEFAULT_BOTTOM_OFFSET = 96
const MIN_GRID_SCREEN_SPACING = 12
const GRID_COORDINATE_PRECISION = 6
const MAJOR_GRID_STEP = WALL_GRID_STEP * 2
const FLOORPLAN_WALL_THICKNESS_SCALE = 1.18
const FLOORPLAN_MIN_VISIBLE_WALL_THICKNESS = 0.13
const FLOORPLAN_MAX_EXTRA_THICKNESS = 0.035
const FLOORPLAN_PANEL_LAYOUT_STORAGE_KEY = 'pascal-editor-floorplan-panel-layout'
const EMPTY_WALL_MITER_DATA = calculateLevelMiters([])
const EDITOR_CURSOR = "url('/cursor.svg') 4 2, default"
const FLOORPLAN_CURSOR_INDICATOR_OFFSET_X = 20
const FLOORPLAN_CURSOR_INDICATOR_OFFSET_Y = 14
const FLOORPLAN_CURSOR_MARKER_CORE_RADIUS = 0.06
const FLOORPLAN_CURSOR_MARKER_GLOW_RADIUS = 0.2
const FLOORPLAN_HOVER_TRANSITION = 'opacity 180ms cubic-bezier(0.2, 0, 0, 1)'
const FLOORPLAN_WALL_HIT_STROKE_WIDTH = 18
const FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH = 18
const FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH = 8
const FLOORPLAN_OPENING_HIT_STROKE_WIDTH = 16
const FLOORPLAN_OPENING_STROKE_WIDTH = 0.05
const FLOORPLAN_OPENING_DETAIL_STROKE_WIDTH = 0.02
const FLOORPLAN_OPENING_DASHED_STROKE_WIDTH = 0.02
const FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH = 18
const FLOORPLAN_ENDPOINT_HOVER_GLOW_STROKE_WIDTH = 16
const FLOORPLAN_ENDPOINT_HOVER_RING_STROKE_WIDTH = 7
const FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX = 4
const FLOORPLAN_MEASUREMENT_OFFSET = 0.46
const FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT = 0.08
const FLOORPLAN_MEASUREMENT_LINE_WIDTH = 1.2
const FLOORPLAN_MEASUREMENT_LINE_OUTLINE_WIDTH = 2.8
const FLOORPLAN_MEASUREMENT_LINE_OPACITY = 0.72
const FLOORPLAN_MEASUREMENT_LINE_OUTLINE_OPACITY = 0.9
const FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE = 0.15
const FLOORPLAN_MEASUREMENT_LABEL_OPACITY = 0.82
const FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH = 0.05
const FLOORPLAN_MEASUREMENT_LABEL_GAP = 0.56
const FLOORPLAN_MEASUREMENT_LABEL_LINE_PADDING = 0.14
const FLOORPLAN_ACTION_MENU_HORIZONTAL_PADDING = 60
const FLOORPLAN_ACTION_MENU_MIN_ANCHOR_Y = 56
const FLOORPLAN_ACTION_MENU_OFFSET_Y = 10
const FLOORPLAN_DEFAULT_WINDOW_LOCAL_Y = 1.5

// Match the guide plane footprint used in the 3D renderer so the 2D overlay aligns.
const FLOORPLAN_GUIDE_BASE_WIDTH = 10
const FLOORPLAN_GUIDE_MIN_SCALE = 0.01
const FLOORPLAN_GUIDE_HANDLE_SIZE = 0.22
const FLOORPLAN_GUIDE_HANDLE_HIT_RADIUS = 0.3
const FLOORPLAN_GUIDE_SELECTION_STROKE_WIDTH = 0.05
const FLOORPLAN_GUIDE_HANDLE_HINT_OFFSET = 72
const FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_X = 92
const FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_Y = 48
const FLOORPLAN_GUIDE_ROTATION_SNAP_DEGREES = 45
const FLOORPLAN_GUIDE_ROTATION_FINE_SNAP_DEGREES = 1
const FLOORPLAN_SITE_COLOR = '#10b981'

type FloorplanViewport = {
  centerX: number
  centerY: number
  width: number
}

type SvgPoint = {
  x: number
  y: number
}

type PanState = {
  pointerId: number
  clientX: number
  clientY: number
}

type GestureLikeEvent = Event & {
  clientX?: number
  clientY?: number
  scale?: number
}

type PanelRect = {
  x: number
  y: number
  width: number
  height: number
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

type PanelInteractionState = {
  pointerId: number
  startClientX: number
  startClientY: number
  initialRect: PanelRect
  type: 'drag' | 'resize'
  direction?: ResizeDirection
}

type ViewportBounds = {
  width: number
  height: number
}

type OpeningNode = WindowNode | DoorNode

type WallEndpoint = 'start' | 'end'

type FloorplanCursorIndicator =
  | {
      kind: 'asset'
      iconSrc: string
    }
  | {
      kind: 'icon'
      icon: string
    }

type PersistedPanelLayout = {
  rect: PanelRect
  viewport: ViewportBounds
}

type FloorplanSelectionBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type FloorplanMarqueeState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startPlanPoint: WallPlanPoint
  currentPlanPoint: WallPlanPoint
}

type WallEndpointDragState = {
  pointerId: number
  wallId: WallNode['id']
  endpoint: WallEndpoint
  fixedPoint: WallPlanPoint
  currentPoint: WallPlanPoint
}

const GUIDE_CORNERS = ['nw', 'ne', 'se', 'sw'] as const

type GuideCorner = (typeof GUIDE_CORNERS)[number]

type GuideInteractionMode = 'resize' | 'rotate' | 'translate'

type GuideTransformDraft = {
  guideId: GuideNode['id']
  position: WallPlanPoint
  scale: number
  rotation: number
}

type GuideHandleHintAnchor = {
  x: number
  y: number
  directionX: number
  directionY: number
}

type GuideInteractionState = {
  pointerId: number
  guideId: GuideNode['id']
  corner: GuideCorner
  mode: GuideInteractionMode
  aspectRatio: number
  centerSvg: SvgPoint
  oppositeCornerSvg: SvgPoint | null
  pointerOffsetSvg: WallPlanPoint
  rotationSvg: number
  cornerBaseAngle: number
  scale: number
}

type WallEndpointDraft = {
  wallId: WallNode['id']
  endpoint: WallEndpoint
  start: WallPlanPoint
  end: WallPlanPoint
}

type SlabBoundaryDraft = {
  slabId: SlabNode['id']
  polygon: WallPlanPoint[]
}

type SlabVertexDragState = {
  pointerId: number
  slabId: SlabNode['id']
  vertexIndex: number
}

type SiteBoundaryDraft = {
  siteId: SiteNode['id']
  polygon: WallPlanPoint[]
}

type SiteVertexDragState = {
  pointerId: number
  siteId: SiteNode['id']
  vertexIndex: number
}

type ZoneBoundaryDraft = {
  zoneId: ZoneNodeType['id']
  polygon: WallPlanPoint[]
}

type ZoneVertexDragState = {
  pointerId: number
  zoneId: ZoneNodeType['id']
  vertexIndex: number
}

type WallPolygonEntry = {
  wall: WallNode
  polygon: Point2D[]
  points: string
}

type OpeningPolygonEntry = {
  opening: OpeningNode
  polygon: Point2D[]
  points: string
}

type SlabPolygonEntry = {
  slab: SlabNode
  polygon: Point2D[]
  holes: Point2D[][]
  path: string
}

type SitePolygonEntry = {
  site: SiteNode
  polygon: Point2D[]
  points: string
}

type ZonePolygonEntry = {
  zone: ZoneNodeType
  polygon: Point2D[]
  points: string
}

type FloorplanPalette = {
  surface: string
  minorGrid: string
  majorGrid: string
  minorGridOpacity: number
  majorGridOpacity: number
  slabFill: string
  slabStroke: string
  selectedSlabFill: string
  wallFill: string
  wallStroke: string
  wallHoverStroke: string
  selectedFill: string
  selectedStroke: string
  draftFill: string
  draftStroke: string
  cursor: string
  editCursor: string
  anchor: string
  openingFill: string
  openingStroke: string
  measurementStroke: string
  endpointHandleFill: string
  endpointHandleStroke: string
  endpointHandleHoverStroke: string
  endpointHandleActiveFill: string
  endpointHandleActiveStroke: string
}

const resizeCursorByDirection: Record<ResizeDirection, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
}

const resizeHandleConfigurations: Array<{
  direction: ResizeDirection
  className: string
}> = [
  { direction: 'n', className: 'absolute top-0 left-4 right-4 z-20 h-2 cursor-ns-resize' },
  { direction: 's', className: 'absolute right-4 bottom-0 left-4 z-20 h-2 cursor-ns-resize' },
  { direction: 'e', className: 'absolute top-4 right-0 bottom-4 z-20 w-2 cursor-ew-resize' },
  { direction: 'w', className: 'absolute top-4 bottom-4 left-0 z-20 w-2 cursor-ew-resize' },
  { direction: 'ne', className: 'absolute top-0 right-0 z-20 h-4 w-4 cursor-nesw-resize' },
  { direction: 'nw', className: 'absolute top-0 left-0 z-20 h-4 w-4 cursor-nwse-resize' },
  { direction: 'se', className: 'absolute right-0 bottom-0 z-20 h-4 w-4 cursor-nwse-resize' },
  { direction: 'sw', className: 'absolute bottom-0 left-0 z-20 h-4 w-4 cursor-nesw-resize' },
]

const guideCornerSigns: Record<GuideCorner, { x: -1 | 1; y: -1 | 1 }> = {
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
}

const oppositeGuideCorner: Record<GuideCorner, GuideCorner> = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getSelectionModifierKeys(event?: { metaKey?: boolean; ctrlKey?: boolean }) {
  return {
    meta: Boolean(event?.metaKey),
    ctrl: Boolean(event?.ctrlKey),
  }
}

function toPoint2D(point: WallPlanPoint): Point2D {
  return { x: point[0], y: point[1] }
}

function toWallPlanPoint(point: Point2D): WallPlanPoint {
  return [point.x, point.y]
}

function toSvgX(value: number): number {
  return -value
}

function toSvgY(value: number): number {
  return -value
}

function toSvgPoint(point: Point2D): SvgPoint {
  return {
    x: toSvgX(point.x),
    y: toSvgY(point.y),
  }
}

function toSvgPlanPoint(point: WallPlanPoint): SvgPoint {
  return {
    x: toSvgX(point[0]),
    y: toSvgY(point[1]),
  }
}

function toPlanPointFromSvgPoint(svgPoint: SvgPoint): WallPlanPoint {
  return [toSvgX(svgPoint.x), toSvgY(svgPoint.y)]
}

function rotateVector([x, y]: WallPlanPoint, angle: number): WallPlanPoint {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos - y * sin, x * sin + y * cos]
}

function addVectorToSvgPoint(point: SvgPoint, [dx, dy]: WallPlanPoint): SvgPoint {
  return {
    x: point.x + dx,
    y: point.y + dy,
  }
}

function subtractSvgPoints(point: SvgPoint, origin: SvgPoint): WallPlanPoint {
  return [point.x - origin.x, point.y - origin.y]
}

function midpointBetweenSvgPoints(start: SvgPoint, end: SvgPoint): SvgPoint {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
}

function getGuideWidth(scale: number) {
  return FLOORPLAN_GUIDE_BASE_WIDTH * scale
}

/**
 * 标定点吸附 — 只吸附真实有意义的目标
 * 1. 墙体端点（15cm 半径，如果已画了墙）
 * 2. 底图的 4 个角点 + 中心点（15cm 半径，如果当前层有底图）
 * 3. 轴约束（第二点时）：吸附到过第一点的水平或垂直轴
 * 4. 否则不吸附，精确返回鼠标位置
 *
 * 不做网格吸附：用户要的是图纸上的精确位置，网格会把点拉偏
 *
 * `axisConstrain`：true = 把第二点吸附到水平/垂直轴（Shift 松开时）
 */
const CALIBRATION_SNAP_RADIUS = 0.15 // 15cm 吸附半径

export type CalibrationSnapAxis = 'h' | 'v' | 'free'

export interface CalibrationSnapResult {
  point: [number, number]
  /** 轴约束类型（仅在第二点且 axisConstrain=true 时有值） */
  axis: CalibrationSnapAxis
}

function snapCalibrationPoint(
  point: [number, number],
  walls: WallNode[],
  existingCalPoints: Array<[number, number]>,
  guideCandidates: Array<[number, number]> = [],
  axisConstrain = false,
): CalibrationSnapResult {
  const [px, py] = point
  let best: [number, number] | null = null
  let bestDistSq = CALIBRATION_SNAP_RADIUS * CALIBRATION_SNAP_RADIUS

  // 轴约束（第二点时）：先把光标投影到水平/垂直轴，再在轴上做端点吸附
  let axisConstrained: [number, number] | null = null
  let snapAxis: CalibrationSnapAxis = 'free'
  if (axisConstrain && existingCalPoints.length === 1) {
    const p1 = existingCalPoints[0]!
    const dx = Math.abs(px - p1[0])
    const dy = Math.abs(py - p1[1])
    if (dx >= dy) {
      // 水平轴：锁 y = p1.y
      axisConstrained = [px, p1[1]]
      snapAxis = 'h'
    } else {
      // 垂直轴：锁 x = p1.x
      axisConstrained = [p1[0], py]
      snapAxis = 'v'
    }
    // 轴约束后的位置作为吸附基础
    const [apx, apy] = axisConstrained

    // 吸附墙端点（在轴上）
    for (const wall of walls) {
      for (const endpoint of [wall.start, wall.end]) {
        const ddx = endpoint[0] - apx
        const ddy = endpoint[1] - apy
        const d2 = ddx * ddx + ddy * ddy
        if (d2 < bestDistSq) {
          best = [endpoint[0], endpoint[1]]
          bestDistSq = d2
        }
      }
    }
    for (const candidate of guideCandidates) {
      const ddx = candidate[0] - apx
      const ddy = candidate[1] - apy
      const d2 = ddx * ddx + ddy * ddy
      if (d2 < bestDistSq) {
        best = [candidate[0], candidate[1]]
        bestDistSq = d2
      }
    }
    return { point: best ?? axisConstrained, axis: snapAxis }
  }

  // 无轴约束：吸附墙端点
  for (const wall of walls) {
    for (const endpoint of [wall.start, wall.end]) {
      const dx = endpoint[0] - px
      const dy = endpoint[1] - py
      const d2 = dx * dx + dy * dy
      if (d2 < bestDistSq) {
        best = [endpoint[0], endpoint[1]]
        bestDistSq = d2
      }
    }
  }

  // 吸附底图特征点（角点、中心点）
  for (const candidate of guideCandidates) {
    const dx = candidate[0] - px
    const dy = candidate[1] - py
    const d2 = dx * dx + dy * dy
    if (d2 < bestDistSq) {
      best = [candidate[0], candidate[1]]
      bestDistSq = d2
    }
  }

  // 没吸附到就返回原始鼠标位置（精确）
  return { point: best ?? [px, py], axis: 'free' }
}

/**
 * 计算一组墙体中心线的所有两两交点（端点重合 + 真实穿越均包含）。
 *
 * 覆盖场景：
 *   L 型：两墙端点重合 → t≈0/1, s≈0/1 → 交点 = 共用端点
 *   T 型：一墙端点落在另一墙线段上 → 一侧 t∈(0,1)，另一侧 s=0/1
 *   X 型：两墙真正穿越 → t,s ∈ (0,1)
 *
 * 所有情况均返回几何交点坐标，结果去重（1mm 精度）。
 */
function getWallIntersections(walls: WallNode[]): Array<[number, number]> {
  const seen = new Set<string>()
  const result: Array<[number, number]> = []

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i]!
      const b = walls[j]!
      const x1 = a.start[0], y1 = a.start[1]
      const x2 = a.end[0],   y2 = a.end[1]
      const x3 = b.start[0], y3 = b.start[1]
      const x4 = b.end[0],   y4 = b.end[1]

      const denom = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
      if (Math.abs(denom) < 1e-9) continue // 平行

      const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / denom
      const s = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / denom

      // 两段均在范围内（含端点，允许 1mm 容差）
      if (t < -0.001 || t > 1.001 || s < -0.001 || s > 1.001) continue

      const ix = x1 + t * (x2 - x1)
      const iy = y1 + t * (y2 - y1)

      // 1mm 精度去重
      const key = `${Math.round(ix * 1000)},${Math.round(iy * 1000)}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push([ix, iy])
      }
    }
  }
  return result
}

/**
 * 对齐模式专用吸附
 *
 * 候选集（传入前预计算）= 墙体所有交点（含端点重合交点）+ 底图特征点
 * 吸附半径 35cm — 靠近即自动吸附，无需精确点击
 * 返回吸附坐标 + 是否命中（驱动光标预览样式）
 */
// 像素级吸附半径 — 缩放时手感一致（大图精准，小图易点）
const ALIGNMENT_SNAP_PIXELS = 28

function snapAlignmentPoint(
  point: [number, number],
  candidates: Array<[number, number]>,
  snapRadius: number, // 世界单位（由调用方根据 worldUnitsPerPixel 换算）
): { snapped: [number, number]; hit: boolean } {
  const [px, py] = point
  let best: [number, number] | null = null
  let bestDistSq = snapRadius * snapRadius

  for (const c of candidates) {
    const dx = c[0] - px
    const dy = c[1] - py
    const d2 = dx * dx + dy * dy
    if (d2 < bestDistSq) {
      best = c
      bestDistSq = d2
    }
  }

  return best ? { snapped: best, hit: true } : { snapped: [px, py], hit: false }
}

/**
 * 多层 2 点对齐 — 计算刚体变换（平移 + 旋转）并应用到当前楼层所有节点
 *
 * 数学原理：
 *   给定参考层两点 A1,A2 和当前层对应两点 B1,B2，
 *   求旋转角 θ = angle(A1→A2) - angle(B1→B2)，
 *   再求平移 T = A1 - R(θ)·B1，
 *   对当前层所有节点的 XZ 坐标施加 P' = R(θ)·P + T。
 */
function applyLevelAlignment(
  levelId: string,
  refPoints: [[number, number], [number, number]],
  curPoints: [[number, number], [number, number]],
) {
  const [A1, A2] = refPoints
  const [B1, B2] = curPoints

  const angleRef = Math.atan2(A2[1] - A1[1], A2[0] - A1[0])
  const angleCur = Math.atan2(B2[1] - B1[1], B2[0] - B1[0])
  const theta = angleRef - angleCur

  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)

  // 平移量：让旋转后的 B1 与 A1 重合
  const tx = A1[0] - (B1[0] * cosT - B1[1] * sinT)
  const tz = A1[1] - (B1[0] * sinT + B1[1] * cosT)

  const xform = (x: number, z: number): [number, number] => [
    x * cosT - z * sinT + tx,
    x * sinT + z * cosT + tz,
  ]

  const { nodes, updateNode } = useScene.getState()
  const level = nodes[levelId as AnyNodeId]
  if (!level || level.type !== 'level') return

  for (const childId of (level as LevelNode).children) {
    const node = nodes[childId as AnyNodeId]
    if (!node) continue

    switch (node.type) {
      case 'wall': {
        const [sx, sz] = xform(node.start[0], node.start[1])
        const [ex, ez] = xform(node.end[0], node.end[1])
        updateNode(childId as AnyNodeId, { start: [sx, sz], end: [ex, ez] })
        break
      }
      case 'guide': {
        const [px, pz] = xform(node.position[0], node.position[2])
        updateNode(childId as AnyNodeId, {
          position: [px, node.position[1], pz],
          rotation: [node.rotation[0], node.rotation[1] + theta, node.rotation[2]],
        })
        break
      }
      case 'scan': {
        const [px, pz] = xform(node.position[0], node.position[2])
        updateNode(childId as AnyNodeId, {
          position: [px, node.position[1], pz],
          rotation: [node.rotation[0], (node.rotation[1] ?? 0) + theta, node.rotation[2]],
        })
        break
      }
      case 'slab':
      case 'ceiling': {
        const poly = (node as any).polygon as Array<[number, number]> | undefined
        if (Array.isArray(poly)) {
          const updates: Record<string, unknown> = { polygon: poly.map(([x, z]) => xform(x, z)) }
          const holes = (node as any).holes as Array<Array<[number, number]>> | undefined
          if (Array.isArray(holes)) {
            updates.holes = holes.map((h) => h.map(([x, z]) => xform(x, z)))
          }
          updateNode(childId as AnyNodeId, updates as any)
        }
        break
      }
      case 'zone': {
        const poly = (node as any).polygon as Array<[number, number]> | undefined
        if (Array.isArray(poly)) {
          updateNode(childId as AnyNodeId, { polygon: poly.map(([x, z]) => xform(x, z)) } as any)
        }
        break
      }
    }
  }
}

/**
 * LevelAlignmentOverlay — 2 点对齐时的 SVG 标记层
 *
 * 视觉语言：
 *   - 参考层的点：橙色（#f59e0b），带序号 ①②
 *   - 当前层的点：品牌蓝（#2D7FF9），带序号 ①②
 *   - 同层两点之间连线（虚线）
 *   - 对应点连线（ref①—cur①，ref②—cur②）：灰色点线，表示对应关系
 *   - 光标吸附预览：移动时实时显示将落在哪个位置
 */
function LevelAlignmentOverlay({
  worldUnitsPerPixel,
  cursorPoint,
  refSnapCandidates,
  curSnapCandidates,
}: {
  worldUnitsPerPixel: number
  cursorPoint: WallPlanPoint | null
  refSnapCandidates: Array<[number, number]>
  curSnapCandidates: Array<[number, number]>
}) {
  const la = useEditor((s) => (s as any).levelAlignment)
  if (!la?.active) return null

  const px = worldUnitsPerPixel
  const armLen = 10 * px
  const strokeW = 1.5 * px
  const pinR = 3.5 * px
  const labelOff = 14 * px

  // 当前层用品牌蓝，参考层用琥珀橙（与蓝色叠加墙对比清晰）
  const CUR_COLOR = '#2D7FF9'
  const REF_COLOR = '#f59e0b'

  const LABELS = ['①', '②']

  // 计算光标吸附预览位置（候选集已包含所有交点，直接匹配）
  const phase: 'ref' | 'cur' = la.phase
  const snapCandidates = phase === 'ref' ? refSnapCandidates : curSnapCandidates
  const snapRadius = ALIGNMENT_SNAP_PIXELS * px
  const cursorSnap = cursorPoint
    ? snapAlignmentPoint([cursorPoint[0], cursorPoint[1]], snapCandidates, snapRadius)
    : null
  const previewColor = phase === 'cur' ? CUR_COLOR : REF_COLOR

  // 已确认的点：根据阶段和数量决定下一个序号
  const refPoints: Array<[number, number]> = la.refPoints
  const curPoints: Array<[number, number]> = la.curPoints

  // 固定图钉：已确认的点
  const Pin = ({ p, color, label }: { p: [number, number]; color: string; label: string }) => {
    const sx = toSvgX(p[0])
    const sy = toSvgY(p[1])
    return (
      <g pointerEvents="none">
        {/* 光晕 */}
        <circle cx={sx} cy={sy} r={pinR * 3} fill={color} fillOpacity={0.12} />
        {/* 十字 */}
        <line stroke={color} strokeWidth={strokeW} x1={sx - armLen} x2={sx + armLen} y1={sy} y2={sy} />
        <line stroke={color} strokeWidth={strokeW} x1={sx} x2={sx} y1={sy - armLen} y2={sy + armLen} />
        {/* 中心实心圆 */}
        <circle cx={sx} cy={sy} r={pinR} fill={color} stroke="#fff" strokeWidth={strokeW * 0.8} />
        {/* 序号标签 */}
        <text
          dominantBaseline="auto"
          fill={color}
          fontSize={11 * px}
          fontWeight="600"
          pointerEvents="none"
          textAnchor="middle"
          x={sx}
          y={sy - labelOff}
        >
          {label}
        </text>
      </g>
    )
  }

  // 虚线连线（同层两点间）
  const DashLine = ({ pts, color }: { pts: Array<[number, number]>; color: string }) => {
    if (pts.length < 2) return null
    return (
      <line
        pointerEvents="none"
        stroke={color}
        strokeDasharray={`${7 * px} ${4 * px}`}
        strokeOpacity={0.65}
        strokeWidth={strokeW}
        x1={toSvgX(pts[0]![0])}
        x2={toSvgX(pts[1]![0])}
        y1={toSvgY(pts[0]![1])}
        y2={toSvgY(pts[1]![1])}
      />
    )
  }

  // 对应关系连线（ref[i] ↔ cur[i]）
  const CorrespondLine = ({ i }: { i: number }) => {
    const r = refPoints[i]
    const c = curPoints[i]
    if (!r || !c) return null
    return (
      <line
        pointerEvents="none"
        stroke="#94a3b8"
        strokeDasharray={`${3 * px} ${5 * px}`}
        strokeOpacity={0.5}
        strokeWidth={strokeW * 0.8}
        x1={toSvgX(r[0])}
        x2={toSvgX(c[0])}
        y1={toSvgY(r[1])}
        y2={toSvgY(c[1])}
      />
    )
  }

  // 光标预览
  const CursorPreview = () => {
    if (!cursorSnap) return null
    const { snapped, hit } = cursorSnap
    const sx = toSvgX(snapped[0])
    const sy = toSvgY(snapped[1])
    if (hit) {
      // 吸附命中：大光环 + 实心圆，非常明显
      return (
        <g pointerEvents="none">
          <circle cx={sx} cy={sy} r={pinR * 5} fill={previewColor} fillOpacity={0.08} />
          <circle
            cx={sx}
            cy={sy}
            r={pinR * 3}
            fill="none"
            stroke={previewColor}
            strokeOpacity={0.7}
            strokeWidth={strokeW * 1.2}
          />
          <circle cx={sx} cy={sy} r={pinR * 1.2} fill={previewColor} fillOpacity={0.9} />
          <line stroke={previewColor} strokeOpacity={0.6} strokeWidth={strokeW} x1={sx - armLen * 1.4} x2={sx + armLen * 1.4} y1={sy} y2={sy} />
          <line stroke={previewColor} strokeOpacity={0.6} strokeWidth={strokeW} x1={sx} x2={sx} y1={sy - armLen * 1.4} y2={sy + armLen * 1.4} />
        </g>
      )
    }
    // 自由位置：小十字，告知位置但不强调
    return (
      <g pointerEvents="none" opacity={0.4}>
        <line stroke={previewColor} strokeWidth={strokeW} x1={sx - armLen * 0.7} x2={sx + armLen * 0.7} y1={sy} y2={sy} />
        <line stroke={previewColor} strokeWidth={strokeW} x1={sx} x2={sx} y1={sy - armLen * 0.7} y2={sy + armLen * 0.7} />
      </g>
    )
  }

  return (
    <>
      {/* 对应关系连线（灰色点线） */}
      <CorrespondLine i={0} />
      <CorrespondLine i={1} />
      {/* 同层两点连线 */}
      <DashLine pts={refPoints} color={REF_COLOR} />
      <DashLine pts={curPoints} color={CUR_COLOR} />
      {/* 已确认图钉 */}
      {refPoints.map((p, i) => <Pin key={`ref-${i}`} p={p} color={REF_COLOR} label={LABELS[i]!} />)}
      {curPoints.map((p, i) => <Pin key={`cur-${i}`} p={p} color={CUR_COLOR} label={LABELS[i]!} />)}
      {/* 光标吸附预览 */}
      <CursorPreview />
    </>
  )
}

// 步骤进度配置 — 先点当前层（本楼层），再自动跳转到参考层点对应点
const ALIGN_STEPS = [
  { phase: 'cur', index: 0, color: '#2D7FF9', label: '当前层', hint: '点第 1 个特征点（墙角 / 交点）' },
  { phase: 'cur', index: 1, color: '#2D7FF9', label: '当前层', hint: '点第 2 个特征点（另一个墙角）' },
  { phase: 'ref', index: 0, color: '#f59e0b', label: '参考层', hint: '已切换到参考层，点对应的第 1 个特征点' },
  { phase: 'ref', index: 1, color: '#f59e0b', label: '参考层', hint: '继续点对应的第 2 个特征点，完成对齐' },
]

/**
 * LevelAlignmentHUD — 对齐模式的顶部步骤条
 */
function LevelAlignmentHUD() {
  const la = useEditor((s) => (s as any).levelAlignment)
  if (!la?.active) return null

  const refPoints: Array<[number, number]> = la.refPoints
  const curPoints: Array<[number, number]> = la.curPoints
  const doneCount = refPoints.length + curPoints.length
  const currentStep = ALIGN_STEPS[doneCount]
  if (!currentStep) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center">
      <div
        className="flex items-center gap-3 rounded-xl border bg-background/95 px-4 py-2.5 shadow-xl backdrop-blur-sm"
        style={{ borderColor: `${currentStep.color}40` }}
      >
        {/* 步骤点 */}
        <div className="flex items-center gap-1">
          {ALIGN_STEPS.map((s, i) => (
            <div
              key={i}
              className="size-1.5 rounded-full transition-all"
              style={{
                backgroundColor: i < doneCount ? s.color : i === doneCount ? s.color : '#334155',
                opacity: i < doneCount ? 0.4 : i === doneCount ? 1 : 0.3,
                transform: i === doneCount ? 'scale(1.4)' : 'scale(1)',
              }}
            />
          ))}
        </div>
        {/* 层标签 */}
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: `${currentStep.color}20`, color: currentStep.color }}
        >
          {currentStep.label}
        </span>
        {/* 提示文字 */}
        <span className="text-[13px] text-foreground">{currentStep.hint}</span>
        {/* 取消 */}
        <button
          className="pointer-events-auto ml-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground"
          onClick={() => {
            const la = useEditor.getState().levelAlignment
            const aligningId = la.aligningLevelId
            useEditor.getState().cancelLevelAlignment()
            // 取消时跳回被对齐的原始层（如果已经自动切到参考层，则跳回去）
            if (aligningId) {
              const viewerState = useViewer.getState()
              const { selection } = viewerState
              viewerState.setSelection(
                selection.buildingId
                  ? { buildingId: selection.buildingId, levelId: aligningId }
                  : { levelId: aligningId },
              )
            }
          }}
          type="button"
        >
          ESC 取消
        </button>
      </div>
    </div>
  )
}

function getGuideHeight(width: number, aspectRatio: number) {
  return width / aspectRatio
}

function getGuideCenterSvgPoint(guide: GuideNode): SvgPoint {
  return {
    x: toSvgX(guide.position[0]),
    y: toSvgY(guide.position[2]),
  }
}

function getGuideCornerLocalOffset(
  width: number,
  height: number,
  corner: GuideCorner,
): WallPlanPoint {
  const signs = guideCornerSigns[corner]
  return [(width / 2) * signs.x, (height / 2) * signs.y]
}

/**
 * 为一个 guide 收集标定用的候选吸附点：中心 + 4 个角点。
 * 中心不依赖图片尺寸；角点在尺寸已加载时可用。
 * 返回的是 plan 坐标（非 SVG）。
 */
function getGuideCalibrationAnchors(
  guide: GuideNode,
  dimensions: GuideImageDimensions | null,
): Array<[number, number]> {
  const cx = guide.position[0]
  const cz = guide.position[2]
  const anchors: Array<[number, number]> = [[cx, cz]] // 中心
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return anchors

  const aspectRatio = dimensions.width / dimensions.height
  const planWidth = getGuideWidth(guide.scale)
  const planHeight = getGuideHeight(planWidth, aspectRatio)
  const rotation = guide.rotation[1]
  const cosA = Math.cos(rotation)
  const sinA = Math.sin(rotation)
  const halfW = planWidth / 2
  const halfH = planHeight / 2
  // 4 个角的未旋转局部偏移
  const localCorners: Array<[number, number]> = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
  ]
  for (const [lx, lz] of localCorners) {
    const rx = lx * cosA - lz * sinA
    const rz = lx * sinA + lz * cosA
    anchors.push([cx + rx, cz + rz])
  }
  return anchors
}

function getGuideCornerSvgPoint(
  centerSvg: SvgPoint,
  width: number,
  height: number,
  rotationSvg: number,
  corner: GuideCorner,
): SvgPoint {
  return addVectorToSvgPoint(
    centerSvg,
    rotateVector(getGuideCornerLocalOffset(width, height, corner), rotationSvg),
  )
}

function snapAngleToIncrement(angle: number, incrementDegrees: number) {
  const incrementRadians = (incrementDegrees * Math.PI) / 180
  return Math.round(angle / incrementRadians) * incrementRadians
}

function toPositiveAngleDegrees(angle: number) {
  const angleDegrees = (angle * 180) / Math.PI
  return ((angleDegrees % 180) + 180) % 180
}

function getResizeCursorForAngle(angle: number) {
  const normalizedDegrees = toPositiveAngleDegrees(angle)

  if (normalizedDegrees < 22.5 || normalizedDegrees >= 157.5) {
    return 'ew-resize'
  }

  if (normalizedDegrees < 67.5) {
    return 'nwse-resize'
  }

  if (normalizedDegrees < 112.5) {
    return 'ns-resize'
  }

  return 'nesw-resize'
}

function getGuideResizeCursor(corner: GuideCorner, rotationSvg: number) {
  const signs = guideCornerSigns[corner]
  return getResizeCursorForAngle(Math.atan2(signs.y, signs.x) + rotationSvg)
}

function buildCursorUrl(svgMarkup: string, hotspotX: number, hotspotY: number, fallback: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svgMarkup)}") ${hotspotX} ${hotspotY}, ${fallback}`
}

function getGuideRotateCursor(isDarkMode: boolean) {
  const strokeColor = isDarkMode ? '#ffffff' : '#09090b'
  const outlineColor = isDarkMode ? '#0a0e1b' : '#ffffff'
  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M7 15.75a6 6 0 1 0 1.9-8.28" stroke="${outlineColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 5.5v4.5h4.5" stroke="${outlineColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 15.75a6 6 0 1 0 1.9-8.28" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 5.5v4.5h4.5" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `.trim()

  return buildCursorUrl(svgMarkup, 12, 12, 'pointer')
}

function buildGuideTranslateDraft(
  interaction: GuideInteractionState,
  pointerSvg: SvgPoint,
): GuideTransformDraft {
  const centerSvg = addVectorToSvgPoint(pointerSvg, [
    -interaction.pointerOffsetSvg[0],
    -interaction.pointerOffsetSvg[1],
  ])

  return {
    guideId: interaction.guideId,
    position: toPlanPointFromSvgPoint(centerSvg),
    scale: interaction.scale,
    rotation: normalizeAngle(-interaction.rotationSvg),
  }
}

function normalizeAngle(angle: number) {
  let nextAngle = angle

  while (nextAngle <= -Math.PI) {
    nextAngle += Math.PI * 2
  }

  while (nextAngle > Math.PI) {
    nextAngle -= Math.PI * 2
  }

  return nextAngle
}

function areGuideTransformDraftsEqual(
  previousDraft: GuideTransformDraft | null,
  nextDraft: GuideTransformDraft | null,
  epsilon = 1e-6,
) {
  if (previousDraft === nextDraft) {
    return true
  }

  if (!(previousDraft && nextDraft)) {
    return false
  }

  return (
    previousDraft.guideId === nextDraft.guideId &&
    Math.abs(previousDraft.position[0] - nextDraft.position[0]) <= epsilon &&
    Math.abs(previousDraft.position[1] - nextDraft.position[1]) <= epsilon &&
    Math.abs(previousDraft.scale - nextDraft.scale) <= epsilon &&
    Math.abs(previousDraft.rotation - nextDraft.rotation) <= epsilon
  )
}

function doesGuideMatchDraft(guide: GuideNode, draft: GuideTransformDraft, epsilon = 1e-6) {
  return (
    Math.abs(guide.position[0] - draft.position[0]) <= epsilon &&
    Math.abs(guide.position[2] - draft.position[1]) <= epsilon &&
    Math.abs(guide.scale - draft.scale) <= epsilon &&
    Math.abs(normalizeAngle(guide.rotation[1] - draft.rotation)) <= epsilon
  )
}

function buildGuideResizeDraft(
  interaction: GuideInteractionState,
  pointerSvg: SvgPoint,
): GuideTransformDraft {
  const signs = guideCornerSigns[interaction.corner]
  const minWidth = FLOORPLAN_GUIDE_BASE_WIDTH * FLOORPLAN_GUIDE_MIN_SCALE
  const diagonal = [signs.x * interaction.aspectRatio, signs.y] as WallPlanPoint
  const oppositeCornerSvg = interaction.oppositeCornerSvg ?? interaction.centerSvg
  const relativePointer = rotateVector(
    subtractSvgPoints(pointerSvg, oppositeCornerSvg),
    -interaction.rotationSvg,
  )
  const projectedHeight =
    (relativePointer[0] * diagonal[0] + relativePointer[1] * diagonal[1]) /
    (interaction.aspectRatio ** 2 + 1)
  const width = Math.max(minWidth, projectedHeight * interaction.aspectRatio)
  const height = getGuideHeight(width, interaction.aspectRatio)
  const draggedCornerSvg = addVectorToSvgPoint(
    oppositeCornerSvg,
    rotateVector([signs.x * width, signs.y * height], interaction.rotationSvg),
  )
  const centerSvg = midpointBetweenSvgPoints(oppositeCornerSvg, draggedCornerSvg)

  return {
    guideId: interaction.guideId,
    position: toPlanPointFromSvgPoint(centerSvg),
    scale: width / FLOORPLAN_GUIDE_BASE_WIDTH,
    rotation: normalizeAngle(-interaction.rotationSvg),
  }
}

function buildGuideRotationDraft(
  interaction: GuideInteractionState,
  pointerSvg: SvgPoint,
  useFineIncrement: boolean,
): GuideTransformDraft {
  const pointerVector = subtractSvgPoints(pointerSvg, interaction.centerSvg)

  if (pointerVector[0] ** 2 + pointerVector[1] ** 2 <= 1e-6) {
    return {
      guideId: interaction.guideId,
      position: toPlanPointFromSvgPoint(interaction.centerSvg),
      scale: interaction.scale,
      rotation: normalizeAngle(-interaction.rotationSvg),
    }
  }

  const rawRotationSvg =
    Math.atan2(pointerVector[1], pointerVector[0]) - interaction.cornerBaseAngle
  const snappedRotationSvg = snapAngleToIncrement(
    rawRotationSvg,
    useFineIncrement
      ? FLOORPLAN_GUIDE_ROTATION_FINE_SNAP_DEGREES
      : FLOORPLAN_GUIDE_ROTATION_SNAP_DEGREES,
  )

  return {
    guideId: interaction.guideId,
    position: toPlanPointFromSvgPoint(interaction.centerSvg),
    scale: interaction.scale,
    rotation: normalizeAngle(-snappedRotationSvg),
  }
}

function toSvgSelectionBounds(bounds: FloorplanSelectionBounds) {
  return {
    x: toSvgX(bounds.maxX),
    y: toSvgY(bounds.maxY),
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  }
}

function getFloorplanSelectionBounds(
  start: WallPlanPoint,
  end: WallPlanPoint,
): FloorplanSelectionBounds {
  return {
    minX: Math.min(start[0], end[0]),
    maxX: Math.max(start[0], end[0]),
    minY: Math.min(start[1], end[1]),
    maxY: Math.max(start[1], end[1]),
  }
}

function isPointInsideSelectionBounds(point: Point2D, bounds: FloorplanSelectionBounds) {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  )
}

function isPointInsidePolygon(point: Point2D, polygon: Point2D[]) {
  let isInside = false

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = polygon[currentIndex]
    const previous = polygon[previousIndex]

    if (!(current && previous)) {
      continue
    }

    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x

    if (intersects) {
      isInside = !isInside
    }
  }

  return isInside
}

function getLineOrientation(start: Point2D, end: Point2D, point: Point2D) {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
}

function isPointOnSegment(point: Point2D, start: Point2D, end: Point2D) {
  const epsilon = 1e-9

  return (
    Math.abs(getLineOrientation(start, end, point)) <= epsilon &&
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  )
}

function doSegmentsIntersect(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D,
) {
  const orientation1 = getLineOrientation(firstStart, firstEnd, secondStart)
  const orientation2 = getLineOrientation(firstStart, firstEnd, secondEnd)
  const orientation3 = getLineOrientation(secondStart, secondEnd, firstStart)
  const orientation4 = getLineOrientation(secondStart, secondEnd, firstEnd)

  const hasProperIntersection =
    ((orientation1 > 0 && orientation2 < 0) || (orientation1 < 0 && orientation2 > 0)) &&
    ((orientation3 > 0 && orientation4 < 0) || (orientation3 < 0 && orientation4 > 0))

  if (hasProperIntersection) {
    return true
  }

  return (
    isPointOnSegment(secondStart, firstStart, firstEnd) ||
    isPointOnSegment(secondEnd, firstStart, firstEnd) ||
    isPointOnSegment(firstStart, secondStart, secondEnd) ||
    isPointOnSegment(firstEnd, secondStart, secondEnd)
  )
}

function doesPolygonIntersectSelectionBounds(polygon: Point2D[], bounds: FloorplanSelectionBounds) {
  if (polygon.length === 0) {
    return false
  }

  if (polygon.some((point) => isPointInsideSelectionBounds(point, bounds))) {
    return true
  }

  const boundsCorners: [Point2D, Point2D, Point2D, Point2D] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ]

  if (boundsCorners.some((corner) => isPointInsidePolygon(corner, polygon))) {
    return true
  }

  const boundsEdges = [
    [boundsCorners[0], boundsCorners[1]],
    [boundsCorners[1], boundsCorners[2]],
    [boundsCorners[2], boundsCorners[3]],
    [boundsCorners[3], boundsCorners[0]],
  ] as const

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]

    if (!(start && end)) {
      continue
    }

    for (const [edgeStart, edgeEnd] of boundsEdges) {
      if (doSegmentsIntersect(start, end, edgeStart, edgeEnd)) {
        return true
      }
    }
  }

  return false
}

function getDistanceToWallSegment(point: Point2D, start: WallPlanPoint, end: WallPlanPoint) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(point.x - start[0], point.y - start[1])
  }

  const projection = clamp(
    ((point.x - start[0]) * dx + (point.y - start[1]) * dy) / lengthSquared,
    0,
    1,
  )
  const projectedX = start[0] + dx * projection
  const projectedY = start[1] + dy * projection

  return Math.hypot(point.x - projectedX, point.y - projectedY)
}

function getViewportBounds(): ViewportBounds {
  if (typeof window === 'undefined') {
    return {
      width: PANEL_DEFAULT_WIDTH + PANEL_MARGIN * 2,
      height: PANEL_DEFAULT_HEIGHT + PANEL_MARGIN * 2,
    }
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function getPanelSizeLimits(bounds: ViewportBounds) {
  const maxWidth = Math.max(1, bounds.width - PANEL_MARGIN * 2)
  const maxHeight = Math.max(1, bounds.height - PANEL_MARGIN * 2)

  return {
    maxHeight,
    maxWidth,
    minHeight: Math.min(PANEL_MIN_HEIGHT, maxHeight),
    minWidth: Math.min(PANEL_MIN_WIDTH, maxWidth),
  }
}

function constrainPanelRect(rect: PanelRect, bounds: ViewportBounds): PanelRect {
  const { minWidth, maxWidth, minHeight, maxHeight } = getPanelSizeLimits(bounds)
  const width = clamp(rect.width, minWidth, maxWidth)
  const height = clamp(rect.height, minHeight, maxHeight)
  const x = clamp(rect.x, PANEL_MARGIN, Math.max(PANEL_MARGIN, bounds.width - PANEL_MARGIN - width))
  const y = clamp(
    rect.y,
    PANEL_MARGIN,
    Math.max(PANEL_MARGIN, bounds.height - PANEL_MARGIN - height),
  )

  return { x, y, width, height }
}

function getPanelPositionRatios(rect: PanelRect, bounds: ViewportBounds) {
  const availableX = Math.max(bounds.width - rect.width - PANEL_MARGIN * 2, 0)
  const availableY = Math.max(bounds.height - rect.height - PANEL_MARGIN * 2, 0)

  return {
    xRatio: availableX > 0 ? (rect.x - PANEL_MARGIN) / availableX : 0.5,
    yRatio: availableY > 0 ? (rect.y - PANEL_MARGIN) / availableY : 0.5,
  }
}

function adaptPanelRectToBounds(
  rect: PanelRect,
  previousBounds: ViewportBounds,
  nextBounds: ViewportBounds,
): PanelRect {
  const normalizedRect = constrainPanelRect(rect, previousBounds)
  const { xRatio, yRatio } = getPanelPositionRatios(normalizedRect, previousBounds)
  const { minWidth, maxWidth, minHeight, maxHeight } = getPanelSizeLimits(nextBounds)
  const width = clamp(normalizedRect.width, minWidth, maxWidth)
  const height = clamp(normalizedRect.height, minHeight, maxHeight)
  const availableX = Math.max(nextBounds.width - width - PANEL_MARGIN * 2, 0)
  const availableY = Math.max(nextBounds.height - height - PANEL_MARGIN * 2, 0)

  return constrainPanelRect(
    {
      x: PANEL_MARGIN + availableX * xRatio,
      y: PANEL_MARGIN + availableY * yRatio,
      width,
      height,
    },
    nextBounds,
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidPanelRect(value: unknown): value is PanelRect {
  return (
    typeof value === 'object' &&
    value !== null &&
    isFiniteNumber((value as PanelRect).x) &&
    isFiniteNumber((value as PanelRect).y) &&
    isFiniteNumber((value as PanelRect).width) &&
    isFiniteNumber((value as PanelRect).height)
  )
}

function isValidViewportBounds(value: unknown): value is ViewportBounds {
  return (
    typeof value === 'object' &&
    value !== null &&
    isFiniteNumber((value as ViewportBounds).width) &&
    isFiniteNumber((value as ViewportBounds).height)
  )
}

function readPersistedPanelLayout(currentBounds: ViewportBounds): PanelRect | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawLayout = window.localStorage.getItem(FLOORPLAN_PANEL_LAYOUT_STORAGE_KEY)
    if (!rawLayout) {
      return null
    }

    const parsedLayout = JSON.parse(rawLayout) as Partial<PersistedPanelLayout>
    if (!(isValidPanelRect(parsedLayout.rect) && isValidViewportBounds(parsedLayout.viewport))) {
      return null
    }

    return adaptPanelRectToBounds(parsedLayout.rect, parsedLayout.viewport, currentBounds)
  } catch {
    return null
  }
}

function writePersistedPanelLayout(layout: PersistedPanelLayout) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(FLOORPLAN_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

function getInitialPanelRect(bounds: ViewportBounds): PanelRect {
  return constrainPanelRect(
    {
      x: bounds.width - PANEL_DEFAULT_WIDTH - PANEL_MARGIN,
      y: bounds.height - PANEL_DEFAULT_HEIGHT - PANEL_DEFAULT_BOTTOM_OFFSET,
      width: PANEL_DEFAULT_WIDTH,
      height: PANEL_DEFAULT_HEIGHT,
    },
    bounds,
  )
}

function movePanelRect(
  initialRect: PanelRect,
  dx: number,
  dy: number,
  bounds: ViewportBounds,
): PanelRect {
  return constrainPanelRect(
    {
      ...initialRect,
      x: initialRect.x + dx,
      y: initialRect.y + dy,
    },
    bounds,
  )
}

function resizePanelRect(
  initialRect: PanelRect,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  bounds: ViewportBounds,
): PanelRect {
  const right = initialRect.x + initialRect.width
  const bottom = initialRect.y + initialRect.height

  let x = initialRect.x
  let y = initialRect.y
  let width = initialRect.width
  let height = initialRect.height

  if (direction.includes('e')) width = initialRect.width + dx
  if (direction.includes('s')) height = initialRect.height + dy
  if (direction.includes('w')) width = initialRect.width - dx
  if (direction.includes('n')) height = initialRect.height - dy

  const maxWidth = Math.max(PANEL_MIN_WIDTH, bounds.width - PANEL_MARGIN * 2)
  const maxHeight = Math.max(PANEL_MIN_HEIGHT, bounds.height - PANEL_MARGIN * 2)
  width = clamp(width, PANEL_MIN_WIDTH, maxWidth)
  height = clamp(height, PANEL_MIN_HEIGHT, maxHeight)

  if (direction.includes('w')) {
    x = right - width
  }
  if (direction.includes('n')) {
    y = bottom - height
  }

  x = clamp(x, PANEL_MARGIN, Math.max(PANEL_MARGIN, bounds.width - PANEL_MARGIN - width))
  y = clamp(y, PANEL_MARGIN, Math.max(PANEL_MARGIN, bounds.height - PANEL_MARGIN - height))

  if (direction.includes('w')) {
    width = right - x
  } else {
    width = Math.min(width, bounds.width - PANEL_MARGIN - x)
  }

  if (direction.includes('n')) {
    height = bottom - y
  } else {
    height = Math.min(height, bounds.height - PANEL_MARGIN - y)
  }

  return constrainPanelRect({ x, y, width, height }, bounds)
}

function formatPolygonPoints(points: Point2D[]): string {
  return points
    .map((point) => {
      const svgPoint = toSvgPoint(point)
      return `${svgPoint.x},${svgPoint.y}`
    })
    .join(' ')
}

function formatPolygonPath(points: Point2D[], holes: Point2D[][] = []): string {
  const formatSubpath = (subpathPoints: Point2D[]) => {
    const [firstPoint, ...restPoints] = subpathPoints
    if (!firstPoint) {
      return null
    }

    const firstSvgPoint = toSvgPoint(firstPoint)

    return [
      `M ${firstSvgPoint.x} ${firstSvgPoint.y}`,
      ...restPoints.map((point) => {
        const svgPoint = toSvgPoint(point)
        return `L ${svgPoint.x} ${svgPoint.y}`
      }),
      'Z',
    ].join(' ')
  }

  return [points, ...holes].map(formatSubpath).filter(Boolean).join(' ')
}

function toFloorplanPolygon(points: Array<[number, number]>): Point2D[] {
  return points.map(([x, y]) => ({ x, y }))
}

function isPointInsidePolygonWithHoles(
  point: Point2D,
  polygon: Point2D[],
  holes: Point2D[][] = [],
) {
  return (
    isPointInsidePolygon(point, polygon) && !holes.some((hole) => isPointInsidePolygon(point, hole))
  )
}

function isPointNearPlanPoint(a: WallPlanPoint, b: WallPlanPoint, threshold = 0.25) {
  return Math.abs(a[0] - b[0]) < threshold && Math.abs(a[1] - b[1]) < threshold
}

function calculatePolygonSnapPoint(
  lastPoint: WallPlanPoint,
  currentPoint: WallPlanPoint,
): WallPlanPoint {
  const [x1, y1] = lastPoint
  const [x, y] = currentPoint
  const dx = x - x1
  const dy = y - y1
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  const horizontalDist = absDy
  const verticalDist = absDx
  const diagonalDist = Math.abs(absDx - absDy)
  const minDist = Math.min(horizontalDist, verticalDist, diagonalDist)

  if (minDist === diagonalDist) {
    const diagonalLength = Math.min(absDx, absDy)
    return [x1 + Math.sign(dx) * diagonalLength, y1 + Math.sign(dy) * diagonalLength]
  }

  if (minDist === horizontalDist) {
    return [x, y1]
  }

  return [x1, y]
}

function snapPolygonDraftPoint({
  point,
  start,
  angleSnap,
}: {
  point: WallPlanPoint
  start?: WallPlanPoint
  angleSnap: boolean
}): WallPlanPoint {
  const snappedPoint: WallPlanPoint = [snapToHalf(point[0]), snapToHalf(point[1])]

  if (!(start && angleSnap)) {
    return snappedPoint
  }

  return calculatePolygonSnapPoint(start, snappedPoint)
}

function pointMatchesWallPlanPoint(
  point: Point2D | undefined,
  planPoint: WallPlanPoint,
  epsilon = 1e-6,
): boolean {
  if (!point) {
    return false
  }

  return Math.abs(point.x - planPoint[0]) <= epsilon && Math.abs(point.y - planPoint[1]) <= epsilon
}

function getWallHoverSidePaths(polygon: Point2D[], wall: WallNode): [string, string] | null {
  if (polygon.length < 4) {
    return null
  }

  const startRight = polygon[0]
  const endRight = polygon[1]
  const hasEndCenterPoint = pointMatchesWallPlanPoint(polygon[2], wall.end)
  const endLeft = polygon[hasEndCenterPoint ? 3 : 2]
  const lastPoint = polygon[polygon.length - 1]
  const hasStartCenterPoint = pointMatchesWallPlanPoint(lastPoint, wall.start)
  const startLeft = polygon[hasStartCenterPoint ? polygon.length - 2 : polygon.length - 1]

  if (!(startRight && endRight && endLeft && startLeft)) {
    return null
  }

  const svgStartRight = toSvgPoint(startRight)
  const svgEndRight = toSvgPoint(endRight)
  const svgStartLeft = toSvgPoint(startLeft)
  const svgEndLeft = toSvgPoint(endLeft)

  return [
    `M ${svgStartRight.x} ${svgStartRight.y} L ${svgEndRight.x} ${svgEndRight.y}`,
    `M ${svgStartLeft.x} ${svgStartLeft.y} L ${svgEndLeft.x} ${svgEndLeft.y}`,
  ]
}

function buildDraftWall(levelId: string, start: WallPlanPoint, end: WallPlanPoint, thickness?: number): WallNode {
  return {
    object: 'node',
    id: 'wall_draft' as WallNode['id'],
    type: 'wall',
    name: '墙体草图',
    parentId: levelId,
    visible: true,
    metadata: {},
    children: [],
    start,
    end,
    thickness,
    frontSide: 'unknown',
    backSide: 'unknown',
  }
}

function pointsEqual(a: WallPlanPoint, b: WallPlanPoint): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

function polygonsEqual(a: WallPlanPoint[], b: Array<[number, number]>): boolean {
  return (
    a.length === b.length &&
    a.every((point, index) => {
      const otherPoint = b[index]
      if (!otherPoint) {
        return false
      }

      return pointsEqual(point, otherPoint)
    })
  )
}

function buildWallEndpointDraft(
  wallId: WallNode['id'],
  endpoint: WallEndpoint,
  fixedPoint: WallPlanPoint,
  movingPoint: WallPlanPoint,
): WallEndpointDraft {
  return {
    wallId,
    endpoint,
    start: endpoint === 'start' ? movingPoint : fixedPoint,
    end: endpoint === 'end' ? movingPoint : fixedPoint,
  }
}

function buildWallWithUpdatedEndpoints(
  wall: WallNode,
  start: WallPlanPoint,
  end: WallPlanPoint,
): WallNode {
  return {
    ...wall,
    start,
    end,
  }
}

function getFloorplanWallThickness(wall: WallNode): number {
  const baseThickness = wall.thickness ?? 0.1
  const scaledThickness = baseThickness * FLOORPLAN_WALL_THICKNESS_SCALE

  return Math.min(
    baseThickness + FLOORPLAN_MAX_EXTRA_THICKNESS,
    Math.max(baseThickness, scaledThickness, FLOORPLAN_MIN_VISIBLE_WALL_THICKNESS),
  )
}

function getFloorplanWall(wall: WallNode): WallNode {
  return {
    ...wall,
    // Slightly exaggerate thin walls so the 2D blueprint reads clearly without drifting far from BIM.
    thickness: getFloorplanWallThickness(wall),
  }
}

type WallMeasurementOverlay = {
  wallId: WallNode['id']
  dimensionLineEnd: { x1: number; y1: number; x2: number; y2: number }
  dimensionLineStart: { x1: number; y1: number; x2: number; y2: number }
  extensionStart: { x1: number; y1: number; x2: number; y2: number }
  extensionEnd: { x1: number; y1: number; x2: number; y2: number }
  label: string
  labelX: number
  labelY: number
  labelAngleDeg: number
  isSelected?: boolean
}

function formatMeasurement(value: number, unit: 'metric' | 'imperial') {
  if (unit === 'imperial') {
    const feet = value * 3.280_84
    const wholeFeet = Math.floor(feet)
    const inches = Math.round((feet - wholeFeet) * 12)
    if (inches === 12) return `${wholeFeet + 1}'0"`
    return `${wholeFeet}'${inches}"`
  }
  return `${Number.parseFloat(value.toFixed(2))}m`
}

function getPolygonAreaAndCentroid(polygon: Point2D[]) {
  let cx = 0
  let cy = 0
  let area = 0

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p1 = polygon[j]!
    const p2 = polygon[i]!
    const f = p1.x * p2.y - p2.x * p1.y
    cx += (p1.x + p2.x) * f
    cy += (p1.y + p2.y) * f
    area += f
  }

  area /= 2

  if (Math.abs(area) < 1e-9) {
    return { area: 0, centroid: polygon[0] ?? { x: 0, y: 0 } }
  }

  cx /= 6 * area
  cy /= 6 * area

  return { area: Math.abs(area), centroid: { x: cx, y: cy } }
}

function getSlabArea(polygon: Point2D[], holes: Point2D[][]) {
  const outer = getPolygonAreaAndCentroid(polygon)
  let totalArea = outer.area
  for (const hole of holes) {
    totalArea -= getPolygonAreaAndCentroid(hole).area
  }
  return { area: Math.max(0, totalArea), centroid: outer.centroid }
}

function formatArea(areaSqM: number, unit: 'metric' | 'imperial') {
  if (unit === 'imperial') {
    const areaSqFt = areaSqM * 10.763_910_4
    return (
      <>
        {Math.round(areaSqFt).toLocaleString()} ft
        <tspan baselineShift="super" fontSize="0.75em">
          2
        </tspan>
      </>
    )
  }
  return (
    <>
      {Number.parseFloat(areaSqM.toFixed(1))} m
      <tspan baselineShift="super" fontSize="0.75em">
        2
      </tspan>
    </>
  )
}

function FloorplanMeasurementLine({
  palette,
  segment,
  isSelected,
}: {
  palette: FloorplanPalette
  segment: { x1: number; y1: number; x2: number; y2: number }
  isSelected?: boolean
}) {
  const lineOpacity = isSelected
    ? FLOORPLAN_MEASUREMENT_LINE_OPACITY
    : FLOORPLAN_MEASUREMENT_LINE_OPACITY * 0.4
  const outlineOpacity = isSelected
    ? FLOORPLAN_MEASUREMENT_LINE_OUTLINE_OPACITY
    : FLOORPLAN_MEASUREMENT_LINE_OUTLINE_OPACITY * 0.4

  return (
    <>
      <line
        shapeRendering="geometricPrecision"
        stroke={palette.surface}
        strokeLinecap="round"
        strokeOpacity={outlineOpacity}
        strokeWidth={FLOORPLAN_MEASUREMENT_LINE_OUTLINE_WIDTH}
        vectorEffect="non-scaling-stroke"
        x1={segment.x1}
        x2={segment.x2}
        y1={segment.y1}
        y2={segment.y2}
      />
      <line
        shapeRendering="geometricPrecision"
        stroke={palette.measurementStroke}
        strokeLinecap="round"
        strokeOpacity={lineOpacity}
        strokeWidth={FLOORPLAN_MEASUREMENT_LINE_WIDTH}
        vectorEffect="non-scaling-stroke"
        x1={segment.x1}
        x2={segment.x2}
        y1={segment.y1}
        y2={segment.y2}
      />
    </>
  )
}

function getWallMeasurementOverlay(
  wall: WallNode,
  centerX: number,
  centerZ: number,
  unit: 'metric' | 'imperial',
): WallMeasurementOverlay | null {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)

  if (length < 0.1) {
    return null
  }

  const nx = -dz / length
  const nz = dx / length
  const midX = (wall.start[0] + wall.end[0]) / 2
  const midZ = (wall.start[1] + wall.end[1]) / 2
  const cx = midX - centerX
  const cz = midZ - centerZ
  const dot = cx * nx + cz * nz
  const outX = dot >= 0 ? nx : -nx
  const outZ = dot >= 0 ? nz : -nz
  const label = formatMeasurement(length, unit)
  const dimensionLine = {
    x1: toSvgX(wall.start[0] + outX * FLOORPLAN_MEASUREMENT_OFFSET),
    y1: toSvgY(wall.start[1] + outZ * FLOORPLAN_MEASUREMENT_OFFSET),
    x2: toSvgX(wall.end[0] + outX * FLOORPLAN_MEASUREMENT_OFFSET),
    y2: toSvgY(wall.end[1] + outZ * FLOORPLAN_MEASUREMENT_OFFSET),
  }

  const extensionStart = {
    x1: toSvgX(wall.start[0]),
    y1: toSvgY(wall.start[1]),
    x2: toSvgX(
      wall.start[0] +
        outX * (FLOORPLAN_MEASUREMENT_OFFSET + FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT),
    ),
    y2: toSvgY(
      wall.start[1] +
        outZ * (FLOORPLAN_MEASUREMENT_OFFSET + FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT),
    ),
  }

  const extensionEnd = {
    x1: toSvgX(wall.end[0]),
    y1: toSvgY(wall.end[1]),
    x2: toSvgX(
      wall.end[0] +
        outX * (FLOORPLAN_MEASUREMENT_OFFSET + FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT),
    ),
    y2: toSvgY(
      wall.end[1] +
        outZ * (FLOORPLAN_MEASUREMENT_OFFSET + FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT),
    ),
  }

  const svgDx = dimensionLine.x2 - dimensionLine.x1
  const svgDy = dimensionLine.y2 - dimensionLine.y1
  const svgLength = Math.hypot(svgDx, svgDy)
  let labelAngleDeg = (Math.atan2(svgDy, svgDx) * 180) / Math.PI

  if (labelAngleDeg > 90) {
    labelAngleDeg -= 180
  } else if (labelAngleDeg <= -90) {
    labelAngleDeg += 180
  }

  if (svgLength < 1e-6) {
    return null
  }

  const dirSvgX = svgDx / svgLength
  const dirSvgY = svgDy / svgLength
  const labelGapHalf = Math.min(
    FLOORPLAN_MEASUREMENT_LABEL_GAP / 2,
    Math.max(0, svgLength / 2 - FLOORPLAN_MEASUREMENT_LABEL_LINE_PADDING),
  )
  const labelX = (dimensionLine.x1 + dimensionLine.x2) / 2
  const labelY = (dimensionLine.y1 + dimensionLine.y2) / 2
  const dimensionLineStart = {
    x1: dimensionLine.x1,
    y1: dimensionLine.y1,
    x2: labelX - dirSvgX * labelGapHalf,
    y2: labelY - dirSvgY * labelGapHalf,
  }
  const dimensionLineEnd = {
    x1: labelX + dirSvgX * labelGapHalf,
    y1: labelY + dirSvgY * labelGapHalf,
    x2: dimensionLine.x2,
    y2: dimensionLine.y2,
  }

  return {
    wallId: wall.id,
    dimensionLineEnd,
    dimensionLineStart,
    extensionStart,
    extensionEnd,
    label,
    labelX,
    labelY,
    labelAngleDeg,
  }
}

function getOpeningFootprint(wall: WallNode, node: WindowNode | DoorNode): Point2D[] {
  const [x1, z1] = wall.start
  const [x2, z2] = wall.end

  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.sqrt(dx * dx + dz * dz)

  if (length < 1e-9) {
    return []
  }

  const dirX = dx / length
  const dirZ = dz / length

  const perpX = -dirZ
  const perpZ = dirX

  const distance = node.position[0]
  const width = node.width
  const depth = wall.thickness ?? 0.1

  const cx = x1 + dirX * distance
  const cz = z1 + dirZ * distance

  const halfWidth = width / 2
  const halfDepth = depth / 2

  return [
    { x: cx - dirX * halfWidth + perpX * halfDepth, y: cz - dirZ * halfWidth + perpZ * halfDepth },
    { x: cx + dirX * halfWidth + perpX * halfDepth, y: cz + dirZ * halfWidth + perpZ * halfDepth },
    { x: cx + dirX * halfWidth - perpX * halfDepth, y: cz + dirZ * halfWidth - perpZ * halfDepth },
    { x: cx - dirX * halfWidth - perpX * halfDepth, y: cz - dirZ * halfWidth - perpZ * halfDepth },
  ]
}

function getOpeningCenterLine(polygon: Point2D[]) {
  if (polygon.length < 4) {
    return null
  }

  const [p1, p2, p3, p4] = polygon

  return {
    start: {
      x: (p1!.x + p4!.x) / 2,
      y: (p1!.y + p4!.y) / 2,
    },
    end: {
      x: (p2!.x + p3!.x) / 2,
      y: (p2!.y + p3!.y) / 2,
    },
  }
}

function normalizeGridCoordinate(value: number): number {
  return Number(value.toFixed(GRID_COORDINATE_PRECISION))
}

function isGridAligned(value: number, step: number): boolean {
  if (!(Number.isFinite(step) && step > 0)) {
    return false
  }

  const normalizedValue = normalizeGridCoordinate(value / step)
  return Math.abs(normalizedValue - Math.round(normalizedValue)) < 1e-4
}

// Keep visible grid spacing above a minimum pixel size so zooming stays evenly distributed.
function getVisibleGridSteps(
  viewportWidth: number,
  surfaceWidth: number,
): {
  minorStep: number
  majorStep: number
} {
  const pixelsPerUnit = surfaceWidth / Math.max(viewportWidth, Number.EPSILON)
  let minorStep = WALL_GRID_STEP

  while (minorStep * pixelsPerUnit < MIN_GRID_SCREEN_SPACING) {
    minorStep *= 2
  }

  return {
    minorStep,
    majorStep: Math.max(MAJOR_GRID_STEP, minorStep * 2),
  }
}

function buildGridPath(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  step: number,
  options?: {
    excludeStep?: number
  },
): string {
  if (!(Number.isFinite(step) && step > 0)) {
    return ''
  }

  const commands: string[] = []
  const startXIndex = Math.floor(minX / step)
  const endXIndex = Math.ceil(maxX / step)
  const startYIndex = Math.floor(minY / step)
  const endYIndex = Math.ceil(maxY / step)
  const gridMinX = normalizeGridCoordinate(minX)
  const gridMaxX = normalizeGridCoordinate(maxX)
  const gridMinY = normalizeGridCoordinate(minY)
  const gridMaxY = normalizeGridCoordinate(maxY)

  for (let index = startXIndex; index <= endXIndex; index += 1) {
    const x = index * step
    if (options?.excludeStep && isGridAligned(x, options.excludeStep)) {
      continue
    }

    const gridX = normalizeGridCoordinate(x)
    commands.push(`M ${gridX} ${gridMinY} L ${gridX} ${gridMaxY}`)
  }

  for (let index = startYIndex; index <= endYIndex; index += 1) {
    const y = index * step
    if (options?.excludeStep && isGridAligned(y, options.excludeStep)) {
      continue
    }

    const gridY = normalizeGridCoordinate(y)
    commands.push(`M ${gridMinX} ${gridY} L ${gridMaxX} ${gridY}`)
  }

  return commands.join(' ')
}

function findClosestWallPoint(
  point: WallPlanPoint,
  walls: WallNode[],
  maxDistance = 0.5,
): { wall: WallNode; point: WallPlanPoint; t: number; normal: [number, number, number] } | null {
  let best: {
    wall: WallNode
    point: WallPlanPoint
    t: number
    normal: [number, number, number]
  } | null = null
  let bestDistSq = maxDistance * maxDistance

  for (const wall of walls) {
    const [x1, z1] = wall.start
    const [x2, z2] = wall.end
    const dx = x2 - x1
    const dz = z2 - z1
    const lengthSq = dx * dx + dz * dz
    if (lengthSq < 1e-9) continue

    let t = ((point[0] - x1) * dx + (point[1] - z1) * dz) / lengthSq
    t = Math.max(0, Math.min(1, t))

    const px = x1 + t * dx
    const pz = z1 + t * dz

    const distSq = (point[0] - px) ** 2 + (point[1] - pz) ** 2
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      best = { wall, point: [px, pz], t, normal: [0, 0, 1] }
    }
  }

  return best
}

type GuideImageDimensions = {
  width: number
  height: number
}

function useResolvedAssetUrl(url: string) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!url) {
      setResolvedUrl(null)
      return
    }

    let cancelled = false
    setResolvedUrl(null)

    loadAssetUrl(url).then((nextUrl) => {
      if (!cancelled) {
        setResolvedUrl(nextUrl)
      }
    })

    return () => {
      cancelled = true
    }
  }, [url])

  return resolvedUrl
}

/**
 * 批量为多个 guide 解析 asset URL + 加载图片尺寸。
 * 返回一个 Map<guideId, GuideImageDimensions | null>。
 * 用于标定模式下计算多个 guide 的角点候选。
 */
function useGuidesDimensionsMap(
  guides: Array<{ id: string; url: string }>,
): Map<string, GuideImageDimensions | null> {
  const [map, setMap] = useState<Map<string, GuideImageDimensions | null>>(new Map())

  // Use stable deps to avoid infinite effect loops
  const idsKey = guides.map((g) => g.id).join('\u0001')
  const urlsKey = guides.map((g) => g.url).join('\u0001')

  useEffect(() => {
    if (guides.length === 0) {
      setMap(new Map())
      return
    }
    let cancelled = false
    const next = new Map<string, GuideImageDimensions | null>()
    for (const g of guides) next.set(g.id, null)
    setMap(next)

    for (const guide of guides) {
      if (!guide.url) continue
      loadAssetUrl(guide.url).then((resolvedUrl) => {
        if (cancelled || !resolvedUrl) return
        const img = new globalThis.Image()
        img.onload = () => {
          if (cancelled) return
          const w = img.naturalWidth || img.width
          const h = img.naturalHeight || img.height
          if (!(w > 0 && h > 0)) return
          setMap((prev) => {
            const copy = new Map(prev)
            copy.set(guide.id, { width: w, height: h })
            return copy
          })
        }
        img.onerror = () => {
          /* keep null */
        }
        img.src = resolvedUrl
      })
    }

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, urlsKey])

  return map
}

function useGuideImageDimensions(url: string | null) {
  const [dimensions, setDimensions] = useState<GuideImageDimensions | null>(null)

  useEffect(() => {
    if (!url) {
      setDimensions(null)
      return
    }

    let cancelled = false
    const image = new globalThis.Image()

    image.onload = () => {
      if (cancelled) {
        return
      }

      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height

      if (!(width > 0 && height > 0)) {
        setDimensions(null)
        return
      }

      setDimensions({ width, height })
    }

    image.onerror = () => {
      if (!cancelled) {
        setDimensions(null)
      }
    }

    image.src = url

    return () => {
      cancelled = true
    }
  }, [url])

  return dimensions
}

function FloorplanGuideImage({
  guide,
  isInteractive,
  isSelected,
  activeInteractionMode,
  onGuideSelect,
  onGuideTranslateStart,
}: {
  guide: GuideNode
  isInteractive: boolean
  isSelected: boolean
  activeInteractionMode: GuideInteractionMode | null
  onGuideSelect: (guideId: GuideNode['id']) => void
  onGuideTranslateStart: (guide: GuideNode, event: ReactPointerEvent<SVGRectElement>) => void
}) {
  const resolvedUrl = useResolvedAssetUrl(guide.url)
  const dimensions = useGuideImageDimensions(resolvedUrl)

  if (!(guide.opacity > 0 && guide.scale > 0 && resolvedUrl && dimensions)) {
    return null
  }

  const aspectRatio = dimensions.width / dimensions.height
  const planWidth = getGuideWidth(guide.scale)
  const planHeight = getGuideHeight(planWidth, aspectRatio)
  const centerX = toSvgX(guide.position[0])
  const centerY = toSvgY(guide.position[2])
  const rotationDeg = (-guide.rotation[1] * 180) / Math.PI

  return (
    <g
      opacity={clamp(guide.opacity / 100, 0, 1)}
      transform={`translate(${centerX} ${centerY}) rotate(${rotationDeg})`}
    >
      {isInteractive ? (
        <rect
          fill="transparent"
          height={planHeight}
          onClick={(event) => {
            event.stopPropagation()
            onGuideSelect(guide.id)
          }}
          onPointerDown={(event) => {
            if (event.button === 0) {
              event.stopPropagation()
              if (isSelected) {
                onGuideTranslateStart(guide, event)
              }
            }
          }}
          pointerEvents="all"
          style={{
            cursor:
              isSelected && activeInteractionMode === 'translate'
                ? 'grabbing'
                : isSelected
                  ? 'grab'
                  : 'pointer',
          }}
          width={planWidth}
          x={-planWidth / 2}
          y={-planHeight / 2}
        />
      ) : null}
      <image
        height={planHeight}
        href={resolvedUrl}
        pointerEvents="none"
        preserveAspectRatio="none"
        width={planWidth}
        x={-planWidth / 2}
        y={-planHeight / 2}
      />
    </g>
  )
}

const FloorplanGridLayer = memo(function FloorplanGridLayer({
  majorGridPath,
  minorGridPath,
  palette,
  showGrid,
}: {
  majorGridPath: string
  minorGridPath: string
  palette: FloorplanPalette
  showGrid: boolean
}) {
  if (!showGrid) {
    return null
  }

  return (
    <>
      <path
        d={minorGridPath}
        fill="none"
        opacity={palette.minorGridOpacity}
        shapeRendering="crispEdges"
        stroke={palette.minorGrid}
        strokeWidth="0.02"
        vectorEffect="non-scaling-stroke"
      />

      <path
        d={majorGridPath}
        fill="none"
        opacity={palette.majorGridOpacity}
        shapeRendering="crispEdges"
        stroke={palette.majorGrid}
        strokeWidth="0.04"
        vectorEffect="non-scaling-stroke"
      />
    </>
  )
})

/**
 * 参考层底图渲染 —— 把其它楼层的 guide 以半透明 + 去饱和方式叠在当前层下面。
 * 用于多层底图对齐，用户切到 Level 1 时能看见 Level 0 底图作为对齐参考。
 * 完全不可交互（pointerEvents: none），避免误操作改到其它层的底图。
 */
const FloorplanReferenceGuideLayer = memo(function FloorplanReferenceGuideLayer({
  guides,
}: {
  guides: GuideNode[]
}) {
  if (!guides.length) return null
  return (
    // 用 <g> 包一层实现全局变暗 + 灰度滤镜，不改 FloorplanGuideImage 本身
    <g
      opacity={0.45}
      pointerEvents="none"
      style={{ filter: 'grayscale(60%) contrast(0.85)' }}
    >
      {guides.map((guide) => (
        <FloorplanGuideImage
          activeInteractionMode={null}
          guide={guide}
          isInteractive={false}
          isSelected={false}
          key={`ref-${guide.id}`}
          onGuideSelect={() => {}}
          onGuideTranslateStart={() => {}}
        />
      ))}
    </g>
  )
})

const FloorplanGuideLayer = memo(function FloorplanGuideLayer({
  guides,
  isInteractive,
  selectedGuideId,
  activeGuideInteractionGuideId,
  activeGuideInteractionMode,
  onGuideSelect,
  onGuideTranslateStart,
}: {
  guides: GuideNode[]
  isInteractive: boolean
  selectedGuideId: GuideNode['id'] | null
  activeGuideInteractionGuideId: GuideNode['id'] | null
  activeGuideInteractionMode: GuideInteractionMode | null
  onGuideSelect: (guideId: GuideNode['id']) => void
  onGuideTranslateStart: (guide: GuideNode, event: ReactPointerEvent<SVGRectElement>) => void
}) {
  if (!guides.length) {
    return null
  }

  const orderedGuides =
    selectedGuideId && guides.some((guide) => guide.id === selectedGuideId)
      ? [
          ...guides.filter((guide) => guide.id !== selectedGuideId),
          guides.find((guide) => guide.id === selectedGuideId)!,
        ]
      : guides

  return (
    <>
      {orderedGuides.map((guide) => (
        <FloorplanGuideImage
          activeInteractionMode={
            activeGuideInteractionGuideId === guide.id ? activeGuideInteractionMode : null
          }
          guide={guide}
          isInteractive={isInteractive}
          isSelected={selectedGuideId === guide.id}
          key={guide.id}
          onGuideSelect={onGuideSelect}
          onGuideTranslateStart={onGuideTranslateStart}
        />
      ))}
    </>
  )
})

function FloorplanGuideSelectionOverlay({
  guide,
  isDarkMode,
  rotationModifierPressed,
  showHandles,
  onCornerHoverChange,
  onCornerPointerDown,
}: {
  guide: GuideNode | null
  isDarkMode: boolean
  rotationModifierPressed: boolean
  showHandles: boolean
  onCornerHoverChange: (corner: GuideCorner | null) => void
  onCornerPointerDown: (
    guide: GuideNode,
    dimensions: GuideImageDimensions,
    corner: GuideCorner,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
}) {
  const resolvedUrl = useResolvedAssetUrl(guide?.url ?? '')
  const dimensions = useGuideImageDimensions(resolvedUrl)

  if (!(guide && guide.opacity > 0 && guide.scale > 0 && resolvedUrl && dimensions)) {
    return null
  }

  const aspectRatio = dimensions.width / dimensions.height
  const planWidth = getGuideWidth(guide.scale)
  const planHeight = getGuideHeight(planWidth, aspectRatio)
  const centerX = toSvgX(guide.position[0])
  const centerY = toSvgY(guide.position[2])
  const rotationDeg = (-guide.rotation[1] * 180) / Math.PI
  const selectionStroke = isDarkMode ? '#ffffff' : '#09090b'
  const handleFill = isDarkMode ? '#ffffff' : '#09090b'
  const handleStroke = isDarkMode ? '#0a0e1b' : '#ffffff'

  return (
    <g transform={`translate(${centerX} ${centerY}) rotate(${rotationDeg})`}>
      <rect
        fill="none"
        height={planHeight}
        pointerEvents="none"
        stroke={selectionStroke}
        strokeDasharray="none"
        strokeLinejoin="round"
        strokeWidth={FLOORPLAN_GUIDE_SELECTION_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        width={planWidth}
        x={-planWidth / 2}
        y={-planHeight / 2}
      />

      {showHandles
        ? GUIDE_CORNERS.map((corner) => {
            const [x, y] = getGuideCornerLocalOffset(planWidth, planHeight, corner)

            return (
              <g key={corner}>
                <rect
                  fill={handleFill}
                  height={FLOORPLAN_GUIDE_HANDLE_SIZE}
                  pointerEvents="none"
                  rx={FLOORPLAN_GUIDE_HANDLE_SIZE * 0.22}
                  ry={FLOORPLAN_GUIDE_HANDLE_SIZE * 0.22}
                  stroke={handleStroke}
                  strokeWidth="0.04"
                  vectorEffect="non-scaling-stroke"
                  width={FLOORPLAN_GUIDE_HANDLE_SIZE}
                  x={x - FLOORPLAN_GUIDE_HANDLE_SIZE / 2}
                  y={y - FLOORPLAN_GUIDE_HANDLE_SIZE / 2}
                />
                <circle
                  cx={x}
                  cy={y}
                  fill="transparent"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onPointerDown={(event) => onCornerPointerDown(guide, dimensions, corner, event)}
                  onPointerEnter={() => onCornerHoverChange(corner)}
                  onPointerLeave={() => onCornerHoverChange(null)}
                  pointerEvents="all"
                  r={FLOORPLAN_GUIDE_HANDLE_HIT_RADIUS}
                  stroke="transparent"
                  strokeWidth={FLOORPLAN_GUIDE_HANDLE_HIT_RADIUS * 2}
                  style={{
                    cursor: rotationModifierPressed
                      ? getGuideRotateCursor(isDarkMode)
                      : getGuideResizeCursor(corner, -guide.rotation[1]),
                  }}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })
        : null}
    </g>
  )
}

function FloorplanGuideHandleHint({
  anchor,
  isDarkMode,
  isMacPlatform,
  rotationModifierPressed,
}: {
  anchor: GuideHandleHintAnchor | null
  isDarkMode: boolean
  isMacPlatform: boolean
  rotationModifierPressed: boolean
}) {
  if (!anchor) {
    return null
  }

  const primaryToneClass = isDarkMode
    ? 'text-white drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.5)]'
    : 'text-[#09090b] drop-shadow-[0_1px_1.5px_rgba(255,255,255,0.8)]'

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute z-20 select-none', primaryToneClass)}
      style={{
        left: anchor.x,
        top: anchor.y,
        transform: `translate(calc(-50% + ${anchor.directionX * 12}px), calc(-50% + ${anchor.directionY * 12}px))`,
      }}
    >
      <div className="flex flex-col gap-0.5">
        <div
          className={cn(
            'flex items-center gap-1.5 transition-opacity duration-150',
            rotationModifierPressed ? 'opacity-40' : 'opacity-100',
          )}
        >
          <span className="font-medium text-[11px] lowercase leading-none">resize</span>
          <Icon
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
            color="currentColor"
            icon="ph:mouse-left-click-fill"
          />
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 transition-opacity duration-150',
            rotationModifierPressed ? 'opacity-100' : 'opacity-40',
          )}
        >
          <span className="font-medium text-[11px] lowercase leading-none">rotate</span>
          {isMacPlatform ? (
            <Command aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          ) : (
            <span className="font-mono text-[10px] uppercase leading-none">ctrl</span>
          )}
          <Icon
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
            color="currentColor"
            icon="ph:mouse-left-click-fill"
          />
        </div>
      </div>
    </div>
  )
}

const FloorplanGeometryLayer = memo(function FloorplanGeometryLayer({
  canSelectSlabs,
  canSelectGeometry,
  hoveredOpeningId,
  hoveredWallId,
  junctionCapPolygons,
  onSlabDoubleClick,
  onSlabSelect,
  onOpeningDoubleClick,
  onOpeningHoverChange,
  onOpeningPointerDown,
  onOpeningSelect,
  onWallClick,
  onWallDoubleClick,
  onWallHoverChange,
  openingsPolygons,
  palette,
  selectedIdSet,
  slabPolygons,
  wallPolygons,
  unit,
}: {
  canSelectSlabs: boolean
  canSelectGeometry: boolean
  hoveredOpeningId: OpeningNode['id'] | null
  junctionCapPolygons: Array<{ key: string; points: string }>
  onSlabDoubleClick: (slab: SlabNode) => void
  onSlabSelect: (slabId: SlabNode['id'], event: ReactMouseEvent<SVGElement>) => void
  onOpeningDoubleClick: (opening: OpeningNode) => void
  onOpeningHoverChange: (openingId: OpeningNode['id'] | null) => void
  onOpeningPointerDown: (openingId: OpeningNode['id'], event: ReactPointerEvent<SVGElement>) => void
  onOpeningSelect: (openingId: OpeningNode['id'], event: ReactMouseEvent<SVGElement>) => void
  hoveredWallId: WallNode['id'] | null
  onWallClick: (wall: WallNode, event: ReactMouseEvent<SVGElement>) => void
  onWallDoubleClick: (wall: WallNode, event: ReactMouseEvent<SVGElement>) => void
  onWallHoverChange: (wallId: WallNode['id'] | null) => void
  openingsPolygons: OpeningPolygonEntry[]
  palette: FloorplanPalette
  selectedIdSet: ReadonlySet<string>
  slabPolygons: SlabPolygonEntry[]
  wallPolygons: WallPolygonEntry[]
  unit: 'metric' | 'imperial'
}) {
  let minX = Number.POSITIVE_INFINITY,
    maxX = Number.NEGATIVE_INFINITY,
    minZ = Number.POSITIVE_INFINITY,
    maxZ = Number.NEGATIVE_INFINITY
  for (const { wall } of wallPolygons) {
    minX = Math.min(minX, wall.start[0], wall.end[0])
    maxX = Math.max(maxX, wall.start[0], wall.end[0])
    minZ = Math.min(minZ, wall.start[1], wall.end[1])
    maxZ = Math.max(maxZ, wall.start[1], wall.end[1])
  }
  const centerX = minX === Number.POSITIVE_INFINITY ? 0 : (minX + maxX) / 2
  const centerZ = minZ === Number.POSITIVE_INFINITY ? 0 : (minZ + maxZ) / 2
  const wallMeasurements = wallPolygons.flatMap(({ wall }) => {
    const measurement = getWallMeasurementOverlay(wall, centerX, centerZ, unit)
    if (measurement) {
      measurement.isSelected = selectedIdSet.has(wall.id)
    }
    return measurement ? [measurement] : []
  })

  return (
    <>
      {slabPolygons.map(({ slab, polygon, holes, path }) => {
        const isSelected = selectedIdSet.has(slab.id)
        let slabLabel = null

        if (isSelected) {
          const { area, centroid } = getSlabArea(polygon, holes)
          if (area > 0) {
            slabLabel = (
              <text
                dominantBaseline="central"
                fill={palette.measurementStroke}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE}
                fontWeight="600"
                paintOrder="stroke"
                pointerEvents="none"
                stroke={palette.surface}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
                style={{ userSelect: 'none' }}
                textAnchor="middle"
                x={toSvgX(centroid.x)}
                y={toSvgY(centroid.y)}
              >
                {formatArea(area, unit)}
              </text>
            )
          }
        }

        return (
          <g key={slab.id}>
            <path
              clipRule="evenodd"
              d={path}
              fill={isSelected ? palette.selectedSlabFill : palette.slabFill}
              fillRule="evenodd"
              onClick={
                canSelectSlabs
                  ? (event) => {
                      event.stopPropagation()
                      onSlabSelect(slab.id, event)
                    }
                  : undefined
              }
              onDoubleClick={
                canSelectSlabs
                  ? (event) => {
                      event.stopPropagation()
                      onSlabDoubleClick(slab)
                    }
                  : undefined
              }
              pointerEvents={canSelectSlabs ? undefined : 'none'}
              stroke={isSelected ? palette.selectedStroke : palette.slabStroke}
              strokeOpacity={isSelected ? 0.92 : 0.84}
              strokeWidth="0.05"
              style={canSelectSlabs ? { cursor: EDITOR_CURSOR } : undefined}
              vectorEffect="non-scaling-stroke"
            />
            {slabLabel}
          </g>
        )
      })}

      {junctionCapPolygons.map(({ key, points }) => (
        <polygon
          fill={palette.wallFill}
          key={`jcap-${key}`}
          points={points}
          stroke="none"
          pointerEvents="none"
        />
      ))}

      {wallPolygons.map(({ wall, polygon, points }) => {
        const isSelected = selectedIdSet.has(wall.id)
        const isHovered = canSelectGeometry && hoveredWallId === wall.id
        const hoverStroke = isSelected ? palette.selectedStroke : palette.wallHoverStroke
        const hoverSidePaths = getWallHoverSidePaths(polygon, wall)

        // 根据墙种类取颜色（metadata.wallType）
        const wallTypeId = (wall.metadata as any)?.wallType as string | undefined
        const wallTypeColor = wallTypeId ? WALL_TYPE_BY_ID[wallTypeId as keyof typeof WALL_TYPE_BY_ID]?.color : undefined
        const fillColor = isSelected ? palette.selectedFill : (wallTypeColor ?? palette.wallFill)

        return (
          <g
            key={wall.id}
          >
            {hoverSidePaths?.map((pathData, index) => (
              <path
                d={pathData}
                fill="none"
                key={`glow-${index}`}
                pointerEvents="none"
                stroke={hoverStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={isSelected ? 0.22 : 0.16}
                strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
                style={{
                  opacity: isHovered ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hoverSidePaths?.map((pathData, index) => (
              <path
                d={pathData}
                fill="none"
                key={`ring-${index}`}
                pointerEvents="none"
                stroke={hoverStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={isSelected ? 0.6 : 0.48}
                strokeWidth={FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH}
                style={{
                  opacity: isHovered ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {canSelectGeometry && (
              <line
                onClick={(event) => {
                  event.stopPropagation()
                  onWallClick(wall, event)
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  onWallDoubleClick(wall, event)
                }}
                pointerEvents="stroke"
                stroke="transparent"
                strokeLinecap="round"
                strokeWidth={FLOORPLAN_WALL_HIT_STROKE_WIDTH}
                style={{ cursor: EDITOR_CURSOR }}
                vectorEffect="non-scaling-stroke"
                x1={toSvgX(wall.start[0])}
                x2={toSvgX(wall.end[0])}
                y1={toSvgY(wall.start[1])}
                y2={toSvgY(wall.end[1])}
              />
            )}
            <polygon
              fill={fillColor}
              onClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onWallClick(wall, event)
                    }
                  : undefined
              }
              onDoubleClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onWallDoubleClick(wall, event)
                    }
                  : undefined
              }
              points={points}
              stroke={isSelected ? 'none' : palette.wallStroke}
              strokeOpacity={1}
              strokeWidth="0.06"
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}

      {openingsPolygons.map(({ opening, polygon, points }) => {
        const isSelected = selectedIdSet.has(opening.id)
        const isHovered = canSelectGeometry && hoveredOpeningId === opening.id
        const isHighlighted = isHovered || isSelected
        const highlightStroke = isSelected ? palette.selectedStroke : palette.wallHoverStroke
        const detailStroke = isSelected ? palette.surface : palette.openingStroke
        const centerLine = getOpeningCenterLine(polygon)

        if (opening.type === 'window') {
          if (polygon.length < 4) return null
          if (!centerLine) return null
          const windowLineStartX = toSvgX(centerLine.start.x)
          const windowLineStartY = toSvgY(centerLine.start.y)
          const windowLineEndX = toSvgX(centerLine.end.x)
          const windowLineEndY = toSvgY(centerLine.end.y)

          return (
            <g
              key={opening.id}
              onClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onOpeningSelect(opening.id, event)
                    }
                  : undefined
              }
              onDoubleClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onOpeningDoubleClick(opening)
                    }
                  : undefined
              }
              onPointerDown={
                canSelectGeometry && isSelected
                  ? (event) => {
                      if (event.button === 0) {
                        onOpeningPointerDown(opening.id, event)
                      }
                    }
                  : undefined
              }
              onPointerEnter={
                canSelectGeometry
                  ? () => {
                      onWallHoverChange(null)
                      onOpeningHoverChange(opening.id)
                    }
                  : undefined
              }
              onPointerLeave={canSelectGeometry ? () => onOpeningHoverChange(null) : undefined}
              style={{ cursor: EDITOR_CURSOR }}
            >
              {canSelectGeometry && (
                <line
                  pointerEvents="stroke"
                  stroke="transparent"
                  strokeLinecap="round"
                  strokeWidth={FLOORPLAN_OPENING_HIT_STROKE_WIDTH}
                  vectorEffect="non-scaling-stroke"
                  x1={windowLineStartX}
                  x2={windowLineEndX}
                  y1={windowLineStartY}
                  y2={windowLineEndY}
                />
              )}
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isSelected ? 0.22 : 0.16}
                strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
                style={{
                  opacity: isHighlighted ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isSelected ? 0.6 : 0.48}
                strokeWidth={FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH}
                style={{
                  opacity: isHighlighted ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                fill={palette.openingFill}
                points={points}
                stroke={isSelected ? palette.selectedStroke : palette.openingStroke}
                strokeOpacity={1}
                strokeWidth={FLOORPLAN_OPENING_STROKE_WIDTH}
              />
              <line
                stroke={isSelected ? palette.selectedStroke : detailStroke}
                strokeWidth={FLOORPLAN_OPENING_DETAIL_STROKE_WIDTH}
                x1={windowLineStartX}
                x2={windowLineEndX}
                y1={windowLineStartY}
                y2={windowLineEndY}
              />
            </g>
          )
        }

        if (opening.type === 'door') {
          if (polygon.length < 4) return null
          if (!centerLine) return null
          const [p1, p2, p3, p4] = polygon
          const svgP1 = toSvgPoint(p1!)
          const svgP2 = toSvgPoint(p2!)
          const svgP3 = toSvgPoint(p3!)
          const svgP4 = toSvgPoint(p4!)
          const cx = (svgP1.x + svgP2.x + svgP3.x + svgP4.x) / 4
          const cy = (svgP1.y + svgP2.y + svgP3.y + svgP4.y) / 4

          const dirX = svgP2.x - svgP1.x
          const dirY = svgP2.y - svgP1.y
          const len = Math.sqrt(dirX * dirX + dirY * dirY)
          const nx = dirX / len
          const ny = dirY / len

          const px = -ny
          const py = nx

          const hingesSide = opening.hingesSide ?? 'left'
          const swingDirection = opening.swingDirection ?? 'inward'
          const width = opening.width
          const sweepFlag =
            hingesSide === 'left'
              ? swingDirection === 'inward'
                ? 0
                : 1
              : swingDirection === 'inward'
                ? 1
                : 0

          const hx = cx - nx * (width / 2) * (hingesSide === 'left' ? 1 : -1)
          const hy = cy - ny * (width / 2) * (hingesSide === 'left' ? 1 : -1)

          const ox = hx + px * width * (swingDirection === 'inward' ? 1 : -1)
          const oy = hy + py * width * (swingDirection === 'inward' ? 1 : -1)

          const ox2 = cx + nx * (width / 2) * (hingesSide === 'left' ? 1 : -1)
          const oy2 = cy + ny * (width / 2) * (hingesSide === 'left' ? 1 : -1)

          return (
            <g
              key={opening.id}
              onClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onOpeningSelect(opening.id, event)
                    }
                  : undefined
              }
              onDoubleClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onOpeningDoubleClick(opening)
                    }
                  : undefined
              }
              onPointerDown={
                canSelectGeometry && isSelected
                  ? (event) => {
                      if (event.button === 0) {
                        onOpeningPointerDown(opening.id, event)
                      }
                    }
                  : undefined
              }
              onPointerEnter={
                canSelectGeometry
                  ? () => {
                      onWallHoverChange(null)
                      onOpeningHoverChange(opening.id)
                    }
                  : undefined
              }
              onPointerLeave={canSelectGeometry ? () => onOpeningHoverChange(null) : undefined}
              style={{ cursor: EDITOR_CURSOR }}
            >
              {canSelectGeometry && (
                <line
                  pointerEvents="stroke"
                  stroke="transparent"
                  strokeLinecap="round"
                  strokeWidth={FLOORPLAN_OPENING_HIT_STROKE_WIDTH}
                  vectorEffect="non-scaling-stroke"
                  x1={toSvgX(centerLine.start.x)}
                  x2={toSvgX(centerLine.end.x)}
                  y1={toSvgY(centerLine.start.y)}
                  y2={toSvgY(centerLine.end.y)}
                />
              )}
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isSelected ? 0.22 : 0.16}
                strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
                style={{
                  opacity: isHighlighted ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isSelected ? 0.6 : 0.48}
                strokeWidth={FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH}
                style={{
                  opacity: isHighlighted ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                fill={palette.openingFill}
                points={points}
                stroke={isSelected ? palette.selectedStroke : palette.openingStroke}
                strokeOpacity={1}
                strokeWidth={FLOORPLAN_OPENING_STROKE_WIDTH}
              />
              <line
                stroke={isSelected ? palette.selectedStroke : detailStroke}
                strokeWidth={FLOORPLAN_OPENING_DETAIL_STROKE_WIDTH}
                x1={hx}
                x2={ox}
                y1={hy}
                y2={oy}
              />
              <path
                d={`M ${ox} ${oy} A ${width} ${width} 0 0 ${sweepFlag} ${ox2} ${oy2}`}
                fill="none"
                stroke={isSelected ? palette.selectedStroke : detailStroke}
                strokeDasharray="0.1 0.1"
                strokeWidth={FLOORPLAN_OPENING_DASHED_STROKE_WIDTH}
              />
            </g>
          )
        }

        return null
      })}

      {wallMeasurements.map((measurement) => (
        <g
          className="wall-dimension"
          key={`measurement-${measurement.wallId}`}
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          <FloorplanMeasurementLine
            isSelected={measurement.isSelected}
            palette={palette}
            segment={measurement.extensionStart}
          />
          <FloorplanMeasurementLine
            isSelected={measurement.isSelected}
            palette={palette}
            segment={measurement.dimensionLineStart}
          />
          <FloorplanMeasurementLine
            isSelected={measurement.isSelected}
            palette={palette}
            segment={measurement.dimensionLineEnd}
          />
          <FloorplanMeasurementLine
            isSelected={measurement.isSelected}
            palette={palette}
            segment={measurement.extensionEnd}
          />
          <text
            dominantBaseline="central"
            fill={palette.measurementStroke}
            fillOpacity={
              measurement.isSelected
                ? FLOORPLAN_MEASUREMENT_LABEL_OPACITY
                : FLOORPLAN_MEASUREMENT_LABEL_OPACITY * 0.4
            }
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE}
            fontWeight="600"
            paintOrder="stroke"
            stroke={palette.surface}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={measurement.isSelected ? 1 : 0.4}
            strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
            textAnchor="middle"
            transform={`rotate(${measurement.labelAngleDeg} ${measurement.labelX} ${measurement.labelY}) translate(0, -0.04)`}
            x={measurement.labelX}
            y={measurement.labelY}
          >
            {measurement.label}
          </text>
        </g>
      ))}
    </>
  )
})

const FloorplanSiteLayer = memo(function FloorplanSiteLayer({
  isEditing,
  sitePolygon,
}: {
  isEditing: boolean
  sitePolygon: SitePolygonEntry | null
}) {
  if (!sitePolygon) {
    return null
  }

  return (
    <polygon
      fill={FLOORPLAN_SITE_COLOR}
      fillOpacity={isEditing ? 0.12 : 0.08}
      pointerEvents="none"
      points={sitePolygon.points}
      stroke={FLOORPLAN_SITE_COLOR}
      strokeDasharray={isEditing ? '0.16 0.1' : undefined}
      strokeLinejoin="round"
      strokeOpacity={isEditing ? 0.92 : 0.72}
      strokeWidth={isEditing ? '0.08' : '0.06'}
      vectorEffect="non-scaling-stroke"
    />
  )
})

const FloorplanZoneLayer = memo(function FloorplanZoneLayer({
  canSelectZones,
  onZoneSelect,
  palette,
  selectedZoneId,
  zonePolygons,
}: {
  canSelectZones: boolean
  onZoneSelect: (zoneId: ZoneNodeType['id'], event: ReactMouseEvent<SVGElement>) => void
  palette: FloorplanPalette
  selectedZoneId: ZoneNodeType['id'] | null
  zonePolygons: ZonePolygonEntry[]
}) {
  return (
    <>
      {zonePolygons.map(({ zone, points }) => {
        const isSelected = selectedZoneId === zone.id

        return (
          <g key={zone.id}>
            <polygon
              fill={zone.color}
              fillOpacity={isSelected ? 0.28 : 0.16}
              pointerEvents="none"
              points={points}
              stroke={isSelected ? palette.selectedStroke : zone.color}
              strokeLinejoin="round"
              strokeOpacity={isSelected ? 0.96 : 0.72}
              strokeWidth={isSelected ? '0.08' : '0.05'}
              vectorEffect="non-scaling-stroke"
            />
            {canSelectZones && (
              <polygon
                fill="none"
                onClick={(event) => {
                  event.stopPropagation()
                  onZoneSelect(zone.id, event)
                }}
                pointerEvents="stroke"
                points={points}
                stroke="transparent"
                strokeLinejoin="round"
                strokeWidth={FLOORPLAN_WALL_HIT_STROKE_WIDTH}
                style={{ cursor: EDITOR_CURSOR }}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        )
      })}
    </>
  )
})

const FloorplanWallEndpointLayer = memo(function FloorplanWallEndpointLayer({
  endpointHandles,
  hoveredEndpointId,
  onWallEndpointPointerDown,
  onEndpointHoverChange,
  palette,
}: {
  endpointHandles: Array<{
    wall: WallNode
    endpoint: WallEndpoint
    point: WallPlanPoint
    isSelected: boolean
    isActive: boolean
  }>
  onWallEndpointPointerDown: (
    wall: WallNode,
    endpoint: WallEndpoint,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  hoveredEndpointId: string | null
  onEndpointHoverChange: (endpointId: string | null) => void
  palette: FloorplanPalette
}) {
  return (
    <>
      {endpointHandles.map(({ wall, endpoint, point, isSelected, isActive }) => {
        const endpointId = `${wall.id}:${endpoint}`
        const isHovered = hoveredEndpointId === endpointId
        const stroke =
          isSelected || isActive ? palette.endpointHandleActiveStroke : palette.endpointHandleStroke
        const hoverStroke =
          isSelected || isActive
            ? palette.endpointHandleActiveStroke
            : palette.endpointHandleHoverStroke
        const outerRadius = isActive ? 0.18 : isSelected ? 0.16 : 0.14
        const svgPoint = toSvgPlanPoint(point)

        return (
          <g
            key={endpointId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onEndpointHoverChange(endpointId)}
            onPointerLeave={() => onEndpointHoverChange(null)}
          >
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={outerRadius}
              stroke={hoverStroke}
              strokeOpacity={isActive ? 0.24 : 0.16}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_GLOW_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={outerRadius}
              stroke={hoverStroke}
              strokeOpacity={isActive ? 0.72 : 0.52}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_RING_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={isActive ? palette.endpointHandleActiveFill : palette.endpointHandleFill}
              fillOpacity={0.96}
              pointerEvents="none"
              r={outerRadius}
              stroke={stroke}
              strokeWidth="0.05"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={stroke}
              pointerEvents="none"
              r={isActive ? 0.08 : 0.06}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="transparent"
              onPointerDown={(event) => onWallEndpointPointerDown(wall, endpoint, event)}
              pointerEvents="all"
              r={outerRadius}
              stroke="transparent"
              strokeWidth={FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </>
  )
})

const FloorplanPolygonHandleLayer = memo(function FloorplanPolygonHandleLayer({
  hoveredHandleId,
  midpointHandles,
  onHandleHoverChange,
  onMidpointPointerDown,
  onVertexDoubleClick,
  onVertexPointerDown,
  palette,
  vertexHandles,
}: {
  vertexHandles: Array<{
    nodeId: string
    vertexIndex: number
    point: WallPlanPoint
    isActive: boolean
  }>
  midpointHandles: Array<{
    nodeId: string
    edgeIndex: number
    point: WallPlanPoint
  }>
  hoveredHandleId: string | null
  onHandleHoverChange: (handleId: string | null) => void
  onVertexPointerDown: (
    nodeId: string,
    vertexIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  onVertexDoubleClick: (
    nodeId: string,
    vertexIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  onMidpointPointerDown: (
    nodeId: string,
    edgeIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  palette: FloorplanPalette
}) {
  return (
    <>
      {vertexHandles.map(({ nodeId, vertexIndex, point, isActive }) => {
        const handleId = `${nodeId}:vertex:${vertexIndex}`
        const isHovered = hoveredHandleId === handleId
        const stroke = isActive ? palette.endpointHandleActiveStroke : palette.endpointHandleStroke
        const outerRadius = isActive ? 0.15 : 0.13
        const svgPoint = toSvgPlanPoint(point)

        return (
          <g
            key={handleId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onHandleHoverChange(handleId)}
            onPointerLeave={() => onHandleHoverChange(null)}
          >
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={outerRadius}
              stroke={stroke}
              strokeOpacity={0.18}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_GLOW_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={isActive ? palette.endpointHandleActiveFill : palette.endpointHandleFill}
              fillOpacity={0.96}
              pointerEvents="none"
              r={outerRadius}
              stroke={stroke}
              strokeWidth="0.045"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={stroke}
              pointerEvents="none"
              r={isActive ? 0.058 : 0.05}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="transparent"
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onVertexDoubleClick(nodeId, vertexIndex, event as any)
              }}
              onPointerDown={(event) => {
                onVertexPointerDown(nodeId, vertexIndex, event)
              }}
              pointerEvents="all"
              r={outerRadius}
              stroke="transparent"
              strokeWidth={FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}

      {midpointHandles.map(({ nodeId, edgeIndex, point }) => {
        const handleId = `${nodeId}:midpoint:${edgeIndex}`
        const isHovered = hoveredHandleId === handleId
        const stroke = isHovered ? palette.endpointHandleHoverStroke : palette.endpointHandleStroke
        const radius = isHovered ? 0.092 : 0.08
        const svgPoint = toSvgPlanPoint(point)

        return (
          <g
            key={handleId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onHandleHoverChange(handleId)}
            onPointerLeave={() => onHandleHoverChange(null)}
          >
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={radius + 0.03}
              stroke={stroke}
              strokeOpacity={0.16}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_RING_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={palette.surface}
              fillOpacity={0.94}
              pointerEvents="none"
              r={radius}
              stroke={stroke}
              strokeOpacity={0.9}
              strokeWidth="0.035"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={stroke}
              fillOpacity={0.82}
              pointerEvents="none"
              r="0.028"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="transparent"
              onPointerDown={(event) => onMidpointPointerDown(nodeId, edgeIndex, event)}
              pointerEvents="all"
              r={radius}
              stroke="transparent"
              strokeWidth={FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </>
  )
})

/**
 * CalibrationInputInline — 标定距离输入框（DOM 浮层，固定像素尺寸）
 * 定义在 FloorplanPanel 之前避免 HMR 引用失败
 */
function CalibrationInputInline() {
  const cal = useEditor((s: any) => s.calibration)
  const finishCalibration = useEditor((s: any) => s.finishCalibration)
  const cancelCalibration = useEditor((s: any) => s.cancelCalibration)
  const [inputValue, setInputValue] = useState('')

  if (!cal?.active) return null
  if (cal.points.length < 2 || cal.measuredDistance == null) return null

  const handleApply = () => {
    const v = parseFloat(inputValue)
    if (v > 0) {
      finishCalibration(v)
      setInputValue('')
    }
  }

  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-4 z-40 -translate-x-1/2"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/85 px-3 py-2 shadow-lg backdrop-blur-sm"
        style={{ minWidth: 260 }}
      >
        <span className="whitespace-nowrap text-[11px] text-white/70">
          图上 <span className="font-mono font-medium text-white">{cal.measuredDistance.toFixed(2)}</span>m 实际是
        </span>
        <input
          autoFocus
          className="h-7 w-20 rounded border border-white/20 bg-white/10 px-2 text-[12px] text-white outline-none focus:border-[#2D7FF9]"
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleApply()
            if (e.key === 'Escape') { cancelCalibration(); setInputValue('') }
          }}
          placeholder="米数"
          type="number"
          value={inputValue}
        />
        <span className="text-[11px] text-white/60">m</span>
        <button
          className="rounded bg-[#2D7FF9] px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[#2D7FF9]/90 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!inputValue || parseFloat(inputValue) <= 0}
          onClick={handleApply}
          type="button"
        >
          确定
        </button>
        <button
          className="rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => { cancelCalibration(); setInputValue('') }}
          type="button"
        >
          取消
        </button>
      </div>
    </div>
  )
}

// ── 罗盘组件 ─────────────────────────────────────────────────────────────────

function CompassSvg({ angle, size, labels }: { angle: number; size: number; labels?: boolean }) {
  const c = size / 2
  const tip = size * 0.1
  const mid = c
  const base = size * 0.9
  const hw = size * 0.13
  return (
    <svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <circle cx={c} cy={c} fill="none" r={c - 1.5} stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
      {labels && (
        <>
          <line stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" x1={c} x2={c} y1={3} y2={size - 3} />
          <line stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" x1={3} x2={size - 3} y1={c} y2={c} />
          {['E', 'S', 'W'].map((lbl, i) => {
            const a = (i + 1) * 90
            const rad = (a * Math.PI) / 180
            return (
              <text
                dominantBaseline="middle"
                fill="currentColor"
                fontSize={size * 0.14}
                fontWeight="600"
                key={lbl}
                opacity="0.4"
                textAnchor="middle"
                x={c + Math.sin(rad) * (c * 0.68)}
                y={c - Math.cos(rad) * (c * 0.68)}
              >
                {lbl}
              </text>
            )
          })}
        </>
      )}
      <g transform={`rotate(${angle}, ${c}, ${c})`}>
        <polygon fill="#f87171" opacity="0.92" points={`${c},${tip} ${c - hw},${mid} ${c + hw},${mid}`} />
        <polygon fill="currentColor" opacity="0.28" points={`${c},${base} ${c - hw},${mid} ${c + hw},${mid}`} />
        {labels && (
          <text
            dominantBaseline="middle"
            fill="#fca5a5"
            fontSize={size * 0.17}
            fontWeight="700"
            textAnchor="middle"
            x={c}
            y={tip + size * 0.12}
          >
            N
          </text>
        )}
      </g>
    </svg>
  )
}

/** 建筑朝向设置：显示在 2D 平面图右下角的罗盘按钮 */
function FloorplanCompass({
  levelNode,
  updateNode,
}: {
  levelNode: LevelNode | undefined
  updateNode: (id: AnyNodeId, data: Record<string, unknown>) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')

  if (!levelNode || levelNode.type !== 'level') return null
  const northAngle: number = (levelNode as any).northAngle ?? 0

  const commit = (deg: number) => {
    const norm = ((Math.round(deg) % 360) + 360) % 360
    updateNode(levelNode.id as AnyNodeId, { northAngle: norm } as Record<string, unknown>)
  }

  const PRESETS = [
    { label: '↑', deg: 0,   title: '北朝上 (0°)' },
    { label: '→', deg: 90,  title: '北朝右 (90°)' },
    { label: '↓', deg: 180, title: '北朝下 (180°)' },
    { label: '←', deg: 270, title: '北朝左 (270°)' },
  ]

  return (
    <Popover
      onOpenChange={(o) => { setIsOpen(o); if (o) setDraft(String(northAngle)) }}
      open={isOpen}
    >
      <PopoverTrigger asChild>
        <button
          className="pointer-events-auto absolute right-3 bottom-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white shadow backdrop-blur-sm transition-colors hover:bg-black/65"
          title={`建筑朝向 ${northAngle}°`}
          type="button"
        >
          <CompassSvg angle={northAngle} size={22} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-3" side="top">
        <div className="mb-2.5 font-semibold text-[13px] text-foreground">建筑朝向</div>
        <div className="mb-3 flex justify-center">
          <CompassSvg angle={northAngle} labels size={64} />
        </div>
        <div className="mb-2.5 flex gap-1">
          {PRESETS.map(({ label, deg, title }) => (
            <button
              className={cn(
                'flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors',
                northAngle === deg
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
              key={deg}
              onClick={() => commit(deg)}
              title={title}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            className="h-7 w-full rounded-md border border-input bg-background px-2 text-right text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
            max={359}
            min={0}
            onBlur={() => { const n = parseInt(draft); if (!isNaN(n)) commit(n) }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(draft); if (!isNaN(n)) commit(n) } }}
            type="number"
            value={draft}
          />
          <span className="shrink-0 text-muted-foreground text-[13px]">°</span>
        </div>
        <p className="mt-2 text-muted-foreground text-[11px] leading-relaxed">
          正北方向距平面图"上方"顺时针角度
        </p>
      </PopoverContent>
    </Popover>
  )
}

export function FloorplanPanel() {
  const viewportHostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panStateRef = useRef<PanState | null>(null)
  const guideInteractionRef = useRef<GuideInteractionState | null>(null)
  const guideTransformDraftRef = useRef<GuideTransformDraft | null>(null)
  const wallEndpointDragRef = useRef<WallEndpointDragState | null>(null)
  const siteBoundaryDraftRef = useRef<SiteBoundaryDraft | null>(null)
  const slabBoundaryDraftRef = useRef<SlabBoundaryDraft | null>(null)
  const zoneBoundaryDraftRef = useRef<ZoneBoundaryDraft | null>(null)
  const gestureScaleRef = useRef(1)
  const panelInteractionRef = useRef<PanelInteractionState | null>(null)
  const panelBoundsRef = useRef<ViewportBounds | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasUserAdjustedViewportRef = useRef(false)
  const previousLevelIdRef = useRef<string | null>(null)
  const levelId = useViewer((state) => state.selection.levelId)
  const buildingId = useViewer((state) => state.selection.buildingId)
  const selectedZoneId = useViewer((state) => state.selection.zoneId)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const setSelection = useViewer((state) => state.setSelection)
  const theme = useViewer((state) => state.theme)
  const unit = useViewer((state) => state.unit)
  const showGrid = useViewer((state) => state.showGrid)
  const showGuides = useViewer((state) => state.showGuides)
  const setShowGuides = useViewer((state) => state.setShowGuides)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)

  const isFloorplanHovered = useEditor((state) => state.isFloorplanHovered)
  const setFloorplanHovered = useEditor((state) => state.setFloorplanHovered)
  const selectedReferenceId = useEditor((state) => state.selectedReferenceId)
  const setSelectedReferenceId = useEditor((state) => state.setSelectedReferenceId)
  const setMode = useEditor((state) => state.setMode)
  const movingNode = useEditor((state) => state.movingNode)
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const setPhase = useEditor((state) => state.setPhase)
  const setMovingNode = useEditor((state) => state.setMovingNode)
  const structureLayer = useEditor((state) => state.structureLayer)
  const setStructureLayer = useEditor((state) => state.setStructureLayer)
  const setTool = useEditor((state) => state.setTool)
  const tool = useEditor((state) => state.tool)
  const calibrationActive = useEditor((state) => (state as any).calibration?.active ?? false)
  const levelAlignment = useEditor((state) => (state as any).levelAlignment)
  const activeWallTypeId = useEditor((state) => (state as any).wallType as string ?? 'interior')
  const levelAlignmentActive: boolean = levelAlignment?.active ?? false
  const deleteNode = useScene((state) => state.deleteNode)
  const updateNode = useScene((state) => state.updateNode)
  const levelNode = useScene((state) =>
    levelId ? (state.nodes[levelId] as LevelNode | undefined) : undefined,
  )
  const currentBuildingId =
    levelNode?.type === 'level' && levelNode.parentId
      ? (levelNode.parentId as BuildingNode['id'])
      : (buildingId as BuildingNode['id'] | null)
  const site = useScene((state) => {
    for (const rootNodeId of state.rootNodeIds) {
      const node = state.nodes[rootNodeId]
      if (node?.type === 'site') {
        return node as SiteNode
      }
    }

    return null
  })
  const floorplanLevels = useScene(
    useShallow((state) => {
      if (!currentBuildingId) {
        return [] as LevelNode[]
      }

      const buildingNode = state.nodes[currentBuildingId]
      if (!buildingNode || buildingNode.type !== 'building') {
        return [] as LevelNode[]
      }

      return buildingNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is LevelNode => node?.type === 'level')
        .sort((a, b) => a.level - b.level)
    }),
  )
  const walls = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as WallNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as WallNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is WallNode => node?.type === 'wall')
    }),
  )
  const openings = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as OpeningNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as OpeningNode[]
      }

      const nextWalls = nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is WallNode => node?.type === 'wall')

      return nextWalls.flatMap((wall) =>
        wall.children
          .map((childId) => state.nodes[childId])
          .filter((node): node is OpeningNode => node?.type === 'window' || node?.type === 'door'),
      )
    }),
  )
  const slabs = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as SlabNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as SlabNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is SlabNode => node?.type === 'slab')
    }),
  )
  const levelGuides = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as GuideNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as GuideNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is GuideNode => node?.type === 'guide')
    }),
  )
  // 参考层底图（只读、半透明）—— 用于多层底图对齐
  const referenceLevelId = useViewer((s) => s.referenceLevelId)
  const referenceGuides = useScene(
    useShallow((state) => {
      if (!referenceLevelId || referenceLevelId === levelId) {
        return [] as GuideNode[]
      }
      const refLevel = state.nodes[referenceLevelId]
      if (!refLevel || refLevel.type !== 'level') {
        return [] as GuideNode[]
      }
      return refLevel.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is GuideNode => node?.type === 'guide' && node.visible !== false)
    }),
  )
  // 参考层的墙体端点，供对齐模式吸附
  const referenceWalls = useScene(
    useShallow((state) => {
      if (!referenceLevelId || referenceLevelId === levelId) return [] as WallNode[]
      const refLevel = state.nodes[referenceLevelId as AnyNodeId]
      if (!refLevel || refLevel.type !== 'level') return [] as WallNode[]
      return refLevel.children
        .map((childId) => state.nodes[childId as AnyNodeId])
        .filter((node): node is WallNode => node?.type === 'wall')
    }),
  )
  const zones = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as ZoneNodeType[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as ZoneNodeType[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is ZoneNodeType => node?.type === 'zone')
    }),
  )

  const [draftStart, setDraftStart] = useState<WallPlanPoint | null>(null)
  const [draftEnd, setDraftEnd] = useState<WallPlanPoint | null>(null)
  // 最近一次 hover 吸附到的端点坐标 —— 用于 click 时的"preview 优先"确认
  const lastHoverEndpointRef = useRef<WallPlanPoint | null>(null)
  // 正交追踪命中状态 —— 画墙时光标跟某个端点水平/垂直对齐时填充，否则 null
  const [trackingHit, setTrackingHit] = useState<OrthogonalTrackingHit | null>(null)
  // 延长线追踪命中状态 —— 光标在某条已有墙的无限延长线上时填充
  const [extensionHit, setExtensionHit] = useState<ExtensionTrackingHit | null>(null)
  // 垂直追踪命中状态 —— 光标在某条墙端点的垂直方向时填充（拐角直角辅助线）
  const [perpendicularHit, setPerpendicularHit] = useState<WallPerpendicularHit | null>(null)
  const [slabDraftPoints, setSlabDraftPoints] = useState<WallPlanPoint[]>([])
  const [zoneDraftPoints, setZoneDraftPoints] = useState<WallPlanPoint[]>([])
  const [siteBoundaryDraft, setSiteBoundaryDraft] = useState<SiteBoundaryDraft | null>(null)
  const [siteVertexDragState, setSiteVertexDragState] = useState<SiteVertexDragState | null>(null)
  const [slabBoundaryDraft, setSlabBoundaryDraft] = useState<SlabBoundaryDraft | null>(null)
  const [slabVertexDragState, setSlabVertexDragState] = useState<SlabVertexDragState | null>(null)
  const [zoneBoundaryDraft, setZoneBoundaryDraft] = useState<ZoneBoundaryDraft | null>(null)
  const [zoneVertexDragState, setZoneVertexDragState] = useState<ZoneVertexDragState | null>(null)
  const [guideTransformDraft, setGuideTransformDraft] = useState<GuideTransformDraft | null>(null)
  const [cursorPoint, setCursorPoint] = useState<WallPlanPoint | null>(null)
  const [floorplanCursorPosition, setFloorplanCursorPosition] = useState<SvgPoint | null>(null)
  const [wallEndpointDraft, setWallEndpointDraft] = useState<WallEndpointDraft | null>(null)
  const [hoveredOpeningId, setHoveredOpeningId] = useState<OpeningNode['id'] | null>(null)
  const [hoveredWallId, setHoveredWallId] = useState<WallNode['id'] | null>(null)
  const [hoveredEndpointId, setHoveredEndpointId] = useState<string | null>(null)
  const [hoveredSiteHandleId, setHoveredSiteHandleId] = useState<string | null>(null)
  const [hoveredSlabHandleId, setHoveredSlabHandleId] = useState<string | null>(null)
  const [hoveredZoneHandleId, setHoveredZoneHandleId] = useState<string | null>(null)
  const [hoveredGuideCorner, setHoveredGuideCorner] = useState<GuideCorner | null>(null)
  const floorplanSelectionTool = useEditor((s) => s.floorplanSelectionTool)
  const setFloorplanSelectionTool = useEditor((s) => s.setFloorplanSelectionTool)
  const [floorplanMarqueeState, setFloorplanMarqueeState] = useState<FloorplanMarqueeState | null>(
    null,
  )
  const [shiftPressed, setShiftPressed] = useState(false)
  const [rotationModifierPressed, setRotationModifierPressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const [isMacPlatform, setIsMacPlatform] = useState(true)
  const [activeResizeDirection, setActiveResizeDirection] = useState<ResizeDirection | null>(null)
  const [panelRect, setPanelRect] = useState<PanelRect>({
    x: PANEL_MARGIN,
    y: PANEL_MARGIN,
    width: PANEL_DEFAULT_WIDTH,
    height: PANEL_DEFAULT_HEIGHT,
  })

  const [isPanelReady, setIsPanelReady] = useState(false)
  const [surfaceSize, setSurfaceSize] = useState({ width: 1, height: 1 })
  const [viewport, setViewport] = useState<FloorplanViewport | null>(null)
  const [alignSuccess, setAlignSuccess] = useState(false)
  const alignSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (structureLayer === 'zones' && floorplanSelectionTool === 'marquee') {
      setFloorplanSelectionTool('click')
    }
  }, [floorplanSelectionTool, structureLayer])

  useEffect(() => {
    setIsMacPlatform(navigator.platform.toUpperCase().includes('MAC'))
  }, [])

  const sitePolygonEntry = useMemo(() => {
    const polygonPoints = site?.polygon?.points
    if (!(site && polygonPoints)) {
      return null
    }

    const polygon = toFloorplanPolygon(polygonPoints)
    if (polygon.length < 3) {
      return null
    }

    return {
      site,
      polygon,
      points: formatPolygonPoints(polygon),
    }
  }, [site])
  const displaySitePolygon = useMemo(() => {
    if (!sitePolygonEntry) {
      return null
    }

    if (!(siteBoundaryDraft && siteBoundaryDraft.siteId === sitePolygonEntry.site.id)) {
      return sitePolygonEntry
    }

    const polygon = siteBoundaryDraft.polygon.map(toPoint2D)

    return {
      ...sitePolygonEntry,
      polygon,
      points: formatPolygonPoints(polygon),
    }
  }, [siteBoundaryDraft, sitePolygonEntry])
  const movingOpeningType =
    movingNode?.type === 'door' || movingNode?.type === 'window' ? movingNode.type : null

  const activeFloorplanToolConfig = useMemo(() => {
    if (movingOpeningType) {
      return structureTools.find((entry) => entry.id === movingOpeningType) ?? null
    }

    if (mode !== 'build' || !tool) {
      return null
    }

    if (tool === 'item' && catalogCategory) {
      return furnishTools.find((entry) => entry.catalogCategory === catalogCategory) ?? null
    }

    return structureTools.find((entry) => entry.id === tool) ?? null
  }, [catalogCategory, mode, movingOpeningType, tool])
  const activeFloorplanCursorIndicator = useMemo<FloorplanCursorIndicator | null>(() => {
    if (!activeFloorplanToolConfig) {
      return null
    }

    return {
      kind: 'asset',
      iconSrc: activeFloorplanToolConfig.iconSrc,
    }
  }, [activeFloorplanToolConfig])
  const visibleGuides = useMemo<GuideNode[]>(() => {
    if (!showGuides) {
      return []
    }

    return levelGuides.filter((guide) => guide.visible !== false)
  }, [levelGuides, showGuides])
  const guideById = useMemo(
    () => new Map(levelGuides.map((guide) => [guide.id, guide] as const)),
    [levelGuides],
  )
  const displayGuides = useMemo<GuideNode[]>(() => {
    if (!guideTransformDraft) {
      return visibleGuides
    }

    return visibleGuides.map((guide) =>
      guide.id === guideTransformDraft.guideId
        ? {
            ...guide,
            position: [
              guideTransformDraft.position[0],
              guide.position[1],
              guideTransformDraft.position[1],
            ] as [number, number, number],
            rotation: [guide.rotation[0], guideTransformDraft.rotation, guide.rotation[2]] as [
              number,
              number,
              number,
            ],
            scale: guideTransformDraft.scale,
          }
        : guide,
    )
  }, [guideTransformDraft, visibleGuides])

  // 始终预加载当前层所有 guide 的图片尺寸，不等待标定模式激活。
  // 原因：若只在 calibrationActive=true 时才开始加载，
  // 第二张底图在标定激活瞬间尺寸仍为 null，角点吸附候选集不完整。
  // 图片尺寸仅加载 naturalWidth/Height，代价极低，浏览器缓存命中后几乎无延迟。
  const calibrationGuideSpecs = useMemo(
    () => displayGuides.map((g) => ({ id: g.id, url: g.url })),
    [displayGuides],
  )
  const calibrationGuideDimensions = useGuidesDimensionsMap(calibrationGuideSpecs)

  // 计算所有 guide 的候选吸附点（中心 + 4 角），只在标定激活时构建
  const calibrationGuideAnchors = useMemo<Array<[number, number]>>(() => {
    if (!calibrationActive) return []
    const all: Array<[number, number]> = []
    for (const g of displayGuides) {
      const dims = calibrationGuideDimensions.get(g.id) ?? null
      all.push(...getGuideCalibrationAnchors(g, dims))
    }
    return all
  }, [calibrationActive, displayGuides, calibrationGuideDimensions])
  // 参考层底图尺寸——同样预加载，保证对齐模式下参考层角点可吸附
  const referenceGuideSpecs = useMemo(
    () => referenceGuides.map((g) => ({ id: g.id, url: g.url })),
    [referenceGuides],
  )
  const referenceGuideDimensions = useGuidesDimensionsMap(referenceGuideSpecs)

  // 对齐模式吸附候选集（预计算，mousemove 时直接遍历）
  // 参考层：墙体所有交点（L/T/X）+ 底图特征点（中心 + 4 角）
  const referenceAlignmentAnchors = useMemo<Array<[number, number]>>(() => {
    if (!levelAlignmentActive) return []
    return [
      ...getWallIntersections(referenceWalls),
      ...referenceGuides.flatMap((g) =>
        getGuideCalibrationAnchors(g, referenceGuideDimensions.get(g.id) ?? null),
      ),
    ]
  }, [levelAlignmentActive, referenceWalls, referenceGuides, referenceGuideDimensions])
  // 当前层：墙体所有交点 + 底图特征点
  const currentAlignmentAnchors = useMemo<Array<[number, number]>>(() => {
    if (!levelAlignmentActive) return []
    const guideAnchors: Array<[number, number]> = []
    for (const g of displayGuides) {
      guideAnchors.push(...getGuideCalibrationAnchors(g, calibrationGuideDimensions.get(g.id) ?? null))
    }
    return [...getWallIntersections(walls), ...guideAnchors]
  }, [levelAlignmentActive, walls, displayGuides, calibrationGuideDimensions])
  const selectedGuideId =
    selectedReferenceId && guideById.has(selectedReferenceId as GuideNode['id'])
      ? (selectedReferenceId as GuideNode['id'])
      : null
  const selectedGuide = useMemo(
    () => displayGuides.find((guide) => guide.id === selectedGuideId) ?? null,
    [displayGuides, selectedGuideId],
  )
  const selectedGuideResolvedUrl = useResolvedAssetUrl(selectedGuide?.url ?? '')
  const selectedGuideDimensions = useGuideImageDimensions(selectedGuideResolvedUrl)
  const activeGuideInteractionGuideId = guideTransformDraft
    ? (guideInteractionRef.current?.guideId ?? null)
    : null
  const activeGuideInteractionMode = guideTransformDraft
    ? (guideInteractionRef.current?.mode ?? null)
    : null
  const floorplanWalls = useMemo(() => walls.map(getFloorplanWall), [walls])
  const wallMiterData = useMemo(() => calculateLevelMiters(floorplanWalls), [floorplanWalls])
  const wallById = useMemo(() => new Map(walls.map((wall) => [wall.id, wall] as const)), [walls])
  const floorplanWallById = useMemo(
    () => new Map(floorplanWalls.map((wall) => [wall.id, wall] as const)),
    [floorplanWalls],
  )
  const displayWallById = useMemo(() => {
    if (!wallEndpointDraft) {
      return wallById
    }

    const wall = wallById.get(wallEndpointDraft.wallId)
    if (!wall) {
      return wallById
    }

    const nextWallById = new Map(wallById)
    nextWallById.set(
      wall.id,
      buildWallWithUpdatedEndpoints(wall, wallEndpointDraft.start, wallEndpointDraft.end),
    )

    return nextWallById
  }, [wallById, wallEndpointDraft])
  const displayFloorplanWallById = useMemo(() => {
    if (!wallEndpointDraft) {
      return floorplanWallById
    }

    const previewWall = displayWallById.get(wallEndpointDraft.wallId)
    if (!previewWall) {
      return floorplanWallById
    }

    const nextFloorplanWallById = new Map(floorplanWallById)
    nextFloorplanWallById.set(previewWall.id, getFloorplanWall(previewWall))
    return nextFloorplanWallById
  }, [displayWallById, floorplanWallById, wallEndpointDraft])
  // 拖动端点时，用包含 draft 位置的墙体重新计算所有墙角 miter
  const displayWallMiterData = useMemo(() => {
    if (!wallEndpointDraft) return wallMiterData
    const displayFloorplanWalls = Array.from(displayFloorplanWallById.values())
    return calculateLevelMiters(displayFloorplanWalls)
  }, [wallEndpointDraft, displayFloorplanWallById, wallMiterData])
  const wallPolygons = useMemo(
    () =>
      walls.map((wall) => {
        const floorplanWall = floorplanWallById.get(wall.id) ?? getFloorplanWall(wall)
        const polygon = getWallPlanFootprint(floorplanWall, wallMiterData)
        return {
          points: formatPolygonPoints(polygon),
          wall,
          polygon,
        }
      }),
    [floorplanWallById, wallMiterData, walls],
  )
  // Junction cap 多边形：填充不同厚度墙体拼接时的缝隙（随拖动实时更新）
  const junctionCapPolygons = useMemo(() => {
    const caps = displayWallMiterData.junctionCaps
    const result: Array<{ key: string; points: string }> = []
    for (const [key, cap] of caps.entries()) {
      if (cap.length >= 3) {
        result.push({ key, points: formatPolygonPoints(cap) })
      }
    }
    return result
  }, [displayWallMiterData.junctionCaps])
  const displayWallPolygons = useMemo(() => {
    if (!wallEndpointDraft) {
      return wallPolygons
    }

    // 拖动端点时，用更新后的 miter 数据重新计算所有受影响墙体的多边形
    // 这样拖动的墙和相邻墙的墙角都能实时正确对接
    return walls.map((wall) => {
      const floorplanWall = displayFloorplanWallById.get(wall.id) ?? getFloorplanWall(wall)
      const polygon = getWallPlanFootprint(floorplanWall, displayWallMiterData)
      const displayWall = displayWallById.get(wall.id) ?? wall
      return {
        wall: displayWall,
        polygon,
        points: formatPolygonPoints(polygon),
      }
    })
  }, [displayWallById, displayFloorplanWallById, displayWallMiterData, wallEndpointDraft, wallPolygons, walls])

  const openingsPolygons = useMemo(
    () =>
      openings.flatMap((opening) => {
        const wall = displayFloorplanWallById.get(opening.parentId as WallNode['id'])
        if (!wall) return []
        const polygon = getOpeningFootprint(wall, opening)
        return [
          {
            opening,
            points: formatPolygonPoints(polygon),
            polygon,
          },
        ]
      }),
    [displayFloorplanWallById, openings],
  )
  const slabPolygons = useMemo(
    () =>
      slabs.flatMap((slab) => {
        const polygon = toFloorplanPolygon(slab.polygon)
        if (polygon.length < 3) {
          return []
        }

        const holes = (slab.holes ?? [])
          .map((hole) => toFloorplanPolygon(hole))
          .filter((hole) => hole.length >= 3)

        return [
          {
            slab,
            polygon,
            holes,
            path: formatPolygonPath(polygon, holes),
          },
        ]
      }),
    [slabs],
  )
  const displaySlabPolygons = useMemo(() => {
    if (!slabBoundaryDraft) {
      return slabPolygons
    }

    return slabPolygons.map((entry) =>
      entry.slab.id === slabBoundaryDraft.slabId
        ? {
            ...entry,
            polygon: slabBoundaryDraft.polygon.map(toPoint2D),
            path: formatPolygonPath(slabBoundaryDraft.polygon.map(toPoint2D), entry.holes),
          }
        : entry,
    )
  }, [slabBoundaryDraft, slabPolygons])
  const zonePolygons = useMemo(
    () =>
      zones.flatMap((zone) => {
        const polygon = toFloorplanPolygon(zone.polygon)
        if (polygon.length < 3) {
          return []
        }

        return [
          {
            zone,
            polygon,
            points: formatPolygonPoints(polygon),
          },
        ]
      }),
    [zones],
  )
  const displayZonePolygons = useMemo(() => {
    if (!zoneBoundaryDraft) {
      return zonePolygons
    }

    return zonePolygons.map((entry) =>
      entry.zone.id === zoneBoundaryDraft.zoneId
        ? {
            ...entry,
            polygon: zoneBoundaryDraft.polygon.map(toPoint2D),
            points: formatPolygonPoints(zoneBoundaryDraft.polygon.map(toPoint2D)),
          }
        : entry,
    )
  }, [zoneBoundaryDraft, zonePolygons])
  const selectedOpeningEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return openingsPolygons.find(({ opening }) => opening.id === selectedIds[0]) ?? null
  }, [openingsPolygons, selectedIds])
  const slabById = useMemo(() => new Map(slabs.map((slab) => [slab.id, slab] as const)), [slabs])
  const zoneById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone] as const)), [zones])
  const selectedSlabEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return displaySlabPolygons.find(({ slab }) => slab.id === selectedIds[0]) ?? null
  }, [displaySlabPolygons, selectedIds])
  const selectedZoneEntry = useMemo(() => {
    if (!selectedZoneId) {
      return null
    }

    return displayZonePolygons.find(({ zone }) => zone.id === selectedZoneId) ?? null
  }, [displayZonePolygons, selectedZoneId])

  const isSiteEditActive = phase === 'site'
  const isWallBuildActive = phase === 'structure' && mode === 'build' && tool === 'wall'
  const isSlabBuildActive = phase === 'structure' && mode === 'build' && tool === 'slab'
  const isZoneBuildActive = phase === 'structure' && mode === 'build' && tool === 'zone'
  const isDoorBuildActive = phase === 'structure' && mode === 'build' && tool === 'door'
  const isWindowBuildActive = phase === 'structure' && mode === 'build' && tool === 'window'
  const isPolygonBuildActive = isSlabBuildActive || isZoneBuildActive
  const isOpeningBuildActive = isDoorBuildActive || isWindowBuildActive
  const isOpeningMoveActive = movingOpeningType !== null
  const isOpeningPlacementActive = isOpeningBuildActive || isOpeningMoveActive
  const floorplanOpeningLocalY = useMemo(() => {
    if (movingNode?.type === 'door' || movingNode?.type === 'window') {
      return snapToHalf(movingNode.position[1])
    }

    if (isWindowBuildActive) {
      // Floorplan is top-down, so new windows need an explicit wall-local height.
      return snapToHalf(FLOORPLAN_DEFAULT_WINDOW_LOCAL_Y)
    }

    return 0
  }, [isWindowBuildActive, movingNode])
  const isMarqueeSelectionToolActive =
    mode === 'select' &&
    floorplanSelectionTool === 'marquee' &&
    !movingNode &&
    structureLayer !== 'zones'
  const canSelectElementFloorplanGeometry =
    mode === 'select' && floorplanSelectionTool === 'click' && !movingNode
  const canInteractWithGuides = showGuides && canSelectElementFloorplanGeometry
  const canSelectFloorplanZones =
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    structureLayer === 'zones'
  const visibleSitePolygon = phase === 'site' ? displaySitePolygon : null
  const shouldShowSiteBoundaryHandles = isSiteEditActive && visibleSitePolygon !== null
  const shouldShowPersistentWallEndpointHandles = mode === 'select' && !movingNode
  const shouldShowSlabBoundaryHandles =
    mode === 'select' &&
    !movingNode &&
    floorplanSelectionTool === 'click' &&
    selectedSlabEntry !== null
  const shouldShowZoneBoundaryHandles = canSelectFloorplanZones && selectedZoneEntry !== null
  const showZonePolygons =
    phase === 'structure' && (structureLayer === 'zones' || isZoneBuildActive)
  const visibleZonePolygons = useMemo(
    () => (showZonePolygons ? displayZonePolygons : []),
    [displayZonePolygons, showZonePolygons],
  )
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const activeMarqueeBounds = useMemo(() => {
    if (!floorplanMarqueeState) {
      return null
    }

    return getFloorplanSelectionBounds(
      floorplanMarqueeState.startPlanPoint,
      floorplanMarqueeState.currentPlanPoint,
    )
  }, [floorplanMarqueeState])
  const visibleMarqueeBounds = useMemo(() => {
    if (!(floorplanMarqueeState && activeMarqueeBounds)) {
      return null
    }

    const dragDistance = Math.hypot(
      floorplanMarqueeState.currentPlanPoint[0] - floorplanMarqueeState.startPlanPoint[0],
      floorplanMarqueeState.currentPlanPoint[1] - floorplanMarqueeState.startPlanPoint[1],
    )

    return dragDistance > 0 ? activeMarqueeBounds : null
  }, [activeMarqueeBounds, floorplanMarqueeState])
  const visibleSvgMarqueeBounds = useMemo(() => {
    if (!visibleMarqueeBounds) {
      return null
    }

    return toSvgSelectionBounds(visibleMarqueeBounds)
  }, [visibleMarqueeBounds])
  const wallEndpointHandles = useMemo(() => {
    if (isOpeningPlacementActive || movingNode) {
      return []
    }

    return displayWallPolygons.flatMap(({ wall }) => {
      const isSelected = selectedIdSet.has(wall.id)
      const isVisible =
        shouldShowPersistentWallEndpointHandles ||
        isWallBuildActive ||
        isSelected ||
        wallEndpointDraft?.wallId === wall.id
      if (!isVisible) {
        return []
      }

      return (['start', 'end'] as const).map((endpoint) => ({
        wall,
        endpoint,
        point: endpoint === 'start' ? wall.start : wall.end,
        isSelected,
        isActive: wallEndpointDraft?.wallId === wall.id && wallEndpointDraft.endpoint === endpoint,
      }))
    })
  }, [
    displayWallPolygons,
    isOpeningPlacementActive,
    isWallBuildActive,
    movingNode,
    selectedIdSet,
    shouldShowPersistentWallEndpointHandles,
    wallEndpointDraft,
  ])
  const slabVertexHandles = useMemo(() => {
    if (!shouldShowSlabBoundaryHandles) {
      return []
    }

    return selectedSlabEntry.polygon.map((point, vertexIndex) => ({
      nodeId: selectedSlabEntry.slab.id,
      vertexIndex,
      point: toWallPlanPoint(point),
      isActive:
        slabVertexDragState?.slabId === selectedSlabEntry.slab.id &&
        slabVertexDragState.vertexIndex === vertexIndex,
    }))
  }, [selectedSlabEntry, shouldShowSlabBoundaryHandles, slabVertexDragState])
  const slabMidpointHandles = useMemo(() => {
    if (!(shouldShowSlabBoundaryHandles && !slabVertexDragState)) {
      return []
    }

    return selectedSlabEntry.polygon.map((point, edgeIndex, polygon) => {
      const nextPoint = polygon[(edgeIndex + 1) % polygon.length]
      return {
        nodeId: selectedSlabEntry.slab.id,
        edgeIndex,
        point: [
          (point.x + (nextPoint?.x ?? point.x)) / 2,
          (point.y + (nextPoint?.y ?? point.y)) / 2,
        ] as WallPlanPoint,
      }
    })
  }, [selectedSlabEntry, shouldShowSlabBoundaryHandles, slabVertexDragState])
  const siteVertexHandles = useMemo(() => {
    if (!(shouldShowSiteBoundaryHandles && visibleSitePolygon)) {
      return []
    }

    return visibleSitePolygon.polygon.map((point, vertexIndex) => ({
      nodeId: visibleSitePolygon.site.id,
      vertexIndex,
      point: toWallPlanPoint(point),
      isActive:
        siteVertexDragState?.siteId === visibleSitePolygon.site.id &&
        siteVertexDragState.vertexIndex === vertexIndex,
    }))
  }, [shouldShowSiteBoundaryHandles, siteVertexDragState, visibleSitePolygon])
  const siteMidpointHandles = useMemo(() => {
    if (!(shouldShowSiteBoundaryHandles && visibleSitePolygon && !siteVertexDragState)) {
      return []
    }

    return visibleSitePolygon.polygon.map((point, edgeIndex, polygon) => {
      const nextPoint = polygon[(edgeIndex + 1) % polygon.length]
      return {
        nodeId: visibleSitePolygon.site.id,
        edgeIndex,
        point: [
          (point.x + (nextPoint?.x ?? point.x)) / 2,
          (point.y + (nextPoint?.y ?? point.y)) / 2,
        ] as WallPlanPoint,
      }
    })
  }, [shouldShowSiteBoundaryHandles, siteVertexDragState, visibleSitePolygon])
  const zoneVertexHandles = useMemo(() => {
    if (!shouldShowZoneBoundaryHandles) {
      return []
    }

    return selectedZoneEntry.polygon.map((point, vertexIndex) => ({
      nodeId: selectedZoneEntry.zone.id,
      vertexIndex,
      point: toWallPlanPoint(point),
      isActive:
        zoneVertexDragState?.zoneId === selectedZoneEntry.zone.id &&
        zoneVertexDragState.vertexIndex === vertexIndex,
    }))
  }, [selectedZoneEntry, shouldShowZoneBoundaryHandles, zoneVertexDragState])
  const zoneMidpointHandles = useMemo(() => {
    if (!(shouldShowZoneBoundaryHandles && !zoneVertexDragState)) {
      return []
    }

    return selectedZoneEntry.polygon.map((point, edgeIndex, polygon) => {
      const nextPoint = polygon[(edgeIndex + 1) % polygon.length]
      return {
        nodeId: selectedZoneEntry.zone.id,
        edgeIndex,
        point: [
          (point.x + (nextPoint?.x ?? point.x)) / 2,
          (point.y + (nextPoint?.y ?? point.y)) / 2,
        ] as WallPlanPoint,
      }
    })
  }, [selectedZoneEntry, shouldShowZoneBoundaryHandles, zoneVertexDragState])

  const draftPolygon = useMemo(() => {
    if (!(levelId && draftStart && draftEnd && isWallLongEnough(draftStart, draftEnd))) {
      return null
    }

    // 用当前选中墙种类的厚度，让 draft 预览和实际创建的墙保持一致
    const activeWallDef = WALL_TYPE_BY_ID[activeWallTypeId as keyof typeof WALL_TYPE_BY_ID]
    const draftWall = getFloorplanWall(buildDraftWall(levelId, draftStart, draftEnd, activeWallDef?.thickness))
    // Keep the live draft preview cheap; full level-wide mitering here runs on every mouse move.
    return getWallPlanFootprint(draftWall, EMPTY_WALL_MITER_DATA)
  }, [activeWallTypeId, draftEnd, draftStart, levelId])
  const draftPolygonPoints = useMemo(
    () => (draftPolygon ? formatPolygonPoints(draftPolygon) : null),
    [draftPolygon],
  )
  // 画墙实时长度 / 角度 —— 纯渲染层，不影响任何既有逻辑
  const draftMeasurement = useMemo(() => {
    if (!(draftStart && draftEnd)) return null
    const dx = draftEnd[0] - draftStart[0]
    const dz = draftEnd[1] - draftStart[1]
    const length = Math.sqrt(dx * dx + dz * dz)
    if (length < 1e-4) return null
    // 角度：0° = 正右方向（+x），顺时针为正，显示到 0°/45°/90° 对齐时为整数
    let angleDeg = (Math.atan2(dz, dx) * 180) / Math.PI
    if (angleDeg < 0) angleDeg += 360
    // 中点（世界坐标）
    const midX = (draftStart[0] + draftEnd[0]) / 2
    const midZ = (draftStart[1] + draftEnd[1]) / 2
    // 法向量（垂直于线），用于把文字"推"到线外侧
    const nx = length > 0 ? -dz / length : 0
    const nz = length > 0 ? dx / length : 0
    // 是否贴近 45° 的倍数（吸附激活状态）
    // 由于 snapPointTo45Degrees 在 !shiftPressed 时会把 end 吸到 45° 倍数上，
    // 这里检查实际角度是否在容差内，命中则认为追踪线激活
    const nearest45 = Math.round(angleDeg / 45) * 45
    const angleDiff = Math.abs(((angleDeg - nearest45 + 540) % 360) - 180)
    // 90° 轴外，180° 内：abs diff < 0.5° 视为命中
    const snapDirectionDeg = angleDiff < 0.5 ? ((nearest45 + 360) % 360) : null
    // 轴类别：0/90/180/270 = 正交（蓝），45/135/225/315 = 对角（琥珀）
    const isOrthogonal = snapDirectionDeg !== null && snapDirectionDeg % 90 === 0
    return {
      length,
      angleDeg,
      midX,
      midZ,
      nx,
      nz,
      startX: draftStart[0],
      startZ: draftStart[1],
      snapDirectionDeg,
      isOrthogonal,
    }
  }, [draftStart, draftEnd])
  const activePolygonDraftPoints = useMemo(() => {
    if (isZoneBuildActive) {
      return zoneDraftPoints
    }

    if (isSlabBuildActive) {
      return slabDraftPoints
    }

    return [] as WallPlanPoint[]
  }, [isSlabBuildActive, isZoneBuildActive, slabDraftPoints, zoneDraftPoints])
  const polygonDraftPolylinePoints = useMemo(() => {
    if (!(isPolygonBuildActive && cursorPoint && activePolygonDraftPoints.length > 0)) {
      return null
    }

    return formatPolygonPoints([...activePolygonDraftPoints.map(toPoint2D), toPoint2D(cursorPoint)])
  }, [activePolygonDraftPoints, cursorPoint, isPolygonBuildActive])
  const polygonDraftPolygonPoints = useMemo(() => {
    if (!(isPolygonBuildActive && cursorPoint && activePolygonDraftPoints.length >= 2)) {
      return null
    }

    return formatPolygonPoints([...activePolygonDraftPoints.map(toPoint2D), toPoint2D(cursorPoint)])
  }, [activePolygonDraftPoints, cursorPoint, isPolygonBuildActive])
  const polygonDraftClosingSegment = useMemo(() => {
    if (!(isPolygonBuildActive && cursorPoint && activePolygonDraftPoints.length >= 2)) {
      return null
    }

    const firstPoint = activePolygonDraftPoints[0]
    if (!firstPoint) {
      return null
    }

    return {
      x1: toSvgX(cursorPoint[0]),
      y1: toSvgY(cursorPoint[1]),
      x2: toSvgX(firstPoint[0]),
      y2: toSvgY(firstPoint[1]),
    }
  }, [activePolygonDraftPoints, cursorPoint, isPolygonBuildActive])

  const svgAspectRatio = surfaceSize.width / surfaceSize.height || 1

  const fittedViewport = useMemo(() => {
    const allPoints = [
      ...(visibleSitePolygon ? visibleSitePolygon.polygon : []),
      ...displaySlabPolygons.flatMap((entry) => entry.polygon),
      ...visibleZonePolygons.flatMap((entry) => entry.polygon),
      ...wallPolygons.flatMap((entry) => entry.polygon),
    ]

    if (allPoints.length === 0) {
      return {
        centerX: 0,
        centerY: 0,
        width: Math.max(FALLBACK_VIEW_SIZE, FALLBACK_VIEW_SIZE * svgAspectRatio),
      }
    }

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const point of allPoints) {
      const svgPoint = toSvgPoint(point)
      minX = Math.min(minX, svgPoint.x)
      maxX = Math.max(maxX, svgPoint.x)
      minY = Math.min(minY, svgPoint.y)
      maxY = Math.max(maxY, svgPoint.y)
    }

    const rawWidth = maxX - minX
    const rawHeight = maxY - minY
    const paddedWidth = rawWidth + FLOORPLAN_PADDING * 2
    const paddedHeight = rawHeight + FLOORPLAN_PADDING * 2
    const width = Math.max(FALLBACK_VIEW_SIZE, paddedWidth, paddedHeight * svgAspectRatio)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    return {
      centerX,
      centerY,
      width,
    }
  }, [displaySlabPolygons, svgAspectRatio, visibleSitePolygon, visibleZonePolygons, wallPolygons])

  useEffect(() => {
    const host = viewportHostRef.current
    if (!host) {
      return
    }

    const updateSize = () => {
      const rect = host.getBoundingClientRect()
      setSurfaceSize({
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      })
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(host)
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Track actual container position and size for SVG coordinate transforms
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setPanelRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
      setIsPanelReady(true)
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    const levelChanged = previousLevelIdRef.current !== (levelId ?? null)

    if (levelChanged) {
      previousLevelIdRef.current = levelId ?? null
      hasUserAdjustedViewportRef.current = false
      setViewport(fittedViewport)
      return
    }

    if (!hasUserAdjustedViewportRef.current) {
      setViewport(fittedViewport)
    }
  }, [fittedViewport, levelId])

  useEffect(() => {
    if (!(phase === 'site' && levelNode?.type === 'level' && levelNode.level > 0)) {
      return
    }

    setPhase('structure')
  }, [levelNode, phase, setPhase])

  const viewBox = useMemo(() => {
    const currentViewport = viewport ?? fittedViewport
    const width = currentViewport.width
    const height = width / svgAspectRatio

    return {
      minX: currentViewport.centerX - width / 2,
      minY: currentViewport.centerY - height / 2,
      width,
      height,
    }
  }, [fittedViewport, svgAspectRatio, viewport])
  const floorplanWorldUnitsPerPixel = useMemo(() => {
    const widthUnitsPerPixel = viewBox.width / Math.max(surfaceSize.width, 1)
    const heightUnitsPerPixel = viewBox.height / Math.max(surfaceSize.height, 1)

    return (widthUnitsPerPixel + heightUnitsPerPixel) / 2
  }, [surfaceSize.height, surfaceSize.width, viewBox.height, viewBox.width])
  const floorplanWallHitTolerance = useMemo(
    () => floorplanWorldUnitsPerPixel * (FLOORPLAN_WALL_HIT_STROKE_WIDTH / 2),
    [floorplanWorldUnitsPerPixel],
  )
  const floorplanOpeningHitTolerance = useMemo(
    () => floorplanWorldUnitsPerPixel * (FLOORPLAN_OPENING_HIT_STROKE_WIDTH / 2),
    [floorplanWorldUnitsPerPixel],
  )
  const selectedOpeningActionMenuPosition = useMemo(() => {
    if (!selectedOpeningEntry) {
      return null
    }

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const point of selectedOpeningEntry.polygon) {
      const svgPoint = toSvgPoint(point)
      minX = Math.min(minX, svgPoint.x)
      maxX = Math.max(maxX, svgPoint.x)
      minY = Math.min(minY, svgPoint.y)
      maxY = Math.max(maxY, svgPoint.y)
    }

    if (
      !(
        Number.isFinite(minX) &&
        Number.isFinite(maxX) &&
        Number.isFinite(minY) &&
        Number.isFinite(maxY)
      )
    ) {
      return null
    }

    if (
      maxX < viewBox.minX ||
      minX > viewBox.minX + viewBox.width ||
      maxY < viewBox.minY ||
      minY > viewBox.minY + viewBox.height
    ) {
      return null
    }

    const anchorX = (((minX + maxX) / 2 - viewBox.minX) / viewBox.width) * surfaceSize.width
    const anchorY = ((minY - viewBox.minY) / viewBox.height) * surfaceSize.height

    return {
      x: Math.min(
        Math.max(anchorX, FLOORPLAN_ACTION_MENU_HORIZONTAL_PADDING),
        surfaceSize.width - FLOORPLAN_ACTION_MENU_HORIZONTAL_PADDING,
      ),
      y: Math.max(anchorY, FLOORPLAN_ACTION_MENU_MIN_ANCHOR_Y),
    }
  }, [selectedOpeningEntry, surfaceSize.height, surfaceSize.width, viewBox])

  useEffect(() => {
    setHoveredGuideCorner(null)
  }, [selectedGuide?.id])

  useEffect(() => {
    if (!(selectedGuide && showGuides && canInteractWithGuides)) {
      setHoveredGuideCorner(null)
    }
  }, [canInteractWithGuides, selectedGuide, showGuides])

  const guideHandleHintAnchor = useMemo<GuideHandleHintAnchor | null>(() => {
    if (
      !(
        hoveredGuideCorner &&
        selectedGuide &&
        selectedGuideDimensions &&
        surfaceSize.width > 0 &&
        surfaceSize.height > 0 &&
        viewBox.width > 0 &&
        viewBox.height > 0
      )
    ) {
      return null
    }

    const aspectRatio = selectedGuideDimensions.width / selectedGuideDimensions.height
    if (!(aspectRatio > 0)) {
      return null
    }

    const planWidth = getGuideWidth(selectedGuide.scale)
    const planHeight = getGuideHeight(planWidth, aspectRatio)
    const centerSvg = getGuideCenterSvgPoint(selectedGuide)
    const handleSvg = getGuideCornerSvgPoint(
      centerSvg,
      planWidth,
      planHeight,
      -selectedGuide.rotation[1],
      hoveredGuideCorner,
    )

    if (
      handleSvg.x < viewBox.minX ||
      handleSvg.x > viewBox.minX + viewBox.width ||
      handleSvg.y < viewBox.minY ||
      handleSvg.y > viewBox.minY + viewBox.height
    ) {
      return null
    }

    const centerX = ((centerSvg.x - viewBox.minX) / viewBox.width) * surfaceSize.width
    const centerY = ((centerSvg.y - viewBox.minY) / viewBox.height) * surfaceSize.height
    const handleX = ((handleSvg.x - viewBox.minX) / viewBox.width) * surfaceSize.width
    const handleY = ((handleSvg.y - viewBox.minY) / viewBox.height) * surfaceSize.height

    let directionX = handleX - centerX
    let directionY = handleY - centerY
    const directionLength = Math.hypot(directionX, directionY)

    if (directionLength > 0.001) {
      directionX /= directionLength
      directionY /= directionLength
    } else {
      directionX = 1
      directionY = 0
    }

    const minX = Math.min(FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_X, surfaceSize.width / 2)
    const maxX = Math.max(surfaceSize.width - FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_X, minX)
    const minY = Math.min(FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_Y, surfaceSize.height / 2)
    const maxY = Math.max(surfaceSize.height - FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_Y, minY)

    return {
      x: clamp(handleX + directionX * FLOORPLAN_GUIDE_HANDLE_HINT_OFFSET, minX, maxX),
      y: clamp(handleY + directionY * FLOORPLAN_GUIDE_HANDLE_HINT_OFFSET, minY, maxY),
      directionX,
      directionY,
    }
  }, [
    hoveredGuideCorner,
    selectedGuide,
    selectedGuideDimensions,
    surfaceSize.height,
    surfaceSize.width,
    viewBox,
  ])

  const minViewportWidth = fittedViewport.width * MIN_VIEWPORT_WIDTH_RATIO
  const maxViewportWidth = fittedViewport.width * MAX_VIEWPORT_WIDTH_RATIO

  const palette = useMemo(
    () =>
      theme === 'dark'
        ? {
            surface: '#0a0e1b',
            minorGrid: '#475569',
            majorGrid: '#94a3b8',
            minorGridOpacity: 0.7,
            majorGridOpacity: 0.9,
            slabFill: '#5f6483',
            slabStroke: '#71717a',
            selectedSlabFill: '#b7b5f7',
            wallFill: '#fafafa',
            wallStroke: '#38bdf8',
            wallHoverStroke: '#a1a1aa',
            selectedFill: '#8381ed',
            selectedStroke: '#8381ed',
            draftFill: '#818cf8',
            draftStroke: '#c7d2fe',
            measurementStroke: '#cbd5e1',
            cursor: '#818cf8',
            editCursor: '#8381ed',
            anchor: '#818cf8',
            openingFill: '#0a0e1b',
            openingStroke: '#fafafa',
            endpointHandleFill: '#09090b',
            endpointHandleStroke: '#a1a1aa',
            endpointHandleHoverStroke: '#d4d4d8',
            endpointHandleActiveFill: '#8381ed',
            endpointHandleActiveStroke: '#8381ed',
          }
        : {
            surface: '#ffffff',
            minorGrid: '#94a3b8',
            majorGrid: '#475569',
            minorGridOpacity: 0.7,
            majorGridOpacity: 0.9,
            slabFill: '#c4c4cc',
            slabStroke: '#52525b',
            selectedSlabFill: '#b7b5f7',
            wallFill: '#171717',
            wallStroke: '#0284c7',
            wallHoverStroke: '#71717a',
            selectedFill: '#8381ed',
            selectedStroke: '#8381ed',
            draftFill: '#6366f1',
            draftStroke: '#4338ca',
            measurementStroke: '#334155',
            cursor: '#6366f1',
            editCursor: '#8381ed',
            anchor: '#4338ca',
            openingFill: '#ffffff',
            openingStroke: '#171717',
            endpointHandleFill: '#ffffff',
            endpointHandleStroke: '#71717a',
            endpointHandleHoverStroke: '#52525b',
            endpointHandleActiveFill: '#8381ed',
            endpointHandleActiveStroke: '#8381ed',
          },
    [theme],
  )
  const gridSteps = useMemo(
    () => getVisibleGridSteps(viewBox.width, surfaceSize.width),
    [surfaceSize.width, viewBox.width],
  )

  const minorGridPath = useMemo(
    () =>
      buildGridPath(
        viewBox.minX,
        viewBox.minX + viewBox.width,
        viewBox.minY,
        viewBox.minY + viewBox.height,
        gridSteps.minorStep,
        {
          excludeStep: gridSteps.majorStep,
        },
      ),
    [gridSteps.majorStep, gridSteps.minorStep, viewBox],
  )
  const majorGridPath = useMemo(
    () =>
      buildGridPath(
        viewBox.minX,
        viewBox.minX + viewBox.width,
        viewBox.minY,
        viewBox.minY + viewBox.height,
        gridSteps.majorStep,
      ),
    [gridSteps.majorStep, viewBox],
  )

  const getSvgPointFromClientPoint = useCallback(
    (clientX: number, clientY: number): SvgPoint | null => {
      const svg = svgRef.current
      const ctm = svg?.getScreenCTM()
      if (!(svg && ctm)) {
        return null
      }

      const screenPoint = svg.createSVGPoint()
      screenPoint.x = clientX
      screenPoint.y = clientY
      const transformedPoint = screenPoint.matrixTransform(ctm.inverse())

      return { x: transformedPoint.x, y: transformedPoint.y }
    },
    [],
  )

  const getPlanPointFromClientPoint = useCallback(
    (clientX: number, clientY: number): WallPlanPoint | null => {
      const svgPoint = getSvgPointFromClientPoint(clientX, clientY)
      if (!svgPoint) {
        return null
      }

      return toPlanPointFromSvgPoint(svgPoint)
    },
    [getSvgPointFromClientPoint],
  )
  useEffect(() => {
    siteBoundaryDraftRef.current = siteBoundaryDraft
  }, [siteBoundaryDraft])

  useEffect(() => {
    slabBoundaryDraftRef.current = slabBoundaryDraft
  }, [slabBoundaryDraft])

  useEffect(() => {
    zoneBoundaryDraftRef.current = zoneBoundaryDraft
  }, [zoneBoundaryDraft])

  useEffect(() => {
    guideTransformDraftRef.current = guideTransformDraft
  }, [guideTransformDraft])

  const updateViewport = useCallback((nextViewport: FloorplanViewport) => {
    hasUserAdjustedViewportRef.current = true
    setViewport(nextViewport)
  }, [])

  const clearGuideInteraction = useCallback(() => {
    guideInteractionRef.current = null
    guideTransformDraftRef.current = null
    setGuideTransformDraft(null)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const finishPanelInteraction = useCallback(() => {
    panelInteractionRef.current = null
    setIsDraggingPanel(false)
    setActiveResizeDirection(null)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const beginPanelInteraction = useCallback((interaction: PanelInteractionState) => {
    panelInteractionRef.current = interaction
    if (interaction.type === 'drag') {
      setIsDraggingPanel(true)
      setActiveResizeDirection(null)
      document.body.style.cursor = 'grabbing'
    } else if (interaction.direction) {
      setIsDraggingPanel(false)
      setActiveResizeDirection(interaction.direction)
      document.body.style.cursor = resizeCursorByDirection[interaction.direction]
    }

    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = panelInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      event.preventDefault()

      const dx = event.clientX - interaction.startClientX
      const dy = event.clientY - interaction.startClientY
      const bounds = getViewportBounds()

      const nextRect =
        interaction.type === 'drag'
          ? movePanelRect(interaction.initialRect, dx, dy, bounds)
          : resizePanelRect(interaction.initialRect, interaction.direction ?? 'se', dx, dy, bounds)

      setPanelRect(nextRect)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const interaction = panelInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      finishPanelInteraction()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [finishPanelInteraction])

  useEffect(() => {
    return () => {
      finishPanelInteraction()
    }
  }, [finishPanelInteraction])

  useEffect(() => {
    const interaction = guideInteractionRef.current
    if (interaction && !guideById.has(interaction.guideId)) {
      clearGuideInteraction()
    }
  }, [clearGuideInteraction, guideById])

  useEffect(() => {
    if (!canInteractWithGuides) {
      clearGuideInteraction()
    }
  }, [canInteractWithGuides, clearGuideInteraction])

  useEffect(() => {
    return () => {
      clearGuideInteraction()
    }
  }, [clearGuideInteraction])

  const handlePanelDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      const target = event.target as HTMLElement | null
      if (target?.closest('[data-floorplan-panel-control="true"]')) {
        return
      }

      event.preventDefault()

      beginPanelInteraction({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialRect: panelRect,
        type: 'drag',
      })
    },
    [beginPanelInteraction, panelRect],
  )

  const handleResizeStart = useCallback(
    (direction: ResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      beginPanelInteraction({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialRect: panelRect,
        type: 'resize',
        direction,
      })
    },
    [beginPanelInteraction, panelRect],
  )

  const zoomViewportAtClientPoint = useCallback(
    (clientX: number, clientY: number, widthFactor: number) => {
      if (!Number.isFinite(widthFactor) || widthFactor <= 0) {
        return
      }

      const svgPoint = getSvgPointFromClientPoint(clientX, clientY)
      if (!svgPoint) {
        return
      }

      const currentViewport = viewport ?? fittedViewport
      const currentViewBox = viewBox
      const nextWidth = Math.min(
        maxViewportWidth,
        Math.max(minViewportWidth, currentViewport.width * widthFactor),
      )
      const nextHeight = nextWidth / svgAspectRatio
      const normalizedX = (svgPoint.x - currentViewBox.minX) / currentViewBox.width
      const normalizedY = (svgPoint.y - currentViewBox.minY) / currentViewBox.height
      const nextMinX = svgPoint.x - normalizedX * nextWidth
      const nextMinY = svgPoint.y - normalizedY * nextHeight

      updateViewport({
        centerX: nextMinX + nextWidth / 2,
        centerY: nextMinY + nextHeight / 2,
        width: nextWidth,
      })
    },
    [
      fittedViewport,
      getSvgPointFromClientPoint,
      maxViewportWidth,
      minViewportWidth,
      svgAspectRatio,
      updateViewport,
      viewBox,
      viewport,
    ],
  )

  const clearWallPlacementDraft = useCallback(() => {
    setDraftStart(null)
    setDraftEnd(null)
  }, [])
  const clearSlabPlacementDraft = useCallback(() => {
    setSlabDraftPoints([])
  }, [])
  const clearZonePlacementDraft = useCallback(() => {
    setZoneDraftPoints([])
  }, [])

  const clearWallEndpointDrag = useCallback(() => {
    wallEndpointDragRef.current = null
    setWallEndpointDraft(null)
    setHoveredEndpointId(null)
  }, [])
  const clearSiteBoundaryInteraction = useCallback(() => {
    setSiteVertexDragState(null)
    setSiteBoundaryDraft(null)
    setHoveredSiteHandleId(null)
  }, [])
  const clearSlabBoundaryInteraction = useCallback(() => {
    setSlabVertexDragState(null)
    setSlabBoundaryDraft(null)
    setHoveredSlabHandleId(null)
  }, [])
  const clearZoneBoundaryInteraction = useCallback(() => {
    setZoneVertexDragState(null)
    setZoneBoundaryDraft(null)
    setHoveredZoneHandleId(null)
  }, [])

  const clearDraft = useCallback(() => {
    clearWallPlacementDraft()
    clearSlabPlacementDraft()
    clearZonePlacementDraft()
    clearWallEndpointDrag()
    clearSiteBoundaryInteraction()
    clearSlabBoundaryInteraction()
    clearZoneBoundaryInteraction()
    setCursorPoint(null)
  }, [
    clearSiteBoundaryInteraction,
    clearSlabBoundaryInteraction,
    clearSlabPlacementDraft,
    clearZoneBoundaryInteraction,
    clearWallEndpointDrag,
    clearWallPlacementDraft,
    clearZonePlacementDraft,
  ])

  useEffect(() => {
    if (isWallBuildActive || isPolygonBuildActive) {
      return
    }

    clearDraft()
  }, [clearDraft, isPolygonBuildActive, isWallBuildActive])

  useEffect(() => {
    const handleCancel = () => {
      clearDraft()
    }

    emitter.on('tool:cancel', handleCancel)
    return () => {
      emitter.off('tool:cancel', handleCancel)
    }
  }, [clearDraft])

  const createSlabOnCurrentLevel = useCallback(
    (points: WallPlanPoint[]) => {
      if (!levelId) {
        return null
      }

      const { createNode, nodes } = useScene.getState()
      const slabCount = Object.values(nodes).filter((node) => node.type === 'slab').length
      const slab = SlabNode.parse({
        name: `Slab ${slabCount + 1}`,
        polygon: points.map(([x, z]) => [x, z] as [number, number]),
      })

      createNode(slab, levelId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: [slab.id] })
      return slab.id
    },
    [levelId, setSelection],
  )
  const createZoneOnCurrentLevel = useCallback(
    (points: WallPlanPoint[]) => {
      if (!levelId) {
        return null
      }

      const { createNode, nodes } = useScene.getState()
      const zoneCount = Object.values(nodes).filter((node) => node.type === 'zone').length
      const zone = ZoneNodeSchema.parse({
        color: PALETTE_COLORS[zoneCount % PALETTE_COLORS.length],
        name: `Zone ${zoneCount + 1}`,
        polygon: points.map(([x, z]) => [x, z] as [number, number]),
      })

      createNode(zone, levelId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ zoneId: zone.id })
      return zone.id
    },
    [levelId, setSelection],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setShiftPressed(true)
      }

      setRotationModifierPressed(
        event.key === 'Meta' || event.key === 'Control' || event.metaKey || event.ctrlKey,
      )
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setShiftPressed(false)
      }

      setRotationModifierPressed(event.metaKey || event.ctrlKey)
    }
    const handleBlur = () => {
      setShiftPressed(false)
      setRotationModifierPressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      const guideInteraction = guideInteractionRef.current
      if (guideInteraction && event.pointerId === guideInteraction.pointerId) {
        event.preventDefault()

        const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
        if (!svgPoint) {
          return
        }

        const nextDraft =
          guideInteraction.mode === 'rotate'
            ? buildGuideRotationDraft(guideInteraction, svgPoint, shiftPressed)
            : guideInteraction.mode === 'translate'
              ? buildGuideTranslateDraft(guideInteraction, svgPoint)
              : buildGuideResizeDraft(guideInteraction, svgPoint)

        if (areGuideTransformDraftsEqual(guideTransformDraftRef.current, nextDraft)) {
          return
        }

        guideTransformDraftRef.current = nextDraft
        setGuideTransformDraft(nextDraft)
        return
      }

      const dragState = wallEndpointDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint = snapWallDraftPoint({
        point: planPoint,
        walls,
        start: dragState.fixedPoint,
        angleSnap: !shiftPressed,
        ignoreWallIds: [dragState.wallId],
        worldUnitsPerPixel: floorplanWorldUnitsPerPixel,
      })

      if (pointsEqual(dragState.currentPoint, snappedPoint)) {
        return
      }

      dragState.currentPoint = snappedPoint
      setCursorPoint(snappedPoint)
      setWallEndpointDraft((previousDraft) => {
        const nextDraft = buildWallEndpointDraft(
          dragState.wallId,
          dragState.endpoint,
          dragState.fixedPoint,
          snappedPoint,
        )

        if (
          !(
            previousDraft &&
            pointsEqual(previousDraft.start, nextDraft.start) &&
            pointsEqual(previousDraft.end, nextDraft.end)
          )
        ) {
          sfxEmitter.emit('sfx:grid-snap')
        }

        return nextDraft
      })
    }

    const commitGuideInteraction = (event: PointerEvent) => {
      const interaction = guideInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      event.preventDefault()

      const guide = guideById.get(interaction.guideId)
      if (!guide) {
        clearGuideInteraction()
        return
      }

      const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
      const nextDraft = svgPoint
        ? interaction.mode === 'rotate'
          ? buildGuideRotationDraft(interaction, svgPoint, shiftPressed)
          : interaction.mode === 'translate'
            ? buildGuideTranslateDraft(interaction, svgPoint)
            : buildGuideResizeDraft(interaction, svgPoint)
        : guideTransformDraftRef.current

      if (nextDraft && !doesGuideMatchDraft(guide, nextDraft)) {
        updateNode(guide.id, {
          position: [nextDraft.position[0], guide.position[1], nextDraft.position[1]] as [
            number,
            number,
            number,
          ],
          rotation: [guide.rotation[0], nextDraft.rotation, guide.rotation[2]] as [
            number,
            number,
            number,
          ],
          scale: nextDraft.scale,
        })
      }

      clearGuideInteraction()
    }

    const cancelGuideInteraction = (event: PointerEvent) => {
      const interaction = guideInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      clearGuideInteraction()
    }

    const commitWallEndpointDrag = (event: PointerEvent) => {
      const dragState = wallEndpointDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      const wall = wallById.get(dragState.wallId)
      if (wall) {
        const nextDraft = buildWallEndpointDraft(
          dragState.wallId,
          dragState.endpoint,
          dragState.fixedPoint,
          dragState.currentPoint,
        )
        const hasChanged = !(
          pointsEqual(nextDraft.start, wall.start) && pointsEqual(nextDraft.end, wall.end)
        )

        if (hasChanged && isWallLongEnough(nextDraft.start, nextDraft.end)) {
          updateNode(wall.id, {
            start: nextDraft.start,
            end: nextDraft.end,
          })
          sfxEmitter.emit('sfx:structure-build')
        }
      }

      clearWallEndpointDrag()
      setCursorPoint(null)
    }

    const cancelWallEndpointDrag = (event: PointerEvent) => {
      const dragState = wallEndpointDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      clearWallEndpointDrag()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitGuideInteraction)
    window.addEventListener('pointercancel', cancelGuideInteraction)
    window.addEventListener('pointerup', commitWallEndpointDrag)
    window.addEventListener('pointercancel', cancelWallEndpointDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitGuideInteraction)
      window.removeEventListener('pointercancel', cancelGuideInteraction)
      window.removeEventListener('pointerup', commitWallEndpointDrag)
      window.removeEventListener('pointercancel', cancelWallEndpointDrag)
    }
  }, [
    clearGuideInteraction,
    clearWallEndpointDrag,
    getSvgPointFromClientPoint,
    guideById,
    getPlanPointFromClientPoint,
    shiftPressed,
    updateNode,
    wallById,
    walls,
  ])

  useEffect(() => {
    clearWallEndpointDrag()
  }, [clearWallEndpointDrag, levelId])

  useEffect(() => {
    if (shouldShowSiteBoundaryHandles) {
      return
    }

    clearSiteBoundaryInteraction()
  }, [clearSiteBoundaryInteraction, shouldShowSiteBoundaryHandles])

  useEffect(() => {
    if (shouldShowSlabBoundaryHandles) {
      return
    }

    clearSlabBoundaryInteraction()
  }, [clearSlabBoundaryInteraction, shouldShowSlabBoundaryHandles])

  useEffect(() => {
    if (shouldShowZoneBoundaryHandles) {
      return
    }

    clearZoneBoundaryInteraction()
  }, [clearZoneBoundaryInteraction, shouldShowZoneBoundaryHandles])

  useEffect(() => {
    const dragState = siteVertexDragState
    if (!dragState) {
      return
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint: WallPlanPoint = [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      setCursorPoint(snappedPoint)

      setSiteBoundaryDraft((currentDraft) => {
        if (!currentDraft || currentDraft.siteId !== dragState.siteId) {
          return currentDraft
        }

        const currentPoint = currentDraft.polygon[dragState.vertexIndex]
        if (currentPoint && pointsEqual(currentPoint, snappedPoint)) {
          return currentDraft
        }

        sfxEmitter.emit('sfx:grid-snap')

        const nextPolygon = [...currentDraft.polygon]
        nextPolygon[dragState.vertexIndex] = snappedPoint

        return {
          ...currentDraft,
          polygon: nextPolygon,
        }
      })
    }

    const commitSiteVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      const draft = siteBoundaryDraftRef.current
      if (
        draft &&
        site &&
        draft.siteId === site.id &&
        !polygonsEqual(draft.polygon, site.polygon?.points ?? [])
      ) {
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', suppressClick, true)
        }
        window.addEventListener('click', suppressClick, true)
        requestAnimationFrame(() => {
          window.removeEventListener('click', suppressClick, true)
        })

        updateNode(draft.siteId, {
          polygon: {
            type: 'polygon',
            points: draft.polygon,
          },
        })
        sfxEmitter.emit('sfx:structure-build')
      }

      clearSiteBoundaryInteraction()
      setCursorPoint(null)
    }

    const cancelSiteVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      clearSiteBoundaryInteraction()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitSiteVertexDrag)
    window.addEventListener('pointercancel', cancelSiteVertexDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitSiteVertexDrag)
      window.removeEventListener('pointercancel', cancelSiteVertexDrag)
    }
  }, [
    clearSiteBoundaryInteraction,
    getPlanPointFromClientPoint,
    site,
    siteVertexDragState,
    updateNode,
  ])

  useEffect(() => {
    const dragState = slabVertexDragState
    if (!dragState) {
      return
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint: WallPlanPoint = [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      setCursorPoint(snappedPoint)

      setSlabBoundaryDraft((currentDraft) => {
        if (!currentDraft || currentDraft.slabId !== dragState.slabId) {
          return currentDraft
        }

        const currentPoint = currentDraft.polygon[dragState.vertexIndex]
        if (currentPoint && pointsEqual(currentPoint, snappedPoint)) {
          return currentDraft
        }

        sfxEmitter.emit('sfx:grid-snap')

        const nextPolygon = [...currentDraft.polygon]
        nextPolygon[dragState.vertexIndex] = snappedPoint

        return {
          ...currentDraft,
          polygon: nextPolygon,
        }
      })
    }

    const commitSlabVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      const draft = slabBoundaryDraftRef.current
      const slab = slabById.get(dragState.slabId)
      if (draft && slab && !polygonsEqual(draft.polygon, slab.polygon)) {
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', suppressClick, true)
        }
        window.addEventListener('click', suppressClick, true)
        requestAnimationFrame(() => {
          window.removeEventListener('click', suppressClick, true)
        })

        updateNode(draft.slabId, {
          polygon: draft.polygon,
        })
        sfxEmitter.emit('sfx:structure-build')
      }

      clearSlabBoundaryInteraction()
      setCursorPoint(null)
    }

    const cancelSlabVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      clearSlabBoundaryInteraction()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitSlabVertexDrag)
    window.addEventListener('pointercancel', cancelSlabVertexDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitSlabVertexDrag)
      window.removeEventListener('pointercancel', cancelSlabVertexDrag)
    }
  }, [
    clearSlabBoundaryInteraction,
    getPlanPointFromClientPoint,
    slabById,
    slabVertexDragState,
    updateNode,
  ])

  useEffect(() => {
    const dragState = zoneVertexDragState
    if (!dragState) {
      return
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint: WallPlanPoint = [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      setCursorPoint(snappedPoint)

      setZoneBoundaryDraft((currentDraft) => {
        if (!currentDraft || currentDraft.zoneId !== dragState.zoneId) {
          return currentDraft
        }

        const currentPoint = currentDraft.polygon[dragState.vertexIndex]
        if (currentPoint && pointsEqual(currentPoint, snappedPoint)) {
          return currentDraft
        }

        sfxEmitter.emit('sfx:grid-snap')

        const nextPolygon = [...currentDraft.polygon]
        nextPolygon[dragState.vertexIndex] = snappedPoint

        return {
          ...currentDraft,
          polygon: nextPolygon,
        }
      })
    }

    const commitZoneVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      const draft = zoneBoundaryDraftRef.current
      const zone = zoneById.get(dragState.zoneId)
      if (draft && zone && !polygonsEqual(draft.polygon, zone.polygon)) {
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', suppressClick, true)
        }
        window.addEventListener('click', suppressClick, true)
        requestAnimationFrame(() => {
          window.removeEventListener('click', suppressClick, true)
        })

        updateNode(draft.zoneId, {
          polygon: draft.polygon,
        })
        sfxEmitter.emit('sfx:structure-build')
      }

      clearZoneBoundaryInteraction()
      setCursorPoint(null)
    }

    const cancelZoneVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      clearZoneBoundaryInteraction()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitZoneVertexDrag)
    window.addEventListener('pointercancel', cancelZoneVertexDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitZoneVertexDrag)
      window.removeEventListener('pointercancel', cancelZoneVertexDrag)
    }
  }, [
    clearZoneBoundaryInteraction,
    getPlanPointFromClientPoint,
    updateNode,
    zoneById,
    zoneVertexDragState,
  ])

  useEffect(() => {
    return () => {
      setFloorplanHovered(false)
    }
  }, [setFloorplanHovered])

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 2) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    panStateRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    setIsPanning(true)

    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const endPanning = useCallback((event?: ReactPointerEvent<SVGSVGElement>) => {
    if (event && panStateRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    panStateRef.current = null
    setIsPanning(false)
  }, [])

  const hoveredWallIdRef = useRef<string | null>(null)
  const emitFloorplanWallLeave = useCallback((wallId: string | null) => {
    if (!wallId) {
      return
    }

    const wallNode = useScene.getState().nodes[wallId as AnyNodeId]
    if (!wallNode || wallNode.type !== 'wall') {
      return
    }

    emitter.emit('wall:leave', {
      node: wallNode,
      position: [0, 0, 0],
      localPosition: [0, 0, 0],
      stopPropagation: () => {},
    } as any)
  }, [])

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (panStateRef.current?.pointerId === event.pointerId) {
        const deltaX = event.clientX - panStateRef.current.clientX
        const deltaY = event.clientY - panStateRef.current.clientY
        const worldPerPixelX = viewBox.width / surfaceSize.width
        const worldPerPixelY = viewBox.height / surfaceSize.height

        updateViewport({
          centerX: (viewport ?? fittedViewport).centerX - deltaX * worldPerPixelX,
          centerY: (viewport ?? fittedViewport).centerY - deltaY * worldPerPixelY,
          width: (viewport ?? fittedViewport).width,
        })

        panStateRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        }
        setCursorPoint(null)
        return
      }

      if (guideInteractionRef.current?.pointerId === event.pointerId) {
        return
      }

      if (wallEndpointDragRef.current?.pointerId === event.pointerId) {
        return
      }

      if (slabVertexDragState?.pointerId === event.pointerId) {
        return
      }

      if (siteVertexDragState?.pointerId === event.pointerId) {
        return
      }

      if (zoneVertexDragState?.pointerId === event.pointerId) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      if (isPolygonBuildActive) {
        const snappedPoint = snapPolygonDraftPoint({
          point: planPoint,
          start: activePolygonDraftPoints[activePolygonDraftPoints.length - 1],
          angleSnap: activePolygonDraftPoints.length > 0 && !shiftPressed,
        })

        setCursorPoint((previousPoint) => {
          const hasChanged = !(previousPoint && pointsEqual(previousPoint, snappedPoint))
          if (hasChanged && activePolygonDraftPoints.length > 0) {
            sfxEmitter.emit('sfx:grid-snap')
          }
          return snappedPoint
        })
        return
      }

      if (isOpeningPlacementActive) {
        const closest = findClosestWallPoint(planPoint, walls)
        if (closest) {
          const dx = closest.wall.end[0] - closest.wall.start[0]
          const dz = closest.wall.end[1] - closest.wall.start[1]
          const length = Math.sqrt(dx * dx + dz * dz)
          const distance = closest.t * length

          const wallEvent = {
            node: closest.wall,
            point: { x: closest.point[0], y: 0, z: closest.point[1] },
            localPosition: [distance, floorplanOpeningLocalY, 0] as [number, number, number],
            normal: closest.normal,
            stopPropagation: () => {},
          }

          if (hoveredWallIdRef.current !== closest.wall.id) {
            if (hoveredWallIdRef.current) {
              emitFloorplanWallLeave(hoveredWallIdRef.current)
            }
            hoveredWallIdRef.current = closest.wall.id
            emitter.emit('wall:enter', wallEvent as any)
          } else {
            emitter.emit('wall:move', wallEvent as any)
          }
        } else if (hoveredWallIdRef.current) {
          emitFloorplanWallLeave(hoveredWallIdRef.current)
          hoveredWallIdRef.current = null
        }
        return
      }

      // 标定模式下也要更新 cursorPoint，让 CalibrationOverlay 能渲染悬停预览
      const calForHover = useEditor.getState().calibration
      if (calForHover?.active && calForHover.points.length < 2) {
        const calResult = snapCalibrationPoint(
          [planPoint[0], planPoint[1]],
          walls,
          calForHover.points,
          calibrationGuideAnchors,
          !shiftPressed && calForHover.points.length === 1,
        )
        setCursorPoint(calResult.point)
        return
      }

      // 对齐模式下也要更新 cursorPoint，让 LevelAlignmentOverlay 渲染实时吸附预览
      // 传入原始鼠标位置即可，Overlay 内部会做 snapAlignmentPoint 计算
      if (useEditor.getState().levelAlignment?.active) {
        setCursorPoint(planPoint)
        return
      }

      if (!isWallBuildActive) {
        setCursorPoint(null)
        setTrackingHit(null)
        setExtensionHit(null)
        setPerpendicularHit(null)
        // 剥离选择：按垂直距离确定悬停墙体，解决 T/X 交叉点选择歧义
        // 只在 select+click 模式下运行（不影响画墙/删除/框选等其他模式）
        // tolerance = 命中线宽（保证与 SVG 点击区一致）+ 墙半厚（覆盖填充区域边缘，避免厚墙外侧无法选中）
        if (canSelectElementFloorplanGeometry) {
          const hoverPt = toPoint2D(planPoint)
          let bestId: string | null = null
          let bestDist = Infinity
          for (const { wall } of displayWallPolygons) {
            const d = getDistanceToWallSegment(hoverPt, wall.start, wall.end)
            const wallTolerance = floorplanWallHitTolerance + (wall.thickness ?? 0) / 2
            if (d < wallTolerance && d < bestDist) {
              bestDist = d
              bestId = wall.id
            }
          }
          setHoveredWallId(bestId as `wall_${string}` | null)
        }
        return
      }

      // 自动参考线追踪 —— 只在已经有 draftStart（chain 画墙激活）时启用
      // 优先级：正交追踪 > 垂直追踪 > 延长线追踪 > 角度/网格吸附
      let trackedPoint: WallPlanPoint | null = null
      let nextTrackingHit: OrthogonalTrackingHit | null = null
      let nextExtensionHit: ExtensionTrackingHit | null = null
      let nextPerpendicularHit: WallPerpendicularHit | null = null
      if (draftStart && !shiftPressed) {
        // 像素级容差转换到世界单位，保证缩放时手感稳定
        const tolerance = floorplanWorldUnitsPerPixel * 8
        // (1) 正交追踪（世界坐标轴对齐，适合轴对齐的墙）
        const candidates = collectTrackingCandidates({
          walls,
          draftStart,
          cursor: planPoint,
          distanceLimit: 4, // 4 米内的端点参与追踪
        })
        const orthoHit = computeOrthogonalTracking({
          cursor: planPoint,
          candidates,
          tolerance,
        })
        if (orthoHit) {
          nextTrackingHit = orthoHit
          trackedPoint = orthoHit.snappedPoint
        } else {
          // (2) 垂直追踪：光标在某条已有墙端点的垂直方向上（拐角直角辅助）
          const perpHit = computeWallPerpendicularTracking({
            cursor: planPoint,
            walls,
            tolerance,
          })
          if (perpHit) {
            nextPerpendicularHit = perpHit
            trackedPoint = perpHit.snappedPoint
          } else {
            // (3) 延长线追踪：光标在某条已有墙的无限延长线上（断墙续接辅助）
            const extHit = computeExtensionTracking({
              cursor: planPoint,
              walls,
              tolerance: floorplanWorldUnitsPerPixel * 10, // 延长线用稍宽容差
            })
            if (extHit) {
              nextExtensionHit = extHit
              trackedPoint = extHit.snappedPoint
            }
          }
        }
      }

      const snappedPoint = trackedPoint
        ? snapWallDraftPoint({
            point: trackedPoint,
            walls,
            start: draftStart ?? undefined,
            angleSnap: false,  // 追踪命中时不再做 45° 吸附
            noGridSnap: true,  // 追踪命中时不再做网格吸附
            worldUnitsPerPixel: floorplanWorldUnitsPerPixel,
          })
        : snapWallDraftPoint({
            point: planPoint,
            walls,
            start: draftStart ?? undefined,
            angleSnap: Boolean(draftStart) && !shiftPressed,
            worldUnitsPerPixel: floorplanWorldUnitsPerPixel,
          })

      // 记录端点吸附结果：检查 snappedPoint 是否精确落在某个已有端点上（1mm 以内）
      // click 时若光标在 60px 内则直接用它，消除 hover→click 的坐标漂移问题
      {
        const epHit = findWallSnapTarget(snappedPoint, walls, { radius: 0.001 })
        lastHoverEndpointRef.current = epHit?.kind === 'endpoint' ? snappedPoint : null
      }

      setCursorPoint(snappedPoint)
      setTrackingHit(nextTrackingHit)
      setExtensionHit(nextExtensionHit)
      setPerpendicularHit(nextPerpendicularHit)

      if (!draftStart) {
        return
      }

      setDraftEnd((previousEnd) => {
        if (
          !previousEnd ||
          previousEnd[0] !== snappedPoint[0] ||
          previousEnd[1] !== snappedPoint[1]
        ) {
          sfxEmitter.emit('sfx:grid-snap')
        }

        return snappedPoint
      })
    },
    [
      calibrationGuideAnchors,
      canSelectElementFloorplanGeometry,
      displayWallPolygons,
      draftStart,
      emitFloorplanWallLeave,
      floorplanOpeningLocalY,
      floorplanWallHitTolerance,
      floorplanWorldUnitsPerPixel,
      fittedViewport,
      getPlanPointFromClientPoint,
      activePolygonDraftPoints,
      isOpeningPlacementActive,
      isPolygonBuildActive,
      isWallBuildActive,
      siteVertexDragState,
      slabVertexDragState,
      shiftPressed,
      surfaceSize.height,
      surfaceSize.width,
      updateViewport,
      viewBox.height,
      viewBox.width,
      viewport,
      walls,
      zoneVertexDragState,
    ],
  )

  const handleSlabPlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      const lastPoint = slabDraftPoints[slabDraftPoints.length - 1]
      if (lastPoint && pointsEqual(lastPoint, point)) {
        return
      }

      const firstPoint = slabDraftPoints[0]
      if (firstPoint && slabDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint)) {
        createSlabOnCurrentLevel(slabDraftPoints)
        clearDraft()
        return
      }

      setSlabDraftPoints((currentPoints) => [...currentPoints, point])
      setCursorPoint(point)
    },
    [clearDraft, createSlabOnCurrentLevel, slabDraftPoints],
  )
  const handleSlabPlacementConfirm = useCallback(
    (point?: WallPlanPoint) => {
      const firstPoint = slabDraftPoints[0]
      const lastPoint = slabDraftPoints[slabDraftPoints.length - 1]

      let nextPoints = slabDraftPoints
      if (point) {
        const isClosingExistingPolygon = Boolean(
          firstPoint && slabDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint),
        )
        const isDuplicatePoint = Boolean(lastPoint && pointsEqual(lastPoint, point))

        if (!(isClosingExistingPolygon || isDuplicatePoint)) {
          nextPoints = [...slabDraftPoints, point]
        }
      }

      if (nextPoints.length < 3) {
        return
      }

      createSlabOnCurrentLevel(nextPoints)
      clearDraft()
    },
    [clearDraft, createSlabOnCurrentLevel, slabDraftPoints],
  )
  const handleZonePlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      const lastPoint = zoneDraftPoints[zoneDraftPoints.length - 1]
      if (lastPoint && pointsEqual(lastPoint, point)) {
        return
      }

      const firstPoint = zoneDraftPoints[0]
      if (firstPoint && zoneDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint)) {
        createZoneOnCurrentLevel(zoneDraftPoints)
        clearDraft()
        return
      }

      setZoneDraftPoints((currentPoints) => [...currentPoints, point])
      setCursorPoint(point)
    },
    [clearDraft, createZoneOnCurrentLevel, zoneDraftPoints],
  )
  const handleZonePlacementConfirm = useCallback(
    (point?: WallPlanPoint) => {
      const firstPoint = zoneDraftPoints[0]
      const lastPoint = zoneDraftPoints[zoneDraftPoints.length - 1]

      let nextPoints = zoneDraftPoints
      if (point) {
        const isClosingExistingPolygon = Boolean(
          firstPoint && zoneDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint),
        )
        const isDuplicatePoint = Boolean(lastPoint && pointsEqual(lastPoint, point))

        if (!(isClosingExistingPolygon || isDuplicatePoint)) {
          nextPoints = [...zoneDraftPoints, point]
        }
      }

      if (nextPoints.length < 3) {
        return
      }

      createZoneOnCurrentLevel(nextPoints)
      clearDraft()
    },
    [clearDraft, createZoneOnCurrentLevel, zoneDraftPoints],
  )

  const handleWallPlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      if (!draftStart) {
        setDraftStart(point)
        setDraftEnd(point)
        setCursorPoint(point)
        return
      }

      if (!isWallLongEnough(draftStart, point)) {
        return
      }

      createWallOnCurrentLevel(draftStart, point)

      // Chain 画墙：新墙的起点 = 刚画完的墙的终点
      // 按 Escape 键断开 chain
      setDraftStart(point)
      setDraftEnd(point)
      setCursorPoint(point)
    },
    [draftStart],
  )

  const handleBackgroundClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      // 标定模式：已在 onPointerDownCapture 中处理，click 阶段直接跳过
      const cal = useEditor.getState().calibration
      if (cal?.active) return

      if (isPolygonBuildActive && event.detail >= 2) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      if (isOpeningPlacementActive) {
        const closest = findClosestWallPoint(planPoint, walls)
        if (closest) {
          const dx = closest.wall.end[0] - closest.wall.start[0]
          const dz = closest.wall.end[1] - closest.wall.start[1]
          const length = Math.sqrt(dx * dx + dz * dz)
          const distance = closest.t * length

          emitter.emit('wall:click', {
            node: closest.wall,
            point: { x: closest.point[0], y: 0, z: closest.point[1] },
            localPosition: [distance, floorplanOpeningLocalY, 0],
            normal: closest.normal,
            stopPropagation: () => {},
          } as any)
        }
        return
      }

      if (isPolygonBuildActive) {
        const snappedPoint = snapPolygonDraftPoint({
          point: planPoint,
          start: activePolygonDraftPoints[activePolygonDraftPoints.length - 1],
          angleSnap: activePolygonDraftPoints.length > 0 && !shiftPressed,
        })

        if (isZoneBuildActive) {
          handleZonePlacementPoint(snappedPoint)
        } else {
          handleSlabPlacementPoint(snappedPoint)
        }
        return
      }

      if (canSelectFloorplanZones) {
        const zoneHit = visibleZonePolygons.find(({ polygon }) =>
          isPointInsidePolygon(toPoint2D(planPoint), polygon),
        )
        if (zoneHit) {
          setSelectedReferenceId(null)
          setSelection({ zoneId: zoneHit.zone.id })
          return
        }
      }

      if (!isWallBuildActive) {
        if (structureLayer === 'zones') {
          setSelectedReferenceId(null)
          setSelection({ zoneId: null })
        } else {
          setSelectedReferenceId(null)
          setSelection({ selectedIds: [] })
        }
        return
      }

      // 点击时与 handlePointerMove 保持一致：先做追踪约束，再做吸附
      // 若跳过追踪，tracking 把光标拉到端点附近后用户点击，但 raw 光标可能超出吸附半径，导致连接失败
      let clickBasePoint: WallPlanPoint = planPoint
      let trackingHit = false
      if (draftStart && !shiftPressed) {
        const tolerance = floorplanWorldUnitsPerPixel * 8
        const candidates = collectTrackingCandidates({
          walls,
          draftStart,
          cursor: planPoint,
          distanceLimit: 4,
        })
        const orthoHit = computeOrthogonalTracking({ cursor: planPoint, candidates, tolerance })
        if (orthoHit) {
          clickBasePoint = orthoHit.snappedPoint
          trackingHit = true
        } else {
          const perpHit = computeWallPerpendicularTracking({ cursor: planPoint, walls, tolerance })
          if (perpHit) {
            clickBasePoint = perpHit.snappedPoint
            trackingHit = true
          } else {
            const extHit = computeExtensionTracking({
              cursor: planPoint,
              walls,
              tolerance: floorplanWorldUnitsPerPixel * 10,
            })
            if (extHit) {
              clickBasePoint = extHit.snappedPoint
              trackingHit = true
            }
          }
        }
      }

      const snappedPoint = snapWallDraftPoint({
        point: clickBasePoint,
        walls,
        start: draftStart ?? undefined,
        angleSnap: Boolean(draftStart) && !shiftPressed && !trackingHit,
        noGridSnap: trackingHit,
        worldUnitsPerPixel: floorplanWorldUnitsPerPixel,
      })

      // Preview 优先：如果 hover 最后一帧已经把端点吸附好了，click 就用那个端点
      // 这样可以消除"preview 看到连接、click 却落偏"的问题
      // 条件：1) hover 记录了端点吸附  2) click 落点与该端点在 60px 内（容许手抖/拖拽释放偏移）
      let finalPoint = snappedPoint
      const lastEp = lastHoverEndpointRef.current
      if (lastEp && floorplanWorldUnitsPerPixel) {
        const CONFIRM_PIXELS = 60
        const confirmRadius = CONFIRM_PIXELS * floorplanWorldUnitsPerPixel
        const dx = planPoint[0] - lastEp[0]
        const dz = planPoint[1] - lastEp[1]
        if (dx * dx + dz * dz <= confirmRadius * confirmRadius) {
          finalPoint = lastEp
        }
      }

      handleWallPlacementPoint(finalPoint)
    },
    [
      draftStart,
      floorplanOpeningLocalY,
      floorplanWorldUnitsPerPixel,
      getPlanPointFromClientPoint,
      activePolygonDraftPoints,
      canSelectFloorplanZones,
      handleSlabPlacementPoint,
      handleZonePlacementPoint,
      handleWallPlacementPoint,
      isOpeningPlacementActive,
      isPolygonBuildActive,
      isWallBuildActive,
      isZoneBuildActive,
      setSelectedReferenceId,
      setSelection,
      shiftPressed,
      structureLayer,
      visibleZonePolygons,
      walls,
    ],
  )
  const handleBackgroundDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (!isPolygonBuildActive) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint = snapPolygonDraftPoint({
        point: planPoint,
        start: activePolygonDraftPoints[activePolygonDraftPoints.length - 1],
        angleSnap: activePolygonDraftPoints.length > 0 && !shiftPressed,
      })

      if (isZoneBuildActive) {
        handleZonePlacementConfirm(snappedPoint)
      } else {
        handleSlabPlacementConfirm(snappedPoint)
      }
    },
    [
      activePolygonDraftPoints,
      getPlanPointFromClientPoint,
      handleSlabPlacementConfirm,
      handleZonePlacementConfirm,
      isPolygonBuildActive,
      isZoneBuildActive,
      shiftPressed,
    ],
  )

  const commitFloorplanSelection = useCallback(
    (nextSelectedIds: string[]) => {
      if (!(levelId && levelNode) || levelNode.type !== 'level') {
        setSelectedReferenceId(null)
        setSelection({ selectedIds: nextSelectedIds })
        return
      }

      const { selection } = useViewer.getState()
      const nodes = useScene.getState().nodes
      const updates: Parameters<typeof setSelection>[0] = {
        selectedIds: nextSelectedIds,
      }

      if (levelId !== selection.levelId) {
        updates.levelId = levelId
      }

      const parentNode = levelNode.parentId ? nodes[levelNode.parentId as AnyNodeId] : null
      if (parentNode?.type === 'building' && parentNode.id !== selection.buildingId) {
        updates.buildingId = parentNode.id
      }

      setSelectedReferenceId(null)
      setSelection(updates)
    },
    [levelId, levelNode, setSelectedReferenceId, setSelection],
  )

  const addFloorplanSelection = useCallback(
    (nextSelectedIds: string[], modifierKeys?: { meta: boolean; ctrl: boolean }) => {
      const shouldAppend = Boolean(modifierKeys?.meta || modifierKeys?.ctrl)

      if (shouldAppend) {
        if (nextSelectedIds.length === 0) {
          return
        }

        const currentSelectedIds = useViewer.getState().selection.selectedIds
        commitFloorplanSelection(Array.from(new Set([...currentSelectedIds, ...nextSelectedIds])))
        return
      }

      commitFloorplanSelection(nextSelectedIds)
    },
    [commitFloorplanSelection],
  )

  const toggleFloorplanSelection = useCallback(
    (nodeId: string, modifierKeys?: { meta: boolean; ctrl: boolean }) => {
      const shouldToggle = Boolean(modifierKeys?.meta || modifierKeys?.ctrl)

      if (shouldToggle) {
        const currentSelectedIds = useViewer.getState().selection.selectedIds
        commitFloorplanSelection(
          currentSelectedIds.includes(nodeId)
            ? currentSelectedIds.filter((selectedId) => selectedId !== nodeId)
            : [...currentSelectedIds, nodeId],
        )
        return
      }

      commitFloorplanSelection([nodeId])
    },
    [commitFloorplanSelection],
  )

  const getFloorplanHitIdAtPoint = useCallback(
    (planPoint: WallPlanPoint) => {
      const point = toPoint2D(planPoint)

      const openingHit = openingsPolygons.find(({ polygon }) => {
        if (isPointInsidePolygon(point, polygon)) {
          return true
        }

        const centerLine = getOpeningCenterLine(polygon)
        if (!centerLine) {
          return false
        }

        return (
          getDistanceToWallSegment(
            point,
            [centerLine.start.x, centerLine.start.y],
            [centerLine.end.x, centerLine.end.y],
          ) <= floorplanOpeningHitTolerance
        )
      })
      if (openingHit) {
        return openingHit.opening.id
      }

      const wallHit = displayWallPolygons.find(
        ({ wall, polygon }) =>
          isPointInsidePolygon(point, polygon) ||
          getDistanceToWallSegment(point, wall.start, wall.end) <= floorplanWallHitTolerance,
      )
      if (wallHit) {
        return wallHit.wall.id
      }

      const slabHit = displaySlabPolygons.find(({ polygon, holes }) =>
        isPointInsidePolygonWithHoles(point, polygon, holes),
      )
      if (slabHit) {
        return slabHit.slab.id
      }

      return null
    },
    [
      displaySlabPolygons,
      displayWallPolygons,
      floorplanOpeningHitTolerance,
      floorplanWallHitTolerance,
      openingsPolygons,
    ],
  )

  const getFloorplanSelectionIdsInBounds = useCallback(
    (bounds: FloorplanSelectionBounds) => {
      const wallIds = displayWallPolygons
        .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
        .map(({ wall }) => wall.id)
      const openingIds = openingsPolygons
        .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
        .map(({ opening }) => opening.id)
      const slabIds = displaySlabPolygons
        .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
        .map(({ slab }) => slab.id)

      return Array.from(new Set([...wallIds, ...openingIds, ...slabIds]))
    },
    [displaySlabPolygons, displayWallPolygons, openingsPolygons],
  )

  const handleWallSelect = useCallback(
    (wall: WallNode) => {
      commitFloorplanSelection([wall.id])
    },
    [commitFloorplanSelection],
  )

  const handleWallClick = useCallback(
    (wall: WallNode, event: ReactMouseEvent<SVGElement>) => {
      // 剥离选择：距离追踪锁定的墙优先于 SVG z 序命中的墙
      // 解决 T/X 型交叉点处"点到哪面墙就选哪面"的歧义
      const targetWall =
        hoveredWallId && hoveredWallId !== wall.id
          ? (displayWallPolygons.find(({ wall: w }) => w.id === hoveredWallId)?.wall ?? wall)
          : wall

      const centerX = (targetWall.start[0] + targetWall.end[0]) / 2
      const centerZ = (targetWall.start[1] + targetWall.end[1]) / 2
      const halfLength =
        Math.hypot(targetWall.end[0] - targetWall.start[0], targetWall.end[1] - targetWall.start[1]) / 2
      const localY = isOpeningPlacementActive ? floorplanOpeningLocalY : 0

      setSelectedReferenceId(null)
      emitter.emit('wall:click', {
        node: targetWall,
        position: [centerX, 0, centerZ],
        localPosition: [halfLength, localY, 0],
        stopPropagation: () => event.stopPropagation(),
        nativeEvent: event.nativeEvent as any,
      } as any)
    },
    [displayWallPolygons, floorplanOpeningLocalY, hoveredWallId, isOpeningPlacementActive, setSelectedReferenceId],
  )

  const handleWallDoubleClick = useCallback(
    (wall: WallNode, event: ReactMouseEvent<SVGElement>) => {
      const centerX = (wall.start[0] + wall.end[0]) / 2
      const centerZ = (wall.start[1] + wall.end[1]) / 2
      const halfLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) / 2

      emitter.emit('wall:double-click', {
        node: wall,
        position: [centerX, 0, centerZ],
        localPosition: [halfLength, 0, 0],
        stopPropagation: () => event.stopPropagation(),
        nativeEvent: event.nativeEvent as any,
      } as any)
      emitter.emit('camera-controls:focus', { nodeId: wall.id })
    },
    [],
  )
  const emitFloorplanNodeClick = useCallback(
    (
      nodeId: SlabNode['id'] | OpeningNode['id'] | ZoneNodeType['id'],
      event: ReactMouseEvent<SVGElement>,
    ) => {
      const node = useScene.getState().nodes[nodeId as AnyNodeId]
      if (
        !(
          node &&
          (node.type === 'slab' ||
            node.type === 'door' ||
            node.type === 'window' ||
            node.type === 'zone')
        )
      ) {
        return
      }

      setSelectedReferenceId(null)
      emitter.emit(
        `${node.type}:click` as any,
        {
          localPosition: [0, 0, 0],
          nativeEvent: event.nativeEvent as any,
          node,
          position: [0, 0, 0],
          stopPropagation: () => event.stopPropagation(),
        } as any,
      )
    },
    [setSelectedReferenceId],
  )
  const handleGuideSelect = useCallback(
    (guideId: GuideNode['id']) => {
      setSelectedReferenceId(guideId)
      setSelection({ selectedIds: [], zoneId: null })
    },
    [setSelectedReferenceId, setSelection],
  )
  const handleGuideCornerPointerDown = useCallback(
    (
      guide: GuideNode,
      dimensions: GuideImageDimensions,
      corner: GuideCorner,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0 || !canInteractWithGuides) {
        return
      }

      const aspectRatio = dimensions.width / dimensions.height
      if (!(aspectRatio > 0)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      setHoveredGuideCorner(null)
      handleGuideSelect(guide.id)

      const centerSvg = getGuideCenterSvgPoint(guide)
      const rotationSvg = -guide.rotation[1]
      const width = getGuideWidth(guide.scale)
      const height = getGuideHeight(width, aspectRatio)
      const [cornerOffsetX, cornerOffsetY] = getGuideCornerLocalOffset(width, height, corner)
      const shouldRotate = event.ctrlKey || event.metaKey

      guideInteractionRef.current = {
        pointerId: event.pointerId,
        guideId: guide.id,
        corner,
        mode: shouldRotate ? 'rotate' : 'resize',
        aspectRatio,
        centerSvg,
        oppositeCornerSvg: shouldRotate
          ? null
          : getGuideCornerSvgPoint(
              centerSvg,
              width,
              height,
              rotationSvg,
              oppositeGuideCorner[corner],
            ),
        pointerOffsetSvg: [0, 0],
        rotationSvg,
        cornerBaseAngle: Math.atan2(cornerOffsetY, cornerOffsetX),
        scale: guide.scale,
      }

      document.body.style.userSelect = 'none'
      document.body.style.cursor = shouldRotate
        ? getGuideRotateCursor(theme === 'dark')
        : getGuideResizeCursor(corner, rotationSvg)

      const nextDraft: GuideTransformDraft = {
        guideId: guide.id,
        position: [guide.position[0], guide.position[2]],
        scale: guide.scale,
        rotation: guide.rotation[1],
      }

      guideTransformDraftRef.current = nextDraft
      setGuideTransformDraft(nextDraft)
    },
    [canInteractWithGuides, handleGuideSelect, theme],
  )
  const handleGuideTranslateStart = useCallback(
    (guide: GuideNode, event: ReactPointerEvent<SVGRectElement>) => {
      if (event.button !== 0 || !canInteractWithGuides || selectedGuideId !== guide.id) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
      if (!svgPoint) {
        return
      }

      const centerSvg = getGuideCenterSvgPoint(guide)

      guideInteractionRef.current = {
        pointerId: event.pointerId,
        guideId: guide.id,
        corner: 'nw',
        mode: 'translate',
        aspectRatio: 1,
        centerSvg,
        oppositeCornerSvg: null,
        pointerOffsetSvg: subtractSvgPoints(svgPoint, centerSvg),
        rotationSvg: -guide.rotation[1],
        cornerBaseAngle: 0,
        scale: guide.scale,
      }

      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'

      const nextDraft: GuideTransformDraft = {
        guideId: guide.id,
        position: [guide.position[0], guide.position[2]],
        scale: guide.scale,
        rotation: guide.rotation[1],
      }

      guideTransformDraftRef.current = nextDraft
      setGuideTransformDraft(nextDraft)
    },
    [canInteractWithGuides, getSvgPointFromClientPoint, selectedGuideId],
  )

  const handleOpeningSelect = useCallback(
    (openingId: OpeningNode['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(openingId, event)
    },
    [emitFloorplanNodeClick],
  )
  const handleOpeningPointerDown = useCallback(
    (openingId: OpeningNode['id'], event: ReactPointerEvent<SVGElement>) => {
      if (event.button !== 0) {
        return
      }

      const opening = selectedOpeningEntry?.opening
      if (!opening || opening.id !== openingId) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      // Suppress the click event that follows this pointer interaction so it
      // doesn't re-select or interfere with placement.
      const suppressClick = (clickEvent: MouseEvent) => {
        clickEvent.stopImmediatePropagation()
        clickEvent.preventDefault()
        window.removeEventListener('click', suppressClick, true)
      }
      window.addEventListener('click', suppressClick, true)
      requestAnimationFrame(() => {
        window.removeEventListener('click', suppressClick, true)
      })

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(opening)
      setSelection({ selectedIds: [] })
    },
    [selectedOpeningEntry, setMovingNode, setSelection],
  )
  const handleSlabSelect = useCallback(
    (slabId: SlabNode['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(slabId, event)
    },
    [emitFloorplanNodeClick],
  )
  const handleZoneSelect = useCallback(
    (zoneId: ZoneNodeType['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(zoneId, event)
    },
    [emitFloorplanNodeClick],
  )
  const handleSlabDoubleClick = useCallback((slab: SlabNode) => {
    emitter.emit('camera-controls:focus', { nodeId: slab.id })
  }, [])
  const handleOpeningDoubleClick = useCallback((opening: OpeningNode) => {
    emitter.emit('camera-controls:focus', { nodeId: opening.id })
  }, [])
  const handleSelectedOpeningMove = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const opening = selectedOpeningEntry?.opening
      if (!opening) {
        return
      }

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(opening)
      setSelection({ selectedIds: [] })
    },
    [selectedOpeningEntry, setMovingNode, setSelection],
  )
  const duplicateSelectedOpening = useCallback(() => {
    const opening = selectedOpeningEntry?.opening
    if (!opening?.parentId) {
      return
    }

    sfxEmitter.emit('sfx:item-pick')
    useScene.temporal.getState().pause()

    const cloned = structuredClone(opening) as Record<string, unknown>
    delete cloned.id
    cloned.metadata = {
      ...(typeof cloned.metadata === 'object' && cloned.metadata !== null ? cloned.metadata : {}),
      isNew: true,
    }

    const duplicate = opening.type === 'door' ? DoorNode.parse(cloned) : WindowNode.parse(cloned)

    useScene.getState().createNode(duplicate, opening.parentId as AnyNodeId)
    setMovingNode(duplicate)
    setSelection({ selectedIds: [] })
  }, [selectedOpeningEntry, setMovingNode, setSelection])
  const handleSelectedOpeningDuplicate = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      duplicateSelectedOpening()
    },
    [duplicateSelectedOpening],
  )
  const handleSelectedOpeningDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const opening = selectedOpeningEntry?.opening
      if (!opening) {
        return
      }

      sfxEmitter.emit('sfx:item-delete')
      deleteNode(opening.id as AnyNodeId)
      if (opening.parentId) {
        useScene.getState().dirtyNodes.add(opening.parentId as AnyNodeId)
      }
      setSelection({ selectedIds: [] })
    },
    [deleteNode, selectedOpeningEntry, setSelection],
  )

  const handleWallEndpointPointerDown = useCallback(
    (wall: WallNode, endpoint: WallEndpoint, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredEndpointId(null)

      const movingPoint = endpoint === 'start' ? wall.start : wall.end

      if (isWallBuildActive) {
        handleWallPlacementPoint(movingPoint)
        return
      }

      if (mode !== 'select') {
        return
      }

      clearWallPlacementDraft()
      handleWallSelect(wall)

      const fixedPoint = endpoint === 'start' ? wall.end : wall.start

      wallEndpointDragRef.current = {
        pointerId: event.pointerId,
        wallId: wall.id,
        endpoint,
        fixedPoint,
        currentPoint: movingPoint,
      }

      setWallEndpointDraft(buildWallEndpointDraft(wall.id, endpoint, fixedPoint, movingPoint))
      setCursorPoint(movingPoint)
    },
    [clearWallPlacementDraft, handleWallPlacementPoint, handleWallSelect, isWallBuildActive, mode],
  )
  const handleSlabVertexPointerDown = useCallback(
    (slabId: SlabNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSlabHandleId(null)

      const slabEntry = displaySlabPolygons.find(({ slab }) => slab.id === slabId)
      const vertexPoint = slabEntry?.polygon[vertexIndex]
      if (!(slabEntry && vertexPoint)) {
        return
      }

      setSlabBoundaryDraft({
        slabId,
        polygon: slabEntry.polygon.map(toWallPlanPoint),
      })
      setSlabVertexDragState({
        pointerId: event.pointerId,
        slabId,
        vertexIndex,
      })
      setCursorPoint(toWallPlanPoint(vertexPoint))
    },
    [displaySlabPolygons],
  )
  const handleSlabVertexDoubleClick = useCallback(
    (slabId: SlabNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const slab = slabById.get(slabId)
      if (!(slab && slab.polygon.length > 3)) {
        return
      }

      slabBoundaryDraftRef.current = null
      clearSlabBoundaryInteraction()

      updateNode(slabId, {
        polygon: slab.polygon.filter((_, index) => index !== vertexIndex),
      })
    },
    [clearSlabBoundaryInteraction, slabById, updateNode],
  )
  const handleSlabMidpointPointerDown = useCallback(
    (slabId: SlabNode['id'], edgeIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSlabHandleId(null)

      const slabEntry = displaySlabPolygons.find(({ slab }) => slab.id === slabId)
      if (!slabEntry) {
        return
      }

      const basePolygon = slabEntry.polygon.map(toWallPlanPoint)
      const startPoint = basePolygon[edgeIndex]
      const endPoint = basePolygon[(edgeIndex + 1) % basePolygon.length]
      if (!(startPoint && endPoint)) {
        return
      }

      const insertedPoint: WallPlanPoint = [
        (startPoint[0] + endPoint[0]) / 2,
        (startPoint[1] + endPoint[1]) / 2,
      ]
      const insertIndex = edgeIndex + 1
      const nextPolygon = [
        ...basePolygon.slice(0, insertIndex),
        insertedPoint,
        ...basePolygon.slice(insertIndex),
      ]

      setSlabBoundaryDraft({
        slabId,
        polygon: nextPolygon,
      })
      setSlabVertexDragState({
        pointerId: event.pointerId,
        slabId,
        vertexIndex: insertIndex,
      })
      setCursorPoint(insertedPoint)
    },
    [displaySlabPolygons],
  )
  const handleSiteVertexPointerDown = useCallback(
    (siteId: SiteNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSiteHandleId(null)

      if (!(displaySitePolygon && displaySitePolygon.site.id === siteId)) {
        return
      }

      const vertexPoint = displaySitePolygon.polygon[vertexIndex]
      if (!vertexPoint) {
        return
      }

      setSiteBoundaryDraft({
        siteId,
        polygon: displaySitePolygon.polygon.map(toWallPlanPoint),
      })
      setSiteVertexDragState({
        pointerId: event.pointerId,
        siteId,
        vertexIndex,
      })
      setCursorPoint(toWallPlanPoint(vertexPoint))
    },
    [displaySitePolygon],
  )
  const handleSiteVertexDoubleClick = useCallback(
    (siteId: SiteNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (!(site && site.id === siteId && (site.polygon?.points?.length ?? 0) > 3)) {
        return
      }

      siteBoundaryDraftRef.current = null
      clearSiteBoundaryInteraction()

      updateNode(siteId, {
        polygon: {
          type: 'polygon',
          points: site.polygon.points.filter((_, index) => index !== vertexIndex),
        },
      })
    },
    [clearSiteBoundaryInteraction, site, updateNode],
  )
  const handleSiteMidpointPointerDown = useCallback(
    (siteId: SiteNode['id'], edgeIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSiteHandleId(null)

      if (!(displaySitePolygon && displaySitePolygon.site.id === siteId)) {
        return
      }

      const basePolygon = displaySitePolygon.polygon.map(toWallPlanPoint)
      const startPoint = basePolygon[edgeIndex]
      const endPoint = basePolygon[(edgeIndex + 1) % basePolygon.length]
      if (!(startPoint && endPoint)) {
        return
      }

      const insertedPoint: WallPlanPoint = [
        (startPoint[0] + endPoint[0]) / 2,
        (startPoint[1] + endPoint[1]) / 2,
      ]
      const insertIndex = edgeIndex + 1
      const nextPolygon = [
        ...basePolygon.slice(0, insertIndex),
        insertedPoint,
        ...basePolygon.slice(insertIndex),
      ]

      setSiteBoundaryDraft({
        siteId,
        polygon: nextPolygon,
      })
      setSiteVertexDragState({
        pointerId: event.pointerId,
        siteId,
        vertexIndex: insertIndex,
      })
      setCursorPoint(insertedPoint)
    },
    [displaySitePolygon],
  )
  const handleZoneVertexPointerDown = useCallback(
    (
      zoneId: ZoneNodeType['id'],
      vertexIndex: number,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredZoneHandleId(null)

      const zoneEntry = displayZonePolygons.find(({ zone }) => zone.id === zoneId)
      const vertexPoint = zoneEntry?.polygon[vertexIndex]
      if (!(zoneEntry && vertexPoint)) {
        return
      }

      setZoneBoundaryDraft({
        zoneId,
        polygon: zoneEntry.polygon.map(toWallPlanPoint),
      })
      setZoneVertexDragState({
        pointerId: event.pointerId,
        zoneId,
        vertexIndex,
      })
      setCursorPoint(toWallPlanPoint(vertexPoint))
    },
    [displayZonePolygons],
  )
  const handleZoneVertexDoubleClick = useCallback(
    (
      zoneId: ZoneNodeType['id'],
      vertexIndex: number,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const zone = zoneById.get(zoneId)
      if (!(zone && zone.polygon.length > 3)) {
        return
      }

      zoneBoundaryDraftRef.current = null
      clearZoneBoundaryInteraction()

      updateNode(zoneId, {
        polygon: zone.polygon.filter((_, index) => index !== vertexIndex),
      })
    },
    [clearZoneBoundaryInteraction, updateNode, zoneById],
  )
  const handleZoneMidpointPointerDown = useCallback(
    (zoneId: ZoneNodeType['id'], edgeIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredZoneHandleId(null)

      const zoneEntry = displayZonePolygons.find(({ zone }) => zone.id === zoneId)
      if (!zoneEntry) {
        return
      }

      const basePolygon = zoneEntry.polygon.map(toWallPlanPoint)
      const startPoint = basePolygon[edgeIndex]
      const endPoint = basePolygon[(edgeIndex + 1) % basePolygon.length]
      if (!(startPoint && endPoint)) {
        return
      }

      const insertedPoint: WallPlanPoint = [
        (startPoint[0] + endPoint[0]) / 2,
        (startPoint[1] + endPoint[1]) / 2,
      ]
      const insertIndex = edgeIndex + 1
      const nextPolygon = [
        ...basePolygon.slice(0, insertIndex),
        insertedPoint,
        ...basePolygon.slice(insertIndex),
      ]

      setZoneBoundaryDraft({
        zoneId,
        polygon: nextPolygon,
      })
      setZoneVertexDragState({
        pointerId: event.pointerId,
        zoneId,
        vertexIndex: insertIndex,
      })
      setCursorPoint(insertedPoint)
    },
    [displayZonePolygons],
  )

  const handlePointerLeave = useCallback(() => {
    if (
      !(
        panStateRef.current ||
        wallEndpointDragRef.current ||
        siteVertexDragState ||
        slabVertexDragState ||
        zoneVertexDragState
      )
    ) {
      setCursorPoint(null)
    }
    setHoveredOpeningId(null)
    setHoveredWallId(null)
    setHoveredEndpointId(null)
    setHoveredSiteHandleId(null)
    setHoveredSlabHandleId(null)
    setHoveredZoneHandleId(null)
    if (hoveredWallIdRef.current) {
      emitFloorplanWallLeave(hoveredWallIdRef.current)
      hoveredWallIdRef.current = null
    }
  }, [emitFloorplanWallLeave, siteVertexDragState, slabVertexDragState, zoneVertexDragState])

  const handleSvgPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (
        activeFloorplanCursorIndicator &&
        !panStateRef.current &&
        !guideInteractionRef.current &&
        !wallEndpointDragRef.current &&
        !siteVertexDragState &&
        !slabVertexDragState &&
        !zoneVertexDragState
      ) {
        const rect = event.currentTarget.getBoundingClientRect()
        setFloorplanCursorPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      } else {
        setFloorplanCursorPosition(null)
      }

      handlePointerMove(event)
    },
    [
      activeFloorplanCursorIndicator,
      handlePointerMove,
      siteVertexDragState,
      slabVertexDragState,
      zoneVertexDragState,
    ],
  )

  const handleSvgPointerLeave = useCallback(() => {
    setFloorplanCursorPosition(null)
    setHoveredGuideCorner(null)
    handlePointerLeave()
  }, [handlePointerLeave])

  const handleMarqueePointerDown = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      if (event.button !== 0) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect) {
        setFloorplanCursorPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      }
      setHoveredOpeningId(null)
      setHoveredWallId(null)
      setHoveredEndpointId(null)
      setFloorplanMarqueeState({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPlanPoint: planPoint,
        currentPlanPoint: planPoint,
      })

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [getPlanPointFromClientPoint],
  )

  const handleMarqueePointerMove = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect) {
        setFloorplanCursorPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      }

      if (floorplanMarqueeState?.pointerId !== event.pointerId) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      setFloorplanMarqueeState((currentState) => {
        if (!currentState || currentState.pointerId !== event.pointerId) {
          return currentState
        }

        return {
          ...currentState,
          currentPlanPoint: planPoint,
        }
      })
    },
    [floorplanMarqueeState?.pointerId, getPlanPointFromClientPoint],
  )

  const handleMarqueePointerUp = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      const marqueeState = floorplanMarqueeState
      if (!marqueeState || marqueeState.pointerId !== event.pointerId) {
        return
      }

      const endPlanPoint =
        getPlanPointFromClientPoint(event.clientX, event.clientY) ?? marqueeState.currentPlanPoint
      const modifierKeys = getSelectionModifierKeys(event)
      const dragDistance = Math.hypot(
        event.clientX - marqueeState.startClientX,
        event.clientY - marqueeState.startClientY,
      )

      event.preventDefault()
      event.stopPropagation()

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      if (dragDistance >= FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX) {
        const bounds = getFloorplanSelectionBounds(marqueeState.startPlanPoint, endPlanPoint)
        const nextSelectedIds = getFloorplanSelectionIdsInBounds(bounds)
        addFloorplanSelection(nextSelectedIds, modifierKeys)
      } else {
        const hitId = getFloorplanHitIdAtPoint(endPlanPoint)

        if (hitId) {
          toggleFloorplanSelection(hitId, modifierKeys)
        } else if (!(modifierKeys.meta || modifierKeys.ctrl)) {
          commitFloorplanSelection([])
        }
      }

      setFloorplanMarqueeState(null)
    },
    [
      addFloorplanSelection,
      commitFloorplanSelection,
      floorplanMarqueeState,
      getFloorplanHitIdAtPoint,
      getFloorplanSelectionIdsInBounds,
      getPlanPointFromClientPoint,
      toggleFloorplanSelection,
    ],
  )

  const handleMarqueePointerCancel = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      if (floorplanMarqueeState?.pointerId !== event.pointerId) {
        return
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      setFloorplanMarqueeState(null)
      setFloorplanCursorPosition(null)
    },
    [floorplanMarqueeState?.pointerId],
  )

  useEffect(() => {
    if (!isMarqueeSelectionToolActive) {
      setFloorplanMarqueeState(null)
      return
    }

    setFloorplanCursorPosition(null)
    setHoveredOpeningId(null)
    setHoveredWallId(null)
    setHoveredEndpointId(null)
  }, [isMarqueeSelectionToolActive])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    const getFallbackClientPoint = () => {
      const rect = svg.getBoundingClientRect()
      return {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }
    }

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const widthFactor = Math.exp(event.deltaY * (event.ctrlKey ? 0.003 : 0.0015))
      zoomViewportAtClientPoint(event.clientX, event.clientY, widthFactor)
    }

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as GestureLikeEvent
      gestureScaleRef.current = gestureEvent.scale ?? 1
      event.preventDefault()
      event.stopPropagation()
    }

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as GestureLikeEvent
      const nextScale = gestureEvent.scale ?? 1
      const previousScale = gestureScaleRef.current || 1
      const widthFactor = previousScale / nextScale
      const fallbackClientPoint = getFallbackClientPoint()

      zoomViewportAtClientPoint(
        gestureEvent.clientX ?? fallbackClientPoint.clientX,
        gestureEvent.clientY ?? fallbackClientPoint.clientY,
        widthFactor,
      )

      gestureScaleRef.current = nextScale
      event.preventDefault()
      event.stopPropagation()
    }

    const handleGestureEnd = (event: Event) => {
      gestureScaleRef.current = 1
      event.preventDefault()
      event.stopPropagation()
    }

    svg.addEventListener('wheel', handleNativeWheel, { passive: false })
    svg.addEventListener('gesturestart', handleGestureStart, { passive: false })
    svg.addEventListener('gesturechange', handleGestureChange, { passive: false })
    svg.addEventListener('gestureend', handleGestureEnd, { passive: false })

    return () => {
      svg.removeEventListener('wheel', handleNativeWheel)
      svg.removeEventListener('gesturestart', handleGestureStart)
      svg.removeEventListener('gesturechange', handleGestureChange)
      svg.removeEventListener('gestureend', handleGestureEnd)
    }
  }, [zoomViewportAtClientPoint])

  const restoreGroundLevelStructureSelection = useCallback(() => {
    const sceneNodes = useScene.getState().nodes
    const nextBuildingId =
      currentBuildingId ??
      site?.children
        .map((child) => (typeof child === 'string' ? sceneNodes[child as AnyNodeId] : child))
        .find((node): node is BuildingNode => node?.type === 'building')?.id ??
      null

    const nextGroundLevelId =
      nextBuildingId && nextBuildingId === currentBuildingId
        ? (floorplanLevels.find((level) => level.level === 0)?.id ??
          floorplanLevels[0]?.id ??
          (levelNode?.type === 'level' ? levelNode.id : null))
        : (() => {
            if (!nextBuildingId) {
              return null
            }

            const buildingNode = sceneNodes[nextBuildingId]
            if (!buildingNode || buildingNode.type !== 'building') {
              return null
            }

            const buildingLevels = buildingNode.children
              .map((child) => (typeof child === 'string' ? sceneNodes[child as AnyNodeId] : child))
              .filter((node): node is LevelNode => node?.type === 'level')
              .sort((a, b) => a.level - b.level)

            return (
              buildingLevels.find((level) => level.level === 0)?.id ?? buildingLevels[0]?.id ?? null
            )
          })()

    setPhase('structure')
    setStructureLayer('elements')
    setMode('select')

    const nextSelection: Parameters<typeof setSelection>[0] = {
      selectedIds: [],
      zoneId: null,
    }

    if (nextBuildingId) {
      nextSelection.buildingId = nextBuildingId
    }

    if (nextGroundLevelId) {
      nextSelection.levelId = nextGroundLevelId
    }

    setSelection(nextSelection)
  }, [
    currentBuildingId,
    floorplanLevels,
    levelNode,
    setMode,
    setPhase,
    setSelection,
    setStructureLayer,
    site,
  ])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable)

      if (
        isEditableTarget ||
        !isFloorplanHovered ||
        phase !== 'site' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== 'v'
      ) {
        return
      }

      setFloorplanSelectionTool('click')
      restoreGroundLevelStructureSelection()
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isFloorplanHovered, phase, restoreGroundLevelStructureSelection])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'c') {
        return
      }

      if (!(isFloorplanHovered && selectedOpeningEntry)) {
        return
      }

      const target = event.target as HTMLElement | null
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable)

      if (isEditableTarget) {
        return
      }

      event.preventDefault()
      duplicateSelectedOpening()
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [duplicateSelectedOpening, isFloorplanHovered, selectedOpeningEntry])
  const activeDraftAnchorPoint = draftStart ?? activePolygonDraftPoints[0] ?? null
  const floorplanCursorColor = wallEndpointDraft
    ? palette.editCursor
    : activeDraftAnchorPoint
      ? palette.draftStroke
      : palette.cursor

  return (
    <div
      className="pointer-events-auto flex h-full w-full flex-col overflow-hidden bg-background/95"
      onPointerEnter={() => setFloorplanHovered(true)}
      onPointerLeave={() => {
        setFloorplanHovered(false)
        setFloorplanCursorPosition(null)
      }}
      ref={containerRef}
    >
      <div className="relative min-h-0 flex-1" ref={viewportHostRef}>
        {activeFloorplanCursorIndicator && floorplanCursorPosition && !isPanning && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-20 flex h-8 w-8 items-center justify-center rounded-xl border border-white/5 bg-zinc-900/95 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.3),0_4px_8px_-4px_rgba(0,0,0,0.2)]"
            style={{
              left: floorplanCursorPosition.x + FLOORPLAN_CURSOR_INDICATOR_OFFSET_X,
              top: floorplanCursorPosition.y + FLOORPLAN_CURSOR_INDICATOR_OFFSET_Y,
            }}
          >
            {activeFloorplanCursorIndicator.kind === 'asset' ? (
              <img
                alt=""
                aria-hidden="true"
                className="h-5 w-5 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                src={activeFloorplanCursorIndicator.iconSrc}
              />
            ) : (
              <Icon
                aria-hidden="true"
                className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                color="white"
                height={18}
                icon={activeFloorplanCursorIndicator.icon}
                width={18}
              />
            )}
          </div>
        )}
        {showGuides && canInteractWithGuides && selectedGuide && (
          <FloorplanGuideHandleHint
            anchor={guideHandleHintAnchor}
            isDarkMode={theme === 'dark'}
            isMacPlatform={isMacPlatform}
            rotationModifierPressed={rotationModifierPressed}
          />
        )}
        {selectedOpeningActionMenuPosition && isFloorplanHovered && !movingNode && (
          <div
            className="absolute z-30"
            style={{
              left: selectedOpeningActionMenuPosition.x,
              top: selectedOpeningActionMenuPosition.y,
              transform: `translate(-50%, calc(-100% - ${FLOORPLAN_ACTION_MENU_OFFSET_Y}px))`,
            }}
          >
            <NodeActionMenu
              onDelete={handleSelectedOpeningDelete}
              onDuplicate={handleSelectedOpeningDuplicate}
              onMove={handleSelectedOpeningMove}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            />
          </div>
        )}

        {!levelNode || levelNode.type !== 'level' ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
            Switch to a building level to view and edit the floorplan.
          </div>
        ) : (
          <svg
            className="h-full w-full touch-none"
            onClick={isMarqueeSelectionToolActive ? undefined : handleBackgroundClick}
            onPointerDownCapture={(event) => {
              // 标定模式：捕获阶段拦截并直接记录点位
              const cal = useEditor.getState().calibration
              if (cal?.active && cal.points.length < 2 && event.button === 0) {
                event.stopPropagation()
                const raw = getPlanPointFromClientPoint(event.clientX, event.clientY)
                if (raw) {
                  const calResult = snapCalibrationPoint(
                    [raw[0], raw[1]],
                    walls,
                    cal.points,
                    calibrationGuideAnchors,
                    !shiftPressed && cal.points.length === 1,
                  )
                  useEditor.getState().addCalibrationPoint(calResult.point)
                  // 音效反馈
                  sfxEmitter.emit('sfx:grid-snap')
                }
              }

              // 多层对齐模式：按阶段收集参考层 / 当前层各 2 个点
              const la = useEditor.getState().levelAlignment
              if (la?.active && event.button === 0) {
                const phasePoints = la.phase === 'ref' ? la.refPoints : la.curPoints
                if (phasePoints.length < 2) {
                  event.stopPropagation()
                  const raw = getPlanPointFromClientPoint(event.clientX, event.clientY)
                  if (raw) {
                    // 吸附候选集：始终用当前画布的锚点（包含当前显示层的墙体交点+底图角点）
                    // phase='cur' 时用户在被对齐层 → currentAlignmentAnchors = 被对齐层的锚点 ✓
                    // phase='ref' 时已自动切到参考层 → currentAlignmentAnchors = 参考层的锚点 ✓
                    // 不能用 referenceAlignmentAnchors，切层后 levelId===referenceLevelId 导致其为空
                    const snapCandidates = currentAlignmentAnchors
                    const snapRadius = ALIGNMENT_SNAP_PIXELS * floorplanWorldUnitsPerPixel
                    const { snapped } = snapAlignmentPoint([raw[0], raw[1]], snapCandidates, snapRadius)
                    useEditor.getState().addLevelAlignmentPoint(snapped)
                    sfxEmitter.emit('sfx:grid-snap')

                    const updated = useEditor.getState().levelAlignment

                    // cur → ref 阶段切换：自动跳转到参考层，让用户在参考层画布上点对应特征点
                    // 切层后 currentAlignmentAnchors 会重算为参考层的锚点，吸附自然生效
                    if (la.phase === 'cur' && updated.phase === 'ref') {
                      const refLevelId = useViewer.getState().referenceLevelId
                      if (refLevelId) {
                        const { selection } = useViewer.getState()
                        useViewer.getState().setSelection(
                          selection.buildingId
                            ? { buildingId: selection.buildingId, levelId: refLevelId }
                            : { levelId: refLevelId },
                        )
                      }
                    }

                    // 检查是否 4 个点全部收集完毕 → 立即应用对齐，并跳回原层
                    if (
                      updated.refPoints.length === 2 &&
                      updated.curPoints.length === 2
                    ) {
                      // aligningLevelId 是对齐开始时记录的"当前层"，不受自动切层影响
                      const targetLevelId = updated.aligningLevelId ?? levelId
                      if (targetLevelId) {
                        applyLevelAlignment(
                          targetLevelId,
                          [updated.refPoints[0]!, updated.refPoints[1]!],
                          [updated.curPoints[0]!, updated.curPoints[1]!],
                        )
                        useEditor.getState().cancelLevelAlignment()
                        // 对齐完成后跳回被对齐的那一层
                        const { selection } = useViewer.getState()
                        useViewer.getState().setSelection(
                          selection.buildingId
                            ? { buildingId: selection.buildingId, levelId: targetLevelId }
                            : { levelId: targetLevelId },
                        )
                        // 成功提示 — 2.5 秒后自动消失
                        setAlignSuccess(true)
                        if (alignSuccessTimerRef.current) clearTimeout(alignSuccessTimerRef.current)
                        alignSuccessTimerRef.current = setTimeout(() => setAlignSuccess(false), 2500)
                      }
                    }
                  }
                }
              }
            }}
            onContextMenu={(event) => event.preventDefault()}
            onDoubleClick={isMarqueeSelectionToolActive ? undefined : handleBackgroundDoubleClick}
            onPointerCancel={endPanning}
            onPointerDown={handlePointerDown}
            onPointerLeave={handleSvgPointerLeave}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={endPanning}
            ref={svgRef}
            style={{ cursor: calibrationActive || levelAlignmentActive ? 'crosshair' : EDITOR_CURSOR }}
            viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
          >
            <rect
              fill={palette.surface}
              height={viewBox.height}
              width={viewBox.width}
              x={viewBox.minX}
              y={viewBox.minY}
            />

            <FloorplanGridLayer
              majorGridPath={majorGridPath}
              minorGridPath={minorGridPath}
              palette={palette}
              showGrid={showGrid}
            />

            {/* 参考层底图（半透明、不可交互）—— 多层底图对齐 */}
            <FloorplanReferenceGuideLayer guides={referenceGuides} />

            <FloorplanGuideLayer
              activeGuideInteractionGuideId={activeGuideInteractionGuideId}
              activeGuideInteractionMode={activeGuideInteractionMode}
              guides={displayGuides}
              isInteractive={canInteractWithGuides}
              onGuideSelect={handleGuideSelect}
              onGuideTranslateStart={handleGuideTranslateStart}
              selectedGuideId={selectedGuideId}
            />

            <FloorplanSiteLayer isEditing={isSiteEditActive} sitePolygon={visibleSitePolygon} />

            <FloorplanGeometryLayer
              canSelectGeometry={canSelectElementFloorplanGeometry}
              canSelectSlabs={canSelectElementFloorplanGeometry && structureLayer !== 'zones'}
              hoveredOpeningId={hoveredOpeningId}
              hoveredWallId={hoveredWallId}
              junctionCapPolygons={junctionCapPolygons}
              onOpeningDoubleClick={handleOpeningDoubleClick}
              onOpeningHoverChange={setHoveredOpeningId}
              onOpeningPointerDown={handleOpeningPointerDown}
              onOpeningSelect={handleOpeningSelect}
              onSlabDoubleClick={handleSlabDoubleClick}
              onSlabSelect={handleSlabSelect}
              onWallClick={handleWallClick}
              onWallDoubleClick={handleWallDoubleClick}
              onWallHoverChange={setHoveredWallId}
              openingsPolygons={openingsPolygons}
              palette={palette}
              selectedIdSet={selectedIdSet}
              slabPolygons={displaySlabPolygons}
              unit={unit}
              wallPolygons={displayWallPolygons}
            />

            <FloorplanZoneLayer
              canSelectZones={canSelectFloorplanZones}
              onZoneSelect={handleZoneSelect}
              palette={palette}
              selectedZoneId={selectedZoneId}
              zonePolygons={visibleZonePolygons}
            />

            <FloorplanPolygonHandleLayer
              hoveredHandleId={hoveredSiteHandleId}
              midpointHandles={siteMidpointHandles}
              onHandleHoverChange={setHoveredSiteHandleId}
              onMidpointPointerDown={(nodeId, edgeIndex, event) =>
                handleSiteMidpointPointerDown(nodeId as SiteNode['id'], edgeIndex, event)
              }
              onVertexDoubleClick={(nodeId, vertexIndex, event) =>
                handleSiteVertexDoubleClick(nodeId as SiteNode['id'], vertexIndex, event)
              }
              onVertexPointerDown={(nodeId, vertexIndex, event) =>
                handleSiteVertexPointerDown(nodeId as SiteNode['id'], vertexIndex, event)
              }
              palette={palette}
              vertexHandles={siteVertexHandles}
            />

            {isMarqueeSelectionToolActive && (
              <rect
                fill="transparent"
                height={viewBox.height}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onPointerCancel={handleMarqueePointerCancel}
                onPointerDown={handleMarqueePointerDown}
                onPointerMove={handleMarqueePointerMove}
                onPointerUp={handleMarqueePointerUp}
                style={{ cursor: EDITOR_CURSOR }}
                width={viewBox.width}
                x={viewBox.minX}
                y={viewBox.minY}
              />
            )}

            {visibleSvgMarqueeBounds && (
              <rect
                fill={palette.selectedFill}
                fillOpacity={0.14}
                height={visibleSvgMarqueeBounds.height}
                pointerEvents="none"
                stroke={palette.selectedStroke}
                strokeDasharray="0.16 0.1"
                strokeWidth="0.05"
                vectorEffect="non-scaling-stroke"
                width={visibleSvgMarqueeBounds.width}
                x={visibleSvgMarqueeBounds.x}
                y={visibleSvgMarqueeBounds.y}
              />
            )}

            {/* Step A：端点正交追踪辅助线 —— 光标跟已有端点水平/垂直对齐时显示
                + 距离数值标签让用户能精确对齐 */}
            {trackingHit && cursorPoint && (() => {
              const px = floorplanWorldUnitsPerPixel
              const extent = Math.max(viewBox.width, viewBox.height) * 2
              const color = '#2D7FF9'
              const fontSizeWorld = 11 * px
              const padX = 5 * px
              const padY = 2.5 * px
              const labelHeight = fontSizeWorld + padY * 2
              const elements: React.ReactNode[] = []

              // 格式化距离：< 1m 用 mm，否则用 m
              const fmtDist = (d: number) =>
                d >= 1 ? `${d.toFixed(2)} m` : `${(d * 1000).toFixed(0)} mm`

              // 渲染一个距离标签（锚点 + 光标间中点附近）
              const renderDistanceLabel = (
                key: string,
                anchor: WallPlanPoint,
                midSvgX: number,
                midSvgY: number,
                direction: '←' | '→' | '↑' | '↓',
                distance: number,
              ) => {
                const text = `${direction} ${fmtDist(distance)}`
                const charWidth = fontSizeWorld * 0.6
                const labelWidth = text.length * charWidth + padX * 2
                return (
                  <g key={key} pointerEvents="none">
                    <rect
                      x={midSvgX - labelWidth / 2}
                      y={midSvgY - labelHeight / 2}
                      width={labelWidth}
                      height={labelHeight}
                      rx={2 * px}
                      ry={2 * px}
                      fill="rgba(15,23,42,0.9)"
                      stroke="rgba(45,127,249,0.7)"
                      strokeWidth={1 * px}
                    />
                    <text
                      x={midSvgX}
                      y={midSvgY}
                      fill="#ffffff"
                      fontSize={fontSizeWorld}
                      fontFamily="ui-monospace, SFMono-Regular, monospace"
                      fontWeight={600}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {text}
                    </text>
                  </g>
                )
              }

              // 水平追踪线（跨屏 + 从锚点到光标）
              if (trackingHit.horizontalAnchor) {
                const a = trackingHit.horizontalAnchor
                elements.push(
                  <line
                    key="h-ray"
                    x1={toSvgX(a[0] - extent)}
                    y1={toSvgY(a[1])}
                    x2={toSvgX(a[0] + extent)}
                    y2={toSvgY(a[1])}
                    stroke={color}
                    strokeWidth="0.06"
                    strokeOpacity={0.45}
                    strokeDasharray="0.3 0.2"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />,
                )
                // 锚点标记（小十字）
                elements.push(
                  <g key="h-anchor" pointerEvents="none">
                    <line
                      x1={toSvgX(a[0] - 6 * px)}
                      y1={toSvgY(a[1])}
                      x2={toSvgX(a[0] + 6 * px)}
                      y2={toSvgY(a[1])}
                      stroke={color}
                      strokeWidth="0.1"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1={toSvgX(a[0])}
                      y1={toSvgY(a[1] - 6 * px)}
                      x2={toSvgX(a[0])}
                      y2={toSvgY(a[1] + 6 * px)}
                      stroke={color}
                      strokeWidth="0.1"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>,
                )
                // 距离标签：水平追踪 = 光标在锚点水平线上，距离 = |cursorX - anchorX|
                const horizontalDist = Math.abs(cursorPoint[0] - a[0])
                if (horizontalDist > 0.05) {
                  // 方向：cursorX > anchorX 时光标在锚点右边（→），反之（←）
                  // 但标签应指向锚点，所以方向相反
                  const direction = cursorPoint[0] > a[0] ? '←' : '→'
                  // 标签位置：锚点和光标在水平线上的中点
                  const midX = (a[0] + cursorPoint[0]) / 2
                  // 略微上移避开追踪线本身
                  const labelSvgY = toSvgY(a[1]) - 10 * px
                  elements.push(
                    renderDistanceLabel(
                      'h-dist',
                      a,
                      toSvgX(midX),
                      labelSvgY,
                      direction,
                      horizontalDist,
                    ),
                  )
                }
              }
              // 垂直追踪线
              if (trackingHit.verticalAnchor) {
                const a = trackingHit.verticalAnchor
                elements.push(
                  <line
                    key="v-ray"
                    x1={toSvgX(a[0])}
                    y1={toSvgY(a[1] - extent)}
                    x2={toSvgX(a[0])}
                    y2={toSvgY(a[1] + extent)}
                    stroke={color}
                    strokeWidth="0.06"
                    strokeOpacity={0.45}
                    strokeDasharray="0.3 0.2"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />,
                )
                // 锚点标记（避免重复：如果水平和垂直是同一个点，跳过）
                if (
                  !trackingHit.horizontalAnchor ||
                  trackingHit.horizontalAnchor[0] !== a[0] ||
                  trackingHit.horizontalAnchor[1] !== a[1]
                ) {
                  elements.push(
                    <g key="v-anchor" pointerEvents="none">
                      <line
                        x1={toSvgX(a[0] - 6 * px)}
                        y1={toSvgY(a[1])}
                        x2={toSvgX(a[0] + 6 * px)}
                        y2={toSvgY(a[1])}
                        stroke={color}
                        strokeWidth="0.1"
                        vectorEffect="non-scaling-stroke"
                      />
                      <line
                        x1={toSvgX(a[0])}
                        y1={toSvgY(a[1] - 6 * px)}
                        x2={toSvgX(a[0])}
                        y2={toSvgY(a[1] + 6 * px)}
                        stroke={color}
                        strokeWidth="0.1"
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>,
                  )
                }
                // 距离标签：垂直追踪 = 光标在锚点垂直线上，距离 = |cursorZ - anchorZ|
                const verticalDist = Math.abs(cursorPoint[1] - a[1])
                if (verticalDist > 0.05) {
                  // plan z 轴：z > anchorZ 表示光标在锚点下方（planZ 向下为正）
                  // 标签指向锚点方向
                  const direction = cursorPoint[1] > a[1] ? '↑' : '↓'
                  const midZ = (a[1] + cursorPoint[1]) / 2
                  // 略微右移避开追踪线本身
                  const labelSvgX = toSvgX(a[0]) + 14 * px
                  elements.push(
                    renderDistanceLabel(
                      'v-dist',
                      a,
                      labelSvgX,
                      toSvgY(midZ),
                      direction,
                      verticalDist,
                    ),
                  )
                }
              }
              return <>{elements}</>
            })()}

            {/* Step B：延长线追踪 —— 光标在某条墙的无限延长线上时显示 */}
            {extensionHit && cursorPoint && (() => {
              const px = floorplanWorldUnitsPerPixel
              const wall = extensionHit.wall
              const color = '#2D7FF9'
              // 延长线：从墙的参考端点沿墙方向延伸到光标投影位置（+ 继续延伸一点点）
              const refPoint = extensionHit.referencePoint
              const snappedPoint = extensionHit.snappedPoint
              // 方向向量：从参考端点指向投影点
              const dx = snappedPoint[0] - refPoint[0]
              const dz = snappedPoint[1] - refPoint[1]
              const len = Math.sqrt(dx * dx + dz * dz)
              if (len < 1e-4) return null
              // 延长到更远的地方（参考端点 → 投影点 + 1m 继续延伸），让用户看清方向
              const tailExtend = 1.0
              const tailX = snappedPoint[0] + (dx / len) * tailExtend
              const tailZ = snappedPoint[1] + (dz / len) * tailExtend
              // 格式化距离
              const distLabel = len >= 1
                ? `${len.toFixed(2)} m`
                : `${(len * 1000).toFixed(0)} mm`
              const fontSizeWorld = 11 * px
              const padX = 5 * px
              const padY = 2.5 * px
              const labelHeight = fontSizeWorld + padY * 2
              // 距离标签放在延长线中点（参考端点和投影点之间）
              const midX = (refPoint[0] + snappedPoint[0]) / 2
              const midZ = (refPoint[1] + snappedPoint[1]) / 2
              // 往法线方向略微偏移，避免盖住延长线
              const nx = -dz / len
              const nz = dx / len
              const labelWorldX = midX + nx * 10 * px
              const labelWorldZ = midZ + nz * 10 * px
              const text = `延长 ${distLabel}`
              const charWidth = fontSizeWorld * 0.6
              const labelWidth = text.length * charWidth + padX * 2
              return (
                <g pointerEvents="none">
                  {/* 延长虚线：从参考端点到投影点再继续延伸 */}
                  <line
                    x1={toSvgX(refPoint[0])}
                    y1={toSvgY(refPoint[1])}
                    x2={toSvgX(tailX)}
                    y2={toSvgY(tailZ)}
                    stroke={color}
                    strokeWidth="0.08"
                    strokeOpacity={0.55}
                    strokeDasharray="0.28 0.18"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* 参考端点标记（小十字） */}
                  <line
                    x1={toSvgX(refPoint[0] - 6 * px)}
                    y1={toSvgY(refPoint[1])}
                    x2={toSvgX(refPoint[0] + 6 * px)}
                    y2={toSvgY(refPoint[1])}
                    stroke={color}
                    strokeWidth="0.1"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={toSvgX(refPoint[0])}
                    y1={toSvgY(refPoint[1] - 6 * px)}
                    x2={toSvgX(refPoint[0])}
                    y2={toSvgY(refPoint[1] + 6 * px)}
                    stroke={color}
                    strokeWidth="0.1"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* 距离标签 */}
                  <rect
                    x={toSvgX(labelWorldX) - labelWidth / 2}
                    y={toSvgY(labelWorldZ) - labelHeight / 2}
                    width={labelWidth}
                    height={labelHeight}
                    rx={2 * px}
                    ry={2 * px}
                    fill="rgba(15,23,42,0.9)"
                    stroke="rgba(45,127,249,0.7)"
                    strokeWidth={1 * px}
                  />
                  <text
                    x={toSvgX(labelWorldX)}
                    y={toSvgY(labelWorldZ)}
                    fill="#ffffff"
                    fontSize={fontSizeWorld}
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    fontWeight={600}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {text}
                  </text>
                </g>
              )
            })()}

            {/* Step C：垂直追踪辅助线 —— 光标在某条已有墙端点的垂直方向时显示
                直角标记（L形）＋ 距离标签，帮助在斜墙拐角处画精确直角 */}
            {perpendicularHit && cursorPoint && (() => {
              const px = floorplanWorldUnitsPerPixel
              const { anchorPoint, snappedPoint, wallUnitVector } = perpendicularHit
              const color = '#2D7FF9'
              const [ux, uz] = wallUnitVector
              // 垂直单位向量（沿墙 90° CCW）
              const vx = -uz
              const vz = ux
              // 距离
              const ddx = snappedPoint[0] - anchorPoint[0]
              const ddz = snappedPoint[1] - anchorPoint[1]
              const dist = Math.sqrt(ddx * ddx + ddz * ddz)
              if (dist < 0.005) return null
              const distLabel = dist >= 1 ? `⊥ ${dist.toFixed(2)} m` : `⊥ ${(dist * 1000).toFixed(0)} mm`
              const fontSizeWorld = 11 * px
              const padX = 5 * px
              const padY = 2.5 * px
              const labelHeight = fontSizeWorld + padY * 2
              const charWidth = fontSizeWorld * 0.6
              const labelWidth = distLabel.length * charWidth + padX * 2
              // 标签放在垂直线中点，沿墙方向偏移避开线本身
              const midX = (anchorPoint[0] + snappedPoint[0]) / 2
              const midZ = (anchorPoint[1] + snappedPoint[1]) / 2
              const labelX = midX + ux * 12 * px
              const labelZ = midZ + uz * 12 * px
              // 直角标记（小 L 形）：5px 沿墙 + 5px 沿垂直
              const cs = 5 * px
              const cAx = anchorPoint[0] + ux * cs
              const cAz = anchorPoint[1] + uz * cs
              const cBx = cAx + vx * cs
              const cBz = cAz + vz * cs
              const cCx = anchorPoint[0] + vx * cs
              const cCz = anchorPoint[1] + vz * cs
              return (
                <g pointerEvents="none">
                  {/* 垂直追踪虚线 */}
                  <line
                    x1={toSvgX(anchorPoint[0])}
                    y1={toSvgY(anchorPoint[1])}
                    x2={toSvgX(snappedPoint[0])}
                    y2={toSvgY(snappedPoint[1])}
                    stroke={color}
                    strokeWidth="0.08"
                    strokeOpacity={0.55}
                    strokeDasharray="0.28 0.18"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* 直角标记（L 形） */}
                  <polyline
                    points={`${toSvgX(cAx)},${toSvgY(cAz)} ${toSvgX(cBx)},${toSvgY(cBz)} ${toSvgX(cCx)},${toSvgY(cCz)}`}
                    stroke={color}
                    strokeWidth="0.07"
                    strokeOpacity={0.8}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* 锚点标记（小十字） */}
                  <line
                    x1={toSvgX(anchorPoint[0] - 6 * px)}
                    y1={toSvgY(anchorPoint[1])}
                    x2={toSvgX(anchorPoint[0] + 6 * px)}
                    y2={toSvgY(anchorPoint[1])}
                    stroke={color}
                    strokeWidth="0.1"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={toSvgX(anchorPoint[0])}
                    y1={toSvgY(anchorPoint[1] - 6 * px)}
                    x2={toSvgX(anchorPoint[0])}
                    y2={toSvgY(anchorPoint[1] + 6 * px)}
                    stroke={color}
                    strokeWidth="0.1"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* 距离标签 */}
                  <rect
                    x={toSvgX(labelX) - labelWidth / 2}
                    y={toSvgY(labelZ) - labelHeight / 2}
                    width={labelWidth}
                    height={labelHeight}
                    rx={2 * px}
                    ry={2 * px}
                    fill="rgba(15,23,42,0.9)"
                    stroke="rgba(45,127,249,0.7)"
                    strokeWidth={1 * px}
                  />
                  <text
                    x={toSvgX(labelX)}
                    y={toSvgY(labelZ)}
                    fill="#ffffff"
                    fontSize={fontSizeWorld}
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    fontWeight={600}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {distLabel}
                  </text>
                </g>
              )
            })()}

            {/* Step D：角度追踪辅助线 —— 贴近 0/45/90/... 时从 draftStart 画贯穿虚线 */}
            {draftMeasurement?.snapDirectionDeg !== null && draftMeasurement && (() => {
              const angleRad = (draftMeasurement.snapDirectionDeg! * Math.PI) / 180
              const cosA = Math.cos(angleRad)
              const sinA = Math.sin(angleRad)
              // 贯穿 viewBox：从 draftStart 沿角度正反各延伸一个大值
              const extent = Math.max(viewBox.width, viewBox.height) * 2
              const p1x = draftMeasurement.startX - cosA * extent
              const p1z = draftMeasurement.startZ - sinA * extent
              const p2x = draftMeasurement.startX + cosA * extent
              const p2z = draftMeasurement.startZ + sinA * extent
              const color = draftMeasurement.isOrthogonal ? '#2D7FF9' : '#f59e0b'
              return (
                <line
                  x1={toSvgX(p1x)}
                  y1={toSvgY(p1z)}
                  x2={toSvgX(p2x)}
                  y2={toSvgY(p2z)}
                  stroke={color}
                  strokeWidth="0.08"
                  strokeOpacity={0.55}
                  strokeDasharray="0.3 0.2"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )
            })()}

            {draftPolygon && (() => {
              const draftWallDef = WALL_TYPE_BY_ID[activeWallTypeId as keyof typeof WALL_TYPE_BY_ID]
              const draftWallColor = draftWallDef?.color ?? palette.draftFill
              return (
                <polygon
                  fill={draftWallColor}
                  fillOpacity={0.45}
                  points={draftPolygonPoints ?? undefined}
                  stroke={draftWallColor}
                  strokeDasharray="0.24 0.12"
                  strokeOpacity={0.7}
                  strokeWidth="0.07"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })()}

            {draftMeasurement && (() => {
              // 像素级字号 → 世界单位，保证缩放时字体不变形
              const px = floorplanWorldUnitsPerPixel
              const fontSizeWorld = 13 * px
              const padX = 6 * px
              const padY = 3 * px
              // 法向偏移 18px，把标签推到线外侧（避免盖住墙）
              const offset = 18 * px
              const labelX = draftMeasurement.midX + draftMeasurement.nx * offset
              const labelZ = draftMeasurement.midZ + draftMeasurement.nz * offset
              const lengthText = draftMeasurement.length >= 1
                ? `${draftMeasurement.length.toFixed(2)} m`
                : `${(draftMeasurement.length * 1000).toFixed(0)} mm`
              // 角度归一到 0-180°，便于对齐判断
              const halfAngle = draftMeasurement.angleDeg % 180
              const angleText = `${halfAngle.toFixed(0)}°`
              // 估算标签宽高（粗略，够用）
              const charWidth = fontSizeWorld * 0.55
              const labelWidth = (lengthText.length + angleText.length + 2) * charWidth + padX * 2
              const labelHeight = fontSizeWorld + padY * 2
              return (
                <g pointerEvents="none">
                  <rect
                    x={toSvgX(labelX) - labelWidth / 2}
                    y={toSvgY(labelZ) - labelHeight / 2}
                    width={labelWidth}
                    height={labelHeight}
                    rx={3 * px}
                    ry={3 * px}
                    fill="rgba(15,23,42,0.85)"
                    stroke="rgba(45,127,249,0.6)"
                    strokeWidth={1 * px}
                  />
                  <text
                    x={toSvgX(labelX)}
                    y={toSvgY(labelZ)}
                    fill="#ffffff"
                    fontSize={fontSizeWorld}
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    fontWeight={600}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {lengthText}
                    <tspan fill="#94a3b8" fontWeight={400}>{'  '}{angleText}</tspan>
                  </text>
                </g>
              )
            })()}

            {polygonDraftPolygonPoints && (
              <polygon
                fill={palette.draftFill}
                fillOpacity={0.2}
                points={polygonDraftPolygonPoints}
                stroke="none"
              />
            )}

            {polygonDraftPolylinePoints && (
              <polyline
                fill="none"
                points={polygonDraftPolylinePoints}
                stroke={palette.draftStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="0.08"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {polygonDraftClosingSegment && (
              <line
                stroke={palette.draftStroke}
                strokeDasharray="0.16 0.1"
                strokeLinecap="round"
                strokeOpacity={0.75}
                strokeWidth="0.05"
                vectorEffect="non-scaling-stroke"
                x1={polygonDraftClosingSegment.x1}
                x2={polygonDraftClosingSegment.x2}
                y1={polygonDraftClosingSegment.y1}
                y2={polygonDraftClosingSegment.y2}
              />
            )}

            {activePolygonDraftPoints.map((point, index) => (
              <circle
                cx={toSvgX(point[0])}
                cy={toSvgY(point[1])}
                fill={index === 0 ? palette.anchor : palette.draftStroke}
                fillOpacity={0.95}
                key={`polygon-draft-${index}`}
                pointerEvents="none"
                r={index === 0 ? 0.12 : 0.1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <FloorplanWallEndpointLayer
              endpointHandles={wallEndpointHandles}
              hoveredEndpointId={hoveredEndpointId}
              onEndpointHoverChange={setHoveredEndpointId}
              onWallEndpointPointerDown={handleWallEndpointPointerDown}
              palette={palette}
            />

            <FloorplanPolygonHandleLayer
              hoveredHandleId={hoveredSlabHandleId}
              midpointHandles={slabMidpointHandles}
              onHandleHoverChange={setHoveredSlabHandleId}
              onMidpointPointerDown={(nodeId, edgeIndex, event) =>
                handleSlabMidpointPointerDown(nodeId as SlabNode['id'], edgeIndex, event)
              }
              onVertexDoubleClick={(nodeId, vertexIndex, event) =>
                handleSlabVertexDoubleClick(nodeId as SlabNode['id'], vertexIndex, event)
              }
              onVertexPointerDown={(nodeId, vertexIndex, event) =>
                handleSlabVertexPointerDown(nodeId as SlabNode['id'], vertexIndex, event)
              }
              palette={palette}
              vertexHandles={slabVertexHandles}
            />

            <FloorplanPolygonHandleLayer
              hoveredHandleId={hoveredZoneHandleId}
              midpointHandles={zoneMidpointHandles}
              onHandleHoverChange={setHoveredZoneHandleId}
              onMidpointPointerDown={(nodeId, edgeIndex, event) =>
                handleZoneMidpointPointerDown(nodeId as ZoneNodeType['id'], edgeIndex, event)
              }
              onVertexDoubleClick={(nodeId, vertexIndex, event) =>
                handleZoneVertexDoubleClick(nodeId as ZoneNodeType['id'], vertexIndex, event)
              }
              onVertexPointerDown={(nodeId, vertexIndex, event) =>
                handleZoneVertexPointerDown(nodeId as ZoneNodeType['id'], vertexIndex, event)
              }
              palette={palette}
              vertexHandles={zoneVertexHandles}
            />

            {selectedGuide && showGuides && (
              <FloorplanGuideSelectionOverlay
                guide={selectedGuide}
                isDarkMode={theme === 'dark'}
                onCornerHoverChange={setHoveredGuideCorner}
                onCornerPointerDown={handleGuideCornerPointerDown}
                rotationModifierPressed={rotationModifierPressed}
                showHandles={canInteractWithGuides}
              />
            )}

            {/* 普通光标点（非标定模式）—— 标定模式下隐藏此圆点，避免挡住精确标定十字
                圆点大小跟随缩放（像素恒定），避免放大后圆点过大遮挡精确操作 */}
            {cursorPoint && !calibrationActive && (() => {
              const px = floorplanWorldUnitsPerPixel
              const coreR = Math.min(FLOORPLAN_CURSOR_MARKER_CORE_RADIUS, 3 * px)
              const glowR = Math.min(FLOORPLAN_CURSOR_MARKER_GLOW_RADIUS, 8 * px)
              return (
              <g>
                <circle
                  cx={toSvgX(cursorPoint[0])}
                  cy={toSvgY(cursorPoint[1])}
                  fill={floorplanCursorColor}
                  fillOpacity={0.25}
                  r={glowR}
                />
                <circle
                  cx={toSvgX(cursorPoint[0])}
                  cy={toSvgY(cursorPoint[1])}
                  fill={floorplanCursorColor}
                  fillOpacity={0.9}
                  r={coreR}
                />
              </g>
              )
            })()}

            {activeDraftAnchorPoint && (
              <circle
                cx={toSvgX(activeDraftAnchorPoint[0])}
                cy={toSvgY(activeDraftAnchorPoint[1])}
                fill={palette.anchor}
                fillOpacity={0.95}
                r="0.14"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* ── 标定线覆盖层 ── */}
            <CalibrationOverlay
              cursorPoint={cursorPoint}
              walls={walls}
              worldUnitsPerPixel={floorplanWorldUnitsPerPixel}
              guideAnchors={calibrationGuideAnchors}
            />

            {/* ── 多层 2 点对齐覆盖层 ── */}
            {/* 两阶段都用 currentAlignmentAnchors：自动切层后当前层即为参考层，锚点正确 */}
            <LevelAlignmentOverlay
              cursorPoint={cursorPoint}
              curSnapCandidates={currentAlignmentAnchors}
              refSnapCandidates={currentAlignmentAnchors}
              worldUnitsPerPixel={floorplanWorldUnitsPerPixel}
            />
          </svg>
        )}

        {/* ── 标定输入弹窗（内联 JSX，固定像素尺寸） ── */}
        <CalibrationInputInline />

        {/* ── 多层 2 点对齐提示条 ── */}
        <LevelAlignmentHUD />

        {/* ── 对齐成功提示 ── */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center transition-all duration-500',
            alignSuccess ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
          )}
        >
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 shadow-xl backdrop-blur-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="font-medium text-[13px] text-emerald-300">底图已对齐</span>
          </div>
        </div>

        {/* ── 建筑朝向罗盘 ── */}
        <FloorplanCompass levelNode={levelNode} updateNode={updateNode as (id: AnyNodeId, data: Record<string, unknown>) => void} />

      </div>
    </div>
  )
}

/**
 * CalibrationOverlay — 在 2D floorplan SVG 内渲染标定标记和距离提示
 *
 * 全部坐标通过 toSvgX/toSvgY 转换到 SVG 空间（之前的 bug: 直接用 plan 坐标导致
 * 所有元素渲染在镜像位置，用户看不到连线）。
 *
 * 视觉层次：
 *   - 已确定的点：图钉样式 —— 十字骨架 + 顶部发光圆点（更容易识别起点）
 *   - 光标吸附预览：半透明十字 + 细光晕
 *   - 两点之间的拖尾 / 标定线：品牌蓝虚线
 */
function CalibrationOverlay({
  cursorPoint,
  walls,
  worldUnitsPerPixel,
  guideAnchors,
}: {
  cursorPoint: WallPlanPoint | null
  walls: WallNode[]
  worldUnitsPerPixel: number
  guideAnchors: Array<[number, number]>
}) {
  const cal = useEditor((s) => s.calibration)

  if (!cal?.active) return null

  const points = cal.points

  // 只过滤出有效数字的点位
  const isValidPt = (p: any): p is [number, number] =>
    Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])

  const validPoints = points.filter(isValidPt) as Array<[number, number]>

  // 十字大小固定为 14 像素（世界单位换算），随缩放保持视觉稳定
  const px = worldUnitsPerPixel
  const armLen = 8 * px
  const strokeW = 1.5 * px
  const pinHeadR = 3 * px

  // 图钉头（小发光圆点） —— 让已确定的点更容易识别，但体积很小不挡光标
  const PinHead = ({ p, opacity = 1 }: { p: [number, number]; opacity?: number }) => (
    <g pointerEvents="none" opacity={opacity}>
      <circle
        cx={toSvgX(p[0])}
        cy={toSvgY(p[1])}
        r={pinHeadR * 2}
        fill="#2D7FF9"
        fillOpacity={0.18}
      />
      <circle
        cx={toSvgX(p[0])}
        cy={toSvgY(p[1])}
        r={pinHeadR}
        fill="#2D7FF9"
        stroke="#ffffff"
        strokeWidth={strokeW}
      />
    </g>
  )

  // 十字骨架 — 两条交叉直线
  const Cross = ({
    p,
    opacity = 1,
    color = '#2D7FF9',
  }: {
    p: [number, number]
    opacity?: number
    color?: string
  }) => {
    const sx = toSvgX(p[0])
    const sy = toSvgY(p[1])
    return (
      <g pointerEvents="none" opacity={opacity}>
        <line
          stroke={color}
          strokeWidth={strokeW}
          x1={sx - armLen}
          x2={sx + armLen}
          y1={sy}
          y2={sy}
        />
        <line
          stroke={color}
          strokeWidth={strokeW}
          x1={sx}
          x2={sx}
          y1={sy - armLen}
          y2={sy + armLen}
        />
      </g>
    )
  }

  // 已固定的点 —— 十字 + 图钉头（第一个点更明显）
  const pointMarkers = validPoints.map((p, i) => (
    <g key={`cal-pin-${i}`}>
      <Cross p={p} />
      <PinHead p={p} />
    </g>
  ))

  // ── 第二点：计算吸附结果（含轴约束） ──────────────────────────────────────
  const p1 = validPoints[0] ?? null
  const hasSecondPoint = validPoints.length >= 2

  // cursorPoint 是鼠标位置，做一次吸附得到最终落点及轴信息
  let livePt: [number, number] | null = null
  let liveAxis: CalibrationSnapAxis = 'free'
  if (!hasSecondPoint && cursorPoint && isValidPt(cursorPoint) && p1) {
    const r = snapCalibrationPoint(
      [cursorPoint[0], cursorPoint[1]],
      walls,
      validPoints,
      guideAnchors,
      true, // overlay 里始终计算轴信息（供显示），实际约束由 shiftPressed 控制）
    )
    livePt = r.point
    liveAxis = r.axis
  } else if (!hasSecondPoint && cursorPoint && isValidPt(cursorPoint)) {
    livePt = [cursorPoint[0], cursorPoint[1]]
  }

  // 光标吸附预览 —— 吸附到墙端点时显示琥珀色十字 + 高亮圈
  let cursorPreview: React.ReactNode = null
  if (livePt && p1) {
    const didSnap =
      Math.abs(livePt[0] - (cursorPoint?.[0] ?? livePt[0])) > 1e-6 ||
      Math.abs(livePt[1] - (cursorPoint?.[1] ?? livePt[1])) > 1e-6
    if (didSnap) {
      cursorPreview = (
        <g>
          <Cross p={livePt} opacity={0.55} color="#f59e0b" />
          <circle
            cx={toSvgX(livePt[0])}
            cy={toSvgY(livePt[1])}
            r={5 * px}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={strokeW * 0.8}
            pointerEvents="none"
          />
        </g>
      )
    }
  }

  // ── 轴参考线（过 p1 的水平或垂直穿越线） ────────────────────────────────
  // 只在画第二点时显示，用来帮助用户对齐
  const AXIS_EXTENT = 50 // 50m 够长
  let axisGuideLine: React.ReactNode = null
  if (p1 && livePt && liveAxis !== 'free') {
    if (liveAxis === 'h') {
      // 水平轴：y 锁在 p1[1]，x 延伸
      axisGuideLine = (
        <line
          pointerEvents="none"
          stroke="#60a5fa"
          strokeDasharray={`${5 * px} ${3 * px}`}
          strokeOpacity={0.5}
          strokeWidth={px}
          x1={toSvgX(p1[0] - AXIS_EXTENT)}
          x2={toSvgX(p1[0] + AXIS_EXTENT)}
          y1={toSvgY(p1[1])}
          y2={toSvgY(p1[1])}
        />
      )
    } else {
      // 垂直轴：x 锁在 p1[0]，y 延伸
      axisGuideLine = (
        <line
          pointerEvents="none"
          stroke="#60a5fa"
          strokeDasharray={`${5 * px} ${3 * px}`}
          strokeOpacity={0.5}
          strokeWidth={px}
          x1={toSvgX(p1[0])}
          x2={toSvgX(p1[0])}
          y1={toSvgY(p1[1] - AXIS_EXTENT)}
          y2={toSvgY(p1[1] + AXIS_EXTENT)}
        />
      )
    }
  }

  // 拖尾实线：p1 → livePt（画第二点时）
  const trailingLine =
    p1 && livePt ? (
      <line
        pointerEvents="none"
        stroke="#2D7FF9"
        strokeDasharray={`${6 * px} ${4 * px}`}
        strokeOpacity={0.8}
        strokeWidth={1.5 * px}
        x1={toSvgX(p1[0])}
        x2={toSvgX(livePt[0])}
        y1={toSvgY(p1[1])}
        y2={toSvgY(livePt[1])}
      />
    ) : null

  // 实时距离标签（中点上方）
  let distanceLabel: React.ReactNode = null
  if (p1 && livePt) {
    const dx = livePt[0] - p1[0]
    const dy = livePt[1] - p1[1]
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 0.01) {
      const mx = toSvgX((p1[0] + livePt[0]) / 2)
      const my = toSvgY((p1[1] + livePt[1]) / 2)
      const axisLabel = liveAxis === 'h' ? ' — 水平' : liveAxis === 'v' ? ' | 垂直' : ''
      distanceLabel = (
        <g pointerEvents="none">
          <rect
            x={mx - 34}
            y={my - 22}
            width={68}
            height={18}
            rx={4}
            fill="rgba(24,24,27,0.88)"
            stroke="rgba(45,127,249,0.35)"
            strokeWidth={0.8}
          />
          <text
            x={mx}
            y={my - 8}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={10}
            fontFamily="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
            fontWeight={600}
          >
            {dist.toFixed(2)} m{axisLabel}
          </text>
        </g>
      )
    }
  }

  // 已完成的标定线（两个点都确定后）
  const hasValidLine =
    validPoints.length === 2 && isValidPt(validPoints[0]) && isValidPt(validPoints[1])
  const line = hasValidLine ? (
    <line
      pointerEvents="none"
      stroke="#2D7FF9"
      strokeDasharray={`${8 * px} ${4 * px}`}
      strokeWidth={1.5 * px}
      x1={toSvgX(validPoints[0]![0])}
      x2={toSvgX(validPoints[1]![0])}
      y1={toSvgY(validPoints[0]![1])}
      y2={toSvgY(validPoints[1]![1])}
    />
  ) : null

  return (
    <>
      {axisGuideLine}
      {trailingLine}
      {line}
      {pointMarkers}
      {cursorPreview}
      {distanceLabel}
    </>
  )
}
