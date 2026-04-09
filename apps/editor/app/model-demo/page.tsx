'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Environment, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import {
  // 模型库
  getModel,
  getAllModelRenderTypes,
  getModelStats,
  BRAND_PALETTE,
  // 组件
  DeviceMesh,
  DeviceCoverage,
  // 子系统模型
  downlightModel,
  stripModel,
  pendantModel,
  wallLightModel,
  switch1KeyModel,
  switch2KeyModel,
  switch3KeyModel,
  dimmerKnobModel,
  scene4KeyModel,
  scene6KeyModel,
  thermostatModel,
  pirModel,
  smokeModel,
  domeCameraModel,
  doorSensorModel,
  bulletCameraModel,
  curtainMotorModel,
  blindMotorModel,
  vent4WayModel,
  ventLinearModel,
  acUnitModel,
  apCeilingModel,
  apWallModel,
  routerModel,
  doorLockModel,
  gatewayKNXModel,
  smartHostModel,
} from '@vilhil/smarthome'
import type { DeviceVisualState, DeviceModelDefinition } from '@vilhil/smarthome'

// ═══════════════════════════════════════════════════════════════
// 3D 场景组件
// ═══════════════════════════════════════════════════════════════

function ModelViewer({
  model,
  state,
  autoRotate,
  showWireframe,
  showCoverage,
}: {
  model: DeviceModelDefinition
  state: DeviceVisualState
  autoRotate: boolean
  showWireframe: boolean
  showCoverage: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (autoRotate && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5
    }
  })

  return (
    <>
      {/* 环境光 */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.5} />
      <pointLight position={[0, 5, 0]} intensity={0.3} />

      {/* 设备模型 */}
      <group ref={groupRef} position={[0, 0.5, 0]}>
        {/* 线框模式覆盖 */}
        {showWireframe && (
          <mesh>
            <boxGeometry args={[
              model.dimensions[0] * 1.2,
              model.dimensions[1] * 1.2,
              model.dimensions[2] * 1.2
            ]} />
            <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.3} />
          </mesh>
        )}

        {/* 设备主体 */}
        <DeviceMesh definition={model} state={state} />

        {/* 覆盖范围可视化 */}
        <DeviceCoverage definition={model} visible={showCoverage} />

        {/* 尺寸标注 */}
        <DimensionsIndicator dimensions={model.dimensions} />
      </group>

      {/* 地面网格 */}
      <Grid
        args={[10, 10]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#6b7280"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#374151"
        fadeDistance={25}
        fadeStrength={1}
        infiniteGrid
      />
    </>
  )
}

