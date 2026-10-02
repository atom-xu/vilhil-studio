'use client'

import { useScene } from '@pascal-app/core'
import type { Subsystem } from '@pascal-app/core'
import {
  CATALOG_BY_SUBSYSTEM,
  SUBSYSTEM_ORDER,
  getSubsystemColor,
  getSubsystemLabel,
  getProductMeta,
} from '@vilhil/smarthome'
import type { DeviceDefinition } from '@vilhil/smarthome'
import {
  ArrowLeft,
  Building2,
  Cpu,
  Layers,
  Lightbulb,
  Music,
  Package,
  Radio,
  Search,
  Shield,
  ToggleLeft,
  Wifi,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import {
  OrbitControls,
  Environment,
  ContactShadows,
  useGLTF,
  Clone,
} from '@react-three/drei'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import useEditor from '../../store/use-editor'

// ─── Constants ──────────────────────────────────────────────────────────────

const SUBSYSTEM_ICONS: Record<string, LucideIcon> = {
  architecture: Building2,
  lighting: Lightbulb,
  panel: ToggleLeft,
  sensor: Radio,
  curtain: Layers,
  hvac: Wind,
  av: Music,
  security: Shield,
  network: Wifi,
}

const MOUNT_LABEL: Record<string, string> = {
  ceiling: '吸顶',
  wall: '壁挂',
  wall_switch: '墙面',
  floor: '落地',
  door: '门上',
  din_rail: '导轨',
  track: '轨道',
  hidden: '暗装',
  ceiling_suspended: '悬挂',
}

const TYPE_LABEL: Record<string, string> = {
  light: '灯具',
  panel: '面板',
  motor: '电机',
  sensor: '传感器',
  lock: '门锁',
  ap: '无线AP',
  gateway: '网关',
  actuator: '执行器',
  equipment: '设备',
  host: '主机',
}

const POWER_SOURCE_LABEL: Record<string, string> = {
  bus_powered: '总线供电',
  mains_powered: '市电',
  battery: '电池',
  poe: 'PoE',
  usb: 'USB',
}

const LIFECYCLE_LABEL: Record<string, string> = {
  active: '在售',
  eol: '停产中',
  discontinued: '已停产',
  upcoming: '即将上市',
}

const CONTROL_LABEL: Record<string, string> = {
  switch: '开关',
  dimmer: '调光',
  scene: '场景',
  touch: '触控',
  thermostat: '温控',
}

const LIGHT_TYPE_LABEL: Record<string, string> = {
  point: '点光源',
  line: '线光源',
  physical: '物理光源',
}

// ─── GLB & Thumbnail Mapping ───────────────────────────────────────────────

const CATALOG_GLB_MAP: Record<string, string> = {
  // ── 通用设备（项目自有模型）──
  'SECURITY-CAMERA-DOME': '/items/security-camera-dome/model.glb',
  'SECURITY-CAMERA-BULLET': '/items/security-camera-bullet/model.glb',
  'AV-SMART-SPEAKER': '/items/apple-homepod/model.glb',
  'NETWORK-CABINET-WALL': '/items/electric-panel/model.glb',
  'SECURITY-SMOKE': '/items/smoke-detector/model.glb',
  'HVAC-THERMOSTAT': '/items/thermostat/model.glb',
  'LIGHT-DOWNLIGHT': '/items/recessed-light/model.glb',
  'PANEL-SWITCH-1KEY': '/items/smart-switch/model.glb',
  'PANEL-SWITCH-2KEY': '/items/smart-switch/model.glb',
  'PANEL-SWITCH-3KEY': '/items/smart-switch/model.glb',
  // ── UniFi 品牌摄像头 ──
  'UNIFI-G6-PRO-360': '/items/unifi-g6-pro-360/model.glb',
  'UNIFI-G6-180': '/items/unifi-uvc-g6-180/model.glb',
  'UNIFI-G6-PRO-TURRET': '/items/unifi-uvc-g6-pro-turret/model.glb',
  'UNIFI-G6-PRO-ENTRY': '/items/unifi-uvc-g6-pro-entry/model.glb',
  // ── UniFi 品牌网络设备 ──
  'UNIFI-U7-PRO-XGS': '/items/unifi-u7-pro-xgs/model.glb',
  'UNIFI-U7-PRO-XG-WALL': '/items/unifi-u7-pro-xg-wall/model.glb',
  'UNIFI-UDR7': '/items/unifi-udr7/model.glb',
  'UNIFI-UX7': '/items/unifi-ux7/model.glb',
  'UNIFI-UCG-FIBER': '/items/unifi-ucg-fiber/model.glb',
  'UNIFI-USW-PRO-XG-8-POE': '/items/unifi-usw-pro-xg-8-poe/model.glb',
  'UNIFI-UNAS-4': '/items/unifi-unas-4/model.glb',
}

/** Per-model Y-axis rotation offset (radians) to face the camera properly */
const MODEL_ROTATION_Y: Record<string, number> = {
  'SECURITY-CAMERA-DOME': Math.PI * 0.25,
  'SECURITY-CAMERA-BULLET': Math.PI * 0.75,
  'UNIFI-G6-PRO-360': Math.PI * 0.75,
  'UNIFI-G6-180': Math.PI,
  'UNIFI-G6-PRO-TURRET': Math.PI * 0.75,
  'UNIFI-G6-PRO-ENTRY': 0,
  'UNIFI-U7-PRO-XGS': 0,
  'UNIFI-U7-PRO-XG-WALL': Math.PI,
  'UNIFI-UDR7': -Math.PI / 6,
  'UNIFI-UX7': 0,
  'UNIFI-UCG-FIBER': -Math.PI / 6,
  'UNIFI-USW-PRO-XG-8-POE': 0,
  'UNIFI-UNAS-4': -Math.PI / 5,
  'AV-SMART-SPEAKER': 0,
  'HVAC-THERMOSTAT': 0,
  'LIGHT-DOWNLIGHT': 0,
  'PANEL-SWITCH-1KEY': 0,
}

/** Resolve thumbnail path — variant-aware */
function getThumbnailPath(catalogId: string, variantKey?: string): string | null {
  const glbPath = CATALOG_GLB_MAP[catalogId]
  if (!glbPath) return null
  const dir = glbPath.replace('/model.glb', '')
  if (!catalogId.startsWith('UNIFI-')) return `${dir}/thumbnail.webp`
  if (variantKey === 'black') return `${dir}/thumbnail-black.png`
  return `${dir}/thumbnail.png`
}

// ─── Color Variants (real GLB + thumbnail switching) ──────────────────────

interface ColorVariant {
  label: string
  hex: string
  /** 'default' uses model.glb, 'black' uses model-black.glb */
  key: 'default' | 'black'
}

const DEVICE_COLOR_VARIANTS: Record<string, ColorVariant[]> = {
  'UNIFI-G6-PRO-360': [
    { label: 'White', hex: '#f0f0f0', key: 'default' },
    { label: 'Black', hex: '#1a1a1a', key: 'black' },
  ],
  'UNIFI-G6-180': [
    { label: 'White', hex: '#f0f0f0', key: 'default' },
    { label: 'Black', hex: '#1a1a1a', key: 'black' },
  ],
  'UNIFI-G6-PRO-TURRET': [
    { label: 'White', hex: '#f0f0f0', key: 'default' },
    { label: 'Black', hex: '#1a1a1a', key: 'black' },
  ],
  'UNIFI-U7-PRO-XGS': [
    { label: 'White', hex: '#f0f0f0', key: 'default' },
    { label: 'Black', hex: '#1a1a1a', key: 'black' },
  ],
  'UNIFI-UNAS-4': [
    { label: 'White', hex: '#f0f0f0', key: 'default' },
    { label: 'Black', hex: '#1a1a1a', key: 'black' },
  ],
}

/** Resolve GLB path for a specific variant */
function getVariantGLBPath(catalogId: string, variantKey: string): string | null {
  const basePath = CATALOG_GLB_MAP[catalogId]
  if (!basePath) return null
  if (variantKey === 'black') return basePath.replace('/model.glb', '/model-black.glb')
  return basePath
}

// ─── 3D Components ─────────────────────────────────────────────────────────

/** Load GLB model, auto-fit & center synchronously (no frame delay) */
function DeviceModelGLB({
  path,
  rotationY = 0,
  onMeasured,
}: {
  path: string
  rotationY?: number
  onMeasured?: (info: { height: number }) => void
}) {
  const { scene } = useGLTF(path)

  const { normalizedScale, centerOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = maxDim > 0 ? 0.7 / maxDim : 1
    // Offset to center the model at origin (scaled)
    const offset: [number, number, number] = [
      -center.x * scale,
      -center.y * scale,
      -center.z * scale,
    ]
    return { normalizedScale: scale, centerOffset: offset }
  }, [scene])

  // Report measured height for shadow positioning (runs once synchronously after mount)
  const measuredRef = useRef(false)
  useEffect(() => {
    if (measuredRef.current) return
    measuredRef.current = true
    if (onMeasured) {
      const box = new THREE.Box3().setFromObject(scene)
      const size = box.getSize(new THREE.Vector3())
      onMeasured({ height: size.y * normalizedScale })
    }
  }, [scene, normalizedScale, onMeasured])

  return (
    <group rotation={[0, rotationY, 0]}>
      <group position={centerOffset}>
        <Clone object={scene} scale={normalizedScale} castShadow receiveShadow />
      </group>
    </group>
  )
}

