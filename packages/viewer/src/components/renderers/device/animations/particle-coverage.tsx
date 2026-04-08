'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSubsystemColor } from '@vilhil/smarthome'

interface ParticleCoverageProps {
  radius: number
  color?: string
  particleCount?: number
  position?: [number, number, number]
}

/**
 * 粒子覆盖云 - 无硬边界，自然消散
 * 用于WiFi AP和传感器覆盖范围可视化
 */
export const ParticleCoverage = ({
  radius,
  color,
  particleCount = 300,
  position = [0, 0, 0],
}: ParticleCoverageProps) => {
  const pointsRef = useRef<THREE.Points>(null)

  const particles = useMemo(() => {
    const pts: Array<{ x: number; y: number; z: number; phase: number; speed: number; baseR: number }> = []
    for (let i = 0; i < particleCount; i++) {
      const rNorm = Math.pow(Math.random(), 0.4)
      const angle = Math.random() * Math.PI * 2
      const x = Math.cos(angle) * radius * rNorm
      const z = Math.sin(angle) * radius * rNorm
      const y = 0.01 + Math.random() * 0.02

      pts.push({
        x,
        y,
        z,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.4,
        baseR: rNorm,
      })
    }
    return pts
  }, [radius, particleCount])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    const t = clock.getElapsedTime()
    const posAttr = pointsRef.current.geometry.attributes.position
    const opacityAttr = pointsRef.current.geometry.attributes.opacity
    if (!posAttr || !opacityAttr) return

    const positions = posAttr.array as Float32Array
    const opacities = opacityAttr.array as Float32Array

    for (let i = 0; i < particleCount; i++) {
      const p = particles[i]!
      const expand = Math.sin(t * 0.5 + p.phase) * 0.05
      const r = p.baseR * radius + expand
      const angle = Math.atan2(p.z, p.x) + t * 0.05 * p.speed

      positions[i * 3] = Math.cos(angle) * r
      positions[i * 3 + 1] = p.y + Math.sin(t * p.speed + p.phase) * 0.005
      positions[i * 3 + 2] = Math.sin(angle) * r

      const edgeFade = 1 - Math.pow(p.baseR, 2)
      const pulse = 0.4 + Math.sin(t * p.speed + p.phase) * 0.3
      opacities[i] = edgeFade * pulse * 0.5
    }

    posAttr.needsUpdate = true
    opacityAttr.needsUpdate = true
  })

  const positionArray = useMemo(() => new Float32Array(particles.flatMap((p) => [p.x, p.y, p.z])), [particles])
  const opacityArray = useMemo(() => new Float32Array(particleCount).fill(0), [particleCount])

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionArray, 3]} />
        <bufferAttribute attach="attributes-opacity" args={[opacityArray, 1]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.14} transparent depthWrite={false} sizeAttenuation />
    </points>
  )
}

interface PIRParticleConeProps {
  radius: number
  height?: number
  color?: string
  position?: [number, number, number]
}

/**
 * PIR 粒子检测云 - 110° 锥形粒子云，无硬边
 */
export const PIRParticleCone = ({
  radius,
  height = 2.6,
  color,
  position = [0, 0, 0],
}: PIRParticleConeProps) => {
  const pointsRef = useRef<THREE.Points>(null)
  const PARTICLE_COUNT = 350

  const { particles, coneHeight } = useMemo(() => {
    const r = radius * 0.9
    const angleRad = (55 * Math.PI) / 180
    const coneH = r / Math.tan(angleRad)

    const pts: Array<{ x: number; y: number; z: number; phase: number; speed: number; hNorm: number; rNorm: number }> = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const hNorm = Math.pow(Math.random(), 0.8)
      const hPos = hNorm * coneH
      const currentR = (r * (coneH - hPos)) / coneH

      const rNorm = Math.pow(Math.random(), 0.5)
      const angle = Math.random() * Math.PI * 2
      const x = Math.cos(angle) * currentR * rNorm
      const z = Math.sin(angle) * currentR * rNorm

      pts.push({
        x,
        y: -hPos,
        z,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.5,
        hNorm,
        rNorm,
      })
    }
    return { particles: pts, coneHeight: coneH }
  }, [radius])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    const t = clock.getElapsedTime()
    const posAttr = pointsRef.current.geometry.attributes.position
    const opacityAttr = pointsRef.current.geometry.attributes.opacity
    if (!posAttr || !opacityAttr) return

    const positions = posAttr.array as Float32Array
    const opacities = opacityAttr.array as Float32Array

    const scanPos = (t * 0.3) % 1

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]!
      const float = Math.sin(t * p.speed + p.phase) * 0.015
      positions[i * 3] = p.x + Math.sin(t * 0.3 + p.phase) * 0.01
      positions[i * 3 + 1] = p.y + float
      positions[i * 3 + 2] = p.z + Math.cos(t * 0.2 + p.phase) * 0.01

      const edgeFade = (1 - p.rNorm) * (1 - p.hNorm * 0.3)
      const scanDist = Math.abs(p.hNorm - scanPos)
      const scanGlow = scanDist < 0.15 ? (1 - scanDist / 0.15) * 0.5 : 0

      const pulse = 0.3 + Math.sin(t * 2 + p.phase) * 0.2
      opacities[i] = (edgeFade * pulse + scanGlow) * 0.6
    }

    posAttr.needsUpdate = true
    opacityAttr.needsUpdate = true
  })

  const positionArray = useMemo(() => new Float32Array(particles.flatMap((p) => [p.x, p.y, p.z])), [particles])
  const opacityArray = useMemo(() => new Float32Array(PARTICLE_COUNT).fill(0), [])

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionArray, 3]} />
        <bufferAttribute attach="attributes-opacity" args={[opacityArray, 1]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.12} transparent depthWrite={false} sizeAttenuation />
    </points>
  )
}

interface APCoverageProps {
  radius: number
  position?: [number, number, number]
}

export const APCoverage = ({ radius, position = [0, 0, 0] }: APCoverageProps) => {
  const color = getSubsystemColor('network')
  return (
    <group>
      <ParticleCoverage radius={radius} color={color} particleCount={200} position={position} />
    </group>
  )
}

interface PIRCoverageProps {
  radius: number
  position?: [number, number, number]
}

export const PIRCoverage = ({ radius, position = [0, 0, 0] }: PIRCoverageProps) => {
  const color = getSubsystemColor('sensor')
  return (
    <group>
      <ParticleCoverage radius={radius} color={color} particleCount={120} position={position} />
      <PIRParticleCone radius={radius} color={color} position={position} />
    </group>
  )
}
