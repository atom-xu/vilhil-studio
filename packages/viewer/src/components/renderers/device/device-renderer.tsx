import { type DeviceNode, useRegistry, useScene } from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import type { Group, Material, Mesh } from 'three'
import { getDeviceDefinition, useSelectedSubsystem, useSubsystemVisibility } from '@vilhil/smarthome'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { ErrorBoundary } from '../../error-boundary'
import { DeviceEffects } from './device-effects'
import { DeviceGeometry } from './device-geometry'
import { useDeviceRenderMode } from './device-render-mode'
import { EditorDeviceIndicator } from './editor-device-indicator'

/**
 * DeviceRenderer —— 设备节点的基础渲染层
 *
 * 两种模式（由 DeviceRenderModeProvider 上下文决定）：
 *
 *   - **base（默认，编辑器用）**：只渲染 2D 平面示意（EditorDeviceIndicator），
 *     投影到地面。**无任何 3D 效果、无 GLB 模型、无光照**。保持"建模工具"的
 *     快速和直接。
 *
 *   - **demo（演示页用）**：渲染完整 3D 模型（DeviceGeometry）+ 9 子系统动画
 *     （DeviceEffects）。包含 LightCone / 激光扫描 / ribbon / 粒子等。
 *
 * 两种模式共享：
 *   - useRegistry（射线/选择）
 *   - useScene 订阅（state/params 真值）
 *   - 事件绑定（click / hover）
 *   - 子系统显隐（visibility）
 */
export const DeviceRenderer = ({ node }: { node: DeviceNode }) => {
  const ref = useRef<Group>(null!)
  const materialFocusKey = '__vilhilFocusBase'
  const mode = useDeviceRenderMode()

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

  const handlers = useNodeEvents(node, 'device')
  const isOn = (deviceState?.on as boolean) ?? false

  // 子系统聚焦淡化 —— 仅对 demo 模式的 3D 模型有意义
  // base 模式是 2D 示意，自身已经很轻，不做淡化
  useEffect(() => {
    if (mode !== 'demo') return
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
  }, [isFocusedBySubsystem, materialFocusKey, mode])

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
        {mode === 'demo' ? (
          <>
            {/* 演示页：完整 3D 模型 */}
            <DeviceGeometry
              mountType={node.mountType}
              renderType={node.renderType}
              size={deviceDef?.size}
              subsystem={node.subsystem}
              // 灯带（lightType=line）需要 path 和 emissionDirection 才能渲染折线管几何
              path={(node.params as any)?.path as Array<[number, number]> | undefined}
              centroidWorld={[node.position[0], node.position[2]]}
              emissionDirection={(node.params as any)?.emissionDirection}
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
            {/* 演示页专用动态效果层 */}
            <DeviceEffects node={node} isFocusedBySubsystem={isFocusedBySubsystem} />
          </>
        ) : (
          /* 编辑器：只放 2D 平面示意（投影到地面） */
          <EditorDeviceIndicator node={node} />
        )}
      </ErrorBoundary>
    </group>
  )
}
