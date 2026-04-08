'use client'

import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const BUS_TYPE_META: Record<string, { color: string; width: number }> = {
  knx_tp: { color: '#d4a853', width: 1.5 },
  ethernet: { color: '#5ba0f5', width: 1.2 },
}

interface DataParticleProps {
  points: THREE.Vector3[]
  color: string
  speed?: number
  delay?: number
}

/**
 * 数据流粒子 - 带拖尾轨迹
 */
const DataParticle = ({ points, color, speed = 1.2, delay = 0 }: DataParticleProps) => {
  const headRef = useRef<THREE.Mesh>(null)
  const tailRef = useRef<THREE.Points>(null)

  const totalLength = useMemo(() => {
    let len = 0
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      if (prev && curr) {
        len += curr.distanceTo(prev)
      }
    }
    return len || 1
  }, [points])

  const segLengths = useMemo(() => {
    const segs: number[] = []
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      if (prev && curr) {
        segs.push(curr.distanceTo(prev))
      }
    }
    return segs
  }, [points])

  const getPositionAt = (dist: number): THREE.Vector3 => {
    let cumulative = 0
    const first = points[0]
    let pos = first ? first.clone() : new THREE.Vector3()
    for (let i = 0; i < segLengths.length; i++) {
      const segLen = segLengths[i] ?? 0
      if (cumulative + segLen >= dist) {
        const curr = points[i]
        const next = points[i + 1]
        if (curr && next) {
          const frac = (dist - cumulative) / segLen
          pos = curr.clone().lerp(next, frac)
        }
        break
      }
      cumulative += segLen
    }
    return pos
  }

  useFrame(({ clock }) => {
    const t = ((clock.elapsedTime * speed + delay) % 1)
    const dist = t * totalLength

    if (headRef.current) {
      const pos = getPositionAt(dist)
      headRef.current.position.copy(pos)
      const mat = headRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = Math.sin(t * Math.PI) * 0.9
    }

    if (tailRef.current) {
      const tailLength = totalLength * 0.15
      const posAttr = tailRef.current.geometry.attributes.position
      const opacityAttr = tailRef.current.geometry.attributes.opacity
      if (!posAttr || !opacityAttr) return

      const positions = posAttr.array as Float32Array
      const opacities = opacityAttr.array as Float32Array

      for (let i = 0; i < 5; i++) {
        const tailDist = Math.max(0, dist - tailLength * (i / 4))
        const tailPos = getPositionAt(tailDist)
        positions[i * 3] = tailPos.x
        positions[i * 3 + 1] = tailPos.y
        positions[i * 3 + 2] = tailPos.z

        const fade = 1 - i / 4
        opacities[i] = Math.sin(t * Math.PI) * 0.6 * fade
      }

      posAttr.needsUpdate = true
      opacityAttr.needsUpdate = true
    }
  })

  const tailPosArray = useMemo(() => new Float32Array(5 * 3), [])
  const tailOpacityArray = useMemo(() => new Float32Array(5), [])

  return (
    <group>
      <points ref={tailRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[tailPosArray, 3]} />
          <bufferAttribute attach="attributes-opacity" args={[tailOpacityArray, 1]} />
        </bufferGeometry>
        <pointsMaterial color={color} size={0.1} transparent depthWrite={false} sizeAttenuation />
      </points>
      <mesh ref={headRef}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>
    </group>
  )
}

interface BusRoute {
  id: string
  type: 'knx_tp' | 'ethernet'
  path: { x: number; y: number; z: number }[]
  color?: string
}

interface BusLineProps {
  route: BusRoute
  isActive: boolean
}

const BusLine = ({ route, isActive }: BusLineProps) => {
  const meta = BUS_TYPE_META[route.type] ?? BUS_TYPE_META['knx_tp']
  if (!meta) return null

  const color = route.color ?? meta.color
  const opacity = isActive ? 0.85 : 0.12

  const points = useMemo(
    () => (route.path ?? []).map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    [route.path]
  )

  if (points.length < 2) return null

  return (
    <group>
      <Line points={points} color={color} lineWidth={meta.width} transparent opacity={opacity} />

      {isActive && (
        <>
          <Line points={points} color={color} lineWidth={meta.width * 3} transparent opacity={0.2} />
          <DataParticle points={points} color={color} speed={0.9} delay={0} />
          <DataParticle points={points} color={color} speed={0.9} delay={0.4} />
          <DataParticle points={points} color={color} speed={0.9} delay={0.75} />
        </>
      )}

      {isActive &&
        (route.path ?? []).map((p, i) =>
          'label' in p && p.label ? (
            <mesh key={i} position={[p.x, p.y, p.z]}>
              <sphereGeometry args={[0.08, 10, 10]} />
              <meshBasicMaterial color={color} />
            </mesh>
          ) : null
        )}
    </group>
  )
}

interface BusVisualizerProps {
  busRoutes: BusRoute[]
  activeSubsystem?: string | null
  activeSceneId?: string | null
}

export const BusVisualizer = ({ busRoutes, activeSubsystem, activeSceneId }: BusVisualizerProps) => {
  if (!busRoutes || busRoutes.length === 0) return null

  return (
    <group>
      {busRoutes.map((route) => {
        const isKnx = route.type === 'knx_tp'
        const isEthernet = route.type === 'ethernet'
        const isActive =
          (isKnx &&
            (activeSubsystem === 'architecture' || activeSubsystem === 'lighting' || !!activeSceneId)) ||
          (isEthernet && activeSubsystem === 'network')
        return <BusLine key={route.id} route={route} isActive={isActive} />
      })}
    </group>
  )
}
