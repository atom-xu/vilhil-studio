'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

interface ArchitectureHubProps {
  /** 设备本地坐标 */
  position?: [number, number, number]
  /** 0 = 未运行（渐隐），1 = 正常工作 */
  intensity?: number
  /** 协议颜色（KNX 黄 / IP 蓝等） */
  color?: string
}

const PARTICLE_COUNT = 80

/**
 * 架构枢纽数据流环 —— 围绕设备的水平面数据粒子环
 * 用于 KNX 网关 / 智能主机 表达"数据吞吐"的存在感
 * - 粒子在水平圆环上绕设备旋转，半径 0.3-0.5m
 * - 颜色按协议区分（KNX #d4a853 / IP #4ea8ff）
 * - intensity=0 时渐隐
 */
export const ArchitectureHub = ({
  position = [0, 0, 0],
  intensity = 1,
  color = '#d4a853',
}: ArchitectureHubProps) => {
  const pointsRef = useRef<THREE.Points>(null)
  const curIntensity = useRef(0)

  const { positionArray, particles } = useMemo(() => {
    const particles: Array<{ phase: number; speed: number; radius: number; yOffset: number }> = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.6,        // 各粒子速度差
        radius: 0.30 + Math.random() * 0.20,     // 30-50cm 半径
        yOffset: (Math.random() - 0.5) * 0.12,   // 上下 6cm 飘动
      })
    }
    const arr = new Float32Array(PARTICLE_COUNT * 3)
    return { positionArray: arr, particles }
  }, [])

  useFrame(({ clock }, dt) => {
    const points = pointsRef.current
    if (!points) return

    curIntensity.current += (intensity - curIntensity.current) * Math.min(dt * 3, 1)
    const eff = curIntensity.current
    const mat = points.material as THREE.PointsMaterial
    mat.opacity = eff * 0.55
    if (eff < 0.005) return

    const t = clock.getElapsedTime()
    const posAttr = points.geometry.attributes.position
    if (!posAttr) return
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]!
      const angle = p.phase + t * p.speed
      positions[i * 3]     = Math.cos(angle) * p.radius
      positions[i * 3 + 1] = p.yOffset + Math.sin(t * 2 + p.phase) * 0.02
      positions[i * 3 + 2] = Math.sin(angle) * p.radius
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
          color={color}
          transparent
          opacity={0}
          depthWrite={false}
          size={0.035}
          sizeAttenuation
        />
      </points>
    </group>
  )
}
