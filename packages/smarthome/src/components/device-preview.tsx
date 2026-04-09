/**
 * 设备预览组件
 *
 * 用于放置时的预览效果
 */

import * as THREE from 'three'
import type { DeviceModelDefinition } from '../models/core/types'
import { DeviceMesh } from './device-mesh'

interface DevicePreviewProps {
  definition: DeviceModelDefinition
  valid?: boolean
  rotation?: number
}

/**
 * 设备放置预览
 *
 * 半透明 + 呼吸效果，表示预览状态
 */
export function DevicePreview({
  definition,
  valid = true,
  rotation = 0
}: DevicePreviewProps) {
  const color = valid ? '#22c55e' : '#ef4444'

  return (
    <group rotation={[0, rotation, 0]}>
      {/* 预览模型 - 半透明 */}
      <group scale={[0.95, 0.95, 0.95]}>
        <DeviceMesh
          definition={definition}
          onPartCreated={(name, mesh) => {
            // 让所有材质半透明
            const material = mesh.material as THREE.MeshStandardMaterial
            material.transparent = true
            material.opacity = 0.5
          }}
        />
      </group>

      {/* 状态指示 */}
      <mesh position={[0, definition.dimensions[1] / 2 + 0.05, 0]}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* 方向指示器 */}
      {valid && (
        <mesh position={[0.08, 0, 0]}>
          <boxGeometry args={[0.04, 0.005, 0.005]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}

      {/* 无效时的警告框 */}
      {!valid && (
        <mesh>
          <boxGeometry
            args={[
              definition.dimensions[0] * 1.1,
              definition.dimensions[1] * 1.1,
              definition.dimensions[2] * 1.1
            ]}
          />
          <meshBasicMaterial
            color="#ef4444"
            transparent
            opacity={0.1}
            wireframe
          />
        </mesh>
      )}
    </group>
  )
}

/**
 * 放置光标
 *
 * 跟随鼠标/触摸位置
 */
export function DeviceCursor({
  visible,
  valid,
  snapping
}: {
  visible: boolean
  valid: boolean
  snapping?: boolean
}) {
  if (!visible) return null

  return (
    <group>
      {/* 主光标 */}
      <mesh>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial
          color={valid ? (snapping ? '#22c55e' : '#3b82f6') : '#ef4444'}
        />
      </mesh>

      {/* 地面投影 */}
      <mesh position={[0, -0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.02, 0.025, 32]} />
        <meshBasicMaterial
          color={valid ? '#22c55e' : '#ef4444'}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* 网格吸附指示 */}
      {snapping && (
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <gridHelper
            args={[0.1, 2, '#22c55e', '#22c55e']}
          />
        </mesh>
      )}
    </group>
  )
}

/**
 * 放置辅助线
 *
 * 显示高度参考线
 */
export function PlacementGuides({
  height,
  visible
}: {
  height: number
  visible: boolean
}) {
  if (!visible) return null

  return (
    <group>
      {/* 高度线 */}
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.001, 0.001, height, 8]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.5} />
      </mesh>

      {/* 地面标记 */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.05, 32]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.2}
        />
      </mesh>
    </group>
  )
}

/**
 * 碰撞检测预览
 *
 * 显示与其他物体的碰撞关系
 */
export function CollisionPreview({
  collisions,
  visible
}: {
  collisions: Array<{ id: string; position: [number, number, number] }>
  visible: boolean
}) {
  if (!visible || collisions.length === 0) return null

  return (
    <group>
      {collisions.map((collision) => (
        <mesh key={collision.id} position={collision.position}>
          <sphereGeometry args={[0.02, 16, 16]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
      ))}
    </group>
  )
}
