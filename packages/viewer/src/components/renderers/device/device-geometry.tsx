// 扩容触发线：当 renderType case > 40 或 effects 总数 > 15 时，
// 必须拆分为 registry 架构。参考 docs/DEVICE-SPEC-DESIGN.md 决策 1。

import { type MountType, type Subsystem } from '@pascal-app/core'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import type { Object3D, SpotLight } from 'three'
import * as THREE from 'three'
import { Clone } from '@react-three/drei/core/Clone'
import { useGLTF } from '@react-three/drei/core/Gltf'
import { useFrame } from '@react-three/fiber'
import { getSubsystemColor } from '@vilhil/smarthome'
import { colorTempToColor } from '../../../lib/color-temp'

// 预加载常用 GLB，避免首次拖放时卡顿
useGLTF.preload('/items/electric-panel/model.glb')
useGLTF.preload('/items/security-camera-dome/model.glb')
useGLTF.preload('/items/security-camera-bullet/model.glb')
useGLTF.preload('/items/apple-homepod/model.glb')

// 设备运行时视觉状态 — 与 @vilhil/smarthome DeviceVisualState 保持同步
export interface DeviceVisualState {
  on?: boolean
  brightness?: number     // 0-100
  color?: string          // hex
  colorTemp?: number      // 2700-6500K
  position?: number       // 窗帘 0-100
  angle?: number          // 百叶 0-90
  targetTemp?: number
  currentTemp?: number
  locked?: boolean
  triggered?: boolean
  signalStrength?: number // 0-100
}

interface DeviceGeometryProps {
  mountType: MountType
  renderType: string
  size?: [number, number, number]
  subsystem: Subsystem
  /** 灯带的折线路径（plan 坐标 [x,z] 列表），有 path 时走 LightStripGeometry */
  path?: Array<[number, number]>
  /** 当前设备 position 在世界 (x,z)，用于把 path 转为相对坐标（DeviceGeometry 内部相对原点画） */
  centroidWorld?: [number, number]
  /** 灯带发光朝向：'down' / 'up' / 'wall' / 'omni' */
  emissionDirection?: 'down' | 'up' | 'wall' | 'omni'
  /** 设备运行时视觉状态 — Kimi 3D 模型接入后通过此 prop 驱动动画 */
  visualState?: DeviceVisualState
}

// Device geometry renderer - creates appropriate 3D geometry based on device type
export const DeviceGeometry = ({
  mountType,
  renderType,
  size = [0.1, 0.1, 0.1],
  subsystem,
  path,
  centroidWorld,
  emissionDirection,
  visualState,
}: DeviceGeometryProps) => {
  const [width, height, depth] = size
  const subsystemColor = useMemo(() => getSubsystemColor(subsystem), [subsystem])

  // 灯光设备：颜色优先用 visualState.colorTemp 走 Tanner Helland 黑体曲线
  // （这样开关色温变化时灯具/灯带颜色立即响应），其它子系统沿用 subsystem 默认色。
  const color = useMemo(() => {
    if (subsystem === 'lighting' && typeof visualState?.colorTemp === 'number') {
      return `#${colorTempToColor(visualState.colorTemp).getHexString()}`
    }
    return subsystemColor
  }, [subsystem, subsystemColor, visualState?.colorTemp])

  // 灯带（params.path 存在）走专用几何 —— 沿折线拉细圆柱，按 emissionDirection 调整光源
  if (path && path.length >= 2 && centroidWorld) {
    return (
      <LightStripGeometry
        path={path}
        centroidWorld={centroidWorld}
        color={color}
        on={visualState?.on ?? true}
        brightness={visualState?.brightness ?? 100}
        emissionDirection={emissionDirection ?? 'omni'}
      />
    )
  }

  // Get geometry based on render type and mount type
  const geometry = useMemo(() => {
    switch (renderType) {
      case 'downlight':
        return <DownlightGeometry color={color} size={size} />
      case 'switch-1key':
      case 'switch-2key':
      case 'switch-3key':
      case 'scene-4key':
      case 'scene-6key':
        return <PanelGeometry buttonCount={getButtonCount(renderType)} color={color} size={size} visualState={visualState} />
      case 'dimmer-knob':
        return <DimmerGeometry color={color} size={size} visualState={visualState} />
      case 'thermostat':
        return <ThermostatGeometry color={color} size={size} />
      case 'pir':
        return <PirGeometry color={color} size={size} triggered={visualState?.triggered} />
      case 'smoke':
        return <SmokeGeometry size={size} triggered={visualState?.triggered} />
      case 'door-lock':
        return <DoorLockGeometry color={color} size={size} locked={visualState?.locked} />
      case 'dome':
        return <DomeCameraGeometry size={size} />
      case 'camera-bullet':
        return <BulletCameraGeometry size={size} />
      case 'ap-ceiling':
      case 'ap-wall':
      case 'ceiling':     // catalog subtype（吸顶 AP）
      case 'wall':        // catalog subtype（壁挂 AP / 面板 AP）
        return <ApGeometry color={color} size={size} />
      case 'vent-4way':
        return <VentGeometry color="#e0e0e0" size={size} />
      case 'ac-wall':
        return <AcWallGeometry size={size} />
      case 'smart-speaker':
        return <SmartSpeakerGeometry size={size} visualState={visualState} />
      case 'knx':
        return <GatewayKnxGeometry size={size} />
      case 'smart':
        return <SmartHostGeometry size={size} />
      case 'router':
        return <RouterGeometry color={color} size={size} />
      case 'switch-network':
        return <SwitchNetworkGeometry color={color} size={size} />
      case 'cabinet-wall':
        return <WallCabinetGeometry size={size} />
      case 'cabinet-floor':
        return <FloorCabinetGeometry size={size} />
      // 窗帘：设备本体不渲染独立几何，视觉由 CurtainPanel 承载
      case 'curtain-side-open':
      case 'curtain-roller':
      case 'curtain-venetian':
      case 'curtain-roman':
      case 'track':          // 旧数据兼容
        return null
      default:
        return <DefaultGeometry color={color} size={size} />
    }
  }, [renderType, color, size])

  // Adjust position based on mount type
  const position = useMemo(() => {
    switch (mountType) {
      case 'ceiling':
        return [0, -height / 2, 0]
      case 'wall':
      case 'wall_switch':
        return [0, 0, depth / 2]
      case 'floor':
        return [0, height / 2, 0]
      case 'door':
        return [0, 0, depth / 2]
      default:
        return [0, 0, 0]
    }
  }, [mountType, height, depth])

  return <group position={position as [number, number, number]}>{geometry}</group>
}

