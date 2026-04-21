import {
  type AnimationEffect,
  type AnyNodeId,
  type Interactive,
  type ItemNode,
  type LightEffect,
  type RotationEffect,
  type SliderControl,
  type Subsystem,
  type WallArm,
  useInteractive,
  useRegistry,
  useScene,
} from '@pascal-app/core'
import { useDeviceState } from '@vilhil/smarthome'
import { useAnimations } from '@react-three/drei'
import { Clone } from '@react-three/drei/core/Clone'
import { useGLTF } from '@react-three/drei/core/Gltf'
import { useFrame } from '@react-three/fiber'
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react'
import type { Group, Material, Mesh } from 'three'
// @ts-ignore
type AnimationAction = any
import { MathUtils } from 'three'
import { positionLocal, pow, sin, smoothstep, time, uv, vec3 } from 'three/tsl'
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { resolveCdnUrl } from '../../../lib/asset-url'
import { useItemLightPool } from '../../../store/use-item-light-pool'
import { ErrorBoundary } from '../../error-boundary'
import { NodeRenderer } from '../node-renderer'

// Shared materials to avoid creating new instances for every mesh
const defaultMaterial = new MeshStandardNodeMaterial({
  color: 0xff_ff_ff,
  roughness: 1,
  metalness: 0,
})

const glassMaterial = new MeshStandardNodeMaterial({
  name: 'glass',
  color: 'lightgray',
  roughness: 0.8,
  metalness: 0,
  transparent: true,
  opacity: 0.35,
  side: DoubleSide,
  depthWrite: false,
})

const getMaterialForOriginal = (original: Material): MeshStandardNodeMaterial => {
  if (original.name.toLowerCase() === 'glass') {
    return glassMaterial
  }
  return defaultMaterial
}

const wallArmMaterial = new MeshStandardNodeMaterial({
  color: '#6b7280',
  roughness: 0.8,
  metalness: 0.3,
})

// ── Camera FOV cone — laser_cone.js ported to TSL ──────────────────
// Adapted from the multi-layer ConeGeometry scan-line technique.
// Materials are module-level singletons: all cones in the scene share
// them and animate together via the global `time` node.
// Bright saturated orange — visible on both dark and daylit surfaces with additive blending
const CONE_COLOR = '#f57c20'
const TAU = Math.PI * 2

// Dense scan-line cone — NormalBlending (no glow), very low opacity.
// 5 frequency bands per layer: different line counts, drift directions, V-lengths.
// Lines are very thin (pow 12-18). Gaps are fully transparent.
//   u = UV.x (0→1 around circumference)
//   v = UV.y (0 = far end, 1 = near camera/tip)
function makeScanLayer(li: number, maxOp: number) {
  const mat = new MeshBasicNodeMaterial({
    color: CONE_COLOR,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,  // adds light only — alpha=0 gaps leave background untouched
  })
  const u = uv().x
  const v = uv().y

  // Phase offset per layer (~120°) so layers don't coincide angularly
  const ph = li * 2.09
  // Use li%3 for drift speeds so outer/inner layers feel independent
  const s = li % 3

  // ── 5 frequency bands — each with unique count, speed, direction, reach ──
  // f1: 14 lines — nearly full reach (≈82%), very slow clockwise
  const f1 = pow(
    sin(u.sub(time.mul(0.011 + s * 0.003)).mul(14 * TAU).add(ph)).mul(0.5).add(0.5),
    12,
  ).mul(smoothstep(0.04, 0.16, v))

  // f2: 28 lines — 3/4 reach (≈66%), counter-clockwise
  const f2 = pow(
    sin(u.add(time.mul(0.016 + s * 0.003)).mul(28 * TAU).add(ph * 1.3)).mul(0.5).add(0.5),
    15,
  ).mul(smoothstep(0.22, 0.34, v)).mul(0.85)

  // f3: 21 lines — 1/2 reach (≈48%), fills center zone
  const f3 = pow(
    sin(u.sub(time.mul(0.020 + s * 0.004)).mul(21 * TAU).add(ph * 0.7)).mul(0.5).add(0.5),
    14,
  ).mul(smoothstep(0.40, 0.52, v)).mul(0.75)

  // f4: 42 lines — very fine, 2/3 reach (≈60%), high-density center fill
  const f4 = pow(
    sin(u.add(time.mul(0.014 + s * 0.002)).mul(42 * TAU).add(ph * 1.7)).mul(0.5).add(0.5),
    18,
  ).mul(smoothstep(0.30, 0.42, v)).mul(0.60)

  // f5: 7 lines — short near-camera bursts (≈14%), slowest drift
  const f5 = pow(
    sin(u.sub(time.mul(0.008 + s * 0.002)).mul(7 * TAU).add(ph * 2.1)).mul(0.5).add(0.5),
    14,
  ).mul(smoothstep(0.64, 0.74, v)).mul(0.65)

  // Accumulate; transparent gaps stay ~0 because of high pow values
  const alpha = f1.add(f2).add(f3).add(f4).add(f5).min(1.0)

  const tipFade = smoothstep(1.0, 0.84, v)   // cone tip converges to a point
  const farFade = smoothstep(0.0, 0.12, v)    // soft far-edge (no hard circle rim)

  mat.opacityNode = alpha.mul(tipFade).mul(farFade).mul(maxOp)
  return mat
}

