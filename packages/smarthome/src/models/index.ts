/**
 * VilHil 智能设备 3D 模型库
 *
 * 设计师主导的设备程序化模型系统
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// 核心类型（设计师规范）
// ═══════════════════════════════════════════════════════════════

export type {
  AnimationDefinition,
  AnimationKeyframe,
  AnimationType,
  CoverageDefinition,
  DeviceModelDefinition,
  DeviceModelInstance,
  DeviceVisualState,
  GeometryParams,
  LightEffectDefinition,
  MaterialDefinition,
  MaterialType,
  ModelComplexity,
  ModelPart,
  ModelRenderType,
  ModelLibraryConfig,
} from './core/types'

// ═══════════════════════════════════════════════════════════════
// 材质系统（设计师调色板）
// ═══════════════════════════════════════════════════════════════

export {
  BRAND_PALETTE,
  clearMaterialCache,
  createMaterial,
  createMaterialVariant,
  generateMaterialId,
  getOrCreateMaterial,
  PRESET_MATERIALS,
} from './core/materials'

// ═══════════════════════════════════════════════════════════════
// 几何体生成器
// ═══════════════════════════════════════════════════════════════

export {
  centerGeometry,
  createAPGeometry,
  createCurtainPanelGeometry,
  createCylinderGeometry,
  createDoorLockGeometry,
  createDownlightGeometry,
  createHemisphereGeometry,
  createHollowCylinderGeometry,
  createKnobGeometry,
  createRingGeometry,
  createRoundedRectGeometry,
  createSphereGeometry,
  createSwitchButtonsGeometry,
  createTorusGeometry,
  createTrackGeometry,
  createVentGrilleGeometry,
  getGeometrySize,
  mergeGeometries,
} from './core/geometry'

// ═══════════════════════════════════════════════════════════════
// 模型注册表
// ═══════════════════════════════════════════════════════════════

export {
  getAllModelRenderTypes,
  getModel,
  getModelDefaultHeight,
  getModelDimensions,
  getModelDisplayName,
  getModelStats,
  getModelThumbnailColor,
  hasModelAnimation,
  hasModelCoverage,
  modelRegistry,
} from './registry'

// ═══════════════════════════════════════════════════════════════
// 子系统模型导出（供高级使用）
// ═══════════════════════════════════════════════════════════════

// 灯光
export {
  downlightModel,
  pendantModel,
  stripModel,
  wallLightModel,
  lightingModels,
} from './lighting/downlight'

// 面板
export {
  dimmerKnobModel,
  panelModels,
  scene4KeyModel,
  scene6KeyModel,
  switch1KeyModel,
  switch2KeyModel,
  switch3KeyModel,
  thermostatModel,
} from './panel/switch'

// 传感器
export {
  domeCameraModel,
  doorSensorModel,
  pirModel,
  sensorModels,
  smokeModel,
} from './sensor/pir'

// 窗帘
export { blindMotorModel, curtainModels, curtainMotorModel } from './curtain/motor'

// 暖通
export { acUnitModel, hvacModels, vent4WayModel, ventLinearModel } from './hvac/vent'

// 网络
export { apCeilingModel, apWallModel, networkModels, routerModel } from './network/ap'

// 安防
export { bulletCameraModel, doorLockModel, securityModels } from './security/lock'

// 架构
export { architectureModels, gatewayKNXModel, smartHostModel } from './architecture/gateway'
