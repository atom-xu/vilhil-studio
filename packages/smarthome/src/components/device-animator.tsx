/**
 * 设备动画控制器
 *
 * 处理设备的各种动画效果
 */

import { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { DeviceModelDefinition, AnimationType, DeviceVisualState } from '../models/core/types'

interface DeviceAnimatorProps {
  definition: DeviceModelDefinition
  state: DeviceVisualState
  children: React.ReactNode
}

/**
 * 设备动画控制器
 */
export function DeviceAnimator({ definition, state, children }: DeviceAnimatorProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const [animationState, setAnimationState] = useState({
    progress: 0,
    target: 0,
    playing: false
  })

  // 监听状态变化，触发动画
  useEffect(() => {
    if (!definition.animations) return

    // 找到匹配的动画
    const anim = definition.animations.find(a => {
      if (a.type === 'onoff' && state.on !== undefined) return true
      if (a.type === 'dim' && state.brightness !== undefined) return true
      if (a.type === 'openclose' && state.position !== undefined) return true
      return false
    })

    if (anim) {
      const target = state.on ? 1 : 0
      setAnimationState(prev => ({
        ...prev,
        target,
        playing: true
      }))
    }
  }, [state.on, state.brightness, state.position, definition.animations])

  // 动画帧更新
  useFrame((_, delta) => {
    if (!animationState.playing || !groupRef.current) return

    const speed = 2 // 动画速度
    const newProgress = THREE.MathUtils.lerp(
      animationState.progress,
      animationState.target,
      delta * speed
    )

    // 应用动画到子元素
    applyAnimation(groupRef.current, definition, newProgress)

    setAnimationState(prev => ({
      ...prev,
      progress: newProgress,
      playing: Math.abs(newProgress - animationState.target) > 0.001
    }))
  })

  return (
    <group ref={groupRef}>
      {children}
    </group>
  )
}

/**
 * 应用动画到组
 */
function applyAnimation(
  group: THREE.Group,
  definition: DeviceModelDefinition,
  progress: number
) {
  definition.parts.forEach((part, index) => {
    if (!part.animated) return

    const child = group.children[index]
    if (!child) return

    switch (part.animationProperty) {
      case 'rotation':
        // 旋钮旋转动画
        if (part.name.includes('knob')) {
          child.rotation.y = progress * Math.PI * 2
        }
        break

      case 'position':
        // 按钮按下动画
        if (part.name.includes('button')) {
          const baseZ = part.position?.[2] || 0
          child.position.z = baseZ - (progress > 0.5 ? 0.002 : 0)
        }
        break

      case 'scale':
        // 缩放动画
        const baseScale = part.scale || [1, 1, 1]
        const scale = 0.8 + progress * 0.2
        child.scale.set(
          baseScale[0] * scale,
          baseScale[1] * scale,
          baseScale[2] * scale
        )
        break
    }
  })
}

/**
 * 呼吸灯效果
 */
export function PulseEffect({
  color,
  intensity = 0.5,
  speed = 1,
  children
}: {
  color: string
  intensity?: number
  speed?: number
  children: React.ReactNode
}) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null!)

  useFrame(({ clock }) => {
    if (!materialRef.current) return

    const pulse = (Math.sin(clock.elapsedTime * speed) + 1) / 2
    materialRef.current.emissiveIntensity = intensity * (0.3 + pulse * 0.7)
  })

  return (
    <mesh>
      {children}
      <meshStandardMaterial
        ref={materialRef}
        color="#000000"
        emissive={color}
        emissiveIntensity={intensity}
      />
    </mesh>
  )
}

/**
 * 窗帘开合动画
 */
export function CurtainAnimation({
  openPercentage,
  children
}: {
  openPercentage: number
  children: React.ReactNode
}) {
  const leftPanelRef = useRef<THREE.Group>(null!)
  const rightPanelRef = useRef<THREE.Group>(null!)

  useFrame(() => {
    if (!leftPanelRef.current || !rightPanelRef.current) return

    const maxOffset = 1.5 // 最大移动距离
    const offset = (openPercentage / 100) * maxOffset

    leftPanelRef.current.position.x = -offset
    rightPanelRef.current.position.x = offset
  })

  return (
    <group>
      <group ref={leftPanelRef}>{children}</group>
      <group ref={rightPanelRef}>{children}</group>
    </group>
  )
}
