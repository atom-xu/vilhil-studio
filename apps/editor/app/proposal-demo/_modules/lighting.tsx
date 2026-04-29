'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Select } from '@react-three/postprocessing'
import { useScene, type AnyNodeId, type DeviceNode } from '@pascal-app/core'
import { colorTempToColor, colorTempToWarmth } from '@pascal-app/viewer'
import { INTERIOR_LAYER } from './geometry'
import { getPillColors } from './render-presets'
import type { RenderPreset } from './render-presets'
import type { DeviceData, RoomCentroid } from './types'
import { getIESPathForDevice } from './ies-registry'
import { useIES } from './use-ies'
import { LIGHTING_CONFIG } from './lighting-config'

// RectAreaLight 需要全局 uniform table 初始化一次，否则材质上不响应它。
// idempotent —— 多次调用安全。模块加载就跑一次。
let rectAreaUniformsReady = false
function ensureRectAreaLightUniforms() {
  if (rectAreaUniformsReady) return
  RectAreaLightUniformsLib.init()
  rectAreaUniformsReady = true
}
if (typeof window !== 'undefined') ensureRectAreaLightUniforms()

// 色温曲线工具透传给页面消费（页面已在用 colorTempToWarmth 计算 warmthFactor）
// 共享实现放在 packages/viewer/src/lib/color-temp.ts —— 灯带 / 点光源同一套 Tanner Helland。
export { colorTempToColor, colorTempToWarmth }

export interface LightState {
  on: boolean
  brightness: number
  /** 色温（K）—— 可选；缺省时使用 device.colorTemp（seed 加载时的初值） */
  colorTemp?: number
}

// ─── 单灯点（RoomBaseLight 的子单元）─────────────────────────────────────────
// 每个灯位一个实例：SpotLight（主光）+ PointLight（补光），共用 brightness 目标值。
/**
 * 房间总光通量预算（candela，**physically-based units**，恒定，所有 RoomLightPoint 分摊）。
 *
 * Three.js r155+ 默认 `useLegacyLights = false`，光照单位是物理量：
 *   - SpotLight intensity = candela（cd）
 *   - 9W LED 筒灯 ≈ 150 cd peak
 *   - 60W 白炽灯 ≈ 80 cd
 *   - 蜡烛 ≈ 1 cd
 *
 * 真实住宅照度：客厅 100-300 lx 平均，餐厅 200-400 lx，卧室 50-150 lx。
 * 4m×4m 房间 200 lx 总流明 ≈ 3200 lm，相当于 4 盏 9W LED ≈ 600 cd 总值。
 *
 * 但**演示场景不是物理仿真**，材质 emissive、HDRI envMap、ACES tonemapping 都
 * 会叠加；实际可视的"舒服亮度"对应 Three.js intensity ~6-12 cd 单灯总值。
 *
 * 跟"真实场景里光强应该没这么强"对齐，把 budget 砍到 12（之前 22 仍在过曝），
 * 由 sqrt(N) 分摊给多盏灯。
 */
const ROOM_LIGHT_BUDGET_SPOT = LIGHTING_CONFIG.light.roomBaseSpotBudget
const ROOM_LIGHT_BUDGET_FILL = LIGHTING_CONFIG.light.roomBaseFillBudget

