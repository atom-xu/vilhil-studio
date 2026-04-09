/**
 * 灯光子系统 - 筒灯模型
 *
 * 设计师规格：
 * - 尺寸：85mm 直径，55mm 高度（标准嵌入式筒灯）
 * - 安装：天花板嵌入式
 * - 材质：白色金属外壳 + 反光杯 + LED 发光面
 * - 动画：开关渐变 + 亮度调节
 */

import * as THREE from 'three'
import type { DeviceModelDefinition, ModelPart } from '../core/types'
import { PRESET_MATERIALS, BRAND_PALETTE } from '../core/materials'
import { createDownlightGeometry, createRingGeometry } from '../core/geometry'

const RENDER_TYPE = 'downlight'

/**
 * 筒灯模型定义
 *
 * 参考 VF Lighting goodline 系列筒灯工程图：
 * - 外径：62mm（装饰环）
 * - 开孔：55mm
 * - 总高：82mm
 * - 可调角度：360°旋转
 *
 * https://www.vflighting.com/Indoor/SeriesProduct/goodline/25/89
 */
export const downlightModel: DeviceModelDefinition = {
  renderType: RENDER_TYPE,
  displayName: '智能筒灯',
  // 工程图尺寸：外径62mm，开孔55mm，总高82mm
  dimensions: [0.062, 0.082, 0.062],
  defaultHeight: 2.7,
  complexity: 'medium',

  parts: [
    // 1. 散热鳍片 - 深灰色金属（天花板上方）
    {
      name: 'heatSink',
      geometry: () => {
        const { heatSink } = createDownlightGeometry()
        return heatSink
      },
      material: {
        type: 'metal',
        color: '#4a4a4a', // 深灰色氧化铝
        roughness: 0.4,
        metalness: 0.7,
      },
    },
    // 2. 白色灯体 - 嵌入天花板内
    {
      name: 'housing',
      geometry: () => {
        const { housing } = createDownlightGeometry()
        return housing
      },
      material: PRESET_MATERIALS.downlightHousing(),
    },
    // 3. 白色装饰环 - 与天花板平齐的可见边框
    {
      name: 'trim',
      geometry: () => {
        const { trim } = createDownlightGeometry()
        return trim
      },
      material: PRESET_MATERIALS.downlightHousing(),
    },
    // 4. 两侧弹簧卡扣 - 金属安装固定件
    {
      name: 'springClipLeft',
      geometry: () => {
        const { springClips } = createDownlightGeometry()
        return springClips[0]!
      },
      material: {
        type: 'metal',
        color: '#c0c0c0',
        roughness: 0.3,
        metalness: 0.8,
      },
    },
    {
      name: 'springClipRight',
      geometry: () => {
        const { springClips } = createDownlightGeometry()
        return springClips[1]!
      },
      material: {
        type: 'metal',
        color: '#c0c0c0',
        roughness: 0.3,
        metalness: 0.8,
      },
    },
    // 5. 反光杯 - 锥形金属反光面
    {
      name: 'reflector',
      geometry: () => {
        const { reflector } = createDownlightGeometry()
        return reflector
      },
      material: {
        type: 'metal',
        color: '#dcdcdc', // 亮银色电镀
        roughness: 0.08,
        metalness: 0.98,
      },
    },
    // 6. COB LED 发光面 - 实际光源，朝下发光
    {
      name: 'emitter',
      geometry: () => {
        const { emitter } = createDownlightGeometry()
        return emitter
      },
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.lighting, 0),
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
    // 7. 状态指示环 - 智能设备在线状态（装饰环内侧）
    {
      name: 'statusRing',
      geometry: () => createRingGeometry(0.020, 0.024, 32),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.active, 0),
      position: [0, -0.002, 0],
      rotation: [Math.PI / 2, 0, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
  ],

  lightEffects: [
    {
      partName: 'emitter',
      stateMapping: { on: 'on', intensity: 'brightness', color: 'color' },
      baseIntensity: 1.0,
      color: BRAND_PALETTE.lighting,
    },
    {
      partName: 'statusRing',
      stateMapping: { on: 'on' },
      baseIntensity: 0.5,
      color: BRAND_PALETTE.active,
    },
  ],

  thumbnailColor: BRAND_PALETTE.lighting,
}

/**
 * 灯带模型
 */
export const stripModel: DeviceModelDefinition = {
  renderType: 'strip',
  displayName: 'LED 灯带',
  dimensions: [0.5, 0.005, 0.01],
  defaultHeight: 2.6,
  complexity: 'low',

  parts: [
    {
      name: 'base',
      geometry: () => new THREE.BoxGeometry(0.5, 0.003, 0.008),
      material: { type: 'plastic', color: '#ffffff', roughness: 0.6, metalness: 0 },
    },
    {
      name: 'emitter',
      geometry: () => new THREE.BoxGeometry(0.48, 0.0025, 0.006),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.lighting, 0.3),
      position: [0, 0.003, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
  ],

  lightEffects: [
    {
      partName: 'emitter',
      stateMapping: { on: 'on', intensity: 'brightness' },
      baseIntensity: 0.8,
      color: BRAND_PALETTE.lighting,
    },
  ],

  thumbnailColor: BRAND_PALETTE.lighting,
}

/**
 * 吊灯模型
 */
export const pendantModel: DeviceModelDefinition = {
  renderType: 'pendant',
  displayName: '吊灯',
  dimensions: [0.25, 0.4, 0.25],
  defaultHeight: 2.2,
  complexity: 'medium',

  parts: [
    // 吊线
    {
      name: 'cable',
      geometry: () => new THREE.CylinderGeometry(0.002, 0.002, 0.2, 8),
      material: { type: 'rubber', color: '#333333', roughness: 0.9, metalness: 0 },
      position: [0, 0.1, 0],
    },
    // 灯罩
    {
      name: 'shade',
      geometry: () => {
        const geo = new THREE.ConeGeometry(0.12, 0.15, 32, 1, true)
        geo.translate(0, -0.075, 0)
        return geo
      },
      material: { type: 'glass', color: '#f5f5f5', roughness: 0.2, metalness: 0, transparent: true, opacity: 0.7 },
    },
    // 发光球
    {
      name: 'bulb',
      geometry: () => new THREE.SphereGeometry(0.04, 16, 16),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.lighting, 0.5),
      position: [0, -0.12, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
  ],

  lightEffects: [
    {
      partName: 'bulb',
      stateMapping: { on: 'on', intensity: 'brightness' },
      baseIntensity: 1.0,
      color: BRAND_PALETTE.lighting,
    },
  ],

  thumbnailColor: BRAND_PALETTE.lighting,
}

/**
 * 壁灯模型
 */
export const wallLightModel: DeviceModelDefinition = {
  renderType: 'wall-light',
  displayName: '壁灯',
  dimensions: [0.12, 0.18, 0.1],
  defaultHeight: 1.8,
  complexity: 'medium',

  parts: [
    // 底座
    {
      name: 'base',
      geometry: () => new THREE.BoxGeometry(0.1, 0.12, 0.02),
      material: PRESET_MATERIALS.metalFrame(),
      position: [0, 0, -0.04],
    },
    // 灯体
    {
      name: 'body',
      geometry: () => new THREE.BoxGeometry(0.12, 0.18, 0.06),
      material: { type: 'plastic', color: '#ffffff', roughness: 0.5, metalness: 0.1 },
    },
    // 发光面
    {
      name: 'emitter',
      geometry: () => new THREE.PlaneGeometry(0.08, 0.12),
      material: PRESET_MATERIALS.ledEmitter(BRAND_PALETTE.lighting, 0.3),
      position: [0, 0, 0.031],
      rotation: [0, 0, 0],
      animated: true,
      animationProperty: 'material.emissiveIntensity',
    },
  ],

  lightEffects: [
    {
      partName: 'emitter',
      stateMapping: { on: 'on', intensity: 'brightness' },
      baseIntensity: 0.8,
      color: BRAND_PALETTE.lighting,
    },
  ],

  thumbnailColor: BRAND_PALETTE.lighting,
}

/**
 * 注册所有灯光模型
 */
export const lightingModels = [downlightModel, stripModel, pendantModel, wallLightModel]
