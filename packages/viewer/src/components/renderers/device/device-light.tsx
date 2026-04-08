import { useMemo } from 'react'
import * as THREE from 'three'

interface DeviceLightProps {
  brightness: number
  color: string
  colorTemp?: number
  renderType: string
}

// Light emission for lighting devices
export const DeviceLight = ({ brightness, color, colorTemp, renderType }: DeviceLightProps) => {
  // Convert color temperature to RGB if provided
  const finalColor = useMemo(() => {
    if (colorTemp) {
      return kelvinToRgb(colorTemp)
    }
    return new THREE.Color(color)
  }, [color, colorTemp])

  // Calculate intensity based on brightness (0-100)
  const intensity = (brightness / 100) * 2

  // Different light configurations based on render type
  switch (renderType) {
    case 'downlight':
      return (
        <spotLight
          angle={Math.PI / 4}
          color={finalColor}
          decay={2}
          distance={10}
          intensity={intensity}
          penumbra={0.3}
          position={[0, -0.05, 0]}
          target-position={[0, -2, 0]}
        />
      )
    case 'strip':
      return (
        <rectAreaLight
          color={finalColor}
          height={0.02}
          intensity={intensity * 2}
          position={[0, -0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={0.5}
        />
      )
    case 'wall-light':
      return (
        <pointLight
          color={finalColor}
          decay={2}
          distance={8}
          intensity={intensity}
          position={[0, 0, 0.1]}
        />
      )
    default:
      return (
        <pointLight
          color={finalColor}
          decay={2}
          distance={6}
          intensity={intensity}
          position={[0, -0.05, 0]}
        />
      )
  }
}

// Convert Kelvin temperature to RGB
function kelvinToRgb(kelvin: number): THREE.Color {
  const temp = kelvin / 100
  let r: number, g: number, b: number

  if (temp <= 66) {
    r = 255
    g = temp
    g = 99.4708025861 * Math.log(g) - 161.1195681661

    if (temp <= 19) {
      b = 0
    } else {
      b = temp - 10
      b = 138.5177312231 * Math.log(b) - 305.0447927307
    }
  } else {
    r = temp - 60
    r = 329.698727446 * Math.pow(r, -0.1332047592)

    g = temp - 60
    g = 288.1221695283 * Math.pow(g, -0.0755148492)

    b = 255
  }

  return new THREE.Color(
    Math.max(0, Math.min(1, r / 255)),
    Math.max(0, Math.min(1, g / 255)),
    Math.max(0, Math.min(1, b / 255))
  )
}
