/**
 * VilHil SmartHome Package
 *
 * 智能家居层核心功能
 * - 设备目录 (device-catalog.ts)
 * - 设备状态管理 (device-state.ts)
 * - 3D 模型库 (models/) - 设计师维护的程序化模型系统
 * - 元数据框架 (meta/) - Product / Instance 分层定义
 */

// 设备目录
export {
  CATALOG_BY_ID,
  CATALOG_BY_SUBSYSTEM,
  CATALOG_BY_TYPE,
  DEVICE_CATALOG,
  getDefaultDeviceHeight,
  getDeviceDefinition,
  getDevicesBySubsystem,
  getLightingFixtures,
  getPanels,
  getSensors,
  SUBSYSTEM_META,
  SUBSYSTEM_ORDER,
  deriveProductMeta,
  getProductMeta,
  type DeviceDefinition,
} from './device-catalog'

// 元数据框架（Product / Instance 分层）
export {
  // Product 层
  productHasScreen,
  productSupportsScenes,
  getProductDisplayName,
  getFallbackGeometry,
  type DeviceCategory,
  type DeviceSubcategory,
  type ProductIdentity,
  type ProductPhysical,
  type ProductElectrical,
  type ProductProtocol,
  type ProductCapabilities,
  type ProductCommercial,
  type FallbackGeometry,
  type ProductAssets,
  type ProductMetadata,
  type SmartProduct,
  // Instance 层
  getInstanceLabel,
  getDeliveryStatusText,
  isDeliveryComplete,
  createDefaultDelivery,
  type ControlFunction,
  type DeviceControl,
  type DeviceConfiguration,
  type DeviceDelivery,
  type DeviceInstanceMetadata,
  type DeviceInstanceMeta,
} from './meta'

// 子系统工具
export {
  getSubsystemColor,
  getSubsystemLabel,
} from './device-catalog'

// 设备状态
export {
  executeScene,
  useDevice,
  useDeviceState,
  useSelectedSubsystem,
  useSubsystemVisibility,
  useToggleSubsystem,
  type DeviceStateEntry,
} from './device-state'

// 工具函数（AI / UI / 测试脚本均可调用）
export {
  placeDevice,
  removeDevice,
  setDeviceParams,
  setDeviceState,
  toggleDevice,
  executePanelAction,
  setPanelKeyConfig,
  type PanelAction,
  type PanelKeyConfig,
  makeCircuitId,
  mergeCircuits,
  separateLightToOwnCircuit,
  listCircuitMembers,
  getEffectiveCircuitId,
  getLightCircuits,
  getCircuitNumber,
  setCircuitMeta,
  assignMissingCircuitIds,
  type CircuitInfo,
  createScene,
  updateScene,
  deleteScene,
  addSceneEffect,
  addSceneCircuitEffect,
  removeSceneEffect,
  removeSceneCircuitEffect,
  applyScene,
  subscribeSceneRunStatus,
  getSceneRunStatus,
  getSceneNodes,
  type SceneRunStatus,
  exportDeviceList,
  exportDeviceListCSV,
  type DeviceListExport,
  type DeviceListItem,
  type SubsystemGroup,
  buildTopology,
  type TopologyAssignment,
  type TopologyBuildResult,
  type TopologyControllerSpec,
  type TopologyControllerState,
  type TopologyDeviceInput,
  type TopologyProtocol,
  type TopologyStrategy,
} from './tools'

// 3D 模型库（设计师维护）
export {
  // 核心类型
  type DeviceModelDefinition,
  type DeviceVisualState,
  type ModelRenderType,
  type MaterialDefinition,
  type GeometryParams,
  type ModelPart,
  type AnimationDefinition,
  type LightEffectDefinition,
  type CoverageDefinition,

  // 材质系统
  BRAND_PALETTE,
  PRESET_MATERIALS,
  createMaterial,
  getOrCreateMaterial,
  clearMaterialCache,

  // 几何体生成器
  createDownlightGeometry,
  createSwitchButtonsGeometry,
  createKnobGeometry,
  createDoorLockGeometry,
  createAPGeometry,
  createCylinderGeometry,
  createSphereGeometry,
  createHemisphereGeometry,
  createRoundedRectGeometry,
  createRingGeometry,

  // 模型注册表
  modelRegistry,
  getModel,
  getModelDisplayName,
  getModelDimensions,
  getModelDefaultHeight,
  getModelThumbnailColor,
  hasModelAnimation,
  hasModelCoverage,
  getAllModelRenderTypes,
  getModelStats,

  // 子系统模型（数组）
  lightingModels,
  panelModels,
  sensorModels,
  curtainModels,
  hvacModels,
  networkModels,
  securityModels,
  architectureModels,

  // 单个模型（供演示/测试使用）
  downlightModel,
  stripModel,
  pendantModel,
  wallLightModel,
  switch1KeyModel,
  switch2KeyModel,
  switch3KeyModel,
  dimmerKnobModel,
  scene4KeyModel,
  scene6KeyModel,
  thermostatModel,
  pirModel,
  smokeModel,
  domeCameraModel,
  doorSensorModel,
  bulletCameraModel,
  curtainMotorModel,
  blindMotorModel,
  vent4WayModel,
  ventLinearModel,
  acUnitModel,
  apCeilingModel,
  apWallModel,
  routerModel,
  doorLockModel,
  gatewayKNXModel,
  smartHostModel,
} from './models'

// 3D 组件（交互层）
export {
  // 核心渲染器
  SmartDeviceRenderer,
  DeviceRenderer,
  DeviceMesh,
  DeviceSelectionHighlight,
  DeviceCoverage,

  // 交互组件
  DeviceInteractionZone,
  DeviceActionMenu,

  // 动画组件
  DeviceAnimator,
  PulseEffect,
  CurtainAnimation,

  // 预览组件
  DevicePreview,
  DeviceCursor,
  PlacementGuides,
  CollisionPreview,
} from './components'
