'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Environment } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense } from 'react'
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
import { RoomBaseLight, DemoLightBulb } from './lighting'
import type { LightState } from './lighting'
import type { RenderPreset } from './render-presets'
import type { ConvertedWall, OpeningData, DeviceData, SlabData, ItemData, RoomCentroid, SceneSeed } from './types'
import type { ViewState } from './camera'

// ─── 演示结构渲染器 ───────────────────────────────────────────────────────────

export interface StructureProps {
  walls: ConvertedWall[]
  openingsByWall: Record<string, OpeningData[]>
  devices: DeviceData[]
  slabs: SlabData[]
  items: ItemData[]
  roomCentroids: RoomCentroid[]            // base lighting 层数据
  roomStates: Record<string, number>       // key=roomId, value=brightness 0-100
  lightStates: Record<string, LightState>
  bbox: SceneSeed['bbox']
  lightPos: [number, number, number]
  isNight: boolean
  preset: RenderPreset
  onToggleLight: (id: string) => void
  onToggleRoom: (id: string) => void       // 切换单个房间 base lighting
  view: ViewState                           // 当前视角，决定胶囊显隐
  onEnterLightingDetail?: (roomId: string) => void   // 进入该房间的灯光俯视 Detail
}

export function DemoStructure({ walls, openingsByWall, devices, slabs, items, roomCentroids, roomStates, lightStates, bbox, lightPos, isNight, preset, onToggleLight, onToggleRoom, view, onEnterLightingDetail }: StructureProps) {
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
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.theme.wallColor),
    roughness: 0.22,
    metalness: 0.08,
    envMapIntensity: 1.2,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.FrontSide,
  }), [preset.theme.wallColor])
  useEffect(() => () => wallMat.dispose(), [wallMat])
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
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
  }), [preset])
  useEffect(() => () => padMat.dispose(), [padMat])

  // 地板 Pad 顶面材质 — 半透明，让倒影从顶面透出
  const padTopMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.theme.padColorDay),
    emissive: new THREE.Color(preset.theme.padEmissiveDay),
    emissiveIntensity: 0.2,
    roughness: 1.0,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.FrontSide,
  }), [preset])
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
    // 夜间 emissive 大幅压低：避免发光地板透过玻璃墙在建筑外部可见（台阶状光斑问题）
    padMat.emissiveIntensity = 0.3 + f * 0.5   // 0.3 → 0.8（原 0.4 → 2.5）
    padTopMat.color.lerpColors(C.padDay, C.padNight, f)
    padTopMat.emissive.lerpColors(C.padEmDay, C.padEmNight, f)
    padTopMat.emissiveIntensity = 0.3 + f * 0.5
  })

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
      {/* 地板 Pad 侧面 — 实心。沉到 PAD_Y_OFFSET 避免和其他 y≈0 地板几何 z-fighting */}
      {padSideGeo && (
        <mesh
          ref={padSideRef}
          geometry={padSideGeo}
          material={padMat}
          position={[0, PAD_Y_OFFSET, 0]}
          renderOrder={-2}
        />
      )}
      {/* 地板 Pad 顶面 — 半透明，倒影（镜像克隆）从此处透出 */}
      {padTopGeo && (
        <mesh
          ref={padTopRef}
          geometry={padTopGeo}
          material={padTopMat}
          position={[0, PAD_Y_OFFSET, 0]}
          renderOrder={0}
        />
      )}


      {/* 接触阴影锚点 — 让建筑底部和地面更"贴"，减少漂浮感 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[bbox.cx, -0.006, bbox.cz]}
        receiveShadow
      >
        <circleGeometry args={[Math.max(bbox.w, bbox.d) * 0.86, 64]} />
        {/* 夜间几乎不显示：墙体阴影在月光下投到此圆上会产生锯齿轮廓，压低到近乎不可见 */}
        <shadowMaterial transparent opacity={isNight ? 0.04 : 0.10} />
      </mesh>

      {/* 合并墙体 — 透明玻璃视觉（Layer 0）+ castShadow 让 shadow camera 把它当不透明
          SpotLight 在 Layer 1 → 不照亮墙面 → 墙体不向外发光
          shadow camera 在 Layer 0 → 看到此墙 → 室内光被正确遮挡，不穿墙 */}
      {bodyGeo && (
        <>
          <mesh ref={wallMeshRef} geometry={bodyGeo} castShadow receiveShadow material={wallMat} />
          {/* 墙体倒影 — 镜像副本 scale Y=-1，alpha 按 world.y 衰减 */}
          <mesh geometry={bodyGeo} scale={[1, -1, 1]} material={wallMirrorMat} renderOrder={1} />
        </>
      )}

      {/* 顶面 cap — 位置驱动渐变：品牌蓝 → 浅冰蓝，叠加光源高光 */}
      {capGeo && (
        <mesh geometry={capGeo} renderOrder={2}>
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
        const isTarget   = inDetail && view.targetId === c.id
        const hidden     = !inLighting || (inDetail && !isTarget)
        const allowZoom  = inLighting && !inDetail && !!onEnterLightingDetail
        return (
          <RoomBaseLight
            key={`room-base-${c.id || i}`}
            centroid={c}
            brightness={roomStates[c.id] ?? 0}
            wallHeight={WALL_HEIGHT}
            label={c.label}
            colorTemp={3000}
            onToggle={() => onToggleRoom(c.id)}
            onZoomIn={allowZoom ? () => onEnterLightingDetail!(c.id) : undefined}
            hidden={hidden}
          />
        )
      })}

      {/* 灯具（已配置灯光设计才有）— 细节层，拉近镜头后的交互单元 */}
      {devices.map((d) => (
        <DemoLightBulb
          key={d.id}
          device={d}
          state={lightStates[d.id] ?? { on: d.on, brightness: d.brightness }}
          onToggle={() => onToggleLight(d.id)}
          isNight={isNight}
          preset={preset}
        />
      ))}

      {/* 家具 — GLB 模型，useGLTF 自动缓存 */}
      <Suspense fallback={null}>
        {items.map((it) => (
          <DemoItem key={it.id} item={it} />
        ))}
      </Suspense>

      {/* 窗 / 门面板 — depthTest=false 确保始终可见（面板在墙体中心，否则被深度缓冲遮挡）*/}
      {openingPanels.map((p) => (
        <mesh key={p.key} position={p.position} rotation={p.rotation} renderOrder={3}>
          {/* 厚度贯穿整面墙，从内外都能看到 */}
          <boxGeometry args={[p.width, p.height, p.thickness + 0.01]} />
          <meshBasicMaterial
            color={p.kind === 'window' ? preset.theme.windowColor : preset.theme.doorColor}
            transparent
            opacity={p.kind === 'window' ? 0.22 : 0.08}
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
  lightPos, isNight, preset,
}: { lightPos: [number, number, number]; isNight: boolean; preset: RenderPreset }) {
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
      // 过渡到夜间时逐渐关闭投影，避免切换时阴影贴图刷新闪烁
      dirRef.current.castShadow = f < 0.5
    }
  })

  return (
    <>
      {/* HDRI 环境贴图 — 给 MeshPhysicalMaterial 的 clearcoat 提供反光源 */}
      <Environment
        preset={isNight ? preset.theme.envPresetNight : preset.theme.envPresetDay}
        environmentIntensity={isNight ? preset.envNight : preset.envDay}
      />
      {/* 以下属性由 useFrame 接管，JSX 仅做初始化用 */}
      <hemisphereLight
        ref={hemiRef}
        color={C.skyDay}
        groundColor={C.gndDay}
        intensity={preset.hemiDay}
      />
      <directionalLight
        ref={dirRef}
        castShadow={!isNight}
        color={C.sunDay}
        intensity={preset.sunDay}
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
