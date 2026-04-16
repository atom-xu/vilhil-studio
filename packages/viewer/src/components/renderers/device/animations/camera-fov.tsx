'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

interface CameraFOVProps {
  position: [number, number, number]
  /** 水平视野角度（度） */
  fov?: number
  /** 视距范围（m） */
  range?: number
  /** 朝向角度（弧度，0 = 正前方/+z） */
  direction?: number
  /** 安防子系统色 */
  color?: string
}

/**
 * 摄像头视野锥 — 扇形半透明区域 + 扫描线动画
 *
 * 显示安防摄像头的覆盖范围，有缓慢旋转的扫描线暗示在线状态。
 */
export const CameraFOV = ({
  position,
  fov = 90,
  range = 5,
  direction = 0,
  color = '#f59e0b',
}: CameraFOVProps) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const scanRef = useRef<THREE.Mesh>(null)

  // 扇形几何（铺在地面上，y = 0.01）
  const geometry = useMemo(() => {
    const halfAngle = (fov * Math.PI) / 360
    const segments = 32
    const vertices: number[] = []
    const indices: number[] = []

    // 中心点
    vertices.push(0, 0.02, 0)

    // 扇形弧线
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const angle = direction - halfAngle + t * 2 * halfAngle
      vertices.push(Math.sin(angle) * range, 0.02, Math.cos(angle) * range)
    }

    // 三角形扇
    for (let i = 1; i <= segments; i++) {
      indices.push(0, i, i + 1)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [fov, range, direction])

  // 扫描线几何（一条细线从中心到边缘）
  const scanGeometry = useMemo(() => {
    const halfAngle = (fov * Math.PI) / 360
    const geo = new THREE.BufferGeometry()
    const pts = [0, 0.03, 0, Math.sin(direction) * range, 0.03, Math.cos(direction) * range]
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return geo
  }, [fov, range, direction])

  // 扫描线旋转动画
  useFrame(({ clock }) => {
    if (!scanRef.current) return
    const t = clock.getElapsedTime()
    const halfAngle = (fov * Math.PI) / 360
    const sweep = Math.sin(t * 0.5) * halfAngle
    scanRef.current.rotation.y = sweep
  })

  return (
    <group position={position}>
      {/* 覆盖扇形 */}
      <mesh geometry={geometry} ref={meshRef}>
        <meshBasicMaterial
          color={color}
          depthWrite={false}
          opacity={0.12}
          side={THREE.DoubleSide}
          transparent
        />
      </mesh>

      {/* 扫描线 */}
      <line ref={scanRef as any}>
        <bufferGeometry>
          <bufferAttribute
            args={[new Float32Array([0, 0.03, 0, 0, 0.03, range]), 3]}
            attach="attributes-position"
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} opacity={0.5} transparent />
      </line>
    </group>
  )
}
