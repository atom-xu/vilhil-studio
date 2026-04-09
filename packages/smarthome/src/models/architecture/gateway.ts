/**
 * 架构子系统 - 网关/主机模型
 *
 * 设计师规格：
 * - KNX 网关：90mm x 60mm x 72mm（标准 DIN 导轨）
 * - 智能主机：300mm x 100mm x 400mm（机柜式）
 * - 材质：工业灰金属/塑料
 */

import * as THREE from 'three'
import type { DeviceModelDefinition } from '../core/types'
import { PRESET_MATERIALS, BRAND_PALETTE } from '../core/materials'

/**
 * KNX 网关
 */
export const gatewayKNXModel: DeviceModelDefinition = {
  renderType: 'gateway',
  displayName: 'KNX 网关',
  dimensions: [0.09, 0.06, 0.072],
  defaultHeight: 1.8,
  complexity: 'medium',

  parts: [
    // 主体
    {
      name: 'body',
      geometry: () => new THREE.BoxGeometry(0.09, 0.06, 0.072),
      material: PRESET_MATERIALS.gateway(),
    },
    // 前面板
    {
      name: 'front-panel',
      geometry: () => new THREE.PlaneGeometry(0.085, 0.055),
      material: { type: 'plastic', color: '#f0f0f0', roughness: 0.5, metalness: 0.1 },
      position: [0, 0, 0.037],
      rotation: [0, 0, 0],
    },
    // LED 指示灯排
    ...['power', 'knx', 'ip', 'status'].map((name, i) => ({
      name: `led-${name}`,
      geometry: () => new THREE.CircleGeometry(0.003, 16),
      material: PRESET_MATERIALS.ledEmitter(
        i === 0 ? BRAND_PALETTE.active : BRAND_PALETTE.architecture,
        i === 0 ? 0.5 : 0
      ),
      position: [-0.035 + i * 0.023, 0.02, 0.038] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      animated: true as const,
      animationProperty: 'material.emissiveIntensity' as const,
    })),
    // 编程按钮
    {
      name: 'prog-button',
      geometry: () => new THREE.CylinderGeometry(0.004, 0.004, 0.005, 16),
      material: { type: 'plastic', color: '#e0e0e0', roughness: 0.6, metalness: 0 },
      position: [0.03, -0.018, 0.038],
      rotation: [Math.PI / 2, 0, 0],
    },
  ],

  thumbnailColor: BRAND_PALETTE.architecture,
}

/**
 * 智能主机
 */
export const smartHostModel: DeviceModelDefinition = {
  renderType: 'smart-host',
  displayName: '智能主机',
  dimensions: [0.3, 0.1, 0.4],
  defaultHeight: 1.8,
  complexity: 'high',

  parts: [
    {
      name: 'chassis',
      geometry: () => new THREE.BoxGeometry(0.3, 0.1, 0.4),
      material: { type: 'metal', color: BRAND_PALETTE.darkGray, roughness: 0.4, metalness: 0.8 },
    },
    // 前面板通风孔（示意）
    {
      name: 'vent-panel',
      geometry: () => new THREE.PlaneGeometry(0.25, 0.08),
      material: { type: 'metal', color: '#1a1a1a', roughness: 0.6, metalness: 0.5 },
      position: [0, 0, 0.201],
      rotation: [0, 0, 0],
    },
    // 状态灯带
    {
      name: 'status-strip',
      geometry: () => new THREE.PlaneGeometry(0.2, 0.003),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.architecture, 0.5),
      position: [0, 0.035, 0.202],
      rotation: [0, 0, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
    // 品牌 Logo 区
    {
      name: 'logo-area',
      geometry: () => new THREE.PlaneGeometry(0.08, 0.02),
      material: { type: 'plastic', color: '#333333', roughness: 0.5, metalness: 0.2 },
      position: [0.08, -0.02, 0.202],
      rotation: [0, 0, 0],
    },
  ],

  thumbnailColor: BRAND_PALETTE.architecture,
}

/**
 * 注册所有架构模型
 */
export const architectureModels = [gatewayKNXModel, smartHostModel]