/** Fallback box when no GLB is available */
function DeviceFallbackBox({
  size,
  color,
}: {
  size: [number, number, number]
  color: string
}) {
  const [w, h, d] = size
  const maxDim = Math.max(w, h, d)
  const s = maxDim > 0 ? 0.7 / maxDim : 8

  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[w * s, h * s, d * s]} />
      <meshPhysicalMaterial
        clearcoat={0.8}
        clearcoatRoughness={0.1}
        color={color}
        envMapIntensity={1.5}
        metalness={0.2}
        roughness={0.15}
      />
    </mesh>
  )
}


/** Disable tone mapping so whites render pure — contrast comes from lighting only */
function ToneMappingSetup() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.toneMapping = THREE.NoToneMapping
  }, [gl])
  return null
}

/**
 * Settle animation: slight rotation on mount then hand off to OrbitControls.
 *
 * IMPORTANT — the initial Canvas camera position MUST match the t=0 state here
 * so the first rendered frame is identical to the animation start (no jump).
 *
 * t=0: angle=0.15, radius=2.6
 *   x = sin(0.15)*2.6 ≈ 0.388, z = cos(0.15)*2.6 ≈ 2.571, y = 1.4
 *   lookAt(0, 0, 0)   ← same as OrbitControls target, no jump on handoff
 *
 * Canvas camera must be: position={[0.39, 1.4, 2.57]}
 */
