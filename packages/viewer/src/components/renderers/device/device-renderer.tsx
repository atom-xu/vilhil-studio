import { type DeviceNode, useScene } from '@pascal-app/core'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { getDeviceDefinition } from '@vilhil/smarthome'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { ErrorBoundary } from '../../error-boundary'
import { APCoverage, CurtainPanel, LightCone, PIRCoverage } from './animations'
import { DeviceGeometry } from './device-geometry'
import { DeviceIndicator } from './device-indicator'
import { DeviceLight } from './device-light'

// Device renderer - renders smart home devices in 3D
export const DeviceRenderer = ({ node }: { node: DeviceNode }) => {
  const ref = useRef<Group>(null!)
  const deviceDef = useMemo(() => {
    if (node.productId) {
      return getDeviceDefinition(node.productId)
    }
    return undefined
  }, [node.productId])

  // Subscribe to device state changes
  const deviceState = useScene((state) => {
    // This will be connected to the device state store
    // For now, return the node's local state
    return node.state
  })

  const handlers = useNodeEvents(node, 'device')
  const isOn = deviceState?.on ?? false

  return (
    <group
      position={node.position}
      ref={ref}
      rotation={node.rotation}
      visible={node.visible}
      {...handlers}
    >
      <ErrorBoundary
        fallback={
          <mesh>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshStandardMaterial color="#ff4444" />
          </mesh>
        }
      >
        {/* Device base geometry */}
        <DeviceGeometry
          mountType={node.mountType}
          renderType={node.renderType}
          size={deviceDef?.size}
          subsystem={node.subsystem}
        />

        {/* Status indicator (colored halo) */}
        <DeviceIndicator
          isOn={isOn}
          subsystem={node.subsystem}
          showAnimation={node.showAnimation}
        />

        {/* Light emission for lighting devices */}
        {node.subsystem === 'lighting' && isOn && (
          <DeviceLight
            brightness={deviceState?.brightness ?? 100}
            color={deviceState?.color ?? '#ffffff'}
            colorTemp={deviceState?.colorTemp}
            renderType={node.renderType}
          />
        )}

        {/* Coverage visualization for sensors/network */}
        {node.subsystem === 'network' && node.params?.coverageRadius && (
          <APCoverage
            radius={node.params.coverageRadius}
            position={[0, 0, 0]}
          />
        )}
        {node.subsystem === 'sensor' && node.params?.coverageRadius && (
          <PIRCoverage
            radius={node.params.coverageRadius}
            position={[0, 0, 0]}
          />
        )}

        {/* Light cone effect for lighting devices */}
        {node.subsystem === 'lighting' && isOn && (
          <LightCone
            position={[0, 0, 0]}
            isOn={isOn}
            brightness={(deviceState?.brightness ?? 100) / 100}
            beamAngle={node.params?.beamAngle ?? 30}
            height={node.position[1]}
          />
        )}

        {/* Curtain animation */}
        {node.subsystem === 'curtain' && (
          <CurtainPanel
            position={[0, 0, 0]}
            curtainWidth={node.params?.curtainWidth ?? 3}
            positionState={deviceState?.position ?? 'open'}
          />
        )}
      </ErrorBoundary>
    </group>
  )
}

