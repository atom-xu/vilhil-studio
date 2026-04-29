'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Cloud,
  Coffee,
  DoorOpen,
  Fan,
  Gauge,
  Lightbulb,
  Minus,
  Moon,
  Plus,
  Power,
  Shield,
  Signal,
  Snowflake,
  Sun,
  User,
  Video,
  Wind,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type FloorKey = 'F3' | 'F2' | 'F1' | 'All'
type CategoryKey = 'lighting' | 'device' | 'security' | 'environment'
type SceneKey = 'reading' | 'entertainment' | 'away' | 'sleep'
type DetailKey = 'light' | 'curtain' | 'hvac' | 'fan' | null

const DEMO_WIDTH = 1180
const DEMO_HEIGHT = 760

const floors: FloorKey[] = ['F3', 'F2', 'F1', 'All']

const categories: Array<{
  key: CategoryKey
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { key: 'lighting', label: '照明', icon: Lightbulb },
  { key: 'device', label: '设备', icon: Camera },
  { key: 'security', label: '安防', icon: Video },
  { key: 'environment', label: '环境', icon: Gauge },
]

const scenes: Array<{
  key: SceneKey
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { key: 'reading', label: '阅读模式', icon: BookOpen },
  { key: 'entertainment', label: '娱乐模式', icon: Coffee },
  { key: 'away', label: '离家模式', icon: DoorOpen },
  { key: 'sleep', label: '睡眠模式', icon: Moon },
]

const markersByCategory: Record<
  CategoryKey,
  Array<{
    id: string
    label: string
    value: string
    detail: DetailKey
    floor: Exclude<FloorKey, 'All'>
    x: number
    y: number
  }>
> = {
  lighting: [
    { id: 'l1', label: '灯光', value: '86%', detail: 'light', floor: 'F1', x: 58, y: 61 },
    { id: 'l2', label: '灯光', value: '72%', detail: 'light', floor: 'F2', x: 54, y: 42 },
    { id: 'l3', label: '灯光', value: '60%', detail: 'light', floor: 'F3', x: 50, y: 23 },
  ],
  device: [
    { id: 'd1', label: '窗帘', value: '63%', detail: 'curtain', floor: 'F1', x: 71, y: 58 },
    { id: 'd2', label: '空调', value: '23C', detail: 'hvac', floor: 'F1', x: 62, y: 65 },
    { id: 'd3', label: '循环扇', value: '低速', detail: 'fan', floor: 'F1', x: 48, y: 73 },
  ],
  security: [
    { id: 's1', label: '摄像头', value: '在线', detail: null, floor: 'F1', x: 74, y: 54 },
    { id: 's2', label: '摄像头', value: '在线', detail: null, floor: 'F2', x: 67, y: 38 },
    { id: 's3', label: '摄像头', value: '在线', detail: null, floor: 'F3', x: 61, y: 19 },
  ],
  environment: [
    { id: 'e1', label: '空气', value: '优', detail: 'fan', floor: 'F1', x: 52, y: 69 },
    { id: 'e2', label: '温度', value: '26C', detail: 'hvac', floor: 'F2', x: 55, y: 44 },
  ],
}

const cameraFeeds = [
  { id: 'front', floor: 'F1', name: '庭院入口', tone: 'from-emerald-300/50 to-slate-200/20' },
  { id: 'living', floor: 'F1', name: '客厅全景', tone: 'from-amber-200/50 to-white/20' },
  { id: 'terrace', floor: 'F2', name: '二楼露台', tone: 'from-sky-300/50 to-slate-200/20' },
  { id: 'bedroom', floor: 'F3', name: '三楼卧室', tone: 'from-violet-200/40 to-white/15' },
]

