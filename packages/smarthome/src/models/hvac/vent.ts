/**
 * 暖通子系统 - 空调出风口/温控模型
 *
 * 设计师规格：
 * - 四向出风口：300mm x 300mm x 50mm
 * - 材质：白色塑料边框 + 可调节格栅
 * - 动画：格栅摆动（制冷/制热模式）
 */

import * as THREE from 'three'
import type { DeviceModelDefinition } from '../core/types'
import { PRESET_MATERIALS, BRAND_PALETTE } from '../core/materials'

/**
 * 四向出风口
 */
export const vent4WayModel: DeviceModelDefinition = {
  renderType: 'vent-4way',
  displayName: '四向出风口',
  dimensions: [0.3, 0.05, 0.3],
  defaultHeight: 2.7,
  complexity: 'medium',

  parts: [
    // 外框
    {
      name: 'frame',
      geometry: () => new THREE.BoxGeometry(0.3, 0.02, 0.3),
      material: PRESET_MATERIALS.ventGrille(),
    },
    // 中心面板
    {
      name: 'center-panel',
      geometry: () => new THREE.BoxGeometry(0.08, 0.022, 0.08),
      material: PRESET_MATERIALS.ventGrille(),
      position: [0, 0.002, 0],
    },
    // 格栅条（横向）
    ...[
      { z: -0.08, rot: 0 },
      { z: 0, rot: 0 },
      { z: 0.08, rot: 0 },
    ].map(({ z }, i) => ({
      name: `grille-h-${i}`,
      geometry: () => new THREE.BoxGeometry(0.2, 0.008, 0.002),
      material: PRESET_MATERIALS.ventGrille(),
      position: [0, 0.01, z] as [number, number, number],
      animated: true as const,
      animationProperty: 'rotation' as const,
    })),
    // 格栅条（纵向）
    ...[
      { x: -0.08, rot: 0 },
      { x: 0, rot: 0 },
      { x: 0.08, rot: 0 },
    ].map(({ x }, i) => ({
      name: `grille-v-${i}`,
      geometry: () => new THREE.BoxGeometry(0.002, 0.008, 0.2),
      material: PRESET_MATERIALS.ventGrille(),
      position: [x, 0.01, 0] as [number, number, number],
      animated: true as const,
      animationProperty: 'rotation' as const,
    })),
  ],

  animations: [
    {
      type: 'rotate',
      duration: 2,
      keyframes: [
        { time: 0, value: -30 },
        { time: 0.5, value: 30 },
        { time: 1, value: -30 },
      ],
    },
  ],

  thumbnailColor: BRAND_PALETTE.hvac,
}

/**
 * 线型出风口
 */
export const ventLinearModel: DeviceModelDefinition = {
  renderType: 'vent-linear',
  displayName: '线型出风口',
  dimensions: [0.1, 0.04, 0.6],
  defaultHeight: 2.7,
  complexity: 'medium',

  parts: [
    {
      name: 'frame',
      geometry: () => new THREE.BoxGeometry(0.1, 0.02, 0.6),
      material: PRESET_MATERIALS.ventGrille(),
    },
    // 长条形格栅
    ...Array.from({ length: 5 }, (_, i) => ({
      name: `grille-${i}`,
      geometry: () => new THREE.BoxGeometry(0.002, 0.006, 0.55),
      material: PRESET_MATERIALS.ventGrille(),
      position: [-0.03 + i * 0.015, 0.01, 0] as [number, number, number],
      animated: true as const,
      animationProperty: 'rotation' as const,
    })),
  ],

  thumbnailColor: BRAND_PALETTE.hvac,
}

/**
 * 室内机（壁挂式）
 */
export const acUnitModel: DeviceModelDefinition = {
  renderType: 'ac-unit',
  displayName: '室内机',
  dimensions: [0.8, 0.25, 0.2],
  defaultHeight: 2.4,
  complexity: 'high',

  parts: [
    {
      name: 'body',
      geometry: () => new THREE.BoxGeometry(0.8, 0.25, 0.2),
      material: { type: 'plastic', color: '#ffffff', roughness: 0.5, metalness: 0.1 },
    },
    {
      name: 'display',
      geometry: () => new THREE.PlaneGeometry(0.15, 0.04),
      material: { type: 'glass', color: '#000000', roughness: 0.1, metalness: 0 },
      position: [0.25, 0.05, 0.101],
      rotation: [0, 0, 0],
    },
    {
      name: 'status-led',
      geometry: () => new THREE.CircleGeometry(0.003, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.hvac, 0.5),
      position: [0.32, 0.05, 0.102],
      rotation: [0, 0, 0],
    },
    // 出风口
    {
      name: 'vent',
      geometry: () => new THREE.BoxGeometry(0.7, 0.02, 0.08),
      material: { type: 'plastic', color: '#f0f0f0', roughness: 0.6, metalness: 0 },
      position: [0, -0.08, 0.06],
    },
  ],

  thumbnailColor: BRAND_PALETTE.hvac,
}

/**
 * 注册所有暖通模型
 */
export const hvacModels = [vent4WayModel, ventLinearModel, acUnitModel]
