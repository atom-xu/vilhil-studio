/**
 * VilHil SmartHome Package
 *
 * 智能家居层核心功能
 * - 设备目录 (device-catalog.ts)
 * - 设备状态管理 (device-state.ts)
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
  type DeviceDefinition,
} from './device-catalog'

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
  useSubsystemVisibility,
  useToggleSubsystem,
  type DeviceStateEntry,
} from './device-state'
