import * as THREE from 'three'

export type RenderPresetKey = 'opslab' | 'balanced' | 'showcase' | 'smooth' | 'night' | 'mist-warm-contrast'

export type RenderTheme = {
  envPresetDay: 'apartment' | 'city' | 'studio' | 'warehouse'
  envPresetNight: 'night' | 'city' | 'warehouse' | 'studio'
  skyDay: string
  skyNight: string
  groundDay: string
  groundNight: string
  sunColorDay: string
  sunColorNight: string
  wallColor: string
  furnitureColorDay: string
  furnitureColorNight: string
  windowColor: string
  doorColor: string
  capColorA: string
  capColorB: string
  capOpacity: number
  padColorDay: string
  padColorNight: string
  padEmissiveDay: string
  padEmissiveNight: string
  bgColorDay: string
  bgColorNight: string
  overlayDay: string
  overlayNight: string
  panelBgDay: string
  panelBgNight: string
  panelBorderDay: string
  panelBorderNight: string
  wallRoughness?: number
  wallMetalness?: number
  wallEnvMapIntensity?: number
  wallOpacity?: number
  wallMirrorRoughness?: number
  wallMirrorMetalness?: number
  furnitureRoughness?: number
  furnitureMetalness?: number
  furnitureInteractiveColor?: string
}

export type RenderPreset = {
  key: RenderPresetKey
  label: string
  description: string
  toneMapping: THREE.ToneMapping
  exposure: number
  envDay: number
  envNight: number
  hemiDay: number
  hemiNight: number
  sunDay: number
  sunNight: number
  shadowMapSize: number
  shadowRadiusDay: number
  shadowRadiusNight: number
  theme: RenderTheme
  styleExtensions?: RenderStyleExtensions
}

export type RenderStyleExtensions = {
  devicePalette?: {
    coreDay?: string
    coreNight?: string
    sensorDay?: string
    sensorNight?: string
    actuatorDay?: string
    actuatorNight?: string
    alert?: string
    success?: string
    offline?: string
  }
  modulePalette?: Partial<Record<ModuleStyleKey, string>>
  postFx?: {
    overlayOpacityDay?: number
    overlayOpacityNight?: number
    vignetteOpacityDay?: number
    vignetteOpacityNight?: number
    grainOpacityDay?: number
    grainOpacityNight?: number
  }
}

export type ModuleStyleKey =
  | 'overview'
  | 'architecture'
  | 'lighting'
  | 'panel'
  | 'sensor'
  | 'curtain'
  | 'hvac'
  | 'av'
  | 'security'
  | 'network'

export type StyleTokenLayer =
  | 'foundation'
  | 'material'
  | 'environment'
  | 'structure'
  | 'opening'
  | 'furniture'
  | 'floorpad'
  | 'fx'
  | 'ui'
  | 'module'
  | 'device'

export type StyleTokenType = 'color' | 'number' | 'enum' | 'gradient'

export type StyleTokenSpec = {
  id: string
  path: string
  label: string
  layer: StyleTokenLayer
  type: StyleTokenType
  dayNight?: 'day' | 'night' | 'both'
  min?: number
  max?: number
  step?: number
  description?: string
}

