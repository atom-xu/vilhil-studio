// Store

export type {
  BuildingEvent,
  CameraControlEvent,
  CeilingEvent,
  DeviceEvent,
  DoorEvent,
  EventSuffix,
  GridEvent,
  ItemEvent,
  LevelEvent,
  NodeEvent,
  RoofEvent,
  RoofSegmentEvent,
  SiteEvent,
  SlabEvent,
  StairEvent,
  StairSegmentEvent,
  WallEvent,
  WindowEvent,
  ZoneEvent,
} from './events/bus'
// Events
export { emitter, eventSuffixes } from './events/bus'
// Hooks
export {
  sceneRegistry,
  useRegistry,
} from './hooks/scene-registry/scene-registry'
export { pointInPolygon, spatialGridManager } from './hooks/spatial-grid/spatial-grid-manager'
export {
  initSpatialGridSync,
  resolveLevelId,
} from './hooks/spatial-grid/spatial-grid-sync'
export { useSpatialQuery } from './hooks/spatial-grid/use-spatial-query'
// Asset storage
export { loadAssetUrl, saveAsset } from './lib/asset-storage'
// Space detection
export {
  detectSpacesForLevel,
  initSpaceDetectionSync,
  type Space,
  wallTouchesOthers,
} from './lib/space-detection'
// Schema
export * from './schema'
export {
  type ControlValue,
  type ItemInteractiveState,
  useInteractive,
} from './store/use-interactive'
export { clearSceneHistory, default as useScene } from './store/use-scene'
// Registry / Plugin infrastructure (Phase 2A — VilHil 上层未消费 viewer/editor 部分)
// 详见 docs/ARCHITECTURE-LAYERING.md §5、docs/NODES-PLUGIN-ARCHITECTURE.md
export {
  discoverPlugins,
  getHostRefFields,
  getSelectableKinds,
  isDrawnViaTool,
  isDrawnViaToolKind,
  isPresettable,
  isPresettableKind,
  isRegistryMovable,
  isRegistrySelectable,
  kindsWithFloorplanScope,
  loadPlugin,
  nodeRegistry,
  type PluginDiscovery,
  registerNode,
  setPluginDiscovery,
} from './registry/registry'
export type {
  AnyNodeDefinition,
  Capabilities,
  NodeCategory,
  NodeDefinition,
  NodeRegistry,
  Plugin,
  Presentation,
  SurfaceRole,
} from './registry/types'
// Systems
export { CeilingSystem } from './systems/ceiling/ceiling-system'
export { DoorSystem } from './systems/door/door-system'
export { ItemSystem } from './systems/item/item-system'
export { RoofSystem } from './systems/roof/roof-system'
export { SlabSystem } from './systems/slab/slab-system'
export { StairSystem } from './systems/stair/stair-system'
export {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  getWallPlanFootprint,
  getWallThickness,
} from './systems/wall/wall-footprint'
export {
  calculateLevelMiters,
  type Point2D,
  pointToKey,
  type WallMiterData,
} from './systems/wall/wall-mitering'
export { WallSystem } from './systems/wall/wall-system'
export { WindowSystem } from './systems/window/window-system'
export { cloneLevelSubtree, cloneSceneGraph, forkSceneGraph } from './utils/clone-scene-graph'
export { isObject } from './utils/types'
