'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

interface CurtainPanelProps {
  position: [number, number, number]
  curtainWidth?: number
  positionState?: 'open' | 'half' | 'closed'
  color?: string
}

function positionToFraction(pos?: string): number {
  if (pos === 'closed') return 1
  if (pos === 'half') return 0.5
  return 0
}

/**
 * 窗帘面板动画组件
 * 支持开合动画和帘布飘动效果
 */
export const CurtainPanel = ({
  position,
  curtainWidth = 3,
  positionState = 'open',
  color = '#c8c0b4',
}: CurtainPanelProps) => {
  const leftRef = useRef<THREE.Mesh>(null)
  const rightRef = useRef<THREE.Mesh>(null)
  const leftMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const rightMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const targetFraction = useRef(0)

  const halfW = curtainWidth / 2
  const height = 2.2

  useFrame((_, delta) => {
    targetFraction.current = positionToFraction(positionState)
    const alpha = 1 - Math.exp(-delta * 4)

    if (leftRef.current && rightRef.current) {
      const curFrac = THREE.MathUtils.lerp(
        (leftRef.current.userData.fraction as number) ?? 0,
        targetFraction.current,
        alpha
      )
      leftRef.current.userData.fraction = curFrac
      rightRef.current.userData.fraction = curFrac

      const scaleX = Math.max(0.05, curFrac)
      leftRef.current.scale.x = scaleX
      rightRef.current.scale.x = scaleX

      leftRef.current.position.x = -halfW + (halfW * scaleX) / 2
      rightRef.current.position.x = halfW - (halfW * scaleX) / 2

      const opacity = 0.12 + curFrac * 0.38
      if (leftMatRef.current) leftMatRef.current.opacity = opacity
      if (rightMatRef.current) rightMatRef.current.opacity = opacity
    }

    const t = performance.now() / 1000
    const flutter = Math.sin(t * 2.09) * 0.005
    if (leftRef.current) {
      leftRef.current.position.z = flutter
    }
    if (rightRef.current) {
      rightRef.current.position.z = flutter * 0.8
    }
  })

  return (
    <group position={[position[0], position[1] - height / 2, position[2]]}>
      {/* Left panel */}
      <mesh ref={leftRef} position={[-halfW / 2, 0, 0]}>
        <boxGeometry args={[halfW, height, 0.02]} />
        <meshStandardMaterial
          ref={leftMatRef}
          color={color}
          transparent
          opacity={0.12}
          roughness={0.85}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Right panel */}
      <mesh ref={rightRef} position={[halfW / 2, 0, 0]}>
        <boxGeometry args={[halfW, height, 0.02]} />
        <meshStandardMaterial
          ref={rightMatRef}
          color={color}
          transparent
          opacity={0.12}
          roughness={0.85}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Track rod */}
      <mesh position={[0, height / 2 + 0.03, 0]}>
        <boxGeometry args={[curtainWidth + 0.1, 0.04, 0.04]} />
        <meshStandardMaterial color="#888880" roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  )
}