export const STYLE_TOKEN_CATALOG: StyleTokenSpec[] = [
  { id: 'exposure', path: 'exposure', label: '曝光', layer: 'foundation', type: 'number', min: 0.2, max: 2.5, step: 0.01 },
  { id: 'toneMapping', path: 'toneMapping', label: '色调映射', layer: 'foundation', type: 'enum' },
  { id: 'envDay', path: 'envDay', label: '环境强度 Day', layer: 'environment', type: 'number', dayNight: 'day', min: 0, max: 2, step: 0.01 },
  { id: 'envNight', path: 'envNight', label: '环境强度 Night', layer: 'environment', type: 'number', dayNight: 'night', min: 0, max: 2, step: 0.01 },
  { id: 'hemiDay', path: 'hemiDay', label: '半球光 Day', layer: 'environment', type: 'number', dayNight: 'day', min: 0, max: 2, step: 0.01 },
  { id: 'hemiNight', path: 'hemiNight', label: '半球光 Night', layer: 'environment', type: 'number', dayNight: 'night', min: 0, max: 2, step: 0.01 },
  { id: 'sunDay', path: 'sunDay', label: '主光 Day', layer: 'environment', type: 'number', dayNight: 'day', min: 0, max: 3, step: 0.01 },
  { id: 'sunNight', path: 'sunNight', label: '主光 Night', layer: 'environment', type: 'number', dayNight: 'night', min: 0, max: 3, step: 0.01 },

  { id: 'skyDay', path: 'theme.skyDay', label: '天空 Day', layer: 'environment', type: 'color', dayNight: 'day' },
  { id: 'skyNight', path: 'theme.skyNight', label: '天空 Night', layer: 'environment', type: 'color', dayNight: 'night' },
  { id: 'groundDay', path: 'theme.groundDay', label: '地面反照 Day', layer: 'environment', type: 'color', dayNight: 'day' },
  { id: 'groundNight', path: 'theme.groundNight', label: '地面反照 Night', layer: 'environment', type: 'color', dayNight: 'night' },
  { id: 'sunColorDay', path: 'theme.sunColorDay', label: '主光色 Day', layer: 'environment', type: 'color', dayNight: 'day' },
  { id: 'sunColorNight', path: 'theme.sunColorNight', label: '主光色 Night', layer: 'environment', type: 'color', dayNight: 'night' },

  { id: 'wallColor', path: 'theme.wallColor', label: '墙体主色', layer: 'structure', type: 'color', dayNight: 'both' },
  { id: 'wallRoughness', path: 'theme.wallRoughness', label: '墙体粗糙度', layer: 'material', type: 'number', min: 0, max: 1, step: 0.01 },
  { id: 'wallMetalness', path: 'theme.wallMetalness', label: '墙体金属度', layer: 'material', type: 'number', min: 0, max: 1, step: 0.01 },
  { id: 'wallEnvMapIntensity', path: 'theme.wallEnvMapIntensity', label: '墙体环境反射', layer: 'material', type: 'number', min: 0, max: 2, step: 0.01 },
  { id: 'wallOpacity', path: 'theme.wallOpacity', label: '墙体透明度', layer: 'material', type: 'number', min: 0, max: 1, step: 0.01 },
  { id: 'capColorA', path: 'theme.capColorA', label: '楼层顶边 A', layer: 'structure', type: 'color', dayNight: 'both' },
  { id: 'capColorB', path: 'theme.capColorB', label: '楼层顶边 B', layer: 'structure', type: 'color', dayNight: 'both' },
  { id: 'capOpacity', path: 'theme.capOpacity', label: '楼层顶边透明度', layer: 'structure', type: 'number', min: 0, max: 1, step: 0.01 },

  { id: 'windowColor', path: 'theme.windowColor', label: '窗体色', layer: 'opening', type: 'color', dayNight: 'both' },
  { id: 'doorColor', path: 'theme.doorColor', label: '门体色', layer: 'opening', type: 'color', dayNight: 'both' },

  { id: 'furnitureColorDay', path: 'theme.furnitureColorDay', label: '家具 Day', layer: 'furniture', type: 'color', dayNight: 'day' },
  { id: 'furnitureColorNight', path: 'theme.furnitureColorNight', label: '家具 Night', layer: 'furniture', type: 'color', dayNight: 'night' },
  { id: 'furnitureRoughness', path: 'theme.furnitureRoughness', label: '家具粗糙度', layer: 'material', type: 'number', min: 0, max: 1, step: 0.01 },
  { id: 'furnitureMetalness', path: 'theme.furnitureMetalness', label: '家具金属度', layer: 'material', type: 'number', min: 0, max: 1, step: 0.01 },
  { id: 'furnitureInteractiveColor', path: 'theme.furnitureInteractiveColor', label: '家具交互高亮', layer: 'furniture', type: 'color', dayNight: 'both' },

  { id: 'padColorDay', path: 'theme.padColorDay', label: '楼板 Day', layer: 'floorpad', type: 'color', dayNight: 'day' },
  { id: 'padColorNight', path: 'theme.padColorNight', label: '楼板 Night', layer: 'floorpad', type: 'color', dayNight: 'night' },
  { id: 'padEmissiveDay', path: 'theme.padEmissiveDay', label: '楼板发光 Day', layer: 'floorpad', type: 'color', dayNight: 'day' },
  { id: 'padEmissiveNight', path: 'theme.padEmissiveNight', label: '楼板发光 Night', layer: 'floorpad', type: 'color', dayNight: 'night' },

  { id: 'bgColorDay', path: 'theme.bgColorDay', label: '背景 Day', layer: 'environment', type: 'gradient', dayNight: 'day' },
  { id: 'bgColorNight', path: 'theme.bgColorNight', label: '背景 Night', layer: 'environment', type: 'gradient', dayNight: 'night' },
  { id: 'overlayDay', path: 'theme.overlayDay', label: '叠层 Day', layer: 'fx', type: 'gradient', dayNight: 'day' },
  { id: 'overlayNight', path: 'theme.overlayNight', label: '叠层 Night', layer: 'fx', type: 'gradient', dayNight: 'night' },

  { id: 'panelBgDay', path: 'theme.panelBgDay', label: '面板底 Day', layer: 'ui', type: 'color', dayNight: 'day' },
  { id: 'panelBgNight', path: 'theme.panelBgNight', label: '面板底 Night', layer: 'ui', type: 'color', dayNight: 'night' },
  { id: 'panelBorderDay', path: 'theme.panelBorderDay', label: '面板边框 Day', layer: 'ui', type: 'color', dayNight: 'day' },
  { id: 'panelBorderNight', path: 'theme.panelBorderNight', label: '面板边框 Night', layer: 'ui', type: 'color', dayNight: 'night' },

  { id: 'moduleLighting', path: 'styleExtensions.modulePalette.lighting', label: '模块色·灯光', layer: 'module', type: 'color' },
  { id: 'moduleSecurity', path: 'styleExtensions.modulePalette.security', label: '模块色·安防', layer: 'module', type: 'color' },
  { id: 'moduleNetwork', path: 'styleExtensions.modulePalette.network', label: '模块色·网络', layer: 'module', type: 'color' },

  { id: 'deviceCoreDay', path: 'styleExtensions.devicePalette.coreDay', label: '设备核心 Day', layer: 'device', type: 'color', dayNight: 'day' },
  { id: 'deviceCoreNight', path: 'styleExtensions.devicePalette.coreNight', label: '设备核心 Night', layer: 'device', type: 'color', dayNight: 'night' },
  { id: 'deviceSensorDay', path: 'styleExtensions.devicePalette.sensorDay', label: '设备传感 Day', layer: 'device', type: 'color', dayNight: 'day' },
  { id: 'deviceSensorNight', path: 'styleExtensions.devicePalette.sensorNight', label: '设备传感 Night', layer: 'device', type: 'color', dayNight: 'night' },
  { id: 'deviceActuatorDay', path: 'styleExtensions.devicePalette.actuatorDay', label: '设备执行 Day', layer: 'device', type: 'color', dayNight: 'day' },
  { id: 'deviceActuatorNight', path: 'styleExtensions.devicePalette.actuatorNight', label: '设备执行 Night', layer: 'device', type: 'color', dayNight: 'night' },
]

