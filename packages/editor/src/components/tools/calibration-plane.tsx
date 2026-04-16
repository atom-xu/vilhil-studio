'use client'

import { Html } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import useEditor from '../../store/use-editor'

/**
 * CalibrationPlane — 标定模式时渲染的透明地面点击区
 *
 * 改进：
 *   - 修复 point1 字段名 bug（应读 points[0]）
 *   - 修复 addPoint 传 [x,y,z] bug（应传 [x,z]）
 *   - 第二点自动吸附到水平/垂直轴（Shift 松开约束）
 *   - 实时预览测量线 + 尺寸标签
 *   - 轴对齐参考线（蓝色虚线）
 */
export function CalibrationPlane() {
  const active   = useEditor((s) => s.calibration?.active ?? false)
  const addPoint = useEditor((s) => s.addCalibrationPoint)
  const points   = useEditor((s) => s.calibration?.points ?? [])

  const point1 = (points[0] ?? null) as [number, number] | null
  const point2 = (points[1] ?? null) as [number, number] | null

  const [hoverXZ, setHoverXZ] = useState<[number, number] | null>(null)
  const shiftRef = useRef(false)

  // Shift = 松开轴约束，允许自由放置（斜向测量）
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = true }
    const onUp   = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = false }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  }, [])

  /**
   * 把原始 XZ 坐标吸附到水平/垂直轴（相对 point1）。
   *
   * 规则：
   *   |dx| >= |dz| → 水平测量，锁 z = point1.z
   *   |dx| <  |dz| → 垂直测量，锁 x = point1.x
   *
   * Shift 按下 → 自由模式（不吸附）。
   * 没有 point1 → 直接返回原始坐标。
   */
  const snapToAxis = (raw: [number, number]): { snapped: [number, number]; axis: 'h' | 'v' | 'free' } => {
    if (!point1 || shiftRef.current) return { snapped: raw, axis: 'free' }
    const dx = raw[0] - point1[0]
    const dz = raw[1] - point1[1]
    if (Math.abs(dx) >= Math.abs(dz)) {
      return { snapped: [raw[0], point1[1]], axis: 'h' }
    }
    return { snapped: [point1[0], raw[1]], axis: 'v' }
  }

  const handleMove = (e: any) => {
    if (!active || points.length >= 2) return
    const p = e.point as THREE.Vector3
    const { snapped } = snapToAxis([p.x, p.z])
    setHoverXZ(snapped)
  }

  const handleClick = (e: any) => {
    if (!active || points.length >= 2) return
    e.stopPropagation()
    const p = e.point as THREE.Vector3
    const { snapped } = snapToAxis([p.x, p.z])
    addPoint(snapped)
    if (points.length === 0) setHoverXZ(null)
  }

  // ── 测量线几何（useMemo 创建 Three.js 对象，避免 <line> JSX 类型冲突） ──
  const { previewLine, axisLine } = useMemo(() => {
    const makeLine = (color: string, dashed: boolean) => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.12, depthTest: false, depthWrite: false, opacity: 0.5, transparent: true })
        : new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false, opacity: 0.85, transparent: true })
      const line = new THREE.Line(geo, mat)
      line.visible = false
      line.renderOrder = 10
      return line
    }
    return { previewLine: makeLine('#2D7FF9', false), axisLine: makeLine('#60a5fa', true) }
  }, [])

  // 每帧更新测量线 / 轴参考线
  const p1 = point1
  const p2live: [number, number] | null = point2 ?? hoverXZ

  // 更新 previewLine（point1 → 当前位置）
  useEffect(() => {
    const geo = previewLine.geometry
    const attr = geo.attributes.position as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    if (p1 && p2live) {
      arr[0] = p1[0];    arr[1] = 0.03; arr[2] = p1[1]
      arr[3] = p2live[0]; arr[4] = 0.03; arr[5] = p2live[1]
      attr.needsUpdate = true
      previewLine.visible = true
    } else {
      previewLine.visible = false
    }
  })

  // 更新 axisLine（轴参考线：过 point1 的水平/垂直线）
  const snapAxis = p1 && p2live ? snapToAxis(p2live as [number, number]).axis : 'free'
  useEffect(() => {
    const geo = axisLine.geometry
    const attr = geo.attributes.position as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    const EXTENT = 50
    if (p1 && p2live && snapAxis !== 'free') {
      if (snapAxis === 'h') {
        // 水平轴参考线：过 point1.z，x 方向延伸
        arr[0] = p1[0] - EXTENT; arr[1] = 0.02; arr[2] = p1[1]
        arr[3] = p1[0] + EXTENT; arr[4] = 0.02; arr[5] = p1[1]
      } else {
        // 垂直轴参考线：过 point1.x，z 方向延伸
        arr[0] = p1[0]; arr[1] = 0.02; arr[2] = p1[1] - EXTENT
        arr[3] = p1[0]; arr[4] = 0.02; arr[5] = p1[1] + EXTENT
      }
      attr.needsUpdate = true
      axisLine.computeLineDistances()
      axisLine.visible = true
    } else {
      axisLine.visible = false
    }
  })

  // 尺寸标签信息
  const labelInfo = useMemo(() => {
    if (!p1 || !p2live) return null
    const dx = p2live[0] - p1[0]
    const dz = p2live[1] - p1[1]
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 0.01) return null
    return {
      pos: [(p1[0] + p2live[0]) / 2, 0.15, (p1[1] + p2live[1]) / 2] as [number, number, number],
      dist,
      axis: snapAxis,
    }
  }, [p1, p2live, snapAxis])

  if (!active) return null

  return (
    <>
      {/* 透明点击接收平面（100m × 100m） */}
      <mesh
        onClick={handleClick}
        onPointerMove={handleMove}
        position={[0, 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial
          color="#2D7FF9"
          depthWrite={false}
          opacity={0.03}
          side={THREE.DoubleSide}
          transparent
        />
      </mesh>

      {/* 轴参考线（虚线） */}
      <primitive object={axisLine} />

      {/* 测量预览线（实线） */}
      <primitive object={previewLine} />

      {/* point1 标记 */}
      {p1 && (
        <mesh position={[p1[0], 0.06, p1[1]]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color="#2D7FF9" depthTest={false} />
        </mesh>
      )}

      {/* point2 / 当前光标标记 */}
      {p2live && (
        <mesh position={[p2live[0], 0.06, p2live[1]]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color={snapAxis === 'free' ? '#f59e0b' : '#2D7FF9'} depthTest={false} />
        </mesh>
      )}

      {/* 尺寸标签 */}
      {labelInfo && (
        <group position={labelInfo.pos}>
          <Html center pointerEvents="none" style={{ pointerEvents: 'none', userSelect: 'none' }}>
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '11px',
                fontWeight: 600,
                color: '#ffffff',
                background: 'rgba(24, 24, 27, 0.92)',
                border: '1px solid rgba(45, 127, 249, 0.4)',
                borderRadius: '6px',
                padding: '3px 8px',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                transform: 'translate(-50%, calc(-100% - 10px))',
              }}
            >
              {labelInfo.dist.toFixed(2)} m
              {labelInfo.axis !== 'free' && (
                <span style={{ marginLeft: 6, opacity: 0.55, fontSize: '10px' }}>
                  {labelInfo.axis === 'h' ? '— 水平' : '| 垂直'}
                </span>
              )}
              {labelInfo.axis === 'free' && (
                <span style={{ marginLeft: 6, opacity: 0.55, fontSize: '10px', color: '#f59e0b' }}>
                  自由
                </span>
              )}
            </div>
          </Html>
        </group>
      )}

      {/* Shift 提示（仅在放置第二点时显示） */}
      {p1 && !point2 && (
        <group position={[p1[0], 0.15, p1[1]]}>
          <Html center pointerEvents="none" style={{ pointerEvents: 'none', userSelect: 'none' }}>
            <div
              style={{
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                fontSize: '10px',
                color: 'rgba(255,255,255,0.45)',
                whiteSpace: 'nowrap',
                marginTop: 28,
              }}
            >
              Shift 自由放置
            </div>
          </Html>
        </group>
      )}
    </>
  )
}
