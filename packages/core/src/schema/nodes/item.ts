/**
 * @vilhil-managed-file
 *
 * 此文件由 VilHil 修改过：
 *   - position 加了 quantizePoint3 量化转换
 *   - 新增 cameraParams 可选字段（安防摄像头 FOV / range / yaw 参数）
 *   - 新增 rotationEffect 离散联合分支（控件驱动节点旋转，例如阀门）
 *   - 新增 assetSchema.wallArm 可选字段（wall-side 件自动生成手臂 + 安装板）
 *   - 导出 WallArm 类型
 *   - 恢复了上游字段：assetSchema.floorPlanUrl / source / isDraft / functionTags
 *   - 恢复了 isLowProfileItemSurface 与 LOW_PROFILE_ITEM_SURFACE_MAX_HEIGHT 导出
 *
 * 合并上游时：上游所有字段保留；VilHil 的新增字段与 quantizePoint3 不动；
 * 上游对 schema 的字段语义如有改动，优先采纳上游版本。
 *
 * 详见 docs/ARCHITECTURE-LAYERING.md §4、docs/UPSTREAM-PATCHES.md L11。
 */
import dedent from 'ts-dedent'
import { z } from 'zod'
import { AssetUrl } from '../asset-url'
import { BaseNode, nodeType, objectId } from '../base'
import type { CollectionId } from '../collections'
import { quantizePoint3 } from '../precision'

// --- Control descriptors ---

const toggleControlSchema = z.object({
  kind: z.literal('toggle'),
  label: z.string().optional(),
  default: z.boolean().optional(),
})

const sliderControlSchema = z.object({
  kind: z.literal('slider'),
  label: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().default(1),
  unit: z.string().optional(),
  displayMode: z.enum(['slider', 'stepper', 'dial']).default('slider'),
  default: z.number().optional(),
})

const temperatureControlSchema = z.object({
  kind: z.literal('temperature'),
  label: z.string().default('Temperature'),
  min: z.number().default(16),
  max: z.number().default(30),
  unit: z.enum(['C', 'F']).default('C'),
  default: z.number().optional(),
})

const controlSchema = z.discriminatedUnion('kind', [
  toggleControlSchema,
  sliderControlSchema,
  temperatureControlSchema,
])

// --- Effect descriptors ---

const animationEffectSchema = z.object({
  kind: z.literal('animation'),
  clips: z.object({
    on: z.string().optional(),
    off: z.string().optional(),
    loop: z.string().optional(),
  }),
})

const lightEffectSchema = z.object({
  kind: z.literal('light'),
  color: z.string().default('#ffffff'),
  intensityRange: z.tuple([z.number(), z.number()]),
  distance: z.number().optional(),
  offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
})

// VilHil 扩展：控件驱动节点旋转（阀门 / 旋钮等）
const rotationEffectSchema = z.object({
  kind: z.literal('rotation'),
  nodeName: z.string(),
  controlIndex: z.number().int(),
  axis: z.enum(['x', 'y', 'z']),
  range: z.tuple([z.number(), z.number()]),
})

const effectSchema = z.discriminatedUnion('kind', [
  animationEffectSchema,
  lightEffectSchema,
  rotationEffectSchema,
])

// --- Interactive descriptor ---

const interactiveSchema = z.object({
  controls: z.array(controlSchema).default([]),
  effects: z.array(effectSchema).default([]),
})

export type ToggleControl = z.infer<typeof toggleControlSchema>
export type SliderControl = z.infer<typeof sliderControlSchema>
export type TemperatureControl = z.infer<typeof temperatureControlSchema>
export type Control = z.infer<typeof controlSchema>
export type AnimationEffect = z.infer<typeof animationEffectSchema>
export type LightEffect = z.infer<typeof lightEffectSchema>
export type RotationEffect = z.infer<typeof rotationEffectSchema>
export type Effect = z.infer<typeof effectSchema>
export type Interactive = z.infer<typeof interactiveSchema>

const assetSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  thumbnail: z.string(),
  // Optional top-down 2D image shown inside the item's footprint on the
  // floor plan. When present, replaces the default diagonal-cross marker.
  floorPlanUrl: z.string().optional(),
  // Where the item came from in the catalog. Used by the editor's items
  // panel to filter Library / Community / Mine. The server populates it
  // from `items.userId`: null → 'library', current user → 'mine',
  // other user → 'community'. Defaults to 'library' when absent (e.g.
  // the seeded built-in catalog).
  source: z.enum(['library', 'community', 'mine']).default('library'),
  // True when the item belongs to the caller and is still in draft status.
  // The catalog only loads my drafts (other users' drafts are never
  // published to the catalog). Used so the Community filter can include
  // *my* published items alongside other users', while leaving drafts
  // visible only under Mine.
  isDraft: z.boolean().optional(),
  src: AssetUrl,
  dimensions: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]), // [w, h, d]
  attachTo: z.enum(['wall', 'wall-side', 'ceiling']).optional(),
  tags: z.array(z.string()).optional(),
  // Function-axis tag slugs from the taxonomy. Drives the hierarchical
  // Items-tab browse: a tree node matches when any of its descendant slugs
  // appears here. Absent for the seeded built-in catalog.
  functionTags: z.array(z.string()).optional(),
  // These are "Corrective" transforms to normalize the GLB
  offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
  surface: z
    .object({
      height: z.number(), // where things rest
    })
    .optional(), // undefined = can't place things on it
  // VilHil 扩展：wall-side 件自动生成程序化手臂 + 安装板
  wallArm: z
    .object({
      length: z.number(),
      thickness: z.number().default(0.015),
    })
    .optional(),
  interactive: interactiveSchema.optional(),
})

export type AssetInput = z.input<typeof assetSchema>
export type Asset = z.infer<typeof assetSchema>
export type WallArm = z.infer<typeof assetSchema>['wallArm']

export const ItemNode = BaseNode.extend({
  id: objectId('item'),
  type: nodeType('item'),
  // 家具世界坐标：1cm 量化（常见家具尺寸全部对齐）
  position: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 0])
    .transform(quantizePoint3),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
  side: z.enum(['front', 'back']).optional(),
  children: z.array(objectId('item')).default([]),

  // VilHil 扩展：每实例摄像头参数（item panel 在 tags 包含 'security' 时展示）
  cameraParams: z
    .object({
      fov: z.number().default(60), // 照射角度 (°)
      range: z.number().default(8), // 覆盖距离 (m)
      yaw: z.number().default(0), // FOV 锥体朝向偏转 (°)，独立于模型旋转
    })
    .optional(),

  // Wall attachment properties (only used when asset.attachTo is "wall" or "wall-side")
  wallId: z.string().optional(),
  wallT: z.number().optional(), // 0-1 parametric position along wall

  // Denormalized references to collections this node belongs to
  collectionIds: z.array(z.custom<CollectionId>()).optional(),

  asset: assetSchema,
}).describe(dedent`Item node - used to represent a item in the building
  - position: position in level coordinate system (or parent coordinate system if attached)
  - rotation: rotation in level coordinate system (or parent coordinate system if attached)
  - asset: asset data
    - category: category of the item
    - dimensions: size in level coordinate system
    - src: url of the model
    - attachTo: where to attach the item (wall, wall-side, ceiling)
    - offset: corrective position offset for the model
    - rotation: corrective rotation for the model
    - scale: corrective scale for the model
    - tags: tags associated with the item
`)

export type ItemNode = z.infer<typeof ItemNode>

export const LOW_PROFILE_ITEM_SURFACE_MAX_HEIGHT = 0.1

/**
 * Low, floor-resting items like rugs and parking mats can receive items visually,
 * but should not become item parents or block normal floor placement.
 */
export function isLowProfileItemSurface(item: ItemNode): boolean {
  if (item.asset.attachTo) return false
  const surfaceHeight = item.asset.surface
    ? item.asset.surface.height * item.scale[1]
    : getScaledDimensions(item)[1]
  return surfaceHeight <= LOW_PROFILE_ITEM_SURFACE_MAX_HEIGHT
}

/**
 * Returns the effective world-space dimensions of an item after applying its scale.
 * Use this everywhere item.asset.dimensions is used for spatial calculations.
 */
export function getScaledDimensions(item: ItemNode): [number, number, number] {
  const [w, h, d] = item.asset.dimensions
  const [sx, sy, sz] = item.scale
  return [w * sx, h * sy, d * sz]
}