function getPathValue<T = unknown>(obj: unknown, path: string): T | undefined {
  const steps = path.split('.')
  let current: unknown = obj
  for (const step of steps) {
    if (typeof current !== 'object' || current === null || !(step in current)) return undefined
    current = (current as Record<string, unknown>)[step]
  }
  return current as T
}

function setPathValue(obj: Record<string, unknown>, path: string, value: unknown) {
  const steps = path.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]
    if (!step) continue
    if (i === steps.length - 1) {
      current[step] = value
      return
    }
    const next = current[step]
    if (typeof next === 'object' && next !== null) {
      current = next as Record<string, unknown>
      continue
    }
    const created: Record<string, unknown> = {}
    current[step] = created
    current = created
  }
}

export function getStyleTokenSnapshot(preset: RenderPreset) {
  const entries = STYLE_TOKEN_CATALOG.map((spec) => [spec.id, getPathValue(preset, spec.path)] as const)
  return Object.fromEntries(entries)
}

export function patchPresetByStyleTokens(preset: RenderPreset, patch: Partial<Record<string, unknown>>): RenderPreset {
  const next: RenderPreset = {
    ...preset,
    theme: { ...preset.theme },
    styleExtensions: {
      ...(preset.styleExtensions ?? {}),
      modulePalette: { ...(preset.styleExtensions?.modulePalette ?? {}) },
      devicePalette: { ...(preset.styleExtensions?.devicePalette ?? {}) },
      postFx: { ...(preset.styleExtensions?.postFx ?? {}) },
    },
  }
  for (const [id, value] of Object.entries(patch)) {
    const spec = STYLE_TOKEN_CATALOG.find((s) => s.id === id)
    if (!spec) continue
    setPathValue(next as unknown as Record<string, unknown>, spec.path, value)
  }
  return next
}

