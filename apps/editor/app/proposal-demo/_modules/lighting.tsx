'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { INTERIOR_LAYER } from './geometry'
import { getPillColors } from './render-presets'
import type { RenderPreset } from './render-presets'
import type { DeviceData, RoomCentroid } from './types'

// ─── 灯具渲染 ────────────────────────────────────────────────────────────────

/** 色温（K）→ Three.js Color */
export function colorTempToColor(k: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (k - 2700) / (6500 - 2700)))
  // 暖白 #ffc87a → 冷白 #cfe0ff
  return new THREE.Color(
    1,
    0.78 + t * 0.10,
    0.48 + t * 0.52,
  )
}

export interface LightState { on: boolean; brightness: number }

// ─── 单灯点（RoomBaseLight 的子单元）─────────────────────────────────────────
// 每个灯位一个实例：SpotLight（主光）+ PointLight（补光），共用 brightness 目标值。
export function RoomLightPoint({
  px, pz, brightness, lightY, wallHeight, col, perRadius,
}: {
  px: number; pz: number
  brightness: number   // 0-100（与所在房间同步）
  lightY: number
  wallHeight: number
  col: THREE.Color
  perRadius: number    // 此单灯负责的覆盖半径
}) {
  const mainRef   = useRef<THREE.SpotLight>(null!)
  const targetRef = useRef<THREE.Object3D>(null!)
  const fillRef   = useRef<THREE.PointLight>(null!)
  const cur       = useRef(brightness / 100)

  const halfAngle = Math.min(Math.PI * 0.415, Math.atan2(perRadius * 1.3, lightY))

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
      mainRef.current.intensity = i * 38
      mainRef.current.visible   = i > 0.01
    }
    if (fillRef.current) {
      fillRef.current.intensity = i * 8
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
  hidden = false,
}: {
  centroid: RoomCentroid
  brightness: number
  wallHeight: number
  label?: string
  colorTemp?: number
  onToggle: () => void
  onZoomIn?: () => void   // 灯光板块下点击放大镜图标进房间 Detail
  hidden?: boolean        // Room-Detail 下其他房间胶囊 hidden，或非灯板块下全隐
}) {
  const col   = colorTempToColor(colorTemp)
  const isOn  = brightness > 0
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
      {/* 多灯点 — 每个位置独立渲染 SpotLight + PointLight，共用 brightness 目标 */}
      {lightPositions.map(([px, pz], i) => (
        <RoomLightPoint
          key={i}
          px={px} pz={pz}
          brightness={brightness}
          lightY={lightY}
          wallHeight={wallHeight}
          col={col}
          perRadius={perRadius}
        />
      ))}

      {/* 3D 场景内开关按钮 — 文字胶囊，点击切换，hover 高亮
          hidden=true 时 opacity 0 + pointerEvents none（不 unmount 避免 React 抖动） */}
      <Html
        position={[centroid.cx, 1.2, centroid.cz]}
        center
        zIndexRange={[1, 5]}
        style={{ pointerEvents: 'none', opacity: hidden ? 0 : 1, transition: 'opacity 0.35s ease' }}
      >
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            pointerEvents: hidden ? 'none' : 'auto',
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
              ? hovered ? 'rgba(255,210,80,0.22)' : 'rgba(255,210,80,0.14)'
              : hovered ? 'rgba(30,35,50,0.72)'   : 'rgba(20,24,36,0.56)',
            border: isOn
              ? '1px solid rgba(255,210,80,0.45)'
              : '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: isOn ? '0 0 10px 2px rgba(255,200,60,0.18)' : 'none',
            transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
          }}
        >
          {/* 状态指示圆点 */}
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: isOn ? '#ffdc82' : 'rgba(150,160,180,0.5)',
            boxShadow: isOn ? '0 0 5px 1px rgba(255,200,60,0.55)' : 'none',
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
              onClick={(e) => { e.stopPropagation(); onZoomIn() }}
              aria-label="进入房间"
              style={{
                marginLeft: 6,
                paddingLeft: 6,
                borderLeft: '1px solid rgba(255,255,255,0.14)',
                width: 20, height: 20,
                border: 'none', background: 'transparent',
                color: hovered
                  ? (isOn ? 'rgba(255,240,180,1)' : 'rgba(220,230,250,1)')
                  : (isOn ? 'rgba(255,230,160,0.8)' : 'rgba(180,195,220,0.7)'),
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.25s, transform 0.25s',
                transform: hovered ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
                <path d="M11 8v6M8 11h6" />
              </svg>
            </button>
          )}
        </div>
      </Html>
    </group>
  )
}

