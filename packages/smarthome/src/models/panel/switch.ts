/**
 * 面板子系统 - 开关/场景面板模型
 *
 * 设计师规格：
 * - 尺寸：86mm x 86mm x 8mm（标准86型面板）
 * - 安装：墙面开关位
 * - 材质：塑料面板 + 金属边框 + LED 指示
 */

import * as THREE from 'three'
import type { DeviceModelDefinition } from '../core/types'
import { PRESET_MATERIALS, BRAND_PALETTE } from '../core/materials'
import { createRoundedRectGeometry, createSwitchButtonsGeometry, createKnobGeometry } from '../core/geometry'

const PANEL_SIZE: [number, number, number] = [0.086, 0.086, 0.008]

/**
 * 创建开关面板模型
 */
function createSwitchModel(keyCount: number): DeviceModelDefinition {
  const renderTypes = ['switch-1key', 'switch-2key', 'switch-3key'] as const
  const renderType = renderTypes[keyCount - 1] || 'switch-1key'

  const buttonGeometries = createSwitchButtonsGeometry(keyCount, 0.086, 0.086)

  const parts: DeviceModelDefinition['parts'] = [
    // 底座
    {
      name: 'base',
      geometry: () => new THREE.BoxGeometry(0.086, 0.086, 0.006),
      material: PRESET_MATERIALS.panelBody(),
    },
    // 边框
    {
      name: 'frame',
      geometry: () => {
        const frame = new THREE.BoxGeometry(0.088, 0.088, 0.005)
        return frame
      },
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, 0.003],
    },
  ]

  // 添加按钮
  buttonGeometries.forEach((geo, index) => {
    parts.push({
      name: `button-${index}`,
      geometry: () => geo,
      material: PRESET_MATERIALS.panelButton(BRAND_PALETTE.panel),
      animated: true,
      animationProperty: 'position',
    })
  })

  // 添加 LED 指示灯
  for (let i = 0; i < keyCount; i++) {
    const buttonHeight = (0.086 - 0.008 * (keyCount + 1)) / keyCount
    const yOffset = (0.086 / 2) - 0.008 - buttonHeight / 2 - i * (buttonHeight + 0.008)

    parts.push({
      name: `led-${i}`,
      geometry: () => new THREE.CircleGeometry(0.003, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.active, 0),
      position: [0.035, yOffset, 0.005],
      rotation: [0, 0, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    })
  }

  return {
    renderType,
    displayName: `${keyCount}路开关`,
    dimensions: PANEL_SIZE,
    defaultHeight: 1.35,
    complexity: 'medium',
    parts,
    lightEffects: Array.from({ length: keyCount }, (_, i) => ({
      partName: `led-${i}`,
      stateMapping: { on: 'on' },
      baseIntensity: 0.8,
      color: BRAND_PALETTE.active,
    })),
    thumbnailColor: BRAND_PALETTE.panel,
  }
}

/**
 * 单路开关
 */
export const switch1KeyModel = createSwitchModel(1)

/**
 * 双路开关
 */
export const switch2KeyModel = createSwitchModel(2)

/**
 * 三路开关
 */
export const switch3KeyModel = createSwitchModel(3)

/**
 * 调光旋钮
 */
export const dimmerKnobModel: DeviceModelDefinition = {
  renderType: 'dimmer-knob',
  displayName: '调光旋钮',
  dimensions: [0.086, 0.086, 0.012],
  defaultHeight: 1.35,
  complexity: 'medium',

  parts: [
    {
      name: 'base',
      geometry: () => new THREE.BoxGeometry(0.086, 0.086, 0.008),
      material: PRESET_MATERIALS.panelBody(),
    },
    {
      name: 'frame',
      geometry: () => new THREE.BoxGeometry(0.088, 0.088, 0.006),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, 0.004],
    },
    {
      name: 'knob-base',
      geometry: () => {
        const { base } = createKnobGeometry(0.025, 0.015)
        return base
      },
      material: PRESET_MATERIALS.panelButton(BRAND_PALETTE.panel),
      position: [0, 0, 0.009],
    },
    {
      name: 'knob-grip',
      geometry: () => {
        const { grip } = createKnobGeometry(0.025, 0.015)
        return grip
      },
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, 0.009],
      animated: true,
      animationProperty: 'rotation',
    },
    {
      name: 'led-ring',
      geometry: () => new THREE.RingGeometry(0.028, 0.03, 32),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.panel, 0.3),
      position: [0, 0, 0.016],
      rotation: [0, 0, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
  ],

  thumbnailColor: BRAND_PALETTE.panel,
}

