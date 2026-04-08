'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

interface LightConeProps {
  position: [number, number, number]
  isOn: boolean
  brightness?: number
  beamAngle?: number
  height?: number
}

/**
 * 粒子光锥 - 数百微粒子组成体积光，无硬边界
 * 密度随高度递减，自然消散感
 */
export const LightCone = ({
  position,
  isOn,
  brightness = 0.8,
  beamAngle = 30,
  height = 2.4,
}: LightConeProps) => {
  const pointsRef = useRef<THREE.Points>(null)
  const groundRef = useRef<THREE.Points>(null)
  const PARTICLE_COUNT = 350

  const { particles, groundParticles, radius } = useMemo(() => {
    const rad = (beamAngle * Math.PI) / 180
    const r = height * Math.tan(rad / 2)
    const pts: Array<{ x: number; y: number; z: number; phase: number; speed: number; originalY: number }> = []
    const groundPts: Array<{ x: number; y: number; z: number; phase: number }> = []

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const hNorm = Math.pow(Math.random(), 0.7)
      const h = hNorm * height
      const currentRadius = (r * (height - h)) / height

      const rNorm = Math.pow(Math.random(), 0.5)
      const angle = Math.random() * Math.PI * 2
      const x = Math.cos(angle) * currentRadius * rNorm
      const z = Math.sin(angle) * currentRadius * rNorm

      const phase = Math.random() * Math.PI * 2
      const speed = 0.5 + Math.random() * 0.5

      pts.push({ x, y: -h, z, phase, speed, originalY: -h })
    }

    for (let i = 0; i < 80; i++) {
      const rNorm = Math.pow(Math.random(), 0.6)
      const angle = Math.random() * Math.PI * 2
      const x = Math.cos(angle) * r * rNorm * 0.9
      const z = Math.sin(angle) * r * rNorm * 0.9
      const phase = Math.random() * Math.PI * 2
      groundPts.push({ x, y: 0.01, z, phase })
    }

    return { particles: pts, groundParticles: groundPts, radius: r }
  }, [beamAngle, height])

  useFrame(({ clock }) => {
    if (!isOn || !pointsRef.current || !groundRef.current) return

    const t = clock.getElapsedTime()
    const posAttr = pointsRef.current.geometry.attributes.position
    const opacityAttr = pointsRef.current.geometry.attributes.opacity
    if (!posAttr || !opacityAttr) return

    const positions = posAttr.array as Float32Array
    const opacities = opacityAttr.array as Float32Array

    const breath = 0.7 + Math.sin(t * 2) * 0.3

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]!
      const float = Math.sin(t * p.speed + p.phase) * 0.02
      positions[i * 3] = p.x + Math.sin(t * 0.5 + p.phase) * 0.01
      positions[i * 3 + 1] = p.originalY + float
      positions[i * 3 + 2] = p.z + Math.cos(t * 0.3 + p.phase) * 0.01

      const heightFade = 1 - (Math.abs(p.originalY) / height) * 0.5
      const individual = 0.5 + Math.sin(t * 2 + p.phase) * 0.5
      opacities[i] = heightFade * individual * breath * brightness * 0.6
    }

    posAttr.needsUpdate = true
    opacityAttr.needsUpdate = true

    const groundOpacityAttr = groundRef.current.geometry.attributes.opacity
    if (!groundOpacityAttr) return
    const groundOpacities = groundOpacityAttr.array as Float32Array
    for (let i = 0; i < groundParticles.length; i++) {
      const p = groundParticles[i]!
      const flicker = 0.3 + Math.sin(t * 3 + p.phase) * 0.2 + Math.sin(t * 7 + p.phase) * 0.1
      groundOpacities[i] = flicker * breath * brightness * 0.5
    }
    groundOpacityAttr.needsUpdate = true
  })

  const particleArray = useMemo(() => new Float32Array(particles.flatMap((p) => [p.x, p.y, p.z])), [particles])
  const particleOpacityArray = useMemo(() => new Float32Array(PARTICLE_COUNT).fill(0), [])
  const groundArray = useMemo(() => new Float32Array(groundParticles.flatMap((p) => [p.x, p.y, p.z])), [groundParticles])
  const groundOpacityArray = useMemo(() => new Float32Array(groundParticles.length).fill(0), [groundParticles.length])

  return (
    <group position={position}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particleArray, 3]} />
          <bufferAttribute attach="attributes-opacity" args={[particleOpacityArray, 1]} />
        </bufferGeometry>
        <pointsMaterial color="#fff8d0" size={0.12} transparent depthWrite={false} sizeAttenuation />
      </points>

      <points ref={groundRef} position={[0, -height + 0.01, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[groundArray, 3]} />
          <bufferAttribute attach="attributes-opacity" args={[groundOpacityArray, 1]} />
        </bufferGeometry>
        <pointsMaterial color="#fff0b0" size={0.15} transparent depthWrite={false} sizeAttenuation />
      </points>
    </group>
  )
}
