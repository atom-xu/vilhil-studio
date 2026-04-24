'use client'

import type { DeviceNode } from '@pascal-app/core'
import { useMemo } from 'react'
import * as THREE from 'three'
import { getSubsystemColor } from '@vilhil/smarthome'

/**
 * EditorDeviceIndicator —— 编辑页专用的 2D 平面示意
 *
 * 设计原则（来自用户定位，2026-04-22）：
 *   编辑页 = 建模工具（SketchUp），只做位置/朝向的快速编辑，0 个 3D 效果
 *   所有子系统都投影到地面平面上作为扁平符号
 *
 * 子系统映射：
 *   - 网络 (AP/router/switch) → 径向渐变热力盘（绿→黄→红）
 *   - 灯光 → null（只保留节点位置，不画任何视觉）
 *   - 安防摄像头 (dome/camera-bullet) → 2D 扇形（FOV + 朝向）
 *   - 传感 PIR → 小圆点 + 覆盖圈
 *   - 其他 (面板/窗帘/暖通/影音/架构) → 小色点
 *
 * 所有示意投影到 floor plane（y = 0.02，避免 z-fighting），
 * 和设备在 y 轴上的真实挂点解耦。
 *
 * 注意：这个组件在一个已经被 DeviceRenderer 放到 node.position 的 group 里。
 * 所以这里需要把 y 归零（转换到地面）：使用 -node.position[1] 补偿。
 */

interface EditorDeviceIndicatorProps {
  node: DeviceNode
}

const FLOOR_Y_OFFSET = 0.02

export const EditorDeviceIndicator = ({ node }: EditorDeviceIndicatorProps) => {
  // 把地面示意从设备所在高度拉回地面（父 group 已经在 node.position）
  const floorY = FLOOR_Y_OFFSET - node.position[1]

  switch (node.subsystem) {
    case 'lighting':
      // 灯光编辑不显示任何视觉 —— 只保留节点位置（可通过 BVH 选中）
      return null

    case 'network':
      return (
        <NetworkHeatmapDisc
          floorY={floorY}
          radius={(node.params?.coverageRadius as number | undefined) ?? 8}
        />
      )

    case 'security':
      if (node.renderType === 'dome' || node.renderType === 'camera-bullet') {
        return (
          <CameraFanIndicator
            floorY={floorY}
            fovDeg={(node.params?.coverageAngle as number | undefined) ?? 90}
            range={(node.params?.coverageRadius as number | undefined) ?? 5}
            directionDeg={(node.params?.direction as number | undefined) ?? 0}
          />
        )
      }
      // 门锁等 → 小色点
      return <PinDot floorY={floorY} color={getSubsystemColor('security')} />

    case 'sensor':
      return (
        <SensorDot
          floorY={floorY}
          color={getSubsystemColor('sensor')}
          radius={(node.params?.coverageRadius as number | undefined) ?? 4}
        />
      )

    default:
      return <PinDot floorY={floorY} color={getSubsystemColor(node.subsystem)} />
  }
}

// ═══════════════════════════════════════════════════════════════
// 2D 子组件
// ═══════════════════════════════════════════════════════════════

interface NetworkHeatmapDiscProps {
  floorY: number
  radius: number
}

/**
 * 单 AP 的平面热力：径向渐变绿→黄→橙→红
 * Shader 版本：连续、无锯齿，和 3D 热力图色阶一致
 */
const NetworkHeatmapDisc = ({ floorY, radius }: NetworkHeatmapDiscProps) => {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.45 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec2 vUv;
        vec3 heatColor(float s) {
          if(s > 0.72) return mix(vec3(.15,.75,.25), vec3(.05,.55,.20), (s-.72)/.28);
          if(s > 0.48) return mix(vec3(.95,.80,.05), vec3(.15,.75,.25), (s-.48)/.24);
          if(s > 0.26) return mix(vec3(.95,.38,.05), vec3(.95,.80,.05), (s-.26)/.22);
          if(s > 0.08) return mix(vec3(.85,.10,.15), vec3(.95,.38,.05), (s-.08)/.18);
          return vec3(.6,.05,.10);
        }
        void main() {
          vec2 d = vUv - vec2(0.5);
          float r = length(d) * 2.0;   // 0(中心) → 1(边缘)
          if (r > 1.0) discard;
          float sig = clamp(1.0 - r, 0.0, 1.0);
          vec3 col = heatColor(sig);
          float alpha = (1.0 - smoothstep(0.9, 1.0, r)) * uOpacity;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  }, [])

  return (
    <mesh position={[0, floorY, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <circleGeometry args={[radius, 64]} />
    </mesh>
  )
}

interface CameraFanIndicatorProps {
  floorY: number
  fovDeg: number
  range: number
  directionDeg: number
}

/**
 * 摄像头 2D 扇形：从设备位置向 direction 方向展开 fov 角度
 * 可作为视野示意；朝向由 params.direction 控制（未来 UI 可交互旋转）
 */
const CameraFanIndicator = ({ floorY, fovDeg, range, directionDeg }: CameraFanIndicatorProps) => {
  const geometry = useMemo(() => {
    const fovRad = (fovDeg * Math.PI) / 180
    const segments = 32
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    for (let i = 0; i <= segments; i++) {
      const a = -fovRad / 2 + (fovRad * i) / segments
      shape.lineTo(Math.cos(a) * range, Math.sin(a) * range)
    }
    shape.lineTo(0, 0)
    return new THREE.ShapeGeometry(shape)
  }, [fovDeg, range])

  const directionRad = (directionDeg * Math.PI) / 180

  return (
    <group position={[0, floorY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* 填充扇面 */}
      <mesh geometry={geometry} rotation={[0, 0, directionRad]}>
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* 边缘描线 */}
      <mesh geometry={geometry} rotation={[0, 0, directionRad]}>
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.6} depthWrite={false} wireframe />
      </mesh>
      {/* 中心点 */}
      <mesh>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  )
}

interface SensorDotProps {
  floorY: number
  color: string
  radius: number
}

const SensorDot = ({ floorY, color, radius }: SensorDotProps) => {
  return (
    <group position={[0, floorY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* 中心点 */}
      <mesh>
        <circleGeometry args={[0.1, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      {/* 覆盖范围圈（仅线） */}
      <mesh>
        <ringGeometry args={[radius * 0.98, radius, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

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
