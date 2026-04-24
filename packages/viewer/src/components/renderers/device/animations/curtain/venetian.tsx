'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

import type { CurtainCommonProps } from './side-open'

interface VenetianProps extends CurtainCommonProps {
  /** 叶片角度 0°=平放遮光，90°=垂直透光 */
  slatAngleDeg?: number
}

const SLAT_HEIGHT = 0.025      // 每片叶片高度 2.5cm
const SLAT_THICKNESS = 0.004   // 叶片厚度 4mm
const SLAT_GAP = 0.003         // 关闭时叶片间隙 3mm

/**
 * 百叶窗 — 多片水平叶片升降 + 角度旋转
 * openPct=0 → 放下（叶片覆盖整个窗户）
 * openPct=100 → 收起（叶片堆到顶部）
 * slatAngleDeg: 叶片绕自身 X 轴旋转角（水平轴）
 */
export const VenetianBlind = ({ width, height, layerZ, openPct, slatAngleDeg = 0, material }: VenetianProps) => {
  const groupRef = useRef<THREE.Group>(null)
  const curFrac = useRef(1)
  const curAngle = useRef(0)

  // 百叶窗装窗框内，宽度比窗户略小 2cm
  const actualW = width - 0.02
  const style = material === 'sheer'
    ? { color: '#e0dcd0', opacity: 0.9, metalness: 0.0 }
    : { color: '#d8d2c4', opacity: 1.0, metalness: 0.15 }

  // 叶片总数（覆盖整个高度）
  const slatSpacing = SLAT_HEIGHT + SLAT_GAP
  const slatCount = Math.floor((height - 0.05) / slatSpacing)

  useFrame((_, delta) => {
    const target = 1 - openPct / 100   // 0=收起顶部，1=完全放下覆盖窗
    const alpha = 1 - Math.exp(-delta * 4)
    curFrac.current = THREE.MathUtils.lerp(curFrac.current, target, alpha)

    const targetAngle = (slatAngleDeg * Math.PI) / 180
    curAngle.current = THREE.MathUtils.lerp(curAngle.current, targetAngle, alpha)

    const frac = curFrac.current
    const angle = curAngle.current

    if (!groupRef.current) return
    const children = groupRef.current.children
    for (let i = 0; i < slatCount; i++) {
      const slat = children[i] as THREE.Mesh | undefined
      if (!slat) continue
      // 关闭时叶片 i 的 y 位置（从顶部往下排列）
      // i=0 最顶部，i=n-1 最底部
      const closedY = height / 2 - 0.025 - i * slatSpacing
      // 打开时：所有叶片堆在顶部（紧贴）
      const openY = height / 2 - 0.025 - i * SLAT_THICKNESS * 1.2
      slat.position.y = THREE.MathUtils.lerp(openY, closedY, frac)
      // 每片独立绕 X 轴旋转（只在完全放下时角度有效）
      slat.rotation.x = angle * frac
    }
  })

  return (
    <group position={[0, 0, layerZ]}>
      {/* 顶部轨道 */}
      <mesh position={[0, height / 2 + 0.005, 0]}>
        <boxGeometry args={[actualW + 0.02, 0.02, 0.03]} />
        <meshStandardMaterial color="#6f6b65" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* 叶片组 */}
      <group ref={groupRef}>
        {Array.from({ length: slatCount }).map((_, i) => (
          <mesh key={i}>
            <boxGeometry args={[actualW, SLAT_HEIGHT, SLAT_THICKNESS]} />
            <meshStandardMaterial
              color={style.color}
              transparent={material === 'sheer'}
              opacity={style.opacity}
              roughness={0.5}
              metalness={style.metalness}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
      {/* 拉绳（装饰线） */}
      <mesh position={[actualW / 2 - 0.02, 0, 0.01]}>
        <cylinderGeometry args={[0.002, 0.002, height * 0.9, 6]} />
        <meshStandardMaterial color="#4a4642" />
      </mesh>
    </group>
  )
}