export function RoomLightPoint({
  px, pz, brightness, lightY, wallHeight, col, perRadius, lightCount,
}: {
  px: number; pz: number
  brightness: number   // 0-100（与所在房间同步）
  lightY: number
  wallHeight: number
  col: THREE.Color
  perRadius: number    // 此单灯负责的覆盖半径
  /** 同一房间内总灯数（用于按 sqrt 分摊总光通量预算）*/
  lightCount: number
}) {
  const mainRef   = useRef<THREE.SpotLight>(null!)
  const targetRef = useRef<THREE.Object3D>(null!)
  const fillRef   = useRef<THREE.PointLight>(null!)
  const cur       = useRef(brightness / 100)

  const halfAngle = Math.min(Math.PI * 0.415, Math.atan2(perRadius * 1.3, lightY))

  // 单灯实际强度 = 总预算 ÷ sqrt(N)
  const splitFactor = 1 / Math.sqrt(Math.max(1, lightCount))
  const spotIntensityMax = ROOM_LIGHT_BUDGET_SPOT * splitFactor
  const fillIntensityMax = ROOM_LIGHT_BUDGET_FILL * splitFactor

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.target = targetRef.current
      mainRef.current.layers.set(INTERIOR_LAYER)
    }
    if (fillRef.current) fillRef.current.layers.set(INTERIOR_LAYER)
  }, [])

  useFrame((_, dt) => {
    const target = brightness / 100
    cur.current += (target - cur.current) * Math.min(1, dt * 14)
    const i = cur.current
    if (mainRef.current) {
      mainRef.current.intensity = i * spotIntensityMax
      mainRef.current.visible   = i > 0.01
    }
    if (fillRef.current) {
      fillRef.current.intensity = i * fillIntensityMax
      fillRef.current.visible   = i > 0.01
    }
  })

  return (
    <group>
      <object3D ref={targetRef} position={[px, 0, pz]} />
      <spotLight
        ref={mainRef}
        position={[px, lightY, pz]}
        color={col} intensity={0}
        distance={Math.hypot(lightY, perRadius * 1.3)}
        angle={halfAngle} penumbra={0.6} decay={2}
        visible={false}
      />
      <pointLight
        ref={fillRef}
        position={[px, wallHeight * 0.42, pz]}
        color={col} intensity={0}
        distance={perRadius * 1.2} decay={2}
        visible={false}
      />
    </group>
  )
}

// ─── 房间基础照明（Base Lighting Layer）────────────────────────────────────────
// 根据房间多边形自动分布多个灯点（1-4 盏），共用一个开关按钮。
// 小房间 1 盏居中，长条形沿长轴布灯，L 型沿两翼布灯，正方形 2×2 格布灯。
export function RoomBaseLight({
  centroid,
  brightness,
  wallHeight,
  label = '主照明',
  colorTemp = 3000,
  onToggle,
  onZoomIn,
  capsuleHidden = false,
  lightsActive = true,
}: {
  centroid: RoomCentroid
  brightness: number
  wallHeight: number
  label?: string
  colorTemp?: number
  onToggle: () => void
  onZoomIn?: () => void   // 灯光板块下点击放大镜图标进房间 Detail
  /** UI 胶囊是否隐藏（仅灯光板块需要这个开关） */
  capsuleHidden?: boolean
  /** 3D 基础灯是否启用（楼层近景就该亮，与板块无关） */
  lightsActive?: boolean
}) {
  const col   = colorTempToColor(colorTemp)
  const isOn  = brightness > 0
  const level = Math.max(0, Math.min(1, brightness / 100))
  const [hovered, setHovered] = useState(false)

  const lightY = wallHeight * 0.92
  const { lightPositions } = centroid
  // 每个灯点的覆盖半径 = 整体半径 / sqrt(灯数)，保证总覆盖面积不变
  const perRadius = centroid.radius / Math.sqrt(lightPositions.length)

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [hovered])

  return (
    <group>
      {/* 多灯点 — 每个位置独立渲染 SpotLight + PointLight，共用 brightness 目标
          【性能】只在"楼层近景"（lightsActive=true）才挂，避免 global / 多楼层叠加
          视图下白白吃 shader uniform。
          【关键】lightsActive 与板块无关——切到非灯光板块（窗帘/传感等）时房间还是
          要亮的，否则切板块墙体颜色会跳变（"建筑颜色变了"问题）。*/}
      {lightsActive && lightPositions.map(([px, pz], i) => (
        <RoomLightPoint
          key={i}
          px={px} pz={pz}
          brightness={brightness}
          lightY={lightY}
          wallHeight={wallHeight}
          col={col}
          perRadius={perRadius}
          lightCount={lightPositions.length}
        />
      ))}

      {/* 3D 场景内开关按钮 — 文字胶囊，点击切换，hover 高亮
          仅灯光板块显示；其它板块 unmount 避免无意义的 Html portal 开销 */}
      {!capsuleHidden && (
      <Html
        position={[centroid.cx, 1.2, centroid.cz]}
        center
        zIndexRange={[1, 5]}
        style={{ pointerEvents: 'none' }}
      >
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            pointerEvents: 'auto',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 20,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            // 开：暖黄半透底 + 细描边；关：深色半透底
            background: isOn
              ? hovered
                ? `rgba(255,210,80,${0.16 + level * 0.22})`
                : `rgba(255,210,80,${0.10 + level * 0.16})`
              : hovered ? 'rgba(30,35,50,0.72)'   : 'rgba(20,24,36,0.56)',
            border: isOn
              ? `1px solid rgba(255,210,80,${0.3 + level * 0.35})`
              : '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: isOn ? `0 0 ${8 + level * 8}px 2px rgba(255,200,60,${0.12 + level * 0.22})` : 'none',
            transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
          }}
        >
          {/* 状态指示圆点 */}
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: isOn ? '#ffdc82' : 'rgba(150,160,180,0.5)',
            boxShadow: isOn ? `0 0 ${4 + level * 5}px 1px rgba(255,200,60,${0.35 + level * 0.45})` : 'none',
            transition: 'background 0.3s, box-shadow 0.3s',
          }} />
          {/* 空间名 */}
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
            color: isOn ? 'rgba(255,238,170,0.95)' : 'rgba(180,190,210,0.75)',
            transition: 'color 0.25s',
          }}>
            {label}
          </span>
          {/* 亮度 / 关 */}
          <span style={{
            fontSize: 10, fontVariantNumeric: 'tabular-nums',
            color: isOn ? 'rgba(255,220,130,0.75)' : 'rgba(120,135,160,0.6)',
            transition: 'color 0.25s',
          }}>
            {isOn ? `${brightness}%` : '关'}
          </span>

          {/* 放大镜 — 点击 = 进入该房间的俯视 Detail；与胶囊主体（开关灯）职能分离
              仅灯光板块下且 onZoomIn 存在时显示 */}
          {onZoomIn && (
            <button
              type="button"
              // 用 click（pointerdown 跟 OrbitControls 的 pointer capture 冲突会丢事件）
              onClick={(e) => { e.stopPropagation(); onZoomIn() }}
              aria-label="进入房间"
              title="进入房间"
              style={{
                position: 'relative',
                marginLeft: 6,
                paddingLeft: 8,
                borderLeft: '1px solid rgba(255,255,255,0.14)',
                // 命中区 28×28（足以可靠点击），视觉 icon 居中
                width: 28, height: 26, padding: 0,
                border: 'none', background: 'transparent',
                color: hovered
                  ? (isOn ? 'rgba(255,240,180,1)' : 'rgba(220,230,250,1)')
                  : (isOn ? 'rgba(255,230,160,0.85)' : 'rgba(180,195,220,0.78)'),
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.25s, transform 0.2s',
                transform: hovered ? 'scale(1.08)' : 'scale(1)',
                pointerEvents: 'auto',
              }}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', zIndex: 1 }}>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
                <path d="M11 8v6M8 11h6" />
              </svg>
            </button>
          )}
        </div>
      </Html>
      )}
    </group>
  )
}