function SettleControls() {
  const { camera } = useThree()
  const settled = useRef(false)
  const startTime = useRef(0)

  useEffect(() => {
    startTime.current = performance.now()
    settled.current = false
  }, [])

  useFrame(() => {
    if (settled.current) return
    const elapsed = (performance.now() - startTime.current) / 1000
    const duration = 1.2
    if (elapsed >= duration) {
      settled.current = true
      return
    }
    const t = elapsed / duration
    const ease = 1 - Math.pow(1 - t, 3)
    const angle = (1 - ease) * 0.15
    const radius = 2.6
    camera.position.x = Math.sin(angle) * radius
    camera.position.z = Math.cos(angle) * radius
    camera.position.y = 1.4
    camera.lookAt(0, 0, 0)
  })

  return (
    <OrbitControls
      enablePan={false}
      enableZoom={false}
      maxPolarAngle={Math.PI / 1.75}
      minPolarAngle={Math.PI / 6}
    />
  )
}

/** Premium 3D Hero — product centered synchronously, no position jump */
function DeviceHero3D({ device, variantKey }: { device: DeviceDefinition; variantKey?: string }) {
  const glbPath = (variantKey
    ? getVariantGLBPath(device.catalogId, variantKey)
    : CATALOG_GLB_MAP[device.catalogId]) ?? null
  const rotationY = MODEL_ROTATION_Y[device.catalogId] ?? 0
  const [shadowY, setShadowY] = useState(-0.35)

  const handleMeasured = useCallback(({ height }: { height: number }) => {
    setShadowY(-height / 2)
  }, [])

  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0.39, 1.4, 2.57], fov: 24 }}
        flat
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <ToneMappingSetup />

          {glbPath ? (
            <DeviceModelGLB path={glbPath} rotationY={rotationY} onMeasured={handleMeasured} />
          ) : (
            <DeviceFallbackBox size={device.size} color={device.color ?? '#888'} />
          )}

          <ContactShadows
            position={[0, shadowY, 0]}
            opacity={0.45}
            blur={0.5}
            far={1}
            resolution={512}
            width={1}
            height={1}
          />

          <SettleControls />
          <Environment preset="studio" environmentIntensity={0.75} />
        </Suspense>
      </Canvas>
    </div>
  )
}

