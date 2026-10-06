'use client'

import { DeviceNode, useScene, emitter } from '@pascal-app/core'
import { SceneBar, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { createScene, getDeviceDefinition, placeDevice, setDeviceState, subscribeSceneRunStatus } from '@vilhil/smarthome'
import { Canvas } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { DeviceTool } from '../../../../packages/editor/src/components/tools/device/device-tool'
import { RollerCurtain } from '../../../../packages/viewer/src/components/renderers/device/animations/curtain/roller'
import { RomanShade } from '../../../../packages/viewer/src/components/renderers/device/animations/curtain/roman'
import { VenetianBlind } from '../../../../packages/viewer/src/components/renderers/device/animations/curtain/venetian'
import { SideOpenCurtain } from '../../../../packages/viewer/src/components/renderers/device/animations/curtain/side-open'
import { LightCone } from '../../../../packages/viewer/src/components/renderers/device/animations/light-cone'

/** Local-only acceptance fixture. Uses actual store/tools/SceneBar/animation components. */
export default function InteractionPreview() {
  const [ids, setIds] = useState<{ light: string; curtain: string } | null>(null)
  const [kind, setKind] = useState('roller')
  const [running, setRunning] = useState(false)
  const [previewAt, setPreviewAt] = useState('未选择')
  const nodes = useScene(s => s.nodes)
  useEffect(() => {
    useScene.getState().clearScene()
    const level = Object.values(useScene.getState().nodes).find(n => n?.type === 'level')!
    useViewer.getState().setSelection({ levelId: level.id as any })
    const light = placeDevice(level.id, 'LIGHT-DOWNLIGHT', [-2, 2.7, 0])
    const curtain = DeviceNode.parse({ parentId: level.id, subsystem: 'curtain', renderType: 'curtain-roller', position: [2, 1.5, 0], state: { position: 0 } })
    useScene.getState().createNode(curtain, level.id as any)
    setDeviceState(light as any, { on: false, brightness: 0 })
    createScene(level.id, '回家：灯光与窗帘', [
      { deviceId: light, state: { on: true, brightness: 80 }, duration: 2, delay: 0 },
      { deviceId: curtain.id, state: { position: 100 }, duration: 2, delay: 2 },
    ])
    createScene(level.id, '离家：中断并关闭', [
      { deviceId: light, state: { on: false, brightness: 0 }, duration: 1, delay: 0 },
      { deviceId: curtain.id, state: { position: 0 }, duration: 1, delay: 0 },
    ])
    useEditor.getState().setSelectedDevice(getDeviceDefinition('LIGHT-DOWNLIGHT')!)
    setIds({ light, curtain: curtain.id })
    return subscribeSceneRunStatus(s => setRunning(s.running))
  }, [])
  const light = ids ? nodes[ids.light as keyof typeof nodes] as any : null
  const curtain = ids ? nodes[ids.curtain as keyof typeof nodes] as any : null
  const brightness = light?.state?.brightness ?? 0
  const position = curtain?.state?.position ?? 0
  const Animation = kind === 'roller' ? RollerCurtain : kind === 'roman' ? RomanShade : kind === 'venetian' ? VenetianBlind : SideOpenCurtain
  const deviceCount = Object.values(nodes).filter(n => n?.type === 'device').length
  const choosePosition = (x: number) => {
    emitter.emit('grid:move', { position: [x, 0, 0], stopPropagation() {} } as any)
    setPreviewAt(x === -2 ? '占用位置' : '空闲位置')
  }
  return <main className="h-screen bg-background p-6 text-foreground">
    <h1 className="text-xl font-semibold">本机交互验收 · 场景联动与设备碰撞</h1>
    <p className="my-2 text-sm">仅本机模拟设备，未连接 Home Assistant。点击回家，再点击离家或重复回家，可观察过渡和中断。</p>
    <SceneBar />
    <div role="status" className="my-3">{running ? '执行中' : '已完成'} · 灯光亮度 {Math.round(brightness)}% · 窗帘开合 {Math.round(position)}% · 设备数 {deviceCount}</div>
    <div className="flex gap-3">
      {['roller', 'roman', 'venetian', 'side-open'].map(k => <button key={k} className="rounded border px-3 py-1" onClick={() => setKind(k)}>{({ roller: '卷帘', roman: '罗马帘', venetian: '百叶帘', 'side-open': '对开帘' })[k]}</button>)}
      <button className="rounded border px-3 py-1" onClick={() => choosePosition(-2)}>预览占用位置</button>
      <button className="rounded border px-3 py-1" onClick={() => choosePosition(0)}>预览空闲位置</button>
      <button className="rounded border px-3 py-1" onClick={() => emitter.emit('grid:click', { position: [0,0,0], stopPropagation() {} } as any)}>提交放置</button>
    </div>
    <p className="my-2 text-sm">预览：{previewAt}；占用应红色并拒绝提交，空闲应绿色并允许创建一次。</p>
    <div className="h-[65vh] rounded-xl border">
      <Canvas onCreated={({ camera }) => camera.layers.enable(1)} camera={{ position: [0, 3, 8], fov: 45 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 5, 5]} intensity={2} />
        <group position={[2, 1.5, 0]}><Animation width={1.8} height={2.4} layerZ={0} openPct={position} material="blackout" /></group>
        <LightCone position={[-2, 2.7, 0]} brightness={light?.state?.on ? brightness / 100 : 0} />
        <mesh position={[-2, 2.7, 0]}><sphereGeometry args={[.1, 16, 16]} /><meshStandardMaterial color="white" emissive="white" emissiveIntensity={brightness / 100} /></mesh>
        <mesh rotation={[-Math.PI/2,0,0]}><planeGeometry args={[10,5]} /><meshStandardMaterial color="#d6d1c8" /></mesh>
        <DeviceTool />
      </Canvas>
    </div>
  </main>
}
