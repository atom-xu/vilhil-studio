'use client'

import { useEffect, useMemo, useRef, Component } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { Environment } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense } from 'react'

// HDRI 加载失败时静默降级（网络错误/CDN 不可用），不崩溃整个场景
class EnvBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}
import {
  buildWallGeo,
  buildPadGeo,
  splitPadFaces,
  PAD_Y_OFFSET,
  INTERIOR_LAYER,
  WALL_HEIGHT,
} from './geometry'
import { DemoItem } from './items'
import { makeMirrorMaterial } from './items'
import { RoomBaseLight, DemoLightBulb, CircuitOverlay } from './lighting'
import type { LightState } from './lighting'
import type { RenderPreset } from './render-presets'
import type { ConvertedWall, OpeningData, DeviceData, SlabData, ItemData, RoomCentroid, SceneSeed } from './types'
import type { ViewState } from './camera'

// 楼层切换飞行期间：由 page.tsx 写入此 ref 抑制 shadow map 渲染（零 React 开销）
export const transitionSuppressRef = { current: false }

function parseAlphaFromColorInput(value: string, fallback = 1): number {
  const v = value.trim()
  const rgba = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/i.exec(v)
  if (rgba?.[1]) {
    const a = Number(rgba[1])
    if (Number.isFinite(a)) return THREE.MathUtils.clamp(a, 0, 1)
  }
  const hex8 = /^#([0-9a-f]{8})$/i.exec(v)
  if (hex8?.[1]) {
    const alphaHex = hex8[1].slice(6, 8)
    const a = Number.parseInt(alphaHex, 16) / 255
    if (Number.isFinite(a)) return THREE.MathUtils.clamp(a, 0, 1)
  }
  return THREE.MathUtils.clamp(fallback, 0, 1)
}

// ─── 演示结构渲染器 ───────────────────────────────────────────────────────────

export interface StructureProps {
  walls: ConvertedWall[]
  openingsByWall: Record<string, OpeningData[]>
  devices: DeviceData[]
  slabs: SlabData[]
  items: ItemData[]
  roomCentroids: RoomCentroid[]
  roomStates: Record<string, number>
  lightStates: Record<string, LightState>
  bbox: SceneSeed['bbox']
  lightPos: [number, number, number]
  isNight: boolean
  preset: RenderPreset
  onToggleLight: (id: string) => void
  onToggleRoom: (id: string) => void
  view: ViewState
  onEnterLightingDetail?: (roomId: string) => void
  /** 全屋多楼层模式：隐藏倒影、地板，避免遮挡下方楼层 */
  isMultiFloor?: boolean
  /** 是否渲染接地阴影面（多楼层时仅底层为 true） */
  showGroundShadow?: boolean
  /** 多楼层时各楼层 renderOrder 基准，确保从下到上按序渲染 */
  floorRenderOrderBase?: number
  /** 倒影开关（墙体 / 家具 / pad 镜面）—— 关掉后楼板下完全干净 */
  reflectionsEnabled?: boolean
}