export const RENDER_PRESETS: Record<RenderPresetKey, RenderPreset> = {
  opslab: {
    key: 'opslab',
    label: 'OpenSpark',
    description: '白蓝孪生',
    toneMapping: THREE.AgXToneMapping,
    // 白天基线收敛 —— 之前 sun/env/hemi 叠加 + 半透墙让光透到室内地板，
    // global 视图下整层都被烧白。
    // 【AgX 校准】AgX 比 ACES 更宽松（knee ~6.0 vs 1.5），同样的 exposure 在 AgX 下
    // 等效曝光更亮。原 0.62 是为 ACES 调的，迁到 AgX 后过曝。砍到 0.40 = AgX 等效。
    exposure: 0.40,
    envDay: 0.30,
    envNight: 0.18,
    hemiDay: 0.22,
    hemiNight: 0.30,
    sunDay: 0.55,
    sunNight: 0.14,
    shadowMapSize: 1024,
    shadowRadiusDay: 2,
    shadowRadiusNight: 7,
    theme: {
      envPresetDay: 'apartment',
      envPresetNight: 'city',
      skyDay: '#dce6f6',
      skyNight: '#1a2d4f',
      groundDay: '#d7deea',
      groundNight: '#101a2d',
      sunColorDay: '#ffffff',
      sunColorNight: '#8fc3ff',
      wallColor: '#e9eff8',
      furnitureColorDay: '#c0bdb6',
      furnitureColorNight: '#9aa6b8',
      windowColor: '#7fb7ff',
      doorColor: '#b8cce6',
      capColorA: '#2e87e8',
      capColorB: '#93c4ff',
      capOpacity: 0.5,
      padColorDay: '#c8cacc',
      padColorNight: '#2b3a55',
      padEmissiveDay: '#bcbec0',
      padEmissiveNight: '#6da7ea',
      bgColorDay: '#e3e9f3',
      bgColorNight: '#0c1422',
      overlayDay: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))',
      overlayNight: 'linear-gradient(180deg, rgba(78,140,230,0.16), rgba(9,16,28,0.12))',
      panelBgDay: 'rgba(255,255,255,0.92)',
      panelBgNight: 'rgba(18,28,46,0.72)',
      panelBorderDay: 'rgba(103,140,192,0.35)',
      panelBorderNight: 'rgba(127,171,235,0.35)',
    },
  },
  balanced: {
    key: 'balanced',
    label: '平衡',
    description: '居住演示',
    toneMapping: THREE.AgXToneMapping,
    exposure: 0.55,
    envDay: 0.52,
    envNight: 0.15,
    hemiDay: 0.45,
    hemiNight: 0.4,
    sunDay: 1.2,
    sunNight: 0.15,
    shadowMapSize: 1024,
    shadowRadiusDay: 2,
    shadowRadiusNight: 8,
    theme: {
      envPresetDay: 'apartment',
      envPresetNight: 'night',
      skyDay: '#d4e8ff',
      skyNight: '#1a2a3a',
      groundDay: '#c8b890',
      groundNight: '#0e1820',
      sunColorDay: '#fff4e0',
      sunColorNight: '#7bb8e8',
      wallColor: '#ccc4b8',
      furnitureColorDay: '#c4beb4',
      furnitureColorNight: '#9da8b8',
      windowColor: '#b8d0e8',
      doorColor: '#c8bfb0',
      capColorA: '#006FFF',
      capColorB: '#85BCFF',
      capOpacity: 0.5,
      padColorDay: '#c8c4bc',
      padColorNight: '#30333c',
      padEmissiveDay: '#c8c4bc',
      padEmissiveNight: '#8a8890',
      // 背景改垂直渐变，对齐 Ubiquiti 蓝白语言（HTML v2 sky 变量）
      // 白天：顶略深浅灰蓝 → 底更亮；夜间：深蓝灰渐变，不纯黑带灰感
      bgColorDay: 'linear-gradient(180deg, #CBD9EC 0%, #EAF0F7 100%)',
      bgColorNight: 'linear-gradient(180deg, #0F1525 0%, #1A2232 100%)',
      overlayDay: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.00))',
      overlayNight: 'linear-gradient(180deg, rgba(90,140,210,0.12), rgba(6,12,28,0.05))',
      panelBgDay: 'rgba(255,255,255,0.72)',
      panelBgNight: 'rgba(10,18,35,0.62)',
      panelBorderDay: 'rgba(0,0,0,0.08)',
      panelBorderNight: 'rgba(120,170,255,0.28)',
    },
  },
  showcase: {
    key: 'showcase',
    label: '命令中心',
    description: '数字孪生驾驶舱',
    toneMapping: THREE.AgXToneMapping,
    exposure: 0.60,
    envDay: 0.75,
    envNight: 0.3,
    hemiDay: 0.38,
    hemiNight: 0.3,
    sunDay: 1.7,
    sunNight: 0.24,
    shadowMapSize: 1024,
    shadowRadiusDay: 4,
    shadowRadiusNight: 10,
    theme: {
      envPresetDay: 'city',
      envPresetNight: 'city',
      skyDay: '#96c2f8',
      skyNight: '#081a36',
      groundDay: '#7392bd',
      groundNight: '#041026',
      sunColorDay: '#f7fbff',
      sunColorNight: '#6ad8ff',
      wallColor: '#9eb5cc',
      furnitureColorDay: '#b6c6d3',
      furnitureColorNight: '#7f97ac',
      windowColor: '#5ed2ff',
      doorColor: '#84a0bb',
      capColorA: '#14ccff',
      capColorB: '#76ffe1',
      capOpacity: 0.97,
      padColorDay: '#7fa5c5',
      padColorNight: '#122845',
      padEmissiveDay: '#82cbff',
      padEmissiveNight: '#2cb8ff',
      bgColorDay: '#5f83ad',
      bgColorNight: '#020c22',
      overlayDay: 'repeating-linear-gradient(90deg, rgba(43,145,238,0.08) 0 1px, transparent 1px 22px), linear-gradient(170deg, rgba(145,228,255,0.24), rgba(10,32,67,0.02) 62%)',
      overlayNight: 'repeating-linear-gradient(90deg, rgba(36,173,255,0.14) 0 1px, transparent 1px 24px), linear-gradient(170deg, rgba(44,185,255,0.24), rgba(2,10,26,0.28) 66%)',
      panelBgDay: 'rgba(230,246,255,0.76)',
      panelBgNight: 'rgba(4,20,47,0.7)',
      panelBorderDay: 'rgba(34,113,210,0.34)',
      panelBorderNight: 'rgba(91,200,255,0.52)',
    },
  },
  smooth: {
    key: 'smooth',
    label: '巡检轻量',
    description: '移动交互优先',
    toneMapping: THREE.NeutralToneMapping,
    exposure: 0.50,
    envDay: 0.3,
    envNight: 0.14,
    hemiDay: 0.52,
    hemiNight: 0.45,
    sunDay: 0.9,
    sunNight: 0.12,
    shadowMapSize: 1024,
    shadowRadiusDay: 1,
    shadowRadiusNight: 6,
    theme: {
      envPresetDay: 'warehouse',
      envPresetNight: 'night',
      skyDay: '#e4e9f0',
      skyNight: '#1d252f',
      groundDay: '#c3c8cf',
      groundNight: '#181e27',
      sunColorDay: '#fff5df',
      sunColorNight: '#8ba5c0',
      wallColor: '#cfd1d3',
      furnitureColorDay: '#c9c9c6',
      furnitureColorNight: '#8d95a2',
      windowColor: '#c2d0de',
      doorColor: '#c4bdb2',
      capColorA: '#9fb1c8',
      capColorB: '#dee6f0',
      capOpacity: 0.78,
      padColorDay: '#d0d0cc',
      padColorNight: '#2b313a',
      padEmissiveDay: '#d4d6d3',
      padEmissiveNight: '#7a8391',
      bgColorDay: '#b8c1cc',
      bgColorNight: '#0f141d',
      overlayDay: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.00))',
      overlayNight: 'linear-gradient(180deg, rgba(188,199,214,0.1), rgba(17,21,29,0.06))',
      panelBgDay: 'rgba(255,255,255,0.8)',
      panelBgNight: 'rgba(22,27,36,0.68)',
      panelBorderDay: 'rgba(76,86,101,0.16)',
      panelBorderNight: 'rgba(152,167,188,0.3)',
    },
  },
  night: {
    key: 'night',
    label: '夜间运维',
    description: '告警与监控',
    toneMapping: THREE.AgXToneMapping,
    exposure: 0.45,
    envDay: 0.44,
    envNight: 0.42,
    hemiDay: 0.28,
    hemiNight: 0.24,
    sunDay: 1.05,
    sunNight: 0.34,
    shadowMapSize: 1024,
    shadowRadiusDay: 3,
    shadowRadiusNight: 9,
    theme: {
      envPresetDay: 'studio',
      envPresetNight: 'night',
      skyDay: '#c4d0ff',
      skyNight: '#1f1230',
      groundDay: '#927fac',
      groundNight: '#10091b',
      sunColorDay: '#efe6ff',
      sunColorNight: '#e773ff',
      wallColor: '#b39fc0',
      furnitureColorDay: '#baa7c7',
      furnitureColorNight: '#7e6f95',
      windowColor: '#8d72c8',
      doorColor: '#87759a',
      capColorA: '#8e44ff',
      capColorB: '#ff5db1',
      capOpacity: 0.96,
      padColorDay: '#ab96be',
      padColorNight: '#281638',
      padEmissiveDay: '#af99c7',
      padEmissiveNight: '#c459ff',
      bgColorDay: '#7f6b9f',
      bgColorNight: '#0d0616',
      overlayDay: 'linear-gradient(180deg, rgba(230,205,255,0.16), rgba(255,255,255,0.00))',
      overlayNight: 'repeating-linear-gradient(0deg, rgba(209,96,255,0.09) 0 2px, transparent 2px 14px), linear-gradient(180deg, rgba(193,69,255,0.26), rgba(10,6,18,0.16))',
      panelBgDay: 'rgba(255,240,255,0.76)',
      panelBgNight: 'rgba(25,10,35,0.72)',
      panelBorderDay: 'rgba(136,80,199,0.31)',
      panelBorderNight: 'rgba(245,130,255,0.54)',
    },
  },
  'mist-warm-contrast': {
    key: 'mist-warm-contrast',
    label: '晨雾暖层',
    description: '适合白天展示的数字孪生户型风格：墙体冷透、家具偏暖、背景更淡、边线更亮，拉开建筑/家居/背景层次。',
    toneMapping: THREE.AgXToneMapping,
    exposure: 0.65,
    envDay: 0.92,
    envNight: 0.26,
    hemiDay: 0.58,
    hemiNight: 0.14,
    sunDay: 1.12,
    sunNight: 0.22,
    shadowMapSize: 2048,
    shadowRadiusDay: 2.4,
    shadowRadiusNight: 1.2,
    theme: {
      // 当前 drei 预设不支持 softStudio/softNight，映射到最接近的 studio/night
      envPresetDay: 'studio',
      envPresetNight: 'night',
      skyDay: '#F6F9FE',
      skyNight: '#11192B',
      groundDay: '#EEF3FA',
      groundNight: '#151D30',
      sunColorDay: '#FFF6E8',
      sunColorNight: '#C9D8FF',
      wallColor: '#EAF2FB',
      furnitureColorDay: '#D9D2C7',
      furnitureColorNight: '#92A3BE',
      windowColor: '#EFF7FF',
      doorColor: '#D8C4A6',
      capColorA: '#7FAEFF',
      capColorB: '#AFCBFF',
      capOpacity: 0.90,
      padColorDay: '#F3EFE8',
      padColorNight: '#2B3344',
      padEmissiveDay: '#F7F1E4',
      padEmissiveNight: '#425A86',
      bgColorDay: '#F7F9FD',
      bgColorNight: '#0E1422',
      overlayDay: 'rgba(127, 174, 255, 0.08)',
      overlayNight: 'rgba(127, 174, 255, 0.14)',
      panelBgDay: 'rgba(255, 255, 255, 0.86)',
      panelBgNight: 'rgba(20, 28, 44, 0.86)',
      panelBorderDay: 'rgba(127, 174, 255, 0.20)',
      panelBorderNight: 'rgba(127, 174, 255, 0.28)',
    },
  },
}