export function DemoLightBulb({
  device,
  state,
  onToggle,
  isNight,
  preset,
}: {
  device: DeviceData
  state: LightState
  onToggle: () => void
  isNight: boolean
  preset: RenderPreset
}) {
  const lightRef  = useRef<THREE.SpotLight>(null!)
  const fillRef   = useRef<THREE.PointLight>(null!)
  const targetRef = useRef<THREE.Object3D>(null!)
  const cur       = useRef(state.on ? state.brightness / 100 : 0)
  const [labelHovered, setLabelHovered] = useState(false)

  const col = colorTempToColor(device.colorTemp)
  const [px, py, pz] = device.position
  const labelY = 1.15
  const pill = getPillColors(preset.key, isNight, state.on)
  // 把 device.beamAngle（度数）转为弧度，SpotLight.angle 是半角，默认 60° 全开角
  const coneHalfAngle = THREE.MathUtils.degToRad((device.beamAngle ?? 60) / 2)

  // SpotLight target + 设置室内 Layer（灯具光源同样只照室内）
  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current
      lightRef.current.layers.set(INTERIOR_LAYER)
    }
    if (fillRef.current) {
      fillRef.current.layers.set(INTERIOR_LAYER)
    }
  }, [])

  const isPanel = device.renderType === 'panel'

  useFrame((_, dt) => {
    const target = state.on ? state.brightness / 100 : 0
    cur.current  += (target - cur.current) * Math.min(1, dt * 10)
    const i = cur.current

    if (lightRef.current) {
      // panel 主灯强度更高（广角覆盖整个房间）
      lightRef.current.intensity = i * (isPanel ? 32 : 25)
      lightRef.current.visible   = i > 0.01
    }
    // panel 用 PointLight 补全环境漫反射（让地板/侧墙也被照亮）
    if (isPanel && fillRef.current) {
      fillRef.current.intensity = i * 18
      fillRef.current.visible   = i > 0.01
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

      {/* SpotLight — 射灯/主灯，beamAngle 控制开角
          不用 castShadow：同 RoomBaseLight，shadowMaterial 会采样所有投影光源
          distance 收紧到 py * 1.5（约 4m），与房间尺度匹配，不会到达室外 */}
      <spotLight
        ref={lightRef}
        position={[px, py - 0.05, pz]}
        color={col}
        intensity={0}
        distance={py * 1.5}
        angle={coneHalfAngle}
        penumbra={isPanel ? 0.9 : 0.45}
        decay={2}
        visible={false}
      />

      {/* panel 补光：PointLight 提供环境漫反射，让地板和侧墙也被照亮
          distance 收紧到 py * 1.8，不超出房间范围 */}
      {isPanel && (
        <pointLight
          ref={fillRef}
          position={[px, py * 0.6, pz]}
          color={col}
          intensity={0}
          distance={py * 1.8}
          decay={2}
          visible={false}
        />
      )}

      {/* panel 主灯：天花板矩形发光面 */}
      {isPanel && (
        <mesh position={[px, py - 0.005, pz]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.6, 0.6]} />
          <meshStandardMaterial
            color={state.on ? col : '#555'}
            emissive={col}
            emissiveIntensity={state.on ? (state.brightness / 100) * 4 : 0}
            transparent
            opacity={state.on ? 0.95 : 0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* 灯具标记 — 默认小点（射灯）或矩形已做，hover 弹出 tooltip */}
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
          {/* 射灯小点（panel 有自己的矩形面，这里只渲染非 panel 的圆点） */}
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
    </group>
  )
}
