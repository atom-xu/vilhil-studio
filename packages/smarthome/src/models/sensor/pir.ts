/**
 * 传感器子系统 - PIR/人体感应器模型
 *
 * 设计师规格：
 * - 尺寸：85mm 直径，45mm 高度（标准吸顶式）
 * - 安装：天花板嵌入式
 * - 材质：白色塑料外壳 + 菲涅尔透镜
 * - 覆盖范围：5m 半径（可视化）
 */

import * as THREE from 'three'
import type { DeviceModelDefinition } from '../core/types'
import { PRESET_MATERIALS, BRAND_PALETTE } from '../core/materials'

/**
 * PIR 人体感应器
 */
export const pirModel: DeviceModelDefinition = {
  renderType: 'pir',
  displayName: '人体感应器',
  dimensions: [0.085, 0.045, 0.085],
  defaultHeight: 2.7,
  complexity: 'medium',

  parts: [
    // 底座
    {
      name: 'base',
      geometry: () => new THREE.CylinderGeometry(0.042, 0.04, 0.025, 32),
      material: PRESET_MATERIALS.sensorHousing(),
      position: [0, -0.01, 0],
    },
    // 透镜罩（半球）
    {
      name: 'lens',
      geometry: () => {
        const geo = new THREE.SphereGeometry(0.035, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
        return geo
      },
      material: PRESET_MATERIALS.sensorLens(BRAND_PALETTE.sensor),
      position: [0, 0.012, 0],
    },
    // 状态 LED（隐藏式）
    {
      name: 'status-led',
      geometry: () => new THREE.CircleGeometry(0.005, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.active, 0),
      position: [0, 0.022, 0],
      rotation: [-Math.PI / 2, 0, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
  ],

  coverage: {
    type: 'cone',
    radius: 5,
    angle: 110, // PIR 典型检测角度
    color: BRAND_PALETTE.sensor,
    opacity: 0.15,
  },

  thumbnailColor: BRAND_PALETTE.sensor,
}

/**
 * 烟感报警器
 */
export const smokeModel: DeviceModelDefinition = {
  renderType: 'smoke',
  displayName: '烟感报警器',
  dimensions: [0.11, 0.04, 0.11],
  defaultHeight: 2.7,
  complexity: 'low',

  parts: [
    {
      name: 'housing',
      geometry: () => new THREE.CylinderGeometry(0.055, 0.055, 0.035, 32),
      material: PRESET_MATERIALS.sensorHousing('#ffffff'),
    },
    {
      name: 'detector-vent',
      geometry: () => {
        // 简化为顶部环
        const ring = new THREE.RingGeometry(0.02, 0.045, 32)
        ring.rotateX(-Math.PI / 2)
        return ring
      },
      material: { type: 'plastic', color: '#e0e0e0', roughness: 0.7, metalness: 0 },
      position: [0, 0.018, 0],
    },
    {
      name: 'status-led',
      geometry: () => new THREE.CircleGeometry(0.004, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.security, 0),
      position: [0.035, 0.015, 0],
      rotation: [-Math.PI / 2, 0, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
  ],

  coverage: {
    type: 'cylinder',
    radius: 8, // 典型烟感覆盖范围
    height: 6,
    color: BRAND_PALETTE.security,
    opacity: 0.1,
  },

  thumbnailColor: BRAND_PALETTE.sensor,
}

/**
 * 半球摄像头
 */
export const domeCameraModel: DeviceModelDefinition = {
  renderType: 'dome',
  displayName: '半球摄像头',
  dimensions: [0.12, 0.08, 0.12],
  defaultHeight: 2.7,
  complexity: 'medium',

  parts: [
    // 底座
    {
      name: 'base',
      geometry: () => new THREE.CylinderGeometry(0.055, 0.06, 0.025, 32),
      material: PRESET_MATERIALS.sensorHousing('#f0f0f0'),
      position: [0, -0.027, 0],
    },
    // 外壳
    {
      name: 'housing',
      geometry: () => {
        const geo = new THREE.SphereGeometry(0.055, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
        return geo
      },
      material: PRESET_MATERIALS.sensorHousing('#ffffff'),
      position: [0, -0.015, 0],
    },
    // 镜头（黑色球体）
    {
      name: 'lens',
      geometry: () => new THREE.SphereGeometry(0.025, 16, 16),
      material: { type: 'glass', color: '#1a1a1a', roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.9 },
      position: [0, -0.01, 0],
    },
    // 状态 LED
    {
      name: 'status-led',
      geometry: () => new THREE.CircleGeometry(0.003, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.active, 0.3),
      position: [0.04, -0.005, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
  ],

  coverage: {
    type: 'cone',
    radius: 10,
    angle: 90,
    color: BRAND_PALETTE.security,
    opacity: 0.1,
  },

  thumbnailColor: BRAND_PALETTE.security,
}

/**
 * 门窗传感器
 */
export const doorSensorModel: DeviceModelDefinition = {
  renderType: 'door-sensor',
  displayName: '门窗传感器',
  dimensions: [0.04, 0.02, 0.01],
  defaultHeight: 2.0,
  complexity: 'low',

  parts: [
    {
      name: 'main-unit',
      geometry: () => new THREE.BoxGeometry(0.04, 0.02, 0.008),
      material: PRESET_MATERIALS.sensorHousing(),
    },
    {
      name: 'magnet-unit',
      geometry: () => new THREE.BoxGeometry(0.025, 0.015, 0.006),
      material: PRESET_MATERIALS.sensorHousing(),
      position: [0.045, 0, 0],
    },
  ],

  thumbnailColor: BRAND_PALETTE.sensor,
}

/**
 * 注册所有传感器模型
 */
export const sensorModels = [pirModel, smokeModel, domeCameraModel, doorSensorModel]
