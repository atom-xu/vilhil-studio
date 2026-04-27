'use client'

import type { DeviceNode } from '@pascal-app/core'
import { useMemo } from 'react'
import * as THREE from 'three'
import { getSubsystemColor } from '@vilhil/smarthome'

/**
 * EditorDeviceIndicator —— 编辑页专用的 2D 平面示意
 *
 * 设计原则（2026-04-22 / 2026-04-25 复议）：
 *   编辑页 = 建模工具（SketchUp 风格），只做位置/朝向的快速编辑，**0 个 3D 效果**。
 *   摄像头 FOV 扇形、AP 热力盘、PIR 覆盖圈这些"展示型"可视化全部下放到
 *   2D 平面图 + 3D 演示页；编辑页保持纯净，所有设备统一一颗扁圆色点。
 *
 * 唯一例外：灯带（params.path 多点折线）—— 这是设备**真实几何**而不是特效，
 * 沿地面画一条简易折线方便选择和位置感知。
 *
 * 所有示意投影到 floor plane（y = 0.02，避免 z-fighting），和设备在 y 轴
 * 上的真实挂点解耦。注意：组件在一个已经被 DeviceRenderer 平移到
 * node.position 的 group 里，y 要拉回地面用 `-node.position[1]` 补偿。
 */

interface EditorDeviceIndicatorProps {
  node: DeviceNode
}

const FLOOR_Y_OFFSET = 0.02

export const EditorDeviceIndicator = ({ node }: EditorDeviceIndicatorProps) => {
  // 把地面示意从设备所在高度拉回地面（父 group 已经在 node.position）
  const floorY = FLOOR_Y_OFFSET - node.position[1]

  // 灯带：画 path 折线（这是真实几何，不是特效）
  if (node.subsystem === 'lighting') {
    const path = (node.params as { path?: Array<[number, number]> } | undefined)?.path
    if (Array.isArray(path) && path.length >= 2) {
      // path 是 plan 绝对坐标，父 group 已平移到 node.position，转成局部坐标
      const x0 = node.position[0]
      const z0 = node.position[2]
      const localPath: Array<[number, number]> = path.map((p) => [p[0] - x0, p[1] - z0])
      return (
        <StripPolyline
          color={getSubsystemColor('lighting')}
          floorY={floorY}
          path={localPath}
        />
      )
    }
  }

  // 其它一律一颗子系统色 PinDot —— 不再画 FOV 扇形、热力盘、覆盖圈
  return <PinDot floorY={floorY} color={getSubsystemColor(node.subsystem)} />
}

// ═══════════════════════════════════════════════════════════════
// 2D 子组件 —— 编辑器统一只用 PinDot / StripPolyline。
// 摄像头 FOV 扇形、AP 热力盘、PIR 覆盖圈等"演示型"可视化已下放到
// 2D 平面图层（floorplan-panel.tsx）+ 3D 演示页（DeviceEffects），
// 编辑器保持 SketchUp 风格的纯净。
// ═══════════════════════════════════════════════════════════════

interface PinDotProps {
  floorY: number
  color: string
}

const PinDot = ({ floorY, color }: PinDotProps) => {
  return (
    <group position={[0, floorY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* 内圆 */}
      <mesh>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {/* 外圈 */}
      <mesh>
        <ringGeometry args={[0.11, 0.14, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

interface StripPolylineProps {
  /** 局部 [x, z] 折点（相对父 group / node.position 已经被减掉 x0,z0） */
  path: Array<[number, number]>
  floorY: number
  color: string
}

/**
 * 灯带在地面投影 —— 沿 path 画折线 + 端点小圆点。
 * 用 BufferGeometry+Line 而不是 TubeGeometry，因为这是"编辑模式 2D 示意"，
 * 要的就是轻量的几何线，不要灯带在 demo 模式下的发光圆柱。
 */
const StripPolyline = ({ path, floorY, color }: StripPolylineProps) => {
  const lineGeom = useMemo(() => {
    const pts = path.map(([x, z]) => new THREE.Vector3(x, 0, z))
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    return g
  }, [path])

  return (
    <group position={[0, floorY, 0]}>
      <line>
        <primitive attach="geometry" object={lineGeom} />
        <lineBasicMaterial color={color} transparent opacity={0.85} linewidth={2} />
      </line>
      {/* 端点圆点（首尾各一） */}
      {[path[0]!, path[path.length - 1]!].map((p, i) => (
        <mesh key={i} position={[p[0], 0, p[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.06, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