// ─── Card Thumbnail ────────────────────────────────────────────────────────

function CardThumbnail({ device, variantKey }: { device: DeviceDefinition; variantKey?: string }) {
  const thumbPath = getThumbnailPath(device.catalogId, variantKey)
  const color = getSubsystemColor(device.subsystem)
  const Icon = SUBSYSTEM_ICONS[device.subsystem] ?? Cpu

  if (thumbPath) {
    return (
      <div className="relative flex h-full w-full items-center justify-center p-5">
        <img
          alt={device.name}
          className="h-full w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
          draggable={false}
          loading="lazy"
          src={thumbPath}
        />
      </div>
    )
  }

  // Fallback: subsystem icon
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        className="absolute h-16 w-16 rounded-full opacity-[0.08] blur-2xl"
        style={{ backgroundColor: color }}
      />
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
        style={{ backgroundColor: `${color}10` }}
      >
        <Icon className="h-6 w-6" style={{ color, opacity: 0.6 }} />
      </div>
    </div>
  )
}

// ─── Spec helpers ───────────────────────────────────────────────────────────

function SpecRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[13px] text-muted-foreground/70">{label}</span>
      <span className="text-[13px] font-medium text-foreground">{value}</span>
    </div>
  )
}

function SpecSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border/30 bg-card p-5">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="divide-y divide-border/20">{children}</div>
    </div>
  )
}

// ─── Detail View ───────────────────────────────────────────────────────────