export function parsePresetKey(value: string | null): RenderPresetKey {
  if (value === 'opslab' || value === 'showcase' || value === 'smooth' || value === 'night' || value === 'balanced' || value === 'mist-warm-contrast') return value
  return 'opslab'
}

export function getDemoChromePalette(isNight: boolean, preset?: RenderPreset) {
  const bg = preset ? (isNight ? preset.theme.panelBgNight : preset.theme.panelBgDay) : (isNight ? '#0E1C33' : '#FFFFFF')
  // 页面框线固定中性值，避免被 preset 调色器联动影响整页层级边界。
  // panelBorder* 仍保留在 theme 中，供后续做“局部卡片边框”单独使用。
  const border = isNight ? '#274A73' : '#D7E5F7'
  return isNight
    ? {
        bg,
        border,
        text: '#E8F2FF',
        text2: '#B8CCE7',
        text3: '#8FA9CA',
        track: '#162A47',
        chip: 'rgba(52,127,255,0.2)',
        chipBorder: 'rgba(100,166,255,0.5)',
        tile: 'rgba(182,216,255,0.08)',
        hover: 'rgba(114,172,255,0.12)',
      }
    : {
        bg,
        border,
        text: '#0E223D',
        text2: '#37557F',
        text3: '#6D87A9',
        track: '#EAF2FC',
        chip: 'rgba(0,111,255,0.12)',
        chipBorder: 'rgba(0,111,255,0.36)',
        tile: 'rgba(17,89,190,0.06)',
        hover: 'rgba(0,111,255,0.08)',
      }
}

