'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

import type { CurtainCommonProps } from './side-open'

const SEGMENT_COUNT = 5   // 罗马帘分 5 段折叠

/**
 * 罗马帘 — 分段折叠上升
 * openPct=0 → 完全展开（一整片）
 * openPct=100 → 全收起（段折叠堆到顶部）
 *
 * 实现：5 片 box 纵向排列，打开时上段先收，下段次之，形成"阶梯折叠"
 */
export const RomanShade = ({ width, height, layerZ, openPct, material }: CurtainCommonProps) => {
  const segmentsRef = useRef<Array<THREE.Mesh | null>>(Array(SEGMENT_COUNT).fill(null))
  const curFrac = useRef(1)

  const actualW = width + 0.05
  const segH = height / SEGMENT_COUNT
  const style = material === 'sheer'
    ? { color: '#f5f0e6', opacity: 0.40, roughness: 0.95 }
    : { color: '#b0a088', opacity: 0.96, roughness: 0.85 }

  useFrame((_, delta) => {
    const target = 1 - openPct / 100   // 0=全收，1=全展
    const alpha = 1 - Math.exp(-delta * 4)
    curFrac.current = THREE.MathUtils.lerp(curFrac.current, target, alpha)
    const frac = curFrac.current

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = segmentsRef.current[i]
      if (!seg) continue
      // 段 i 的闭合位置（从顶部往下排列，i=0 在顶部）
      const closedY = height / 2 - segH / 2 - i * segH
      // 打开时所有段堆到顶部（每段厚度 0.02m 堆叠）
      const openY = height / 2 - segH / 2 - i * 0.015
      // 每段的 scale.y：打开时压扁到 10%，关闭时完整
      const scaleY = THREE.MathUtils.lerp(0.08, 1, frac)
      seg.scale.y = scaleY
      seg.position.y = THREE.MathUtils.lerp(openY, closedY, frac)
    }
  })

  return (
    <group position={[0, 0, layerZ]}>
      {/* 顶部帘轨 */}
      <mesh position={[0, height / 2 + 0.02, 0]}>
        <boxGeometry args={[actualW + 0.05, 0.025, 0.025]} />
        <meshStandardMaterial color="#5a5652" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* 5 段帘布 */}
      {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { segmentsRef.current[i] = el }}
        >
          <boxGeometry args={[actualW, segH, 0.014]} />
          <meshStandardMaterial
            color={style.color}
            transparent
            opacity={style.opacity}
            roughness={style.roughness}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}
