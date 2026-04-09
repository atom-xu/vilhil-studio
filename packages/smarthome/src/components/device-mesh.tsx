/**
 * 智能设备 3D 组件 - 核心 Mesh 渲染器
 *
 * 职责：将 DeviceModelDefinition 转换为 Three.js 对象
 * 不涉及状态管理，纯渲染逻辑
 */

import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import type { DeviceModelDefinition, DeviceVisualState, ModelPart } from '../models/core/types'
import { getOrCreateMaterial, createMaterial } from '../models/core/materials'

interface DeviceMeshProps {
  definition: DeviceModelDefinition
  state?: DeviceVisualState
  onPartCreated?: (name: string, mesh: THREE.Mesh) => void
}

/**
 * 创建设备部件 Mesh
 */
function createPartMesh(part: ModelPart): THREE.Mesh {
  const geometry = typeof part.geometry === 'function'
    ? part.geometry({ width: 0.1, height: 0.1, depth: 0.1 })
    : part.geometry

  const material = getOrCreateMaterial(part.material)
  const mesh = new THREE.Mesh(geometry, material)

  // 应用变换
  if (part.position) {
    mesh.position.set(...part.position)
  }
  if (part.rotation) {
    mesh.rotation.set(...part.rotation)
  }
  if (part.scale) {
    mesh.scale.set(...part.scale)
  }

  mesh.name = part.name
  mesh.castShadow = true
  mesh.receiveShadow = true

  return mesh
}

/**
 * 更新部件视觉状态
 */
function updatePartState(
  mesh: THREE.Mesh,
  part: ModelPart,
  state: DeviceVisualState
): void {
  if (!part.animated || !part.animationProperty) return

  const material = mesh.material as THREE.MeshStandardMaterial

  switch (part.animationProperty) {
    case 'material.emissiveIntensity':
      if (state.on !== undefined) {
        const baseIntensity = part.material.emissiveIntensity || 0.5
        const targetIntensity = state.on ? baseIntensity : 0
        // 使用 lerp 实现平滑过渡
        material.emissiveIntensity = THREE.MathUtils.lerp(
          material.emissiveIntensity,
          targetIntensity,
          0.2
        )
      }

      // 亮度映射
      if (state.brightness !== undefined && state.on) {
        const brightnessFactor = state.brightness / 100
        material.emissiveIntensity = (part.material.emissiveIntensity || 0.5) * brightnessFactor
      }
      break

    case 'position':
      // 按钮按下效果
      if (part.position) {
        const baseZ = part.position[2]
        const pressedZ = baseZ - 0.002
        const targetZ = state.on ? pressedZ : baseZ
        mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, targetZ, 0.3)
      }
      break

    case 'rotation':
      // 旋钮旋转
      if (state.brightness !== undefined) {
        const angle = (state.brightness / 100) * Math.PI * 2
        mesh.rotation.y = angle
      }
      break

    case 'scale':
      // 缩放动画
      if (state.on !== undefined) {
        const baseScale = part.scale || [1, 1, 1]
        const targetScale = state.on ? baseScale : [baseScale[0] * 0.9, baseScale[1] * 0.9, baseScale[2] * 0.9]
        mesh.scale.lerp(new THREE.Vector3(...targetScale), 0.2)
      }
      break
  }
}

/**
 * 设备 Mesh 组件
 *
 * 使用方式：
 * <DeviceMesh
 *   definition={downlightModel}
 *   state={{ on: true, brightness: 80 }}
 *   onPartCreated={(name, mesh) => console.log(name, mesh)}
 * />
 */
export function DeviceMesh({ definition, state, onPartCreated }: DeviceMeshProps) {
  const groupRef = useRef<THREE.Group>(null)
  const partsRef = useRef<Map<string, THREE.Mesh>>(new Map())

  // 创建所有部件（只执行一次）
  const parts = useMemo(() => {
    return definition.parts.map(part => {
      const mesh = createPartMesh(part)
      partsRef.current.set(part.name, mesh)
      onPartCreated?.(part.name, mesh)
      return { part, mesh }
    })
  }, [definition])

  // 状态更新
  useEffect(() => {
    if (!state) return

    parts.forEach(({ part, mesh }) => {
      updatePartState(mesh, part, state)
    })
  }, [state, parts])

  return (
    <group ref={groupRef}>
      {parts.map(({ part, mesh }) => (
        <primitive key={part.name} object={mesh} />
      ))}
    </group>
  )
}

/**
 * 设备选择高亮效果
 */
export function DeviceSelectionHighlight({
  selected,
  color = '#2D7FF9'
}: {
  selected: boolean
  color?: string
}) {
  if (!selected) return null

  return (
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[0.12, 0.12, 0.12]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.2}
        wireframe
      />
    </mesh>
  )
}

/**
 * 设备覆盖范围可视化
 */
export function DeviceCoverage({
  definition,
  visible = false
}: {
  definition: DeviceModelDefinition
  visible?: boolean
}) {
  if (!visible || !definition.coverage) return null

  const { coverage } = definition

  return (
    <group visible={visible}>
      {coverage.type === 'sphere' && (
        <mesh>
          <sphereGeometry args={[coverage.radius, 32, 16]} />
          <meshBasicMaterial
            color={coverage.color}
            transparent
            opacity={coverage.opacity}
            depthWrite={false}
          />
        </mesh>
      )}

      {coverage.type === 'cone' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry
            args={[
              coverage.radius * Math.tan((coverage.angle || 90) * Math.PI / 360),
              coverage.radius,
              32,
              1,
              true
            ]}
          />
          <meshBasicMaterial
            color={coverage.color}
            transparent
            opacity={coverage.opacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {coverage.type === 'cylinder' && (
        <mesh>
          <cylinderGeometry
            args={[coverage.radius, coverage.radius, coverage.height || 3, 32]}
          />
          <meshBasicMaterial
            color={coverage.color}
            transparent
            opacity={coverage.opacity}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