/**
 * 场景面板（4键）
 */
export const scene4KeyModel: DeviceModelDefinition = {
  renderType: 'scene-4key',
  displayName: '四键场景面板',
  dimensions: [0.086, 0.146, 0.008],
  defaultHeight: 1.35,
  complexity: 'medium',

  parts: [
    {
      name: 'base',
      geometry: () => new THREE.BoxGeometry(0.086, 0.146, 0.006),
      material: PRESET_MATERIALS.panelBody(),
    },
    {
      name: 'frame',
      geometry: () => new THREE.BoxGeometry(0.088, 0.148, 0.005),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, 0.003],
    },
    // 4个方形按钮 2x2 布局
    ...[
      [-0.02, 0.03],
      [0.02, 0.03],
      [-0.02, -0.03],
      [0.02, -0.03],
    ].map(([x, y], i) => ({
      name: `button-${i}`,
      geometry: () => createRoundedRectGeometry(0.032, 0.032, 0.001, 0.004),
      material: PRESET_MATERIALS.panelButton(BRAND_PALETTE.panel),
      position: [x, y, 0.005] as [number, number, number],
      animated: true as const,
      animationProperty: 'position' as const,
    })),
    // LED 指示灯
    ...([
      [-0.02, 0.03],
      [0.02, 0.03],
      [-0.02, -0.03],
      [0.02, -0.03],
    ] as [number, number][]).map(([x, y], i) => ({
      name: `led-${i}`,
      geometry: () => new THREE.CircleGeometry(0.002, 8),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.active, 0),
      position: [(x ?? 0) + 0.012, (y ?? 0) + 0.012, 0.007] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      animated: true as const,
      animationProperty: 'material.emissiveIntensity' as const,
    })),
  ],

  thumbnailColor: BRAND_PALETTE.panel,
}

/**
 * 场景面板（6键）
 */
export const scene6KeyModel: DeviceModelDefinition = {
  renderType: 'scene-6key',
  displayName: '六键场景面板',
  dimensions: [0.086, 0.146, 0.008],
  defaultHeight: 1.35,
  complexity: 'medium',

  parts: [
    {
      name: 'base',
      geometry: () => new THREE.BoxGeometry(0.086, 0.146, 0.006),
      material: PRESET_MATERIALS.panelBody(),
    },
    {
      name: 'frame',
      geometry: () => new THREE.BoxGeometry(0.088, 0.148, 0.005),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, 0.003],
    },
    // 6个按钮 2x3 布局
    ...[
      [-0.02, 0.05],
      [0.02, 0.05],
      [-0.02, 0],
      [0.02, 0],
      [-0.02, -0.05],
      [0.02, -0.05],
    ].map(([x, y], i) => ({
      name: `button-${i}`,
      geometry: () => createRoundedRectGeometry(0.032, 0.032, 0.001, 0.004),
      material: PRESET_MATERIALS.panelButton(BRAND_PALETTE.panel),
      position: [x, y, 0.005] as [number, number, number],
      animated: true as const,
      animationProperty: 'position' as const,
    })),
  ],

  thumbnailColor: BRAND_PALETTE.panel,
}

/**
 * 温控面板
 */
export const thermostatModel: DeviceModelDefinition = {
  renderType: 'thermostat',
  displayName: '温控面板',
  dimensions: [0.086, 0.086, 0.012],
  defaultHeight: 1.35,
  complexity: 'high',

  parts: [
    {
      name: 'base',
      geometry: () => new THREE.BoxGeometry(0.086, 0.086, 0.008),
      material: PRESET_MATERIALS.panelBody(),
    },
    {
      name: 'frame',
      geometry: () => new THREE.BoxGeometry(0.088, 0.088, 0.006),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, 0.004],
    },
    {
      name: 'screen',
      geometry: () => new THREE.PlaneGeometry(0.07, 0.06),
      material: PRESET_MATERIALS.thermostatScreen(),
      position: [0, 0.005, 0.009],
      rotation: [0, 0, 0],
    },
    {
      name: 'status-led',
      geometry: () => new THREE.CircleGeometry(0.003, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.hvac, 0.5),
      position: [0, -0.03, 0.01],
      rotation: [0, 0, 0],
    },
  ],

  thumbnailColor: BRAND_PALETTE.hvac,
}

/**
 * 注册所有面板模型
 */
export const panelModels = [
  switch1KeyModel,
  switch2KeyModel,
  switch3KeyModel,
  dimmerKnobModel,
  scene4KeyModel,
  scene6KeyModel,
  thermostatModel,
]
