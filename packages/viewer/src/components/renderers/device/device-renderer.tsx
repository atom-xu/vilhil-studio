import { type DeviceNode, useRegistry, useScene } from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import type { Group, Material, Mesh } from 'three'
import { getDeviceDefinition, useSelectedSubsystem, useSubsystemVisibility } from '@vilhil/smarthome'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { ErrorBoundary } from '../../error-boundary'
import { APCoverage, CameraFOV, CurtainPanel, HvacAirflow, LightCone, PIRCoverage } from './animations'
import { DeviceGeometry } from './device-geometry'
import { DeviceIndicator } from './device-indicator'
import { DeviceLight } from './device-light'

// Device renderer - renders smart home devices in 3D
export const DeviceRenderer = ({ node }: { node: DeviceNode }) => {
  const ref = useRef<Group>(null!)
  const materialFocusKey = '__vilhilFocusBase'

  // 注册到空间查询系统 — 使得选中、射线检测、表面策略均可感知设备
  useRegistry(node.id, 'device', ref)

  // 子系统显隐控制 — SubsystemBar 切换时立即生效
  const isSubsystemVisible = useSubsystemVisibility(node.subsystem)
  const selectedSubsystem = useSelectedSubsystem()
  const isFocusedBySubsystem = selectedSubsystem === null || selectedSubsystem === node.subsystem

  const deviceDef = useMemo(() => {
    if (node.productId) {
      return getDeviceDefinition(node.productId)
    }
    return undefined
  }, [node.productId])

  // 直接从 store 订阅 state — 任何 setDeviceState() 调用都立即触发重渲染
  const deviceState = useScene((state) => {
    const devNode = state.nodes[node.id] as DeviceNode | undefined
    return devNode?.state as Record<string, unknown> | undefined
  })

  // 直接从 store 订阅 params — setDeviceParams() 立即反映
  const deviceParams = useScene((state) => {
    const devNode = state.nodes[node.id] as DeviceNode | undefined
    return devNode?.params
  })

  const handlers = useNodeEvents(node, 'device')
  const isOn = (deviceState?.on as boolean) ?? false

  // 子系统聚焦：未选中的设备降低存在感，但不完全隐藏
  useEffect(() => {
    const group = ref.current
    if (!group) return

    const applyToMaterial = (material: Material) => {
      const mat = material as Material & {
        opacity?: number
        transparent?: boolean
        depthWrite?: boolean
        userData: Record<string, unknown>
        needsUpdate?: boolean
      }
      if (typeof mat.opacity !== 'number') return

      if (!mat.userData[materialFocusKey]) {
        mat.userData[materialFocusKey] = {
          opacity: mat.opacity,
          transparent: mat.transparent ?? false,
          depthWrite: mat.depthWrite ?? true,
        }
      }

      const base = mat.userData[materialFocusKey] as {
        opacity: number
        transparent: boolean
        depthWrite: boolean
      }

      if (isFocusedBySubsystem) {
        mat.opacity = base.opacity
        mat.transparent = base.transparent
        mat.depthWrite = base.depthWrite
      } else {
        mat.opacity = Math.max(0.15, Math.min(base.opacity, 0.22))
        mat.transparent = true
        mat.depthWrite = false
      }

      mat.needsUpdate = true
    }

    group.traverse((obj) => {
      const mesh = obj as Mesh & { material?: Material | Material[] }
      if (!mesh.material) return
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(applyToMaterial)
      } else {
        applyToMaterial(mesh.material)
      }
    })
  }, [isFocusedBySubsystem, materialFocusKey])

  // 子系统隐藏时不渲染（返回空 group 以保持 ref 注册）
  if (!isSubsystemVisible) {
    return <group ref={ref} visible={false} {...handlers} />
  }

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
        {/* Device base geometry — visualState 供 Kimi 的 3D 模型接收 */}
        <DeviceGeometry
          mountType={node.mountType}
          renderType={node.renderType}
          size={deviceDef?.size}
          subsystem={node.subsystem}
          visualState={{
            on: isOn,
            brightness: (deviceState?.brightness as number) ?? 100,
            color: (deviceState?.color as string) ?? '#ffffff',
            colorTemp: deviceState?.colorTemp as number | undefined,
            angle: (deviceState?.angle as number) ?? 0,
            locked: (deviceState?.locked as boolean) ?? false,
            triggered: (deviceState?.triggered as boolean) ?? false,
            position: (deviceState?.position as number) ?? 0,
            signalStrength: (deviceState?.signalStrength as number) ?? 100,
          }}
        />

        {/* Status indicator (colored halo) */}
        <DeviceIndicator
          isOn={isOn}
          subsystem={node.subsystem}
          showAnimation={node.showAnimation}
        />

        {/* Light emission for lighting devices
            S4: always rendered for lighting devices, brightness=0 when off.
            DeviceLight internally lerps brightness & colorTemp, giving smooth
            fade-in / fade-out. No Zustand writes during animation. */}
        {node.subsystem === 'lighting' && (
          <DeviceLight
            brightness={isOn ? ((deviceState?.brightness as number | undefined) ?? 100) : 0}
            color={(deviceState?.color as string | undefined) ?? '#ffffff'}
            colorTemp={deviceState?.colorTemp as number | undefined}
            renderType={node.renderType}
          />
        )}

        {/* Coverage visualization for sensors/network */}
        {node.subsystem === 'network' && deviceParams?.coverageRadius && (
          <APCoverage
            radius={deviceParams.coverageRadius as number}
            position={[0, 0, 0]}
          />
        )}
        {node.subsystem === 'sensor' && deviceParams?.coverageRadius && (
          <PIRCoverage
            radius={deviceParams.coverageRadius as number}
            position={[0, 0, 0]}
          />
        )}

        {/* Light cone — always rendered, brightness=0 when off for smooth fade-out */}
        {node.subsystem === 'lighting' && (
          <LightCone
            position={[0, 0, 0]}
            brightness={isOn ? ((deviceState?.brightness as number) ?? 100) / 100 : 0}
            beamAngle={(deviceParams?.beamAngle as number) ?? 30}
            height={node.position[1]}
          />
        )}

        {/* Security camera FOV */}
        {node.subsystem === 'security' && (node.renderType === 'dome-camera' || node.renderType === 'bullet-camera') && (
          <CameraFOV
            position={[0, 0, 0]}
            fov={(deviceParams?.coverageAngle as number) ?? 90}
            range={(deviceParams?.coverageRadius as number) ?? 5}
          />
        )}

        {/* HVAC airflow */}
        {node.subsystem === 'hvac' && (
          <HvacAirflow
            position={[0, 0, 0]}
            intensity={isOn ? 1 : 0}
            height={node.position[1]}
          />
        )}

        {/* Curtain animation */}
        {node.subsystem === 'curtain' && (
          <CurtainPanel
            position={[0, 0, 0]}
            curtainWidth={(deviceParams?.curtainWidth as number | undefined) ?? 3}
            positionState={(() => {
              const pos = (deviceState?.position as number | undefined) ?? 0
              if (pos <= 5) return 'open'
              if (pos >= 95) return 'closed'
              return 'half'
            })()}
          />
        )}
      </ErrorBoundary>
    </group>
  )
}