export function getPillColors(presetKey: RenderPresetKey, isNight: boolean, on: boolean) {
  if (presetKey === 'opslab') {
    return isNight
      ? {
          bg: on ? 'rgba(96,170,255,0.24)' : 'rgba(96,170,255,0.10)',
          border: on ? 'rgba(130,192,255,0.55)' : 'rgba(130,192,255,0.28)',
          text: on ? 'rgba(231,244,255,0.95)' : 'rgba(170,198,230,0.68)',
          meta: on ? 'rgba(188,224,255,0.82)' : 'rgba(141,169,199,0.48)',
        }
      : {
          bg: on ? 'rgba(44,132,235,0.24)' : 'rgba(44,132,235,0.10)',
          border: on ? 'rgba(64,150,245,0.48)' : 'rgba(64,150,245,0.24)',
          text: on ? 'rgba(19,60,110,0.95)' : 'rgba(64,98,142,0.78)',
          meta: on ? 'rgba(25,92,160,0.75)' : 'rgba(88,122,162,0.58)',
        }
  }

  if (presetKey === 'showcase') {
    return isNight
      ? {
          bg: on ? 'rgba(43,188,255,0.20)' : 'rgba(43,188,255,0.10)',
          border: on ? 'rgba(84,229,255,0.58)' : 'rgba(84,229,255,0.28)',
          text: on ? 'rgba(218,250,255,0.95)' : 'rgba(168,225,242,0.65)',
          meta: on ? 'rgba(178,241,255,0.78)' : 'rgba(132,189,206,0.48)',
        }
      : {
          bg: on ? 'rgba(40,137,237,0.30)' : 'rgba(40,137,237,0.14)',
          border: on ? 'rgba(73,184,255,0.66)' : 'rgba(73,184,255,0.36)',
          text: on ? 'rgba(236,250,255,0.95)' : 'rgba(162,205,230,0.72)',
          meta: on ? 'rgba(199,240,255,0.84)' : 'rgba(124,161,183,0.58)',
        }
  }

  if (presetKey === 'night') {
    return isNight
      ? {
          bg: on ? 'rgba(191,98,255,0.22)' : 'rgba(191,98,255,0.10)',
          border: on ? 'rgba(242,128,255,0.56)' : 'rgba(209,124,255,0.3)',
          text: on ? 'rgba(255,231,255,0.95)' : 'rgba(224,177,242,0.62)',
          meta: on ? 'rgba(253,194,255,0.78)' : 'rgba(177,131,191,0.46)',
        }
      : {
          bg: on ? 'rgba(165,101,255,0.34)' : 'rgba(165,101,255,0.16)',
          border: on ? 'rgba(244,145,255,0.66)' : 'rgba(198,124,238,0.38)',
          text: on ? 'rgba(255,237,255,0.95)' : 'rgba(222,178,236,0.72)',
          meta: on ? 'rgba(245,188,255,0.84)' : 'rgba(175,135,189,0.56)',
        }
  }

  if (presetKey === 'smooth') {
    return isNight
      ? {
          bg: on ? 'rgba(244,246,250,0.18)' : 'rgba(244,246,250,0.08)',
          border: on ? 'rgba(222,226,236,0.52)' : 'rgba(182,188,202,0.28)',
          text: on ? 'rgba(249,250,252,0.93)' : 'rgba(198,204,216,0.6)',
          meta: on ? 'rgba(224,230,241,0.72)' : 'rgba(142,149,164,0.42)',
        }
      : {
          bg: on ? 'rgba(230,233,238,0.56)' : 'rgba(205,211,220,0.34)',
          border: on ? 'rgba(181,189,202,0.72)' : 'rgba(160,168,182,0.46)',
          text: on ? 'rgba(50,56,66,0.94)' : 'rgba(82,90,103,0.64)',
          meta: on ? 'rgba(78,85,96,0.75)' : 'rgba(96,104,117,0.46)',
        }
  }

  return isNight
    ? {
        bg: on ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)',
        border: on ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.13)',
        text: on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.42)',
        meta: on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)',
      }
    : {
        bg: on ? 'rgba(245,158,11,0.35)' : 'rgba(180,120,30,0.20)',
        border: on ? 'rgba(217,119,6,0.6)' : 'rgba(180,120,30,0.35)',
        text: on ? 'rgba(60,30,0,0.95)' : 'rgba(90,55,15,0.55)',
        meta: on ? 'rgba(80,40,0,0.7)' : 'rgba(100,65,20,0.35)',
      }
}