// Helper to get button count from render type
const getButtonCount = (renderType: string): number => {
  if (renderType.includes('1key')) return 1
  if (renderType.includes('2key')) return 2
  if (renderType.includes('3key')) return 3
  if (renderType.includes('4key')) return 4
  if (renderType.includes('6key')) return 6
  return 1
}

// Downlight (筒灯) - cylindrical, recessed look
const DownlightGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <group>
      {/* Outer ring */}
      <mesh>
        <cylinderGeometry args={[w / 2, w / 2, h / 2, 32]} />
        <meshStandardMaterial color="#ffffff" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Inner light source */}
      <mesh position-y={h / 4}>
        <cylinderGeometry args={[w / 2.5, w / 2.5, 0.005, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}

// Panel (开关面板) - rectangular with buttons
const PanelGeometry = ({
  buttonCount,
  color,
  size: [w, h, d],
  visualState,
}: {
  buttonCount: number
  color: string
  size: [number, number, number]
  visualState?: DeviceVisualState
}) => {
  const buttonHeight = (h * 0.7) / buttonCount
  const buttonWidth = w * 0.7

  // 以 state.on 作为"主键按下"标志，驱动按键凹陷 + LED 变亮
  const isOn = visualState?.on ?? false
  const buttonRefs = useRef<Array<THREE.Mesh | null>>([])
  const matRefs = useRef<Array<THREE.MeshStandardMaterial | null>>([])
  const ledRefs = useRef<Array<THREE.MeshStandardMaterial | null>>([])
  const pressed = useRef<number[]>(Array(buttonCount).fill(0))   // 各键 0..1 当前按下程度

  useFrame((_, dt) => {
    // 简化：第 0 键跟随 on 状态；其它键保持松开
    const target = isOn ? 1 : 0
    pressed.current[0] = THREE.MathUtils.lerp(pressed.current[0]!, target, Math.min(dt * 8, 1))

    for (let i = 0; i < buttonCount; i++) {
      const btn = buttonRefs.current[i]
      const mat = matRefs.current[i]
      const ledMat = ledRefs.current[i]
      if (!btn || !mat || !ledMat) continue
      const p = pressed.current[i] ?? 0
      // 按下时 z 轴略微后退（1.5mm）
      btn.position.z = (d / 2 + 0.002) - p * 0.0015
      // LED 亮度随按下程度提升
      ledMat.emissiveIntensity = 0.15 + p * 0.95
      // 按键本体色（按下时微暗）
      mat.color.setScalar(1 - p * 0.1)
    }
  })

  return (
    <group>
      {/* 底板 */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#f5f5f5" metalness={0.1} roughness={0.8} />
      </mesh>
      {/* 按键 + LED 指示灯 */}
      {Array.from({ length: buttonCount }).map((_, i) => {
        const y = (h * 0.3) / 2 - buttonHeight * (i + 0.5)
        return (
          <group key={i}>
            {/* 按键本体（可按下） */}
            <mesh
              ref={(el) => { buttonRefs.current[i] = el }}
              position={[0, y, d / 2 + 0.002]}
            >
              <boxGeometry args={[buttonWidth, buttonHeight * 0.8, 0.003]} />
              <meshStandardMaterial
                ref={(el) => { matRefs.current[i] = el as THREE.MeshStandardMaterial }}
                color="#ffffff"
                metalness={0.2}
                roughness={0.6}
              />
            </mesh>
            {/* 按键上右角 LED 点（状态指示） */}
            <mesh position={[buttonWidth / 2 - 0.006, y + buttonHeight * 0.28, d / 2 + 0.004]}>
              <circleGeometry args={[0.0025, 10]} />
              <meshStandardMaterial
                ref={(el) => { ledRefs.current[i] = el as THREE.MeshStandardMaterial }}
                color={color}
                emissive={color}
                emissiveIntensity={0.2}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// 调光旋钮 —— 旋钮按 brightness 旋转（0% → -135°，100% → +135°），顶部 LED 亮度环
const DimmerGeometry = ({ color, size: [w, , d], visualState }: { color: string; size: [number, number, number]; visualState?: DeviceVisualState }) => {
  const knobRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.MeshStandardMaterial>(null)
  const brightness = visualState?.brightness ?? 0
  const isOn = visualState?.on ?? false

  useFrame((_, dt) => {
    if (knobRef.current) {
      // brightness 0-100 → -135° ~ +135°（总共 270° 行程）
      const targetRot = ((brightness / 100) - 0.5) * (270 * Math.PI / 180)
      knobRef.current.rotation.z = THREE.MathUtils.lerp(knobRef.current.rotation.z, targetRot, Math.min(dt * 10, 1))
    }
    if (ringRef.current) {
      ringRef.current.emissiveIntensity = isOn ? 0.4 + (brightness / 100) * 0.8 : 0.08
    }
  })

  return (
    <group>
      {/* 底板 */}
      <mesh>
        <cylinderGeometry args={[w / 2, w / 2, d, 32]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
      {/* 亮度刻度环（固定不转） */}
      <mesh position={[0, d / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[w * 0.36, w * 0.42, 36]} />
        <meshStandardMaterial
          ref={ringRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.2}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 旋钮（可转） */}
      <group ref={knobRef}>
        <mesh position-z={d / 2 + 0.005}>
          <cylinderGeometry args={[w / 3, w / 3, 0.008, 32]} />
          <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
        </mesh>
        {/* 旋钮上的指针（小点标记当前位置） */}
        <mesh position={[0, d / 2 + 0.010, w / 3 * 0.8]}>
          <sphereGeometry args={[0.003, 10, 10]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
        </mesh>
      </group>
    </group>
  )
}

// Thermostat (温控面板)
const ThermostatGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <group>
      {/* Body */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Screen */}
      <mesh position-z={d / 2 + 0.001}>
        <planeGeometry args={[w * 0.7, h * 0.5]} />
        <meshStandardMaterial color="#1a1a1a" emissive={color} emissiveIntensity={0.1} />
      </mesh>
    </group>
  )
}

// PIR sensor (人体感应器)
const PirGeometry = ({ color, size: [w, h, d], triggered }: { color: string; size: [number, number, number]; triggered?: boolean }) => {
  const lensMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const activeColor = triggered ? '#ef4444' : color    // 触发=红色，静默=原绿色

  useFrame(({ clock }) => {
    const m = lensMatRef.current
    if (!m) return
    const t = clock.getElapsedTime()
    if (triggered) {
      // 触发：快速脉冲
      m.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 4.2)) * 1.0
    } else {
      // 静默：微弱呼吸
      m.emissiveIntensity = 0.25 + Math.sin(t * 1.0) * 0.1
    }
  })

  return (
    <group>
      {/* Dome base */}
      <mesh>
        <cylinderGeometry args={[w / 2, w / 2, h / 2, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Sensor lens —— triggered 时切到红色脉冲 */}
      <mesh position-y={h / 4}>
        <sphereGeometry args={[w / 2.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          ref={lensMatRef}
          color={activeColor}
          emissive={activeColor}
          emissiveIntensity={0.3}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  )
}

// 烟感报警器：白色圆盘主体 + 中心栅格 + 警报环
const SmokeGeometry = ({ size: [w, h], triggered }: { size: [number, number, number]; triggered?: boolean }) => {
  const ringMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const color = triggered ? '#ef4444' : '#4ade80'

  useFrame(({ clock }) => {
    const m = ringMatRef.current
    if (!m) return
    const t = clock.getElapsedTime()
    if (triggered) {
      // 报警：高频闪烁 + 亮度大幅跳动
      m.emissiveIntensity = 0.8 + Math.abs(Math.sin(t * 6.0)) * 1.5
    } else {
      // 静默：弱亮度稳态
      m.emissiveIntensity = 0.3 + Math.sin(t * 0.8) * 0.05
    }
  })

  return (
    <group>
      {/* 主体圆盘 */}
      <mesh>
        <cylinderGeometry args={[w / 2, w / 2, h, 36]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} metalness={0.08} />
      </mesh>
      {/* 中心透气栅格（多圈小孔装饰） */}
      {[0.15, 0.22, 0.29, 0.36].map((r) => (
        <mesh key={r} position={[0, -h / 2 - 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[w * (r - 0.02), w * r, 32]} />
          <meshStandardMaterial color="#b8b8b8" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* 中心按钮 */}
      <mesh position={[0, -h / 2 - 0.0015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[w * 0.10, 24]} />
        <meshStandardMaterial color="#d8d8d8" roughness={0.4} />
      </mesh>
      {/* 警报指示环（外圈 LED 圈，emissive） */}
      <mesh position={[0, -h / 2 - 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[w * 0.42, w * 0.48, 48]} />
        <meshStandardMaterial
          ref={ringMatRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

// Door lock (智能门锁)
const DoorLockGeometry = ({ color, size: [w, h, d], locked }: { color: string; size: [number, number, number]; locked?: boolean }) => {
  const ringRef = useRef<THREE.Mesh>(null)
  const ringMatRef = useRef<THREE.MeshStandardMaterial>(null)
  // 锁定=绿色稳态缓慢呼吸；开锁=红色快速脉冲
  const stateColor = locked ? '#4ade80' : '#ef4444'

  useFrame(({ clock }) => {
    const ring = ringRef.current
    const mat = ringMatRef.current
    if (!ring || !mat) return
    const t = clock.getElapsedTime()
    if (locked) {
      const pulse = 0.6 + Math.sin(t * 1.2) * 0.3    // 缓慢呼吸
      mat.emissiveIntensity = pulse
      ring.scale.setScalar(1.0)
    } else {
      const pulse = 0.5 + Math.abs(Math.sin(t * 3.2)) * 0.9   // 快速脉冲
      mat.emissiveIntensity = pulse
      ring.scale.setScalar(1 + Math.sin(t * 3.2) * 0.08)     // 略微呼吸
    }
  })

  return (
    <group>
      {/* Lock body */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#2d2d2d" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Handle */}
      <mesh position={[0, h / 4, d / 2 + 0.02]}>
        <cylinderGeometry args={[w / 4, w / 4, 0.04, 32]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* 状态指示环（安装在门锁把手下方） */}
      <mesh ref={ringRef} position={[0, -h / 4, d / 2 + 0.01]}>
        <ringGeometry args={[w * 0.20, w * 0.32, 32]} />
        <meshStandardMaterial
          ref={ringMatRef}
          color={stateColor}
          emissive={stateColor}
          emissiveIntensity={0.6}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

// Access Point (无线AP)
const ApGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <group>
      {/* AP body */}
      <mesh>
        <circleGeometry args={[w / 2, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Status LED ring */}
      <mesh position-y={-0.002}>
        <ringGeometry args={[w / 3, w / 2.5, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}

// HVAC Vent (出风口)
const VentGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <group>
      {/* Frame */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Grille lines */}
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * w * 0.25, 0, d / 2 + 0.002]}>
          <boxGeometry args={[0.005, h * 0.8, 0.002]} />
          <meshStandardMaterial color="#cccccc" />
        </mesh>
      ))}
    </group>
  )
}

// 墙挂空调室内机 —— 白色圆角长方体 + 底部横向格栅出风口 + 右侧 LED
const AcWallGeometry = ({ size: [w, h, d] }: { size: [number, number, number] }) => {
  return (
    <group>
      {/* 主体 */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.35} metalness={0.08} />
      </mesh>
      {/* 顶部进风栅格线（装饰） */}
      {[-0.15, 0, 0.15].map((xf, i) => (
        <mesh key={i} position={[w * xf, h * 0.35, d / 2 + 0.0005]}>
          <planeGeometry args={[w * 0.25, 0.003]} />
          <meshStandardMaterial color="#c8c8c8" />
        </mesh>
      ))}
      {/* 底部出风口（深色长条） */}
      <mesh position={[0, -h * 0.32, d / 2 + 0.0005]}>
        <planeGeometry args={[w * 0.85, h * 0.22]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.7} />
      </mesh>
      {/* 右下角显示屏（冷蓝发光） */}
      <mesh position={[w * 0.40, -h * 0.18, d / 2 + 0.001]}>
        <planeGeometry args={[0.06, 0.03]} />
        <meshStandardMaterial color="#6bc4e8" emissive="#6bc4e8" emissiveIntensity={0.6} />
      </mesh>
      {/* 左下角 LOGO 占位（小圆点） */}
      <mesh position={[-w * 0.40, -h * 0.18, d / 2 + 0.001]}>
        <circleGeometry args={[0.008, 12]} />
        <meshStandardMaterial color="#9b7bea" emissive="#9b7bea" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// Default geometry for unknown device types
const DefaultGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <mesh>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

// ─── 网络子系统新增：Router / Switch / 弱电箱 / 落地机柜（白模）─────────────
// 后续可优化为更精致的造型或换成 GLB

// 路由器 —— 白色扁盒子 + 前面板几个指示灯
const RouterGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <group>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} metalness={0.1} />
      </mesh>
      {/* 前面板 LED 指示灯组（用 subsystem 色） */}
      {[-0.35, -0.15, 0.05, 0.25].map((xf, i) => (
        <mesh key={i} position={[w * xf, 0, d / 2 + 0.002]}>
          <circleGeometry args={[Math.min(w, h) * 0.04, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
        </mesh>
      ))}
    </group>
  )
}

// 交换机 —— 比 Router 更扁宽，前面一整排网口指示灯
const SwitchNetworkGeometry = ({ size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <group>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} metalness={0.1} />
      </mesh>
      {/* 一排 8 个端口指示灯（绿色，暗示数据活动） */}
      {Array.from({ length: 8 }).map((_, i) => {
        const xf = -0.42 + (i * 0.84) / 7
        return (
          <mesh key={i} position={[w * xf, -h * 0.15, d / 2 + 0.002]}>
            <circleGeometry args={[Math.min(w, h) * 0.03, 10]} />
            <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={0.8} />
          </mesh>
        )
      })}
    </group>
  )
}

// 墙面弱电箱 —— 优先加载 item 系统里已有的 electric-panel GLB
// 失败或加载中 fallback 到白模，保证视觉不掉
const WallCabinetGLB = () => {
  const { scene } = useGLTF('/items/electric-panel/model.glb')
  // 和 item-catalog 里 electric-panel 保持一致的 scale
  return <Clone object={scene} scale={[0.61, 0.74, 0.7]} />
}

const WallCabinetFallback = ({ size: [w, h, d] }: { size: [number, number, number] }) => {
  return (
    <group>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#f9fafb" roughness={0.5} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.002]}>
        <planeGeometry args={[w * 0.94, h * 0.94]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[w * 0.35, 0, d / 2 + 0.005]}>
        <boxGeometry args={[0.015, 0.05, 0.008]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
      </mesh>
    </group>
  )
}

const WallCabinetGeometry = ({ size }: { size: [number, number, number] }) => {
  return (
    <Suspense fallback={<WallCabinetFallback size={size} />}>
      <WallCabinetGLB />
    </Suspense>
  )
}

// ─── 安防摄像头 GLB + 兜底白模 ────────────────────────────────────────────
const DomeCameraGLB = () => {
  const { scene } = useGLTF('/items/security-camera-dome/model.glb')
  // GLB 导出时可能朝向 +Z 或 +Y，视模型而定。常见半球摄像头模型"镜头向下"默认即可
  return <Clone object={scene} scale={[1, 1, 1]} />
}

const DomeCameraFallback = ({ size: [w, h] }: { size: [number, number, number] }) => (
  <group>
    {/* 半球上壳 */}
    <mesh>
      <sphereGeometry args={[w * 0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#f0f0f0" roughness={0.3} metalness={0.1} />
    </mesh>
    {/* 底座圆盘 */}
    <mesh position={[0, -h * 0.2, 0]}>
      <cylinderGeometry args={[w * 0.45, w * 0.45, h * 0.2, 24]} />
      <meshStandardMaterial color="#e0e0e0" roughness={0.4} />
    </mesh>
    {/* 镜头黑色圆 */}
    <mesh position={[0, -0.005, 0]}>
      <circleGeometry args={[w * 0.20, 24]} />
      <meshStandardMaterial color="#0a0a0a" roughness={0.2} metalness={0.3} />
    </mesh>
  </group>
)

const DomeCameraGeometry = ({ size }: { size: [number, number, number] }) => {
  return (
    <Suspense fallback={<DomeCameraFallback size={size} />}>
      <DomeCameraGLB />
    </Suspense>
  )
}

const BulletCameraGLB = () => {
  const { scene } = useGLTF('/items/security-camera-bullet/model.glb')
  return <Clone object={scene} scale={[1, 1, 1]} />
}

const BulletCameraFallback = ({ size: [w, h, d] }: { size: [number, number, number] }) => (
  <group>
    {/* 圆柱体主体 */}
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[h * 0.5, h * 0.5, w, 20]} />
      <meshStandardMaterial color="#d0d0d0" roughness={0.35} metalness={0.2} />
    </mesh>
    {/* 镜头 */}
    <mesh position={[w * 0.5, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[h * 0.35, h * 0.4, 0.02, 20]} />
      <meshStandardMaterial color="#0a0a0a" roughness={0.2} metalness={0.3} />
    </mesh>
    {/* 臂（挂墙连接） */}
    <mesh position={[-w * 0.45, -h * 0.5, 0]}>
      <boxGeometry args={[d * 0.5, h * 0.8, d * 0.4]} />
      <meshStandardMaterial color="#a0a0a0" roughness={0.5} />
    </mesh>
  </group>
)

const BulletCameraGeometry = ({ size }: { size: [number, number, number] }) => {
  return (
    <Suspense fallback={<BulletCameraFallback size={size} />}>
      <BulletCameraGLB />
    </Suspense>
  )
}

// ─── 智能音箱 GLB（HomePod 风格）+ 顶部 LED 呼吸环 ──────────────────────
const SmartSpeakerGLB = ({ visualState }: { visualState?: DeviceVisualState }) => {
  const { scene } = useGLTF('/items/apple-homepod/model.glb')
  const ledRef = useRef<THREE.MeshStandardMaterial>(null)
  const isOn = visualState?.on ?? false

  useFrame(({ clock }) => {
    const mat = ledRef.current
    if (!mat) return
    const t = clock.getElapsedTime()
    if (isOn) {
      // 播放中：多频呼吸（模拟音波节律）
      mat.emissiveIntensity = 0.6 + Math.sin(t * 2.5) * 0.4 + Math.sin(t * 5.7) * 0.15
    } else {
      mat.emissiveIntensity = 0.08
    }
  })

  return (
    <group>
      <Clone object={scene} scale={[1, 1, 1]} />
      {/* 顶部 LED 呼吸环（叠加在 GLB 上方） */}
      <mesh position={[0, 0.10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.028, 0.042, 48]} />
        <meshStandardMaterial
          ref={ledRef}
          color="#5ba0f5"
          emissive="#5ba0f5"
          emissiveIntensity={0.1}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

const SmartSpeakerFallback = ({ size: [w, h] }: { size: [number, number, number] }) => (
  <group>
    <mesh>
      <cylinderGeometry args={[w / 2, w / 2, h, 32]} />
      <meshStandardMaterial color="#d8d8d8" roughness={0.7} metalness={0.05} />
    </mesh>
    <mesh position={[0, h / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[w * 0.35, 32]} />
      <meshStandardMaterial color="#1a1a1a" />
    </mesh>
  </group>
)

const SmartSpeakerGeometry = ({ size, visualState }: { size: [number, number, number]; visualState?: DeviceVisualState }) => {
  return (
    <Suspense fallback={<SmartSpeakerFallback size={size} />}>
      <SmartSpeakerGLB visualState={visualState} />
    </Suspense>
  )
}

// ─── KNX 网关（导轨模块式小盒子 + LED 阵列 + 铭牌）─────────────────────
const GatewayKnxGeometry = ({ size: [w, h, d] }: { size: [number, number, number] }) => {
  return (
    <group>
      {/* 主体 */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.5} metalness={0.1} />
      </mesh>
      {/* KNX 黄色铭牌 */}
      <mesh position={[0, h * 0.25, d / 2 + 0.001]}>
        <planeGeometry args={[w * 0.8, h * 0.18]} />
        <meshStandardMaterial color="#d4a853" emissive="#d4a853" emissiveIntensity={0.2} />
      </mesh>
      {/* LED 阵列（2 列 × 3 行）— 底部状态灯 */}
      {[0, 1].map((col) =>
        [0, 1, 2].map((row) => {
          const colColors = ['#4ade80', '#d4a853', '#ef4444'] as const
          return (
            <mesh
              key={`${col}-${row}`}
              position={[
                (col === 0 ? -1 : 1) * w * 0.22,
                -h * 0.18 + row * h * 0.14,
                d / 2 + 0.001,
              ]}
            >
              <circleGeometry args={[Math.min(w, h) * 0.035, 12]} />
              <meshStandardMaterial
                color={colColors[row]!}
                emissive={colColors[row]!}
                emissiveIntensity={0.7}
              />
            </mesh>
          )
        }),
      )}
      {/* 端口排（底部 8 针装饰条） */}
      <mesh position={[0, -h * 0.42, d / 2 + 0.0005]}>
        <planeGeometry args={[w * 0.85, 0.005]} />
        <meshStandardMaterial color="#6b6b6b" />
      </mesh>
    </group>
  )
}

// ─── 智能主机（带屏幕的柜式设备）─────────────────────────────────────
const SmartHostGeometry = ({ size: [w, h, d] }: { size: [number, number, number] }) => {
  const screenRef = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    const mat = screenRef.current
    if (!mat) return
    // 屏幕呼吸（代表"运行中"）
    const t = clock.getElapsedTime()
    mat.emissiveIntensity = 0.35 + Math.sin(t * 0.8) * 0.08
  })
  return (
    <group>
      {/* 主体 */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#3a4750" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* 屏幕（中央 emissive） */}
      <mesh position={[0, h * 0.1, d / 2 + 0.001]}>
        <planeGeometry args={[w * 0.75, h * 0.42]} />
        <meshStandardMaterial
          ref={screenRef}
          color="#1e2a3a"
          emissive="#4ea8ff"
          emissiveIntensity={0.35}
          transparent
          opacity={0.95}
        />
      </mesh>
      {/* 底部状态 LED 条 */}
      {[-0.30, -0.10, 0.10, 0.30].map((xf, i) => (
        <mesh key={i} position={[w * xf, -h * 0.35, d / 2 + 0.001]}>
          <planeGeometry args={[w * 0.08, 0.004]} />
          <meshStandardMaterial
            color={['#4ade80', '#4ade80', '#d4a853', '#4ade80'][i]}
            emissive={['#4ade80', '#4ade80', '#d4a853', '#4ade80'][i]}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}
      {/* 左上角 LOGO 圆点 */}
      <mesh position={[-w * 0.40, h * 0.40, d / 2 + 0.001]}>
        <circleGeometry args={[0.008, 16]} />
        <meshStandardMaterial color="#5ba0f5" emissive="#5ba0f5" emissiveIntensity={0.8} />
      </mesh>
    </group>
  )
}

// 落地机柜 —— 高长方体 + 半透明玻璃门 + 顶部通风格栅
const FloorCabinetGeometry = ({ size: [w, h, d] }: { size: [number, number, number] }) => {
  return (
    <group>
      {/* 主体（柜壁） */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.5} metalness={0.15} />
      </mesh>
      {/* 玻璃门（半透明，Three.js Physical Material） */}
      <mesh position={[0, 0, d / 2 + 0.003]}>
        <planeGeometry args={[w * 0.9, h * 0.88]} />
        <meshPhysicalMaterial
          color="#b0b8c0"
          transparent
          opacity={0.3}
          roughness={0.05}
          metalness={0.1}
          clearcoat={0.6}
        />
      </mesh>
      {/* 门框（玻璃周围的边） */}
      <mesh position={[0, 0, d / 2 + 0.004]}>
        <ringGeometry args={[0, 0, 4]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
      {/* 顶部散热格栅（4 条） */}
      {[-0.15, -0.05, 0.05, 0.15].map((xf) => (
        <mesh key={xf} position={[w * xf, h * 0.46, d / 2 + 0.002]}>
          <planeGeometry args={[w * 0.08, 0.006]} />
          <meshStandardMaterial color="#6b7280" />
        </mesh>
      ))}
      {/* 门把手（竖条） */}
      <mesh position={[w * 0.38, -h * 0.05, d / 2 + 0.008]}>
        <boxGeometry args={[0.012, 0.12, 0.012]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* 底部脚垫（4 个） */}
      {([[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]] as const).map(([xf, zf], i) => (
        <mesh key={i} position={[w * xf, -h / 2 - 0.005, d * zf]}>
          <cylinderGeometry args={[0.015, 0.015, 0.01, 12]} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      ))}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  灯带 / 线性灯具 —— 沿 path 拉细圆柱（TubeGeometry）
//
//  path：plan 坐标列表（[x, z]），但 DeviceGeometry 已经被 <group position=node.position>
//        包住，所以这里要把 path 转成"相对于 centroidWorld 的局部坐标"。
//  emissionDirection：决定灯带的朝向 / 光锥
//        - 'down'   朝下打（吊顶藏灯、橱柜底）
//        - 'up'     朝上打（回形灯槽 → 顶面反射）
//        - 'wall'   朝侧打（洗墙 → 取 path 的法向方向）
//        - 'omni'   全向（普通 LED 灯带 = 自发光）
//
//  视觉策略：
//  - 圆柱本体颜色 = 子系统色（淡米黄）
//  - on 时 emissive 用色温映射（默认暖白），强度 = brightness/100 * baseStrength
//  - 沿 path 在每段中点放小 PointLight（可选）—— 简版先不放，避免大场景灯带太多 light 卡顿
//
//  几何性能：用 BufferGeometry 自己拼三角，避免 TubeGeometry 在 path > 5 段时的过度细分。
// ═══════════════════════════════════════════════════════════════════════════
const LightStripGeometry = ({
  path,
  centroidWorld,
  color,
  on,
  brightness,
  emissionDirection,
}: {
  path: Array<[number, number]>
  centroidWorld: [number, number]
  color: string
  on: boolean
  brightness: number
  emissionDirection: 'down' | 'up' | 'wall' | 'omni'
}) => {
  // 局部 path（相对中心点），plan 坐标 [x, z] 直接对应 three 世界 [x, *, z]
  const localPath = useMemo(
    () =>
      path.map(([x, z]) => [x - centroidWorld[0], z - centroidWorld[1]] as [number, number]),
    [path, centroidWorld],
  )

  // 沿 path 构造 CatmullRom 曲线 → TubeGeometry。
  // 灯带很细（半径 1.5 cm），分段不需要太多。
  const radius = 0.015
  const tubularSegments = Math.max(8, localPath.length * 4)
  const radialSegments = 6
  const curve = useMemo(() => {
    const pts = localPath.map(([x, z]) => new THREE.Vector3(x, 0, z))
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0)
  }, [localPath])

  // 灯带本体 emissive：AgX tonemap 下从 0.22 回到 0.55，灯带视觉感回归。
  // AgX knee ~6.0，0.55 远在线性区，配合 SelectiveBloom（下一步）时也不会喂全屏 bloom。
  const emissiveIntensity = on ? (brightness / 100) * 0.55 : 0

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, tubularSegments, radius, radialSegments, false]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.3}
          roughness={0.6}
        />
      </mesh>
      {/* 灯带光源：on 时按 emissionDirection 投光。
          - omni（默认）→ 沿 path 等距 PointLight 阵列
          - down/up/wall → SpotLight 朝指定方向，target 指定 direction
          采样密度 ~ 每 0.6m 一盏，相邻灯的有效范围（distance）略大于间距，
          保证长灯带没有"亮斑+暗带"的断层。 */}
      {on && (
        <StripLightArray
          localPath={localPath}
          color={color}
          brightness={brightness}
          emissionDirection={emissionDirection}
        />
      )}
    </group>
  )
}

// 灯带每米采样密度 —— 每 1.6m 一盏；相邻两盏间隔 + distance 重叠保证连续性
//
// 【性能权衡】Three.js 每个材质 shader 的 light uniform 数组随 SpotLight/PointLight
// 总数线性膨胀；超过 ~8 盏后 fragment shader 重编译开销显著。
// 一条 5m 灯带原来 0.6m 间距 → 8 盏，4 条灯带 → 32 盏，整个场景帧率被拖。
// 1.6m 间距：5m 灯带 3 盏，4 条 → 12 盏，可控。
const STRIP_LIGHT_SPACING_M = 1.6
// 距离从 2.5 → 1.2：灯带常贴顶（mount 2.55-2.6m，顶面 2.7m，间距仅 10cm），
// distance=2.5 让 PointLight/SpotLight 在 1/d² 衰减下贴顶位置（d=0.1）爆出
// ~100× 标称强度，整个顶面被打爆 + bloom 放大 → 看上去像"过曝"。
// 限到 1.2m 直接砍掉远场无效散射，配合上偏移让灯不再紧贴顶。
const STRIP_LIGHT_DISTANCE_M = 1.2
// SpotLight 半角（度）—— up（灯槽）必须放宽角度，让光散在大片顶面而不是窄圆。
// 45° 在距离 0.1m 时仅照亮 ~8cm² 的圆斑，单位面积亮度直接爆。
const STRIP_SPOT_ANGLE_DEG_DOWN = 45
const STRIP_SPOT_ANGLE_DEG_UP_WALL = 75
// 灯带光源相对几何中心向"反发光面"偏移，给光留扩散空间：
// - 'up'（灯槽）：灯带在 2.55m，光源下移 0.25m 到 2.30m，target 仍在头顶 → 长光程让光柔和扩散
// - 'omni'：下移 0.25m，避免 PointLight 紧贴顶发出爆炸光斑
const STRIP_LIGHT_Y_OFFSET_UP = -0.25
const STRIP_LIGHT_Y_OFFSET_OMNI = -0.25

interface StripLightSample {
  pos: [number, number, number]
  /** SpotLight 指向的目标位置（omni 模式时未使用） */
  tgt: [number, number, number]
}

const StripLightArray = ({
  localPath,
  color,
  brightness,
  emissionDirection,
}: {
  localPath: Array<[number, number]>
  color: string
  brightness: number
  emissionDirection: 'down' | 'up' | 'wall' | 'omni'
}) => {
  const samples = useMemo<StripLightSample[]>(() => {
    const out: StripLightSample[] = []
    // 光源在灯带本体的 y 偏移：'up' / 'omni' 下移避开"贴顶"几何爆炸；
    // 'down' / 'wall' 不偏移（这两个方向本来就是离顶散开的）。
    const yOffset =
      emissionDirection === 'up'
        ? STRIP_LIGHT_Y_OFFSET_UP
        : emissionDirection === 'omni'
          ? STRIP_LIGHT_Y_OFFSET_OMNI
          : 0
    for (let i = 0; i < localPath.length - 1; i++) {
      const a = localPath[i]!
      const b = localPath[i + 1]!
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1])
      // 每 STRIP_LIGHT_SPACING_M 一盏，至少 1 盏（短段也要有一盏中点光）
      const samplesPerSeg = Math.max(1, Math.ceil(segLen / STRIP_LIGHT_SPACING_M))
      // 段方向单位向量 + 段右手法线（wall 模式用）
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const len = segLen || 1
      const normX = -dz / len
      const normZ = dx / len
      for (let s = 0; s < samplesPerSeg; s++) {
        const t = (s + 0.5) / samplesPerSeg
        const px = a[0] + dx * t
        const pz = a[1] + dz * t
        let tgt: [number, number, number]
        // target 是相对光源位置向「发光方向」走 1m，而不是相对灯带几何
        // 这样 yOffset 改变光源位置时，光线方向保持不变。
        if (emissionDirection === 'down') tgt = [px, yOffset - 1, pz]
        else if (emissionDirection === 'up') tgt = [px, yOffset + 1, pz]
        else if (emissionDirection === 'wall') tgt = [px + normX, yOffset, pz + normZ]
        else tgt = [px, yOffset - 1, pz] // omni 模式不用 target，占个位
        out.push({ pos: [px, yOffset, pz], tgt })
      }
    }
    return out
  }, [localPath, emissionDirection])

  // brightness 0-100 → 强度。
  // 灯带是「氛围光」不是「主光」—— 真实场景几瓦/米，照度远低于天花筒灯。
  // 这里强度系数全面下调，把灯带还原成"看得见但不主导"的角色。
  // 'up'（灯槽）即使下移 0.25m，到顶面距离仍只有 ~0.4m，强度需更低；
  // 'down' 直射地板距离更长，可以稍亮。
  const baseIntensity = brightness / 100
  const downAngleRad = (STRIP_SPOT_ANGLE_DEG_DOWN * Math.PI) / 180
  const upWallAngleRad = (STRIP_SPOT_ANGLE_DEG_UP_WALL * Math.PI) / 180

  if (emissionDirection === 'omni') {
    // AgX 下灯带强度回升：omni 0.03 → 0.08，给"装饰氛围"足够的可见度
    return (
      <>
        {samples.map((s, i) => (
          <pointLight
            key={i}
            position={s.pos}
            color={color}
            intensity={baseIntensity * 0.08}
            distance={STRIP_LIGHT_DISTANCE_M}
            decay={2}
          />
        ))}
      </>
    )
  }

  // 方向性 SpotLight：AgX 下回升，up/wall 0.10、down 0.15
  const isUpOrWall = emissionDirection === 'up' || emissionDirection === 'wall'
  const angleRad = isUpOrWall ? upWallAngleRad : downAngleRad
  const intensityFactor =
    emissionDirection === 'up' ? 0.10 : emissionDirection === 'wall' ? 0.12 : 0.15
  return (
    <>
      {samples.map((s, i) => (
        <DirectionalSpotSample
          key={i}
          pos={s.pos}
          tgt={s.tgt}
          color={color}
          intensity={baseIntensity * intensityFactor}
          distance={STRIP_LIGHT_DISTANCE_M}
          angle={angleRad}
        />
      ))}
    </>
  )
}

/** SpotLight + 单独 target Object3D —— Three.js 要求 spotLight.target 是 scene graph 里的对象 */
const DirectionalSpotSample = ({
  pos, tgt, color, intensity, distance, angle,
}: {
  pos: [number, number, number]
  tgt: [number, number, number]
  color: string
  intensity: number
  distance: number
  angle: number
}) => {
  const targetRef = useRef<Object3D>(null!)
  const lightRef = useRef<SpotLight>(null!)
  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current
    }
  }, [])
  return (
    <>
      <spotLight
        ref={lightRef}
        position={pos}
        color={color}
        intensity={intensity}
        distance={distance}
        decay={2}
        angle={angle}
        penumbra={0.6}
      />
      <object3D ref={targetRef} position={tgt} />
    </>
  )
}