export function DemoLightBulb({
  device,
  state,
  onToggle,
  isNight,
  preset,
  compactMarker = false,
  active = true,
  onOpenPopup,
}: {
  device: DeviceData
  state: LightState
  onToggle: () => void
  isNight: boolean
  preset: RenderPreset
  /**
   * compact 模式：不渲染 hover tooltip + 不响应点击，只画一个静态小点作为
   * "这盏灯位置在这里"的端点标记。回路视图下用，因为开关已经收敛到回路 pill。
   */
  compactMarker?: boolean
  active?: boolean
  /** compactMarker 模式下，点端点 dot 触发：打开属性 popup。
      传了就启用 click，不传就保持原来的不可交互（向后兼容）。*/
  onOpenPopup?: () => void
}) {
  const lightRef  = useRef<THREE.SpotLight>(null!)
  const fillRef   = useRef<THREE.PointLight>(null!)
  const rectRef   = useRef<THREE.RectAreaLight>(null!)
  const targetRef = useRef<THREE.Object3D>(null!)
  const cur       = useRef(state.on ? state.brightness / 100 : 0)
  const [labelHovered, setLabelHovered] = useState(false)

  // 色温优先从 lightStates（运行时）读，缺省回退 device.colorTemp（seed 初值）
  const effectiveColorTemp = state.colorTemp ?? device.colorTemp
  const col = useMemo(() => colorTempToColor(effectiveColorTemp), [effectiveColorTemp])
  const [px, py, pz] = device.position
  // 标记位置 = 灯具实体安装位置（吊顶下沿），不是房间中段。
  // 之前固定 1.15m 导致筒灯小圆点显示在墙腰，看上去"灯长在半空"，
  // 用户在 detail 视图里会以为灯没装到吊顶。
  // 略减 0.02m 让点贴在吊顶面下侧，避免被 capGeo（顶面）Z-fight。
  const labelY = py - 0.02
  const pill = getPillColors(preset.key, isNight, state.on)
  // SpotLight 半角：演示页强制下限 45°（=90° 全开），不管设备 `beamAngle` 是 24°/30°/36°。
  // 原因：IES 关掉之后，SpotLight 自身只有 hard cutoff，太窄就是探照灯。
  // 真实 24° 筒灯在 2.7m 顶下投出 ~1.4m 直径的硬币热斑（=用户截图所见），
  // 需要把锥放宽 + penumbra 拉大让边缘羽化，才能呈现"室内柔光"的视觉。
  const rawHalfAngle = THREE.MathUtils.degToRad((device.beamAngle ?? 60) / 2)
  const coneHalfAngle = Math.max(rawHalfAngle, THREE.MathUtils.degToRad(45))

  const isPanel = device.renderType === 'panel'

  // IES 配光曲线：演示页**默认关掉**。
  // IES 文件按真实灯具的光强分布（如 Aqara T2 24°）裁切光锥，物理正确，
  // 但视觉上被压缩成"白色硬币"——多盏并排时不像家居灯光，像聚光灯阵。
  // registry/use-ies.ts 仍保留，未来想做"精准光强模式"开关时直接打开即可。
  const iesPath = null as string | null
  const iesTexture = useIES(iesPath)
  // 避免 dead-code 警告 —— 把 registry 函数显式标记为"仍在用，但当前禁用"
  void getIESPathForDevice

  // SpotLight target + Layer 隔离 + RectAreaLight 朝下 + IES 应用
  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current
      lightRef.current.layers.set(INTERIOR_LAYER)
    }
    if (fillRef.current) {
      fillRef.current.layers.set(INTERIOR_LAYER)
    }
    if (rectRef.current) {
      // RectAreaLight 默认朝 -z；旋转 X 轴 -90° 让发光面朝下（朝地板）
      rectRef.current.rotation.x = -Math.PI / 2
      rectRef.current.layers.set(INTERIOR_LAYER)
      // 颜色更新（RectAreaLight 不会自动跟着 prop 更新，需手动 set）
      rectRef.current.color.copy(col)
    }
  }, [col])

  // IES texture 加载完成后注入 SpotLight.iesMap —— 让光锥按真实灯具光强分布
  useEffect(() => {
    const sl = lightRef.current
    if (!sl) return
    // @ts-expect-error iesMap 是 Three.js r150+ 新增字段，TS 类型可能未跟上
    sl.iesMap = iesTexture
    // 修改光照属性后必须 markDirty 否则材质 shader 不重新编译
    sl.dispose?.()
  }, [iesTexture])

  useFrame((_, dt) => {
    // active=false 时强制 target=0，让灯平滑暗下来；visible 仍保持 true，
    // shader 不会因为 light count 变化触发重编。
    const target = active && state.on ? state.brightness / 100 : 0
    cur.current  += (target - cur.current) * Math.min(1, dt * 10)
    const i = cur.current

    // 所有强度从 LIGHTING_CONFIG 读，单一来源，禁止硬编码
    if (isPanel) {
      if (rectRef.current) {
        rectRef.current.intensity = i * LIGHTING_CONFIG.light.panelRect
        rectRef.current.visible = true
      }
      if (fillRef.current) {
        fillRef.current.intensity = i * LIGHTING_CONFIG.light.panelFill
        fillRef.current.visible = true
      }
      return
    }
    if (lightRef.current) {
      lightRef.current.intensity = i * LIGHTING_CONFIG.light.downlightSpot
      lightRef.current.visible = true
    }
  })

  useEffect(() => {
    document.body.style.cursor = labelHovered ? 'pointer' : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [labelHovered])

  return (
    <group>
      {/* 目标点：正下方地板，作为 SpotLight.target */}
      <object3D ref={targetRef} position={[px, 0, pz]} />

      {/* 非 Panel：SpotLight — 射灯/主灯，beamAngle 控制开角。
          Panel 走下面的 RectAreaLight，不重复创建 SpotLight，避免双倍流明。
          - distance 收到 py*1.2：光打到地板再多衰减一点就消失，不会蔓延到 4m 外的墙
          - penumbra 0.3：边缘过渡更利落，减少"光糊到墙"的感觉 */}
      {!isPanel && (
        <spotLight
          ref={lightRef}
          position={[px, py - 0.05, pz]}
          color={col}
          intensity={0}
          distance={py * 1.6}
          angle={coneHalfAngle}
          penumbra={0.6}
          decay={2}
          visible
        />
      )}

      {/* Panel 主光源：RectAreaLight —— 真正的"面光源"，比 SpotLight 更接近物理。
          - 默认朝 -z，useEffect 里旋转成朝下（朝地板）
          - width/height = 灯具实际尺寸（默认 0.6×0.6m，常见 300×600 / 600×600 面板）
          - RectAreaLight 不支持 castShadow，但视觉上柔和的扩散正是面板灯特征
          - 必须 RectAreaLightUniformsLib.init()（模块顶部已做） */}
      {isPanel && (
        <rectAreaLight
          ref={rectRef}
          position={[px, py - 0.005, pz]}
          color={col}
          intensity={0}
          width={0.6}
          height={0.6}
          visible
        />
      )}

      {/* Panel 环境补光：小 PointLight 让远处侧墙不会突兀地变暗
          （RectAreaLight 距离衰减快，靠近地板的边缘容易没光）*/}
      {isPanel && (
        <pointLight
          ref={fillRef}
          position={[px, py * 0.6, pz]}
          color={col}
          intensity={0}
          distance={py * 1.8}
          decay={2}
          visible
        />
      )}

      {/* panel 主灯发光面 + SelectiveBloom 选区 */}
      {isPanel && (
        <Select enabled={state.on}>
          <mesh position={[px, py - 0.005, pz]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.6, 0.6]} />
            <meshStandardMaterial
              color={state.on ? col : '#555'}
              emissive={col}
              emissiveIntensity={state.on ? (state.brightness / 100) * LIGHTING_CONFIG.emissive.panelFace : 0}
              transparent
              opacity={state.on ? 0.9 : 0.25}
              side={THREE.DoubleSide}
            />
          </mesh>
        </Select>
      )}

      {/* 筒灯/射灯：贴顶 4cm 圆盘当"灯泡"，参与 SelectiveBloom 给柔和辉光 */}
      {!isPanel && (
        <Select enabled={state.on}>
          <mesh position={[px, py - 0.005, pz]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.04, 16]} />
            <meshStandardMaterial
              color={col}
              emissive={col}
              emissiveIntensity={state.on ? (state.brightness / 100) * LIGHTING_CONFIG.emissive.downlightBulb : 0}
              transparent
              opacity={state.on ? 0.95 : 0.0}
              side={THREE.DoubleSide}
            />
          </mesh>
        </Select>
      )}

      {/* 灯具标记：
          - 普通模式：可点击的小圆点 + hover tooltip，单独控制这盏灯
          - compact 模式（回路视图下用）：纯静态小点，不响应事件，开关交给回路 pill */}
      {compactMarker ? (
        !isPanel && (
          <Html
            position={[px, labelY, pz]}
            center
            zIndexRange={[1, 5]}
            style={{ pointerEvents: 'none' }}
          >
            {/* 端点 dot —— 传了 onOpenPopup 就允许 click 打开属性面板 */}
            <div
              role={onOpenPopup ? 'button' : undefined}
              onClick={onOpenPopup ? (e) => { e.stopPropagation(); onOpenPopup() } : undefined}
              style={{
                width: 9, height: 9, borderRadius: '50%',
                background: state.on ? pill.text : 'rgba(150,150,160,0.55)',
                boxShadow: state.on ? `0 0 5px 1px ${pill.text}88` : '0 0 0 1px rgba(0,0,0,0.18)',
                transition: 'background 0.3s, box-shadow 0.3s, transform 0.15s',
                pointerEvents: onOpenPopup ? 'auto' : 'none',
                cursor: onOpenPopup ? 'pointer' : 'default',
              }}
            />
          </Html>
        )
      ) : (
        <Html
          position={[px, labelY, pz]}
          center
          zIndexRange={[1, 5]}
          style={{ pointerEvents: 'none' }}
        >
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            onMouseEnter={() => setLabelHovered(true)}
            onMouseLeave={() => setLabelHovered(false)}
            style={{ pointerEvents: 'auto', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            {!isPanel && (
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: state.on ? pill.text : 'rgba(150,150,160,0.5)',
                boxShadow: state.on ? `0 0 6px 2px ${pill.text}55` : 'none',
                transition: 'background 0.4s, box-shadow 0.4s',
              }} />
            )}

            {/* Hover tooltip */}
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              pointerEvents: 'none',
              opacity: labelHovered ? 1 : 0,
              transition: 'opacity 0.15s',
              background: 'rgba(10,12,18,0.88)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8,
              padding: '4px 10px',
              whiteSpace: 'nowrap',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ color: 'rgba(229,240,255,0.9)', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em' }}>
                {device.name}
              </span>
              <span style={{ color: 'rgba(166,190,222,0.7)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                {state.on ? `${state.brightness}%` : '关'}
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}

// ─── 回路连线 + 中心 pill 按钮 ────────────────────────────────────────────────
//
// 在 detail 视图下用：把同回路的灯用半透明虚线连起来，再在质心放一个 pill
// 显示"回路 N"+ on/off，点击调用 onToggle —— 上层 toggleLight 已经做了回路联动，
// 所以这里只要把回路里任意一盏的 id 传上去即可。
//
// 单灯回路（单独一盏灯自成回路）也走这条路径，pill 显示"灯具名"+开关。
export function CircuitOverlay({
  members,
  anyOn,
  brightness,
  preset,
  isNight,
  onToggle,
  label,
  onOpenPopup,
}: {
  members: DeviceData[]
  anyOn: boolean
  brightness: number
  preset: RenderPreset
  isNight: boolean
  onToggle: () => void
  label: string
  /** 点 pill 触发：打开回路属性 popup（应用到所有成员）。
      传了 = click 打开 popup；不传 = click 走 onToggle（向后兼容） */
  onOpenPopup?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const pill = getPillColors(preset.key, isNight, anyOn)

  // 连线：沿 members 顺序串成 polyline，用 LineDashedMaterial。
  // 单灯回路（members.length=1）跳过连线，只画 pill。
  // LineDashedMaterial 必须在 line 实例上调用 computeLineDistances() 否则虚线不显示。
  const lineRef = useRef<THREE.Line>(null!)
  useEffect(() => {
    if (members.length < 2) return
    const line = lineRef.current
    if (!line) return
    const pts: number[] = []
    for (const m of members) {
      // 连线与灯位对齐（不再投射到地面）
      pts.push(m.position[0], (m.position[1] ?? 2.6) + 0.02, m.position[2])
    }
    line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    line.geometry.computeBoundingSphere()
    line.computeLineDistances()
  }, [members])

  // 质心位置：回路成员 XYZ 平均值，pill 贴近连线高度，避免“线在地上、按钮在半空”割裂
  const cx = members.reduce((s, m) => s + m.position[0], 0) / members.length
  const cy = members.reduce((s, m) => s + (m.position[1] ?? 2.6), 0) / members.length
  const cz = members.reduce((s, m) => s + m.position[2], 0) / members.length

  return (
    <group>
      {/* 连线（仅回路成员 ≥ 2 时） */}
      {members.length >= 2 && (
        // @ts-expect-error r3f 的 <line> 元素和 React DOM 的 <line> 类型撞了，
        // intrinsic JSX 类型会按 SVGLineElement 解析；ref 实际上拿到 THREE.Line。
        <line ref={lineRef}>
          <bufferGeometry />
          <lineDashedMaterial
            color={anyOn ? pill.text : '#9aa6b8'}
            dashSize={0.18}
            gapSize={0.12}
            transparent
            opacity={0.55}
            depthTest={false}
          />
        </line>
      )}

      {/* 中心 pill 按钮 */}
      <Html
        position={[cx, cy + 0.22, cz]}
        center
        zIndexRange={[1, 6]}
        style={{ pointerEvents: 'none' }}
      >
        {/* 复合 pill：左半 click = toggle on/off（保留快速开关），右半 ⚙ click = popup（详细调节） */}
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            pointerEvents: 'auto',
            display: 'inline-flex', alignItems: 'stretch',
            borderRadius: 999,
            // 直接用 pill.bg / pill.border / pill.text —— getPillColors 已经按 on/off
            // 返回好两套完整配色。之前拼 `${pill.text}1f` 是无效 CSS，浏览器会忽略，
            // 透出 3D 场景导致"开关一次后底色变了"的诡异现象。
            background: pill.bg,
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: `1px solid ${pill.border}`,
            color: pill.text,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            boxShadow: hovered
              ? '0 4px 16px rgba(0,0,0,0.35)'
              : '0 2px 8px rgba(0,0,0,0.20)',
            transform: hovered ? 'scale(1.04)' : 'scale(1)',
            transition: 'transform 0.15s, box-shadow 0.2s, background 0.3s, border-color 0.3s, color 0.3s',
            overflow: 'hidden',
          }}
        >
          {/* 左半：click = toggle */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '7px 12px',
              background: 'transparent', border: 'none', color: 'inherit',
              font: 'inherit', cursor: 'pointer',
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: anyOn ? pill.text : 'rgba(150,150,160,0.5)',
              boxShadow: anyOn ? `0 0 6px 1px ${pill.border}` : 'none',
              transition: 'background 0.3s, box-shadow 0.3s',
            }} />
            <span>{label}</span>
            <span style={{
              opacity: 0.75, fontSize: 10, fontVariantNumeric: 'tabular-nums',
              color: pill.meta,
            }}>
              {anyOn ? `${brightness}%` : '关'}
            </span>
          </button>
          {/* 右半：齿轮按钮 = 打开属性 popup */}
          {onOpenPopup && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenPopup() }}
              title="调节亮度 / 色温"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, padding: 0,
                background: 'transparent',
                border: 'none',
                borderLeft: `1px solid ${pill.border}`,
                color: 'inherit', cursor: 'pointer',
                fontSize: 13, opacity: 0.85,
              }}
            >
              ⚙
            </button>
          )}
        </div>
      </Html>
    </group>
  )
}

