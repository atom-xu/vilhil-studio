/**
 * 窗帘子系统 - 电机/轨道模型
 *
 * 设计师规格：
 * - 电机尺寸：50mm x 50mm x 300mm（轨道电机）
 * - 安装：窗帘盒内隐藏安装
 * - 材质：铝合金轨道 + 白色塑料电机外壳
 */

import * as THREE from 'three'
import type { DeviceModelDefinition } from '../core/types'
import { PRESET_MATERIALS, BRAND_PALETTE } from '../core/materials'

/**
 * 窗帘轨道电机
 */
export const curtainMotorModel: DeviceModelDefinition = {
  renderType: 'curtain-motor',
  displayName: '窗帘轨道电机',
  dimensions: [0.05, 0.3, 0.05],
  defaultHeight: 2.5,
  complexity: 'medium',

  parts: [
    // 轨道（简化为长方体，实际长度可变）
    {
      name: 'track',
      geometry: () => new THREE.BoxGeometry(0.04, 0.03, 0.3),
      material: PRESET_MATERIALS.curtainMotor(),
    },
    // 电机主体
    {
      name: 'motor-body',
      geometry: () => new THREE.BoxGeometry(0.045, 0.06, 0.08),
      material: PRESET_MATERIALS.sensorHousing(),
      position: [0, -0.04, 0.1],
    },
    // 传动箱
    {
      name: 'gearbox',
      geometry: () => new THREE.CylinderGeometry(0.02, 0.02, 0.03, 16),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, -0.04, 0.05],
      rotation: [Math.PI / 2, 0, 0],
    },
    // 窗帘挂钩（滑动件）
    {
      name: 'carriage-1',
      geometry: () => new THREE.BoxGeometry(0.02, 0.015, 0.01),
      material: { type: 'plastic', color: '#ffffff', roughness: 0.5, metalness: 0 },
      position: [-0.08, -0.025, 0],
    },
    {
      name: 'carriage-2',
      geometry: () => new THREE.BoxGeometry(0.02, 0.015, 0.01),
      material: { type: 'plastic', color: '#ffffff', roughness: 0.5, metalness: 0 },
      position: [0.08, -0.025, 0],
    },
    // 状态指示灯
    {
      name: 'status-led',
      geometry: () => new THREE.CircleGeometry(0.003, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.curtain, 0.3),
      position: [0, -0.04, 0.141],
      rotation: [0, 0, 0],
    },
  ],

  animations: [
    {
      type: 'openclose',
      duration: 3, // 3秒开合
      keyframes: [
        { time: 0, value: 0, easing: 'ease-in-out' },
        { time: 1, value: 1, easing: 'ease-in-out' },
      ],
    },
  ],

  thumbnailColor: BRAND_PALETTE.curtain,
}

/**
 * 百叶窗帘电机
 */
export const blindMotorModel: DeviceModelDefinition = {
  renderType: 'blind-motor',
  displayName: '百叶窗帘电机',
  dimensions: [0.04, 0.04, 0.08],
  defaultHeight: 2.5,
  complexity: 'medium',

  parts: [
    // 电机盒
    {
      name: 'motor-box',
      geometry: () => new THREE.BoxGeometry(0.04, 0.04, 0.08),
      material: PRESET_MATERIALS.sensorHousing(),
    },
    // 卷轴（简化）
    {
      name: 'roller',
      geometry: () => new THREE.CylinderGeometry(0.025, 0.025, 0.15, 32),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, -0.04, 0],
      rotation: [0, 0, Math.PI / 2],
    },
    // 拉绳
    {
      name: 'cord',
      geometry: () => new THREE.CylinderGeometry(0.002, 0.002, 0.05, 8),
      material: { type: 'plastic', color: '#ffffff', roughness: 0.8, metalness: 0 },
      position: [0.02, -0.065, 0.03],
    },
  ],

  animations: [
    {
      type: 'openclose',
      duration: 2,
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 1 },
      ],
    },
    {
      type: 'rotate',
      duration: 1,
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 90 },
      ],
    },
  ],

  thumbnailColor: BRAND_PALETTE.curtain,
}

/**
 * 注册所有窗帘模型
 */
export const curtainModels = [curtainMotorModel, blindMotorModel]