function DeviceDetailView({
  device,
  onBack,
  onPlace,
}: {
  device: DeviceDefinition
  onBack: () => void
  onPlace: (d: DeviceDefinition) => void
}) {
  const color = getSubsystemColor(device.subsystem)
  const Icon = SUBSYSTEM_ICONS[device.subsystem] ?? Cpu
  const productMeta = useMemo(() => getProductMeta(device.catalogId), [device.catalogId])
  const colorVariants = DEVICE_COLOR_VARIANTS[device.catalogId]
  const [activeVariant, setActiveVariant] = useState(0)

  // Preload all variant GLBs on detail mount so switching is instant
  useEffect(() => {
    if (!colorVariants) return
    for (const v of colorVariants) {
      const p = getVariantGLBPath(device.catalogId, v.key)
      if (p) useGLTF.preload(p)
    }
  }, [device.catalogId, colorVariants])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/10 px-6 py-2.5">
        <button
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {getSubsystemLabel(device.subsystem)}
        </button>
        <span className="text-muted-foreground/20">/</span>
        <span className="text-[13px] font-medium text-foreground">{device.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Hero: light 3D left + info right ── */}
        <div className="flex min-h-[460px] gap-0">
          {/* Left: 3D hero — transparent canvas blends with page bg */}
          <div className="relative flex-[55] overflow-hidden">
            <div className="relative h-full">
              <DeviceHero3D
                key={`${device.catalogId}-${activeVariant}`}
                device={device}
                variantKey={colorVariants?.[activeVariant]?.key}
              />
            </div>

            {/* Color variant picker (bottom left) */}
            {colorVariants && colorVariants.length > 1 && (
              <div className="absolute bottom-5 left-5 flex items-center gap-2">
                {colorVariants.map((v, i) => (
                  <button
                    key={v.label}
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-all',
                      i === activeVariant
                        ? 'scale-110 border-primary shadow-md'
                        : 'border-border/40 hover:scale-105',
                    )}
                    onClick={() => setActiveVariant(i)}
                    style={{ backgroundColor: v.hex }}
                    title={v.label}
                    type="button"
                  />
                ))}
              </div>
            )}

            {/* Catalog ID watermark */}
            <div className="absolute bottom-4 right-5 font-mono text-[10px] text-muted-foreground/20">
              {device.catalogId}
            </div>
          </div>

          {/* Right: product info */}
          <div className="flex flex-[45] flex-col justify-center border-l border-border/10 px-8 py-8">
            {/* Type badge */}
            <div className="mb-4 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ color, backgroundColor: `${color}10` }}
              >
                <Icon className="h-3 w-3" />
                {TYPE_LABEL[device.type] ?? device.type}
              </span>
              {device.catalogId.startsWith('UNIFI-') && (
                <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-400">
                  Ubiquiti
                </span>
              )}
            </div>

            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground">
              {device.name}
            </h1>

            {device.price !== undefined && (
              <div className="mt-3 text-xl font-semibold text-foreground">
                ¥{device.price}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                  参考价
                </span>
              </div>
            )}

            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              {device.description}
            </p>

            {/* Tags */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground/60">
                {MOUNT_LABEL[device.mountType] ?? device.mountType}
              </span>
              <span className="rounded-md bg-muted/30 px-2 py-0.5 font-mono text-[11px] text-muted-foreground/50">
                {(device.size[0] * 1000) | 0}×{(device.size[1] * 1000) | 0}×
                {(device.size[2] * 1000) | 0}mm
              </span>
            </div>

            {/* Quick specs */}
            <div className="mt-6 divide-y divide-border/15 border-y border-border/15">
              <SpecRow label="安装方式" value={MOUNT_LABEL[device.mountType] ?? device.mountType} />
              <SpecRow label="安装高度" value={`${device.defaultH}m`} />
              {device.lightType && (
                <SpecRow
                  label="光源类型"
                  value={LIGHT_TYPE_LABEL[device.lightType] ?? device.lightType}
                />
              )}
              {device.controlType && (
                <SpecRow
                  label="控制方式"
                  value={CONTROL_LABEL[device.controlType] ?? device.controlType}
                />
              )}
              {device.coverageRadius !== undefined && (
                <SpecRow label="覆盖半径" value={`${device.coverageRadius}m`} />
              )}
            </div>

            {/* Action */}
            <button
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
              onClick={() => onPlace(device)}
              type="button"
            >
              <Package className="h-4 w-4" />
              放入场景
            </button>
          </div>
        </div>

        {/* ── Extended specs ── */}
        <div className="border-t border-border/10 px-8 py-8">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <SpecSection icon={Package} title="基本参数">
              <SpecRow label="产品类型" value={TYPE_LABEL[device.type] ?? device.type} />
              <SpecRow label="安装方式" value={MOUNT_LABEL[device.mountType] ?? device.mountType} />
              <SpecRow
                label="尺寸 (mm)"
                value={`${(device.size[0] * 1000) | 0} × ${(device.size[1] * 1000) | 0} × ${(device.size[2] * 1000) | 0}`}
              />
              <SpecRow label="安装高度" value={`${device.defaultH}m`} />
              {device.price !== undefined && (
                <SpecRow label="参考价格" value={`¥${device.price}`} />
              )}
            </SpecSection>

            <SpecSection icon={Zap} title="功能参数">
              {device.lightType && (
                <SpecRow
                  label="光源类型"
                  value={LIGHT_TYPE_LABEL[device.lightType] ?? device.lightType}
                />
              )}
              {device.controlType && (
                <SpecRow
                  label="控制方式"
                  value={CONTROL_LABEL[device.controlType] ?? device.controlType}
                />
              )}
              {device.buttonCount !== undefined && (
                <SpecRow label="按键数" value={`${device.buttonCount} 键`} />
              )}
              {device.hasScreen !== undefined && (
                <SpecRow label="屏幕" value={device.hasScreen ? '有' : '无'} />
              )}
              {device.coverageRadius !== undefined && (
                <SpecRow label="覆盖半径" value={`${device.coverageRadius}m`} />
              )}
              {!device.lightType &&
                !device.controlType &&
                device.buttonCount === undefined &&
                device.hasScreen === undefined &&
                device.coverageRadius === undefined && (
                  <div className="py-3 text-center text-xs text-muted-foreground/40">
                    暂无扩展参数
                  </div>
                )}
            </SpecSection>

            {productMeta?.identity && (
              <SpecSection icon={Shield} title="产品信息">
                <SpecRow label="品牌" value={productMeta.identity.brand} />
                <SpecRow label="型号" value={productMeta.identity.model} />
                {productMeta.electrical && (
                  <>
                    <SpecRow
                      label="供电"
                      value={
                        POWER_SOURCE_LABEL[productMeta.electrical.power_source] ??
                        productMeta.electrical.power_source
                      }
                    />
                    <SpecRow label="电压" value={productMeta.electrical.voltage} />
                    {productMeta.electrical.power_consumption_w !== undefined && (
                      <SpecRow
                        label="功耗"
                        value={`${productMeta.electrical.power_consumption_w}W`}
                      />
                    )}
                  </>
                )}
                {productMeta.protocol && (
                  <SpecRow
                    label="协议"
                    value={
                      productMeta.protocol.supported?.join(' / ') ?? productMeta.protocol.primary
                    }
                  />
                )}
                {productMeta.commercial?.lifecycle_status && (
                  <SpecRow
                    label="状态"
                    value={
                      LIFECYCLE_LABEL[productMeta.commercial.lifecycle_status] ??
                      productMeta.commercial.lifecycle_status
                    }
                  />
                )}
              </SpecSection>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Device Card (borderless, thumbnail-first) ─────────────────────────────

function DeviceCard({
  device,
  onClick,
}: {
  device: DeviceDefinition
  onClick: () => void
}) {
  return (
    <button
      className="group flex flex-col overflow-hidden rounded-xl text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.04]"
      onClick={onClick}
      type="button"
    >
      {/* Thumbnail area — light, borderless */}
      <div className="flex h-[140px] items-center justify-center overflow-hidden rounded-xl bg-muted/30">
        <CardThumbnail device={device} />
      </div>

      {/* Info */}
      <div className="px-1 pb-1 pt-3">
        <h3 className="text-[13px] font-medium leading-snug text-foreground">{device.name}</h3>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/50">
          {device.price !== undefined && <span>¥{device.price}</span>}
          <span>{MOUNT_LABEL[device.mountType] ?? device.mountType}</span>
        </div>
      </div>
    </button>
  )
}

// ─── DeviceWorkspace ────────────────────────────────────────────────────────

export function DeviceWorkspace() {
  const nodes = useScene((s) => s.nodes)
  const setSelectedDevice = useEditor((s) => s.setSelectedDevice)
  const setPhase = useEditor((s) => s.setPhase)
  const setMode = useEditor((s) => s.setMode)
  const setTool = useEditor((s) => s.setTool)
  const setActiveSidebarPanel = useEditor((s) => s.setActiveSidebarPanel)

  const [activeSub, setActiveSub] = useState<Subsystem>('lighting')
  const [selected, setSelected] = useState<DeviceDefinition | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const placedCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of Object.values(nodes)) {
      const node = n as any
      if (node?.type === 'device') {
        const sub = node.subsystem as string
        counts[sub] = (counts[sub] ?? 0) + 1
      }
    }
    return counts
  }, [nodes])

  const devices = useMemo(() => {
    const all = (CATALOG_BY_SUBSYSTEM[activeSub] ?? []).filter((d) => !d.hiddenFromCatalog)
    if (!searchQuery.trim()) return all
    const q = searchQuery.toLowerCase()
    return all.filter(
      (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    )
  }, [activeSub, searchQuery])

  const handlePlace = useCallback(
    (device: DeviceDefinition) => {
      setSelectedDevice(device)
      setPhase('furnish')
      setMode('build')
      setTool('device')
      setActiveSidebarPanel('building')
    },
    [setSelectedDevice, setPhase, setMode, setTool, setActiveSidebarPanel],
  )

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ━━━ Left: Subsystem nav ━━━ */}
      <div className="flex w-[200px] shrink-0 flex-col border-r border-border/20">
        <div className="px-4 pb-1 pt-5">
          <h2 className="text-sm font-bold tracking-tight text-foreground">设备目录</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">浏览和管理设备库</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {SUBSYSTEM_ORDER.map((sub) => {
            const subColor = getSubsystemColor(sub)
            const label = getSubsystemLabel(sub)
            const SubIcon = SUBSYSTEM_ICONS[sub] ?? Cpu
            const isActive = activeSub === sub
            const catalogCount = (CATALOG_BY_SUBSYSTEM[sub] ?? []).filter(
              (d) => !d.hiddenFromCatalog,
            ).length
            const placed = placedCounts[sub] ?? 0

            return (
              <button
                key={sub}
                className={cn(
                  'group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all duration-150',
                  isActive ? 'bg-card shadow-sm' : 'hover:bg-card/60',
                )}
                onClick={() => {
                  setActiveSub(sub)
                  setSelected(null)
                  setSearchQuery('')
                }}
                type="button"
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all',
                    isActive ? 'scale-105' : 'opacity-50 group-hover:opacity-70',
                  )}
                  style={{ backgroundColor: `${subColor}15` }}
                >
                  <SubIcon className="h-4 w-4" style={{ color: subColor }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'text-[13px] font-medium leading-tight',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </div>
                  <div className="text-[11px] text-muted-foreground/40">
                    {catalogCount} 款
                    {placed > 0 && <span style={{ color: subColor }}> · {placed}</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </nav>

        <div className="border-t border-border/15 px-4 py-3">
          <div className="text-[11px] text-muted-foreground/40">
            全部设备 {Object.values(placedCounts).reduce((a, b) => a + b, 0)} 件已放入
          </div>
        </div>
      </div>

      {/* ━━━ Main content ━━━ */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <DeviceDetailView
            device={selected}
            onBack={() => setSelected(null)}
            onPlace={handlePlace}
          />
        ) : (
          <>
            {/* Search */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border/10 px-6 py-3">
              <div className="flex flex-1 items-center gap-2 rounded-xl bg-muted/30 px-3.5 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                <input
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`在 ${getSubsystemLabel(activeSub)} 中搜索...`}
                  value={searchQuery}
                />
                {searchQuery && (
                  <button
                    className="shrink-0 text-muted-foreground/30 hover:text-muted-foreground"
                    onClick={() => setSearchQuery('')}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground/40">{devices.length} 款</span>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {devices.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground/40">
                  {searchQuery ? '未找到匹配的设备' : '该分类暂无设备'}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5 xl:grid-cols-3 2xl:grid-cols-4">
                  {devices.map((device) => (
                    <DeviceCard
                      key={device.catalogId}
                      device={device}
                      onClick={() => setSelected(device)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
