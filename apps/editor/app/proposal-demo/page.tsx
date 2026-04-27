'use client'

import {
  getEffectiveCircuitId,
  listCircuitMembers,
  setDeviceState,
  useDeviceState,
} from '@vilhil/smarthome'
import { emitter, useScene } from '@pascal-app/core'
import {
  DeviceRenderer,
  DeviceRenderModeProvider,
  NetworkHeatmapOverlay,
  XrayOverlay,
} from '@pascal-app/viewer'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Preload } from '@react-three/drei'
import { Selection } from '@react-three/postprocessing'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { loadSeed, loadAllSeeds } from './_modules/types'
import type { SceneSeed, ConvertedWall } from './_modules/types'
import { FloorAnimator, FLOOR_ANIM_DUR } from './_modules/floor-animator'
import type { LightState } from './_modules/lighting'
import { DemoLightStripPill, LightingShaderWarmup } from './_modules/lighting'
import {
  CameraRig, ShaderPreheat, CompassUpdater,
  resolvePoseForView, estimateShotDuration,
  type CameraRigApi, type ViewState, type ModuleKey,
} from './_modules/camera'
import {
  RENDER_PRESETS, parsePresetKey, computeSunDirection, computeMoonDirection, getRealHour,
  type RenderPresetKey, type RenderPreset,
} from './_modules/render-presets'
import { DemoStructure, FogAnimator, DemoEnvironment, transitionSuppressRef } from './_modules/structure'
import { DemoBloomLayer } from './_modules/bloom'
import {
  DemoTopBar, DemoRail, FloorSwitcher, DashboardPanel, SceneDock, Compass,
  DEMO_SCENES, type SceneConfig,
} from './_modules/hud'

const LOCAL_STORAGE_KEY = 'pascal-editor-scene'
const PRESET_OVERRIDES_STORAGE_KEY = 'proposal-demo-preset-overrides-v1'
const EXPLODED_GAP = 5.5  // 与 floor-animator.ts COMPRESSED_GAP 保持一致
// 相机语义参数：
// - GLOBAL_*：全局总览（更平一点，弱化“前倾”错觉）
// - FLOOR_FOCUS_*：楼层聚焦（高角度 60°~70°）
const GLOBAL_HORIZ_FACTOR = 1.85
const GLOBAL_HEIGHT_FACTOR = 0.78
const FLOOR_FOCUS_HORIZ_FACTOR = 0.48
const FLOOR_FOCUS_HEIGHT_FACTOR = 1.22
const INTRO_DISTANCE_MULT = 1.9
const INTRO_HEIGHT_MULT = 1.28
const INTRO_DURATION = 1.05

function resolveCameraBearingXZ(
  fromPos: [number, number, number],
  target: [number, number, number],
  fallback: [number, number] = [0.5, -0.866],
): [number, number] {
  const dx = fromPos[0] - target[0]
  const dz = fromPos[2] - target[2]
  const len = Math.hypot(dx, dz)
  if (len < 0.001) return fallback
  return [dx / len, dz / len]
}

/**
 * 房间"默认环境照明"亮度（0-100）。
 *
 * 硬规则：演示页加载后，每个房间应**自动有基础照明**——不依赖用户布灯，
 * 客户切到二楼立刻能看到房间是亮着的。
 *
 * 经过几轮调试：
 *   80 → 40 → 22。前两档配合 SpotLight×4 / 房间 + ACES 在地板/墙上叠到 1.0 luminance
 *   以上，被 ACES 压成纯白，2700K 色温也看不出"暖"，整体过曝看不见家具。
 *   降到 22 让光照保持在 ACES 线性区间，3000K → 2700K 的暖色才能真正显形为
 *   "温馨"而非"白光"。
 *
 * "全开" / "夜间影院"等场景仍可推到 100，这只是 base 默认。
 */
const DEFAULT_ROOM_BRIGHTNESS = 22

