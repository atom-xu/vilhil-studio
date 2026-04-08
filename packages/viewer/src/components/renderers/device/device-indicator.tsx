import { type Subsystem } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { getSubsystemColor } from '@vilhil/smarthome'

interface DeviceIndicatorProps {
  isOn: boolean
  subsystem: Subsystem
  showAnimation: boolean
}

// Status indicator - shows device state with colored halo
export const DeviceIndicator = ({ isOn, subsystem, showAnimation }: DeviceIndicatorProps) => {
  const meshRef = useRef<Mesh>(null)
  const color = useMemo(() => getSubsystemColor(subsystem), [subsystem])

  // Pulsing animation when device is on
  useFrame(({ clock }) => {
    if (meshRef.current && isOn && showAnimation) {
      const t = clock.getElapsedTime()
      const pulse = 1 + Math.sin(t * 3) * 0.1
      meshRef.current.scale.setScalar(pulse)
    }
  })

  if (!isOn) {
    // Subtle grey ring when off
    return (
      <mesh ref={meshRef} position-y={0.02}>
        <ringGeometry args={[0.08, 0.1, 32]} />
        <meshBasicMaterial color="#444444" opacity={0.3} transparent />
      </mesh>
    )
  }

  // Colored glow when on
  return (
    <mesh ref={meshRef} position-y={0.02}>
      <ringGeometry args={[0.08, 0.12, 32]} />
      <meshBasicMaterial color={color} opacity={0.6} transparent />
    </mesh>
  )
}