// ─── 灯带 toggle pill —— DemoLightBulb 的灯带版 ─────────────────────────────
//
// 灯带不走 DemoLightBulb（那是为单点 SpotLight 设计的）；这里给灯带加一个独立
// 的悬浮 pill，让用户在演示页能开关 + 看亮度。读 useScene 的 state 作为真值
// （和 DeviceRenderer/LightStripGeometry 共享），点击调外部 onToggle（外部会
// 同时写 lightStates 本地态和 store）。
export function DemoLightStripPill({
  node,
  onToggle,
  preset,
  isNight,
  onOpenPopup,
}: {
  node: DeviceNode
  onToggle: () => void
  preset: RenderPreset
  isNight: boolean
  /** 齿轮按钮 click：打开属性 popup（亮度 + 色温） */
  onOpenPopup?: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const sceneState = useScene((s) => {
    const n = s.nodes[node.id as AnyNodeId] as DeviceNode | undefined
    return (n?.state ?? {}) as Record<string, unknown>
  })
  const on = (sceneState.on as boolean) ?? false
  const brightness = (sceneState.brightness as number) ?? 100

  // 锚点：path 中点 + 微微抬高
  const path = (node.params as { path?: Array<[number, number]> } | undefined)?.path
  if (!Array.isArray(path) || path.length < 2) return null
  const cx = path.reduce((s, p) => s + p[0], 0) / path.length
  const cz = path.reduce((s, p) => s + p[1], 0) / path.length
  const cy = (node.position[1] ?? 2.6) + 0.25

  const pill = getPillColors(preset.key, isNight, on)
  const label = (node.name as string | undefined) ?? (node.productName as string | undefined) ?? '灯带'

  return (
    <group position={[cx, cy, cz]}>
      <Html
        position={[0, 0, 0]}
        center
        zIndexRange={[1, 5]}
        style={{ pointerEvents: 'none' }}
      >
        {/* 复合 pill：左半 click = toggle，右半 ⚙ = popup（同回路 pill 模式） */}
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            pointerEvents: 'auto',
            display: 'inline-flex', alignItems: 'stretch',
            borderRadius: 999,
            background: pill.bg,
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: `1px solid ${pill.border}`,
            color: pill.text,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            boxShadow: hovered
              ? '0 4px 16px rgba(0,0,0,0.35)'
              : '0 2px 8px rgba(0,0,0,0.20)',
            transform: hovered ? 'scale(1.04)' : 'scale(1)',
            transition: 'transform 0.15s, box-shadow 0.2s, background 0.3s, border-color 0.3s, color 0.3s',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '7px 12px',
              background: 'transparent', border: 'none', color: 'inherit',
              font: 'inherit', cursor: 'pointer',
            }}
          >
            <span style={{
              width: 14, height: 4, borderRadius: 2,
              background: on ? pill.text : 'rgba(150,150,160,0.5)',
              boxShadow: on ? `0 0 6px 1px ${pill.border}` : 'none',
              transition: 'background 0.3s, box-shadow 0.3s',
            }} />
            <span>{label}</span>
            <span style={{ opacity: 0.75, fontSize: 10, fontVariantNumeric: 'tabular-nums', color: pill.meta }}>
              {on ? `${brightness}%` : '关'}
            </span>
          </button>
          {onOpenPopup && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenPopup() }}
              title="调节亮度 / 色温"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, padding: 0,
                background: 'transparent',
                border: 'none',
                borderLeft: `1px solid ${pill.border}`,
                color: 'inherit', cursor: 'pointer',
                fontSize: 13, opacity: 0.85,
              }}
            >
              ⚙
            </button>
          )}
        </div>
      </Html>
    </group>
  )
}

