'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

/**
 * 对开窗帘 — 左右两片对开，带多薄片褶皱 + 风微摆
 *
 * 局部坐标系（由 CurtainContainer 旋转后）：
 *   +X = 沿墙方向（窗户宽度方向）
 *   +Y = 上
 *   +Z = 室内方向（距墙）
 *
 * openPct: 0 = 完全关闭，100 = 完全打开
 */
export interface CurtainCommonProps {
  width: number           // 窗户宽度
  height: number          // 窗户高度
  layerZ: number          // 本层 z 偏移（距窗户平面，朝室内）
  openPct: number         // 0-100
  material?: 'blackout' | 'sheer'  // 布帘 vs 纱帘
}

const SLICES_PER_SIDE = 10   // 每侧多薄片数，撑起褶皱视觉
const FABRIC_THICKNESS = 0.015

function getMaterialStyle(material: CurtainCommonProps['material']) {
  if (material === 'sheer') {
    return { color: '#f2ede0', opacity: 0.35, roughness: 0.95, metalness: 0 }
  }
  return { color: '#a89878', opacity: 0.92, roughness: 0.85, metalness: 0 }
}

export const SideOpenCurtain = ({ width, height, layerZ, openPct, material }: CurtainCommonProps) => {
  const leftGroup = useRef<THREE.Group>(null)
  const rightGroup = useRef<THREE.Group>(null)
  const curFrac = useRef(1)   // 当前"关闭度" 0-1

  // 实际宽度 = 窗宽 + 各侧 10cm 余量
  const actualW = width + 0.20
  const halfW = actualW / 2
  const sliceWidth = halfW / SLICES_PER_SIDE
  const style = getMaterialStyle(material)

  useFrame((_, delta) => {
    const targetFrac = 1 - openPct / 100  // 0=开，1=关
    const alpha = 1 - Math.exp(-delta * 4)
    curFrac.current = THREE.MathUtils.lerp(curFrac.current, targetFrac, alpha)
    const frac = curFrac.current

    // 每片的位置和飘动
    const t = performance.now() / 1000

    const applySide = (group: THREE.Group | null, sign: 1 | -1) => {
      if (!group) return
      for (let i = 0; i < SLICES_PER_SIDE; i++) {
        const slice = group.children[i] as THREE.Mesh | undefined
        if (!slice) continue
        // 此片在"完全关闭"时的 x 位置（从外端向中心分布）
        // sign=-1 (left), slice i=0 在最左端
        // sign=+1 (right), slice i=0 在最右端
        const closedX = sign * (halfW - (i + 0.5) * sliceWidth)
        // 完全打开时，所有片堆在最外端
        const openX = sign * (halfW - sliceWidth * 0.5)
        const x = THREE.MathUtils.lerp(openX, closedX, frac)

        // 飘动 ±25mm，频率随片 i 差异化，错落感
        const flutter = Math.sin(t * 2.0 + i * 0.5 + sign * 0.7) * 0.025 * frac
        slice.position.x = x
        slice.position.z = flutter
      }
    }

    applySide(leftGroup.current, -1)
    applySide(rightGroup.current, +1)
  })

  return (
    <group position={[0, 0, layerZ]}>
      {/* 左侧 */}
      <group ref={leftGroup}>
        {Array.from({ length: SLICES_PER_SIDE }).map((_, i) => (
          <mesh key={i}>
            <boxGeometry args={[sliceWidth * 0.94, height, FABRIC_THICKNESS]} />
            <meshStandardMaterial
              color={style.color}
              transparent
              opacity={style.opacity}
              roughness={style.roughness}
              metalness={style.metalness}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
      {/* 右侧 */}
      <group ref={rightGroup}>
        {Array.from({ length: SLICES_PER_SIDE }).map((_, i) => (
          <mesh key={i}>
            <boxGeometry args={[sliceWidth * 0.94, height, FABRIC_THICKNESS]} />
            <meshStandardMaterial
              color={style.color}
              transparent
              opacity={style.opacity}
              roughness={style.roughness}
              metalness={style.metalness}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}