export function DemoStructure({ walls, openingsByWall, devices, slabs, items, roomCentroids, roomStates, lightStates, bbox, lightPos, isNight, preset, onToggleLight, onToggleRoom, view, onEnterLightingDetail, isMultiFloor = false, showGroundShadow = true, floorRenderOrderBase = 0, reflectionsEnabled = false }: StructureProps) {
  const { bodyGeo, capGeo } = useMemo(() => buildWallGeo(walls, openingsByWall), [walls, openingsByWall])
  const padGeo = useMemo(() => buildPadGeo(slabs), [slabs])
  const { padSideGeo, padTopGeo } = useMemo(() => {
    if (!padGeo) return { padSideGeo: null, padTopGeo: null }
    const { sideGeo, topGeo } = splitPadFaces(padGeo)
    return { padSideGeo: sideGeo, padTopGeo: topGeo }
  }, [padGeo])

  // 清理几何体
  useEffect(() => {
    return () => {
      bodyGeo?.dispose()
      capGeo?.dispose()
      padGeo?.dispose()
      padSideGeo?.dispose()
      padTopGeo?.dispose()
    }
  }, [bodyGeo, capGeo, padGeo, padSideGeo, padTopGeo])

  // 按 slab 外轮廓构建接地阴影形状（替代 circleGeometry，严格贴合建筑轮廓）
  const shadowGeo = useMemo(() => {
    const poly = slabs[0]?.polygon
    if (!poly || poly.length < 3) return null
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z)))
    for (const hole of (slabs[0]?.holes ?? [])) {
      if (hole.length < 3) continue
      const h = new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z)))
      shape.holes.push(h)
    }
    const g = new THREE.ShapeGeometry(shape)
    g.rotateX(-Math.PI / 2)
    return g
  }, [slabs])
  useEffect(() => () => { shadowGeo?.dispose() }, [shadowGeo])

  const wallMeshRef = useRef<THREE.Mesh>(null!)
  const padSideRef  = useRef<THREE.Mesh>(null!)
  const padTopRef   = useRef<THREE.Mesh>(null!)
  // 墙体阴影材质 — shadow camera 默认在 Layer 0，与光源 layer 无关
  // 墙体保持 Layer 0：SpotLight（Layer 1）不会照亮墙面 → 不会向外发光
  // castShadow + customDepthMaterial：shadow camera 把透明墙视为不透明 → 室内光被正确遮挡
  useEffect(() => {
    const mesh = wallMeshRef.current
    if (!mesh || !bodyGeo) return
    const depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.FrontSide,
    })
    const distMat = new THREE.MeshDistanceMaterial({ side: THREE.FrontSide })
    mesh.customDepthMaterial    = depthMat
    mesh.customDistanceMaterial = distMat
    return () => { depthMat.dispose(); distMat.dispose() }
  }, [bodyGeo])

  // 室内地板加入 INTERIOR_LAYER — 被室内 SpotLight 照亮
  useEffect(() => {
    padSideRef.current?.layers.enable(INTERIOR_LAYER)
    padTopRef.current?.layers.enable(INTERIOR_LAYER)
  }, [padSideGeo, padTopGeo])

  // 墙体 material — 用 MeshStandardMaterial 替代 MeshPhysicalMaterial
  // clearcoat/ior 会触发双层物理着色器，每 fragment 费用翻倍；
  // 去掉后换用 envMapIntensity 模拟反光，视觉差异极小，GPU 负担大幅减少
  // 全楼层 / 单层统一同一套参数，飞入飞出无割裂感
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.theme.wallColor),
    roughness: preset.theme.wallRoughness ?? 0.62,
    metalness: preset.theme.wallMetalness ?? 0.0,
    envMapIntensity: preset.theme.wallEnvMapIntensity ?? 0.35,
    transparent: true,
    opacity: preset.theme.wallOpacity ?? 0.65,
    depthWrite: false,
    side: THREE.DoubleSide,   // 始终 DoubleSide：多楼层俯视内壁可见，单层无副作用
  }), [preset.theme.wallColor, preset.theme.wallRoughness, preset.theme.wallMetalness, preset.theme.wallEnvMapIntensity, preset.theme.wallOpacity])
  useEffect(() => () => wallMat.dispose(), [wallMat])

  const windowOpacity = useMemo(
    () => parseAlphaFromColorInput(preset.theme.windowColor, 0.22),
    [preset.theme.windowColor],
  )
  const doorOpacity = useMemo(
    () => parseAlphaFromColorInput(preset.theme.doorColor, 0.08),
    [preset.theme.doorColor],
  )
  const padDayOpacity = useMemo(
    () => parseAlphaFromColorInput(preset.theme.padColorDay, 1),
    [preset.theme.padColorDay],
  )
  const padNightOpacity = useMemo(
    () => parseAlphaFromColorInput(preset.theme.padColorNight, 1),
    [preset.theme.padColorNight],
  )
  // 墙体倒影材质 — 用不透明底色，让倒影和家具倒影一样清晰（不受墙体透明度拖累）
  const wallMirrorMat = useMemo(() => {
    const base = new THREE.MeshStandardMaterial({
      color: new THREE.Color(preset.theme.wallColor),
      roughness: 0.24,
      metalness: 0.03,
    })
    const m = makeMirrorMaterial(base)
    base.dispose()
    return m
  }, [preset.theme.wallColor])

  // 地板 Pad 侧面材质 — 实心，让 10cm 台阶从所有角度可见
  const padMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.theme.padColorDay),
    emissive: new THREE.Color(preset.theme.padEmissiveDay),
    emissiveIntensity: 0.2,
    roughness: 1.0,
    metalness: 0,
    transparent: true,
    opacity: padDayOpacity,
    depthWrite: true,
    side: THREE.FrontSide,
  }), [preset, padDayOpacity])
  useEffect(() => () => padMat.dispose(), [padMat])

  // 地板 Pad 顶面材质 — 始终稳定遮挡
  // 目的：切换楼层时不再出现“瞬间半透明 -> 再变回不透明”的闪变。
  const padTopMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.theme.padColorDay),
    emissive: new THREE.Color(preset.theme.padEmissiveDay),
    emissiveIntensity: 0.2,
    roughness: 1.0,
    metalness: 0,
    transparent: true,
    opacity: padDayOpacity,
    depthWrite: true,
    side: THREE.FrontSide,
  }), [preset, padDayOpacity])
  useEffect(() => () => padTopMat.dispose(), [padTopMat])

  // 昼夜过渡因子（0=白天 1=夜间），每帧朝 target 缓动 → 颜色/发光平滑切换
  const nightFactorRef = useRef(isNight ? 1 : 0)
  const C = useMemo(() => ({
    padDay:     new THREE.Color(preset.theme.padColorDay),
    padNight:   new THREE.Color(preset.theme.padColorNight),
    padEmDay:   new THREE.Color(preset.theme.padEmissiveDay),
    padEmNight: new THREE.Color(preset.theme.padEmissiveNight),
  }), [preset])
  useFrame((_, dt) => {
    const target = isNight ? 1 : 0
    // 速率 4 → 约 1.1s 过渡，与 DemoEnvironment 保持一致（之前 1.5 约 3s 太慢）
    nightFactorRef.current += (target - nightFactorRef.current) * Math.min(1, dt * 4)
    const f = nightFactorRef.current
    padMat.color.lerpColors(C.padDay, C.padNight, f)
    padMat.emissive.lerpColors(C.padEmDay, C.padEmNight, f)
    // 地板自发光大幅压低：之前 0.3 day → 0.8 night 让地板自己往外冒光，
    // 叠加 SpotLight 直接烧白；现在 0 day → 0.15 night（夜间留一点点温暖感
    // 给地板边缘，不参与"主照明"）。
    padMat.emissiveIntensity = f * 0.15
    padTopMat.color.lerpColors(C.padDay, C.padNight, f)
    padTopMat.emissive.lerpColors(C.padEmDay, C.padEmNight, f)
    padTopMat.emissiveIntensity = f * 0.15
    const padOpacity = THREE.MathUtils.lerp(padDayOpacity, padNightOpacity, f)
    padMat.opacity = padOpacity
    padTopMat.opacity = padOpacity
    const padVisible = padOpacity > 0.001
    if (padSideRef.current) padSideRef.current.visible = padVisible
    if (padTopRef.current) padTopRef.current.visible = padVisible
    const writeDepth = padOpacity >= 0.99
    padMat.depthWrite = writeDepth
    padTopMat.depthWrite = writeDepth
  }, 0)

  // 窗 / 门面板世界坐标
  const openingPanels = useMemo(() => {
    const panels: {
      key: string
      kind: 'window' | 'door'
      position: [number, number, number]
      rotation: [number, number, number]
      width: number
      height: number
      thickness: number
    }[] = []

    for (const wall of walls) {
      const openings = openingsByWall[wall.id] ?? []
      if (openings.length === 0) continue
      const dx  = wall.end.x - wall.start.x
      const dz  = wall.end.y - wall.start.y
      const len = Math.hypot(dx, dz)
      if (len < 0.001) continue
      const angle   = Math.atan2(dz, dx)
      const wallDir = { x: dx / len, z: dz / len }

      for (const op of openings) {
        // 沿墙方向 position[0] 米处为中心，position[1] 为高度中心
        const wx = wall.start.x + wallDir.x * op.position[0]
        const wz = wall.start.y + wallDir.z * op.position[0]
        const wy = op.position[1]
        panels.push({
          key:       op.id,
          kind:      op.kind,
          position:  [wx, wy, wz],
          rotation:  [0, -angle, 0],
          width:     op.width,
          height:    op.height,
          thickness: wall.thickness,
        })
      }
    }
    return panels
  }, [walls, openingsByWall])

  return (
    <group>
      {/* 地板 Pad 侧面 */}
      {padSideGeo && (
        <mesh
          ref={padSideRef}
          geometry={padSideGeo}
          material={padMat}
          position={[0, PAD_Y_OFFSET, 0]}
          renderOrder={floorRenderOrderBase - 2}
        />
      )}
      {/* 地板 Pad 顶面 — 半透明，倒影（镜像克隆）从此处透出 */}
      {padTopGeo && (
        <mesh
          ref={padTopRef}
          geometry={padTopGeo}
          material={padTopMat}
          position={[0, PAD_Y_OFFSET, 0]}
          renderOrder={floorRenderOrderBase}
        />
      )}

      {/* 接地阴影锚点 — 仅底层渲染，形状严格贴合建筑轮廓（slab polygon > circle 兜底） */}
      {showGroundShadow && !transitionSuppressRef.current && shadowGeo && (
        <mesh
          geometry={shadowGeo}
          position={[0, -0.006, 0]}
          rotation={[0, 0, 0]}
          receiveShadow
          renderOrder={floorRenderOrderBase - 1}
        >
          <shadowMaterial transparent opacity={isNight ? 0.04 : 0.10} />
        </mesh>
      )}

      {/* 合并墙体 — 透明玻璃视觉（Layer 0）+ castShadow 让 shadow camera 把它当不透明
          SpotLight 在 Layer 1 → 不照亮墙面 → 墙体不向外发光
          shadow camera 在 Layer 0 → 看到此墙 → 室内光被正确遮挡，不穿墙 */}
      {bodyGeo && (
        <>
          <mesh ref={wallMeshRef} geometry={bodyGeo} castShadow receiveShadow material={wallMat} renderOrder={floorRenderOrderBase + 1} />
          {/* 墙体倒影：reflectionsEnabled 控制全局开关，showGroundShadow 控制按楼层显示。
              两个条件都满足才渲染。reflectionsEnabled=false（默认）时 1F 楼板下干净。 */}
          {reflectionsEnabled && showGroundShadow && (
            <mesh geometry={bodyGeo} scale={[1, -1, 1]} material={wallMirrorMat} renderOrder={floorRenderOrderBase + 1} />
          )}
        </>
      )}

      {/* 顶面 cap — 位置驱动渐变：品牌蓝 → 浅冰蓝，叠加光源高光 */}
      {capGeo && (
        <mesh geometry={capGeo} renderOrder={floorRenderOrderBase + 2}>
          <shaderMaterial
            key={preset.theme.capColorA + preset.theme.capColorB}
            transparent
            depthWrite={false}
            uniforms={{
              uColorA:  { value: new THREE.Color(preset.theme.capColorA) },
              uColorB:  { value: new THREE.Color(preset.theme.capColorB) },
              uOpacity: { value: preset.theme.capOpacity },
              uCenter:  { value: new THREE.Vector2(bbox.cx, bbox.cz) },
              uLightPos:{ value: new THREE.Vector3(...lightPos) },
            }}
            vertexShader={`
              varying vec3 vWorldPos;
              void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
              }
            `}
            fragmentShader={`
              uniform vec3  uColorA;
              uniform vec3  uColorB;
              uniform float uOpacity;
              uniform vec2  uCenter;
              uniform vec3  uLightPos;
              varying vec3  vWorldPos;
              void main() {
                // 太阳水平投影方向 → 渐变轴
                vec2 sunDir = normalize(uLightPos.xz - uCenter);
                vec2 rel    = vWorldPos.xz - uCenter;
                float span  = max(length(uLightPos.xz - uCenter) * 0.5, 6.0);
                float t     = dot(rel, sunDir) / span;
                t = clamp(t * 0.5 + 0.5, 0.0, 1.0);
                // 朝太阳那侧偏浅（uColorB），背太阳那侧偏深（uColorA）
                vec3 col = mix(uColorA, uColorB, t);
                gl_FragColor = vec4(col, uOpacity);
              }
            `}
          />
        </mesh>
      )}

      {/* Base Lighting 层 — 每个房间一组 PointLight + 胶囊开关
          胶囊显隐规则：
            - module 非 lighting：全部 hidden
            - lighting + Overview：全部显示，每个胶囊带🔍进 Detail
            - lighting + Detail：仅 target 房间胶囊显示 + 无🔍（已经在 Detail 里） */}
      {roomCentroids.map((c, i) => {
        const inLighting = view.module === 'lighting'
        const inDetail   = view.level === 'detail'
        // UI 胶囊隐藏：胶囊是"灯光板块的快捷开关"，仅 overview 展示；
        // detail 进入设备级编辑后，房间胶囊不再控制默认基础光。
        const capsuleHidden = isMultiFloor || view.level === 'global' || !inLighting || inDetail
        // 3D 基础灯实际开关：和板块**无关**，只看是否是"楼层近景"。
        // 否则切到窗帘/传感等板块时房间会突然黑掉，墙体颜色明显变化（和"切板块只换看的东西"的语义不一致）。
        const lightsActive = !isMultiFloor && view.level !== 'global'
        const allowZoom  = inLighting && !inDetail && !!onEnterLightingDetail
        return (
          <RoomBaseLight
            key={`room-base-${c.id || i}`}
            centroid={c}
            brightness={roomStates[c.id] ?? 0}
            wallHeight={WALL_HEIGHT}
            label={c.label}
            colorTemp={2700}
            onToggle={() => onToggleRoom(c.id)}
            onZoomIn={allowZoom ? () => onEnterLightingDetail!(c.id) : undefined}
            capsuleHidden={capsuleHidden}
            lightsActive={lightsActive}
          />
        )
      })}

      {/* 灯具 + 回路覆盖层 —— 仅在 detail（进入某房间）时渲染，且只挂当前房间的灯。
          楼层 overview / 全屋 / 多楼层叠加都不显示用户布的灯具。

          【性能权衡】之前实验过"全屋灯一开始全挂"用 visible=true 避免切房间重编译，
          代价是 fragment shader 每像素跑 O(N) 次光照公式 → 30 盏灯下 GPU 直接 20fps。
          回退到"按房间过滤"：每次只 5-8 盏灯，per-pixel 成本可控。
          切房间时确实有一次 200-500ms 的 shader 编译，但比"持续 20fps"好得多。

          【活动房间内不重编】房间内的灯仍走"visible=true 永远在线，intensity=0/full"
          的策略（lighting.tsx:DemoLightBulb），所以同房间内开关回路不会触发重编译，
          切到另一个房间才会触发一次（因为 light count 变了）。

          【回路视图】同 circuitId 的灯：
          - DemoLightBulb 走 compactMarker 模式（只画端点小点，不响应事件）
          - CircuitOverlay 画虚线连线 + 中心 pill 按钮控制整条回路 */}
      {view.level === 'detail' && !isMultiFloor && (() => {
        const targetRoom = roomCentroids.find((r) => r.id === view.targetId)
        // 没找到目标房间（如刚切楼层未稳定）退化为渲染全部灯，避免空灯场
        const devicesInRoom = targetRoom
          ? devices.filter((d) => {
              const halfW = targetRoom.width / 2
              const halfD = targetRoom.depth / 2
              return (
                Math.abs(d.position[0] - targetRoom.cx) <= halfW &&
                Math.abs(d.position[2] - targetRoom.cz) <= halfD
              )
            })
          : devices

        // 按 circuitId 分组（无 circuitId 则单灯自成一回路）
        const byCircuit = new Map<string, DeviceData[]>()
        for (const d of devicesInRoom) {
          const cid = d.circuitId || d.id
          const arr = byCircuit.get(cid)
          if (arr) arr.push(d)
          else byCircuit.set(cid, [d])
        }
        // 多灯回路排在前面（视觉权重 + 编号优先）
        const circuits = Array.from(byCircuit.entries()).sort(
          ([, a], [, b]) => b.length - a.length,
        )

        return circuits.map(([cid, members], circuitIdx) => {
          const anyOn = members.some((m) => (lightStates[m.id]?.on ?? m.on))
          const refMember = members[0]!
          const refState = lightStates[refMember.id] ?? { on: refMember.on, brightness: refMember.brightness }
          const label = members.length > 1
            ? `回路 ${circuitIdx + 1} · ${members.length}灯`
            : refMember.name
          return (
            <group key={cid}>
              {members.map((d) => (
                <DemoLightBulb
                  key={d.id}
                  device={d}
                  state={lightStates[d.id] ?? { on: d.on, brightness: d.brightness }}
                  onToggle={() => onToggleLight(d.id)}
                  isNight={isNight}
                  preset={preset}
                  compactMarker
                />
              ))}
              <CircuitOverlay
                members={members}
                anyOn={anyOn}
                brightness={refState.brightness}
                preset={preset}
                isNight={isNight}
                onToggle={() => onToggleLight(refMember.id)}
                label={label}
              />
            </group>
          )
        })
      })()}

      {/* 家具 — GLB 模型，useGLTF 自动缓存 */}
      <Suspense fallback={null}>
        {items.map((it) => (
          <DemoItem
            key={it.id}
            item={it}
            isNight={isNight}
            furnitureColorDay={preset.theme.furnitureColorDay}
            furnitureColorNight={preset.theme.furnitureColorNight}
            furnitureRoughness={preset.theme.furnitureRoughness}
            furnitureMetalness={preset.theme.furnitureMetalness}
            furnitureInteractiveColor={preset.theme.furnitureInteractiveColor}
            isMultiFloor={isMultiFloor}
            reflectionsEnabled={reflectionsEnabled}
          />
        ))}
      </Suspense>

      {/* 窗 / 门面板 — depthTest=false 确保始终可见（面板在墙体中心，否则被深度缓冲遮挡）*/}
      {openingPanels.map((p) => (
        <mesh key={p.key} position={p.position} rotation={p.rotation} renderOrder={floorRenderOrderBase + 3}>
          {/* 厚度贯穿整面墙，从内外都能看到 */}
          <boxGeometry args={[p.width, p.height, p.thickness + 0.01]} />
          <meshBasicMaterial
            color={p.kind === 'window' ? preset.theme.windowColor : preset.theme.doorColor}
            transparent
            opacity={p.kind === 'window' ? windowOpacity : doorOpacity}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── 雾 颜色 动画 ──────────────────────────────────────────────────────────────
// fog attach 只能设初始色，这里在 useFrame 里做昼夜插值，避免日夜切换时颜色突变

export function FogAnimator({ isNight, preset }: { isNight: boolean; preset: RenderPreset }) {
  const { scene } = useThree()
  const fRef = useRef(isNight ? 1 : 0)
  const C = useMemo(() => ({
    day:   new THREE.Color(preset.theme.bgColorDay),
    night: new THREE.Color(preset.theme.bgColorNight),
  }), [preset])
  useFrame((_, dt) => {
    const target = isNight ? 1 : 0
    fRef.current += (target - fRef.current) * Math.min(1, dt * 4)
    const fog = scene.fog as THREE.Fog | null
    if (fog) fog.color.lerpColors(C.day, C.night, fRef.current)
  })
  return null
}

// ─── 演示灯光环境 ─────────────────────────────────────────────────────────────

export function DemoEnvironment({
  lightPos, isNight, preset, shadowsEnabled = true,
  colorCalibrationMode = false,
}: {
  lightPos: [number, number, number]
  isNight: boolean
  preset: RenderPreset
  shadowsEnabled?: boolean
  colorCalibrationMode?: boolean
}) {
  const hemiRef = useRef<THREE.HemisphereLight>(null!)
  const dirRef  = useRef<THREE.DirectionalLight>(null!)
  const fRef    = useRef(isNight ? 1 : 0)          // 昼夜因子 0=白天 1=夜间

  const C = useMemo(() => ({
    skyDay:    new THREE.Color(preset.theme.skyDay),
    skyNight:  new THREE.Color(preset.theme.skyNight),
    gndDay:    new THREE.Color(preset.theme.groundDay),
    gndNight:  new THREE.Color(preset.theme.groundNight),
    sunDay:    new THREE.Color(preset.theme.sunColorDay),
    sunNight:  new THREE.Color(preset.theme.sunColorNight),
  }), [preset])

  // 所有光源颜色/强度在 useFrame 中平滑过渡，不依赖 React re-render
  // 速率 4 → ~1.1s 完成过渡，视觉上平滑而不拖沓
  useFrame((_, dt) => {
    if (colorCalibrationMode) {
      if (hemiRef.current) {
        hemiRef.current.color.set('#ffffff')
        hemiRef.current.groundColor.set('#ffffff')
        hemiRef.current.intensity = 0.92
      }
      if (dirRef.current) {
        dirRef.current.color.set('#ffffff')
        dirRef.current.intensity = 0.28
        dirRef.current.castShadow = false
      }
      return
    }

    const target = isNight ? 1 : 0
    fRef.current += (target - fRef.current) * Math.min(1, dt * 4)
    const f = fRef.current

    if (hemiRef.current) {
      hemiRef.current.color.lerpColors(C.skyDay, C.skyNight, f)
      hemiRef.current.groundColor.lerpColors(C.gndDay, C.gndNight, f)
      hemiRef.current.intensity = preset.hemiDay + (preset.hemiNight - preset.hemiDay) * f
    }
    if (dirRef.current) {
      dirRef.current.color.lerpColors(C.sunDay, C.sunNight, f)
      dirRef.current.intensity = preset.sunDay + (preset.sunNight - preset.sunDay) * f
      dirRef.current.castShadow = shadowsEnabled && f < 0.5 && !transitionSuppressRef.current
    }
  })

  return (
    <>
      {/* HDRI 环境贴图 — 给 MeshPhysicalMaterial 的 clearcoat 提供反光源
          EnvBoundary：CDN 不可用时静默降级，不崩溃场景 */}
      <EnvBoundary>
        <Suspense fallback={null}>
          {!colorCalibrationMode && (
            <Environment
              preset={isNight ? preset.theme.envPresetNight : preset.theme.envPresetDay}
              environmentIntensity={isNight ? preset.envNight : preset.envDay}
            />
          )}
        </Suspense>
      </EnvBoundary>
      {/* 以下属性由 useFrame 接管，JSX 仅做初始化用 */}
      <hemisphereLight
        ref={hemiRef}
        color={colorCalibrationMode ? '#ffffff' : C.skyDay}
        groundColor={colorCalibrationMode ? '#ffffff' : C.gndDay}
        intensity={colorCalibrationMode ? 0.92 : preset.hemiDay}
      />
      <directionalLight
        ref={dirRef}
        castShadow={colorCalibrationMode ? false : (shadowsEnabled && !isNight)}
        color={colorCalibrationMode ? '#ffffff' : C.sunDay}
        intensity={colorCalibrationMode ? 0.28 : preset.sunDay}
        position={lightPos}
        shadow-mapSize={[preset.shadowMapSize, preset.shadowMapSize]}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-radius={preset.shadowRadiusDay}
        shadow-bias={-0.0005}
      />
    </>
  )
}