// ─── 灯光 Shader 懒预热 ────────────────────────────────────────────────────────
//
// 设计意图：进 detail 房间时 Three.js 第一次遇到"N 盏 SpotLight + 当前材质"组合
// 会同步编译 fragment shader（200-500ms freeze）。Three.js 按 shader 源码字符串
// 缓存，源码受 light count 影响 → 不同灯数的房间会触发新一轮编译。
//
// 优化策略：进入"灯光"板块时，后台依次为每种 unique 灯数变种编译一次 shader。
// 用临时创建的 SpotLight 对象（intensity≈0、不可见区域、无开销）凑出每个变种的
// light count，gl.compile() 后 Three.js 把编译产物缓存。之后用户进具体房间，
// 同样的 light count 命中缓存 → 0 编译 → 切房间丝滑。
//
// 触发时机：上层在 view.module 变为 'lighting' 的首次时挂载本组件。
// 不挡操作：只在屏幕角落给一个小进度 chip，用户能继续看 overview。
//
// 工程要点：
//   - 临时灯放在 (0, -1000, 0) 这种远离视野的位置，intensity 极小，肉眼不可见
//   - gl.compile 是同步阻塞调用，每次 ~几十 ms；分多帧执行避免单帧卡顿
//   - 卸载时清干净 scene 节点，否则会泄漏 SpotLight 引用
export function LightingShaderWarmup({
  uniqueCounts,
  onProgress,
  onDone,
}: {
  /** 房间的 unique 灯数集合（去重后），每个 count 对应一种 shader 变种 */
  uniqueCounts: number[]
  onProgress?: (current: number, total: number) => void
  onDone: () => void
}) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    if (uniqueCounts.length === 0) {
      onDone()
      return
    }

    let cancelled = false
    let idx = 0
    let pendingRaf = 0

    const compileVariant = (count: number) => {
      // 创建 count 盏临时 SpotLight，配置和 DemoLightBulb 保持一致以触发同变种
      const lights: THREE.SpotLight[] = []
      const targets: THREE.Object3D[] = []
      for (let i = 0; i < count; i++) {
        // 远离视野的"暗仓"位置 —— 避免临时灯影响当前画面
        const t = new THREE.Object3D()
        t.position.set(i * 0.01, -1001, 0)
        scene.add(t)
        targets.push(t)

        const sl = new THREE.SpotLight(0xffffff, 0.001)
        sl.position.set(i * 0.01, -1000, 0)
        sl.target = t
        sl.angle = Math.PI / 4
        sl.penumbra = 0.6
        sl.decay = 2
        sl.distance = 4
        sl.castShadow = false
        sl.visible = true
        scene.add(sl)
        lights.push(sl)
      }

      try {
        // gl.compile 同步编译所有命中此 light count 的材质程序
        gl.compile(scene, camera)
      } catch (err) {
        console.warn('[LightingShaderWarmup] compile failed for count', count, err)
      }

      // 立即清理，下一次编译要用新的 count
      for (const sl of lights) scene.remove(sl)
      for (const t of targets) scene.remove(t)
    }

    const step = () => {
      if (cancelled) return
      onProgress?.(idx + 1, uniqueCounts.length)
      const count = uniqueCounts[idx]!
      compileVariant(count)
      idx++
      if (idx >= uniqueCounts.length) {
        onDone()
        return
      }
      // 跨帧执行下一个变种，避免单帧卡顿
      pendingRaf = requestAnimationFrame(step)
    }

    pendingRaf = requestAnimationFrame(step)
    return () => {
      cancelled = true
      cancelAnimationFrame(pendingRaf)
    }
    // 依赖故意只放 uniqueCounts.join 等价物 —— 同样的灯数集合不重复预热
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueCounts.join('-')])

  return null
}
