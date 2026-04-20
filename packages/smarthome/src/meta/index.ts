/**
 * 智能设备元数据层
 *
 * Product  = 资产库中的产品定义（what this device IS）
 * Instance = 项目中的设备实例（what this device DOES in a project）
 */

// Instance 层
export type {
  ControlFunction,
  DeviceConfiguration,
  DeviceControl,
  DeviceDelivery,
  DeviceInstanceMeta,
  DeviceInstanceMetadata,
} from './instance-meta'
export {
  createDefaultDelivery,
  getDeliveryStatusText,
  getInstanceLabel,
  isDeliveryComplete,
} from './instance-meta'
// Product 层
export type {
  DeviceCategory,
  DeviceSubcategory,
  FallbackGeometry,
  ProductAssets,
  ProductCapabilities,
  ProductCommercial,
  ProductElectrical,
  ProductIdentity,
  ProductMetadata,
  ProductPhysical,
  ProductProtocol,
  SmartProduct,
} from './product-meta'
export {
  getFallbackGeometry,
  getProductDisplayName,
  productHasScreen,
  productSupportsScenes,
} from './product-meta'
