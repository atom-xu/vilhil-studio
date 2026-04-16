import { emitter, type GridEvent, type LevelNode, useScene, type WallNode } from '@pascal-app/core'
import { Html } from '@react-three/drei'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, type Group, Line as ThreeLine, LineDashedMaterial, type Mesh, Shape, ShapeGeometry, Vector3 } from 'three'
import { markToolCancelConsumed } from '../../../hooks/use-keyboard'
import { EDITOR_LAYER } from '../../../lib/constants'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { CursorSphere } from '../shared/cursor-sphere'
import {
  collectTrackingCandidates,
  computeExtensionTracking,
  computeOrthogonalTracking,
  createWallOnCurrentLevel,
  findWallSnapTarget,
  snapWallDraftPointDetailed,
  WALL_MIN_LENGTH,
  type ExtensionTrackingHit,
  type OrthogonalTrackingHit,
  type WallPlanPoint,
  type WallSnapHit,
  type WallSnapResult,
} from './wall-drafting'

const WALL_HEIGHT = 2.5

/**
 * Update wall preview mesh geometry to create a vertical plane between two points
 */
const updateWallPreview = (mesh: Mesh, start: Vector3, end: Vector3) => {
  // Calculate direction and perpendicular for wall thickness
  const direction = new Vector3(end.x - start.x, 0, end.z - start.z)
  const length = direction.length()

  if (length < WALL_MIN_LENGTH) {
    mesh.visible = false
    return
  }

  mesh.visible = true
  direction.normalize()

  // Create wall shape (vertical rectangle in XY plane)
  const shape = new Shape()
  shape.moveTo(0, 0)
  shape.lineTo(length, 0)
  shape.lineTo(length, WALL_HEIGHT)
  shape.lineTo(0, WALL_HEIGHT)
  shape.closePath()

  // Create geometry
  const geometry = new ShapeGeometry(shape)

  // Calculate rotation angle
  // Negate the angle to fix the opposite direction issue
  const angle = -Math.atan2(direction.z, direction.x)

  // Position at start point and rotate
  mesh.position.set(start.x, start.y, start.z)
  mesh.rotation.y = angle

  // Dispose old geometry and assign new one
  if (mesh.geometry) {
    mesh.geometry.dispose()
  }
  mesh.geometry = geometry
}

const getCurrentLevelWalls = (): WallNode[] => {
  const currentLevelId = useViewer.getState().selection.levelId
  const { nodes } = useScene.getState()

  if (!currentLevelId) return []

  const levelNode = nodes[currentLevelId]
  if (!levelNode || levelNode.type !== 'level') return []

  return (levelNode as LevelNode).children
    .map((childId) => nodes[childId])
    .filter((node): node is WallNode => node?.type === 'wall')
}

/** 吸附指示器颜色 —— 端点吸附用绿色（命中最精确），投影吸附用琥珀色（T 型插入提示） */
const SNAP_COLOR_ENDPOINT = '#4ade80' // green-400
const SNAP_COLOR_PROJECTION = '#fbbf24' // amber-400

/**
 * 格式化墙长显示：总是两位小数、米单位，与 F1 的 1cm 精度一致。
 * 3.8 → "3.80 m"，10.46 → "10.46 m"
 */
const formatLength = (meters: number): string => `${meters.toFixed(2)} m`

/**
 * 格式化墙角度显示：0-360°，2° 内吸到常见整数角度（0/45/90/135/180）。
 */
const formatAngle = (radians: number): string => {
  let deg = (radians * 180) / Math.PI
  // 规范到 [0, 360)
  deg = ((deg % 360) + 360) % 360
  // 吸附到 45° 的倍数
  const snaps = [0, 45, 90, 135, 180, 225, 270, 315, 360]
  for (const s of snaps) {
    if (Math.abs(deg - s) < 2) return `${s % 360}°`
  }
  return `${deg.toFixed(1)}°`
}