// Outer surface — full FOV radius, boundary lines
const OUTER_LAYERS = [
  makeScanLayer(0, 0.22),
  makeScanLayer(1, 0.15),
  makeScanLayer(2, 0.10),
]
// Inner surface — 55% of FOV angle, interior laser lines for 3D depth
const INNER_LAYERS = [
  makeScanLayer(3, 0.13),
  makeScanLayer(4, 0.09),
  makeScanLayer(5, 0.06),
]
// ───────────────────────────────────────────────────────────────────

const CameraFovCone = ({
  fov,
  range,
  attachTo,
  offset,
  yaw,
  visible = true,
}: {
  fov: number
  range: number
  attachTo: string | undefined
  offset: [number, number, number]
  yaw: number  // degrees — rotates cone only, model stays fixed
  visible?: boolean
}) => {
  const halfAngle = (fov / 2) * (Math.PI / 180)
  // Outer cone: full FOV boundary. Inner cone: 55% angle gives interior laser lines.
  const outerRadius = Math.tan(halfAngle) * range
  const innerRadius = Math.tan(halfAngle * 0.55) * range
  const needsXRot = attachTo !== 'ceiling'
  return (
    <group position={offset} rotation-y={(yaw * Math.PI) / 180} visible={visible}>
      <group rotation-x={needsXRot ? -Math.PI / 2 : 0}>
        {OUTER_LAYERS.map((mat, i) => (
          <mesh key={`o${i}`} material={mat} position-y={-range / 2}>
            <coneGeometry args={[outerRadius, range, 64, 1, true]} />
          </mesh>
        ))}
        {INNER_LAYERS.map((mat, i) => (
          <mesh key={`n${i}`} material={mat} position-y={-range / 2}>
            <coneGeometry args={[innerRadius, range, 64, 1, true]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// Pulsing emissive overlay for active interactive items
const highlightMaterial = new MeshStandardNodeMaterial({
  color: '#3b82f6',
  roughness: 1,
  metalness: 0,
  transparent: true,
  opacity: 0.15,
  depthWrite: false,
  side: DoubleSide,
})
// blue-500 (#3b82f6 ≈ 0.231, 0.510, 0.965) pulsing via sin wave
highlightMaterial.emissiveNode = vec3(0.231, 0.510, 0.965).mul(sin(time.mul(2.5)).mul(0.4).add(0.6))

// Procedural wall arm + mount plate, rendered when asset.wallArm is defined.
// The plate straddles the wall face (Z=0); the arm extends toward +Z (room side).
const WallArmBracket = ({ arm }: { arm: NonNullable<WallArm> }) => {
  const { length, thickness } = arm
  const plate = Math.max(thickness * 3, 0.04)
  return (
    <>
      <mesh material={wallArmMaterial}>
        <boxGeometry args={[plate, plate, plate]} />
      </mesh>
      <mesh material={wallArmMaterial} position-z={length / 2}>
        <boxGeometry args={[thickness, thickness, length]} />
      </mesh>
    </>
  )
}

const BrokenItemFallback = ({ node }: { node: ItemNode }) => {
  const handlers = useNodeEvents(node, 'item')
  const [w, h, d] = node.asset.dimensions
  return (
    <mesh position-y={h / 2} {...handlers}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color="#ef4444" opacity={0.6} transparent wireframe />
    </mesh>
  )
}

// Shown on top of the white model when the item's primary toggle is ON.
// Uses a slightly-expanded bounding box so the glow wraps the silhouette.
const ActiveHighlight = ({ node }: { node: ItemNode }) => {
  const isActive = useInteractive((s) => {
    if (!node.asset.interactive) return false
    const values = s.items[node.id]?.controlValues
    const toggleIndex = node.asset.interactive.controls.findIndex((c) => c.kind === 'toggle')
    return toggleIndex >= 0 ? Boolean(values?.[toggleIndex]) : false
  })

  if (!isActive) return null

  const [w, h, d] = node.asset.dimensions
  const off = (node.asset.offset as [number, number, number] | undefined) ?? [0, 0, 0]

  return (
    <mesh
      material={highlightMaterial}
      position={[off[0], off[1] + h / 2, off[2]]}
      scale={1.08}
    >
      <boxGeometry args={[w, h, d]} />
    </mesh>
  )
}

// tag → subsystem 映射（目前只有 security；后续可扩展）
function tagToSubsystem(tags: string[] | undefined): Subsystem | null {
  if (tags?.includes('security')) return 'security'
  if (tags?.includes('network')) return 'network'
  if (tags?.includes('lighting')) return 'lighting'
  return null
}

export const ItemRenderer = ({ node }: { node: ItemNode }) => {
  const ref = useRef<Group>(null!)

  useRegistry(node.id, node.type, ref)

  // 子系统显隐/聚焦支持（与 DeviceRenderer 对齐）
  const itemSubsystem = tagToSubsystem(node.asset.tags)
  const visibleSubsystems = useDeviceState((s) => s.visibleSubsystems)
  const selectedSubsystem = useDeviceState((s) => s.selectedSubsystem)
  const isSubsystemVisible = itemSubsystem ? visibleSubsystems[itemSubsystem] : true
  // 无子系统选中 → 全亮；有选中 → 只有匹配的子系统亮，其余（含无 tag 家具）全暗
  const isFocused = selectedSubsystem === null || itemSubsystem === selectedSubsystem

  // 隐藏时返回空 group（保持 ref 注册）
  if (!isSubsystemVisible) {
    return <group ref={ref} visible={false} />
  }

  return (
    <group
      position={node.position}
      ref={ref}
      rotation={node.rotation}
      visible={node.visible}
    >
      <ErrorBoundary fallback={<BrokenItemFallback node={node} />}>
        <Suspense fallback={<PreviewModel node={node} />}>
          <ModelRenderer isFocused={isFocused} node={node} />
        </Suspense>
      </ErrorBoundary>
      {node.asset.interactive && <ActiveHighlight node={node} />}
      {node.children?.map((childId) => (
        <NodeRenderer key={childId} nodeId={childId} />
      ))}
    </group>
  )
}

const previewMaterial = new MeshStandardNodeMaterial({
  color: '#cccccc',
  roughness: 1,
  metalness: 0,
  depthTest: false,
})

const previewOpacity = smoothstep(0.42, 0.55, positionLocal.y.add(time.mul(-0.2)).mul(10).fract())

previewMaterial.opacityNode = previewOpacity
previewMaterial.transparent = true

const PreviewModel = ({ node }: { node: ItemNode }) => {
  return (
    <mesh material={previewMaterial} position-y={node.asset.dimensions[1] / 2}>
      <boxGeometry
        args={[node.asset.dimensions[0], node.asset.dimensions[1], node.asset.dimensions[2]]}
      />
    </mesh>
  )
}

const multiplyScales = (
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] => [a[0] * b[0], a[1] * b[1], a[2] * b[2]]

// Per-instance material dim/restore — clones shared singleton materials once per mesh.
// Called in useEffect with [isFocused, scene] deps so it fires after load and on focus changes.
const FOCUS_CLONE_KEY = '__vilhilFocusClone'
function applyFocusDim(group: Group, isFocused: boolean) {
  group.traverse((obj: any) => {
    if (!obj.isMesh) return
    if (!obj.userData[FOCUS_CLONE_KEY]) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      const clones = mats.map((m: any) => {
        if (!m) return m
        const c = m.clone()
        c.__focusBaseOpacity = m.opacity ?? 1
        c.__focusBaseTransparent = m.transparent ?? false
        c.__focusBaseDepthWrite = m.depthWrite ?? true
        return c
      })
      obj.userData[FOCUS_CLONE_KEY] = clones
      obj.material = Array.isArray(obj.material) ? clones : clones[0]
    }
    const clones: any[] = obj.userData[FOCUS_CLONE_KEY]
    clones.forEach((c: any) => {
      if (!c) return
      if (isFocused) {
        c.opacity = c.__focusBaseOpacity
        c.transparent = c.__focusBaseTransparent
        c.depthWrite = c.__focusBaseDepthWrite
      } else {
        c.opacity = 0.15
        c.transparent = true
        c.depthWrite = false
      }
      c.needsUpdate = true
    })
  })
}

const ModelRenderer = ({ node, isFocused = true }: { node: ItemNode; isFocused?: boolean }) => {
  const { scene, nodes, animations } = useGLTF(resolveCdnUrl(node.asset.src) || '')
  const ref = useRef<Group>(null!)
  const { actions } = useAnimations(animations, ref)
  // Freeze the interactive definition at mount — asset schemas don't change at runtime
  const interactiveRef = useRef(node.asset.interactive)

  if (nodes.cutout) {
    nodes.cutout.visible = false
  }

  const handlers = useNodeEvents(node, 'item')

  useEffect(() => {
    if (!node.parentId) return
    useScene.getState().dirtyNodes.add(node.parentId as AnyNodeId)
  }, [node.parentId])

  useEffect(() => {
    const interactive = interactiveRef.current
    if (!interactive) return
    useInteractive.getState().initItem(node.id, interactive)
    return () => useInteractive.getState().removeItem(node.id)
  }, [node.id])

  useMemo(() => {
    scene.traverse((child: any) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        if (mesh.name === 'cutout') {
          child.visible = false
          return
        }

        let hasGlass = false

        // Handle both single material and material array cases
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((mat) => getMaterialForOriginal(mat))
          hasGlass = mesh.material.some((mat) => mat.name === 'glass')
        } else {
          mesh.material = getMaterialForOriginal(mesh.material)
          hasGlass = mesh.material.name === 'glass'
        }
        mesh.castShadow = !hasGlass
        mesh.receiveShadow = !hasGlass
      }
    })
  }, [scene])

  // Per-instance material dim — runs after Clone renders (ref.current is the clone group)
  useEffect(() => {
    if (!ref.current) return
    applyFocusDim(ref.current, isFocused)
  }, [isFocused, scene])

  const interactive = interactiveRef.current
  const animEffect =
    interactive?.effects.find((e): e is AnimationEffect => e.kind === 'animation') ?? null
  const lightEffects =
    interactive?.effects.filter((e): e is LightEffect => e.kind === 'light') ?? []
  const rotationEffects =
    interactive?.effects.filter((e): e is RotationEffect => e.kind === 'rotation') ?? []

  // When a rotation effect targets __clone__, we own the corrective rotation via
  // ItemRotationEffect (base + delta). Don't set it as a React prop on Clone or
  // the reconciler will fight useFrame every re-render.
  const hasCloneRotation = rotationEffects.some((e) => e.nodeName === '__clone__')
  const corrective = node.asset.rotation

  return (
    <>
      {node.asset.wallArm && <WallArmBracket arm={node.asset.wallArm} />}
      {node.asset.tags?.includes('security') && (
        <CameraFovCone
          fov={node.cameraParams?.fov ?? 60}
          range={node.cameraParams?.range ?? 8}
          attachTo={node.asset.attachTo}
          offset={node.asset.offset}
          yaw={node.cameraParams?.yaw ?? 0}
          visible={isFocused}
        />
      )}
      <Clone
        object={scene}
        position={node.asset.offset}
        ref={ref}
        rotation={hasCloneRotation ? undefined : corrective}
        scale={multiplyScales(node.asset.scale || [1, 1, 1], node.scale || [1, 1, 1])}
        {...handlers}
      />
      {animations.length > 0 && (
        <ItemAnimation
          actions={actions}
          animations={animations}
          animEffect={animEffect}
          interactive={interactive ?? null}
          nodeId={node.id}
        />
      )}
      {lightEffects.map((effect, i) => (
        <ItemLightRegistrar
          effect={effect}
          index={i}
          interactive={interactive!}
          key={i}
          nodeId={node.id}
        />
      ))}
      {rotationEffects.map((effect, i) => (
        <ItemRotationEffect
          cloneRef={ref}
          corrective={hasCloneRotation && effect.nodeName === '__clone__' ? corrective : null}
          effect={effect}
          interactive={interactive!}
          key={i}
          nodeId={node.id}
        />
      ))}
    </>
  )
}

const ItemRotationEffect = ({
  nodeId,
  cloneRef,
  corrective,
  effect,
  interactive,
}: {
  nodeId: AnyNodeId
  cloneRef: RefObject<Group>
  corrective: [number, number, number] | null
  effect: RotationEffect
  interactive: Interactive
}) => {
  useFrame(() => {
    const s = useInteractive.getState()
    const values = s.items[nodeId]?.controlValues
    const raw = (values?.[effect.controlIndex] as number) ?? 0
    const ctrl = interactive.controls[effect.controlIndex] as SliderControl
    if (!ctrl || ctrl.kind !== 'slider') return
    const span = ctrl.max - ctrl.min
    if (span === 0) return
    const t = Math.max(0, Math.min(1, (raw - ctrl.min) / span))
    const delta = effect.range[0] + t * (effect.range[1] - effect.range[0])
    // corrective is the asset's base rotation for this axis — applied as offset so
    // the slider range is a true delta (e.g. ±90°) around the model's natural orientation.
    const axisIndex = effect.axis === 'x' ? 0 : effect.axis === 'y' ? 1 : 2
    const base = corrective ? corrective[axisIndex] : 0
    const obj =
      effect.nodeName === '__clone__'
        ? cloneRef.current
        : cloneRef.current?.getObjectByName(effect.nodeName)
    if (obj) obj.rotation[effect.axis] = base + delta
  })
  return null
}

const ItemAnimation = ({
  nodeId,
  animEffect,
  interactive,
  actions,
  animations,
}: {
  nodeId: AnyNodeId
  animEffect: AnimationEffect | null
  interactive: Interactive | null
  actions: Record<string, AnimationAction | null>
  animations: { name: string }[]
}) => {
  const activeClipRef = useRef<string | null>(null)
  const fadingOutRef = useRef<AnimationAction | null>(null)

  // Reactive: derive target clip name — only re-renders when the clip name itself changes
  const targetClip = useInteractive((s) => {
    const values = s.items[nodeId]?.controlValues
    if (!animEffect) return animations[0]?.name ?? null
    const toggleIndex = interactive!.controls.findIndex((c) => c.kind === 'toggle')
    const isOn = toggleIndex >= 0 ? Boolean(values?.[toggleIndex]) : false
    return isOn
      ? (animEffect.clips.on ?? null)
      : (animEffect.clips.off ?? animEffect.clips.loop ?? null)
  })

  // When target clip changes: kick off the transition
  useEffect(() => {
    // Cancel any ongoing fade-out immediately
    if (fadingOutRef.current) {
      fadingOutRef.current.timeScale = 0
      fadingOutRef.current = null
    }
    // Move current clip to fade-out
    if (activeClipRef.current && activeClipRef.current !== targetClip) {
      const old = actions[activeClipRef.current]
      if (old?.isRunning()) fadingOutRef.current = old
    }
    // Start new clip at timeScale 0.01 (as 0 would cause isRunning to be false and thus not play at all), then fade in to 1
    activeClipRef.current = targetClip
    if (targetClip) {
      const next = actions[targetClip]
      if (next) {
        next.timeScale = 0.01
        next.play()
      }
    }
  }, [targetClip, actions])

  // useFrame: only lerping — no logic
  useFrame((_, delta) => {
    if (fadingOutRef.current) {
      const action = fadingOutRef.current
      action.timeScale = MathUtils.lerp(action.timeScale, 0, Math.min(delta * 5, 1))
      if (action.timeScale < 0.01) {
        action.timeScale = 0
        fadingOutRef.current = null
      }
    }
    if (activeClipRef.current) {
      const action = actions[activeClipRef.current]
      if (action?.isRunning() && action.timeScale < 1) {
        action.timeScale = MathUtils.lerp(action.timeScale, 1, Math.min(delta * 5, 1))
        if (1 - action.timeScale < 0.01) action.timeScale = 1
      }
    }
  })

  return null
}

const ItemLightRegistrar = ({
  nodeId,
  effect,
  interactive,
  index,
}: {
  nodeId: AnyNodeId
  effect: LightEffect
  interactive: Interactive
  index: number
}) => {
  useEffect(() => {
    const key = `${nodeId}:${index}`
    useItemLightPool.getState().register(key, nodeId, effect, interactive)
    return () => useItemLightPool.getState().unregister(key)
  }, [nodeId, index, effect, interactive])

  return null
}
