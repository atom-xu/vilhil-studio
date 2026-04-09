/**
 * 安防子系统 - 门锁/摄像头模型
 *
 * 设计师规格：
 * - 门锁：70mm x 180mm x 60mm
 * - 材质：拉丝金属 + 指纹识别区 + 状态指示
 * - 安装：门体侧面
 */

import * as THREE from 'three'
import type { DeviceModelDefinition } from '../core/types'
import { PRESET_MATERIALS, BRAND_PALETTE } from '../core/materials'
import { createDoorLockGeometry } from '../core/geometry'

/**
 * 智能门锁
 */
export const doorLockModel: DeviceModelDefinition = {
  renderType: 'door-lock',
  displayName: '智能门锁',
  dimensions: [0.07, 0.18, 0.06],
  defaultHeight: 1.0,
  complexity: 'high',

  parts: [
    // 锁体
    {
      name: 'body',
      geometry: () => {
        const { body } = createDoorLockGeometry(0.07, 0.18, 0.06)
        return body
      },
      material: PRESET_MATERIALS.doorLock(),
    },
    // 把手
    {
      name: 'handle',
      geometry: () => {
        const { handle } = createDoorLockGeometry(0.07, 0.18, 0.06)
        return handle
      },
      material: PRESET_MATERIALS.metalFrame(BRAND_PALETTE.lighting),
      animated: true,
      animationProperty: 'rotation',
    },
    // 指纹识别区
    {
      name: 'fingerprint',
      geometry: () => new THREE.CircleGeometry(0.012, 32),
      material: { type: 'glass', color: '#1a1a1a', roughness: 0.1, metalness: 0.3 },
      position: [0, 0.04, 0.031],
      rotation: [0, 0, 0],
    },
    // 数字键盘区域（示意）
    {
      name: 'keypad',
      geometry: () => new THREE.PlaneGeometry(0.04, 0.06),
      material: { type: 'glass', color: '#0a0a0a', roughness: 0.2, metalness: 0 },
      position: [0, -0.03, 0.031],
      rotation: [0, 0, 0],
    },
    // 状态指示灯
    {
      name: 'status-led',
      geometry: () => new THREE.CircleGeometry(0.004, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.security, 0),
      position: [0, 0.08, 0.032],
      rotation: [0, 0, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
    // 锁舌（侧面）
    {
      name: 'bolt',
      geometry: () => new THREE.BoxGeometry(0.02, 0.015, 0.015),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, -0.037],
    },
  ],

  animations: [
    {
      type: 'rotate',
      duration: 0.5,
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 45 },
      ],
    },
  ],

  lightEffects: [
    {
      partName: 'status-led',
      stateMapping: { on: 'locked' },
      baseIntensity: 0.8,
      color: BRAND_PALETTE.security,
    },
  ],

  thumbnailColor: BRAND_PALETTE.security,
}

/**
 * 枪机摄像头
 */
export const bulletCameraModel: DeviceModelDefinition = {
  renderType: 'camera-bullet',
  displayName: '枪机摄像头',
  dimensions: [0.08, 0.06, 0.12],
  defaultHeight: 2.8,
  complexity: 'medium',

  parts: [
    // 支架
    {
      name: 'mount',
      geometry: () => new THREE.BoxGeometry(0.04, 0.04, 0.03),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, -0.05],
    },
    // 机身
    {
      name: 'body',
      geometry: () => {
        const geo = new THREE.CylinderGeometry(0.03, 0.04, 0.1, 32)
        geo.rotateX(Math.PI / 2)
        return geo
      },
      material: PRESET_MATERIALS.sensorHousing('#f0f0f0'),
    },
    // 镜头
    {
      name: 'lens',
      geometry: () => new THREE.SphereGeometry(0.02, 16, 16),
      material: { type: 'glass', color: '#0a0a0a', roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.9 },
      position: [0, 0, 0.05],
    },
    // 红外灯环
    {
      name: 'ir-ring',
      geometry: () => new THREE.RingGeometry(0.025, 0.035, 32),
      material: PRESET_MATERIALS.ledEmitter('#8b0000', 0.2),
      position: [0, 0, 0.045],
      rotation: [0, 0, 0],
    },
    // 状态 LED
    {
      name: 'status-led',
      geometry: () => new THREE.CircleGeometry(0.003, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.active, 0.3),
      position: [0.03, 0.02, 0.04],
    },
  ],

  coverage: {
    type: 'cone',
    radius: 15,
    angle: 75,
    color: BRAND_PALETTE.security,
    opacity: 0.1,
  },

  thumbnailColor: BRAND_PALETTE.security,
}

/**
 * 注册所有安防模型
 */
export const securityModels = [doorLockModel, bulletCameraModel]
