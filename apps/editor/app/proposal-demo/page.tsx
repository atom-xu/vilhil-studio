'use client'

import { DeviceNode, generateId, SceneNode, useScene } from '@pascal-app/core'
import { ProposalLayout } from '@pascal-app/editor'
import { useViewer, Viewer } from '@pascal-app/viewer'
import { useEffect, useState } from 'react'

// 演示场景地板 - 提供视觉参考
function DemoFloor() {
  return (
    <group>
      {/* 地板 */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.8} />
      </mesh>
      {/* 网格辅助线 */}
      <gridHelper args={[20, 20, '#444444', '#333333']} position={[0, 0.01, 0]} />
      {/* 墙面示意 - 后墙 */}
      <mesh position={[0, 1.4, -5]}>
        <boxGeometry args={[10, 2.8, 0.2]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
    </group>
  )
}

/**
 * 提案模式演示页面
 *
 * 展示智能家居方案的客户展示模式：
 * - 9子系统侧边栏（切换显隐）
 * - 场景栏（执行智能场景）
 * - 设备交互（开关/调光/温控）
 * - 报价面板（设备清单和报价）
 */
export default function ProposalDemoPage() {
  const [isReady, setIsReady] = useState(false)
  const createNodes = useScene((s) => s.createNodes)
  const setViewerSelection = useViewer((s) => s.setSelection)

  // 初始化演示场景
  useEffect(() => {
    if (isReady) return

    // 创建演示层级结构
    const siteId = generateId('site')
    const buildingId = generateId('building')
    const levelId = generateId('level')

    // Site
    createNodes([{
      node: {
        id: siteId,
        type: 'site',
        parentId: null,
        object: 'node',
        visible: true,
        metadata: {},
        children: [buildingId],
        name: 'Demo Site',
        polygon: { type: 'polygon', points: [[-10, -10], [10, -10], [10, 10], [-10, 10]] },
      } as any,
    }])

    // Building
    createNodes([{
      node: {
        id: buildingId,
        type: 'building',
        parentId: siteId,
        object: 'node',
        visible: true,
        metadata: {},
        children: [levelId],
        name: 'villa',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
    }])

    // Level
    createNodes([{
      node: {
        id: levelId,
        type: 'level',
        parentId: buildingId,
        object: 'node',
        visible: true,
        metadata: {},
        children: [],
        name: 'F1 客厅',
        level: 0,
      } as any,
    }])

    // 创建设备 - 灯光
    const createLightingDevice = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'),
      type: 'device',
      parentId: levelId,
      object: 'node',
      visible: true,
      metadata: {},
      subsystem: 'lighting',
      renderType: 'downlight',
      mountType: 'ceiling',
      position: [x, 2.6, z],
      rotation: [0, 0, 0],
      productId: 'light-downlight-01',
      productName: name,
      brand: 'Philips',
      params: { beamAngle: 30 },
      state: { on: false, brightness: 80, colorTemp: 4000 },
      showAnimation: true,
      linkedScenes: [],
    })

    // 筒灯
    createNodes([{ node: createLightingDevice(-2, -2, '客厅主灯') }])
    createNodes([{ node: createLightingDevice(2, -2, '沙发灯') }])
    createNodes([{ node: createLightingDevice(-2, 2, '餐厅灯') }])
    createNodes([{ node: createLightingDevice(2, 2, '过道灯') }])

    // 面板
    const createPanelDevice = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'),
      type: 'device',
      parentId: levelId,
      object: 'node',
      visible: true,
      metadata: {},
      subsystem: 'panel',
      renderType: 'switch-3key',
      mountType: 'wall_switch',
      position: [x, 1.2, z],
      rotation: [0, 0, 0],
      productId: 'panel-switch-3key',
      productName: name,
      brand: 'Jung',
      params: {},
      state: { on: true },
      showAnimation: true,
      linkedScenes: [],
    })

    createNodes([{ node: createPanelDevice(-4, 0, '入户开关') }])
    createNodes([{ node: createPanelDevice(4, 0, '客厅开关') }])

    // 传感器
    const createSensorDevice = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'),
      type: 'device',
      parentId: levelId,
      object: 'node',
      visible: true,
      metadata: {},
      subsystem: 'sensor',
      renderType: 'pir',
      mountType: 'ceiling',
      position: [x, 2.6, z],
      rotation: [0, 0, 0],
      productId: 'sensor-pir-01',
      productName: name,
      brand: 'Aqara',
      params: { coverageRadius: 5 },
      state: { triggered: false },
      showAnimation: true,
      linkedScenes: [],
    })

    createNodes([{ node: createSensorDevice(0, 0, '人体感应器') }])

    // 窗帘
    const createCurtainDevice = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'),
      type: 'device',
      parentId: levelId,
      object: 'node',
      visible: true,
      metadata: {},
      subsystem: 'curtain',
      renderType: 'curtain-motor',
      mountType: 'ceiling',
      position: [x, 2.4, z],
      rotation: [0, 0, 0],
      productId: 'curtain-motor-01',
      productName: name,
      brand: 'Aqara',
      params: { curtainWidth: 3 },
      state: { position: 'open', angle: 0 },
      showAnimation: true,
      linkedScenes: [],
    })

    createNodes([{ node: createCurtainDevice(0, -4, '客厅窗帘') }])

    // 温控
    const createHvacDevice = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'),
      type: 'device',
      parentId: levelId,
      object: 'node',
      visible: true,
      metadata: {},
      subsystem: 'hvac',
      renderType: 'thermostat',
      mountType: 'wall',
      position: [x, 1.4, z],
      rotation: [0, 0, 0],
      productId: 'hvac-thermostat-01',
      productName: name,
      brand: 'Siemens',
      params: {},
      state: { on: true, targetTemp: 24, currentTemp: 22, mode: 'heat' },
      showAnimation: true,
      linkedScenes: [],
    })

    createNodes([{ node: createHvacDevice(3.5, 3.5, '客厅温控') }])

    // AP
    const createNetworkDevice = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'),
      type: 'device',
      parentId: levelId,
      object: 'node',
      visible: true,
      metadata: {},
      subsystem: 'network',
      renderType: 'ap-ceiling',
      mountType: 'ceiling',
      position: [x, 2.6, z],
      rotation: [0, 0, 0],
      productId: 'network-ap-01',
      productName: name,
      brand: 'Ubiquiti',
      params: { coverageRadius: 8 },
      state: {},
      showAnimation: true,
      linkedScenes: [],
    })

    createNodes([{ node: createNetworkDevice(-3, 3, '客厅AP') }])

    // 门锁
    const createSecurityDevice = (x: number, z: number, name: string): DeviceNode => ({
      id: generateId('device'),
      type: 'device',
      parentId: levelId,
      object: 'node',
      visible: true,
      metadata: {},
      subsystem: 'security',
      renderType: 'door-lock',
      mountType: 'door',
      position: [x, 1.0, z],
      rotation: [0, 0, 0],
      productId: 'security-lock-01',
      productName: name,
      brand: 'Aqara',
      params: {},
      state: { locked: true },
      showAnimation: true,
      linkedScenes: [],
    })

    createNodes([{ node: createSecurityDevice(-4, -4, '智能门锁') }])

    // 创建场景
    const createScene = (name: string, effects: any[]): SceneNode => ({
      id: generateId('scene'),
      type: 'scene',
      parentId: levelId,
      object: 'node',
      visible: true,
      metadata: {},
      name,
      icon: 'light',
      effects,
    })

    // 回家模式场景
    createNodes([{
      node: createScene('回家模式', [
        { deviceId: '', state: { on: true }, delay: 0 },
      ]) as any,
    }])

    // 离家模式场景
    createNodes([{
      node: createScene('离家模式', [
        { deviceId: '', state: { on: false }, delay: 0 },
      ]) as any,
    }])

    // 观影模式场景
    createNodes([{
      node: createScene('观影模式', [
        { deviceId: '', state: { on: true, brightness: 20 }, delay: 0 },
      ]) as any,
    }])

    // 设置选中层级
    setViewerSelection({
      buildingId: buildingId,
      levelId: levelId,
      zoneId: null,
      selectedIds: [],
    })

    // 延迟设置isReady确保场景已完全创建
    setTimeout(() => setIsReady(true), 100)
  }, [isReady, createNodes, setViewerSelection])

  if (!isReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-white">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p>正在加载演示场景...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-neutral-950">
      <ProposalLayout
        onBack={() => window.history.back()}
        projectName="智能家居方案 - 樾山半岛160㎡"
      >
        <Viewer selectionManager="default">
          <DemoFloor />
        </Viewer>
      </ProposalLayout>
    </div>
  )
}
