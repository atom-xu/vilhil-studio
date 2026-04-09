'use client'

import { type DeviceNode, generateId, SceneNode, useScene } from '@pascal-app/core'
import { ProposalLayout } from '@pascal-app/editor'
import { useViewer, Viewer } from '@pascal-app/viewer'
import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'

// ─── 演示场景 ───────────────────────────────────────────────────────────────

/**
 * 客厅场景 — 6m×5m 现代风格客厅
 * 材质使用深色暖调，灯光开启时有明显对比，关闭时仍能看清房间结构
 */
function DemoRoom() {
  return (
    <group>
      {/* 补光：轻微底光，让房间结构在灯光关闭时也隐约可见 */}
      <ambientLight color="#fff5e0" intensity={0.18} />
      <directionalLight
        castShadow
        color="#fff8f0"
        intensity={0.35}
        position={[4, 6, 5]}
      />

      {/* 地板 — 深色实木纹 */}
      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.2, 5.2]} />
        <meshStandardMaterial color="#3a2e20" metalness={0} roughness={0.85} />
      </mesh>

      {/* 后墙（窗帘墙） */}
      <mesh position={[0, 1.35, -2.6]} receiveShadow>
        <boxGeometry args={[6.2, 2.7, 0.12]} />
        <meshStandardMaterial color="#2e2820" roughness={0.95} />
      </mesh>

      {/* 左墙 */}
      <mesh position={[-3.06, 1.35, 0]} receiveShadow>
        <boxGeometry args={[0.12, 2.7, 5.2]} />
        <meshStandardMaterial color="#2a2418" roughness={0.95} />
      </mesh>

      {/* 右墙 */}
      <mesh position={[3.06, 1.35, 0]} receiveShadow>
        <boxGeometry args={[0.12, 2.7, 5.2]} />
        <meshStandardMaterial color="#2a2418" roughness={0.95} />
      </mesh>

      {/* 天花板 — 半透明磨砂玻璃，只显示边界轮廓，让摄像机从上方看透室内 */}
      <mesh position={[0, 2.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.2, 5.2]} />
        <meshStandardMaterial
          color="#ffffff"
          depthWrite={false}
          metalness={0}
          opacity={0.02}
          roughness={1}
          side={2}
          transparent
        />
      </mesh>

      {/* 踢脚线 — 浅色收边 */}
      <mesh position={[0, 0.05, -2.53]}>
        <boxGeometry args={[6.0, 0.10, 0.02]} />
        <meshStandardMaterial color="#4a4030" roughness={0.6} />
      </mesh>
      <mesh position={[-2.99, 0.05, 0]}>
        <boxGeometry args={[0.02, 0.10, 5.0]} />
        <meshStandardMaterial color="#4a4030" roughness={0.6} />
      </mesh>
      <mesh position={[2.99, 0.05, 0]}>
        <boxGeometry args={[0.02, 0.10, 5.0]} />
        <meshStandardMaterial color="#4a4030" roughness={0.6} />
      </mesh>

      {/* ── 电视墙区域 ─────────────────────────────────────────── */}

      {/* 电视背景墙装饰面板 */}
      <mesh position={[0, 1.35, -2.57]}>
        <boxGeometry args={[3.0, 2.4, 0.04]} />
        <meshStandardMaterial color="#1e1a14" metalness={0.05} roughness={0.8} />
      </mesh>

      {/* 电视柜 */}
      <mesh castShadow position={[0, 0.22, -2.43]}>
        <boxGeometry args={[2.4, 0.44, 0.50]} />
        <meshStandardMaterial color="#2d2518" metalness={0.08} roughness={0.55} />
      </mesh>
      {/* 电视柜腿 */}
      {([-0.95, 0.95] as number[]).map((x) => (
        <mesh castShadow key={x} position={[x, 0.06, -2.42]}>
          <boxGeometry args={[0.06, 0.12, 0.06]} />
          <meshStandardMaterial color="#5a4f3a" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}

      {/* 电视屏幕（黑屏） */}
      <mesh position={[0, 1.0, -2.55]}>
        <boxGeometry args={[1.75, 1.0, 0.04]} />
        <meshStandardMaterial color="#080707" metalness={0.9} roughness={0.05} />
      </mesh>
      {/* 电视边框 */}
      <mesh position={[0, 1.0, -2.54]}>
        <boxGeometry args={[1.83, 1.08, 0.02]} />
        <meshStandardMaterial color="#2a2520" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* ── 沙发区域 ──────────────────────────────────────────── */}

      {/* 沙发座垫 — 深灰蓝布艺 */}
      <mesh castShadow position={[0, 0.30, 1.4]}>
        <boxGeometry args={[2.2, 0.60, 0.85]} />
        <meshStandardMaterial color="#4a4035" roughness={0.95} />
      </mesh>
      {/* 沙发靠背 */}
      <mesh castShadow position={[0, 0.78, 1.77]}>
        <boxGeometry args={[2.2, 0.62, 0.18]} />
        <meshStandardMaterial color="#4a4035" roughness={0.95} />
      </mesh>
      {/* 沙发靠背上沿（稍深） */}
      <mesh castShadow position={[0, 1.10, 1.76]}>
        <boxGeometry args={[2.2, 0.04, 0.20]} />
        <meshStandardMaterial color="#3a3028" roughness={0.8} />
      </mesh>
      {/* 左扶手 */}
      <mesh castShadow position={[-1.04, 0.50, 1.4]}>
        <boxGeometry args={[0.18, 0.40, 0.85]} />
        <meshStandardMaterial color="#3d3328" roughness={0.9} />
      </mesh>
      {/* 右扶手 */}
      <mesh castShadow position={[1.04, 0.50, 1.4]}>
        <boxGeometry args={[0.18, 0.40, 0.85]} />
        <meshStandardMaterial color="#3d3328" roughness={0.9} />
      </mesh>
      {/* 沙发腿 */}
      {([-0.95, 0.95] as number[]).flatMap((x) =>
        ([1.06, 1.74] as number[]).map((z) => (
          <mesh castShadow key={`${x}-${z}`} position={[x, 0.06, z]}>
            <boxGeometry args={[0.06, 0.12, 0.06]} />
            <meshStandardMaterial color="#6a5840" metalness={0.3} roughness={0.4} />
          </mesh>
        )),
      )}
      {/* 抱枕 */}
      <mesh castShadow position={[-0.5, 0.72, 1.54]}>
        <boxGeometry args={[0.42, 0.38, 0.12]} />
        <meshStandardMaterial color="#5a4a68" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0.5, 0.72, 1.54]}>
        <boxGeometry args={[0.42, 0.38, 0.12]} />
        <meshStandardMaterial color="#3a4a5a" roughness={0.9} />
      </mesh>

      {/* ── 茶几 ─────────────────────────────────────────────── */}

      {/* 台面 — 深色大理石纹 */}
      <mesh castShadow position={[0, 0.42, 0.6]}>
        <boxGeometry args={[0.95, 0.04, 0.52]} />
        <meshStandardMaterial color="#2a241c" metalness={0.2} roughness={0.25} />
      </mesh>
      {/* 茶几下层 */}
      <mesh castShadow position={[0, 0.18, 0.6]}>
        <boxGeometry args={[0.75, 0.03, 0.36]} />
        <meshStandardMaterial color="#2a241c" metalness={0.15} roughness={0.35} />
      </mesh>
      {/* 茶几腿 */}
      {([-0.42, 0.42] as number[]).flatMap((x) =>
        ([0.38, 0.82] as number[]).map((z) => (
          <mesh castShadow key={`t${x}-${z}`} position={[x, 0.21, z]}>
            <boxGeometry args={[0.04, 0.42, 0.04]} />
            <meshStandardMaterial color="#4a4030" metalness={0.4} roughness={0.3} />
          </mesh>
        )),
      )}

      {/* ── 地毯 ─────────────────────────────────────────────── */}
      <mesh position={[0, 0.003, 0.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.8, 2.4]} />
        <meshStandardMaterial color="#3a3226" roughness={1} />
      </mesh>
      {/* 地毯内层图案感 */}
      <mesh position={[0, 0.004, 0.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 1.8]} />
        <meshStandardMaterial color="#2e2820" roughness={1} />
      </mesh>

      {/* ── 装饰 ─────────────────────────────────────────────── */}

      {/* 落地灯（装饰性，右侧沙发旁） */}
      <mesh castShadow position={[1.35, 0.9, 1.85]}>
        <cylinderGeometry args={[0.015, 0.015, 1.8, 8]} />
        <meshStandardMaterial color="#8a7860" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[1.35, 1.82, 1.85]}>
        <cylinderGeometry args={[0.18, 0.14, 0.28, 16]} />
        <meshStandardMaterial color="#d4c4a0" roughness={0.9} />
      </mesh>
    </group>
  )
}

