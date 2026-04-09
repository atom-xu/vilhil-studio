/**
 * 网络子系统 - 无线 AP 模型
 *
 * 设计师规格：
 * - 吸顶 AP：200mm 直径，40mm 高度
 * - 面板 AP：86mm x 86mm 面板式
 * - 材质：白色塑料 + LED 状态指示
 * - 覆盖范围可视化：10m 半径
 */

import * as THREE from 'three'
import type { DeviceModelDefinition } from '../core/types'
import { PRESET_MATERIALS, BRAND_PALETTE } from '../core/materials'
import { createAPGeometry } from '../core/geometry'

/**
 * 吸顶 AP
 */
export const apCeilingModel: DeviceModelDefinition = {
  renderType: 'ap-ceiling',
  displayName: '吸顶 AP',
  dimensions: [0.2, 0.04, 0.2],
  defaultHeight: 2.7,
  complexity: 'medium',

  parts: [
    // 主体
    {
      name: 'body',
      geometry: () => {
        const { body } = createAPGeometry(0.1, 0.02)
        return body
      },
      material: PRESET_MATERIALS.apDevice(),
    },
    // LED 状态环
    {
      name: 'led-ring',
      geometry: () => {
        const { ledRing } = createAPGeometry(0.1, 0.02)
        return ledRing
      },
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.network, 0.5),
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
    // 中央指示灯
    {
      name: 'center-led',
      geometry: () => new THREE.CircleGeometry(0.01, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.active, 0.3),
      position: [0, 0.011, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
  ],

  lightEffects: [
    {
      partName: 'led-ring',
      stateMapping: { on: 'on', intensity: 'signalStrength' },
      baseIntensity: 0.8,
      color: BRAND_PALETTE.network,
    },
  ],

  coverage: {
    type: 'sphere',
    radius: 10,
    color: BRAND_PALETTE.network,
    opacity: 0.1,
  },

  thumbnailColor: BRAND_PALETTE.network,
}

/**
 * 面板 AP
 */
export const apWallModel: DeviceModelDefinition = {
  renderType: 'ap-wall',
  displayName: '面板 AP',
  dimensions: [0.086, 0.086, 0.03],
  defaultHeight: 2.4,
  complexity: 'medium',

  parts: [
    {
      name: 'base',
      geometry: () => new THREE.BoxGeometry(0.086, 0.086, 0.025),
      material: PRESET_MATERIALS.panelBody(),
    },
    {
      name: 'frame',
      geometry: () => new THREE.BoxGeometry(0.088, 0.088, 0.02),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, 0.003],
    },
    // 信号格栅（象征性）
    {
      name: 'grille',
      geometry: () => {
        // 简化为带孔的面板
        const plane = new THREE.PlaneGeometry(0.07, 0.07)
        return plane
      },
      material: { type: 'plastic', color: '#f5f5f5', roughness: 0.6, metalness: 0 },
      position: [0, 0, 0.014],
      rotation: [0, 0, 0],
    },
    {
      name: 'status-led',
      geometry: () => new THREE.CircleGeometry(0.003, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.network, 0.5),
      position: [0.035, -0.035, 0.016],
      rotation: [0, 0, 0],
    },
  ],

  coverage: {
    type: 'sphere',
    radius: 8,
    color: BRAND_PALETTE.network,
    opacity: 0.1,
  },

  thumbnailColor: BRAND_PALETTE.network,
}

/**
 * 路由器
 */
export const routerModel: DeviceModelDefinition = {
  renderType: 'router',
  displayName: '路由器',
  dimensions: [0.25, 0.05, 0.18],
  defaultHeight: 0.5,
  complexity: 'medium',

  parts: [
    {
      name: 'body',
      geometry: () => new THREE.BoxGeometry(0.25, 0.04, 0.18),
      material: PRESET_MATERIALS.apDevice(),
    },
    // 天线（4根）
    ...[
      { x: -0.08, z: -0.06, rot: -0.3 },
      { x: 0.08, z: -0.06, rot: 0.3 },
      { x: -0.08, z: 0.06, rot: -0.3 },
      { x: 0.08, z: 0.06, rot: 0.3 },
    ].map(({ x, z, rot }, i) => ({
      name: `antenna-${i}`,
      geometry: () => {
        const geo = new THREE.CylinderGeometry(0.003, 0.003, 0.12, 8)
        geo.translate(0, 0.06, 0)
        return geo
      },
      material: { type: 'plastic' as 'plastic', color: '#ffffff', roughness: 0.6, metalness: 0 },
      position: [x, 0.02, z] as [number, number, number],
      rotation: [rot, 0, 0] as [number, number, number],
    })),
    {
      name: 'status-leds',
      geometry: () => new THREE.PlaneGeometry(0.15, 0.005),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.network, 0.5) as any,
      position: [0, 0.021, -0.08] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    },
  ],

  thumbnailColor: BRAND_PALETTE.network,
}

/**
 * 注册所有网络模型
 */
export const networkModels = [apCeilingModel, apWallModel, routerModel]