// ─── 太阳位置计算（无需第三方库）────────────────────────────────────────────
//
//  坐标约定（Pascal 户型标准朝向：上北下南）：
//    +X = 东    -X = 西
//    +Z = 北    -Z = 南   ← 平面图"上"对应 3D +Z
//    +Y = 上
//
//  参数：
//    hour      本地时间（如 8.0 = 早8点，14.5 = 下午2点半）
//    lat       纬度，默认 31.2°N（上海）
//    dayOfYear 一年第几天，默认 100（约4月中旬）
//
//  返回：朝太阳方向的单位向量，日出前/日落后返回 null
//
export function computeSunDirection(
  hour: number,
  lat = 31.2,
  dayOfYear = 100,
): [number, number, number] | null {
  const latR  = (lat * Math.PI) / 180
  // 太阳赤纬
  const declR = (23.45 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365)
  // 时角：正午=0，每小时±15°
  const ha    = ((hour - 12) * 15 * Math.PI) / 180

  // 高度角
  const sinAlt = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(ha)
  const alt    = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  if (alt <= 0.04) return null  // 低于地平线

  const cosAlt = Math.cos(alt)

  // 方位角（从正南顺时针，正值=西，负值=东）
  const cosAzRaw = (Math.sin(declR) - Math.sin(alt) * Math.sin(latR)) / (cosAlt * Math.cos(latR) + 1e-9)
  const cosAz    = Math.max(-1, Math.min(1, cosAzRaw))
  // 上午太阳在东（负方向），下午在西（正方向）
  const azFromSouth = hour <= 12 ? -Math.acos(cosAz) : Math.acos(cosAz)

  // 转换为世界坐标（+Z=北, +X=东）
  const x =  -Math.sin(azFromSouth) * cosAlt   // 东=+X, 西=-X（注意：方位角从南顺时针为正，东=-sin）
  const z =  -Math.cos(azFromSouth) * cosAlt   // 北=+Z, 南=-Z（正午太阳在南=−Z方向）
  const y =   Math.sin(alt)
  return [x, y, z]
}

// 示例：上午8点 上海纬度 春季 → 东偏北低角度阳光
// 月光方向：满月近似 = 太阳位置偏移 12 小时（月亮与太阳在天球上相对）
export function computeMoonDirection(hour: number): [number, number, number] {
  const shifted = (hour + 12) % 24
  const d = computeSunDirection(shifted)
  if (d) return d
  return [0.3, 0.5, -0.4]  // fallback
}

// 获取当前实际小时数（含分钟小数）
export function getRealHour() {
  const now = new Date()
  return now.getHours() + now.getMinutes() / 60
}
