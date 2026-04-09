'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

interface LightConeProps {
  position: [number, number, number]
  /** 目标亮度 0-1。传 0 = 关，会渐隐消失。 */
  brightness?: number
  beamAngle?: number
  height?: number
}

/**
 * 粒子光锥 — 体积光效果，随亮度平滑渐入 / 渐出
 *
 * 注意：THREE.PointsMaterial 不支持逐顶点 opacity attribute，
 * 全局 fade 使用 material.opacity + 呼吸动画，
 * 粒子位置逐帧更新保留漂浮感。
 */
export const LightCone = ({
  position,
  brightness = 0.8,
  beamAngle = 30,
  height = 2.4,
}: LightConeProps) => {
  const pointsRef = useRef<THREE.Points>(null)
  const groundRef = useRef<THREE.Points>(null)
  const PARTICLE_COUNT = 300

  // 动画当前亮度 ref（useFrame 内插值，不触发 re-render）
  const currentBrightness = useRef(0)

  // 粒子初始化（只算一次）
  const { particles, groundParticles, particleArray, groundArray } = useMemo(() => {
    const rad = (beamAngle * Math.PI) / 180
    const r = height * Math.tan(rad / 2)

    const pts: Array<{ x: number; y: number; z: number; phase: number; speed: number; originalY: number }> = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const hNorm = Math.pow(Math.random(), 0.7)
      const h = hNorm * height
      const currentRadius = (r * (height - h)) / height
      const rNorm = Math.pow(Math.random(), 0.5)
      const angle = Math.random() * Math.PI * 2
      const x = Math.cos(angle) * currentRadius * rNorm
      const z = Math.sin(angle) * currentRadius * rNorm
      pts.push({ x, y: -h, z, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.5, originalY: -h })
    }

    const groundPts: Array<{ x: number; y: number; z: number; phase: number }> = []
    for (let i = 0; i < 60; i++) {
      const rNorm = Math.pow(Math.random(), 0.6)
      const angle = Math.random() * Math.PI * 2
      groundPts.push({
        x: Math.cos(angle) * r * rNorm * 0.9,
        y: 0.01,
        z: Math.sin(angle) * r * rNorm * 0.9,
        phase: Math.random() * Math.PI * 2,
      })
    }

    return {
      particles: pts,
      groundParticles: groundPts,
      particleArray: new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z])),
      groundArray: new Float32Array(groundPts.flatMap((p) => [p.x, p.y, p.z])),
    }
  }, [beamAngle, height])

  useFrame(({ clock }, dt) => {
    const cone = pointsRef.current
    const ground = groundRef.current
    if (!cone || !ground) return

    // 亮度插值（约 300ms 过渡）
    currentBrightness.current += (brightness - currentBrightness.current) * Math.min(dt * 5, 1)
    const effBrightness = currentBrightness.current

    const coneMat = cone.material as THREE.PointsMaterial
    const groundMat = ground.material as THREE.PointsMaterial

    if (effBrightness < 0.002) {
      coneMat.opacity = 0
      groundMat.opacity = 0
      return
    }

    const t = clock.getElapsedTime()
    // 整体呼吸效果（通过 material.opacity 实现，无需逐顶点）
    const breath = 0.78 + Math.sin(t * 1.8) * 0.22
    coneMat.opacity = effBrightness * breath * 0.55
    groundMat.opacity = effBrightness * breath * 0.42

    // 粒子位置漂浮动画
    const posAttr = cone.geometry.attributes.position
    if (!posAttr) return
    const positions = posAttr.array as Float32Array
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]!
      const float = Math.sin(t * p.speed + p.phase) * 0.02
      positions[i * 3] = p.x + Math.sin(t * 0.5 + p.phase) * 0.012
      positions[i * 3 + 1] = p.originalY + float
      positions[i * 3 + 2] = p.z + Math.cos(t * 0.3 + p.phase) * 0.012
    }
    posAttr.needsUpdate = true
  })

  return (
    <group position={position}>
      {/* 锥形粒子主体 */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute args={[particleArray, 3]} attach="attributes-position" />
        </bufferGeometry>
        <pointsMaterial
          color="#fff8d0"
          depthWrite={false}
          opacity={0}
          size={0.11}
          sizeAttenuation
          transparent
        />
      </points>

      {/* 地面光晕粒子 */}
      <points ref={groundRef} position={[0, -height + 0.01, 0]}>
        <bufferGeometry>
          <bufferAttribute args={[groundArray, 3]} attach="attributes-position" />
        </bufferGeometry>
        <pointsMaterial
          color="#fff0b0"
          depthWrite={false}
          opacity={0}
          size={0.14}
          sizeAttenuation
          transparent
        />
      </points>
    </group>
  )
}
