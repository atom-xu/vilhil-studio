'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

import type { CurtainCommonProps } from './side-open'

/**
 * 卷帘 — 从顶部一整片展开到底
 * openPct=0 → 完全展开（遮盖整个窗户）
 * openPct=100 → 完全卷起（只剩顶部卷轴）
 */
export const RollerCurtain = ({ width, height, layerZ, openPct, material }: CurtainCommonProps) => {
  const panelRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const curFrac = useRef(1)

  const actualW = width + 0.05   // 卷帘比窗户稍宽 5cm
  const style = material === 'sheer'
    ? { color: '#f2ede0', opacity: 0.35, roughness: 0.95 }
    : { color: '#c4b8a0', opacity: 0.94, roughness: 0.80 }

  useFrame((_, delta) => {
    const target = 1 - openPct / 100   // 0=卷起，1=全展开
    const alpha = 1 - Math.exp(-delta * 4)
    curFrac.current = THREE.MathUtils.lerp(curFrac.current, target, alpha)
    const frac = Math.max(0.001, curFrac.current)

    if (panelRef.current) {
      // scale.y 基于 frac（关闭 = 1 全展开，打开 = 接近 0 只剩卷轴）
      panelRef.current.scale.y = frac
      // 顶对齐：panel 的 position.y 应为 (height*frac)/2 - height/2，即从顶部向下悬挂
      panelRef.current.position.y = (height * frac) / 2 - height / 2 + height / 2
      // 等价：position.y = (height * frac) / 2，因为 group origin 在窗户中心
      // 但我们希望"顶部固定"——panel 上边缘始终在 y=+height/2，所以：
      panelRef.current.position.y = height / 2 - (height * frac) / 2
    }
  })

  return (
    <group position={[0, 0, layerZ]}>
      {/* 卷轴（顶部圆柱，装饰） */}
      <mesh position={[0, height / 2 + 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, actualW + 0.05, 16]} />
        <meshStandardMaterial color="#8a8580" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* 帘布面板 */}
      <mesh ref={panelRef}>
        <boxGeometry args={[actualW, height, 0.012]} />
        <meshStandardMaterial
          ref={matRef}
          color={style.color}
          transparent
          opacity={style.opacity}
          roughness={style.roughness}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 底杆（拉手） */}
      <mesh>
        <boxGeometry args={[actualW, 0.02, 0.015]} />
        <meshStandardMaterial color="#6b6560" roughness={0.4} metalness={0.5} />
      </mesh>
    </group>
  )
}
