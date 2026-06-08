// Base
export { BaseNode, generateId, nodeType, objectId } from './base'
// Camera
export { CameraSchema } from './camera'
// Precision —— 全局位置精度守恒（1cm 原子单位）
export {
  ATOM,
  positionKey,
  quantize,
  quantizeNodePatch,
  quantizePoint,
  quantizePoint3,
  quantizePolygon,
} from './precision'
// Collections
export { type Collection, type CollectionId, generateCollectionId } from './collections'
// Material
export {
  DEFAULT_MATERIALS,
  MaterialPreset,
  MaterialProperties,
  MaterialSchema,
  resolveMaterial,
} from './material'
export { BuildingNode } from './nodes/building'
export { CeilingNode } from './nodes/ceiling'
export {
  COLUMN_PRESETS,
  ColumnBaseStyle,
  ColumnCapitalStyle,
  ColumnCarvingPlacement,
  ColumnCrossSection,
  ColumnNode,
  ColumnPanelShape,
  type ColumnPresetId,
  ColumnRingPlacement,
  ColumnShaftDetail,
  ColumnShaftProfile,
  ColumnStyle,
  ColumnSupportStyle,
} from './nodes/column'
export {
  DeviceNode,
  DeviceParamsSchema,
  getSubsystemColor,
  getSubsystemLabel,
  MountTypeEnum,
  SceneNode,
  SceneEffectSchema,
  SubsystemEnum,
  SUBSYSTEM_META,
  type DeviceNode as DeviceNodeType,
  type DeviceParams,
  type MountType,
  type SceneEffect,
  type SceneNode as SceneNodeType,
  type Subsystem,
  type DeviceControl,
  type DeviceConfiguration,
  type DeviceDelivery,
  type DeviceInstanceMetadata,
} from './nodes/device'
export { DoorNode, DoorSegment } from './nodes/door'
export {
  ElevatorDoorPanelStyle,
  ElevatorDoorStyle,
  ElevatorNode,
  ElevatorShaftStyle,
} from './nodes/elevator'
export { FenceBaseStyle, FenceNode, FenceStyle } from './nodes/fence'
export { GuideNode } from './nodes/guide'
export type {
  AnimationEffect,
  Asset,
  AssetInput,
  Control,
  Effect,
  Interactive,
  LightEffect,
  RotationEffect,
  SliderControl,
  WallArm,
  TemperatureControl,
  ToggleControl,
} from './nodes/item'
export { getScaledDimensions, ItemNode } from './nodes/item'
export { LevelNode } from './nodes/level'
export { RidgeVentNode } from './nodes/ridge-vent'
export { RoofNode } from './nodes/roof'
export { RoofSegmentNode, RoofType } from './nodes/roof-segment'
export { ScanNode } from './nodes/scan'
export { ShelfNode } from './nodes/shelf'
// Nodes
export { SiteNode } from './nodes/site'
export {
  SKYLIGHT_TYPE_ORDER,
  SKYLIGHT_TYPE_PRESETS,
  SkylightMaterialRole,
  SkylightNode,
  SkylightOpeningSide,
  SkylightSlideDirection,
  SkylightType,
  type SkylightTypePreset,
} from './nodes/skylight'
export { SlabNode } from './nodes/slab'
export { SolarPanelMaterialRole, SolarPanelNode } from './nodes/solar-panel'
export {
  SOLAR_PANEL_PRESET_LABELS,
  SOLAR_PANEL_PRESETS,
  type SolarPanelPresetDims,
  SolarPanelPresetKey,
} from '../solar-panel-presets'
export { SpawnNode } from './nodes/spawn'
export { StairNode } from './nodes/stair'
export { AttachmentSide, StairSegmentNode, StairSegmentType } from './nodes/stair-segment'
export { VertexNode, VertexNodeKind } from './nodes/vertex'
export { WallNode } from './nodes/wall'
export { WindowNode, WindowType } from './nodes/window'
export { ZoneNode } from './nodes/zone'
export type { AnyNodeId, AnyNodeType } from './types'
// Union types
export { AnyNode } from './types'
