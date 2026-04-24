'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

interface SpeakerWavesProps {
  /** 设备本地坐标，音波从音箱顶部发出 */
  position?: [number, number, number]
  /** 0 = 静默（渐隐），1 = 满音量 */
  intensity?: number
  /** 音量（0-100）影响波纹半径和透明度 */
  volume?: number
  /** 是否播放中 */
  playing?: boolean
  /** 颜色（默认影音子系统蓝） */
  color?: string
}

const RING_COUNT = 5

/**
 * 音箱音波环 —— 5 个同心环向外扩散
 * 每个环独立 phase 错开 0.2，形成连续波纹
 * playing=false 时渐隐到零
 */
export const SpeakerWaves = ({
  position = [0, 0, 0],
  intensity = 1,
  volume = 60,
  playing = true,
  color = '#5ba0f5',
}: SpeakerWavesProps) => {
  const ringsRef = useRef<Array<THREE.Mesh | null>>(Array(RING_COUNT).fill(null))
  const matsRef = useRef<Array<THREE.MeshBasicMaterial | null>>(Array(RING_COUNT).fill(null))
  const curIntensity = useRef(0)

  useFrame(({ clock }, dt) => {
    // 强度插值
    const target = playing ? intensity * (volume / 100) : 0
    curIntensity.current += (target - curIntensity.current) * Math.min(dt * 4, 1)
    const eff = curIntensity.current
    if (eff < 0.002) {
      for (const m of matsRef.current) {
        if (m) m.opacity = 0
      }
      return
    }

    const t = clock.getElapsedTime()
    // 每个环独立相位错开，半径 0 → maxRadius 循环
    const maxRadius = 0.8 + (volume / 100) * 0.7     // 音量越大半径越大
    const speed = 0.8 + (volume / 100) * 0.6

    for (let i = 0; i < RING_COUNT; i++) {
      const ring = ringsRef.current[i]
      const mat = matsRef.current[i]
      if (!ring || !mat) continue
      // 相位：每个环错开 1/RING_COUNT 的周期
      const phase = (t * speed + i / RING_COUNT) % 1
      const radius = phase * maxRadius
      ring.scale.setScalar(Math.max(0.05, radius))
      // 透明度：从中心 0.7 渐到外边缘 0
      const alpha = (1 - phase) * (1 - phase) * 0.6 * eff
      mat.opacity = alpha
    }
  })

  return (
    <group position={position}>
      {Array.from({ length: RING_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { ringsRef.current[i] = el }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.92, 1.00, 48]} />
          <meshBasicMaterial
            ref={(el) => { matsRef.current[i] = el as THREE.MeshBasicMaterial }}
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}