export default function SmartHomeDemoPage() {
  const demoScale = useDemoScale()
  const [activeFloor, setActiveFloor] = useState<FloorKey>('All')
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('device')
  const [activeScene, setActiveScene] = useState<SceneKey>('entertainment')
  const [activeDetail, setActiveDetail] = useState<DetailKey>(null)
  const [curtain, setCurtain] = useState(63)
  const [temperature, setTemperature] = useState(23)
  const [brightness, setBrightness] = useState(86)
  const [fanSpeed, setFanSpeed] = useState(1)
  const [hvacOn, setHvacOn] = useState(true)
  const [hvacMode, setHvacMode] = useState<'wind' | 'cool' | 'heat' | 'fan'>('cool')

  const visibleMarkers = useMemo(() => {
    return markersByCategory[activeCategory].filter(
      (marker) => activeFloor === 'All' || marker.floor === activeFloor,
    )
  }, [activeCategory, activeFloor])

  const sceneTone = {
    reading: 'brightness-110',
    entertainment: 'brightness-100',
    away: 'brightness-75 saturate-75',
    sleep: 'brightness-90',
  }[activeScene]

  const activeSceneMeta = scenes.find((scene) => scene.key === activeScene) ?? scenes[0]!
  const ActiveSceneIcon = activeSceneMeta.icon

  return (
    <main className="min-h-screen overflow-auto bg-[#1d232a] text-white">
      <div
        className="mx-auto"
        style={{
          height: DEMO_HEIGHT * demoScale,
          width: DEMO_WIDTH * demoScale,
        }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            height: DEMO_HEIGHT,
            transform: `scale(${demoScale})`,
            transformOrigin: 'top left',
            width: DEMO_WIDTH,
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_76%,rgba(255,231,74,0.11),transparent_28%),linear-gradient(135deg,#20272f_0%,#171d23_58%,#222832_100%)]" />

          <header className="absolute left-12 right-12 top-7 z-30 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <User className="h-6 w-6 text-white/90" />
              <div className="text-2xl font-medium tabular-nums">14:42</div>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/60 backdrop-blur">
              <span>Demo exploration</span>
              <span className="h-1 w-1 rounded-full bg-[#ffe74a]" />
              <span>isolated route</span>
            </div>
          </header>

          <FloorRail activeFloor={activeFloor} onChange={setActiveFloor} />

          <section
            className={`absolute inset-y-0 left-[130px] right-[300px] z-10 transition duration-500 ${sceneTone}`}
          >
            <div className="relative h-full w-full">
              <HouseStack activeFloor={activeFloor} activeScene={activeScene} />
              {visibleMarkers.map((marker) => (
                <DeviceMarker
                  key={marker.id}
                  marker={marker}
                  onOpen={() => {
                    if (marker.detail) setActiveDetail(marker.detail)
                    if (activeCategory === 'security') setActiveDetail(null)
                  }}
                />
              ))}
            </div>
          </section>

          {activeFloor === 'All' ? (
            <ScenePanel activeScene={activeScene} onSceneChange={setActiveScene} />
          ) : (
            <CategoryDock
              activeCategory={activeCategory}
              onCategoryChange={(category) => {
                setActiveCategory(category)
                if (category === 'security') setActiveDetail(null)
              }}
            />
          )}

          {activeCategory === 'security' && activeFloor !== 'All' && <CameraDrawer />}

          {activeFloor === 'All' && (
            <WeatherPanel activeSceneIcon={ActiveSceneIcon} sceneLabel={activeSceneMeta.label} />
          )}

          {activeDetail && (
            <DetailControls
              brightness={brightness}
              curtain={curtain}
              detail={activeDetail}
              fanSpeed={fanSpeed}
              hvacMode={hvacMode}
              hvacOn={hvacOn}
              temperature={temperature}
              onBack={() => setActiveDetail(null)}
              onBrightness={setBrightness}
              onCurtain={setCurtain}
              onFanSpeed={setFanSpeed}
              onHvacMode={setHvacMode}
              onHvacPower={() => setHvacOn((value) => !value)}
              onTemperature={setTemperature}
            />
          )}
        </div>
      </div>
    </main>
  )
}

function useDemoScale() {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const updateScale = () => {
      setScale(Math.min(1, window.innerWidth / DEMO_WIDTH, window.innerHeight / DEMO_HEIGHT))
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  return scale
}

function FloorRail({
  activeFloor,
  onChange,
}: {
  activeFloor: FloorKey
  onChange: (floor: FloorKey) => void
}) {
  return (
    <nav className="absolute left-20 top-1/2 z-30 flex -translate-y-1/2 flex-col">
      {floors.map((floor) => {
        const active = floor === activeFloor
        return (
          <button
            key={floor}
            className="group relative flex h-24 w-16 items-center justify-center text-xl font-medium text-white/70 transition hover:text-white"
            onClick={() => onChange(floor)}
            type="button"
          >
            {active && (
              <span className="absolute left-0 h-9 w-0.5 bg-[#ffe74a] shadow-[0_0_18px_rgba(255,231,74,0.7)]" />
            )}
            <span
              className={
                active
                  ? 'scale-125 text-[#ffe74a] drop-shadow-[0_0_12px_rgba(255,231,74,0.55)]'
                  : 'group-hover:scale-110'
              }
            >
              {floor}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function HouseStack({
  activeFloor,
  activeScene,
}: {
  activeFloor: FloorKey
  activeScene: SceneKey
}) {
  return (
    <div className="absolute left-[47%] top-1/2 h-[680px] w-[820px] -translate-x-1/2 -translate-y-1/2">
      <Canvas
        camera={{ position: [7.5, 6.2, 8], zoom: 82 }}
        className="h-full w-full"
        dpr={[1, 1.6]}
        gl={{ alpha: true, antialias: true }}
        orthographic
        shadows
      >
        <color args={['#1d232a']} attach="background" />
        <ambientLight intensity={0.74} />
        <directionalLight castShadow intensity={2.1} position={[3.5, 7, 5]} />
        <pointLight
          color="#ffe74a"
          intensity={activeScene === 'away' ? 0.7 : 2.4}
          position={[1.8, 4.8, 1.2]}
        />
        <SmartHomeModel activeFloor={activeFloor} activeScene={activeScene} />
        <OrbitControls
          enableDamping
          enablePan={false}
          maxPolarAngle={Math.PI / 2.1}
          minPolarAngle={Math.PI / 4}
          target={[0, 1.62, 0]}
        />
      </Canvas>
    </div>
  )
}

function SmartHomeModel({
  activeFloor,
  activeScene,
}: {
  activeFloor: FloorKey
  activeScene: SceneKey
}) {
  const floors3d: Array<{ floor: Exclude<FloorKey, 'All'>; index: number }> = [
    { floor: 'F1', index: 0 },
    { floor: 'F2', index: 1 },
    { floor: 'F3', index: 2 },
  ]

  return (
    <group rotation={[0, -0.42, 0]}>
      <mesh position={[0.1, -0.08, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.2, 80]} />
        <meshStandardMaterial color="#10151c" opacity={0.48} transparent />
      </mesh>
      {floors3d.map(({ floor, index }) => {
        const isFocused = activeFloor === floor
        const isVisible = activeFloor === 'All' || isFocused
        const y = activeFloor === 'All' ? index * 1.34 : isFocused ? 1.45 : index * 1.34
        return (
          <FloorModel
            active={isVisible}
            activeScene={activeScene}
            floor={floor}
            key={floor}
            level={index}
            opacity={isVisible ? 1 : 0.16}
            position={[0, y, 0]}
          />
        )
      })}
      <DemoCar activeScene={activeScene} />
    </group>
  )
}

function FloorModel({
  active,
  activeScene,
  floor,
  level,
  opacity,
  position,
}: {
  active: boolean
  activeScene: SceneKey
  floor: Exclude<FloorKey, 'All'>
  level: number
  opacity: number
  position: [number, number, number]
}) {
  const lit = activeScene !== 'away'
  const glow = activeScene === 'sleep' ? '#9bd5ff' : '#ffe74a'
  const wallOpacity = active ? 0.48 : 0.1
  const emissiveIntensity = lit && active ? 0.6 : 0.06

  return (
    <group position={position}>
      <Box
        color="#2d3744"
        opacity={opacity * 0.96}
        position={[0, 0, 0]}
        scale={[5.4, 0.16, 3.25]}
      />
      <Box
        color="#10161f"
        opacity={opacity * 0.74}
        position={[0.18, -0.18, 0.2]}
        scale={[5.1, 0.18, 3.0]}
      />
      <Box
        color="#dbeafe"
        opacity={wallOpacity}
        position={[-2.72, 0.42, 0]}
        scale={[0.08, 0.7, 3.15]}
      />
      <Box
        color="#dbeafe"
        opacity={wallOpacity}
        position={[2.72, 0.42, -0.22]}
        scale={[0.08, 0.7, 2.45]}
      />
      <Box
        color="#dbeafe"
        opacity={wallOpacity}
        position={[-0.1, 0.42, -1.66]}
        scale={[5.25, 0.7, 0.08]}
      />
      <Box
        color="#67e8f9"
        opacity={active ? 0.28 : 0.07}
        position={[0.2, 0.42, 1.66]}
        scale={[4.8, 0.72, 0.05]}
      />

      <RoomWall opacity={opacity} position={[-1.15, 0.44, 0]} scale={[0.06, 0.56, 2.72]} />
      <RoomWall opacity={opacity} position={[0.82, 0.44, -0.36]} scale={[0.06, 0.56, 2.0]} />
      <RoomWall opacity={opacity} position={[0, 0.44, 0.28]} scale={[3.95, 0.56, 0.06]} />
      <RoomWall opacity={opacity} position={[1.75, 0.44, 0.9]} scale={[1.72, 0.56, 0.06]} />

      <Furniture
        color="#e5e7eb"
        opacity={opacity}
        position={[-1.95, 0.28, -0.84]}
        scale={[0.88, 0.22, 0.62]}
      />
      <Furniture
        color="#cbd5e1"
        opacity={opacity}
        position={[0.05, 0.26, -0.88]}
        scale={[0.82, 0.2, 0.38]}
      />
      <Furniture
        color="#f8fafc"
        opacity={opacity}
        position={[1.72, 0.3, -0.78]}
        scale={[1.0, 0.28, 0.72]}
      />
      <Furniture
        color="#d1d5db"
        opacity={opacity}
        position={[1.75, 0.24, 0.82]}
        scale={[1.16, 0.18, 0.32]}
      />
      <Stairs opacity={opacity} position={[-2.05, 0.25, 0.78]} />

      {floor === 'F1' && (
        <>
          <Box
            color="#334155"
            opacity={opacity * 0.7}
            position={[-1.95, -0.05, 2.1]}
            scale={[1.42, 0.08, 0.86]}
          />
          <Box
            color="#86efac"
            opacity={opacity * 0.22}
            position={[1.92, -0.03, 2.0]}
            scale={[1.08, 0.05, 0.72]}
          />
        </>
      )}

      {floor === 'F3' && (
        <Box
          color="#bae6fd"
          opacity={opacity * 0.2}
          position={[1.44, 0.03, 2.1]}
          scale={[1.8, 0.05, 0.74]}
        />
      )}

      {lit && active && (
        <>
          <mesh position={[-1.8, 0.74, -0.6]}>
            <sphereGeometry args={[0.18, 24, 16]} />
            <meshStandardMaterial
              color={glow}
              emissive={glow}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          <pointLight color={glow} distance={2.8} intensity={0.45} position={[-1.8, 0.76, -0.6]} />
          <mesh position={[1.45, 0.74, -0.5]}>
            <sphereGeometry args={[0.16, 24, 16]} />
            <meshStandardMaterial
              color="#f8fafc"
              emissive="#fff7cc"
              emissiveIntensity={emissiveIntensity * 0.7}
            />
          </mesh>
        </>
      )}

      {active && <FloorOutline />}
      <mesh position={[-2.98, 0.12, 0]}>
        <boxGeometry args={[0.06, 0.24, 0.42]} />
        <meshStandardMaterial
          color={level === 0 ? '#ffe74a' : '#ffffff'}
          emissive="#ffe74a"
          emissiveIntensity={0.16}
        />
      </mesh>
    </group>
  )
}

function Box({
  color,
  opacity = 1,
  position,
  scale,
}: {
  color: string
  opacity?: number
  position: [number, number, number]
  scale: [number, number, number]
}) {
  return (
    <mesh castShadow position={position} receiveShadow>
      <boxGeometry args={scale} />
      <meshStandardMaterial
        color={color}
        opacity={opacity}
        roughness={0.58}
        transparent={opacity < 1}
      />
    </mesh>
  )
}

function RoomWall({
  opacity,
  position,
  scale,
}: {
  opacity: number
  position: [number, number, number]
  scale: [number, number, number]
}) {
  return <Box color="#e2e8f0" opacity={opacity * 0.42} position={position} scale={scale} />
}

function Furniture({
  color,
  opacity,
  position,
  scale,
}: {
  color: string
  opacity: number
  position: [number, number, number]
  scale: [number, number, number]
}) {
  return <Box color={color} opacity={opacity * 0.8} position={position} scale={scale} />
}

function Stairs({ opacity, position }: { opacity: number; position: [number, number, number] }) {
  return (
    <group position={position}>
      {Array.from({ length: 7 }).map((_, index) => (
        <Box
          color="#cbd5e1"
          key={index}
          opacity={opacity * 0.65}
          position={[index * 0.13, index * 0.035, index * -0.1]}
          scale={[0.48, 0.04, 0.08]}
        />
      ))}
    </group>
  )
}

function FloorOutline() {
  return (
    <group>
      <Box
        color="#ffe74a"
        opacity={0.32}
        position={[0, 0.54, -1.73]}
        scale={[5.62, 0.025, 0.025]}
      />
      <Box color="#ffe74a" opacity={0.32} position={[0, 0.54, 1.73]} scale={[5.62, 0.025, 0.025]} />
      <Box
        color="#ffe74a"
        opacity={0.32}
        position={[-2.82, 0.54, 0]}
        scale={[0.025, 0.025, 3.46]}
      />
      <Box color="#ffe74a" opacity={0.32} position={[2.82, 0.54, 0]} scale={[0.025, 0.025, 3.46]} />
    </group>
  )
}

function DemoCar({ activeScene }: { activeScene: SceneKey }) {
  return (
    <group position={[2.35, -0.06, 3.05]} rotation={[0, -0.28, 0]}>
      <Box color="#e5e7eb" position={[0, 0.18, 0]} scale={[1.0, 0.28, 0.48]} />
      <Box color="#94a3b8" position={[0.02, 0.42, -0.02]} scale={[0.54, 0.22, 0.36]} />
      <mesh position={[-0.34, 0.03, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 24]} />
        <meshStandardMaterial color="#020617" />
      </mesh>
      <mesh position={[0.34, 0.03, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 24]} />
        <meshStandardMaterial color="#020617" />
      </mesh>
      {activeScene === 'entertainment' && (
        <mesh position={[0.52, 0.2, -0.18]}>
          <boxGeometry args={[0.06, 0.06, 0.2]} />
          <meshStandardMaterial color="#ffe74a" emissive="#ffe74a" emissiveIntensity={1.8} />
        </mesh>
      )}
    </group>
  )
}

function DeviceMarker({
  marker,
  onOpen,
}: {
  marker: (typeof markersByCategory)[CategoryKey][number]
  onOpen: () => void
}) {
  return (
    <button
      className="absolute z-20 flex min-w-20 items-center gap-2 bg-[#45484d]/80 px-3 py-2 text-left shadow-[0_14px_28px_rgba(0,0,0,0.28)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-[#55595f]/85"
      onClick={onOpen}
      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
      type="button"
    >
      <span className="h-10 w-0.5 bg-[#ffe74a]" />
      <span>
        <span className="block text-sm text-white/90">{marker.label}</span>
        <span className="block text-sm font-semibold text-[#ffe74a]">{marker.value}</span>
      </span>
    </button>
  )
}

function CategoryDock({
  activeCategory,
  onCategoryChange,
}: {
  activeCategory: CategoryKey
  onCategoryChange: (category: CategoryKey) => void
}) {
  return (
    <nav className="absolute bottom-8 left-20 z-40 flex w-[460px] gap-3">
      {categories.map((category) => {
        const Icon = category.icon
        const active = category.key === activeCategory
        return (
          <button
            key={category.key}
            className={`flex h-[72px] flex-1 flex-col items-center justify-center gap-1 border border-white/15 bg-white/10 transition hover:bg-white/15 ${
              active ? 'text-[#ffe74a]' : 'text-white'
            }`}
            onClick={() => onCategoryChange(category.key)}
            type="button"
          >
            <Icon className="h-7 w-7" />
            <span className="text-sm">{category.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function ScenePanel({
  activeScene,
  onSceneChange,
}: {
  activeScene: SceneKey
  onSceneChange: (scene: SceneKey) => void
}) {
  return (
    <aside className="absolute right-20 top-1/2 z-30 w-[270px] -translate-y-1/2">
      <div className="mb-5">
        <WeatherPanel activeSceneIcon={Cloud} sceneLabel="杭州市余杭区" compact />
      </div>
      <div className="overflow-hidden bg-[#2b3138]/88 backdrop-blur-xl">
        {scenes.map((scene) => {
          const Icon = scene.icon
          const active = scene.key === activeScene
          return (
            <button
              key={scene.key}
              className={`flex h-[76px] w-full items-center justify-center gap-4 transition ${
                active ? 'bg-[#ffe74a] text-black' : 'text-white/72 hover:bg-white/8'
              }`}
              onClick={() => onSceneChange(scene.key)}
              type="button"
            >
              <Icon className="h-6 w-6" />
              <span className="font-medium">{scene.label}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function WeatherPanel({
  activeSceneIcon: Icon,
  compact = false,
  sceneLabel,
}: {
  activeSceneIcon: React.ComponentType<{ className?: string }>
  compact?: boolean
  sceneLabel: string
}) {
  return (
    <div
      className={
        compact
          ? 'flex items-center gap-4'
          : 'absolute right-20 top-24 z-20 flex items-center gap-4'
      }
    >
      <Icon className="h-16 w-16 text-white/85 drop-shadow-xl" />
      <div>
        <div className="flex items-start">
          <span className="text-6xl font-medium leading-none text-[#ffe74a]">26</span>
          <span className="mt-1 text-xl text-[#ffe74a]">C</span>
        </div>
        <div className="text-sm text-white/80">{sceneLabel}</div>
      </div>
    </div>
  )
}

function CameraDrawer() {
  return (
    <aside className="absolute bottom-0 right-0 top-0 z-40 w-[430px] border-l border-white/10 bg-[#202225]/94 p-10 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Shield className="h-4 w-4 text-[#ffe74a]" />
          <span>摄像头在线</span>
        </div>
        <button className="h-9 px-3 text-sm text-white/70 hover:text-white" type="button">
          取消
        </button>
      </div>
      <div className="flex h-full flex-col gap-5 overflow-hidden">
        {cameraFeeds.map((feed) => (
          <button
            key={feed.id}
            className="group relative h-[150px] overflow-hidden rounded-[4px] bg-slate-800 text-left"
            type="button"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${feed.tone}`} />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-white/42 px-3 py-1 text-xs font-medium">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ffe74a]" />
                LIVE
              </span>
              <span>{feed.floor}</span>
              <Signal className="h-4 w-4 text-[#ffe74a]" />
            </div>
            <div className="absolute bottom-3 left-3 text-sm font-medium text-white drop-shadow">
              {feed.name}
            </div>
          </button>
        ))}
      </div>
    </aside>
  )
}

function DetailControls({
  brightness,
  curtain,
  detail,
  fanSpeed,
  hvacMode,
  hvacOn,
  temperature,
  onBack,
  onBrightness,
  onCurtain,
  onFanSpeed,
  onHvacMode,
  onHvacPower,
  onTemperature,
}: {
  brightness: number
  curtain: number
  detail: Exclude<DetailKey, null>
  fanSpeed: number
  hvacMode: 'wind' | 'cool' | 'heat' | 'fan'
  hvacOn: boolean
  temperature: number
  onBack: () => void
  onBrightness: (value: number) => void
  onCurtain: (value: number) => void
  onFanSpeed: (value: number) => void
  onHvacMode: (value: 'wind' | 'cool' | 'heat' | 'fan') => void
  onHvacPower: () => void
  onTemperature: (value: number) => void
}) {
  return (
    <aside className="absolute inset-y-0 right-10 z-50 flex w-[150px] flex-col items-center justify-center gap-5">
      {detail === 'curtain' && (
        <>
          <div className="flex h-[380px] w-[100px] items-center justify-center gap-4 bg-[#616161]/70 px-3 py-4 backdrop-blur">
            <div className="flex h-full flex-col justify-between text-sm">
              {[100, 60, 30, 0].map((value) => (
                <button
                  key={value}
                  className={Math.abs(curtain - value) < 12 ? 'text-[#ffe74a]' : 'text-white'}
                  onClick={() => onCurtain(value)}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="flex h-full flex-col-reverse justify-between">
              {Array.from({ length: 20 }).map((_, index) => {
                const active = index * 5 <= curtain
                return (
                  <span
                    key={index}
                    className={`h-1 w-7 rounded-full ${active ? 'bg-[#ffe74a]' : 'bg-white/25'}`}
                  />
                )
              })}
            </div>
          </div>
          <button
            className="h-[65px] w-[100px] bg-[#616161]/70 text-lg text-[#ffe74a] backdrop-blur"
            onClick={() => onCurtain(curtain > 0 ? 0 : 100)}
            type="button"
          >
            {curtain > 0 ? '关闭' : '打开'}
          </button>
        </>
      )}

      {(detail === 'hvac' || detail === 'fan') && (
        <>
          <div className="w-[100px] bg-[#616161]/70 backdrop-blur">
            <button
              className="flex h-[65px] w-full items-center justify-center"
              onClick={() => onTemperature(Math.min(30, temperature + 1))}
              type="button"
            >
              <Plus className="h-6 w-6" />
            </button>
            <div className="text-center text-3xl text-[#ffe74a]">{temperature}</div>
            <button
              className="flex h-[65px] w-full items-center justify-center"
              onClick={() => onTemperature(Math.max(16, temperature - 1))}
              type="button"
            >
              <Minus className="h-6 w-6" />
            </button>
          </div>

          <div className="w-[100px] bg-[#444]/70 backdrop-blur">
            <button
              className="relative flex h-[65px] w-full items-center justify-center text-[#ffe74a]"
              onClick={() => onFanSpeed((fanSpeed + 1) % 3)}
              type="button"
            >
              <Fan className={`h-7 w-7 ${fanSpeed > 0 ? 'animate-spin' : ''}`} />
              <span
                className="absolute bottom-0 left-0 h-1 bg-[#ffe74a]"
                style={{ width: `${(fanSpeed + 1) * 33}%` }}
              />
            </button>
            <button
              className={`flex h-[65px] w-full items-center justify-center ${hvacOn ? 'text-[#ffe74a]' : 'text-white'}`}
              onClick={onHvacPower}
              type="button"
            >
              <Power className="h-7 w-7" />
            </button>
          </div>

          <div className="w-[100px] bg-[#444]/70 backdrop-blur">
            {[
              { key: 'wind' as const, icon: Wind },
              { key: 'cool' as const, icon: Snowflake },
              { key: 'heat' as const, icon: Sun },
              { key: 'fan' as const, icon: Fan },
            ].map((mode) => {
              const Icon = mode.icon
              return (
                <button
                  key={mode.key}
                  className={`flex h-[65px] w-full items-center justify-center ${hvacMode === mode.key ? 'text-[#ffe74a]' : 'text-white'}`}
                  onClick={() => onHvacMode(mode.key)}
                  type="button"
                >
                  <Icon className="h-7 w-7" />
                </button>
              )
            })}
          </div>
        </>
      )}

      {detail === 'light' && (
        <>
          <div className="flex h-[320px] w-[100px] flex-col items-center justify-between bg-[#616161]/70 p-4 backdrop-blur">
            <span className="text-sm text-white/80">亮度</span>
            <Lightbulb className="h-9 w-9 text-[#ffe74a]" />
            <input
              className="h-36 rotate-[-90deg] accent-[#ffe74a]"
              max={100}
              min={0}
              onChange={(event) => onBrightness(Number(event.target.value))}
              type="range"
              value={brightness}
            />
            <span className="text-2xl text-[#ffe74a]">{brightness}%</span>
          </div>
        </>
      )}

      <button
        className="flex h-[65px] w-[100px] items-center justify-center bg-[#ffe74a] text-black transition hover:brightness-110"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft className="h-7 w-7" />
      </button>
    </aside>
  )
}
