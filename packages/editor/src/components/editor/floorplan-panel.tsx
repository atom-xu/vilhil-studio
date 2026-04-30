'use client'

import { Icon } from '@iconify/react'
import {
  type AnyNodeId,
  type BuildingNode,
  calculateLevelMiters,
  type DeviceNode,
  DoorNode,
  emitter,
  type GuideNode,
  getWallPlanFootprint,
  type LevelNode,
  loadAssetUrl,
  type Point2D,
  type SiteNode,
  SlabNode,
  type Subsystem,
  useScene,
  type WallNode,
  WindowNode,
  ZoneNode as ZoneNodeSchema,
  type ZoneNode as ZoneNodeType,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { assignMissingCircuitIds, getLightCircuits, getSubsystemColor, placeDevice } from '@vilhil/smarthome'
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
import { Button } from '../ui/primitives/button'
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
const FLOORPLAN_COLOR_BRAND_PRIMARY = '#2D7FF9'
const FLOORPLAN_COLOR_WARNING = '#f59e0b'
const FLOORPLAN_COLOR_SURFACE = '#f5f5f6'
const FLOORPLAN_COLOR_TRACK = '#94a3b8'

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
  const CUR_COLOR = FLOORPLAN_COLOR_BRAND_PRIMARY
  const REF_COLOR = FLOORPLAN_COLOR_WARNING

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
        stroke={FLOORPLAN_COLOR_TRACK}
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
  { phase: 'cur', index: 0, color: FLOORPLAN_COLOR_BRAND_PRIMARY, label: '当前层', hint: '点第 1 个特征点（墙角 / 交点）' },
  { phase: 'cur', index: 1, color: FLOORPLAN_COLOR_BRAND_PRIMARY, label: '当前层', hint: '点第 2 个特征点（另一个墙角）' },
  { phase: 'ref', index: 0, color: FLOORPLAN_COLOR_WARNING, label: '参考层', hint: '已切换到参考层，点对应的第 1 个特征点' },
  { phase: 'ref', index: 1, color: FLOORPLAN_COLOR_WARNING, label: '参考层', hint: '继续点对应的第 2 个特征点，完成对齐' },
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
        <Button variant="ghost"
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
        </Button>
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
  const strokeColor = isDarkMode ? FLOORPLAN_COLOR_SURFACE : '#09090b'
  const outlineColor = isDarkMode ? '#0a0e1b' : FLOORPLAN_COLOR_SURFACE
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

/**
 * 灯带画线吸附 —— 多重吸附按优先级合成：
 *
 *   1. 墙端点（最近 0.4m 内）→ 直接吸到端点
 *   2. 已有设备位置（最近 0.4m 内）→ 直接吸到该设备
 *   3. 上一个点不为空 + 没按 Shift → 90°/45° 锁定（用 calculatePolygonSnapPoint）
 *   4. 否则原 cursor
 *
 * Shift 按住 = 关闭角度锁定，可以画任意斜线（但仍然吸附端点 / 设备）
 */
function snapStripPoint(
  cursor: WallPlanPoint,
  lastPoint: WallPlanPoint | null,
  walls: WallNode[],
  devices: DeviceNode[],
  shiftPressed: boolean,
): WallPlanPoint {
  const ENDPOINT_SNAP_RADIUS = 0.4
  const r2 = ENDPOINT_SNAP_RADIUS * ENDPOINT_SNAP_RADIUS

  // 1) 墙端点
  let bestEndpoint: WallPlanPoint | null = null
  let bestDist = r2
  for (const w of walls) {
    for (const ep of [w.start, w.end] as ReadonlyArray<readonly [number, number]>) {
      const dx = ep[0] - cursor[0]
      const dz = ep[1] - cursor[1]
      const d2 = dx * dx + dz * dz
      if (d2 < bestDist) {
        bestDist = d2
        bestEndpoint = [ep[0], ep[1]]
      }
    }
  }
  if (bestEndpoint) return bestEndpoint

  // 2) 已有设备位置
  let bestDevice: WallPlanPoint | null = null
  bestDist = r2
  for (const d of devices) {
    const dx = d.position[0] - cursor[0]
    const dz = d.position[2] - cursor[1]
    const d2 = dx * dx + dz * dz
    if (d2 < bestDist) {
      bestDist = d2
      bestDevice = [d.position[0], d.position[2]]
    }
  }
  if (bestDevice) return bestDevice

  // 3) 90° / 45° 角度锁定（lastPoint 必须存在 + Shift 没按）
  if (lastPoint && !shiftPressed) {
    return calculatePolygonSnapPoint(lastPoint, cursor)
  }

  return cursor
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

/**
 * 给墙面挂装设备计算：墙段上的投影点 + 沿墙距离 t + 侧别 + 最终落位点（偏移到墙外侧）
 *
 * 墙方向 d = (end - start) / |end - start|
 * 左法线 nL = (-dz, dx) —— 把 d 顺时针转 90° 得到指向墙一侧的单位法向
 * 右法线 = -nL
 * 用 dot(click - proj, nL) 的符号判定 side
 */
function computeWallPlacement(
  wall: WallNode,
  clickPoint: WallPlanPoint,
  deviceFaceOffset = 0.05,
): {
  projection: WallPlanPoint
  position: WallPlanPoint
  t: number
  side: 'front' | 'back'
} | null {
  const [x1, z1] = wall.start
  const [x2, z2] = wall.end
  const dx = x2 - x1
  const dz = z2 - z1
  const lenSq = dx * dx + dz * dz
  if (lenSq < 1e-9) return null
  const len = Math.sqrt(lenSq)
  const nLx = -dz / len // left normal X
  const nLz = dx / len // left normal Z

  // project click onto wall segment [0,1]
  let t = ((clickPoint[0] - x1) * dx + (clickPoint[1] - z1) * dz) / lenSq
  t = Math.max(0, Math.min(1, t))
  const px = x1 + t * dx
  const pz = z1 + t * dz

  // side: dot( click - projection, leftNormal )
  const ox = clickPoint[0] - px
  const oz = clickPoint[1] - pz
  const dotLeft = ox * nLx + oz * nLz
  const side: 'front' | 'back' = dotLeft >= 0 ? 'front' : 'back'

  // 偏移到墙外侧：墙厚/2 + 小额符号可见量（避免圆点压在墙线上）
  const thickness = wall.thickness ?? 0.12
  const offset = thickness / 2 + deviceFaceOffset
  const sign = side === 'front' ? 1 : -1
  return {
    projection: [px, pz],
    position: [px + nLx * offset * sign, pz + nLz * offset * sign],
    t,
    side,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  天花板设备参考线系统（P1-P5）
//
//  用户拖动鼠标放置吸顶设备时，按优先级扫描各种参考：
//    P1 墙端点（拐角） —— 30cm
//    P2 墙中线（墙中点 + 法线延伸）—— 20cm
//    P3 对边墙中线（平行墙对的中轴）—— 20cm（1C 实现）
//    P4 房间中心轴 —— 20cm（1D 实现）
//    P5 已放设备对齐 —— 10cm（1F 实现）
//
//  CeilingGuide 同时携带吸附后的坐标 + 视觉参考（用于 ghost 层画辅助线）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CeilingGuide —— 复用墙绘制同款 tracking 系统后的简化类型
 *
 * 全部参考线都由 `computeOrthogonalTracking` 或 `computeExtensionTracking` 生成：
 *   - tracking-v：通过 anchor 的垂直参考线（cursor 的 X 吸到 anchor 的 X）
 *   - tracking-h：通过 anchor 的水平参考线（cursor 的 Z 吸到 anchor 的 Z）
 *   - extension：在某堵墙的无限延长线上
 *
 * 拐角 = 同时有 tracking-v 和 tracking-h（由两个 anchor 各给一条）
 * 设备对齐 = anchor 是某个设备的位置
 * 房间中轴 = anchor 是某个 zone 的 centroid
 */
type CeilingGuide =
  | {
      kind: 'tracking-v'
      anchor: WallPlanPoint
      /** 虚线从 anchor 画到 cursor 投影处；让用户看清对齐关系 */
      from: WallPlanPoint
      to: WallPlanPoint
    }
  | {
      kind: 'tracking-h'
      anchor: WallPlanPoint
      from: WallPlanPoint
      to: WallPlanPoint
    }
  | {
      kind: 'extension'
      from: WallPlanPoint
      to: WallPlanPoint
    }
  | {
      /**
       * 等距参考（Keynote 式）：cursor 在两台设备中点 / 或"B 外侧等 AB 距"延续点
       * 渲染两条等长线段 + 距离标注，视觉强调"两段一样"
       */
      kind: 'equidistant'
      /** 两端 anchor（参考设备位置） */
      a: WallPlanPoint
      b: WallPlanPoint
      /** cursor 落位点 —— 要么在 AB 中点，要么在"B 外 1 倍 AB"处 */
      c: WallPlanPoint
    }

/**
 * 天花板参考线吸附 —— 复用墙绘制工具的 tracking 系统
 *
 * 核心：`computeOrthogonalTracking` 对候选 anchor 做"正交追踪"：
 *   - 鼠标 X 和某 anchor X 差 < tolerance → 吸附到 anchor 的 X（垂直参考线）
 *   - 鼠标 Z 和某 anchor Z 差 < tolerance → 吸附到 anchor 的 Z（水平参考线）
 *   - 两轴同时命中 → 落在两条线的交点
 *
 * 拐角吸附 = 同时命中同一 anchor 的 H 和 V
 * 墙中线 / 对边 / 房间中心 / 设备对齐 = 把对应 anchor（墙中点 / zone 中心 / 设备位置）
 * 喂进候选即可，无需五套专门算法
 *
 * 延长线追踪（`computeExtensionTracking`）作为备选：在墙的无限延长线上时吸附
 */
/**
 * 等距参考（Keynote 式）
 *
 * 对任意有序设备对 (a, b)，检查两种等距关系：
 *   1. 中点：cursor ≈ (a+b)/2 → 三点 a, cursor, b 等距（cursor 在中间）
 *   2. 延续：cursor ≈ b + (b-a) → 三点 a, b, cursor 等距链（cursor 在右侧）
 *
 * 取距离鼠标最近的命中。
 */
function findEquidistantSnap(
  cursor: WallPlanPoint,
  devicePoints: WallPlanPoint[],
  tolerance: number,
): { snapPoint: WallPlanPoint; a: WallPlanPoint; b: WallPlanPoint } | null {
  if (devicePoints.length < 2) return null
  let best: {
    snapPoint: WallPlanPoint
    a: WallPlanPoint
    b: WallPlanPoint
    dist: number
  } | null = null
  const tolSq = tolerance * tolerance

  for (let i = 0; i < devicePoints.length; i++) {
    for (let j = 0; j < devicePoints.length; j++) {
      if (i === j) continue
      const a = devicePoints[i]!
      const b = devicePoints[j]!

      // 中点（只在 i<j 时检查以避免重复）
      if (i < j) {
        const mid: WallPlanPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const dx = cursor[0] - mid[0]
        const dz = cursor[1] - mid[1]
        const dsq = dx * dx + dz * dz
        if (dsq <= tolSq && (!best || dsq < best.dist)) {
          best = { snapPoint: mid, a, b, dist: dsq }
        }
      }

      // 延续：cursor 在 B 外侧 1 倍 AB 距处（"a --- b --- cursor"，等距链）
      const ext: WallPlanPoint = [b[0] + (b[0] - a[0]), b[1] + (b[1] - a[1])]
      const dx = cursor[0] - ext[0]
      const dz = cursor[1] - ext[1]
      const dsq = dx * dx + dz * dz
      if (dsq <= tolSq && (!best || dsq < best.dist)) {
        best = { snapPoint: ext, a, b, dist: dsq }
      }
    }
  }
  if (!best) return null
  return { snapPoint: best.snapPoint, a: best.a, b: best.b }
}

function computeCeilingSnap(
  point: WallPlanPoint,
  walls: WallNode[],
  zones: ZoneNodeType[],
  devices: DeviceNode[],
  openings: OpeningNode[] = [],
  ignoreId: string | null = null,
): { snapPoint: WallPlanPoint; guides: CeilingGuide[] } {
  const TOLERANCE = 0.05 // 5cm —— 和墙工具默认相当

  // ── 第 0 步：等距参考优先（Keynote 杀手级：两设备中点 / 等距链延续） ──
  // 明确的用户意图信号："我就要放在两台之间 / 延续等距"
  const devicePoints: WallPlanPoint[] = devices
    .filter((d) => !ignoreId || d.id !== ignoreId)
    .map((d) => [d.position[0], d.position[2]] as WallPlanPoint)
  const equi = findEquidistantSnap(point, devicePoints, TOLERANCE)
  if (equi) {
    return {
      snapPoint: equi.snapPoint,
      guides: [{ kind: 'equidistant', a: equi.a, b: equi.b, c: equi.snapPoint }],
    }
  }

  // 收集候选锚点：
  //   1) 墙端点（tracking-candidates，限制在 8m 内）
  //   2) 无门窗墙的中点（"墙中线"语义）
  //   3) zone 中心（"房间中心轴"语义）
  //   4) 其他已放设备位置（"设备对齐"语义）
  const candidates: WallPlanPoint[] = [
    ...collectTrackingCandidates({ walls, cursor: point, distanceLimit: 8 }),
  ]
  for (const w of walls) {
    if (openings.some((o) => o.wallId === w.id)) continue
    candidates.push([(w.start[0] + w.end[0]) / 2, (w.start[1] + w.end[1]) / 2])
  }
  for (const z of zones) {
    const poly = z.polygon as Array<[number, number]> | undefined
    if (!poly || poly.length < 3) continue
    let cx = 0, cz = 0
    for (const [x, zz] of poly) { cx += x; cz += zz }
    candidates.push([cx / poly.length, cz / poly.length])
  }
  for (const d of devices) {
    if (ignoreId && d.id === ignoreId) continue
    candidates.push([d.position[0], d.position[2]])
  }

  // 正交追踪：H + V 轴
  const ortho = computeOrthogonalTracking({ cursor: point, candidates, tolerance: TOLERANCE })
  if (ortho) {
    const guides: CeilingGuide[] = []
    if (ortho.verticalAnchor) {
      guides.push({
        kind: 'tracking-v',
        anchor: ortho.verticalAnchor,
        from: ortho.verticalAnchor,
        to: ortho.snappedPoint,
      })
    }
    if (ortho.horizontalAnchor) {
      guides.push({
        kind: 'tracking-h',
        anchor: ortho.horizontalAnchor,
        from: ortho.horizontalAnchor,
        to: ortho.snappedPoint,
      })
    }
    return { snapPoint: ortho.snappedPoint, guides }
  }

  // 延长线追踪（备选）：cursor 在某堵墙的无限延长线上
  const ext = computeExtensionTracking({ cursor: point, walls, tolerance: TOLERANCE })
  if (ext) {
    return {
      snapPoint: ext.snappedPoint,
      guides: [{ kind: 'extension', from: ext.referencePoint, to: ext.snappedPoint }],
    }
  }

  return { snapPoint: point, guides: [] }
}


// ═══════════════════════════════════════════════════════════════════════════
//  全时尺寸 —— 从 ghost 位置向 +X / -X / +Z / -Z 四个方向射线求最近墙
//  类似 CAD dynamic input：放置时实时显示到最近墙的距离，不强迫吸附
// ═══════════════════════════════════════════════════════════════════════════

interface WallDistance {
  /** ghost 位置 */
  from: WallPlanPoint
  /** 命中点 */
  to: WallPlanPoint
  /** 距离（米） */
  distance: number
}

/** 射线 origin → dir 与线段 p0 → p1 求交，返回 t 和命中点（t < 0 无交） */
function raySegmentHit(
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  p0X: number,
  p0Z: number,
  p1X: number,
  p1Z: number,
): { t: number; hitX: number; hitZ: number } | null {
  const ex = p1X - p0X
  const ez = p1Z - p0Z
  // 线性方程：
  //   origin + t * dir = p0 + s * (p1 - p0)
  // 矩阵：[dirX  -ex] [t]   [p0X - originX]
  //       [dirZ  -ez] [s] = [p0Z - originZ]
  const det = dirX * -ez - dirZ * -ex
  if (Math.abs(det) < 1e-9) return null // 平行
  const rhsX = p0X - originX
  const rhsZ = p0Z - originZ
  const t = (-ez * rhsX + ex * rhsZ) / det
  const s = (dirX * rhsZ - dirZ * rhsX) / det
  if (t < 1e-6) return null // 反方向或太近（忽略自身位置处）
  if (s < 0 || s > 1) return null // 不在段内
  return {
    t,
    hitX: originX + t * dirX,
    hitZ: originZ + t * dirZ,
  }
}

/**
 * 从 point 向 +X / -X / +Z / -Z 四个轴方向射线，各方向返回最近墙命中
 * 超过 maxRange（默认 15m）不返回，避免过长的标注线
 */
function computeWallDistancesFourWay(
  point: WallPlanPoint,
  walls: WallNode[],
  maxRange = 15,
): WallDistance[] {
  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  const result: WallDistance[] = []
  for (const [dx, dz] of dirs) {
    let nearest: { t: number; hit: WallPlanPoint } | null = null
    for (const w of walls) {
      const hit = raySegmentHit(
        point[0], point[1], dx, dz,
        w.start[0], w.start[1], w.end[0], w.end[1],
      )
      if (!hit || hit.t > maxRange) continue
      if (nearest && hit.t >= nearest.t) continue
      nearest = { t: hit.t, hit: [hit.hitX, hit.hitZ] }
    }
    if (nearest) {
      result.push({
        from: point,
        to: nearest.hit,
        distance: nearest.t,
      })
    }
  }
  return result
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
  const selectionStroke = isDarkMode ? FLOORPLAN_COLOR_SURFACE : '#09090b'
  const handleFill = isDarkMode ? FLOORPLAN_COLOR_SURFACE : '#09090b'
  const handleStroke = isDarkMode ? '#0a0e1b' : FLOORPLAN_COLOR_SURFACE

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
          className="h-7 w-20 rounded border border-white/20 bg-white/10 px-2 text-[12px] text-white outline-none focus:border-primary"
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
        <Button variant="ghost"
          className="rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!inputValue || parseFloat(inputValue) <= 0}
          onClick={handleApply}
          type="button"
        >
          确定
        </Button>
        <Button variant="ghost"
          className="rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => { cancelCalibration(); setInputValue('') }}
          type="button"
        >
          取消
        </Button>
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
        <Button variant="ghost"
          className="pointer-events-auto absolute right-3 bottom-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white shadow backdrop-blur-sm transition-colors hover:bg-black/65"
          title={`建筑朝向 ${northAngle}°`}
          type="button"
        >
          <CompassSvg angle={northAngle} size={22} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-3" side="top">
        <div className="mb-2.5 font-semibold text-[13px] text-foreground">建筑朝向</div>
        <div className="mb-3 flex justify-center">
          <CompassSvg angle={northAngle} labels size={64} />
        </div>
        <div className="mb-2.5 flex gap-1">
          {PRESETS.map(({ label, deg, title }) => (
            <Button variant="ghost"
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
            </Button>
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

// ═══════════════════════════════════════════════════════════════════════════
//  FloorplanDeviceLayer —— 2D 平面上的设备符号层
//
//  职责：为当前楼层所有设备渲染 SVG 小圆点（按 subsystem 上色）
//  位置：device.position[0] = x（plan），device.position[2] = z（plan）
//  尺寸：半径 0.15m（和 0.5m 网格比例约 3:10，视觉不抢戏）
//
//  Step 1 最简实现：只画圆点 + 外圈光晕。后续（Step 2-4）再补预览/吸附/
//  朝向/覆盖范围。不做交互事件（选中后续走 handleBackgroundClick）。
// ═══════════════════════════════════════════════════════════════════════════
// memo —— 和 GridLayer / GuideLayer / GeometryLayer 等其他层保持一致。
// 没 memo 时，FloorplanPanel 每次 re-render 都会让所有设备子节点重新渲染一轮，
// drag 过程中 FloorplanPanel 会以 pointermove 频率重渲（240Hz+），非常卡。
const FloorplanDeviceLayer = memo(function FloorplanDeviceLayer({
  devices,
  worldUnitsPerPixel,
  selectedIdSet,
  onDeviceSelect,
  onDeviceDragStart,
  onDeviceDelete,
  isDeleteMode,
  circuitColors,
  circuitInfoByDevice,
  onStripVertexDragStart,
  onStripVertexDragMove,
  onStripVertexDragEnd,
  onStripPathInsert,
  onStripPathDelete,
}: {
  devices: DeviceNode[]
  worldUnitsPerPixel: number
  selectedIdSet: ReadonlySet<string>
  onDeviceSelect: (deviceId: string, event: ReactMouseEvent<SVGElement>) => void
  /**
   * 设备被按下时调用 —— 父组件用这个启动 drag 流程（在 SVG 级接管 pointermove / pointerup）
   */
  onDeviceDragStart: (deviceId: string, event: ReactPointerEvent<SVGCircleElement>) => void
  /** 删除模式下点击调用 */
  onDeviceDelete: (deviceId: string, event: ReactMouseEvent<SVGElement>) => void
  /** 当前是否处于删除模式（cursor 变成 × + click 走删除路径） */
  isDeleteMode: boolean
  /**
   * 回路自定义颜色（circuitId → HEX）。读自 LevelNode.circuitMeta；
   * 未设置时回路虚线用全局默认色（lighting 子系统色）。
   */
  circuitColors: Record<string, string>
  /**
   * 每盏灯的回路信息（deviceId → number/name/color）—— 渲染 #N 小标签用。
   * 父级从 getLightCircuits 派生，layer 不再自算。
   */
  circuitInfoByDevice: Record<string, { number: number; name?: string; color?: string }>
  /** 灯带顶点 drag 三件套（select 模式 + 灯带选中时显示蓝色 handle）*/
  onStripVertexDragStart: (
    stripId: string,
    vertexIdx: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  onStripVertexDragMove: (event: ReactPointerEvent<SVGCircleElement>) => void
  onStripVertexDragEnd: (event: ReactPointerEvent<SVGCircleElement>) => void
  /** 灯带 path 加点（segment 中点 "+" 按钮）*/
  onStripPathInsert: (stripId: string, segmentIdx: number) => void
  /** 灯带 path 删点（右键顶点）*/
  onStripPathDelete: (stripId: string, vertexIdx: number) => void
}) {
  if (devices.length === 0) return null

  // 半径随缩放略微自适应：远看小圆点不消失，近看不过大
  const r = Math.max(0.08, Math.min(0.2, worldUnitsPerPixel * 6))
  const haloR = r * 1.8
  const strokeW = Math.max(0.01, worldUnitsPerPixel * 0.8)

  // 命中半径放大：小圆点点击不容易，用一个更大的透明圆做 hit target
  const hitR = r * 3

  // 回路连线 —— 同 circuitId 的灯按"最近邻折线"串起来。
  // 视觉上一眼看出"哪几盏灯归一组"。仅对灯（subsystem === 'lighting'）有效。
  // 算法：每个回路内按位置贪心串成一条折线（不是 MST，但对灯组够用），
  // 复杂度 O(n²)，n 是回路里灯的数量，一般 <= 20，性能完全够。
  // 灯带（params.path）用 path 的中点参与（让回路虚线连到灯带中央）。
  const circuitPolylines: Array<{ id: string; pts: Array<[number, number]> }> = (() => {
    type Pt = { id: string; cx: number; cy: number }
    const groups = new Map<string, Pt[]>()
    for (const d of devices) {
      if (d.subsystem !== 'lighting') continue
      const cid = (d.params as { circuitId?: string } | undefined)?.circuitId
      if (!cid) continue
      const path = (d.params as { path?: Array<[number, number]> } | undefined)?.path
      let cx: number, cy: number
      if (path && path.length >= 2) {
        // 灯带：用 path 中点
        const mx = path.reduce((s, p) => s + p[0], 0) / path.length
        const mz = path.reduce((s, p) => s + p[1], 0) / path.length
        cx = -mx; cy = -mz
      } else {
        cx = -d.position[0]; cy = -d.position[2]
      }
      const arr = groups.get(cid) ?? []
      arr.push({ id: d.id, cx, cy })
      groups.set(cid, arr)
    }
    const out: Array<{ id: string; pts: Array<[number, number]> }> = []
    for (const [cid, pts] of groups) {
      if (pts.length < 2) continue // 单灯不画线
      // 贪心最近邻串联：从第一盏开始，每次找最近未访问的
      const remaining = pts.slice(1)
      const seq: Pt[] = [pts[0]!]
      while (remaining.length > 0) {
        const last = seq[seq.length - 1]!
        let bestIdx = 0
        let bestDist = Infinity
        for (let i = 0; i < remaining.length; i++) {
          const p = remaining[i]!
          const dx = p.cx - last.cx
          const dy = p.cy - last.cy
          const d2 = dx * dx + dy * dy
          if (d2 < bestDist) {
            bestDist = d2
            bestIdx = i
          }
        }
        seq.push(remaining.splice(bestIdx, 1)[0]!)
      }
      out.push({ id: cid, pts: seq.map((p) => [p.cx, p.cy] as [number, number]) })
    }
    return out
  })()

  return (
    <g>
      {/* 回路连线层 —— 渲染在设备圆点之下，避免遮挡 */}
      {circuitPolylines.length > 0 && (
        <g pointerEvents="none">
          {circuitPolylines.map(({ id, pts }) => {
            const path = pts
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`)
              .join(' ')
            // 自定义回路色优先；没有就用 lighting 子系统默认黄
            const stroke = circuitColors[id] ?? '#d4a853'
            return (
              <path
                key={id}
                d={path}
                fill="none"
                stroke={stroke}
                strokeWidth={Math.max(0.005, worldUnitsPerPixel * 0.6)}
                strokeDasharray={`${Math.max(0.05, worldUnitsPerPixel * 4)} ${Math.max(0.04, worldUnitsPerPixel * 3)}`}
                opacity={0.55}
              />
            )
          })}
        </g>
      )}
      {/* 灯带（params.path）单独画 polyline，不再画圆点 */}
      {devices.map((d) => {
        const path = (d.params as { path?: Array<[number, number]> } | undefined)?.path
        if (!path || path.length < 2) return null
        const isSelected = selectedIdSet.has(d.id)
        const color = getSubsystemColor(d.subsystem)
        const stripStrokeW = Math.max(0.025, worldUnitsPerPixel * 2.4)
        const dStr = path
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${-p[0]} ${-p[1]}`)
          .join(' ')
        // 灯带的 #N 标签锚点：path 中点
        const stripCx = -path.reduce((s, p) => s + p[0], 0) / path.length
        const stripCy = -path.reduce((s, p) => s + p[1], 0) / path.length
        const info = circuitInfoByDevice[d.id]
        return (
          <g key={`strip-${d.id}`} style={{ cursor: isDeleteMode ? 'not-allowed' : 'pointer' }}>
            {/* 光晕：粗一点的透明描边 */}
            <path
              d={dStr}
              fill="none"
              stroke={color}
              strokeWidth={stripStrokeW * 1.8}
              opacity={0.18}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {/* 实线 */}
            <path
              d={dStr}
              fill="none"
              stroke={color}
              strokeWidth={stripStrokeW}
              opacity={0.95}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {/* 选中态：外描边 */}
            {isSelected && (
              <path
                d={dStr}
                fill="none"
                stroke="#006AFF"
                strokeWidth={stripStrokeW * 2.4}
                opacity={0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}
            {/* 命中：粗透明 path 接管点击 */}
            <path
              d={dStr}
              fill="none"
              stroke="transparent"
              strokeWidth={stripStrokeW * 3.5}
              strokeLinecap="round"
              onPointerDown={(e) => {
                if (e.button !== 0) return
                if (isDeleteMode) return
                e.stopPropagation()
                onDeviceDragStart(d.id, e as any)
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (isDeleteMode) {
                  onDeviceDelete(d.id, e as ReactMouseEvent<SVGElement>)
                } else {
                  onDeviceSelect(d.id, e as ReactMouseEvent<SVGElement>)
                }
              }}
            />
            {/* #N 回路标签 —— path 中点上方 */}
            {info && (
              <FloorplanCircuitBadge
                cx={stripCx}
                cy={stripCy}
                color={info.color ?? color}
                number={info.number}
                worldUnitsPerPixel={worldUnitsPerPixel}
              />
            )}
            {/* 选中：每个 path 顶点画蓝色 handle，可拖动改 path
                右键顶点 = 删点（path.length > 2 才有效） */}
            {isSelected &&
              path.map((p, idx) => {
                const vR = Math.max(0.05, worldUnitsPerPixel * 5)
                return (
                  <circle
                    key={`vertex-${idx}`}
                    cx={-p[0]}
                    cy={-p[1]}
                    r={vR}
                    fill="#fff"
                    stroke="#006AFF"
                    strokeWidth={Math.max(0.008, worldUnitsPerPixel * 0.9)}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => onStripVertexDragStart(d.id, idx, e)}
                    onPointerMove={onStripVertexDragMove}
                    onPointerUp={onStripVertexDragEnd}
                    onPointerCancel={onStripVertexDragEnd}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onStripPathDelete(d.id, idx)
                    }}
                  />
                )
              })}
            {/* 选中：每段中点画 "+" 加点按钮（path.length-1 段，全部显示） */}
            {isSelected &&
              path.length >= 2 &&
              path.slice(0, -1).map((a, idx) => {
                const b = path[idx + 1]!
                const mx = -(a[0] + b[0]) / 2
                const my = -(a[1] + b[1]) / 2
                const plusR = Math.max(0.04, worldUnitsPerPixel * 4)
                return (
                  <g key={`plus-${idx}`} style={{ cursor: 'copy' }}>
                    <circle
                      cx={mx}
                      cy={my}
                      r={plusR}
                      fill="#006AFF"
                      stroke="#fff"
                      strokeWidth={Math.max(0.005, worldUnitsPerPixel * 0.5)}
                      opacity={0.85}
                      onClick={(e) => {
                        e.stopPropagation()
                        onStripPathInsert(d.id, idx)
                      }}
                    />
                    {/* 十字线 "+" */}
                    <line
                      x1={mx - plusR * 0.55}
                      x2={mx + plusR * 0.55}
                      y1={my}
                      y2={my}
                      stroke="#fff"
                      strokeWidth={Math.max(0.005, worldUnitsPerPixel * 0.7)}
                      pointerEvents="none"
                    />
                    <line
                      x1={mx}
                      x2={mx}
                      y1={my - plusR * 0.55}
                      y2={my + plusR * 0.55}
                      stroke="#fff"
                      strokeWidth={Math.max(0.005, worldUnitsPerPixel * 0.7)}
                      pointerEvents="none"
                    />
                  </g>
                )
              })}
          </g>
        )
      })}
      {devices.map((d) => {
        // path 灯带不画圆点，跳过
        const hasPath = !!(d.params as { path?: unknown } | undefined)?.path
        if (hasPath) return null
        // SVG 坐标 = -world（floorplan 用 toSvgX/toSvgY 做负号翻转）
        const cx = -d.position[0]
        const cy = -d.position[2]
        const color = getSubsystemColor(d.subsystem)
        const isSelected = selectedIdSet.has(d.id)
        const handleSelect = (
          e:
            | ReactMouseEvent<SVGGElement>
            | ReactPointerEvent<SVGCircleElement>
            | ReactPointerEvent<SVGGElement>,
        ) => {
          e.stopPropagation()
          if (isDeleteMode) {
            onDeviceDelete(d.id, e as ReactMouseEvent<SVGElement>)
          } else {
            onDeviceSelect(d.id, e as ReactMouseEvent<SVGElement>)
          }
        }
        // 灯具覆盖范围（点光源专用）—— 只在 lighting 子系统 + 选中时显示。
        // 半径 = h × tan(beamAngle/2)。h 优先用实际安装高度（position[1]），fallback 2.6m。
        // beamAngle 默认 30°；运行时由 device-panel 的"光束角"滑块编辑。
        const showLightCoverage = d.subsystem === 'lighting' && isSelected
        const lightCoverageR = (() => {
          if (!showLightCoverage) return 0
          const beamDeg = (d.params?.beamAngle as number | undefined) ?? 30
          const installH = (d.position[1] as number | undefined) ?? 2.6
          // 装在地面或负楼层时，画"假定 2.6m 净高"的覆盖（避免 0 半径）
          const h = installH > 0.5 ? installH : 2.6
          return h * Math.tan((beamDeg / 2) * (Math.PI / 180))
        })()

        return (
          <g key={d.id} style={{ cursor: isDeleteMode ? 'not-allowed' : 'pointer' }}>
            {/* 灯具覆盖：选中时画一个半透明圆（光锥在地面的投影）—— 帮助设计师评估照明范围 */}
            {showLightCoverage && lightCoverageR > 0.01 && (
              <>
                <circle
                  cx={cx}
                  cy={cy}
                  r={lightCoverageR}
                  fill={color}
                  opacity={0.06}
                  pointerEvents="none"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={lightCoverageR}
                  fill="none"
                  stroke={color}
                  strokeWidth={Math.max(0.005, worldUnitsPerPixel * 0.7)}
                  strokeDasharray={`${Math.max(0.04, worldUnitsPerPixel * 3)} ${Math.max(0.03, worldUnitsPerPixel * 2)}`}
                  opacity={0.5}
                  pointerEvents="none"
                />
              </>
            )}
            {/* 视觉：光晕 + 实心 */}
            <circle
              cx={cx}
              cy={cy}
              r={haloR}
              fill={color}
              opacity={0.18}
              pointerEvents="none"
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={color}
              stroke="#fff"
              strokeWidth={strokeW}
              opacity={0.95}
              pointerEvents="none"
            />
            {/* 选中态：外层蓝环（不响应事件） */}
            {isSelected && (
              <circle
                cx={cx}
                cy={cy}
                r={r * 2.1}
                fill="none"
                stroke="#006AFF"
                strokeWidth={strokeW * 2}
                opacity={0.9}
                pointerEvents="none"
              />
            )}
            {/* 摄像头方向指示扇形 —— 始终显示（和 3D 演示页保持视觉一致）
                未选中：subsystem 橙色（安防色）；选中：蓝色（匹配选中态蓝环）
                纯视觉，不交互；方向调节由"follow mode"接管 */}
            {d.subsystem === 'security' &&
              (d.renderType === 'dome' || d.renderType === 'camera-bullet') && (
                <FloorplanCameraDirectionSector
                  centerSvg={[cx, cy]}
                  directionDeg={(d.params?.direction as number | undefined) ?? 0}
                  innerR={r * 1.15}
                  outerR={r * 2.0}
                  color={isSelected ? '#006AFF' : color}
                />
              )}
            {/* 命中目标：透明大圆
                - 删除模式：只响应 click（走删除）
                - 选择模式：onPointerDown 启动 drag，onClick 纯点击选中
             */}
            <circle
              cx={cx}
              cy={cy}
              r={hitR}
              fill="transparent"
              onPointerDown={(e) => {
                if (e.button !== 0) return
                if (isDeleteMode) return // 删除模式不启动 drag
                e.stopPropagation()
                onDeviceDragStart(d.id, e)
              }}
              onClick={handleSelect}
            />
            {/* #N 回路标签 —— 仅 lighting 子系统；圆点正下方一行 */}
            {d.subsystem === 'lighting' && circuitInfoByDevice[d.id] && (
              <FloorplanCircuitBadge
                cx={cx}
                cy={cy + r * 2.4}
                color={circuitInfoByDevice[d.id]!.color ?? color}
                number={circuitInfoByDevice[d.id]!.number}
                worldUnitsPerPixel={worldUnitsPerPixel}
              />
            )}
          </g>
        )
      })}
    </g>
  )
})

/**
 * 回路 #N 小标签 —— 灯/灯带的悬浮徽章。
 *
 * 视觉：圆角小胶囊 + #N 文字。颜色用回路自定义色（fallback 到 lighting 黄）。
 * 缩放：尺寸跟随 worldUnitsPerPixel（保证不同 zoom 下视觉大小恒定，约 16-20px 高）。
 * 不响应事件（pointerEvents=none）—— 选择由灯本体 hit 元素负责。
 */
function FloorplanCircuitBadge({
  cx,
  cy,
  color,
  number,
  worldUnitsPerPixel,
}: {
  cx: number
  cy: number
  color: string
  number: number
  worldUnitsPerPixel: number
}) {
  // SVG 单位换算：worldUnitsPerPixel 等于"1 SVG 单位 = 多少米"。
  // 想让胶囊高度永远是 ~14px → 高度 = 14 * worldUnitsPerPixel。
  const h = Math.max(0.12, worldUnitsPerPixel * 14)
  const w = h * 1.6 + (number >= 10 ? h * 0.6 : 0) // 两位数加宽
  const fontSize = h * 0.62
  return (
    <g pointerEvents="none">
      <rect
        x={cx - w / 2}
        y={cy}
        width={w}
        height={h}
        rx={h / 2}
        ry={h / 2}
        fill={color}
        fillOpacity={0.92}
      />
      <text
        x={cx}
        y={cy + h / 2}
        fontSize={fontSize}
        fontWeight={700}
        fill="#000"
        fillOpacity={0.78}
        textAnchor="middle"
        dominantBaseline="central"
        // 字体跟随 SVG 缩放，所以指定 font-family 用全局即可
      >
        {`#${number}`}
      </text>
    </g>
  )
}

/** 灯带画线 draft 预览 —— 已确认的折线段（实色）+ 当前未确认的尾段（虚线 ghost）
 *  - 至少一个 confirmed point 才显示尾段
 *  - 端点小圆点
 */
function FloorplanLightStripDraft({
  draft,
  color,
  worldUnitsPerPixel,
}: {
  draft: { points: Array<[number, number]>; hoverPoint: [number, number] | null }
  color: string
  worldUnitsPerPixel: number
}) {
  const stroke = Math.max(0.025, worldUnitsPerPixel * 2.4)
  const dotR = Math.max(0.04, worldUnitsPerPixel * 4)
  // 命中点（hoverPoint）的十字准星：半径 + 线宽独立于端点，突出"下一次点击在哪"
  const crossR = Math.max(0.12, worldUnitsPerPixel * 10)
  const crossLine = Math.max(0.008, worldUnitsPerPixel * 0.9)

  // confirmed 段（实色）
  const confirmedD = draft.points.length >= 2
    ? draft.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${-p[0]} ${-p[1]}`).join(' ')
    : null

  // ghost 段（最后一个 confirmed → hoverPoint）
  const last = draft.points.length > 0 ? draft.points[draft.points.length - 1]! : null
  const ghostD = last && draft.hoverPoint
    ? `M ${-last[0]} ${-last[1]} L ${-draft.hoverPoint[0]} ${-draft.hoverPoint[1]}`
    : null

  const hx = draft.hoverPoint ? -draft.hoverPoint[0] : null
  const hy = draft.hoverPoint ? -draft.hoverPoint[1] : null

  return (
    <g pointerEvents="none">
      {confirmedD && (
        <path
          d={confirmedD}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          opacity={0.85}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {ghostD && (
        <path
          d={ghostD}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          opacity={0.45}
          strokeDasharray={`${stroke * 3} ${stroke * 2}`}
          strokeLinecap="round"
        />
      )}
      {/* 端点 —— 已确认的每个点 */}
      {draft.points.map((p, i) => (
        <circle
          key={i}
          cx={-p[0]}
          cy={-p[1]}
          r={dotR}
          fill="#fff"
          stroke={color}
          strokeWidth={Math.max(0.008, worldUnitsPerPixel * 0.8)}
        />
      ))}
      {/* Hover 十字准星 —— 给"下一次点击位置"一个清晰的视觉锚点。
          即便尚未点第一个点，用户也能立刻看出自己在灯带模式里。 */}
      {hx !== null && hy !== null && (
        <>
          <circle
            cx={hx}
            cy={hy}
            r={crossR * 0.85}
            fill="none"
            stroke={color}
            strokeWidth={crossLine}
            opacity={0.35}
          />
          <line
            x1={hx - crossR}
            x2={hx + crossR}
            y1={hy}
            y2={hy}
            stroke={color}
            strokeWidth={crossLine}
            opacity={0.6}
            strokeLinecap="round"
          />
          <line
            x1={hx}
            x2={hx}
            y1={hy - crossR}
            y2={hy + crossR}
            stroke={color}
            strokeWidth={crossLine}
            opacity={0.6}
            strokeLinecap="round"
          />
          <circle cx={hx} cy={hy} r={dotR * 0.7} fill={color} opacity={0.95} />
        </>
      )}
    </g>
  )
}

/**
 * 窗帘 2 点画线 draft 渲染（仅 curtain-side-open）—— 视觉风格故意区别灯带：
 *   - 灯带：折线 polyline + 多端点 + 十字准星
 *   - 窗帘：单段实线 + 起点圆环 + 鼠标端方括号 + 实时宽度数
 *
 * 数据：从 useEditor.curtainDraft 读 wallId + t1 + point1 + hoverT
 * 锁定的墙 wallNode 用于算 hoverPoint 世界坐标 + 中点宽度数标位置
 */
function FloorplanCurtainDraft({
  draft,
  walls,
  worldUnitsPerPixel,
}: {
  draft: { wallId: string; t1: number; point1: [number, number]; hoverT: number | null }
  walls: WallNode[]
  worldUnitsPerPixel: number
}) {
  const wall = walls.find((w) => w.id === draft.wallId)
  if (!wall) return null

  const stroke = Math.max(0.04, worldUnitsPerPixel * 3)
  const ringR = Math.max(0.10, worldUnitsPerPixel * 8)
  const ringStroke = Math.max(0.012, worldUnitsPerPixel * 1.4)
  const labelOffset = Math.max(0.18, worldUnitsPerPixel * 16)
  const fontSize = Math.max(0.14, worldUnitsPerPixel * 12)

  // SVG 坐标系：toSvgX = -x, toSvgY = -y
  const ax = -draft.point1[0]
  const ay = -draft.point1[1]

  // 计算 hover 端世界坐标
  const wDx = wall.end[0] - wall.start[0]
  const wDz = wall.end[1] - wall.start[1]
  const wallLen = Math.hypot(wDx, wDz)

  let hx: number | null = null
  let hy: number | null = null
  let widthM: number | null = null
  let labelX: number | null = null
  let labelY: number | null = null
  if (draft.hoverT !== null && wallLen > 0.001) {
    const hxWorld = wall.start[0] + wDx * draft.hoverT
    const hyWorld = wall.start[1] + wDz * draft.hoverT
    hx = -hxWorld
    hy = -hyWorld
    widthM = Math.abs(draft.hoverT - draft.t1) * wallLen
    // label 在 ghost 段的中点，沿墙法线偏一段
    const midX = (ax + hx) / 2
    const midY = (ay + hy) / 2
    const normX = -wDz / wallLen
    const normZ = wDx / wallLen
    labelX = midX + (-normX) * labelOffset
    labelY = midY + (-normZ) * labelOffset
  }

  const accent = '#5fb1ff' // 窗帘统一蓝（区别灯带的橙）

  return (
    <g pointerEvents="none">
      {/* 起点环 —— 第 1 点已锁定的视觉锚 */}
      <circle
        cx={ax}
        cy={ay}
        r={ringR}
        fill="rgba(95,177,255,0.12)"
        stroke={accent}
        strokeWidth={ringStroke}
      />
      <circle cx={ax} cy={ay} r={ringR * 0.3} fill={accent} />

      {hx !== null && hy !== null && (
        <>
          {/* ghost 段 —— 实线（区别灯带的虚线）+ 半透明 + 端点方括号风 */}
          <line
            x1={ax}
            y1={ay}
            x2={hx}
            y2={hy}
            stroke={accent}
            strokeWidth={stroke}
            opacity={0.85}
            strokeLinecap="round"
          />
          {/* hover 端的方括号指示（区别灯带的圆点） */}
          <circle
            cx={hx}
            cy={hy}
            r={ringR * 0.7}
            fill="none"
            stroke={accent}
            strokeWidth={ringStroke * 1.2}
            opacity={0.9}
          />
          <circle cx={hx} cy={hy} r={ringR * 0.25} fill={accent} />
          {/* 实时宽度数标 */}
          {widthM !== null && labelX !== null && labelY !== null && widthM > 0.05 && (
            <g>
              <rect
                x={labelX - fontSize * 1.6}
                y={labelY - fontSize * 0.8}
                width={fontSize * 3.2}
                height={fontSize * 1.4}
                rx={fontSize * 0.3}
                fill="rgba(15,18,26,0.85)"
                stroke={accent}
                strokeWidth={ringStroke * 0.8}
              />
              <text
                x={labelX}
                y={labelY}
                fill="rgba(229,240,255,0.95)"
                fontSize={fontSize}
                fontFamily="system-ui, sans-serif"
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {widthM.toFixed(2)}m
              </text>
            </g>
          )}
        </>
      )}
    </g>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  FloorplanDeviceGhost —— 设备工具激活时的鼠标预览
//
//  见到鼠标跟着一个半透明圆点 + 虚线外圈就知道"现在点一下会放设备"
// ═══════════════════════════════════════════════════════════════════════════
/** 参考线层 —— 独立于 ghost，放置预览和拖动移动都能用 */
function FloorplanCeilingGuidesLayer({
  guides,
  worldUnitsPerPixel,
}: {
  guides: CeilingGuide[]
  worldUnitsPerPixel: number
}) {
  if (guides.length === 0) return null
  return (
    <g pointerEvents="none">
      {guides.map((g, i) => (
        <FloorplanCeilingGuideVisual
          key={`${g.kind}-${i}`}
          guide={g}
          worldUnitsPerPixel={worldUnitsPerPixel}
        />
      ))}
    </g>
  )
}

/** 全时尺寸层 —— 4 向墙距离标线 + 数字（CAD dynamic input 风格）
 *
 * 样式：和墙体尺寸完全一致（灰色文字 + halo），无高亮无变色
 * "对齐"的视觉反馈由参考线（橙色虚线）提供，数字只负责精准阅读
 */
function FloorplanWallDistancesLayer({
  distances,
  unit,
  worldUnitsPerPixel,
  palette,
}: {
  distances: WallDistance[]
  unit: 'metric' | 'imperial'
  worldUnitsPerPixel: number
  palette: FloorplanPalette
}) {
  if (distances.length === 0) return null
  const strokeW = Math.max(0.006, worldUnitsPerPixel * 0.6)
  const dash = Math.max(0.06, worldUnitsPerPixel * 3)
  const fontSize = FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE
  const haloW = FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH
  const fill = palette.measurementStroke

  return (
    <g pointerEvents="none">
      {distances.map((d, i) => {
        const fx = -d.from[0]
        const fy = -d.from[1]
        const tx = -d.to[0]
        const ty = -d.to[1]
        const mx = (fx + tx) / 2
        const my = (fy + ty) / 2
        const label = formatMeasurement(d.distance, unit)
        return (
          <g key={i}>
            <line
              x1={fx} y1={fy} x2={tx} y2={ty}
              stroke={fill}
              strokeWidth={strokeW}
              strokeDasharray={`${dash} ${dash * 0.5}`}
              opacity={0.4}
            />
            <circle cx={tx} cy={ty} r={strokeW * 1.5} fill={fill} opacity={0.55} />
            <text
              x={mx} y={my}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
              fontSize={fontSize}
              fontWeight={600}
              paintOrder="stroke"
              stroke={palette.surface}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={haloW}
              fill={fill}
              style={{ userSelect: 'none' }}
            >
              {label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** Ghost —— 仅放置预览期间的半透明圆点 */
function FloorplanDeviceGhost({
  point,
  subsystem,
  worldUnitsPerPixel,
}: {
  point: WallPlanPoint | null
  subsystem: string | null
  worldUnitsPerPixel: number
}) {
  if (!point || !subsystem) return null
  const r = Math.max(0.08, Math.min(0.2, worldUnitsPerPixel * 6))
  const haloR = r * 2.2
  const strokeW = Math.max(0.015, worldUnitsPerPixel * 1.1)
  const dashLen = Math.max(0.08, worldUnitsPerPixel * 4)
  const cx = -point[0]
  const cy = -point[1]
  const color = getSubsystemColor(subsystem as Subsystem)

  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={haloR} fill={color} opacity={0.1} />
      <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.5} stroke="#fff" strokeWidth={strokeW} />
      <circle cx={cx} cy={cy} r={haloR} fill="none" stroke={color}
        strokeWidth={strokeW} strokeDasharray={`${dashLen} ${dashLen * 0.6}`} opacity={0.8} />
    </g>
  )
}

/** 单条 ceiling guide 的视觉渲染 —— 全部用统一强调色（Keynote 式），避免多色混乱
 *
 * 不同参考类型用"形状"区分，不用"颜色"区分：
 *   - corner → × 十字
 *   - device-align → 点到点的虚线（对齐到另一台设备）
 *   - wall-midline / between-walls / room-axis → 跨房间的虚线轴
 */
const GUIDE_ACCENT = '#f97316' // orange-500，足够醒目又不刺眼

function FloorplanCeilingGuideVisual({
  guide,
  worldUnitsPerPixel,
}: {
  guide: CeilingGuide
  worldUnitsPerPixel: number
}) {
  // 等距参考：画两条线段 a-c 和 c-b，两段同长，各自标注距离
  if (guide.kind === 'equidistant') {
    const dist = Math.hypot(guide.a[0] - guide.c[0], guide.a[1] - guide.c[1])
    const label = dist >= 0.1 ? formatMeasurement(dist, 'metric') : undefined
    return (
      <g>
        <FloorplanGuideLine
          from={guide.a}
          to={guide.c}
          color={GUIDE_ACCENT}
          worldUnitsPerPixel={worldUnitsPerPixel}
          label={label}
        />
        <FloorplanGuideLine
          from={guide.c}
          to={guide.b}
          color={GUIDE_ACCENT}
          worldUnitsPerPixel={worldUnitsPerPixel}
          label={label}
        />
        <FloorplanGuideAnchorDot
          anchor={guide.a}
          color={GUIDE_ACCENT}
          worldUnitsPerPixel={worldUnitsPerPixel}
        />
        <FloorplanGuideAnchorDot
          anchor={guide.b}
          color={GUIDE_ACCENT}
          worldUnitsPerPixel={worldUnitsPerPixel}
        />
      </g>
    )
  }

  // tracking-v / tracking-h / extension：从 anchor 到 cursor 的虚线
  const dist = Math.hypot(guide.from[0] - guide.to[0], guide.from[1] - guide.to[1])
  const label = dist >= 0.1 ? formatMeasurement(dist, 'metric') : undefined
  return (
    <g>
      <FloorplanGuideLine
        from={guide.from}
        to={guide.to}
        color={GUIDE_ACCENT}
        worldUnitsPerPixel={worldUnitsPerPixel}
        label={label}
      />
      {(guide.kind === 'tracking-v' || guide.kind === 'tracking-h') && (
        <FloorplanGuideAnchorDot
          anchor={guide.anchor}
          color={GUIDE_ACCENT}
          worldUnitsPerPixel={worldUnitsPerPixel}
        />
      )}
    </g>
  )
}

/** 摄像头旋转指示扇形 —— 纯视觉，不交互
 *
 * 方向调节交互由上层 "follow mode" 接管：选中摄像头后鼠标自动追方向，任意位置单击确认
 * 这个扇形只负责实时显示当前朝向（跟着 params.direction 更新）
 *
 * 形状：环形扇形 90° 宽，嵌在内点（内圈 r × 1.15）和蓝选中环（外圈 r × 2.0）之间
 */
// ═══════════════════════════════════════════════════════════════════════════
//  WiFi 热力图 —— UniFi 风格物理模型
//
//  模型：RSSI(d) = Ptx + Gt - FSPL(d) - ΣWallLoss
//    Ptx        发射功率（dBm）
//    Gt         天线增益（dBi）
//    FSPL(d)    室内路径损耗 L0(freq) + 10n·log10(d)，n = 路径损耗指数
//    WallLoss   每面墙衰减（dB），按墙种类不同
//
//  对齐 UniFi：颜色梯度按信号强度分带
//    ≥ -55 dBm  → Great (深绿)
//    ≥ -65      → Good (浅绿)
//    ≥ -75      → Fair (黄)
//    ≥ -85      → Poor (橙)
//    < -85      → None (淡红/透明)
// ═══════════════════════════════════════════════════════════════════════════

/** 每种墙类型在 2.4 GHz / 5 GHz 的单面衰减（dB）
 *  参考 Cisco/UniFi 室内 RF 规划文档典型值
 */
const WALL_ATTENUATION_DB: Record<string, { at2_4: number; at5: number }> = {
  exterior:       { at2_4: 12, at5: 18 }, // 240mm 外墙（混凝土/砖）
  'load-bearing': { at2_4: 15, at5: 22 }, // 200mm 承重（钢筋混凝土）
  interior:       { at2_4: 6,  at5: 10 }, // 120mm 内墙
  partition:      { at2_4: 4,  at5: 7  }, // 100mm 隔墙
  light:          { at2_4: 3,  at5: 5  }, // 80mm 轻质
  // 兜底：未知类型按内墙处理
  default:        { at2_4: 6,  at5: 10 },
}

/** 典型频段中心频率（MHz）—— 用于精确 FSPL 计算 */
const FREQ_MHZ: Record<'2.4' | '5', number> = {
  '2.4': 2437, // 2.4 GHz 信道 6
  '5':   5500, // 5 GHz 中段
}

interface WifiApParams {
  txPower: number       // dBm
  antennaGain: number   // dBi
  freq: '2.4' | '5'
}

const DEFAULT_WIFI: WifiApParams = {
  txPower: 17,   // 真实消费级 AP 典型值（原 20 过于理想）
  antennaGain: 3,
  freq: '5',
}

function getWifiParams(device: DeviceNode): WifiApParams {
  const custom = (device.params?.custom as { wifi?: Partial<WifiApParams> } | undefined)?.wifi
  return {
    txPower: custom?.txPower ?? DEFAULT_WIFI.txPower,
    antennaGain: custom?.antennaGain ?? DEFAULT_WIFI.antennaGain,
    freq: custom?.freq ?? DEFAULT_WIFI.freq,
  }
}

/** 路径损耗指数 n 按墙数动态选（对齐 UniFi 实测）：
 *    0 墙 → n=2.0 自由空间 LOS
 *    1-2 墙 → n=2.8 室内常规
 *    3+ 墙 → n=3.5 NLOS 重损耗
 *  再叠加每面墙的显式 dB 衰减（WALL_ATTENUATION_DB）
 */
function pickPathLossExponent(wallCount: number): number {
  if (wallCount === 0) return 2.0
  if (wallCount <= 2) return 2.8
  return 3.5
}

/** 两线段是否严格相交（共享端点不算）—— CCW 算法 */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const ccw = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (rx - px) * (qy - py)
  const d1 = ccw(cx, cy, dx, dy, ax, ay)
  const d2 = ccw(cx, cy, dx, dy, bx, by)
  const d3 = ccw(ax, ay, bx, by, cx, cy)
  const d4 = ccw(ax, ay, bx, by, dx, dy)
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  )
}

/** 计算 AP 到 point 的 RSSI（dBm）—— UniFi 对齐版
 *
 *    RSSI = EIRP − PathLoss − Σ WallAttenuation
 *    EIRP = txPower + antennaGain
 *    PathLoss = 20·log10(f_MHz) − 27.55 + 10·n·log10(d)
 *      其中 n 按穿墙数动态选（0/1-2/3+）
 *
 *  精确 FSPL 公式，和 UniFi 一致
 */
function computeRssiAtPoint(
  apX: number, apZ: number,
  wifi: WifiApParams,
  px: number, pz: number,
  walls: WallNode[],
): number {
  const dx = px - apX
  const dz = pz - apZ
  const d = Math.sqrt(dx * dx + dz * dz)
  if (d < 0.5) return wifi.txPower + wifi.antennaGain - 20 // 近 AP 饱和

  // 统计穿墙数 + 累加每面墙衰减
  let wallCount = 0
  let wallLossDb = 0
  for (const w of walls) {
    const hit = segmentsIntersect(
      apX, apZ, px, pz,
      w.start[0], w.start[1], w.end[0], w.end[1],
    )
    if (!hit) continue
    wallCount++
    const wallType = ((w.metadata as any)?.wallType as string | undefined) ?? 'default'
    const att = WALL_ATTENUATION_DB[wallType] ?? WALL_ATTENUATION_DB.default!
    wallLossDb += wifi.freq === '5' ? att.at5 : att.at2_4
  }

  // 动态 n：穿墙越多，整体室内损耗指数越高（对齐 UniFi 2 / 2.8 / 3.5 三档）
  const n = pickPathLossExponent(wallCount)
  const freqMHz = FREQ_MHZ[wifi.freq]
  // 标准 FSPL：20·log10(d) + 20·log10(f_MHz) − 27.55
  // 把 20·log10(d) 拆成 n 版本 → 10·n·log10(d)
  const pathLossDb =
    20 * Math.log10(freqMHz) - 27.55 + 10 * n * Math.log10(d)

  return wifi.txPower + wifi.antennaGain - pathLossDb - wallLossDb
}

/** RSSI → RGBA 平滑梯度（线性插值，和 UniFi 一样柔和过渡）
 *
 * 关键色停点（从强到弱）：
 *   -40 dBm  → 深绿   (22,163,74, 180)
 *   -55      → 绿     (22,163,74, 150)
 *   -65      → 黄绿   (101,163,13, 140)
 *   -75      → 琥珀   (202,138,4, 120)
 *   -85      → 橙     (234,88,12, 100)
 *   -95      → 红     (220,38,38, 70)
 *   -105     → 透明   (0,0,0, 0)
 *
 * 相邻停点之间线性混色 —— 消除"马赛克色带"
 */
/** RSSI 色停点 —— 对齐设计场景："可用覆盖区"观感
 *
 * 真实消费级 AP 的有效设计覆盖止于 −75 dBm 左右（能稳定看视频），
 * −85 以下已经是信号边缘、设计上不应该把客户带到那里做"能用"的承诺。
 * 所以我们把 −85 以下都当作"没覆盖"，直接透明 —— 不再画出那些深红
 * 深紫的"虚假覆盖"圈，让设计师一眼看到真实可用范围。
 */
const RSSI_STOPS: Array<{ rssi: number; rgba: [number, number, number, number] }> = [
  { rssi: -45, rgba: [74, 222, 128, 210] },  // #4ade80 鲜绿 Excellent（近 AP）
  { rssi: -55, rgba: [132, 204, 22, 200] },  // #84cc16 黄绿 Great
  { rssi: -65, rgba: [234, 179, 8, 185] },   // #eab308 黄 Good
  { rssi: -75, rgba: [249, 115, 22, 170] },  // #f97316 橙 Fair（设计边界）
  { rssi: -82, rgba: [220, 38, 38, 120] },   // #dc2626 红 Poor（弱到不应该承诺可用）
  { rssi: -86, rgba: [0, 0, 0, 0] },         // 透明（视作无覆盖）
]

function rssiToRgba(rssi: number): [number, number, number, number] {
  // 饱和两端
  if (rssi >= RSSI_STOPS[0]!.rssi) return RSSI_STOPS[0]!.rgba
  const last = RSSI_STOPS[RSSI_STOPS.length - 1]!
  if (rssi <= last.rssi) return last.rgba
  // 找相邻停点
  for (let i = 0; i < RSSI_STOPS.length - 1; i++) {
    const hi = RSSI_STOPS[i]!
    const lo = RSSI_STOPS[i + 1]!
    if (rssi <= hi.rssi && rssi >= lo.rssi) {
      const t = (rssi - lo.rssi) / (hi.rssi - lo.rssi) // 0..1
      return [
        Math.round(lo.rgba[0] + t * (hi.rgba[0] - lo.rgba[0])),
        Math.round(lo.rgba[1] + t * (hi.rgba[1] - lo.rgba[1])),
        Math.round(lo.rgba[2] + t * (hi.rgba[2] - lo.rgba[2])),
        Math.round(lo.rgba[3] + t * (hi.rgba[3] - lo.rgba[3])),
      ]
    }
  }
  return last.rgba
}

/** WiFi 热力图层 —— 按 AP 物理模型计算 + Canvas 栅格化成 <image>
 *
 * 比 rect-per-cell 方案：
 *   - 单 DOM 元素（<image>），不再是 1600+ 个 rect
 *   - 平滑梯度（线性 RGBA 插值），无马赛克色带
 *   - 10 px/m 默认分辨率（典型户型 ~200×200 = 4 万像素）
 *
 * 画布像素 (0,0) 对应 world (maxX, maxZ) 方向：这样 <image> 放到
 *   SVG (x = -maxX, y = -maxZ)，尺寸 worldW × worldH，
 *   pixel (0,0) 直接对齐 world max 角；从而 SVG 翻转坐标自然吻合
 *
 * useMemo：只在 aps/walls 变化时重算；typical 20m × 15m 户型 + 3 AP + 20 墙
 * 单次耗时约 30-80ms，鼠标操作/滚轮缩放不触发
 */
/** 3×3 box blur 对 RGBA ImageData（就地变换）—— UniFi 视觉柔和感来源 */
function boxBlurRgba(data: Uint8ClampedArray, w: number, h: number, passes = 2) {
  const tmp = new Uint8ClampedArray(data.length)
  for (let pass = 0; pass < passes; pass++) {
    // 水平 pass：把 data 写到 tmp
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const i = (y * w + xx) * 4
          r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; a += data[i + 3]!
          n++
        }
        const o = (y * w + x) * 4
        tmp[o] = r / n; tmp[o + 1] = g / n; tmp[o + 2] = b / n; tmp[o + 3] = a / n
      }
    }
    // 垂直 pass：tmp → data
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          const i = (yy * w + x) * 4
          r += tmp[i]!; g += tmp[i + 1]!; b += tmp[i + 2]!; a += tmp[i + 3]!
          n++
        }
        const o = (y * w + x) * 4
        data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = a / n
      }
    }
  }
}

/** 值稳定 N ms 后再"落地" —— 拖动这类连续变化时跳过中间帧，只在用户停顿后重算。
 *  useDeferredValue 只是降优先级，useMemo 一旦开始跑就阻塞整帧；
 *  debounce 直接让重算根本不发生在 drag 期间，drag 手感才能丝滑。
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

function FloorplanWifiHeatmapLayer({
  aps,
  walls,
  /** 每米多少像素（20 px/m → 20m 户型 400×300 = 12 万像素，编辑器流畅度优先）*/
  pixelsPerMeter = 20,
}: {
  aps: DeviceNode[]
  walls: WallNode[]
  pixelsPerMeter?: number
}) {
  // 【AP 拖动不卡的关键】—— 用 debounce（不是 useDeferredValue）
  //   useDeferredValue：把重算放低优先级，但 useMemo 一旦开始执行就阻塞整帧
  //     → 拖 AP 时每帧都会开始一次 7M+ 次的射线-墙相交计算 → 卡
  //   debounce：drag 期间持续重置 timer，重算 根本不触发
  //     → drag 期间热力图"定格"在最后一次稳定的状态
  //     → 用户停下手（150ms）后才算一次新图，视觉上像"跟手"
  //
  // 150ms 是人眼感知"动起来 vs 停下"的阈值，基本是无感切换。
  const apsDebounced = useDebouncedValue(aps, 150)
  const wallsDebounced = useDebouncedValue(walls, 150)

  // 从 apsDebounced / wallsDebounced 取名后，让编译器帮我们忘掉旧变量
  const apsDeferred = apsDebounced
  const wallsDeferred = wallsDebounced

  const bitmap = useMemo(() => {
    if (apsDeferred.length === 0 || wallsDeferred.length === 0) return null
    if (typeof document === 'undefined') return null // SSR 兼容

    // bbox = 墙 + AP 范围
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const w of wallsDeferred) {
      minX = Math.min(minX, w.start[0], w.end[0])
      maxX = Math.max(maxX, w.start[0], w.end[0])
      minZ = Math.min(minZ, w.start[1], w.end[1])
      maxZ = Math.max(maxZ, w.start[1], w.end[1])
    }
    for (const ap of apsDeferred) {
      minX = Math.min(minX, ap.position[0])
      maxX = Math.max(maxX, ap.position[0])
      minZ = Math.min(minZ, ap.position[2])
      maxZ = Math.max(maxZ, ap.position[2])
    }
    // 外扩 2m —— 真实 AP 在 −85 dBm 处大概离 AP 10–15m，不需要把画布画到离建筑很远。
    // 外扩缩小 = 像素总数减少 ≈60%，直接降编辑器负担。
    const margin = 2
    minX -= margin; maxX += margin; minZ -= margin; maxZ += margin
    const worldW = maxX - minX
    const worldH = maxZ - minZ
    if (worldW <= 0 || worldH <= 0) return null

    const pxW = Math.max(1, Math.ceil(worldW * pixelsPerMeter))
    const pxH = Math.max(1, Math.ceil(worldH * pixelsPerMeter))

    const canvas = document.createElement('canvas')
    canvas.width = pxW
    canvas.height = pxH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const imgData = ctx.createImageData(pxW, pxH)
    const data = imgData.data

    // Pre-extract AP params
    const apData = apsDeferred.map((ap) => ({
      x: ap.position[0],
      z: ap.position[2],
      wifi: getWifiParams(ap),
    }))

    // 画布 pixel (0,0) 对应 world 最大角 (maxX, maxZ)，沿 i+ / j+ 递减到 (minX, minZ)
    // 这样 <image x=-maxX y=-maxZ width=worldW height=worldH> 就和 SVG 坐标系自然对齐
    //
    // 【反射线扇形伪影的关键】把每个 AP 当作 0.2m 半径的小面源。
    // 采样 3 点（中心 + 东西 2 点）= ray cast 次数降 40%。
    // 对墙端点阴影的角度涂抹已经够用（距 10m 处 ≈ 1.1° 分散）。
    const apJitter = 0.2
    const apOffsets: Array<[number, number]> = [
      [0, 0],
      [apJitter, 0],
      [-apJitter, 0],
    ]
    for (let j = 0; j < pxH; j++) {
      const wz = maxZ - (j + 0.5) / pixelsPerMeter
      for (let i = 0; i < pxW; i++) {
        const wx = maxX - (i + 0.5) / pixelsPerMeter
        // 对每个 AP：做 5 次面源采样取平均（线性 dBm 域平均，软化硬阴影）
        // 然后各 AP 之间取 max（WiFi 实际表现是最强信号覆盖）
        let maxR = -Infinity
        for (const ap of apData) {
          let sumR = 0
          for (const [ox, oz] of apOffsets) {
            sumR += computeRssiAtPoint(ap.x + ox, ap.z + oz, ap.wifi, wx, wz, wallsDeferred)
          }
          const avgR = sumR / apOffsets.length
          if (avgR > maxR) maxR = avgR
        }
        const rgba = rssiToRgba(maxR)
        const idx = (j * pxW + i) * 4
        data[idx] = rgba[0]
        data[idx + 1] = rgba[1]
        data[idx + 2] = rgba[2]
        data[idx + 3] = rgba[3]
      }
    }

    // 2 遍 3×3 box blur —— 等效 Gaussian σ≈1.4 像素（在 20 px/m 下 ≈ 7cm 世界单位）
    // AP 面源采样已经消掉了大部分射线条纹，blur 只需要做最后的软化
    boxBlurRgba(data, pxW, pxH, 2)
    ctx.putImageData(imgData, 0, 0)

    // 不在这里做 PNG 编码 —— toDataURL 是同步的，几十万像素编码能吃 30–50ms 一帧。
    // 只把 canvas 对象 + 几何返回，交给下方 useEffect 用 toBlob 异步编码。
    return {
      canvas,
      svgX: -maxX,
      svgY: -maxZ,
      svgW: worldW,
      svgH: worldH,
    }
  }, [apsDeferred, wallsDeferred, pixelsPerMeter])

  // 异步 PNG 编码 —— toBlob 在多数浏览器里走内部线程，不阻塞主线程的 drag/render。
  // 编完通过 blob URL 挂到 <image>。旧 URL 在拿到新 URL 后统一回收。
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const prevUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!bitmap) {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = null
      }
      setImageUrl(null)
      return
    }
    let aborted = false
    bitmap.canvas.toBlob((blob) => {
      if (aborted || !blob) return
      const newUrl = URL.createObjectURL(blob)
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
      prevUrlRef.current = newUrl
      setImageUrl(newUrl)
    }, 'image/png')
    return () => {
      aborted = true
    }
  }, [bitmap])
  // 卸载时清 blob
  useEffect(
    () => () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = null
      }
    },
    [],
  )

  if (!bitmap || !imageUrl) return null

  // 所有柔化都在 canvas 层做了（multi-sample + 2-pass box blur），
  // 这里直接 <image>，依赖浏览器 bilinear 做缩放过滤
  return (
    <image
      x={bitmap.svgX}
      y={bitmap.svgY}
      width={bitmap.svgW}
      height={bitmap.svgH}
      href={imageUrl}
      preserveAspectRatio="none"
      pointerEvents="none"
      style={{ imageRendering: 'auto' }}
    />
  )
}

function FloorplanCameraDirectionSector({
  centerSvg,
  directionDeg,
  innerR,
  outerR,
  color,
}: {
  centerSvg: [number, number]
  directionDeg: number
  innerR: number
  outerR: number
  color: string
}) {
  const [cx, cy] = centerSvg
  // SVG 空间的可视角度 = world direction 的点反射（SVG = -world，差 180°）
  const svgAngleRad = (directionDeg * Math.PI) / 180 + Math.PI
  const span = Math.PI / 2
  const a0 = svgAngleRad - span / 2
  const a1 = svgAngleRad + span / 2

  const x0i = cx + Math.cos(a0) * innerR
  const y0i = cy + Math.sin(a0) * innerR
  const x0o = cx + Math.cos(a0) * outerR
  const y0o = cy + Math.sin(a0) * outerR
  const x1i = cx + Math.cos(a1) * innerR
  const y1i = cy + Math.sin(a1) * innerR
  const x1o = cx + Math.cos(a1) * outerR
  const y1o = cy + Math.sin(a1) * outerR

  const path = [
    `M ${x0i} ${y0i}`,
    `L ${x0o} ${y0o}`,
    `A ${outerR} ${outerR} 0 0 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${innerR} ${innerR} 0 0 0 ${x0i} ${y0i}`,
    'Z',
  ].join(' ')

  return (
    <path
      d={path}
      fill={color}
      fillOpacity={0.55}
      stroke={color}
      strokeWidth={Math.max(0.01, innerR * 0.08)}
      strokeOpacity={0.9}
      pointerEvents="none"
    />
  )
}

/** 锚点小圆 —— 对齐参考来源点的醒目标记（小空心圆） */
function FloorplanGuideAnchorDot({
  anchor,
  color,
  worldUnitsPerPixel,
}: {
  anchor: WallPlanPoint
  color: string
  worldUnitsPerPixel: number
}) {
  const r = Math.max(0.04, worldUnitsPerPixel * 3)
  const strokeW = Math.max(0.012, worldUnitsPerPixel * 0.9)
  return (
    <circle
      cx={-anchor[0]}
      cy={-anchor[1]}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={strokeW}
      opacity={0.85}
    />
  )
}

/** 墙中线 / 房间中心轴 / 对边墙中线 / 设备对齐等"直线型"参考的虚线渲染
 *
 * 可选 label：在线的中点显示一段距离数字（用于"两台设备间距"等语义）
 */
function FloorplanGuideLine({
  from,
  to,
  color,
  worldUnitsPerPixel,
  label,
}: {
  from: WallPlanPoint
  to: WallPlanPoint
  color: string
  worldUnitsPerPixel: number
  label?: string
}) {
  const strokeW = Math.max(0.012, worldUnitsPerPixel * 0.9)
  const dash = Math.max(0.08, worldUnitsPerPixel * 4)
  const x1 = -from[0]
  const y1 = -from[1]
  const x2 = -to[0]
  const y2 = -to[1]
  return (
    <g>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={`${dash} ${dash * 0.6}`}
        opacity={0.75}
      />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE}
          fontWeight={600}
          paintOrder="stroke"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
          fill={color}
          style={{ userSelect: 'none' }}
        >
          {label}
        </text>
      )}
    </g>
  )
}

/** 拐角吸附指示：在锚点画一个 × 十字 —— 醒目、不抢 ghost */
function FloorplanGuideCornerMark({
  anchor,
  color,
  worldUnitsPerPixel,
}: {
  anchor: WallPlanPoint
  color: string
  worldUnitsPerPixel: number
}) {
  const ax = -anchor[0]
  const ay = -anchor[1]
  const armLen = Math.max(0.15, worldUnitsPerPixel * 8)
  const strokeW = Math.max(0.02, worldUnitsPerPixel * 1.5)
  return (
    <g pointerEvents="none">
      <line x1={ax - armLen} y1={ay - armLen} x2={ax + armLen} y2={ay + armLen}
        stroke={color} strokeWidth={strokeW} strokeLinecap="round" opacity={0.9} />
      <line x1={ax - armLen} y1={ay + armLen} x2={ax + armLen} y2={ay - armLen}
        stroke={color} strokeWidth={strokeW} strokeLinecap="round" opacity={0.9} />
    </g>
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
  /**
   * 当前楼层的设备节点 —— 供 2D 符号层使用
   *
   * 直接扫 nodes 里 parentId === levelId 的 device —— 比 level.children 更鲁棒：
   * 3D DeviceTool 走 placeDevice 也设置 parentId=levelId，但不同路径下 children
   * 数组是否同步写入存在个别历史/遗留偏差；按 parentId 扫描能覆盖所有路径。
   */
  const levelDevices = useScene(
    useShallow((state) => {
      if (!levelId) return [] as DeviceNode[]
      const out: DeviceNode[] = []
      for (const n of Object.values(state.nodes)) {
        if (n?.type === 'device' && n.parentId === levelId) out.push(n as DeviceNode)
      }
      return out
    }),
  )

  /**
   * 回路自定义颜色（circuitId → HEX）。读自 LevelNode.circuitMeta。
   * useShallow 保证 meta 没变时引用稳定，FloorplanDeviceLayer 的 memo 不会失效。
   */
  const circuitColors = useScene(
    useShallow((state) => {
      const out: Record<string, string> = {}
      if (!levelId) return out
      const lv = state.nodes[levelId as AnyNodeId] as
        | { type: string; circuitMeta?: Record<string, { color?: string }> }
        | undefined
      if (!lv || lv.type !== 'level' || !lv.circuitMeta) return out
      for (const [cid, m] of Object.entries(lv.circuitMeta)) {
        if (m?.color) out[cid] = m.color
      }
      return out
    }),
  )

  /**
   * 回路按楼层的可视化信息（deviceId → { number, name? }）—— 给 2D 灯具加 #N 小标签用。
   * 编号是 derived value（按楼层下灯出现顺序），不写 schema；这里只生成查询表。
   * 依赖 levelDevices（成员变化要重排编号）+ 上面的 circuitColors（meta 改名也要刷新）。
   */
  const circuitInfoByDevice = useMemo(() => {
    const out: Record<string, { number: number; name?: string; color?: string }> = {}
    if (!levelId) return out
    const list = getLightCircuits(levelId)
    for (const c of list) {
      for (const m of c.members) {
        out[m.id] = { number: c.number, name: c.name, color: c.color }
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId, levelDevices, circuitColors])

  /** AP / 路由/ 交换机 —— 参与 WiFi 热力图计算的网络设备
   *  renderType 匹配 catalog 现有命名（subtype = ceiling / wall / router）+ 旧别名
   *
   *  【性能】直接走 useScene + useShallow，不经 levelDevices 派生。
   *  这样拖动非-AP 设备（灯/摄像头/窗帘…）时，apDevices 内容引用不变，
   *  useShallow 命中缓存 → 热力图根本不会重算。
   *  之前用 useMemo(levelDevices.filter(...))，levelDevices 每次变都生成新数组，
   *  热力图跟着非-AP drag 一起重算，纯无用功。
   */
  const apDevices = useScene(
    useShallow((state) => {
      if (!levelId) return [] as DeviceNode[]
      const level = state.nodes[levelId]
      if (!level || level.type !== 'level') return [] as DeviceNode[]
      const out: DeviceNode[] = []
      for (const childId of level.children) {
        const n = state.nodes[childId]
        if (n?.type !== 'device') continue
        const d = n as DeviceNode
        if (d.subsystem !== 'network') continue
        const rt = d.renderType
        if (
          rt === 'ceiling' ||
          rt === 'wall' ||
          rt === 'router' ||
          rt === 'ap-ceiling' ||
          rt === 'ap-wall'
        ) {
          out.push(d)
        }
      }
      return out
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
  // 设备工具激活时的预览位置
  // - point：ghost 应该显示的位置（已经 apply 过 mountType 吸附 + 侧别偏移 / 天花板参考线吸附）
  // - wallSnap：墙挂设备命中墙时的 wallId + t + side
  // - ceilingGuides：天花板设备命中的**所有**参考线（数组，可能同时 0/1/2 条），Keynote 风多轴吸附
  // - wallDistances：从 ghost 向 +X/-X/+Z/-Z 射线的最近墙距离（CAD 风全时尺寸，纯显示，不参与吸附）
  const [devicePlacementPreview, setDevicePlacementPreview] = useState<{
    point: WallPlanPoint
    wallSnap: { wallId: string; t: number; side: 'front' | 'back' } | null
    ceilingGuides: CeilingGuide[]
    wallDistances: WallDistance[]
  } | null>(null)
  /**
   * 设备拖动态 —— 用户按下已放置设备的 hit circle 开始拖动
   * - id: 被拖设备节点 id
   * - pointerId: capture 的 pointer，用于 release
   * - startPoint: 按下瞬间的 plan 坐标，用于判断是不是真正发生了位移（避免轻微抖动被当成拖动）
   * - dragged: 是否已经真正产生位移（决定是否要在 pointerup 时 commit 位置变更）
   */
  const deviceDragRef = useRef<{
    id: string
    pointerId: number
    startPoint: WallPlanPoint
    dragged: boolean
    /**
     * 灯带专用：按下瞬间的 params.path 快照。drag move 时按 delta 平移
     * 整条折线（每帧基于快照重新计算，避免累计误差）。点光源为 undefined。
     */
    startPath?: Array<[number, number]>
  } | null>(null)
  /**
   * 灯带"单个端点"拖动 —— 区别于 deviceDragRef 的整条平移。
   * 选中灯带后显示蓝色顶点 handle，按下某个 → 该端点跟着鼠标走，path 其它点不动。
   */
  const stripVertexDragRef = useRef<{
    stripId: string
    vertexIdx: number
    pointerId: number
  } | null>(null)
  const stripVertexPendingRef = useRef<{
    clientX: number
    clientY: number
    pointerId: number
  } | null>(null)
  const stripVertexRafRef = useRef<number | null>(null)
  // 【drag 性能关键】pointermove 原生可达 240Hz+，但 SVG 渲染只有 60Hz。
  // 用 rAF 合并同一帧内的所有 pointermove，每帧最多写一次 store —— 避免
  // updateNode 以 240Hz 频率触发所有 useScene 订阅者导致的级联重渲。
  const deviceDragRafRef = useRef<number | null>(null)
  const deviceDragPendingRef = useRef<{ clientX: number; clientY: number; pointerId: number } | null>(null)
  // 设备目录的响应式订阅（handleBackgroundClick 用 getState 拿即时值；预览和 UI 指示器需要重渲染触发）
  const selectedDevice = useEditor((s) => s.selectedDevice)
  const setSelectedDevice = useEditor((s) => s.setSelectedDevice)
  // 灯带画线 draft —— 用 selector 订阅，每次 push 顶点 / hover 移动都重渲染
  const lightStripDraftState = useEditor((s) => s.lightStripDraft)
  const curtainDraftState = useEditor((s) => s.curtainDraft)
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
    return () => {
      if (alignSuccessTimerRef.current) {
        clearTimeout(alignSuccessTimerRef.current)
        alignSuccessTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (structureLayer === 'zones' && floorplanSelectionTool === 'marquee') {
      setFloorplanSelectionTool('click')
    }
  }, [floorplanSelectionTool, structureLayer])

  useEffect(() => {
    setIsMacPlatform(navigator.platform.toUpperCase().includes('MAC'))
  }, [])

  // ── Esc 退出建造模式 —— 回到 select 模式 ──
  // 注意：不清 selectedDevice，因为 DeviceCatalog 有 auto-select effect 会立即补回来（会形成
  // 互相 setState 的无限循环）；改用 mode 门控 ghost / 放置（下面在 UI 层判断 mode === 'build'）
  //
  // 灯带画线模式下，Esc 优先取消 draft（如果有），二次 Esc 才退 build；Enter 落地 draft。
  // 用 commitRef 转发，避免函数声明顺序问题（commitLightStripDraft 在下面声明）。
  const commitLightStripDraftRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (mode !== 'build') return
    const onKey = (e: KeyboardEvent) => {
      const editorState = useEditor.getState()
      const isStripDraft =
        editorState.selectedDevice?.lightType === 'line' && editorState.lightStripDraft
      const isCurtainDraft =
        editorState.selectedDevice?.subsystem === 'curtain' && editorState.curtainDraft
      if (e.key === 'Escape') {
        if (isStripDraft) {
          editorState.setLightStripDraft(null)
          return
        }
        if (isCurtainDraft) {
          editorState.setCurtainDraft(null)
          return
        }
        setMode('select')
      } else if (e.key === 'Enter' && isStripDraft) {
        commitLightStripDraftRef.current?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, setMode])

  // ── 老灯一次性回填 circuitId ──────────────────────────────────────────────
  // 楼层切换时跑一遍，把 schema 加 circuitId 之前放的灯都补上真实 id。
  // 之后所有右侧面板 / 开关绑定 / 场景效果都按"显式回路 id"工作，不走 fallback。
  // 已经有 circuitId 的灯不会被改 —— 函数内部判断。
  useEffect(() => {
    if (!levelId) return
    const n = assignMissingCircuitIds(levelId)
    if (n > 0) {
      // 不需要 sfx，纯静默迁移；console 留个痕迹方便排查
      console.log(`[circuit] 回填 ${n} 盏老灯的 circuitId`)
    }
  }, [levelId])

  // ── Esc 也能退出摄像头 follow 模式 ──────────────────────────────────────────
  // 直接操作 ref + sfx，避免依赖 exitFollowMode（它在下面才声明）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && rotationFollowRef.current !== null) {
        rotationFollowRef.current = null
        sfxEmitter.emit('sfx:item-rotate')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
      // 灯带画线草稿是"当前层上未落地的几个点"，切层之后没有意义，
      // 而且旧点会被新层继续拼接（bug: 第二层点一下就直接连到第一层的折线上）。
      // 楼层切换时立刻清空，强制从头画。
      if (useEditor.getState().lightStripDraft) {
        useEditor.getState().setLightStripDraft(null)
      }
      // 同样清掉窗帘草稿
      if (useEditor.getState().curtainDraft) {
        useEditor.getState().setCurtainDraft(null)
      }
      return
    }

    if (!hasUserAdjustedViewportRef.current) {
      setViewport(fittedViewport)
    }
  }, [fittedViewport, levelId])

  // tool 变化时，若离开 'item'（设备放置工具），清掉残留的灯带 / 窗帘草稿。
  useEffect(() => {
    if (tool !== 'item') {
      if (useEditor.getState().lightStripDraft) {
        useEditor.getState().setLightStripDraft(null)
      }
      if (useEditor.getState().curtainDraft) {
        useEditor.getState().setCurtainDraft(null)
      }
    }
  }, [tool])

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
            majorGrid: FLOORPLAN_COLOR_TRACK,
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
            surface: FLOORPLAN_COLOR_SURFACE,
            minorGrid: '#c5cfdd',
            majorGrid: '#a6b4c6',
            minorGridOpacity: 0.55,
            majorGridOpacity: 0.72,
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
            openingFill: FLOORPLAN_COLOR_SURFACE,
            openingStroke: '#171717',
            endpointHandleFill: FLOORPLAN_COLOR_SURFACE,
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

  // ── 2D 设备拖动 —— 让用户在 select 模式下抓设备圆点拖到新位置 ──────────────────
  // 放在 getPlanPointFromClientPoint 之后，因为 dragMove 依赖它
  const handleDeviceDragStart = useCallback(
    (deviceId: string, event: ReactPointerEvent<SVGCircleElement>) => {
      if (useEditor.getState().mode === 'build') return
      const pt = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!pt) return
      // 灯带拖动：需要缓存原 path，drag move 时基于快照 + delta 平移整条折线
      const node = useScene.getState().nodes[deviceId as AnyNodeId] as DeviceNode | undefined
      const rawPath = (node?.params as { path?: Array<[number, number]> } | undefined)?.path
      const startPath = Array.isArray(rawPath) && rawPath.length >= 2
        ? rawPath.map(([x, z]) => [x, z] as [number, number])
        : undefined
      deviceDragRef.current = {
        id: deviceId,
        pointerId: event.pointerId,
        startPoint: pt,
        dragged: false,
        startPath,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      setSelectedReferenceId(null)
      setSelection({ selectedIds: [deviceId] })
    },
    [getPlanPointFromClientPoint, setSelection, setSelectedReferenceId],
  )

  const handleDeviceDragMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const drag = deviceDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      // 不立即处理 —— 只缓存最新坐标，等下一个 animation frame 再做吸附 + updateNode。
      // pointermove 能跑 240Hz+，我们没必要跟着 240Hz 更新 store；合并到 60Hz 足够顺滑，
      // 还能把中间那些被"超过"的位置丢掉（天然做 drag coalescing）。
      deviceDragPendingRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      }
      if (deviceDragRafRef.current != null) return

      deviceDragRafRef.current = requestAnimationFrame(() => {
        deviceDragRafRef.current = null
        const pending = deviceDragPendingRef.current
        deviceDragPendingRef.current = null
        if (!pending) return
        const d = deviceDragRef.current
        if (!d || d.pointerId !== pending.pointerId) return

        const pt = getPlanPointFromClientPoint(pending.clientX, pending.clientY)
        if (!pt) return

        const dx = pt[0] - d.startPoint[0]
        const dz = pt[1] - d.startPoint[1]
        const moveThreshold = floorplanWorldUnitsPerPixel * 3
        if (!d.dragged && Math.hypot(dx, dz) < moveThreshold) return
        d.dragged = true

        const deviceNode = useScene.getState().nodes[d.id as AnyNodeId] as DeviceNode | undefined
        if (!deviceNode) return
        const mt = deviceNode.mountType
        const isWallMount = mt === 'wall' || mt === 'wall_switch'

        // 灯带：整条折线按 delta 平移
        // 不走吸附——灯带是多点几何，单点吸附会扭曲整条；后续可以加"整体对齐网格"。
        if (d.startPath) {
          const rawDx = pt[0] - d.startPoint[0]
          const rawDz = pt[1] - d.startPoint[1]
          const newPath = d.startPath.map(
            ([x, z]) => [x + rawDx, z + rawDz] as [number, number],
          )
          const cx = newPath.reduce((s, p) => s + p[0], 0) / newPath.length
          const cz = newPath.reduce((s, p) => s + p[1], 0) / newPath.length
          const patchStrip: Partial<DeviceNode> = {
            position: [cx, deviceNode.position[1], cz],
            params: {
              ...(deviceNode.params ?? {}),
              path: newPath,
            } as any,
          }
          // 清预览 ghost —— 灯带不需要 wall/ceiling 吸附的可视化
          if (devicePlacementPreview !== null) setDevicePlacementPreview(null)
          updateNode(d.id as AnyNodeId, patchStrip as any)
          return
        }

        let newX = pt[0]
        let newZ = pt[1]
        const patch: Partial<DeviceNode> = {}

        if (isWallMount) {
          const hit = findClosestWallPoint(pt, walls, 1.0)
          if (hit) {
            const placement = computeWallPlacement(hit.wall, pt)
            if (placement) {
              newX = placement.position[0]
              newZ = placement.position[1]
              patch.params = {
                ...(deviceNode.params ?? {}),
                wallId: hit.wall.id,
                wallT: placement.t,
                wallSide: placement.side,
              } as any
            }
          }
          setDevicePlacementPreview({
            point: [newX, newZ],
            wallSnap: null,
            ceilingGuides: [],
            wallDistances: computeWallDistancesFourWay([newX, newZ], walls),
          })
        } else {
          const snap = computeCeilingSnap(pt, walls, zones, levelDevices, openings, d.id)
          newX = snap.snapPoint[0]
          newZ = snap.snapPoint[1]
          setDevicePlacementPreview({
            point: snap.snapPoint,
            wallSnap: null,
            ceilingGuides: snap.guides,
            wallDistances: computeWallDistancesFourWay(snap.snapPoint, walls),
          })
        }

        patch.position = [newX, deviceNode.position[1], newZ]
        updateNode(d.id as AnyNodeId, patch as any)
      })
    },
    [
      getPlanPointFromClientPoint,
      updateNode,
      walls,
      zones,
      levelDevices,
      openings,
      floorplanWorldUnitsPerPixel,
    ],
  )

  const handleDeviceDragEnd = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const drag = deviceDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
      if (drag.dragged) {
        sfxEmitter.emit('sfx:item-place')
      }
      // 取消还没执行的 rAF —— 否则可能在 drag 结束后还写一次 store
      if (deviceDragRafRef.current != null) {
        cancelAnimationFrame(deviceDragRafRef.current)
        deviceDragRafRef.current = null
      }
      deviceDragPendingRef.current = null
      deviceDragRef.current = null
      // 清掉拖动时显示的参考线
      setDevicePlacementPreview(null)
    },
    [],
  )

  /**
   * 灯带"单端点"拖动 —— 选中灯带后蓝色顶点 handle 按下时调用。
   * 用 SVG 级 pointer capture，path 单点更新，rAF 合并 240Hz pointermove 到 60Hz。
   */
  const handleStripVertexDragStart = useCallback(
    (stripId: string, vertexIdx: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) return
      if (useEditor.getState().mode === 'build') return // build 模式禁拖（避免画线和编辑串台）
      event.preventDefault()
      event.stopPropagation()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* ok */
      }
      stripVertexDragRef.current = {
        stripId,
        vertexIdx,
        pointerId: event.pointerId,
      }
    },
    [],
  )
  const handleStripVertexDragMove = useCallback(
    (event: ReactPointerEvent<SVGCircleElement>) => {
      const drag = stripVertexDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      stripVertexPendingRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      }
      if (stripVertexRafRef.current != null) return
      stripVertexRafRef.current = requestAnimationFrame(() => {
        stripVertexRafRef.current = null
        const pending = stripVertexPendingRef.current
        stripVertexPendingRef.current = null
        if (!pending) return
        const d = stripVertexDragRef.current
        if (!d || d.pointerId !== pending.pointerId) return
        const pt = getPlanPointFromClientPoint(pending.clientX, pending.clientY)
        if (!pt) return
        const node = useScene.getState().nodes[d.stripId as AnyNodeId] as
          | DeviceNode
          | undefined
        if (!node) return
        const oldPath = (
          (node.params as { path?: Array<[number, number]> } | undefined)?.path ?? []
        ).slice()
        if (d.vertexIdx < 0 || d.vertexIdx >= oldPath.length) return
        oldPath[d.vertexIdx] = [pt[0], pt[1]]
        const cx = oldPath.reduce((s, q) => s + q[0], 0) / oldPath.length
        const cz = oldPath.reduce((s, q) => s + q[1], 0) / oldPath.length
        updateNode(d.stripId as AnyNodeId, {
          position: [cx, node.position[1], cz],
          params: { ...(node.params ?? {}), path: oldPath } as any,
        } as any)
      })
    },
    [getPlanPointFromClientPoint, updateNode],
  )
  const handleStripVertexDragEnd = useCallback(
    (event: ReactPointerEvent<SVGCircleElement>) => {
      const drag = stripVertexDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* ok */
      }
      if (stripVertexRafRef.current != null) {
        cancelAnimationFrame(stripVertexRafRef.current)
        stripVertexRafRef.current = null
      }
      stripVertexPendingRef.current = null
      stripVertexDragRef.current = null
      sfxEmitter.emit('sfx:item-place')
    },
    [],
  )

  /**
   * 灯带 path 加点 —— 选中后两顶点中点的"+"按钮被点击时调用，
   * 在指定 segmentIdx 之后插一个新顶点（用 segment 中点作初始位置）。
   * 加点后用户可立即拖该新顶点继续整形。
   */
  const handleStripPathInsert = useCallback(
    (stripId: string, segmentIdx: number) => {
      const node = useScene.getState().nodes[stripId as AnyNodeId] as
        | DeviceNode
        | undefined
      if (!node) return
      const oldPath = (
        (node.params as { path?: Array<[number, number]> } | undefined)?.path ?? []
      ).slice()
      if (segmentIdx < 0 || segmentIdx >= oldPath.length - 1) return
      const a = oldPath[segmentIdx]!
      const b = oldPath[segmentIdx + 1]!
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const newPath = [
        ...oldPath.slice(0, segmentIdx + 1),
        mid,
        ...oldPath.slice(segmentIdx + 1),
      ]
      const cx = newPath.reduce((s, q) => s + q[0], 0) / newPath.length
      const cz = newPath.reduce((s, q) => s + q[1], 0) / newPath.length
      updateNode(stripId as AnyNodeId, {
        position: [cx, node.position[1], cz],
        params: { ...(node.params ?? {}), path: newPath } as any,
      } as any)
      sfxEmitter.emit('sfx:item-place')
    },
    [updateNode],
  )

  /** 灯带 path 删点 —— 右键顶点时调用。少于 2 点的灯带没有意义，所以保护 length > 2。 */
  const handleStripPathDelete = useCallback(
    (stripId: string, vertexIdx: number) => {
      const node = useScene.getState().nodes[stripId as AnyNodeId] as
        | DeviceNode
        | undefined
      if (!node) return
      const oldPath = (
        (node.params as { path?: Array<[number, number]> } | undefined)?.path ?? []
      )
      if (oldPath.length <= 2) return // 至少保留 2 点
      const newPath = oldPath.filter((_, i) => i !== vertexIdx)
      const cx = newPath.reduce((s, q) => s + q[0], 0) / newPath.length
      const cz = newPath.reduce((s, q) => s + q[1], 0) / newPath.length
      updateNode(stripId as AnyNodeId, {
        position: [cx, node.position[1], cz],
        params: { ...(node.params ?? {}), path: newPath } as any,
      } as any)
    },
    [updateNode],
  )

  // ── 摄像头"跟鼠标调方向"模式 ─────────────────────────────────────────────
  // 用户选中摄像头后，鼠标移动自动更新 params.direction；任意位置单击确认退出
  const rotationFollowRef = useRef<string | null>(null)

  const handleCameraFollowMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const deviceId = rotationFollowRef.current
      if (!deviceId) return
      const deviceNode = useScene.getState().nodes[deviceId as AnyNodeId] as DeviceNode | undefined
      if (!deviceNode) return
      const pt = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!pt) return
      const dx = deviceNode.position[0]
      const dz = deviceNode.position[2]
      const worldAngleRad = Math.atan2(pt[1] - dz, pt[0] - dx)
      const directionDeg = (worldAngleRad * 180) / Math.PI
      updateNode(deviceId as AnyNodeId, {
        params: { ...(deviceNode.params ?? {}), direction: directionDeg },
      } as any)
    },
    [getPlanPointFromClientPoint, updateNode],
  )

  const exitFollowMode = useCallback(() => {
    if (rotationFollowRef.current !== null) {
      rotationFollowRef.current = null
      sfxEmitter.emit('sfx:item-rotate')
    }
  }, [])

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

      // 摄像头 follow 模式：背景任意位置单击 = 确认方向，退出 follow；
      // 且不往下走（不清选中、不放新设备），把这次点击"消费"掉
      if (rotationFollowRef.current !== null) {
        exitFollowMode()
        return
      }

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

      // ── 灯带画线 —— 选中 lightType=line 设备时走这里 ──
      // 单击 = push 一个 path 顶点（带吸附 + 去重）；落地由 dblclick / Enter 触发
      //
      // 【必须】同时判 tool === 'item'。设备目录选中后 tool='item'；
      // 如果用户之后切到 wall/slab/zone/door/window 等结构工具，
      // selectedDevice 可能还没被清掉，这时 click 应该走结构绘制而不是走灯带。
      {
        const editorState = useEditor.getState()
        const sd = editorState.selectedDevice
        const isBuildMode = editorState.mode === 'build'
        const isItemTool = editorState.tool === 'item'
        if (isBuildMode && isItemTool && sd && sd.lightType === 'line') {
          const draft = editorState.lightStripDraft
          const lastPt = draft && draft.points.length > 0
            ? draft.points[draft.points.length - 1]!
            : null
          // 多重吸附（按优先级）：墙端点 → 已有设备点 → 90° 角度锁定
          const snapped = snapStripPoint(planPoint, lastPt, walls, levelDevices, shiftPressed)

          // 去重：如果新点跟上一点在 2cm 内（含双击在同位置时的"第二次 click"），跳过 push。
          // 这样 dblclick 不会重复添加点，commit 也不需要再 dedup。
          if (lastPt) {
            const dx = snapped[0] - lastPt[0]
            const dz = snapped[1] - lastPt[1]
            if (dx * dx + dz * dz < 0.0004 /* 0.02m² */) {
              return
            }
          }

          const newPoints: Array<[number, number]> = draft
            ? [...draft.points, snapped]
            : [snapped]
          editorState.setLightStripDraft({
            points: newPoints,
            hoverPoint: snapped,
          })
          sfxEmitter.emit('sfx:item-pick')
          return
        }
      }

      // ── 窗帘放置 —— 按子类型分两种交互 ──
      // 对开帘：墙上 2 点画宽度（帘杆可宽于窗）
      // 卷帘 / 百叶 / 罗马帘：1 点击中窗户 → 装在窗框内 → 自动适配窗户尺寸
      {
        const editorState = useEditor.getState()
        const sd = editorState.selectedDevice
        const isBuildMode = editorState.mode === 'build'
        const isItemTool = editorState.tool === 'item'
        const currentLevelId = useViewer.getState().selection.levelId
        if (isBuildMode && isItemTool && sd && sd.subsystem === 'curtain' && currentLevelId) {
          const isSideOpen = sd.subtype === 'curtain-side-open'

          if (isSideOpen) {
            // ── 对开帘：墙上 2 点画线 ──
            const hit = findClosestWallPoint(planPoint, walls, 1.0)
            if (!hit) return
            const placement = computeWallPlacement(hit.wall, planPoint)
            if (!placement) return

            const draft = editorState.curtainDraft
            if (!draft || draft.wallId !== hit.wall.id) {
              editorState.setCurtainDraft({
                wallId: hit.wall.id,
                t1: placement.t,
                point1: placement.position,
                hoverT: null,
              })
              sfxEmitter.emit('sfx:item-pick')
              return
            }

            const t1 = draft.t1
            const t2 = placement.t
            if (Math.abs(t2 - t1) < 0.01) return

            const ws = hit.wall.start
            const we = hit.wall.end
            const wallDx = we[0] - ws[0]
            const wallDz = we[1] - ws[1]
            const wallLen = Math.hypot(wallDx, wallDz)
            const midT = (t1 + t2) / 2
            const midX = ws[0] + wallDx * midT
            const midZ = ws[1] + wallDz * midT
            const width = Math.abs(t2 - t1) * wallLen
            const wallAngleDeg = Math.atan2(wallDz, wallDx) * (180 / Math.PI)
            const y = sd.defaultH ?? 2.5

            placeDevice(
              currentLevelId,
              sd.catalogId,
              [midX, y, midZ],
              {
                wallId: hit.wall.id,
                wallT: midT,
                wallSide: placement.side,
                curtainWidth: width,
                direction: wallAngleDeg,
              } as Partial<import('@pascal-app/core').DeviceParams>,
            )
            editorState.setCurtainDraft(null)
            sfxEmitter.emit('sfx:item-place')
            return
          }

          // ── 卷帘 / 百叶 / 罗马帘：1 点击中窗户 ──
          // 在 1m 半径内找最近的 window node；找不到 → 静默忽略（强制点窗户）
          const allNodes = useScene.getState().nodes
          const wallSet = new Set<string>()
          for (const n of Object.values(allNodes)) {
            const nn = n as { type?: string; id?: string; parentId?: string | null }
            if (nn.type === 'wall' && nn.parentId === currentLevelId && nn.id) {
              wallSet.add(nn.id)
            }
          }
          let bestWindow: { id: string; cx: number; cz: number; wallId: string; wallStart: [number, number]; wallEnd: [number, number]; t: number; width: number; height: number; cy: number } | null = null
          let bestDist2 = 1.0 * 1.0
          for (const n of Object.values(allNodes)) {
            const nn = n as {
              type?: string; id?: string; wallId?: string;
              position?: [number, number, number];
              width?: number; height?: number;
            }
            if (nn.type !== 'window' || !nn.id || !nn.wallId) continue
            if (!wallSet.has(nn.wallId)) continue
            const wall = allNodes[nn.wallId as keyof typeof allNodes] as
              | { start?: [number, number]; end?: [number, number] }
              | undefined
            if (!wall?.start || !wall?.end) continue
            const wlen = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
            if (wlen < 0.001) continue
            const u = (nn.position?.[0] ?? 0) / wlen
            const cx = wall.start[0] + (wall.end[0] - wall.start[0]) * u
            const cz = wall.start[1] + (wall.end[1] - wall.start[1]) * u
            const dx = planPoint[0] - cx
            const dz = planPoint[1] - cz
            const d2 = dx * dx + dz * dz
            if (d2 < bestDist2) {
              bestDist2 = d2
              bestWindow = {
                id: nn.id, cx, cz, wallId: nn.wallId,
                wallStart: wall.start, wallEnd: wall.end, t: u,
                width: nn.width ?? 1.5,
                height: nn.height ?? 1.4,
                cy: nn.position?.[1] ?? 1.2,
              }
            }
          }
          if (!bestWindow) return // 没点中窗户，静默

          const wDx = bestWindow.wallEnd[0] - bestWindow.wallStart[0]
          const wDz = bestWindow.wallEnd[1] - bestWindow.wallStart[1]
          const wallAngleDeg = Math.atan2(wDz, wDx) * (180 / Math.PI)
          const y = sd.defaultH ?? bestWindow.cy

          placeDevice(
            currentLevelId,
            sd.catalogId,
            [bestWindow.cx, y, bestWindow.cz],
            {
              openingId: bestWindow.id,
              wallId: bestWindow.wallId,
              wallT: bestWindow.t,
              curtainWidth: bestWindow.width,
              direction: wallAngleDeg,
            } as Partial<import('@pascal-app/core').DeviceParams>,
          )
          sfxEmitter.emit('sfx:item-place')
          return
        }
      }

      // ── 2D 设备放置 —— 只在 build 模式下允许 ──
      //
      // 【重要】用"点击瞬间的 click 坐标重新算 snap"，不复用上一次 pointermove
      // 缓存的 devicePlacementPreview。原因：高刷鼠标/触控板下，pointermove 和
      // click 之间可能有几像素的位置差（鼠标在按下瞬间略微移动），preview 滞后
      // 一帧 → ghost 位置和实际放置位置就会"明显不一致"。
      //
      // 这里现算一次：snap 输入是 click 的 planPoint，输出就是要落地的点；
      // 同一帧渲染前最后一次 setDevicePlacementPreview 已经是 click 坐标对应的
      // snap 结果（pointermove 紧贴 click 触发），所以视觉和数据完全对齐。
      {
        const editorState = useEditor.getState()
        const selectedDevice = editorState.selectedDevice
        const isBuildMode = editorState.mode === 'build'
        const isItemTool = editorState.tool === 'item'
        const currentLevelId = useViewer.getState().selection.levelId
        // tool==='item' 才走设备放置路径。否则（wall/slab/zone/door/window 工具）
        // 即使 selectedDevice 残留也不应该拦截 click。
        if (isBuildMode && isItemTool && selectedDevice && currentLevelId) {
          const y = selectedDevice.defaultH ?? 0
          const mt = selectedDevice.mountType
          const isWallMount = mt === 'wall' || mt === 'wall_switch'
          const isCeilingMount =
            mt === 'ceiling' || mt === 'ceiling_suspended' || mt === 'hidden'

          // 用 click 坐标实时算 snap，不读 preview state（避免一帧延迟）
          let snappedPt: WallPlanPoint = planPoint
          let wallSnap: { wallId: string; t: number; side: 'front' | 'back' } | null = null
          if (isWallMount) {
            const hit = findClosestWallPoint(planPoint, walls, 1.0)
            if (hit) {
              const placement = computeWallPlacement(hit.wall, planPoint)
              if (placement) {
                snappedPt = placement.position
                wallSnap = {
                  wallId: hit.wall.id,
                  t: placement.t,
                  side: placement.side,
                }
              }
            }
          } else if (isCeilingMount) {
            const snap = computeCeilingSnap(planPoint, walls, zones, levelDevices, openings)
            snappedPt = snap.snapPoint
          }

          const params: Record<string, unknown> = {}
          if (wallSnap) {
            params.wallId = wallSnap.wallId
            params.wallT = wallSnap.t
            params.wallSide = wallSnap.side
          }
          // 回路归组：灯具放置时分配 circuitId —— 同一次"连续放置"共享一个回路
          // 非灯类设备（摄像头/面板/HVAC 等）跳过，它们没有回路概念。
          if (selectedDevice.subsystem === 'lighting') {
            let circuitId = editorState.currentCircuitId
            if (!circuitId) {
              circuitId = `ckt_${Math.random().toString(36).slice(2, 8)}`
              editorState.setCurrentCircuitId(circuitId)
            }
            params.circuitId = circuitId
          }
          placeDevice(
            currentLevelId,
            selectedDevice.catalogId,
            [snappedPt[0], y, snappedPt[1]],
            params as Partial<import('@pascal-app/core').DeviceParams>,
          )
          sfxEmitter.emit('sfx:item-place')
          return
        }
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
      // 灯带画线吸附用：墙、设备列表
      levelDevices,
      zones,
      openings,
    ],
  )
  const handleBackgroundDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      // 灯带画线 —— 双击落地（仅 tool==='item' 时生效，和 click 路径保持一致）
      const editorState = useEditor.getState()
      const sd = editorState.selectedDevice
      if (
        editorState.tool === 'item' &&
        sd?.lightType === 'line' &&
        editorState.lightStripDraft
      ) {
        commitLightStripDraft()
        return
      }

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

  // 灯带 commit：把 draft.points 写成一个 DeviceNode（params.path），分回路 id，清 draft
  // 不再做 dedup —— click handler 已经在 push 时拦了重复点，commit 阶段拿到的就是干净的 path
  const commitLightStripDraft = useCallback(() => {
    const editorState = useEditor.getState()
    const sd = editorState.selectedDevice
    const draft = editorState.lightStripDraft
    const currentLevelId = useViewer.getState().selection.levelId
    if (!sd || !draft || !currentLevelId) return
    const points = draft.points
    if (points.length < 2) {
      // 没意义的草稿（只点了 1 下就 dblclick），直接清掉
      editorState.setLightStripDraft(null)
      return
    }
    // 取中点做 position，便于回路连线和聚焦相机
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length
    const cz = points.reduce((s, p) => s + p[1], 0) / points.length
    const y = sd.defaultH ?? 2.6

    let circuitId = editorState.currentCircuitId
    if (!circuitId) {
      circuitId = `ckt_${Math.random().toString(36).slice(2, 8)}`
      editorState.setCurrentCircuitId(circuitId)
    }
    placeDevice(
      currentLevelId,
      sd.catalogId,
      [cx, y, cz],
      { path: points, circuitId } as Partial<import('@pascal-app/core').DeviceParams>,
    )
    editorState.setLightStripDraft(null)
    sfxEmitter.emit('sfx:item-place')
  }, [])
  // 把 commit 函数注册到上面的 keyboard handler 用的 ref
  commitLightStripDraftRef.current = commitLightStripDraft

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

      // ── 2D 设备放置（墙挂设备）—— 精确识别点击位置 + 墙侧别 ─────────────
      // 对于 wall / wall_switch 等墙挂类型，优先走这里；识别用户点在墙哪一侧，
      // 再把设备落位到对应侧（绑 wallId/wallT/wallSide）
      //
      // 【必须】判 tool === 'item'。否则用户之前选过壁挂设备（selectedDevice 残留），
      // 后来切到 wall 工具想画/选墙，点到现有墙时会被这里吃掉、直接落一个新设备而不是选墙。
      {
        const editorState = useEditor.getState()
        const selectedDevice = editorState.selectedDevice
        const isBuildMode = editorState.mode === 'build'
        const isItemTool = editorState.tool === 'item'
        const currentLevelId = useViewer.getState().selection.levelId
        const mountType = selectedDevice?.mountType ?? ''
        const isWallMount = mountType === 'wall' || mountType === 'wall_switch'
        if (isBuildMode && isItemTool && selectedDevice && currentLevelId && isWallMount) {
          // 从原始 event 取点击 plan 坐标（不再用 wall center）
          const clickPt = getPlanPointFromClientPoint(event.clientX, event.clientY)
          if (clickPt) {
            const placement = computeWallPlacement(targetWall, clickPt)
            if (placement) {
              const y = selectedDevice.defaultH ?? 1.3
              const wallParams: Record<string, unknown> = {
                wallId: targetWall.id,
                wallT: placement.t,
                wallSide: placement.side,
              }
              // 同 ceiling 路径的回路归组逻辑（壁灯也是 lighting）
              if (selectedDevice.subsystem === 'lighting') {
                let circuitId = editorState.currentCircuitId
                if (!circuitId) {
                  circuitId = `ckt_${Math.random().toString(36).slice(2, 8)}`
                  editorState.setCurrentCircuitId(circuitId)
                }
                wallParams.circuitId = circuitId
              }
              placeDevice(
                currentLevelId,
                selectedDevice.catalogId,
                [placement.position[0], y, placement.position[1]],
                wallParams as Partial<import('@pascal-app/core').DeviceParams>,
              )
              sfxEmitter.emit('sfx:item-place')
              event.stopPropagation()
              return
            }
          }
        }
      }

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
      // 设备拖动优先级最高
      if (deviceDragRef.current) {
        handleDeviceDragMove(event)
        return
      }
      // 摄像头方向 follow 模式：选中摄像头后鼠标自动跟方向
      if (rotationFollowRef.current) {
        handleCameraFollowMove(event)
        // 不 return：让下面的参考线 / 指示器也能跑（如果需要）；但 follow 优先于 ghost preview
      }

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

      // 灯带画线 hover —— 更新 draft 的尾段终点，让 2D 渲染画"draft 折线 + 当前未确认段"
      // 也走吸附：鼠标在墙端点附近会"吸"过去，沿水平/垂直会"锁"住 —— 让用户预知点击会落到哪
      //
      // 【必须】判 tool === 'item'。否则切到 wall 工具后 hover 还会不停地写 draft.hoverPoint
      // ——即使没有 click 路径，视觉上也会闪一下灯带 ghost 线。
      if (
        mode === 'build' &&
        tool === 'item' &&
        selectedDevice?.lightType === 'line' &&
        !panStateRef.current
      ) {
        const pp = getPlanPointFromClientPoint(event.clientX, event.clientY)
        const draft = useEditor.getState().lightStripDraft
        if (pp) {
          const lastPt = draft && draft.points.length > 0
            ? draft.points[draft.points.length - 1]!
            : null
          const snapped = snapStripPoint(pp, lastPt, walls, levelDevices, event.shiftKey)
          useEditor.getState().setLightStripDraft({
            points: draft?.points ?? [],
            hoverPoint: snapped,
          })
        }
        // 不画 ghost / snap，灯带不需要这些
        if (devicePlacementPreview !== null) setDevicePlacementPreview(null)
        handlePointerMove(event)
        return
      }

      // 窗帘 hover —— 所有 4 类窗帘都不走标准 wall ghost。
      // - 对开帘 (curtain-side-open)：维护 curtainDraft.hoverT 给 2D 画线 ghost
      // - 卷帘/百叶/罗马 (-roller / -venetian / -roman)：1 点击中窗户，先不画 hover 预览
      //   （未来可加"附近窗户高亮"，当前只确保不显示标准 ghost 误导用户）
      if (
        mode === 'build' &&
        tool === 'item' &&
        selectedDevice?.subsystem === 'curtain' &&
        !panStateRef.current
      ) {
        if (selectedDevice.subtype === 'curtain-side-open') {
          const draft = useEditor.getState().curtainDraft
          if (draft) {
            const pp = getPlanPointFromClientPoint(event.clientX, event.clientY)
            if (pp) {
              const hit = findClosestWallPoint(pp, walls, 0.6)
              if (hit && hit.wall.id === draft.wallId) {
                const placement = computeWallPlacement(hit.wall, pp)
                if (placement) {
                  useEditor.getState().setCurtainDraft({
                    ...draft,
                    hoverT: placement.t,
                  })
                }
              } else if (draft.hoverT !== null) {
                useEditor.getState().setCurtainDraft({ ...draft, hoverT: null })
              }
            }
          }
        }
        // 关键：所有窗帘类型都清掉标准设备 ghost，避免"鼠标跟着出现一个错误的小圆点"
        if (devicePlacementPreview !== null) setDevicePlacementPreview(null)
        handlePointerMove(event)
        return
      }

      // 设备工具激活时（且处于 build 模式），按 mountType 计算预览位置：
      //   - wall / wall_switch → 吸附到最近的墙边（1m 吸附半径）+ 识别侧别（front/back）
      //   - ceiling / floor / 其他 → 自由放置（raw plan point，不做网格吸附）
      // 对齐 BDD §P1-1：每种 mountType 有对应放置策略
      //
      // 【必须】判 tool === 'item'。否则切到 wall/slab/zone/door/window 工具时，
      // hover 还会画设备 ghost —— 点击却会走结构绘制路径，视觉和行为对不上。
      if (mode === 'build' && tool === 'item' && selectedDevice && !panStateRef.current) {
        const pp = getPlanPointFromClientPoint(event.clientX, event.clientY)
        if (pp) {
          const mt = selectedDevice.mountType
          const isWallMount = mt === 'wall' || mt === 'wall_switch'
          const isCeilingMount =
            mt === 'ceiling' || mt === 'ceiling_suspended' || mt === 'hidden'

          if (isWallMount) {
            const hit = findClosestWallPoint(pp, walls, 1.0)
            let previewPoint = pp
            let wallSnap: { wallId: string; t: number; side: 'front' | 'back' } | null = null
            if (hit) {
              const placement = computeWallPlacement(hit.wall, pp)
              if (placement) {
                previewPoint = placement.position
                wallSnap = { wallId: hit.wall.id, t: placement.t, side: placement.side }
              }
            }
            setDevicePlacementPreview({
              point: previewPoint,
              wallSnap,
              ceilingGuides: [],
              wallDistances: computeWallDistancesFourWay(previewPoint, walls),
            })
          } else if (isCeilingMount) {
            // 天花板 —— 多轴同时吸附（Keynote 风），最多 2 条引导线同时显示
            const result = computeCeilingSnap(pp, walls, zones, levelDevices, openings)
            setDevicePlacementPreview({
              point: result.snapPoint,
              wallSnap: null,
              ceilingGuides: result.guides,
              wallDistances: computeWallDistancesFourWay(result.snapPoint, walls),
            })
          } else {
            setDevicePlacementPreview({
              point: pp,
              wallSnap: null,
              ceilingGuides: [],
              wallDistances: computeWallDistancesFourWay(pp, walls),
            })
          }
        } else {
          setDevicePlacementPreview(null)
        }
      } else if (devicePlacementPreview !== null) {
        setDevicePlacementPreview(null)
      }

      handlePointerMove(event)
    },
    [
      activeFloorplanCursorIndicator,
      handlePointerMove,
      siteVertexDragState,
      slabVertexDragState,
      zoneVertexDragState,
      selectedDevice,
      mode,
      tool,
      getPlanPointFromClientPoint,
      devicePlacementPreview,
      walls,
      zones,
      levelDevices,
      openings,
      handleDeviceDragMove,
      handleCameraFollowMove,
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
        {/* 灯带画线提示条 —— build + item + lightType='line' 时顶部显示操作说明。
            比纯光标更清楚地告诉用户"现在处于画灯带模式 + 怎么提交/取消"。*/}
        {mode === 'build' && tool === 'item' && selectedDevice?.lightType === 'line' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-border/40 bg-background/95 px-3 py-1.5 text-xs text-foreground shadow-lg backdrop-blur-xl"
          >
            <span className="text-muted-foreground">画灯带 · </span>
            <span>单击</span>
            <span className="text-muted-foreground"> 加点 · </span>
            <span>Enter</span>
            <span className="text-muted-foreground"> 提交 · </span>
            <span>Esc</span>
            <span className="text-muted-foreground"> 取消</span>
            {lightStripDraftState && lightStripDraftState.points.length > 0 && (
              <span className="ml-2 rounded-md bg-primary/15 px-1.5 py-0.5 font-medium text-[10px] text-primary">
                已放 {lightStripDraftState.points.length} 点
              </span>
            )}
          </div>
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
            onPointerCancel={(e) => {
              handleDeviceDragEnd(e)
              endPanning(e)
            }}
            onPointerDown={handlePointerDown}
            onPointerLeave={handleSvgPointerLeave}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={(e) => {
              handleDeviceDragEnd(e)
              endPanning(e)
            }}
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

            {/* WiFi 热力图 —— canvas 栅格化成 <image>，平滑无马赛克
                画在墙/楼板之下（SVG z 序靠前），墙线显示在热力之上 */}
            <FloorplanWifiHeatmapLayer aps={apDevices} walls={walls} />

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

            {/* 设备 2D 符号层 + 预览 ghost —— 放在 marquee rect 之后，
                保证任何模式下（包括框选）设备都能被点选（SVG 后渲染 = 视觉/事件在上） */}
            <FloorplanDeviceLayer
              circuitColors={circuitColors}
              circuitInfoByDevice={circuitInfoByDevice}
              devices={levelDevices}
              onStripVertexDragStart={handleStripVertexDragStart}
              onStripVertexDragMove={handleStripVertexDragMove}
              onStripVertexDragEnd={handleStripVertexDragEnd}
              onStripPathInsert={handleStripPathInsert}
              onStripPathDelete={handleStripPathDelete}
              worldUnitsPerPixel={floorplanWorldUnitsPerPixel}
              selectedIdSet={selectedIdSet}
              onDeviceSelect={(deviceId) => {
                const node = useScene.getState().nodes[deviceId as AnyNodeId] as
                  | DeviceNode
                  | undefined

                // 回路连接拾取：如果当前在 link 模式且点的是另一盏灯 → 合并回路
                const editorState = useEditor.getState()
                const linkSourceId = editorState.circuitLinkSourceId
                if (
                  linkSourceId &&
                  linkSourceId !== deviceId &&
                  node?.subsystem === 'lighting'
                ) {
                  // 异步导入避免循环依赖（mergeCircuits 来自 @vilhil/smarthome）
                  import('@vilhil/smarthome').then(({ mergeCircuits }) => {
                    mergeCircuits(linkSourceId, deviceId)
                    editorState.setCircuitLinkSourceId(null)
                    sfxEmitter.emit('sfx:item-place')
                  })
                  return
                }
                // 同一灯再点 / 点的不是灯 → 退出 link 模式（不合并）
                if (linkSourceId) {
                  editorState.setCircuitLinkSourceId(null)
                }

                // follow-mode 交互：点击摄像头 → 进入 follow；再点同一摄像头 → 退出 follow（确认方向）
                const isCamera =
                  node?.subsystem === 'security' &&
                  (node.renderType === 'dome' || node.renderType === 'camera-bullet')

                if (rotationFollowRef.current === deviceId) {
                  // 再点一次同一摄像头：确认退出
                  exitFollowMode()
                  return
                }

                // 常规选中
                setSelectedReferenceId(null)
                setSelection({ selectedIds: [deviceId] })
                // 摄像头才进入 follow
                rotationFollowRef.current = isCamera ? deviceId : null
              }}
              onDeviceDragStart={handleDeviceDragStart}
              onDeviceDelete={(deviceId) => {
                sfxEmitter.emit('sfx:item-delete')
                deleteNode(deviceId as AnyNodeId)
                setSelection({ selectedIds: [] })
              }}
              isDeleteMode={mode === 'delete'}
            />
            {/* 参考线层 —— 放置预览 OR 拖动移动 都可见；与 ghost 独立 */}
            <FloorplanCeilingGuidesLayer
              guides={devicePlacementPreview?.ceilingGuides ?? []}
              worldUnitsPerPixel={floorplanWorldUnitsPerPixel}
            />
            {/* 全时 4 向墙距离 —— 样式和墙尺寸一致（恒定灰色） */}
            <FloorplanWallDistancesLayer
              distances={devicePlacementPreview?.wallDistances ?? []}
              unit={unit}
              worldUnitsPerPixel={floorplanWorldUnitsPerPixel}
              palette={palette}
            />
            {/* Ghost 圆点 —— 仅在 build 模式 + tool==='item' 放置预览时显示。
                灯带 / 窗帘 都有自己的 draft 视觉（不需要也不该显示这个标准圆点）。*/}
            <FloorplanDeviceGhost
              point={
                mode === 'build' &&
                tool === 'item' &&
                selectedDevice?.lightType !== 'line' &&
                selectedDevice?.subsystem !== 'curtain'
                  ? (devicePlacementPreview?.point ?? null)
                  : null
              }
              subsystem={
                mode === 'build' && tool === 'item' && selectedDevice
                  ? (selectedDevice.subsystem ?? null)
                  : null
              }
              worldUnitsPerPixel={floorplanWorldUnitsPerPixel}
            />
            {/* 灯带画线 draft —— 仅在 build 模式 + item 工具 + 灯带类设备时显示 */}
            {mode === 'build' &&
              tool === 'item' &&
              selectedDevice?.lightType === 'line' &&
              lightStripDraftState && (
                <FloorplanLightStripDraft
                  draft={lightStripDraftState}
                  color={getSubsystemColor(selectedDevice.subsystem)}
                  worldUnitsPerPixel={floorplanWorldUnitsPerPixel}
                />
              )}

            {/* 窗帘画线 draft —— 仅对开帘 2 点画线流程 */}
            {mode === 'build' &&
              tool === 'item' &&
              selectedDevice?.subsystem === 'curtain' &&
              selectedDevice?.subtype === 'curtain-side-open' &&
              curtainDraftState && (
                <FloorplanCurtainDraft
                  draft={curtainDraftState}
                  walls={walls}
                  worldUnitsPerPixel={floorplanWorldUnitsPerPixel}
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
              const color = FLOORPLAN_COLOR_BRAND_PRIMARY
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
                      fill={FLOORPLAN_COLOR_SURFACE}
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
              const color = FLOORPLAN_COLOR_BRAND_PRIMARY
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
                    fill={FLOORPLAN_COLOR_SURFACE}
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
              const color = FLOORPLAN_COLOR_BRAND_PRIMARY
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
                    fill={FLOORPLAN_COLOR_SURFACE}
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
              const color = draftMeasurement.isOrthogonal ? FLOORPLAN_COLOR_BRAND_PRIMARY : FLOORPLAN_COLOR_WARNING
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
                    fill={FLOORPLAN_COLOR_SURFACE}
                    fontSize={fontSizeWorld}
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    fontWeight={600}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {lengthText}
                    <tspan fill={FLOORPLAN_COLOR_TRACK} fontWeight={400}>{'  '}{angleText}</tspan>
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
        fill={FLOORPLAN_COLOR_BRAND_PRIMARY}
        fillOpacity={0.18}
      />
      <circle
        cx={toSvgX(p[0])}
        cy={toSvgY(p[1])}
        r={pinHeadR}
        fill={FLOORPLAN_COLOR_BRAND_PRIMARY}
        stroke={FLOORPLAN_COLOR_SURFACE}
        strokeWidth={strokeW}
      />
    </g>
  )

  // 十字骨架 — 两条交叉直线
  const Cross = ({
    p,
    opacity = 1,
    color = FLOORPLAN_COLOR_BRAND_PRIMARY,
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
          <Cross p={livePt} opacity={0.55} color={FLOORPLAN_COLOR_WARNING} />
          <circle
            cx={toSvgX(livePt[0])}
            cy={toSvgY(livePt[1])}
            r={5 * px}
            fill="none"
            stroke={FLOORPLAN_COLOR_WARNING}
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
        stroke={FLOORPLAN_COLOR_BRAND_PRIMARY}
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
            fill={FLOORPLAN_COLOR_SURFACE}
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
      stroke={FLOORPLAN_COLOR_BRAND_PRIMARY}
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
