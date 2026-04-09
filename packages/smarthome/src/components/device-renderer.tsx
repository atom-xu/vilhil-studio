/**
 * 智能设备统一渲染器
 *
 * 职责：
 * 1. 从模型库获取设备定义
 * 2. 绑定设备状态
 * 3. 渲染 3D 模型
 *
 * 注意：交互事件由父组件通过 R3F 的 onClick/onPointerOver 等处理
 */

import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import type { DeviceNode } from '@pascal-app/core'
import { useDeviceState } from '../device-state'
import { getModel } from '../models/registry'
import { DeviceMesh, DeviceSelectionHighlight, DeviceCoverage } from './device-mesh'

interface SmartDeviceRendererProps {
  node: DeviceNode
  selected?: boolean
  hovered?: boolean
  showCoverage?: boolean
  onClick?: () => void
}

/**
 * 智能设备渲染器
 *
 * 使用模型库中的程序化模型
 */
export function SmartDeviceRenderer({
  node,
  selected = false,
  hovered = false,
  showCoverage = false,
  onClick
}: SmartDeviceRendererProps) {
  const groupRef = useRef<THREE.Group>(null!)

  // 获取设备状态
  const deviceState = useDeviceState((s) => s.deviceStates[node.id])

  // 获取模型定义
  const model = useMemo(() => {
    return getModel(node.renderType as any)
  }, [node.renderType])

  // 如果没有找到模型，使用默认方块
  if (!model) {
    console.warn(`[SmartDeviceRenderer] 未找到模型: ${node.renderType}`)
    return <FallbackDevice node={node} onClick={onClick} />
  }

  return (
    <group
      ref={groupRef}
      position={node.position}
      rotation={node.rotation}
      visible={node.visible}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      {/* 设备主体 */}
      <DeviceMesh
        definition={model}
        state={deviceState}
      />

      {/* 选中高亮 */}
      {selected && <DeviceSelectionHighlight selected />}

      {/* 悬停效果 */}
      {hovered && !selected && (
        <DeviceSelectionHighlight selected color={model.thumbnailColor} />
      )}

      {/* 覆盖范围可视化 */}
      <DeviceCoverage definition={model} visible={showCoverage} />
    </group>
  )
}

/**
 * 回退设备（模型未找到时使用）
 */
function FallbackDevice({ node, onClick }: { node: DeviceNode; onClick?: () => void }) {
  const ref = useRef<THREE.Group>(null!)

  const color = useMemo(() => {
    const colors: Record<string, string> = {
      lighting: '#d4a853',
      panel: '#c8b8a0',
      sensor: '#4ade80',
      curtain: '#3dd9b6',
      hvac: '#9b7bea',
      network: '#60a5fa',
      security: '#f59e0b',
      architecture: '#94a3b8'
    }
    return colors[node.subsystem] || '#888888'
  }, [node.subsystem])

  return (
    <group
      ref={ref}
      position={node.position}
      rotation={node.rotation}
      visible={node.visible}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      <mesh>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

/**
 * 旧版设备渲染器兼容层
 * 用于平滑迁移
 */
export function DeviceRenderer({ node, onClick }: { node: DeviceNode; onClick?: () => void }) {
  return <SmartDeviceRenderer node={node} onClick={onClick} />
}
