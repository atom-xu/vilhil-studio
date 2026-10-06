/** Local integration harness. Uses production device renderer, schema, store and tools.
 * Not an app route, a replacement product UI, or an end-to-end Studio acceptance page. */
import {
  type AnyNode,
  DeviceNode,
  LevelNode,
  SceneNode,
  useScene,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useDeviceState } from '@vilhil/smarthome/state'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type * as THREE from 'three'
import { applyScene } from '../../../packages/smarthome/src/tools/scene-tools'
import { setDeviceState } from '../../../packages/smarthome/src/tools/set-device-params'
import { DeviceRenderModeProvider } from '../../../packages/viewer/src/components/renderers/device/device-render-mode'
import { DeviceRenderer } from '../../../packages/viewer/src/components/renderers/device/device-renderer'

const ids = [
  'device_single',
  'device_dual',
  'device_upper',
  'device_blackout',
  'device_roller',
  'device_roman',
  'device_venetian',
] as const
const nodes: Record<AnyNode['id'], AnyNode> = {}
const add = (node: AnyNode) => {
  nodes[node.id] = node
}
add(LevelNode.parse({ id: 'level_lower' }))
add(LevelNode.parse({ id: 'level_upper', level: 1 }))
for (let i = 0; i < ids.length; i++) {
  const id = ids[i]!
  const upper = id === 'device_upper'
  const levelId = upper ? 'level_upper' : 'level_lower'
  const wallId = `wall_${i}`,
    windowId = `window_${i}`
  add(
    WallNode.parse({
      id: wallId,
      parentId: levelId,
      start: [-3, 0],
      end: [3, 0],
      thickness: 0.2,
      children: [windowId],
    }),
  )
  add(
    WindowNode.parse({
      id: windowId,
      parentId: wallId,
      wallId,
      position: [3, 1.52, 0],
      width: 3.84,
      height: 2.62,
    }),
  )
  add(
    DeviceNode.parse({
      id,
      parentId: levelId,
      subsystem: 'curtain',
      renderType: i >= 4 ? `curtain-${id.split('_')[1]}` : 'curtain-side-open',
      mountType: 'wall',
      params: {
        openingId: windowId,
        layers:
          id === 'device_dual'
            ? [{ material: 'blackout' }, { material: 'sheer' }]
            : [{ material: id === 'device_blackout' ? 'blackout' : 'sheer' }],
      },
      state:
        id === 'device_dual'
          ? { position: 100, layerPositions: [100, 50] }
          : { position: upper ? 80 : 0 },
    }),
  )
}
add(
  SceneNode.parse({
    id: 'scene_instant',
    name: 'Immediate target',
    effects: [{ deviceId: 'device_single', state: { position: 65 } }],
  }),
)
add(
  SceneNode.parse({
    id: 'scene_duration',
    name: 'Historical Tween path',
    effects: [{ deviceId: 'device_single', state: { position: 100 }, duration: 0.3 }],
  }),
)
const original = JSON.stringify(nodes)
useScene.getState().setScene(nodes, ['level_lower', 'level_upper'])
useScene.getState().setInteractionMode('operate')

function Box({
  size,
  position,
  color,
}: {
  size: [number, number, number]
  position: [number, number, number]
  color: string
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  )
}
function Backdrop() {
  return (
    <>
      <hemisphereLight args={['#fffdf5', '#a5a397', 1.1]} />
      <directionalLight position={[-3, 6, 5]} intensity={1.1} color="#fff6e4" />
      <directionalLight position={[1, 3, -2]} intensity={0.8} color="#e3f0f5" />
      <Box size={[7, 5, 0.08]} position={[0, 2, -1.2]} color="#bfd0ce" />
      <Box size={[7, 0.7, 0.1]} position={[0, 0.5, -1.12]} color="#9aa897" />
      <Box size={[1.25, 5.4, 0.24]} position={[-2.545, 2.7, -0.13]} color="#ddd8cc" />
      <Box size={[1.25, 5.4, 0.24]} position={[2.545, 2.7, -0.13]} color="#ddd8cc" />
      <Box size={[3.84, 2.56, 0.24]} position={[0, 4.12, -0.13]} color="#ddd8cc" />
      <Box size={[3.84, 0.2, 0.24]} position={[0, 0.1, -0.13]} color="#ddd8cc" />
      <Box size={[6.6, 0.1, 5.6]} position={[0, -0.05, 1.2]} color="#bcb09a" />
      <Box size={[0.042, 2.62, 0.1]} position={[0, 1.52, -0.04]} color="#7c8178" />
      <Box size={[3.84, 0.032, 0.1]} position={[0, 1.23, -0.04]} color="#7c8178" />
      <Box size={[0.065, 2.62, 0.1]} position={[-1.9, 1.52, -0.04]} color="#7c8178" />
      <Box size={[0.065, 2.62, 0.1]} position={[1.9, 1.52, -0.04]} color="#7c8178" />
    </>
  )
}

let activeScene: THREE.Scene
let activeRenderer: THREE.WebGLRenderer
let frames = 0
let activeCamera: THREE.Camera
function Probe() {
  const { scene, gl, camera } = useThree()
  useEffect(() => {
    activeScene = scene
    activeRenderer = gl
    activeCamera = camera
    camera.position.set(Math.sin(0.12) * 7.8, 2.5, Math.cos(0.12) * 7.8)
    camera.lookAt(0, 1.57, 0)
  }, [scene, gl, camera])
  useFrame(() => {
    frames++
  })
  return null
}