/**
 * 相机设置 — 3/4 斜角，展现客厅纵深感
 */
function DemoCamera() {
  const { camera } = useThree()
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    // 从右前方斜角俯瞰：近一点、低一点，让室内填满画面
    camera.position.set(4.5, 3.0, 7.0)
  }, [camera])

  return (
    <OrbitControls
      dampingFactor={0.08}
      enableDamping
      enablePan={false}
      maxDistance={20}
      maxPolarAngle={Math.PI / 2 - 0.02}
      minDistance={2}
      target={[0, 0.8, -0.5]}
    />
  )
}

// ─── 演示页面 ───────────────────────────────────────────────────────────────

export default function ProposalDemoPage() {
  const [isReady, setIsReady] = useState(false)
  const createNodes = useScene((s) => s.createNodes)
  const setViewerSelection = useViewer((s: any) => s.setSelection)

  useEffect(() => {
    if (isReady) return

    // ── 层级结构 ──────────────────────────────────────────────────
    const siteId = generateId('site')
    const buildingId = generateId('building')
    const levelId = generateId('level')

    createNodes([{
      node: {
        id: siteId, type: 'site', parentId: null, object: 'node',
        visible: true, metadata: {}, children: [buildingId],
        name: 'Demo Site',
        polygon: { type: 'polygon', points: [[-10, -10], [10, -10], [10, 10], [-10, 10]] },
      } as any,
    }])

    createNodes([{
      node: {
        id: buildingId, type: 'building', parentId: siteId, object: 'node',
        visible: true, metadata: {}, children: [levelId],
        name: '樾山半岛', position: [0, 0, 0], rotation: [0, 0, 0],
      } as any,
    }])

    createNodes([{
      node: {
        id: levelId, type: 'level', parentId: buildingId, object: 'node',
        visible: true, metadata: {}, children: [],
        name: 'F1 客厅', level: 0,
      } as any,
    }])

    // ── 设备工厂 ─────────────────────────────────────────────────
    //  坐标系：x: -3(左)→+3(右)  z: -2.5(后/窗帘墙)→+2.5(前/入户)  y: 0(地)→2.7(天花)

    const makeLighting = (x: number, z: number, name: string, brightInit = 80, tempInit = 3000): DeviceNode => ({
      id: generateId('device'), type: 'device', parentId: levelId,
      object: 'node', visible: true, metadata: {},
      subsystem: 'lighting', renderType: 'downlight', mountType: 'ceiling',
      position: [x, 2.65, z], rotation: [0, 0, 0],
      productId: 'LIGHT-DOWNLIGHT', productName: name, brand: 'Philips',
      params: { beamAngle: 30 },
      state: { on: true, brightness: brightInit, colorTemp: tempInit }, // 默认亮灯（回家模式）
      showAnimation: true, linkedScenes: [],
    })

    const makePanel = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'), type: 'device', parentId: levelId,
      object: 'node', visible: true, metadata: {},
      subsystem: 'panel', renderType: 'switch-3key', mountType: 'wall_switch',
      position: [x, 1.2, z], rotation: [0, 0, 0],
      productId: 'PANEL-SWITCH-3KEY', productName: name, brand: 'Jung',
      params: {}, state: { on: true },
      showAnimation: true, linkedScenes: [],
    })

    const makeSensor = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'), type: 'device', parentId: levelId,
      object: 'node', visible: true, metadata: {},
      subsystem: 'sensor', renderType: 'pir', mountType: 'ceiling',
      position: [x, 2.65, z], rotation: [0, 0, 0],
      productId: 'SECURITY-PIR', productName: name, brand: 'Aqara',
      params: { coverageRadius: 4 }, state: { triggered: false },
      showAnimation: true, linkedScenes: [],
    })

    const makeCurtain = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'), type: 'device', parentId: levelId,
      object: 'node', visible: true, metadata: {},
      subsystem: 'curtain', renderType: 'curtain-motor', mountType: 'ceiling',
      position: [x, 2.5, z], rotation: [0, 0, 0],
      productId: 'CURTAIN-TRACK-MOTOR', productName: name, brand: 'Aqara',
      params: { curtainWidth: 2.8 },
      state: { position: 0, angle: 0 }, // 初始拉开（0 = 收起/开）
      showAnimation: true, linkedScenes: [],
    })

    const makeHvac = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'), type: 'device', parentId: levelId,
      object: 'node', visible: true, metadata: {},
      subsystem: 'hvac', renderType: 'thermostat', mountType: 'wall',
      position: [x, 1.4, z], rotation: [0, 0, 0],
      productId: 'HVAC-THERMOSTAT', productName: name, brand: 'Siemens',
      params: {}, state: { on: false, targetTemp: 24, currentTemp: 21, mode: 'heat' },
      showAnimation: true, linkedScenes: [],
    })

    const makeNetwork = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'), type: 'device', parentId: levelId,
      object: 'node', visible: true, metadata: {},
      subsystem: 'network', renderType: 'ap-ceiling', mountType: 'ceiling',
      position: [x, 2.65, z], rotation: [0, 0, 0],
      productId: 'NETWORK-AP-CEILING', productName: name, brand: 'Ubiquiti',
      params: { coverageRadius: 6 }, state: {},
      showAnimation: true, linkedScenes: [],
    })

    const makeSecurity = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'), type: 'device', parentId: levelId,
      object: 'node', visible: true, metadata: {},
      subsystem: 'security', renderType: 'door-lock', mountType: 'door',
      position: [x, 1.0, z], rotation: [0, 0, 0],
      productId: 'SECURITY-DOOR-LOCK', productName: name, brand: 'Aqara',
      params: {}, state: { locked: true },
      showAnimation: true, linkedScenes: [],
    })

    // ── 创建设备 ──────────────────────────────────────────────────
    const light1 = makeLighting(-1.5, -1.0, '客厅主灯 A')
    const light2 = makeLighting(1.5, -1.0, '客厅主灯 B')
    const light3 = makeLighting(-1.5, 1.0, '沙发区灯 A')
    const light4 = makeLighting(1.5, 1.0, '沙发区灯 B')
    const curtain = makeCurtain(0, -2.4, '客厅窗帘')

    createNodes([
      { node: light1 },
      { node: light2 },
      { node: light3 },
      { node: light4 },
      { node: makePanel(-2.9, 1.8, '入户开关') },
      { node: makePanel(-2.9, 0, '客厅开关') },
      { node: makeSensor(0, 0, '人体感应器') },
      { node: curtain },
      { node: makeHvac(2.9, 0.5, '客厅温控') },
      { node: makeNetwork(0, 1.0, '客厅AP') },
      { node: makeSecurity(-2.9, 2.0, '智能门锁') },
    ])

    // ── 场景（窗帘语义：0=开/收起，100=关/展开）────────────────
    const allLightIds = [light1.id, light2.id, light3.id, light4.id]

    const makeScene = (
      name: string,
      icon: string,
      effects: { deviceId: string; state: Record<string, unknown> }[],
    ) =>
      SceneNode.parse({
        id: generateId('scene'), type: 'scene', parentId: levelId,
        object: 'node', visible: true, metadata: {},
        name, icon,
        effects: effects.map((e) => ({ ...e, delay: 0, duration: 0 })),
      })

    // 回家：暖白灯全亮，窗帘拉开
    const sceneHome = makeScene('回家模式', '🏠', [
      ...allLightIds.map((id) => ({
        deviceId: id, state: { on: true, brightness: 80, colorTemp: 3000 },
      })),
      { deviceId: curtain.id, state: { position: 0 } },
    ])

    // 影院：主灯灭，氛围微光冷白，窗帘拉上
    const sceneCinema = makeScene('影院模式', '🎬', [
      { deviceId: light1.id, state: { on: false } },
      { deviceId: light2.id, state: { on: true, brightness: 12, colorTemp: 5500 } },
      { deviceId: light3.id, state: { on: false } },
      { deviceId: light4.id, state: { on: true, brightness: 15, colorTemp: 5500 } },
      { deviceId: curtain.id, state: { position: 100 } },
    ])

    // 离家：全灭，窗帘拉上
    const sceneAway = makeScene('离家模式', '🌙', [
      ...allLightIds.map((id) => ({ deviceId: id, state: { on: false } })),
      { deviceId: curtain.id, state: { position: 100 } },
    ])

    // 晨间：自然白全亮，窗帘拉开迎接晨光
    const sceneMorning = makeScene('晨间模式', '☀️', [
      ...allLightIds.map((id) => ({
        deviceId: id, state: { on: true, brightness: 100, colorTemp: 5500 },
      })),
      { deviceId: curtain.id, state: { position: 0 } },
    ])

    createNodes([
      { node: sceneHome as any, parentId: levelId as any },
      { node: sceneCinema as any, parentId: levelId as any },
      { node: sceneAway as any, parentId: levelId as any },
      { node: sceneMorning as any, parentId: levelId as any },
    ])

    setViewerSelection({ buildingId, levelId, zoneId: null, selectedIds: [] })
    setTimeout(() => setIsReady(true), 100)
  }, [isReady, createNodes, setViewerSelection])

  if (!isReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-white">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-sm text-white/60">正在加载演示场景…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-neutral-950">
      <ProposalLayout
        onBack={() => window.history.back()}
        projectName="智能家居方案 · 樾山半岛 160㎡"
      >
        <Viewer selectionManager="default">
          <DemoRoom />
          <DemoCamera />
        </Viewer>
      </ProposalLayout>
    </div>
  )
}
