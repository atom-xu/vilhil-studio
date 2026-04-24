'use client'

import { useDeviceState } from '@vilhil/smarthome'
import {
  DeviceRenderer,
  DeviceRenderModeProvider,
  NetworkHeatmapOverlay,
  XrayOverlay,
} from '@pascal-app/viewer'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Preload } from '@react-three/drei'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { loadSeed } from './_modules/types'
import type { SceneSeed } from './_modules/types'
import type { LightState } from './_modules/lighting'
import {
  CameraRig, ShaderPreheat,
  computeArcMidpoint, resolvePoseForView,
  type CameraRigApi, type ViewState, type ModuleKey,
} from './_modules/camera'
import {
  RENDER_PRESETS, parsePresetKey, computeSunDirection, computeMoonDirection, getRealHour,
  type RenderPresetKey,
} from './_modules/render-presets'
import { DemoStructure, FogAnimator, DemoEnvironment } from './_modules/structure'
import {
  DemoTopBar, DemoRail, FloorSwitcher, DashboardPanel, SceneDock,
  DEMO_SCENES, type SceneConfig,
} from './_modules/hud'

const LOCAL_STORAGE_KEY = 'pascal-editor-scene'

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function ProposalDemoPage() {
  const [seed, setSeed] = useState<SceneSeed | null>(null)
  const [status, setStatus] = useState<'loading' | 'no-data' | 'ready'>('loading')
  const [lightStates, setLightStates] = useState<Record<string, LightState>>({})
  // Base lighting 层：每个房间独立亮度，key = roomCentroid.id
  // 初始为空 {}，等 seed 加载后按 roomCentroids 初始化
  const [roomStates, setRoomStates] = useState<Record<string, number>>({})
  const [activePresetKey, setActivePresetKey] = useState<RenderPresetKey>('opslab')
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [activeSceneStartedAt, setActiveSceneStartedAt] = useState<number | null>(null)
  // 当前展示楼层 —— null 时由 loadSeed 自动挑墙体最多的
  const [currentLevelId, setCurrentLevelId] = useState<string | null>(null)

  // ── 视角系统 ─────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewState>({ level: 'overview', module: 'lighting' })
  const cameraApiRef = useRef<CameraRigApi | null>(null)
  const controlsRef  = useRef<any>(null)

  // URL ?module= 深链接：挂载时读取初始值，不碰 SSR（纯 window API）
  useEffect(() => {
    const VALID_MODULES: ModuleKey[] = ['lighting', 'curtain', 'sensor', 'panel', 'hvac', 'av', 'security', 'network']
    const m = new URLSearchParams(window.location.search).get('module') as ModuleKey | null
    if (m && VALID_MODULES.includes(m)) {
      setView(prev => ({ ...prev, module: m }))
    }
  }, [])

  // URL ?module= 双向同步：状态变化时静默更新 URL（replaceState 不触发 rerender）
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('module', view.module)
    window.history.replaceState(null, '', url.toString())
  }, [view.module])

  // 当前真实时间（每分钟自动更新）
  const [realHour, setRealHour] = useState(getRealHour)
  // 拖动滑块时的预览时间（null = 不在预览，使用 realHour）
  const [previewHour, setPreviewHour] = useState<number | null>(null)
  const isDraggingRef = useRef(false)

  const displayHour = previewHour ?? realHour
  const isPreviewing = previewHour !== null
  const activePreset = RENDER_PRESETS[activePresetKey]

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setActivePresetKey(parsePresetKey(params.get('preset')))
  }, [])

  useEffect(() => {
    const s = loadSeed(currentLevelId ?? undefined)
    if (!s) { setStatus('no-data'); return }
    setSeed(s)
    // 第一次加载时记下系统挑的 levelId（后续由 FloorSwitcher 控制）
    if (currentLevelId === null) setCurrentLevelId(s.levelId)
    setLightStates(
      Object.fromEntries(s.devices.map((d) => [d.id, { on: d.on, brightness: d.brightness }]))
    )
    // 每个房间默认开灯 80%
    setRoomStates(Object.fromEntries(s.roomCentroids.map((c) => [c.id, 80])))
    setStatus('ready')
  }, [currentLevelId])

  // 切换单个房间 base lighting：0 ↔ 80
  const toggleRoomLight = useCallback((roomId: string) => {
    setActiveSceneId(null)
    setActiveSceneStartedAt(null)
    setRoomStates((prev) => ({ ...prev, [roomId]: (prev[roomId] ?? 80) > 0 ? 0 : 80 }))
  }, [])

  const toggleLight = useCallback((id: string) => {
    setLightStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { on: false, brightness: 100 }), on: !(prev[id]?.on ?? false) },
    }))
  }, [])

  // ── 视角切换函数 ───────────────────────────────────────────────────────

  // 基于当前 seed 构造 PoseInput
  const buildPoseInput = useCallback((s: SceneSeed) => ({
    bboxCx: s.bbox.cx,
    bboxCz: s.bbox.cz,
    bboxSpan: Math.max(s.bbox.w, s.bbox.d, 8),
    rooms: s.roomCentroids.map((r) => ({ id: r.id, cx: r.cx, cz: r.cz, radius: r.radius, width: r.width, depth: r.depth })),
    devices: s.devices.map((d) => ({ id: d.id, position: d.position })),
  }), [])

  // 通用推进到指定 ViewState；自动按距离自适应时长
  const playTo = useCallback((nextView: ViewState, opts?: { duration?: number; onDone?: () => void }) => {
    if (!seed || !cameraApiRef.current) return
    const input = buildPoseInput(seed)
    const from = cameraApiRef.current.sampleCurrent()
    const to = resolvePoseForView(nextView, input, from.pos)   // 传当前位姿 → 俯视继承方位
    if (!to) return
    const dist = Math.hypot(to.pos[0] - from.pos[0], to.pos[1] - from.pos[1], to.pos[2] - from.pos[2])
    const refDist = input.bboxSpan * 2
    const tRaw = Math.min(1, Math.max(0.08, dist / refDist))
    const duration = opts?.duration ?? (0.4 + 0.8 * Math.sqrt(tRaw))
    cameraApiRef.current.play({
      fromPos: from.pos, fromTgt: from.tgt,
      toPos: to.pos,     toTgt: to.tgt,
      midPos: computeArcMidpoint(from.pos, to.pos),
      duration,
      onDone: opts?.onDone,
    })
    setView(nextView)
  }, [seed, buildPoseInput])

  // 进入某房间的灯光 Detail（俯视）
  const enterLightingDetail = useCallback((roomId: string) => {
    playTo({ level: 'detail', module: 'lighting', targetId: roomId })
  }, [playTo])

  // 返回 Overview
  const backToOverview = useCallback(() => {
    playTo({ level: 'overview', module: view.module }, { duration: 0.75 })
  }, [playTo, view.module])

  // 切换 Module：若当前在 Detail，走复合动画（先返回 Overview，再留在新 module 的 Overview）
  const switchModule = useCallback((nextModule: ModuleKey) => {
    if (nextModule === view.module) return
    if (view.level === 'detail') {
      // 两段动画：Detail 原 module → Overview（0.6s），到位后 setView 改 module
      playTo({ level: 'overview', module: view.module }, {
        duration: 0.6,
        onDone: () => setView({ level: 'overview', module: nextModule }),
      })
    } else {
      setView({ level: 'overview', module: nextModule })
    }
  }, [view.level, view.module, playTo])

  // 把 view.module（既有侧栏的聚焦）同步到 useDeviceState.selectedSubsystem —— 让新路径
  // 的 NetworkHeatmapOverlay / XrayOverlay / DeviceEffects 跟随既有侧栏工作，
  // 避免再造第二个侧栏。ModuleKey 的 8 个值全部都是合法 Subsystem 的子集。
  useEffect(() => {
    useDeviceState.getState().selectSubsystem(view.module)
  }, [view.module])

  // 页面卸载时恢复聚焦为 null，避免返回编辑器后设备仍处于淡化状态
  useEffect(() => {
    return () => {
      useDeviceState.getState().selectSubsystem(null)
    }
  }, [])

  // Esc 返回
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && view.level === 'detail') {
        e.preventDefault()
        backToOverview()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [view.level, backToOverview])

  // 每分钟同步真实时间
  useEffect(() => {
    const tick = () => setRealHour(getRealHour())
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  // 松手时（无论在哪里松手）恢复真实时间
  useEffect(() => {
    const onUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        setPreviewHour(null)
      }
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [])

  const handleSliderDown = useCallback(() => {
    isDraggingRef.current = true
  }, [])

  const handleSliderChange = useCallback((h: number) => {
    if (isDraggingRef.current) setPreviewHour(h)
  }, [])

  const handleSyncNow = useCallback(() => {
    setPreviewHour(null)
    setRealHour(getRealHour())
  }, [])

  const executeScene = useCallback((scene: SceneConfig) => {
    setActiveSceneId(scene.id)
    setActiveSceneStartedAt(Date.now())
    // Base lighting 先响应（瞬发，动画由 RoomBaseLight useFrame 负责平滑）
    if (seed) {
      setRoomStates(Object.fromEntries(seed.roomCentroids.map((c) => [c.id, scene.roomBrightness])))
    }
    if (!seed) return
    // 已配置灯具逐个延迟（演示感）
    const targets = scene.getStates(seed.devices)
    Object.entries(targets).forEach(([deviceId, state], i) => {
      setTimeout(() => {
        setLightStates((prev) => ({ ...prev, [deviceId]: { ...prev[deviceId], ...state } }))
      }, i * 160)
    })
  }, [seed])

  const handleAllOn = useCallback(() => {
    setActiveSceneId(null)
    setActiveSceneStartedAt(null)
    if (seed) setRoomStates(Object.fromEntries(seed.roomCentroids.map((c) => [c.id, 80])))
    if (!seed) return
    seed.devices.forEach((d, i) => {
      setTimeout(() => {
        setLightStates((prev) => ({ ...prev, [d.id]: { ...prev[d.id], on: true, brightness: 80 } }))
      }, i * 100)
    })
  }, [seed])

  const handleAllOff = useCallback(() => {
    setActiveSceneId(null)
    setActiveSceneStartedAt(null)
    if (seed) setRoomStates(Object.fromEntries(seed.roomCentroids.map((c) => [c.id, 0])))
    if (!seed) return
    seed.devices.forEach((d, i) => {
      setTimeout(() => {
        setLightStates((prev) => ({ ...prev, [d.id]: { brightness: 1, ...prev[d.id], on: false } }))
      }, i * 80)
    })
  }, [seed])

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50 text-neutral-400">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-400" />
          <p className="text-sm">正在加载方案…</p>
        </div>
      </div>
    )
  }

  if (status === 'no-data') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50 text-neutral-800">
        <div className="max-w-md text-center">
          <h2 className="mb-3 font-semibold text-xl">还没有方案</h2>
          <p className="mb-6 text-sm text-neutral-400">请先在主编辑器画一个方案，数据会自动同步到这里。</p>
          <a className="inline-block rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700" href="/">
            打开主编辑器
          </a>
        </div>
      </div>
    )
  }

  if (!seed) return null

  // 相机初始位置：30° 仰角（elevation = 30°，polar from zenith = 60°）
  const span  = Math.max(seed.bbox.w, seed.bbox.d, 8)
  const dist  = span * 2.2
  const tgt:  [number, number, number] = [seed.bbox.cx, 0.6, seed.bbox.cz]
  const camX  = tgt[0] + dist * 0.612   // cos(30°) * cos(45°) ≈ 0.612
  const camY  = tgt[1] + dist * 0.5     // sin(30°)
  const camZ  = tgt[2] + dist * 0.612
  // 太阳/月亮方向（随 displayHour 实时更新）
  const sunDir    = computeSunDirection(displayHour)
  const isNight   = sunDir === null
  const lightDir0 = sunDir ?? computeMoonDirection(displayHour)
  // 按楼层 northAngle 旋转光源方向（绕 Y 轴，顺时针）
  const _nr  = (seed.northAngle * Math.PI) / 180
  const _c   = Math.cos(_nr), _s = Math.sin(_nr)
  const lightDir: [number, number, number] = [
    lightDir0[0] * _c - lightDir0[2] * _s,
    lightDir0[1],
    lightDir0[0] * _s + lightDir0[2] * _c,
  ]
  const lightDist = span * 4
  const lightPos: [number, number, number] = [
    seed.bbox.cx + lightDir[0] * lightDist,
    lightDir[1] * lightDist,
    seed.bbox.cz + lightDir[2] * lightDist,
  ]
  const openingsTotal = Object.values(seed.openingsByWall).reduce((acc, arr) => acc + arr.length, 0)
  const lightsOn = Object.values(lightStates).filter((s) => s.on).length
  const canvasFilter = (() => {
    if (activePresetKey === 'opslab') {
      return isNight
        ? 'contrast(1.08) saturate(1.02) brightness(0.96)'
        : 'contrast(1.06) saturate(1.08) brightness(1.01)'
    }
    if (activePresetKey === 'showcase') return isNight ? 'contrast(1.16) saturate(1.2) brightness(0.95)' : 'contrast(1.12) saturate(1.16) brightness(1.02)'
    if (activePresetKey === 'night') return isNight ? 'contrast(1.2) saturate(1.18) brightness(0.88)' : 'contrast(1.08) saturate(1.1) brightness(0.98)'
    if (activePresetKey === 'smooth') return isNight ? 'contrast(1.02) saturate(0.9) brightness(0.96)' : 'contrast(1.01) saturate(0.92) brightness(1.01)'
    return isNight ? 'contrast(1.05) saturate(1.0)' : 'contrast(1.04) saturate(1.04)'
  })()
  const vignetteOpacity = (() => {
    if (activePresetKey === 'showcase') return isNight ? 0.32 : 0.22
    if (activePresetKey === 'night') return isNight ? 0.36 : 0.2
    if (activePresetKey === 'smooth') return isNight ? 0.18 : 0.1
    if (activePresetKey === 'opslab') return isNight ? 0.24 : 0.14
    return isNight ? 0.24 : 0.14
  })()
  const grainOpacity = (() => {
    if (activePresetKey === 'showcase') return isNight ? 0.17 : 0.1
    if (activePresetKey === 'night') return isNight ? 0.2 : 0.12
    if (activePresetKey === 'smooth') return isNight ? 0.06 : 0.04
    if (activePresetKey === 'opslab') return isNight ? 0.14 : 0.09
    return isNight ? 0.12 : 0.07
  })()
  const overlayBlendMode = (() => {
    if (activePresetKey === 'showcase') return isNight ? 'screen' : 'soft-light'
    if (activePresetKey === 'night') return isNight ? 'color-dodge' : 'soft-light'
    if (activePresetKey === 'smooth') return 'normal'
    return isNight ? 'screen' : 'normal'
  })()
  // 只有 showcase（命令中心/数字孪生）保留扫描线装饰，其他 preset 去掉（之前的横纹就是这个）
  const grainPattern = activePresetKey === 'showcase'
    ? 'repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(120,200,255,0.05) 0 1px, transparent 1px 30px)'
    : 'none'

  // 背景径向渐变 — 中心 = 地板色（与反射层 fade 边缘无缝融合），外圈 = 环境背景色
  const bgGradient = isNight
    ? `radial-gradient(ellipse 70% 55% at 50% 58%, ${activePreset.theme.padColorNight} 0%, ${activePreset.theme.bgColorNight} 70%)`
    : `radial-gradient(ellipse 70% 55% at 50% 58%, ${activePreset.theme.padColorDay} 0%, ${activePreset.theme.bgColorDay} 70%)`

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {/* ── 顶栏 ── */}
      <DemoTopBar
        buildingName={seed.buildingName}
        levelName={seed.levelName}
        wallCount={seed.walls.length}
        displayHour={displayHour}
        realHour={realHour}
        isPreviewing={isPreviewing}
        isNight={isNight}
        preset={activePreset}
        activePresetKey={activePresetKey}
        onPresetChange={setActivePresetKey}
        onSliderChange={handleSliderChange}
        onSliderDown={handleSliderDown}
        onSyncNow={handleSyncNow}
      />

      {/* ── 主区域：左栏 + 舞台 ── */}
      <div className="flex min-h-0 flex-1">
        <DemoRail
          isNight={isNight}
          activeModule={view.module}
          onModuleClick={switchModule}
          onOverviewClick={backToOverview}
        />

        {/* ── 舞台（3D + 浮动控件）── */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          style={{ background: bgGradient, transition: 'background 0.7s ease' }}
        >
          {/* 返回按钮 — Detail 模式下左上浮层（Esc 的兜底入口） */}
          {view.level === 'detail' && (
            <button
              type="button"
              onClick={backToOverview}
              className="absolute z-20 flex items-center gap-1.5 rounded-lg px-3 py-2 backdrop-blur-xl transition-all"
              style={{
                top: 16, left: 16,
                background: isNight ? 'rgba(14,28,51,0.82)' : 'rgba(255,255,255,0.88)',
                border: `1px solid ${isNight ? 'rgba(186,210,238,0.22)' : 'rgba(40,60,100,0.12)'}`,
                color: isNight ? 'rgba(230,240,255,0.95)' : 'rgba(30,45,75,0.9)',
                fontSize: 12, fontWeight: 500,
                boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(-2px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateX(0)' }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>返回总览</span>
              <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 4 }}>Esc</span>
            </button>
          )}

          {/* 叠层效果 */}
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              backgroundImage: isNight ? activePreset.theme.overlayNight : activePreset.theme.overlayDay,
              opacity: 1,
              mixBlendMode: overlayBlendMode,
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-[2]"
            style={{
              background: 'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.02), rgba(0,0,0,0.42) 88%)',
              opacity: vignetteOpacity,
              mixBlendMode: 'multiply',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-[2]"
            style={{
              backgroundImage: grainPattern,
              opacity: grainOpacity,
              mixBlendMode: isNight ? 'screen' : 'soft-light',
            }}
          />

          {/* 左侧楼层切换器 —— 单楼层时组件自动返回 null */}
          <FloorSwitcher
            levels={seed.availableLevels}
            currentLevelId={seed.levelId}
            onChange={setCurrentLevelId}
            isNight={isNight}
          />

          {/* 右上仪表盘 —— 方案完整度 + 子系统 tile + 当前场景 + 建筑/灯光副数据 */}
          <DashboardPanel
            buildingName={seed.buildingName}
            levelName={seed.levelName}
            area={Math.round((seed.bbox.w || 0) * (seed.bbox.d || 0))}
            deviceNodes={seed.allDeviceNodes}
            activeSceneLabel={
              activeSceneId
                ? (DEMO_SCENES.find((s) => s.id === activeSceneId)?.label ?? null)
                : null
            }
            activeSceneStartedAt={activeSceneStartedAt}
            isNight={isNight}
            lightsOn={lightsOn}
            lightsTotal={seed.devices.length}
          />

          {/* 场景 dock */}
          <SceneDock
            activeSceneId={activeSceneId}
            isNight={isNight}
            onExecute={executeScene}
            onAllOn={handleAllOn}
            onAllOff={handleAllOff}
          />

          {/* 3D Canvas */}
          <Canvas
            key={`${seed.bbox.cx}-${seed.bbox.cz}`}
            camera={{ fov: 50, near: 0.1, far: 500, position: [camX, camY, camZ] }}
            frameloop="always"
            dpr={[1, 1.5]}
            gl={{
              // Retina(2x) 自带像素级 AA，无需 MSAA；antialias 在高 DPR 下反而是性能杀手
              antialias: false,
              toneMapping: activePreset.toneMapping,
              toneMappingExposure: activePreset.exposure,
              powerPreference: 'high-performance',
            }}
            shadows={{ type: THREE.PCFSoftShadowMap }}
            onCreated={({ camera }) => {
              camera.layers.enableAll()
            }}
            style={{
              position: 'absolute', inset: 0,
              background: 'transparent',
              filter: canvasFilter,
              // CSS filter 값이 바뀔 때 즉시 점프하지 않도록 부드럽게 전환
              transition: 'filter 1.0s ease',
            }}
          >
            <fog attach="fog" args={[activePreset.theme.bgColorDay, span * 2.2, span * 6]} />
            <FogAnimator isNight={isNight} preset={activePreset} />
            <DemoEnvironment lightPos={lightPos} isNight={isNight} preset={activePreset} />
            <DemoStructure
              walls={seed.walls}
              openingsByWall={seed.openingsByWall}
              devices={seed.devices}
              slabs={seed.slabs}
              items={seed.items}
              roomCentroids={seed.roomCentroids}
              roomStates={roomStates}
              lightStates={lightStates}
              bbox={seed.bbox}
              lightPos={lightPos}
              isNight={isNight}
              preset={activePreset}
              onToggleLight={toggleLight}
              onToggleRoom={toggleRoomLight}
              view={view}
              onEnterLightingDetail={enterLightingDetail}
            />
            {/*
              非灯光子系统走新的 DeviceRenderer/Effects 路径（演示模式）：
              摄像头激光锥、AP 覆盖、PIR 锥、窗帘 4 类、HVAC ribbon、音箱音波、
              架构粒子环，均在此处挂载。lighting 设备仍由 DemoStructure 自定义渲染，
              避免和既有"室内灯光氛围"撞车。

              WiFi 体积热力图 + X 光透明模式：仅在网络/架构子系统聚焦时显形。
            */}
            <DeviceRenderModeProvider mode="demo">
              {seed.allDeviceNodes
                .filter((n) => n.subsystem !== 'lighting')
                .map((n) => (
                  <DeviceRenderer key={n.id} node={n} />
                ))}
              <NetworkHeatmapOverlay />
              <XrayOverlay />
            </DeviceRenderModeProvider>
            {/* CameraRig — Overview ↔ Detail 动画；ShaderPreheat + Preload 减少首次卡顿 */}
            <CameraRig apiRef={cameraApiRef} controlsRef={controlsRef} />
            <ShaderPreheat />
            <Preload all />
            {/* OrbitControls 参数随 Level 动态调整：
                Overview：大范围 orbit；
                灯光 Detail（俯视）：限制在接近俯视的小范围，缩放限制房间尺度内 */}
            <OrbitControls
              ref={controlsRef}
              target={tgt}
              dampingFactor={0.08}
              enableDamping
              enablePan={false}
              enableZoom
              minDistance={view.level === 'detail' ? 2 : 3}
              maxDistance={view.level === 'detail' ? 8 : dist * 2}
              minPolarAngle={view.level === 'detail' ? 0.02 : Math.PI / 6}
              maxPolarAngle={view.level === 'detail' ? Math.PI * 0.22 : Math.PI * 17 / 36}
            />
          </Canvas>
        </div>
      </div>
    </div>
  )
}