// 尺寸标注
function DimensionsIndicator({ dimensions }: { dimensions: [number, number, number] }) {
  const [w, h, d] = dimensions

  return (
    <group>
      {/* 宽 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([-w/2, -h/2 - 0.05, d/2 + 0.05, w/2, -h/2 - 0.05, d/2 + 0.05])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#22c55e" />
      </line>
      {/* 高 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([w/2 + 0.05, -h/2, d/2 + 0.05, w/2 + 0.05, h/2, d/2 + 0.05])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ef4444" />
      </line>
      {/* 深 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([-w/2 - 0.05, -h/2 - 0.05, -d/2, -w/2 - 0.05, -h/2 - 0.05, d/2])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#3b82f6" />
      </line>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════
// 主页面
// ═══════════════════════════════════════════════════════════════

const DEVICE_CATEGORIES = [
  { id: 'lighting', name: '灯光', color: BRAND_PALETTE.lighting },
  { id: 'panel', name: '面板', color: BRAND_PALETTE.panel },
  { id: 'sensor', name: '传感器', color: BRAND_PALETTE.sensor },
  { id: 'curtain', name: '窗帘', color: BRAND_PALETTE.curtain },
  { id: 'hvac', name: '暖通', color: BRAND_PALETTE.hvac },
  { id: 'network', name: '网络', color: BRAND_PALETTE.network },
  { id: 'security', name: '安防', color: BRAND_PALETTE.security },
  { id: 'architecture', name: '架构', color: BRAND_PALETTE.architecture },
]

const DEMO_MODELS: Record<string, DeviceModelDefinition> = {
  // 灯光
  downlight: downlightModel,
  'strip-light': stripModel,
  pendant: pendantModel,
  'wall-light': wallLightModel,
  // 面板
  'switch-1key': switch1KeyModel,
  'switch-2key': switch2KeyModel,
  'switch-3key': switch3KeyModel,
  'dimmer-knob': dimmerKnobModel,
  'scene-4key': scene4KeyModel,
  'scene-6key': scene6KeyModel,
  thermostat: thermostatModel,
  // 传感器
  pir: pirModel,
  smoke: smokeModel,
  'dome-camera': domeCameraModel,
  'door-sensor': doorSensorModel,
  // 窗帘
  'curtain-motor': curtainMotorModel,
  'blind-motor': blindMotorModel,
  // 暖通
  'vent-4way': vent4WayModel,
  'vent-linear': ventLinearModel,
  'ac-unit': acUnitModel,
  // 网络
  'ap-ceiling': apCeilingModel,
  'ap-wall': apWallModel,
  router: routerModel,
  // 安防
  'door-lock': doorLockModel,
  'bullet-camera': bulletCameraModel,
  // 架构
  'gateway-knx': gatewayKNXModel,
  'smart-host': smartHostModel,
}

export default function ModelDemoPage() {
  const [selectedModel, setSelectedModel] = useState<string>('downlight')
  const [activeCategory, setActiveCategory] = useState<string>('lighting')
  const [state, setState] = useState<DeviceVisualState>({
    on: false,
    brightness: 80,
    color: '#ffffff',
    position: 0,
    locked: true,
  })
  const [autoRotate, setAutoRotate] = useState(true)
  const [showWireframe, setShowWireframe] = useState(false)
  const [showCoverage, setShowCoverage] = useState(false)

  const model = DEMO_MODELS[selectedModel]
  const stats = useMemo(() => getModelStats(), [])

  // 重置状态当切换模型时
  useEffect(() => {
    setState({
      on: false,
      brightness: 80,
      color: '#ffffff',
      position: 0,
      locked: true,
    })
  }, [selectedModel])

  if (!model) {
    return <div>模型未找到</div>
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#111827',
      color: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* 头部 */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid #374151',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
          VilHil 智能设备模型库
        </h1>
        <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#9ca3af' }}>
          <span>总计: {stats.total} 个模型</span>
          <span>带动画: {stats.withAnimations}</span>
          <span>带覆盖: {stats.withCoverage}</span>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧设备选择 */}
        <aside style={{
          width: '280px',
          borderRight: '1px solid #374151',
          display: 'flex',
          flexDirection: 'column',
          background: '#1f2937',
        }}>
          {/* 分类标签 */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '16px',
            borderBottom: '1px solid #374151',
          }}>
            {DEVICE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: activeCategory === cat.id ? cat.color : '#374151',
                  color: activeCategory === cat.id ? '#000' : '#fff',
                  transition: 'all 0.2s',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* 设备列表 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
            {Object.entries(DEMO_MODELS)
              .filter(([key, m]) => {
                const categoryMap: Record<string, string[]> = {
                  lighting: ['downlight', 'strip-light', 'pendant', 'wall-light'],
                  panel: ['switch-1key', 'switch-2key', 'switch-3key', 'dimmer-knob', 'scene-4key', 'scene-6key', 'thermostat'],
                  sensor: ['pir', 'smoke', 'dome-camera', 'door-sensor'],
                  curtain: ['curtain-motor', 'blind-motor'],
                  hvac: ['vent-4way', 'vent-linear', 'ac-unit'],
                  network: ['ap-ceiling', 'ap-wall', 'router'],
                  security: ['door-lock', 'bullet-camera'],
                  architecture: ['gateway-knx', 'smart-host'],
                }
                return categoryMap[activeCategory]?.includes(key)
              })
              .map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => setSelectedModel(key)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: selectedModel === key ? '#374151' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      background: m.thumbnailColor,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px' }}>
                      {m.displayName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                      {m.dimensions.map(d => `${(d * 1000).toFixed(0)}mm`).join(' × ')}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </aside>

        {/* 中间 3D 视图 */}
        <main style={{ flex: 1, position: 'relative' }}>
          <Canvas shadows gl={{ antialias: true }} style={{ background: '#111827' }}>
            <PerspectiveCamera makeDefault position={[3, 3, 3]} fov={50} />
            <OrbitControls
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              autoRotate={false}
            />
            <Environment preset="studio" />
            <ModelViewer
              model={model}
              state={state}
              autoRotate={autoRotate}
              showWireframe={showWireframe}
              showCoverage={showCoverage}
            />
          </Canvas>

          {/* 视图控制 */}
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '16px',
            padding: '12px 24px',
            background: 'rgba(31, 41, 55, 0.9)',
            borderRadius: '8px',
            backdropFilter: 'blur(10px)',
          }}>
            {[
              { label: '自动旋转', checked: autoRotate, onChange: setAutoRotate },
              { label: '线框模式', checked: showWireframe, onChange: setShowWireframe },
              { label: '覆盖范围', checked: showCoverage, onChange: setShowCoverage },
            ].map((item) => (
              <label
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.onChange(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                {item.label}
              </label>
            ))}
          </div>
        </main>

        {/* 右侧状态控制 */}
        <aside style={{
          width: '280px',
          borderLeft: '1px solid #374151',
          padding: '20px',
          background: '#1f2937',
          overflow: 'auto',
        }}>
          <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600 }}>
            状态控制
          </h2>

          {/* 开关 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '14px',
              marginBottom: '8px',
            }}>
              <span>开关状态</span>
              <button
                onClick={() => setState(s => ({ ...s, on: !s.on }))}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: state.on ? '#22c55e' : '#6b7280',
                  color: '#fff',
                  transition: 'all 0.2s',
                }}
              >
                {state.on ? 'ON' : 'OFF'}
              </button>
            </label>
          </div>

          {/* 亮度 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              marginBottom: '8px',
              color: state.on ? '#f9fafb' : '#6b7280',
            }}>
              亮度: {state.brightness}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={state.brightness}
              onChange={(e) => setState(s => ({ ...s, brightness: Number(e.target.value) }))}
              disabled={!state.on}
              style={{
                width: '100%',
                cursor: state.on ? 'pointer' : 'not-allowed',
                opacity: state.on ? 1 : 0.5,
              }}
            />
          </div>

          {/* 窗帘位置 */}
          {(selectedModel === 'curtain-motor' || selectedModel === 'blind-motor') && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                marginBottom: '8px',
              }}>
                开合: {state.position}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={state.position}
                onChange={(e) => setState(s => ({ ...s, position: Number(e.target.value) }))}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {/* 锁状态 */}
          {(selectedModel === 'door-lock' || selectedModel === 'bullet-camera') && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '14px',
              }}>
                <span>锁状态</span>
                <button
                  onClick={() => setState(s => ({ ...s, locked: !s.locked }))}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: state.locked ? '#f59e0b' : '#22c55e',
                    color: '#fff',
                  }}
                >
                  {state.locked ? 'LOCKED' : 'UNLOCKED'}
                </button>
              </label>
            </div>
          )}

          {/* 分隔线 */}
          <hr style={{
            border: 'none',
            borderTop: '1px solid #374151',
            margin: '24px 0',
          }} />

          {/* 模型信息 */}
          <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: '#9ca3af' }}>
              模型信息
            </h3>
            {[
              { label: '名称', value: model.displayName },
              { label: '尺寸', value: model.dimensions.map(d => `${(d * 1000).toFixed(0)}mm`).join(' × ') },
              { label: '安装高度', value: `${model.defaultHeight}m` },
              { label: '复杂度', value: model.complexity },
              { label: '部件数', value: model.parts.length.toString() },
              ...(model.coverage ? [{ label: '覆盖范围', value: `${model.coverage.radius}m ${model.coverage.type}` }] : []),
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  fontSize: '13px',
                  borderBottom: '1px solid #374151',
                }}
              >
                <span style={{ color: '#9ca3af' }}>{item.label}</span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