// ─── OrbitControls 目标同步器（Canvas 内组件）────────────────────────────────
// 空闲期间（controls.enabled=true）将 tgt 写入 controls.target，
// 让楼层/视角切换后方向目标平滑跟随，而不经过 React prop 触发 lookAt 硬切。
function TargetSync({
  controlsRef,
  tgt,
}: {
  controlsRef: React.MutableRefObject<any>
  tgt: [number, number, number]
}) {
  const tgtRef = useRef(tgt)
  tgtRef.current = tgt   // 每次 render 更新最新值（ref 不触发 effect/useFrame）

  useFrame(() => {
    const ctl = controlsRef.current
    if (!ctl || !ctl.enabled) return
    const [x, y, z] = tgtRef.current
    if (
      Math.abs(ctl.target.x - x) > 0.01 ||
      Math.abs(ctl.target.y - y) > 0.01 ||
      Math.abs(ctl.target.z - z) > 0.01
    ) {
      ctl.target.set(x, y, z)
      // 不主动调用 update()，由 OrbitControls 自己的 useFrame 接管
    }
  })
  return null
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function ProposalDemoPage() {
  const [seed, setSeed] = useState<SceneSeed | null>(null)
  const [status, setStatus] = useState<'loading' | 'no-data' | 'ready'>('loading')
  // 灯光懒预热：进入"灯光"板块时（view.module === 'lighting' 首次）才预编译
  // 各种 light count 的 shader 变种。一开始打开页面（overview）不挡用户。
  // 预热完成后切房间不再有 shader 编译卡顿。
  const [lightingWarmupTriggered, setLightingWarmupTriggered] = useState(false)
  const [lightingWarmupDone, setLightingWarmupDone] = useState(false)
  const [lightingWarmupProgress, setLightingWarmupProgress] = useState<{ current: number; total: number } | null>(null)
  const [lightStates, setLightStates] = useState<Record<string, LightState>>({})
  // Base lighting 层：每个房间独立亮度，key = roomCentroid.id
  // 初始为空 {}，等 seed 加载后按 roomCentroids 初始化
  const [roomStates, setRoomStates] = useState<Record<string, number>>({})
  const [activePresetKey, setActivePresetKey] = useState<RenderPresetKey>('opslab')
  const [presetOverrides, setPresetOverrides] = useState<Partial<Record<RenderPresetKey, RenderPreset>>>({})
  const [previewPreset, setPreviewPreset] = useState<RenderPreset | null>(null)
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [activeSceneStartedAt, setActiveSceneStartedAt] = useState<number | null>(null)
  const [uniformWall10cm, setUniformWall10cm] = useState(false)
  const [colorCalibrationMode, setColorCalibrationMode] = useState(false)
  // 当前展示楼层 —— null 时由 loadSeed 自动挑墙体最多的
  const [currentLevelId, setCurrentLevelId] = useState<string | null>(null)
  // 全部楼层数据（多楼层时始终加载）
  const [allSeeds, setAllSeeds] = useState<SceneSeed[] | null>(null)
  // null = 全屋视图；number = allSeeds 中的活跃楼层下标
  const [activeAllFloorIdx, setActiveAllFloorIdx] = useState<number | null>(null)
  // 递增触发 FloorAnimator 动画
  const [floorSwitchTrigger, setFloorSwitchTrigger] = useState(1)
  // 阴影开关
  const [shadowsEnabled, setShadowsEnabled] = useState(true)
  // 倒影开关 —— 控制 1F 楼板下的镜面倒影（墙体 / 家具 / pad）。
  // 默认 false：客户演示时倒影是"加分项"而不是默认就有，避免设计意图不清时的视觉噪音。
  const [reflectionsEnabled, setReflectionsEnabled] = useState(false)
  // Bloom 开关 —— 调试用。怀疑过曝是 bloom 反馈造成时关掉直接看真实场景。
  const [bloomEnabled, setBloomEnabled] = useState(true)

  // 多楼层共同旋转轴心：所有楼层 bbox 合并后的中心，避免各层绕自身轴旋转时漂移
  const globalPivot = useMemo(() => {
    if (!allSeeds || allSeeds.length <= 1) return null
    let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity
    for (const s of allSeeds) {
      mnX = Math.min(mnX, s.bbox.cx - s.bbox.w / 2)
      mxX = Math.max(mxX, s.bbox.cx + s.bbox.w / 2)
      mnZ = Math.min(mnZ, s.bbox.cz - s.bbox.d / 2)
      mxZ = Math.max(mxZ, s.bbox.cz + s.bbox.d / 2)
    }
    return { cx: (mnX + mxX) / 2, cz: (mnZ + mxZ) / 2 }
  }, [allSeeds])

  // ── 视角系统 ─────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewState>({ level: 'global', module: 'lighting' })
  const cameraApiRef  = useRef<CameraRigApi | null>(null)
  const controlsRef   = useRef<any>(null)
  const floorFocusTimerRef = useRef<number | null>(null)
  const introPlayedRef = useRef(false)
  const compassNeedle = useRef<HTMLDivElement | null>(null)
  // 爆炸视图：各楼层共享方位角（绕各自 XZ 中心旋转）
  const azimuthRef    = useRef(0)
  const dragRef       = useRef<{ x: number; az0: number } | null>(null)
  // OrbitControls 初始 target 在首帧由回调写入；后续由 CameraRig 驱动（动画期间）
  // 或由 TargetSync 驱动（空闲期间）。不使用 React prop 避免状态变化时 lookAt 硬切。
  const pendingTgtRef = useRef<[number, number, number]>([0, 1, 0])

  // 开发调试：控制台输入 __cam() 可读取当前相机位姿
  useEffect(() => {
    ;(window as any).__cam = () => {
      const c = cameraApiRef.current?.sampleCurrent()
      console.log('[CAM]', JSON.stringify(c))
      return c
    }
    return () => { delete (window as any).__cam }
  }, [])

  useEffect(() => {
    return () => {
      if (floorFocusTimerRef.current !== null) {
        window.clearTimeout(floorFocusTimerRef.current)
        floorFocusTimerRef.current = null
      }
    }
  }, [])

  // 安全兜底：
  // 如果楼层飞行动画被其他动画中断，可能导致 transitionSuppressRef 残留为 true。
  // 这里在“当前无动画”时自动复位，避免阴影长期丢失或状态卡住。
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!transitionSuppressRef.current) return
      const animating = cameraApiRef.current?.isAnimating() ?? false
      if (!animating) transitionSuppressRef.current = false
    }, 120)
    return () => window.clearInterval(id)
  }, [])

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

  // 进入"灯光"板块时触发懒预热（一次性）
  useEffect(() => {
    if (view.module === 'lighting' && !lightingWarmupTriggered) {
      setLightingWarmupTriggered(true)
    }
  }, [view.module, lightingWarmupTriggered])

  // 计算每个房间的"用户布灯"数量，得到 unique counts 集合用于 shader 预热
  // 同样数量的房间共享 shader 变种，只需为每种 unique count 编译一次
  const lightingUniqueCounts = useMemo<number[]>(() => {
    if (!seed) return []
    const countsByRoom: number[] = []
    for (const room of seed.roomCentroids) {
      const halfW = room.width / 2
      const halfD = room.depth / 2
      let n = 0
      for (const d of seed.devices) {
        if (
          Math.abs(d.position[0] - room.cx) <= halfW &&
          Math.abs(d.position[2] - room.cz) <= halfD
        ) n++
      }
      if (n > 0) countsByRoom.push(n)
    }
    // 去重 + 排序，结果如 [3, 5, 8]
    return Array.from(new Set(countsByRoom)).sort((a, b) => a - b)
  }, [seed])

  // 当前真实时间（每分钟自动更新）
  const [realHour, setRealHour] = useState(getRealHour)
  // 拖动滑块时的预览时间（null = 不在预览，使用 realHour）
  const [previewHour, setPreviewHour] = useState<number | null>(null)
  const isDraggingRef = useRef(false)

  const displayHour = previewHour ?? realHour
  const isPreviewing = previewHour !== null
  const presetCatalog = useMemo(() => {
    const next = { ...RENDER_PRESETS }
    ;(Object.keys(presetOverrides) as RenderPresetKey[]).forEach((key) => {
      const override = presetOverrides[key]
      if (override) next[key] = override
    })
    return next
  }, [presetOverrides])
  const activePreset = previewPreset ?? presetCatalog[activePresetKey]
  const resolveWalls = useCallback(
    (walls: ConvertedWall[]) => (uniformWall10cm ? walls.map((w) => ({ ...w, thickness: 0.1 })) : walls),
    [uniformWall10cm],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(PRESET_OVERRIDES_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<Record<RenderPresetKey, RenderPreset>>
      if (parsed && typeof parsed === 'object') setPresetOverrides(parsed)
    } catch {
      // ignore malformed cache
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(PRESET_OVERRIDES_STORAGE_KEY, JSON.stringify(presetOverrides))
    } catch {
      // ignore write failure
    }
  }, [presetOverrides])

  const handleSavePresetOverride = useCallback((key: RenderPresetKey, preset: RenderPreset) => {
    setPresetOverrides((prev) => ({ ...prev, [key]: preset }))
    setPreviewPreset(null)
  }, [])

  const handleResetPresetOverride = useCallback((key: RenderPresetKey) => {
    setPresetOverrides((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    setPreviewPreset(null)
  }, [])

  const handlePreviewPreset = useCallback((preset: RenderPreset | null) => {
    setPreviewPreset(preset)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setActivePresetKey(parsePresetKey(params.get('preset')))
  }, [])

  useEffect(() => {
    setPreviewPreset(null)
  }, [activePresetKey])

  useEffect(() => {
    const s = loadSeed(currentLevelId ?? undefined)
    if (!s) { setStatus('no-data'); return }
    setSeed(s)
    if (currentLevelId === null) {
      setCurrentLevelId(s.levelId)
      // 初次加载时一次性加载全部楼层数据（多楼层才有意义）
      const all = loadAllSeeds()
      if (all.length > 1) setAllSeeds(all)
    }
    setLightStates(
      Object.fromEntries(s.devices.map((d) => [d.id, { on: d.on, brightness: d.brightness }]))
    )
    setRoomStates(Object.fromEntries(s.roomCentroids.map((c) => [c.id, DEFAULT_ROOM_BRIGHTNESS])))
    setStatus('ready')
    // seed 变化（切户型 / 切楼层）时重置预热状态，下次进灯光模块再做
    setLightingWarmupTriggered(false)
    setLightingWarmupDone(false)
    setLightingWarmupProgress(null)
  }, [currentLevelId])

  // 切换单个房间 base lighting：0 ↔ 80
  const toggleRoomLight = useCallback((roomId: string) => {
    // detail 视图下房间胶囊不应再控制默认基础光，避免和设备级灯光编辑语义冲突
    if (view.level === 'detail') return
    setActiveSceneId(null)
    setActiveSceneStartedAt(null)
    // 用户点亮房间 = 推到完全亮（80），关 = 0；和 base 默认 40 区分开
    setRoomStates((prev) => ({ ...prev, [roomId]: (prev[roomId] ?? 0) > 0 ? 0 : 80 }))
  }, [view.level])

  const toggleLight = useCallback((id: string) => {
    // 回路联动：点一盏灯 = 同回路所有灯一起开/关。
    // 单灯回路 = 单灯，多灯回路 = 这一组（通常 1-5 盏）。
    const { nodes } = useScene.getState()
    const node = nodes[id as keyof typeof nodes]
    let memberIds: string[] = [id]
    if (node && node.type === 'device') {
      const cid = getEffectiveCircuitId(node as never)
      const members = listCircuitMembers(cid)
      if (members.length > 0) memberIds = members.map((m) => m.id)
    }

    // 【单一真值源】统一用 store（useScene）的当前状态算 nextOn。
    // 之前两边各算（lightStates 用本地 prev、setDeviceState 用 store currentOn）会
    // 在初始化时机不同步时算出相反方向 → 视觉上"点了没反应 / 闪一下又回"。
    // 现在所有成员的 next 状态由同一个 nextOn 决定，绝对一致。
    const currentOn = ((node as { state?: { on?: boolean } } | undefined)?.state?.on) ?? false
    const nextOn = !currentOn

    setLightStates((prev) => {
      const next = { ...prev }
      for (const mid of memberIds) {
        next[mid] = { ...(prev[mid] ?? { on: false, brightness: 100 }), on: nextOn }
      }
      return next
    })

    // 同步 store —— 灯带 / DeviceRenderer 从 store 读真值，必须显式 set。
    // setDeviceState 显式赋值（而不是 toggle）保证整条回路同向。
    for (const mid of memberIds) {
      setDeviceState(mid as never, { on: nextOn })
    }
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

  // 通用推进到指定 ViewState；所有视角切换与楼层动画使用同一时长节奏
  const playTo = useCallback((nextView: ViewState, opts?: { duration?: number; onDone?: () => void }) => {
    if (!seed || !cameraApiRef.current) return
    const input = buildPoseInput(seed)
    const from = cameraApiRef.current.sampleCurrent()
    const to = resolvePoseForView(nextView, input, from.pos)
    if (!to) return
    const autoDuration = estimateShotDuration(from.pos, to.pos, from.tgt, to.tgt)
    const duration = opts?.duration ?? autoDuration
    cameraApiRef.current.play({
      fromPos: from.pos, fromTgt: from.tgt,
      toPos: to.pos,     toTgt: to.tgt,
      // 模块/详情切换用直线推进，避免切换前摇
      midPos: undefined,
      duration,
      onDone: opts?.onDone,
    })
    setView(nextView)
  }, [seed, buildPoseInput])

  /**
   * 进入 detail 时：记录被关闭房间的"原 base 亮度"快照，离开时恢复。
   * Map 而不是单个 ref —— 用户可以从 Room A 直接 zoom 到 Room B 不经 overview，
   * 这时要保证 A 恢复 + B 入栈。
   */
  const baseSnapshotRef = useRef<Map<string, number>>(new Map())

  // 退出 detail 前统一恢复被关闭的房间基础光，避免跨楼层/跨模块后遗留暗房间
  const restoreDetailRoomBase = useCallback(() => {
    setRoomStates((prev) => {
      if (baseSnapshotRef.current.size === 0) return prev
      const next = { ...prev }
      baseSnapshotRef.current.forEach((val, id) => {
        next[id] = val
      })
      baseSnapshotRef.current.clear()
      return next
    })
  }, [])

  /**
   * 检测目标房间是否布了用户灯具。
   * 简单 bbox 命中测试（centroid ± width/2 / depth/2）；L 型房间会有边缘误差，
   * 但对"是否切预设光"够用。灯带用 path 中点位置，点光源用 device.position。
   */
  const roomHasUserLights = useCallback(
    (roomId: string): boolean => {
      if (!seed) return false
      const room = seed.roomCentroids.find((c) => c.id === roomId)
      if (!room) return false
      const halfW = room.width / 2
      const halfD = room.depth / 2
      const inBbox = (x: number, z: number) =>
        Math.abs(x - room.cx) <= halfW && Math.abs(z - room.cz) <= halfD

      // 点光源
      for (const d of seed.devices) {
        if (inBbox(d.position[0], d.position[2])) return true
      }
      // 灯带（path 中点）
      for (const n of seed.allDeviceNodes) {
        if (n.subsystem !== 'lighting') continue
        const path = (n.params as { path?: Array<[number, number]> })?.path
        if (!Array.isArray(path) || path.length < 2) continue
        const mx = path.reduce((s, p) => s + p[0], 0) / path.length
        const mz = path.reduce((s, p) => s + p[1], 0) / path.length
        if (inBbox(mx, mz)) return true
      }
      return false
    },
    [seed],
  )

  /**
   * 进入某房间的 Detail。
   *
   * 规则（用户最终决定）：
   *   - 房间布了灯 → 关掉 RoomBaseLight（设 0），只看用户布的灯
   *   - 房间没布灯 → 保持 base 默认照明（不然纯黑没法看）
   *
   * 用 baseSnapshotRef 记被关过的房间，离开 detail 时恢复。
   */
  const enterLightingDetail = useCallback((roomId: string) => {
    if (view.module !== 'lighting') return
    const hasLights = roomHasUserLights(roomId)
    setRoomStates((prev) => {
      const next = { ...prev }
      // 恢复之前 detail 关掉的房间（A → B 直接跳的情况）
      baseSnapshotRef.current.forEach((val, id) => {
        next[id] = val
      })
      baseSnapshotRef.current.clear()
      // 仅当房间有灯时才关 base 预设
      if (hasLights) {
        baseSnapshotRef.current.set(roomId, prev[roomId] ?? DEFAULT_ROOM_BRIGHTNESS)
        next[roomId] = 0
      }
      return next
    })
    playTo({ level: 'detail', module: 'lighting', targetId: roomId })
  }, [playTo, view.module, roomHasUserLights])

  // 从 Detail 返回当前模块的 Overview —— 把快照里的所有房间恢复到 detail 前状态
  const backToOverview = useCallback(() => {
    restoreDetailRoomBase()
    playTo({ level: 'overview', module: view.module })
  }, [playTo, restoreDetailRoomBase, view.module])

  // 返回全屋总览
  const backToGlobal = useCallback(() => {
    // 直接跳到 global 也要恢复 detail 关掉的房间，避免回 global 后房间还是黑的
    restoreDetailRoomBase()
    if (view.level === 'overview') {
      // overview 与 global 位姿相同，直接切状态，不触发相机动画
      setView({ level: 'global', module: view.module })
    } else {
      // 从 detail 或其他层跳回：飞行到 global 位姿
      playTo({ level: 'global', module: view.module })
    }
  }, [playTo, restoreDetailRoomBase, view.level, view.module])

  // 切换 Module：
  //   global / overview → module：相机不动，只切换 UI 状态（global 和 overview 位姿相同）
  //   detail → module：先退回 overview 位姿（与 global 相同），再换 module
  const switchModule = useCallback((nextModule: ModuleKey) => {
    if (view.level !== 'global' && nextModule === view.module) return

    if (view.level === 'detail') {
      // 详情态切模块：直接从当前 detail 飞回新模块 overview，避免先退旧模块再切模块的双段跳
      restoreDetailRoomBase()
      playTo({ level: 'overview', module: nextModule }, { duration: 0.72 })
    } else {
      // global / overview：位姿相同，不移动相机，只改 UI 状态
      setView({ level: 'overview', module: nextModule })
    }
  }, [view.level, view.module, playTo, restoreDetailRoomBase])

  // 设备点击进入 detail：
  // - 灯光模块保持"按房间俯视"语义，不做单灯具放大
  // - 仅在单楼层（非爆炸全屋）下启用，避免多楼层叠加时误触导致目标不明确
  useEffect(() => {
    const onDeviceClick = (event: { node?: { id?: string } }) => {
      const deviceId = event?.node?.id
      if (!deviceId) return
      if (view.module === 'lighting') return
      if (activeAllFloorIdx === null && allSeeds && allSeeds.length > 1) return
      if (view.level === 'detail' && view.targetId === deviceId) return
      playTo({ level: 'detail', module: view.module, targetId: deviceId })
    }
    emitter.on('device:click', onDeviceClick as any)
    return () => emitter.off('device:click', onDeviceClick as any)
  }, [view.module, view.level, view.targetId, activeAllFloorIdx, allSeeds, playTo])

  // 全屋总览时不选中任何子系统（NetworkHeatmap / XrayOverlay 不显示）；
  // 模块模式下同步选中，让 subsystem-specific effects 跟随。
  useEffect(() => {
    useDeviceState.getState().selectSubsystem(view.level === 'global' ? null : view.module)
  }, [view.level, view.module])

  // 页面卸载时恢复聚焦为 null，避免返回编辑器后设备仍处于淡化状态
  useEffect(() => {
    return () => {
      useDeviceState.getState().selectSubsystem(null)
    }
  }, [])

  // Esc 返回：detail → module overview，overview → global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view.level === 'detail') { e.preventDefault(); backToOverview() }
        else if (view.level === 'overview') { e.preventDefault(); backToGlobal() }
      }
      // 按 P 打印当前相机位置（调试用）
      if (e.key === 'p' || e.key === 'P') {
        const cam = cameraApiRef.current?.sampleCurrent()
        if (cam) console.log('[CAM]', JSON.stringify(cam))
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [view.level, backToOverview, backToGlobal])

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

  /**
   * 灯带列表 —— 演示页里"全屋开关 / 场景"也要带上灯带。
   * 灯带不在 seed.devices（被 loadSeed 过滤掉了，因为 DemoLightBulb 只画点光源），
   * 全部从 seed.allDeviceNodes 里挑出 lighting + path>=2 的。
   */
  const stripNodes = (seed?.allDeviceNodes ?? []).filter(
    (n) =>
      n.subsystem === 'lighting' &&
      Array.isArray((n.params as { path?: unknown })?.path) &&
      ((n.params as { path?: unknown[] }).path?.length ?? 0) >= 2,
  )

  const executeScene = useCallback((scene: SceneConfig) => {
    setActiveSceneId(scene.id)
    setActiveSceneStartedAt(Date.now())
    // Base lighting 先响应（瞬发，动画由 RoomBaseLight useFrame 负责平滑）
    if (seed) {
      setRoomStates(Object.fromEntries(seed.roomCentroids.map((c) => [c.id, scene.roomBrightness])))
    }
    if (!seed) return
    // 已配置灯具逐个延迟（演示感）—— 点光源同时写 lightStates + store。
    // 之前只写本地，store 不更新 → 之后用户 toggle 时 store 还是旧值 → 反方向。
    const targets = scene.getStates(seed.devices)
    Object.entries(targets).forEach(([deviceId, state], i) => {
      setTimeout(() => {
        setLightStates((prev) => ({ ...prev, [deviceId]: { ...prev[deviceId], ...state } }))
        setDeviceState(deviceId as never, state as Record<string, unknown>)
      }, i * 160)
    })
    // 灯带走 store —— 用 scene.roomBrightness 当统一目标（场景配置当前不区分灯带）
    const stripBrightness = scene.roomBrightness
    const stripOn = stripBrightness > 0
    stripNodes.forEach((n, i) => {
      setTimeout(() => {
        setDeviceState(n.id as any, { on: stripOn, brightness: stripBrightness })
      }, i * 160 + Object.keys(targets).length * 80)
    })
  }, [seed, stripNodes])

  const handleAllOn = useCallback(() => {
    setActiveSceneId(null)
    setActiveSceneStartedAt(null)
    if (seed) setRoomStates(Object.fromEntries(seed.roomCentroids.map((c) => [c.id, 80])))
    if (!seed) return
    seed.devices.forEach((d, i) => {
      setTimeout(() => {
        setLightStates((prev) => ({ ...prev, [d.id]: { ...prev[d.id], on: true, brightness: 80 } }))
        setDeviceState(d.id as never, { on: true, brightness: 80 })
      }, i * 100)
    })
    // 灯带也开
    stripNodes.forEach((n, i) => {
      setTimeout(() => {
        setDeviceState(n.id as any, { on: true, brightness: 80 })
      }, i * 100 + seed.devices.length * 50)
    })
  }, [seed, stripNodes])

  const handleAllOff = useCallback(() => {
    setActiveSceneId(null)
    setActiveSceneStartedAt(null)
    if (seed) setRoomStates(Object.fromEntries(seed.roomCentroids.map((c) => [c.id, 0])))
    if (!seed) return
    seed.devices.forEach((d, i) => {
      setTimeout(() => {
        setLightStates((prev) => ({ ...prev, [d.id]: { brightness: prev[d.id]?.brightness ?? 1, on: false } }))
        setDeviceState(d.id as never, { on: false })
      }, i * 80)
    })
    // 灯带也关
    stripNodes.forEach((n, i) => {
      setTimeout(() => {
        setDeviceState(n.id as any, { on: false, brightness: 0 })
      }, i * 80 + seed.devices.length * 40)
    })
  }, [seed, stripNodes])

  // ── 爆炸视图拖拽（水平拖动旋转各楼层）──────────────────────────────────────
  const handleExplodedPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeAllFloorIdx !== null) return
    dragRef.current = { x: e.clientX, az0: azimuthRef.current }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [activeAllFloorIdx])

  const handleExplodedPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    azimuthRef.current = dragRef.current.az0 - (e.clientX - dragRef.current.x) * 0.008
  }, [])

  const handleExplodedPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  // ── 楼层飞入 / 飞出相机动画 ───────────────────────────────────────────────
  const flyToFloor = useCallback((s: SceneSeed, onDone?: () => void) => {
    if (!cameraApiRef.current) return
    transitionSuppressRef.current = true
    const from = cameraApiRef.current.sampleCurrent()
    const fSpan  = Math.max(s.bbox.w, s.bbox.d, 8)
    const fScale = Math.max(fSpan, 10)
    // 聚焦楼层：明显抬升视角（约 60°~68°），形成“楼层被端到面前”的展示感
    const fDist  = fScale * FLOOR_FOCUS_HORIZ_FACTOR
    // 多楼层模式下，聚焦也始终围绕同一全局轴心，避免楼层之间切换时 target 跳变导致“先扭一下”
    const pivot = globalPivot ?? { cx: s.bbox.cx, cz: s.bbox.cz }
    const toTgt: [number, number, number] = [pivot.cx, 0, pivot.cz]
    const [dirX, dirZ] = resolveCameraBearingXZ(from.pos, toTgt)
    const toPos: [number, number, number] = [
      pivot.cx + fDist * dirX,
      fScale * FLOOR_FOCUS_HEIGHT_FACTOR,
      pivot.cz + fDist * dirZ,
    ]
    const autoDuration = estimateShotDuration(from.pos, toPos, from.tgt, toTgt)
    const duration = THREE.MathUtils.clamp(autoDuration, FLOOR_ANIM_DUR * 0.85, FLOOR_ANIM_DUR * 1.25)
    cameraApiRef.current.play({
      fromPos: from.pos, fromTgt: from.tgt,
      toPos, toTgt,
      midPos: undefined,
      duration,
      onDone: () => {
        transitionSuppressRef.current = false
        onDone?.()
      },
    })
  }, [globalPivot])

  const flyToAllFloors = useCallback(() => {
    if (!cameraApiRef.current || !allSeeds || allSeeds.length <= 1) return
    transitionSuppressRef.current = true
    const from    = cameraApiRef.current.sampleCurrent()
    const pivot   = globalPivot ?? { cx: allSeeds[0]!.bbox.cx, cz: allSeeds[0]!.bbox.cz }
    const stackH  = (allSeeds.length - 1) * EXPLODED_GAP
    const maxSpan = Math.max(...allSeeds.map((s) => Math.max(s.bbox.w, s.bbox.d)), 8)
    const totalScale = Math.max(maxSpan, 10, stackH * 0.8)
    // 全局多楼层：低角度拉远看全局（约 35°~45°），更像“舞台总览”
    const fDist   = totalScale * GLOBAL_HORIZ_FACTOR
    // FloorAnimator 在全楼层模式下围绕 y=0 对称排布，观察目标也应锁定 y=0。
    const toTgt: [number, number, number] = [pivot.cx, 0, pivot.cz]
    const [dirX, dirZ] = resolveCameraBearingXZ(from.pos, toTgt)
    const toPos: [number, number, number] = [
      pivot.cx + fDist * dirX,
      totalScale * GLOBAL_HEIGHT_FACTOR,
      pivot.cz + fDist * dirZ,
    ]
    const autoDuration = estimateShotDuration(from.pos, toPos, from.tgt, toTgt)
    const duration = THREE.MathUtils.clamp(autoDuration, FLOOR_ANIM_DUR * 0.85, FLOOR_ANIM_DUR * 1.25)
    cameraApiRef.current.play({
      fromPos: from.pos, fromTgt: from.tgt,
      toPos, toTgt,
      midPos: undefined,
      duration,
      onDone: () => { transitionSuppressRef.current = false },
    })
  }, [allSeeds, globalPivot])

  useEffect(() => {
    if (status !== 'ready' || !seed || introPlayedRef.current) return
    let rafId = 0
    let cancelled = false
    let tries = 0

    const startIntro = () => {
      if (cancelled || introPlayedRef.current) return
      const api = cameraApiRef.current
      if (!api) {
        // 等待 CameraRig 完成注册
        if (tries++ < 20) rafId = window.requestAnimationFrame(startIntro)
        return
      }

      const span = Math.max(seed.bbox.w, seed.bbox.d, 8)
      const numFloors = allSeeds && allSeeds.length > 1 ? allSeeds.length : 1
      const stackH = numFloors > 1 ? (numFloors - 1) * EXPLODED_GAP : 0
      const maxSpanAll = allSeeds && allSeeds.length > 1
        ? Math.max(...allSeeds.map((s) => Math.max(s.bbox.w, s.bbox.d)), span)
        : span
      const scale = Math.max(maxSpanAll, 10, stackH * 0.8)
      const camDist = scale * GLOBAL_HORIZ_FACTOR
      const isExplodedFloors = !!allSeeds && allSeeds.length > 1 && activeAllFloorIdx === null
      const pivotCx = globalPivot?.cx ?? seed.bbox.cx
      const pivotCz = globalPivot?.cz ?? seed.bbox.cz
      const focusedFloor = activeAllFloorIdx !== null ? (allSeeds?.[activeAllFloorIdx] ?? null) : null
      const focusPivotCx = globalPivot?.cx ?? focusedFloor?.bbox.cx ?? seed.bbox.cx
      const focusPivotCz = globalPivot?.cz ?? focusedFloor?.bbox.cz ?? seed.bbox.cz
      const tgt: [number, number, number] = isExplodedFloors
        ? [pivotCx, 0, pivotCz]
        : focusedFloor
          ? [focusPivotCx, 0, focusPivotCz]
          : [seed.bbox.cx, 0, seed.bbox.cz]
      const camX = tgt[0] + camDist * 0.5
      const camY = scale * GLOBAL_HEIGHT_FACTOR
      const camZ = tgt[2] - camDist * 0.866

      introPlayedRef.current = true
      const from = api.sampleCurrent()
      api.play({
        fromPos: from.pos,
        fromTgt: from.tgt,
        toPos: [camX, camY, camZ],
        toTgt: tgt,
        midPos: undefined,
        duration: INTRO_DURATION,
      })
    }

    rafId = window.requestAnimationFrame(startIntro)
    return () => {
      cancelled = true
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [status, seed, allSeeds, globalPivot, activeAllFloorIdx])

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <p className="text-sm">正在加载方案…</p>
        </div>
      </div>
    )
  }

  if (status === 'no-data') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="max-w-md text-center">
          <h2 className="mb-3 font-semibold text-xl">还没有方案</h2>
          <p className="mb-6 text-sm text-muted-foreground">请先在主编辑器画一个方案，数据会自动同步到这里。</p>
          <a className="vh-btn vh-btn-primary inline-block px-4 py-2 text-sm" href="/">
            打开主编辑器
          </a>
        </div>
      </div>
    )
  }

  if (!seed) return null

  // 多楼层全屋视图 = 爆炸模式（各楼层独立旋转，锁定仰角）
  const isExplodedFloors = !!allSeeds && allSeeds.length > 1 && activeAllFloorIdx === null

  // 相机初始位置与 resolveGlobalOverviewPose 保持一致（西南方向，+Z=南）
  const span   = Math.max(seed.bbox.w, seed.bbox.d, 8)
  // 多楼层爆炸视图：相机退远以容纳整个楼层堆栈
  const numFloors  = allSeeds && allSeeds.length > 1 ? allSeeds.length : 1
  const stackH     = numFloors > 1 ? (numFloors - 1) * EXPLODED_GAP : 0
  const maxSpanAll = allSeeds && allSeeds.length > 1
    ? Math.max(...allSeeds.map((s) => Math.max(s.bbox.w, s.bbox.d)), span)
    : span
  const scale     = Math.max(maxSpanAll, 10, stackH * 0.8)
  // camDist：相机初始位置距目标的水平距离（单层近景 / 爆炸全屋远景）
  const camDist   = scale * GLOBAL_HORIZ_FACTOR
  // orbitDist：OrbitControls maxDistance 参考值（保持允许拉远）
  const orbitDist = scale * 1.1
  // 爆炸视图极角：atan2(水平距, 垂直距) 与 flyToAllFloors toPos 精确匹配
  // 旧值 Math.PI*5/12(75°) 与飞行目标极角(≈23°) 冲突，动画结束 ctl.update() 会 snap
  const explodedPolar = numFloors > 1
    ? Math.atan2(scale * GLOBAL_HORIZ_FACTOR, scale * GLOBAL_HEIGHT_FACTOR) // 约 53° from up = 37° from horizontal
    : Math.atan2(scale * GLOBAL_HORIZ_FACTOR, scale * 1.05)
  const pivotCx = globalPivot?.cx ?? seed.bbox.cx
  const pivotCz = globalPivot?.cz ?? seed.bbox.cz
  // 聚焦楼层时立即用 allSeeds[activeAllFloorIdx] 的 bbox，不等 setSeed onDone
  const focusedFloor = activeAllFloorIdx !== null ? (allSeeds?.[activeAllFloorIdx] ?? null) : null
  const focusPivotCx = globalPivot?.cx ?? focusedFloor?.bbox.cx ?? seed.bbox.cx
  const focusPivotCz = globalPivot?.cz ?? focusedFloor?.bbox.cz ?? seed.bbox.cz
  const tgt:   [number, number, number] = isExplodedFloors
    ? [pivotCx, 0, pivotCz]
    : focusedFloor
      ? [focusPivotCx, 0, focusPivotCz]
      : [seed.bbox.cx, 0, seed.bbox.cz]
  // Orbit 空闲同步目标：
  // detail 模式必须跟随当前 detail 目标（房间/设备），
  // 否则动画结束后会被写回楼层中心，表现为“最后一下偏移”。
  const idleTgt: [number, number, number] = (() => {
    if (view.level !== 'detail') return tgt
    const pose = resolvePoseForView(view, buildPoseInput(seed))
    return pose?.tgt ?? tgt
  })()
  const camX   = tgt[0] + camDist * 0.5    // 东 sin(30°)
  const camY   = isExplodedFloors ? scale * GLOBAL_HEIGHT_FACTOR : scale * GLOBAL_HEIGHT_FACTOR
  const camZ   = tgt[2] - camDist * 0.866  // 北 cos(30°)
  const introCamDist = camDist * INTRO_DISTANCE_MULT
  const introCamX = tgt[0] + introCamDist * 0.5
  const introCamY = camY * INTRO_HEIGHT_MULT
  const introCamZ = tgt[2] - introCamDist * 0.866
  const initialCamPos: [number, number, number] = introPlayedRef.current
    ? [camX, camY, camZ]
    : [introCamX, introCamY, introCamZ]
  // 总是保持最新 tgt，供 OrbitControls 回调读取（不通过 React prop 传递，避免 lookAt 硬切）
  pendingTgtRef.current = idleTgt
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
  const isTrueColorPreset = activePresetKey === 'mist-warm-contrast'

  const canvasFilter = (() => {
    if (colorCalibrationMode || isTrueColorPreset) return 'none'
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
    if (colorCalibrationMode || isTrueColorPreset) return 0
    if (activePresetKey === 'showcase') return isNight ? 0.32 : 0.22
    if (activePresetKey === 'night') return isNight ? 0.36 : 0.2
    if (activePresetKey === 'smooth') return isNight ? 0.18 : 0.1
    if (activePresetKey === 'opslab') return isNight ? 0.24 : 0.14
    return isNight ? 0.24 : 0.14
  })()
  const grainOpacity = (() => {
    if (colorCalibrationMode || isTrueColorPreset) return 0
    if (activePresetKey === 'showcase') return isNight ? 0.17 : 0.1
    if (activePresetKey === 'night') return isNight ? 0.2 : 0.12
    if (activePresetKey === 'smooth') return isNight ? 0.06 : 0.04
    if (activePresetKey === 'opslab') return isNight ? 0.14 : 0.09
    return isNight ? 0.12 : 0.07
  })()
  const overlayBlendMode = (() => {
    if (colorCalibrationMode || isTrueColorPreset) return 'normal'
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
  const bgGradient = colorCalibrationMode
    ? 'radial-gradient(ellipse 70% 55% at 50% 58%, #EEF2F8 0%, #E3E8F0 70%)'
    : isNight
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
        presetCatalog={presetCatalog}
        activePresetKey={activePresetKey}
        onPresetChange={setActivePresetKey}
        onPreviewPreset={handlePreviewPreset}
        onSavePreset={handleSavePresetOverride}
        onResetPreset={handleResetPresetOverride}
        hasPresetOverride={(key) => !!presetOverrides[key]}
        onSliderChange={handleSliderChange}
        onSliderDown={handleSliderDown}
        onSyncNow={handleSyncNow}
        uniformWall10cm={uniformWall10cm}
        onToggleUniformWall10cm={setUniformWall10cm}
        colorCalibrationMode={colorCalibrationMode}
        onToggleColorCalibrationMode={setColorCalibrationMode}
      />

      {/* ── 主区域：左栏 + 舞台 ── */}
      <div className="flex min-h-0 flex-1">
        <DemoRail
          isNight={isNight}
          preset={activePreset}
          activeModule={view.module}
          isGlobalOverview={view.level === 'global'}
          onModuleClick={switchModule}
          onOverviewClick={backToGlobal}
        />

        {/* ── 舞台（3D + 浮动控件）── */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          style={{ background: bgGradient, transition: 'background 0.7s ease' }}
          onPointerDown={handleExplodedPointerDown}
          onPointerMove={handleExplodedPointerMove}
          onPointerUp={handleExplodedPointerUp}
        >
          {/* 返回按钮 — Detail 模式下左上浮层，回到模块 Overview（Esc 兜底） */}
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
              backgroundImage: (colorCalibrationMode || isTrueColorPreset)
                ? 'none'
                : (isNight ? activePreset.theme.overlayNight : activePreset.theme.overlayDay),
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

          {/* 左侧楼层切换器 */}
          <FloorSwitcher
            levels={seed.availableLevels}
            currentLevelId={activeAllFloorIdx === null ? null : (allSeeds?.[activeAllFloorIdx]?.levelId ?? seed.levelId)}
            onChange={(levelId) => {
              const applyFloorSwitch = () => {
                if (levelId === null) {
                  if (activeAllFloorIdx === null) return
                  // 全屋视图：楼层飞出 + 相机拉回总览
                  if (floorFocusTimerRef.current !== null) {
                    window.clearTimeout(floorFocusTimerRef.current)
                    floorFocusTimerRef.current = null
                  }
                  setActiveAllFloorIdx(null)
                  setFloorSwitchTrigger((c) => c + 1)
                  flyToAllFloors()
                } else {
                  // 切换到具体楼层
                  const idx = allSeeds?.findIndex((s) => s.levelId === levelId) ?? -1
                  if (idx >= 0) {
                    if (idx === activeAllFloorIdx) return
                    const targetSeed = allSeeds![idx]!
                    // 切层 = 回到该层的"基础默认照明"，和首次加载一致
                    setRoomStates(Object.fromEntries(targetSeed.roomCentroids.map((c) => [c.id, DEFAULT_ROOM_BRIGHTNESS])))
                    setActiveAllFloorIdx(idx)
                    setFloorSwitchTrigger((c) => c + 1)
                    if (activeAllFloorIdx !== null) {
                      // 已聚焦某层 → 直接切换：FloorAnimator 滑动即可，无需相机飞行
                      // 两层 bbox 基本相同，相机位置不变，避免"原地飞一圈"的割裂感
                      setSeed(targetSeed)
                    } else {
                      // 从全屋视图飞入：
                      // 楼层分离与相机推进并行开始，避免出现“先把目标楼层推到中间，再放大”的两段感。
                      setSeed(targetSeed)
                      if (floorFocusTimerRef.current !== null) {
                        window.clearTimeout(floorFocusTimerRef.current)
                        floorFocusTimerRef.current = null
                      }
                      flyToFloor(targetSeed)
                    }
                  }
                  // 不调用 setCurrentLevelId，避免触发 useEffect 重新走 loadSeed
                }
              }

              // 详情态切楼层：先做“返回 overview”的动作，再执行楼层切换
              if (view.level === 'detail') {
                restoreDetailRoomBase()
                playTo(
                  { level: 'overview', module: view.module },
                  {
                    duration: 0.42,
                    onDone: applyFloorSwitch,
                  },
                )
                return
              }

              applyFloorSwitch()
            }}
            isNight={isNight}
            preset={activePreset}
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
            preset={activePreset}
            lightsOn={lightsOn}
            lightsTotal={seed.devices.length}
          />

          {/* 场景 dock */}
          <SceneDock
            activeSceneId={activeSceneId}
            isNight={isNight}
            preset={activePreset}
            onExecute={executeScene}
            onAllOn={handleAllOn}
            onAllOff={handleAllOff}
          />

          {/* 阴影开关 — 浮于 Compass 上方 */}
          <button
            type="button"
            onClick={() => setShadowsEnabled((v) => !v)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 84, right: 20, zIndex: 15,
              padding: '4px 10px', borderRadius: 8,
              background: isNight ? 'rgba(14,24,44,0.72)' : 'rgba(255,255,255,0.76)',
              border: `1px solid ${isNight ? 'rgba(180,200,230,0.18)' : 'rgba(40,60,100,0.12)'}`,
              backdropFilter: 'blur(12px)', fontSize: 11, fontWeight: 600,
              color: isNight ? 'rgba(220,228,240,0.92)' : 'rgba(25,35,55,0.88)',
              cursor: 'pointer',
            }}
          >
            {shadowsEnabled ? '阴影 ON' : '阴影 OFF'}
          </button>
          {/* 倒影开关 — 阴影按钮上方一个 */}
          <button
            type="button"
            onClick={() => setReflectionsEnabled((v) => !v)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 116, right: 20, zIndex: 15,
              padding: '4px 10px', borderRadius: 8,
              background: isNight ? 'rgba(14,24,44,0.72)' : 'rgba(255,255,255,0.76)',
              border: `1px solid ${isNight ? 'rgba(180,200,230,0.18)' : 'rgba(40,60,100,0.12)'}`,
              backdropFilter: 'blur(12px)', fontSize: 11, fontWeight: 600,
              color: isNight ? 'rgba(220,228,240,0.92)' : 'rgba(25,35,55,0.88)',
              cursor: 'pointer',
            }}
          >
            {reflectionsEnabled ? '倒影 ON' : '倒影 OFF'}
          </button>
          {/* Bloom 开关 — 调试过曝问题用 */}
          <button
            type="button"
            onClick={() => setBloomEnabled((v) => !v)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 152, right: 20, zIndex: 15,
              padding: '4px 10px', borderRadius: 8,
              background: isNight ? 'rgba(14,24,44,0.72)' : 'rgba(255,255,255,0.76)',
              border: `1px solid ${isNight ? 'rgba(180,200,230,0.18)' : 'rgba(40,60,100,0.12)'}`,
              backdropFilter: 'blur(12px)', fontSize: 11, fontWeight: 600,
              color: isNight ? 'rgba(220,228,240,0.92)' : 'rgba(25,35,55,0.88)',
              cursor: 'pointer',
            }}
          >
            {bloomEnabled ? 'Bloom ON' : 'Bloom OFF'}
          </button>

          {/* 南北仪表盘 */}
          <Compass ref={compassNeedle} isNight={isNight} />

          {/* 3D Canvas */}
          <Canvas
            key={allSeeds && allSeeds.length > 1 ? `building-${allSeeds[0]!.bbox.cx.toFixed(1)}` : `${seed.bbox.cx.toFixed(2)}-${seed.bbox.cz.toFixed(2)}`}
            camera={{ fov: 50, near: 0.1, far: 500, position: initialCamPos }}
            frameloop="always"
            dpr={[1, 1.2]}
            gl={{
              // Retina(2x) 自带像素级 AA，无需 MSAA；antialias 在高 DPR 下反而是性能杀手
              antialias: false,
              toneMapping: colorCalibrationMode ? THREE.NoToneMapping : activePreset.toneMapping,
              toneMappingExposure: colorCalibrationMode ? 1 : activePreset.exposure,
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
            {/* Selection 上下文：让下游的 <Select enabled> 把 mesh 注册到 SelectiveBloom 的
                选区。墙面/地板被 SpotLight 照亮的像素不在 Select 里 → 不进 bloom 输入 →
                不会被 bloom 反馈推爆。所有 Canvas 内容都包在里面。 */}
            <Selection>
            {!colorCalibrationMode && (
              <>
                <fog attach="fog" args={[activePreset.theme.bgColorDay, span * 2.2, span * 6]} />
                <FogAnimator isNight={isNight} preset={activePreset} />
              </>
            )}
            <DemoEnvironment
              lightPos={lightPos}
              isNight={isNight}
              preset={activePreset}
              shadowsEnabled={shadowsEnabled}
              colorCalibrationMode={colorCalibrationMode}
            />
            {allSeeds && allSeeds.length > 1 ? (
              // 多楼层：FloorAnimator 动画容器
              // 全屋(activeAllFloorIdx=null)→各层停在 baseY
              // 切换楼层 → 活跃层滑到 Y=0，其他层向外爆炸
              allSeeds.map((s, idx) => {
                const isActiveFl = activeAllFloorIdx === idx
                // 非活跃楼层：全屋视图用 isMultiFloor 去掉倒影；切换后整组被推开隐藏
                const isMultiFloor = activeAllFloorIdx !== null ? !isActiveFl : true
                // 单层聚焦时，活跃层恢复与纯单层相同的渲染参数
                const isFocused = activeAllFloorIdx !== null && isActiveFl
                return (
                  <FloorAnimator
                    key={s.levelId}
                    floorIdx={idx}
                    numFloors={allSeeds.length}
                    activeFloorIdx={activeAllFloorIdx}
                    switchTrigger={floorSwitchTrigger}
                    cx={globalPivot?.cx ?? s.bbox.cx}
                    cz={globalPivot?.cz ?? s.bbox.cz}
                    azimuthRef={azimuthRef}
                  >
                    <DemoStructure
                      walls={resolveWalls(s.walls)}
                      openingsByWall={s.openingsByWall}
                      devices={s.devices}
                      slabs={s.slabs}
                      items={s.items}
                      roomCentroids={s.roomCentroids}
                      roomStates={roomStates}
                      lightStates={lightStates}
                      bbox={s.bbox}
                      lightPos={lightPos}
                      isNight={isNight}
                      preset={activePreset}
                      onToggleLight={toggleLight}
                      onToggleRoom={toggleRoomLight}
                      view={isActiveFl || activeAllFloorIdx === null ? view : { level: 'global', module: view.module }}
                      onEnterLightingDetail={enterLightingDetail}
                      isMultiFloor={isMultiFloor}
                      showGroundShadow={isFocused || (activeAllFloorIdx === null && idx === 0)}
                      floorRenderOrderBase={isFocused ? 0 : idx * 10}
                      reflectionsEnabled={reflectionsEnabled}
                    />
                  </FloorAnimator>
                )
              })
            ) : (
              // 单楼层：直接渲染，无 FloorAnimator 开销
              <DemoStructure
                walls={resolveWalls(seed.walls)}
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
                isMultiFloor={false}
                reflectionsEnabled={reflectionsEnabled}
              />
            )}
            {/*
              非灯光子系统走新的 DeviceRenderer/Effects 路径（演示模式）：
              摄像头激光锥、AP 覆盖、PIR 锥、窗帘 4 类、HVAC ribbon、音箱音波、
              架构粒子环，均在此处挂载。lighting 设备仍由 DemoStructure 自定义渲染，
              避免和既有"室内灯光氛围"撞车。

              WiFi 体积热力图 + X 光透明模式：仅在网络/架构子系统聚焦时显形。
            */}
            <DeviceRenderModeProvider mode="demo">
              {/* 楼层 overview / 全屋（!== 'detail'）→ 完全不渲染设备效果，只看预设照明。
                  detail（进入某房间）→ 当前板块的设备效果显形：
                    - lighting 板块：灯带由 DeviceRenderer 走 LightStripGeometry，
                      点光源由 DemoStructure/DemoLightBulb 画（不在这里），
                      避免双重渲染。
                    - 其它板块（安防/网络/暖通…）：所有当前板块设备走 DeviceRenderer。*/}
              {view.level === 'detail' && seed.allDeviceNodes
                .filter((n) => {
                  if (n.subsystem !== view.module) return false
                  if (n.subsystem === 'lighting') {
                    const path = (n.params as { path?: unknown })?.path
                    return Array.isArray(path) && path.length >= 2
                  }
                  return true
                })
                .map((n) => (
                  <DeviceRenderer key={n.id} node={n} />
                ))}
              {/* 灯带 toggle pill —— 仅 detail + lighting 时挂在每条灯带 path 中点 */}
              {view.level === 'detail' && view.module === 'lighting' &&
                seed.allDeviceNodes
                  .filter((n) => {
                    if (n.subsystem !== 'lighting') return false
                    const path = (n.params as { path?: unknown })?.path
                    return Array.isArray(path) && path.length >= 2
                  })
                  .map((n) => (
                    <DemoLightStripPill
                      key={`pill-${n.id}`}
                      node={n}
                      onToggle={() => toggleLight(n.id)}
                      preset={activePreset}
                      isNight={isNight}
                    />
                  ))}
              <NetworkHeatmapOverlay />
              <XrayOverlay />
            </DeviceRenderModeProvider>
            {/* CameraRig — Overview ↔ Detail 动画；ShaderPreheat + Preload 减少首次卡顿 */}
            <CameraRig apiRef={cameraApiRef} controlsRef={controlsRef} />
            <TargetSync controlsRef={controlsRef} tgt={idleTgt} />
            <CompassUpdater northAngle={seed.northAngle ?? 0} needleRef={compassNeedle} />
            <ShaderPreheat />
            <Preload all />
            {/* OrbitControls：不传 target prop 避免 React 重渲染时 lookAt 硬切；
                初始 target 由挂载回调写入，后续由 CameraRig（动画中）或 TargetSync（空闲）驱动 */}
            <OrbitControls
              ref={(ctl: any) => {
                controlsRef.current = ctl
                if (ctl && !ctl._tgtInited) {
                  ctl._tgtInited = true
                  const [x, y, z] = pendingTgtRef.current
                  ctl.target.set(x, y, z)
                  ctl.update()
                }
              }}
              dampingFactor={0.08}
              enableDamping
              enablePan={false}
              enableZoom
              enableRotate={!isExplodedFloors}
              minDistance={2}
              maxDistance={view.level === 'detail' ? 8 : isExplodedFloors ? orbitDist * 4 : orbitDist * 3}
              minPolarAngle={
                isExplodedFloors ? explodedPolar * 0.7
                : view.level === 'detail' ? 0.02
                : 0.1
              }
              maxPolarAngle={
                isExplodedFloors ? explodedPolar * 1.3
                : view.level === 'detail' ? Math.PI * 0.22
                : Math.PI * 0.46
              }
            />
            {/* Bloom 只在 overview/detail 跑 */}
            {view.level === 'detail' && bloomEnabled && <DemoBloomLayer isNight={isNight} />}
            {/* 灯光懒预热：用户进入"灯光"板块后才挂载，为每种 unique 灯数编译 shader 变种。
                完成后切房间不再有 200-500ms 的同步编译卡顿。一开始的 overview 不挂载，不挡用户。 */}
            {lightingWarmupTriggered && !lightingWarmupDone && lightingUniqueCounts.length > 0 && (
              <LightingShaderWarmup
                uniqueCounts={lightingUniqueCounts}
                onProgress={(current, total) => setLightingWarmupProgress({ current, total })}
                onDone={() => {
                  setLightingWarmupDone(true)
                  setLightingWarmupProgress(null)
                }}
              />
            )}
            </Selection>
          </Canvas>
          {/* 灯光预热进度 chip —— 角落小条，不挡操作 */}
          {lightingWarmupProgress && !lightingWarmupDone && (
            <div
              style={{
                position: 'absolute', bottom: 16, left: 16,
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px',
                borderRadius: 999,
                background: 'rgba(15, 18, 26, 0.85)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                border: '1px solid rgba(255,255,255,0.10)',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: 12, color: 'rgba(229,240,255,0.82)',
                pointerEvents: 'none',
                zIndex: 30,
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                border: '2px solid rgba(229,240,255,0.20)',
                borderTopColor: 'rgba(229,240,255,0.85)',
                animation: 'vh-spin 0.8s linear infinite',
              }} />
              <span>预热灯光 {lightingWarmupProgress.current}/{lightingWarmupProgress.total}</span>
              <style>{`@keyframes vh-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
