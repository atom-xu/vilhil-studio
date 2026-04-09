/**
 * 设备交互区域组件
 *
 * 在设备周围创建更大的点击/悬停检测区域
 * 解决小设备难以点击的问题
 */

import { useRef } from 'react'
import * as THREE from 'three'

interface DeviceInteractionZoneProps {
  /** 交互区域大小 */
  size?: [number, number, number]
  /** 可见性（调试用） */
  visible?: boolean
  /** 点击回调 */
  onClick?: () => void
  /** 悬停回调 */
  onHover?: (hovered: boolean) => void
  children: React.ReactNode
}

/**
 * 设备交互区域
 *
 * 包裹设备，提供更大的点击目标
 */
export function DeviceInteractionZone({
  size = [0.2, 0.2, 0.2],
  visible = false,
  onClick,
  onHover,
  children
}: DeviceInteractionZoneProps) {
  const zoneRef = useRef<THREE.Mesh>(null!)

  return (
    <group>
      {/* 交互检测区域 */}
      <mesh
        ref={zoneRef}
        visible={visible}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
        onPointerEnter={() => onHover?.(true)}
        onPointerLeave={() => onHover?.(false)}
      >
        <boxGeometry args={size} />
        <meshBasicMaterial
          color="#2D7FF9"
          transparent
          opacity={0.1}
          wireframe={!visible}
        />
      </mesh>

      {/* 实际设备 */}
      {children}
    </group>
  )
}

/**
 * 设备悬停提示
 */
export function DeviceHoverTooltip({
  text,
  visible,
  position = [0, 0.15, 0]
}: {
  text: string
  visible: boolean
  position?: [number, number, number]
}) {
  if (!visible) return null

  return (
    <group position={position}>
      {/* 背景板 */}
      <mesh>
        <planeGeometry args={[0.12, 0.04]} />
        <meshBasicMaterial color="#1a1a1a" transparent opacity={0.9} />
      </mesh>

      {/* 文字使用 @react-three/drei 的 Text 组件 */}
      {/* 这里简化处理，实际项目中使用 Text */}
    </group>
  )
}

/**
 * 设备操作菜单（3D空间）
 */
export function DeviceActionMenu({
  visible,
  actions,
  onSelect
}: {
  visible: boolean
  actions: Array<{ id: string; label: string; icon?: string }>
  onSelect: (id: string) => void
}) {
  if (!visible) return null

  return (
    <group position={[0, 0.2, 0]}>
      {actions.map((action, index) => {
        const angle = (index / actions.length) * Math.PI * 2
        const radius = 0.08
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius

        return (
          <mesh
            key={action.id}
            position={[x, 0, z]}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(action.id)
            }}
          >
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshStandardMaterial color="#2D7FF9" />
          </mesh>
        )
      })}
    </group>
  )
}
