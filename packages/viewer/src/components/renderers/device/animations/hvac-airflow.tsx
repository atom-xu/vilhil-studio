'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

interface HvacAirflowProps {
  position: [number, number, number]
  /** 0 = 关闭（渐隐），1 = 全速运行 */
  intensity?: number
  /** 出风口离地高度（m），粒子下落到地面消失 */
  height?: number
}

const PARTICLE_COUNT = 120

/**
 * HVAC 气流粒子 — 从出风口向下扩散的气流可视化
 *
 * 粒子从设备位置向下飘落，呈锥形扩散，到地面附近渐隐。
 * intensity 通过 material.opacity 平滑过渡，避免 Zustand 写入。
 */
export const HvacAirflow = ({
  position,
  intensity = 1,
  height = 2.5,
}: HvacAirflowProps) => {
  const pointsRef = useRef<THREE.Points>(null)
  const currentIntensity = useRef(0)

  // 粒子初始数据
  const { particles, positionArray } = useMemo(() => {
    const pts: Array<{
      phase: number
      speed: number
      drift: number
      driftAngle: number
    }> = []

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pts.push({
        phase: Math.random(),           // 初始进度 0-1（0=顶部，1=底部）
        speed: 0.15 + Math.random() * 0.12, // 下落速率
        drift: 0.3 + Math.random() * 0.6,   // 水平扩散幅度
        driftAngle: Math.random() * Math.PI * 2, // 4 方向角度
      })
    }

    // 初始位置（都在顶部，useFrame 会更新）
    const arr = new Float32Array(PARTICLE_COUNT * 3)
    return { particles: pts, positionArray: arr }
  }, [])

  useFrame((_, dt) => {
    const points = pointsRef.current
    if (!points) return

    // 平滑插值到目标强度
    currentIntensity.current += (intensity - currentIntensity.current) * Math.min(dt * 4, 1)
    const eff = currentIntensity.current

    const mat = points.material as THREE.PointsMaterial
    mat.opacity = eff * 0.35

    if (eff < 0.005) return

    const posAttr = points.geometry.attributes.position
    if (!posAttr) return
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]!

      // 粒子进度循环 0→1→重置
      p.phase += dt * p.speed
      if (p.phase > 1) {
        p.phase -= 1
        p.driftAngle = Math.random() * Math.PI * 2
      }

      const progress = p.phase
      const y = -progress * height

      // 锥形扩散：越往下越宽
      const spread = progress * p.drift
      const x = Math.cos(p.driftAngle) * spread
      const z = Math.sin(p.driftAngle) * spread

      // 轻微湍流
      const turbX = Math.sin(progress * 6 + p.driftAngle) * 0.04
      const turbZ = Math.cos(progress * 4 + p.driftAngle * 2) * 0.04

      positions[i * 3] = x + turbX
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z + turbZ
    }

    posAttr.needsUpdate = true
  })

  return (
    <group position={position}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute args={[positionArray, 3]} attach="attributes-position" />
        </bufferGeometry>
        <pointsMaterial
          color="#b8d4f0"
          depthWrite={false}
          opacity={0}
          size={0.06}
          sizeAttenuation
          transparent
        />
      </points>
    </group>
  )
}
