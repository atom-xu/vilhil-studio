import { type MountType, type Subsystem } from '@pascal-app/core'
import { useMemo } from 'react'
import * as THREE from 'three'
import { getSubsystemColor } from '@vilhil/smarthome'

interface DeviceGeometryProps {
  mountType: MountType
  renderType: string
  size?: [number, number, number]
  subsystem: Subsystem
}

// Device geometry renderer - creates appropriate 3D geometry based on device type
export const DeviceGeometry = ({
  mountType,
  renderType,
  size = [0.1, 0.1, 0.1],
  subsystem,
}: DeviceGeometryProps) => {
  const [width, height, depth] = size
  const color = useMemo(() => getSubsystemColor(subsystem), [subsystem])

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
        return <PanelGeometry buttonCount={getButtonCount(renderType)} color={color} size={size} />
      case 'dimmer-knob':
        return <DimmerGeometry color={color} size={size} />
      case 'thermostat':
        return <ThermostatGeometry color={color} size={size} />
      case 'pir':
        return <PirGeometry color={color} size={size} />
      case 'door-lock':
        return <DoorLockGeometry color={color} size={size} />
      case 'ap-ceiling':
      case 'ap-wall':
        return <ApGeometry color={color} size={size} />
      case 'vent-4way':
        return <VentGeometry color="#e0e0e0" size={size} />
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
}: {
  buttonCount: number
  color: string
  size: [number, number, number]
}) => {
  const buttonHeight = (h * 0.7) / buttonCount
  const buttonWidth = w * 0.7

  return (
    <group>
      {/* Base plate */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#f5f5f5" metalness={0.1} roughness={0.8} />
      </mesh>
      {/* Buttons */}
      {Array.from({ length: buttonCount }).map((_, i) => (
        <mesh
          key={i}
          position={[
            0,
            (h * 0.3) / 2 - buttonHeight * (i + 0.5),
            d / 2 + 0.001,
          ]}
        >
          <boxGeometry args={[buttonWidth, buttonHeight * 0.8, 0.002]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.2}
            metalness={0.2}
            roughness={0.6}
          />
        </mesh>
      ))}
    </group>
  )
}

// Dimmer knob (调光旋钮)
const DimmerGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <group>
      {/* Base */}
      <mesh>
        <cylinderGeometry args={[w / 2, w / 2, d, 32]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
      {/* Knob */}
      <mesh position-z={d / 2 + 0.005}>
        <cylinderGeometry args={[w / 3, w / 3, 0.008, 32]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>
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
const PirGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <group>
      {/* Dome base */}
      <mesh>
        <cylinderGeometry args={[w / 2, w / 2, h / 2, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Sensor lens */}
      <mesh position-y={h / 4}>
        <sphereGeometry args={[w / 2.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  )
}

// Door lock (智能门锁)
const DoorLockGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
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

// Default geometry for unknown device types
const DefaultGeometry = ({ color, size: [w, h, d] }: { color: string; size: [number, number, number] }) => {
  return (
    <mesh>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}