export const WallTool: React.FC = () => {
  const cursorRef = useRef<Group>(null)
  const wallPreviewRef = useRef<Mesh>(null!)
  /** 吸附到已有墙时的指示器（端点/投影），命中时才显示 */
  const snapMarkerRef = useRef<Group>(null!)
  const snapMarkerInnerRef = useRef<Mesh>(null!)
  const snapMarkerRingRef = useRef<Mesh>(null!)
  /** 尺寸标签：画墙时实时显示长度和角度 */
  const dimensionLabelGroupRef = useRef<Group>(null!)
  const dimensionLabelTextRef = useRef<HTMLDivElement>(null)
  const startingPoint = useRef(new Vector3(0, 0, 0))
  const endingPoint = useRef(new Vector3(0, 0, 0))
  const buildingState = useRef(0)
  const shiftPressed = useRef(false)

  /**
   * 正交追踪参考线 —— 用 useMemo 直接创建 Three.js 对象，避免 <line> JSX 类型冲突。
   * 返回 [hLine, vLine, extLine]：水平、垂直、延长追踪线。
   */
  const [hTrackLine, vTrackLine, extTrackLine] = useMemo(() => {
    const makeTrackLine = (color: string, dashSize: number, gapSize: number) => {
      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(new Float32Array(6), 3))
      const mat = new LineDashedMaterial({
        color,
        dashSize,
        gapSize,
        depthTest: false,
        depthWrite: false,
        opacity: 0.6,
        transparent: true,
      })
      const line = new ThreeLine(geo, mat)
      line.visible = false
      line.renderOrder = 2
      line.layers.set(EDITOR_LAYER)
      return line
    }
    return [
      makeTrackLine('#60a5fa', 0.18, 0.09), // 水平 — 品牌蓝
      makeTrackLine('#60a5fa', 0.18, 0.09), // 垂直 — 品牌蓝
      makeTrackLine('#22d3ee', 0.25, 0.12), // 延长 — 青色
    ]
  }, [])

  /**
   * 根据吸附命中类型更新指示器 —— 未命中时隐藏，命中时显示对应颜色。
   * 所有更新都是 imperative 的，不触发 React re-render。
   */
  const updateSnapMarker = (result: WallSnapResult, y: number) => {
    const marker = snapMarkerRef.current
    if (!marker) return
    if (result.hit) {
      marker.visible = true
      marker.position.set(result.point[0], y, result.point[1])
      const color = result.kind === 'endpoint' ? SNAP_COLOR_ENDPOINT : SNAP_COLOR_PROJECTION
      const inner = snapMarkerInnerRef.current
      const ring = snapMarkerRingRef.current
      if (inner?.material && 'color' in inner.material) (inner.material as any).color.set(color)
      if (ring?.material && 'color' in ring.material) (ring.material as any).color.set(color)
    } else {
      marker.visible = false
    }
  }

  /**
   * 更新尺寸标签：画墙中（state=1）时显示长度+角度，未画墙时隐藏。
   * 标签位置挂在起点到终点的中点上，文本用 imperative 更新避免 re-render。
   */
  const updateDimensionLabel = (
    start: Vector3,
    end: Vector3,
    visible: boolean,
  ) => {
    const group = dimensionLabelGroupRef.current
    if (!group) return
    if (!visible) {
      group.visible = false
      return
    }
    const dx = end.x - start.x
    const dz = end.z - start.z
    const length = Math.hypot(dx, dz)
    if (length < 1e-6) {
      group.visible = false
      return
    }
    group.visible = true
    // 标签挂在墙中点往上抬一点点，避免被墙预览遮挡
    group.position.set((start.x + end.x) / 2, start.y + 0.1, (start.z + end.z) / 2)
    // 直接写 DOM innerText，无 React 重渲染
    const el = dimensionLabelTextRef.current
    if (el) {
      const angle = Math.atan2(-dz, dx) // 注意 z 向下，翻转符号得到屏幕常规角度
      el.textContent = `${formatLength(length)}  ${formatAngle(angle)}`
    }
  }

  /**
   * 更新正交追踪参考线。全部 imperative，不触发 React re-render。
   * 水平 / 垂直线颜色：品牌蓝 #60a5fa
   * 延长追踪线颜色：青色 #22d3ee（与墙身投影的琥珀形成区分）
   */
  const updateTrackingLines = (
    orthoHit: OrthogonalTrackingHit | null,
    extHit: ExtensionTrackingHit | null,
    cursorX: number,
    cursorZ: number,
    y: number,
  ) => {
    hTrackLine.visible = false
    vTrackLine.visible = false
    extTrackLine.visible = false

    const setLinePoints = (line: ThreeLine, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const posAttr = line.geometry.attributes.position as BufferAttribute | undefined
      if (!posAttr) return
      const arr = posAttr.array as Float32Array
      arr[0] = ax; arr[1] = ay; arr[2] = az
      arr[3] = bx; arr[4] = by; arr[5] = bz
      posAttr.needsUpdate = true
      line.computeLineDistances()
      line.visible = true
    }

    if (orthoHit) {
      const { horizontalAnchor, verticalAnchor } = orthoHit
      if (horizontalAnchor) {
        setLinePoints(hTrackLine,
          horizontalAnchor[0], y + 0.01, horizontalAnchor[1],
          cursorX,             y + 0.01, horizontalAnchor[1],
        )
      }
      if (verticalAnchor) {
        setLinePoints(vTrackLine,
          verticalAnchor[0], y + 0.01, verticalAnchor[1],
          verticalAnchor[0], y + 0.01, cursorZ,
        )
      }
    }

    if (extHit) {
      setLinePoints(extTrackLine,
        extHit.referencePoint[0], y + 0.01, extHit.referencePoint[1],
        extHit.snappedPoint[0],   y + 0.01, extHit.snappedPoint[1],
      )
    }
  }

  /** 组件卸载时释放追踪线的 geometry 和 material */
  useEffect(() => {
    return () => {
      for (const line of [hTrackLine, vTrackLine, extTrackLine]) {
        line.geometry.dispose()
        ;(line.material as LineDashedMaterial).dispose()
      }
    }
  }, [hTrackLine, vTrackLine, extTrackLine])

  useEffect(() => {
    let gridPosition: WallPlanPoint = [0, 0]
    let previousWallEnd: [number, number] | null = null
    let previousSnapKey: string | null = null

    const onGridMove = (event: GridEvent) => {
      if (!(cursorRef.current && wallPreviewRef.current)) return

      const walls = getCurrentLevelWalls()
      const cursorPoint: WallPlanPoint = [event.position[0], event.position[2]]
      const y = event.position[1]

      if (buildingState.current === 1) {
        const draftStart: WallPlanPoint = [startingPoint.current.x, startingPoint.current.z]

        // 第一优先级：墙端点 / 墙身投影吸附
        const drawResult = snapWallDraftPointDetailed({
          point: cursorPoint,
          walls,
          start: draftStart,
          angleSnap: !shiftPressed.current,
        })

        let finalPoint = drawResult.point
        let finalHit: WallSnapHit | null = drawResult.hit

        // 第二优先级：正交 + 延长追踪（仅在无一级吸附时触发）
        if (!finalHit) {
          const TRACKING_TOL = 0.35
          const candidates = collectTrackingCandidates({
            walls,
            draftStart,
            cursor: drawResult.point,
            distanceLimit: 20,
          })
          const orthoHit = computeOrthogonalTracking({
            cursor: drawResult.point,
            candidates,
            tolerance: TRACKING_TOL,
          })
          if (orthoHit) {
            finalPoint = orthoHit.snappedPoint
            // 追踪对齐后再做一次墙吸附（光标可能正好落在另一面墙端点上）
            const trackSnap = findWallSnapTarget(orthoHit.snappedPoint, walls)
            if (trackSnap) {
              finalPoint = trackSnap.point
              finalHit = trackSnap
            }
            updateTrackingLines(orthoHit, null, finalPoint[0], finalPoint[1], y)
          } else {
            const extHit = computeExtensionTracking({
              cursor: drawResult.point,
              walls,
              tolerance: TRACKING_TOL * 0.7,
            })
            if (extHit) {
              finalPoint = extHit.snappedPoint
              updateTrackingLines(null, extHit, finalPoint[0], finalPoint[1], y)
            } else {
              updateTrackingLines(null, null, 0, 0, y)
            }
          }
        } else {
          updateTrackingLines(null, null, 0, 0, y)
        }

        const snapped = new Vector3(finalPoint[0], y, finalPoint[1])
        endingPoint.current.copy(snapped)
        cursorRef.current.position.set(snapped.x, snapped.y, snapped.z)

        const finalResult: WallSnapResult = finalHit
          ? { point: finalHit.point, kind: finalHit.kind, hit: finalHit }
          : { point: finalPoint, kind: drawResult.kind, hit: null }
        updateSnapMarker(finalResult, y)
        updateDimensionLabel(startingPoint.current, endingPoint.current, true)

        const currentWallEnd: [number, number] = [endingPoint.current.x, endingPoint.current.z]
        if (
          previousWallEnd &&
          (currentWallEnd[0] !== previousWallEnd[0] || currentWallEnd[1] !== previousWallEnd[1])
        ) {
          sfxEmitter.emit('sfx:grid-snap')
        }
        previousWallEnd = currentWallEnd

        const snapKey = finalHit
          ? `${finalHit.kind}:${finalHit.point[0]},${finalHit.point[1]}`
          : null
        if (snapKey && snapKey !== previousSnapKey) {
          sfxEmitter.emit('sfx:grid-snap')
        }
        previousSnapKey = snapKey

        updateWallPreview(wallPreviewRef.current, startingPoint.current, endingPoint.current)
      } else {
        // 未在画墙：显示吸附光标，隐藏所有追踪线
        const idleResult = snapWallDraftPointDetailed({ point: cursorPoint, walls })
        gridPosition = idleResult.point
        cursorRef.current.position.set(gridPosition[0], y, gridPosition[1])
        updateSnapMarker(idleResult, y)
        updateDimensionLabel(startingPoint.current, endingPoint.current, false)
        updateTrackingLines(null, null, 0, 0, y)
        previousSnapKey = idleResult.hit
          ? `${idleResult.kind}:${idleResult.point[0]},${idleResult.point[1]}`
          : null
      }
    }

    const onGridClick = (event: GridEvent) => {
      const walls = getCurrentLevelWalls()
      const clickPoint: WallPlanPoint = [event.position[0], event.position[2]]

      if (buildingState.current === 0) {
        const startResult = snapWallDraftPointDetailed({
          point: clickPoint,
          walls,
        })
        const snappedStart = startResult.point
        gridPosition = snappedStart
        startingPoint.current.set(snappedStart[0], event.position[1], snappedStart[1])
        endingPoint.current.copy(startingPoint.current)
        buildingState.current = 1
        wallPreviewRef.current.visible = true
      } else if (buildingState.current === 1) {
        const endResult = snapWallDraftPointDetailed({
          point: clickPoint,
          walls,
          start: [startingPoint.current.x, startingPoint.current.z],
          angleSnap: !shiftPressed.current,
        })
        const snappedEnd = endResult.point
        endingPoint.current.set(snappedEnd[0], event.position[1], snappedEnd[1])
        const dx = endingPoint.current.x - startingPoint.current.x
        const dz = endingPoint.current.z - startingPoint.current.z
        if (dx * dx + dz * dz < WALL_MIN_LENGTH * WALL_MIN_LENGTH) return
        createWallOnCurrentLevel(
          [startingPoint.current.x, startingPoint.current.z],
          [endingPoint.current.x, endingPoint.current.z],
        )
        // 链式画墙：终点自动成为下一段的起点，保持 state=1
        // 按 Escape 才退出画墙模式
        startingPoint.current.copy(endingPoint.current)
        if (snapMarkerRef.current) snapMarkerRef.current.visible = false
        if (dimensionLabelGroupRef.current) dimensionLabelGroupRef.current.visible = false
        updateTrackingLines(null, null, 0, 0, endingPoint.current.y)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftPressed.current = true
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftPressed.current = false
      }
    }

    const onCancel = () => {
      if (buildingState.current === 1) {
        markToolCancelConsumed()
        buildingState.current = 0
        wallPreviewRef.current.visible = false
        if (snapMarkerRef.current) snapMarkerRef.current.visible = false
        if (dimensionLabelGroupRef.current) dimensionLabelGroupRef.current.visible = false
        updateTrackingLines(null, null, 0, 0, 0)
      }
    }

    emitter.on('grid:move', onGridMove)
    emitter.on('grid:click', onGridClick)
    emitter.on('tool:cancel', onCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      emitter.off('grid:move', onGridMove)
      emitter.off('grid:click', onGridClick)
      emitter.off('tool:cancel', onCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return (
    <group>
      {/* Cursor indicator */}
      <CursorSphere ref={cursorRef} />

      {/*
        Snap indicator — only visible when the cursor is locked onto an existing wall.
        Endpoint snap  → green ring  (最可靠：角对角精确对齐)
        Projection snap → amber ring (T 型插入到墙身)
        Lives on the ground plane, rotated flat.
      */}
      <group ref={snapMarkerRef} visible={false}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {/* Solid inner disk */}
          <mesh layers={EDITOR_LAYER} ref={snapMarkerInnerRef} renderOrder={3}>
            <circleGeometry args={[0.09, 32]} />
            <meshBasicMaterial
              color={SNAP_COLOR_ENDPOINT}
              depthTest={false}
              depthWrite={false}
              opacity={0.85}
              transparent
            />
          </mesh>
          {/* Outer ring */}
          <mesh layers={EDITOR_LAYER} ref={snapMarkerRingRef} renderOrder={3}>
            <ringGeometry args={[0.15, 0.2, 32]} />
            <meshBasicMaterial
              color={SNAP_COLOR_ENDPOINT}
              depthTest={false}
              depthWrite={false}
              opacity={0.6}
              side={DoubleSide}
              transparent
            />
          </mesh>
        </group>
      </group>

      {/* Wall preview */}
      <mesh layers={EDITOR_LAYER} ref={wallPreviewRef} renderOrder={1} visible={false}>
        <shapeGeometry />
        <meshBasicMaterial
          color="#818cf8"
          depthTest={false}
          depthWrite={false}
          opacity={0.5}
          side={DoubleSide}
          transparent
        />
      </mesh>

      {/*
        正交追踪参考线 ——
        水平 / 垂直线（蓝色）：光标对齐已有墙端点的水平或垂直方向时显示
        延长线（青色）：光标在某面墙的无限延长线上时显示
        用 <primitive> 而非 <line> 避免与 SVG line 的 JSX 类型冲突。
        全部 imperative 更新，不触发 React re-render。
      */}
      <primitive object={hTrackLine} />
      <primitive object={vTrackLine} />
      <primitive object={extTrackLine} />

      {/*
        Real-time dimension label — shows wall length + angle while drawing.
        Uses drei's <Html> which renders a DOM overlay that follows a 3D anchor.
        Text content is updated imperatively via `dimensionLabelTextRef`
        so moving the cursor doesn't trigger React re-renders.
      */}
      <group ref={dimensionLabelGroupRef} visible={false}>
        <Html
          center
          pointerEvents="none"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div
            ref={dimensionLabelTextRef}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: '#ffffff',
              background: 'rgba(24, 24, 27, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '4px 8px',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              transform: 'translate(-50%, calc(-100% - 12px))',
            }}
          >
            0.00 m  0°
          </div>
        </Html>
      </group>
    </group>
  )
}