function snapshot() {
  const devices = Object.fromEntries(
    ids.map((id) => {
      const root = activeScene?.getObjectByName(id)
      const mesh = root?.getObjectByName('sheer-left') as THREE.Mesh | undefined
      const attribute = mesh?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
      const pos = attribute?.array
      const mat = mesh?.material as THREE.MeshPhysicalMaterial | undefined
      const blackoutGeometries: string[] = []
      const blackoutWidths: number[] = []
      root?.traverse((object) => {
        const candidate = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>
        if (candidate.material?.color?.getHex() === 0xf0ece4) {
          blackoutGeometries.push(candidate.geometry.uuid)
          const points = candidate.geometry.getAttribute('position')
          let width = 0
          for (let i = 0; i < points.count; i++) width = Math.max(width, points.getX(i))
          blackoutWidths.push(width)
        }
      })
      const lastColumn =
        (mesh?.geometry as THREE.PlaneGeometry | undefined)?.parameters?.widthSegments ?? 0
      return [
        id,
        {
          state: (useScene.getState().nodes[id] as DeviceNode)?.state,
          geometry: mesh?.geometry.uuid,
          material: mat?.uuid,
          blackoutGeometries,
          blackoutWidths,
          headerWidth: attribute?.getX(lastColumn),
          bottomWidth: attribute?.getX(attribute.count - 1),
          version: attribute?.version,
          opacity: mat?.opacity,
          alphaHash: mat?.alphaHash,
          alphaToCoverage: mat?.alphaToCoverage,
          depthWrite: mat?.depthWrite,
          worldAnchor: mesh
            ? [
                mesh.matrixWorld.elements[12],
                mesh.matrixWorld.elements[13],
                mesh.matrixWorld.elements[14],
              ]
            : null,
          finite: pos ? Array.from(pos).every(Number.isFinite) : null,
        },
      ]
    }),
  )
  return {
    devices,
    frames,
    memory: activeRenderer?.info.memory,
    calls: activeRenderer?.info.render.calls,
    samples: activeRenderer?.getContext().getParameter(activeRenderer.getContext().SAMPLES),
    parallelDeviceStates: useDeviceState.getState().deviceStates,
  }
}

function App() {
  const [active, setActive] = useState<string>('device_single')
  const [mounted, setMounted] = useState(true)
  const currentNodes = useScene((state) => state.nodes)
  const state = (currentNodes[active as DeviceNode['id']] as DeviceNode)?.state
  useEffect(() => {
    Object.assign(window, {
      studioFixture: {
        snapshot,
        placementProbe: () => {
          const restored = JSON.parse(original)
          restored.device_single.position = [1, 1.52, 0]
          restored.window_0.position = [4, 1.52, 0]
          useScene.getState().setScene(restored, ['level_lower', 'level_upper'])
        },
        select: setActive,
        mounted: setMounted,
        set: setDeviceState,
        restore: (position: number) => {
          const restored = JSON.parse(original)
          restored.device_single.state.position = position
          useScene.getState().setScene(restored, ['level_lower', 'level_upper'])
        },
        apply: applyScene,
        focus: (subsystem: 'curtain' | 'lighting' | null) =>
          useDeviceState.getState().selectSubsystem(subsystem),
        subsystemVisible: (visible: boolean) =>
          useDeviceState.getState().setSubsystemVisible('curtain', visible),
        angle: (angle: number) => {
          activeCamera.position.set(Math.sin(angle) * 7.8, 2.5, Math.cos(angle) * 7.8)
          activeCamera.lookAt(0, 1.57, 0)
        },
        mode: (mode: 'edit' | 'operate' | 'view') => useScene.getState().setInteractionMode(mode),
      },
    })
  }, [])
  return (
    <>
      <header>
        <strong>Studio · 对开纱帘接入验证</strong>
        <span>真实设备组件 / 本地测试夹具 · 非完整 Studio 页面</span>
      </header>
      <nav>
        {ids.map((id) => (
          <button key={id} onClick={() => setActive(id)}>
            {id.replace('device_', '')}
          </button>
        ))}
        {[0, 50, 100].map((value) => (
          <button
            key={value}
            onClick={() => setDeviceState(active as DeviceNode['id'], { position: value })}
          >
            {value}%
          </button>
        ))}
        <output>
          {active} · state {JSON.stringify(state)}
        </output>
      </nav>
      <main>
        <Canvas
          dpr={1.25}
          camera={{ fov: 38, near: 0.1, far: 40 }}
          gl={{
            antialias: new URLSearchParams(location.search).has('msaa'),
            alpha: false,
            preserveDrawingBuffer: true,
          }}
        >
          <color attach="background" args={['#e9e6df']} />
          <Probe />
          <Backdrop />
          <DeviceRenderModeProvider mode="demo">
            {mounted &&
              ids.map((id) => (
                <group key={id} name={id} visible={active === id}>
                  <DeviceRenderer node={currentNodes[id] as DeviceNode} />
                </group>
              ))}
          </DeviceRenderModeProvider>
        </Canvas>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  new URLSearchParams(location.search).has('strict') ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <App />
  ),
)
