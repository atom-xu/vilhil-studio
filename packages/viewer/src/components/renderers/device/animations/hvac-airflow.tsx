'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

export type HvacMode = 'cold' | 'hot' | 'off'

interface HvacAirflowProps {
  position: [number, number, number]
  /** 冷/热/关 */
  mode?: HvacMode
  /** 0 = 关闭（渐隐），1 = 全速运行 */
  intensity?: number
  /** 出风口离地高度（m），粒子下落到地面消失 */
  height?: number
}

const PARTICLE_COUNT = 160

/** 冷风 / 热风 配色 */
function getColorForMode(mode: HvacMode): string {
  if (mode === 'hot') return '#f0a888'
  if (mode === 'cold') return '#a8c8e8'
  return '#c8c8c8'   // off 时灰色
}

/**
 * HVAC 吸顶 4 向出风口气流 —— 粒子从天花板向 4 个主方向扩散下落
 * 配合 vent-4way 设备。支持 mode=cold/hot 切换配色，mode=off 渐隐。
 */
export const HvacAirflow = ({
  position,
  mode = 'cold',
  intensity = 1,
  height = 2.5,
}: HvacAirflowProps) => {
  const pointsRef = useRef<THREE.Points>(null)
  const currentIntensity = useRef(0)
  const currentColor = useRef(new THREE.Color(getColorForMode(mode)))
  const targetColor = useMemo(() => new THREE.Color(getColorForMode(mode)), [mode])

  // 粒子初始数据：4 个主方向（东南西北）+ 每方向多粒子
  const { particles, positionArray } = useMemo(() => {
    const pts: Array<{
      phase: number
      speed: number
      drift: number
      driftAngle: number
    }> = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // 4 方向 + 每方向 ±30° 扇形散布
      const dirIdx = i % 4
      const baseAngle = dirIdx * (Math.PI / 2)
      const jitter = (Math.random() - 0.5) * (Math.PI / 3)   // ±30°
      pts.push({
        phase: Math.random(),
        speed: 0.18 + Math.random() * 0.15,
        drift: 0.4 + Math.random() * 0.8,
        driftAngle: baseAngle + jitter,
      })
    }
    const arr = new Float32Array(PARTICLE_COUNT * 3)
    return { particles: pts, positionArray: arr }
  }, [])

  useFrame((_, dt) => {
    const points = pointsRef.current
    if (!points) return

    // 强度平滑插值（mode='off' 视为 intensity=0）
    const targetIntensity = mode === 'off' ? 0 : intensity
    currentIntensity.current += (targetIntensity - currentIntensity.current) * Math.min(dt * 4, 1)
    const eff = currentIntensity.current

    // 颜色平滑插值（lerp rgb）
    currentColor.current.lerp(targetColor, Math.min(dt * 3, 1))
    const mat = points.material as THREE.PointsMaterial
    mat.color.copy(currentColor.current)
    mat.opacity = eff * 0.45

    if (eff < 0.005) return

    const posAttr = points.geometry.attributes.position
    if (!posAttr) return
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]!
      p.phase += dt * p.speed
      if (p.phase > 1) {
        p.phase -= 1
        // 重新分配方向但保持 4 主方向的引力
        const dirIdx = i % 4
        const baseAngle = dirIdx * (Math.PI / 2)
        p.driftAngle = baseAngle + (Math.random() - 0.5) * (Math.PI / 3)
      }
      const progress = p.phase
      const y = -progress * height

      const spread = progress * p.drift
      const x = Math.cos(p.driftAngle) * spread
      const z = Math.sin(p.driftAngle) * spread

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
          depthWrite={false}
          opacity={0}
          size={0.07}
          sizeAttenuation
          transparent
        />
      </points>
    </group>
  )
}
