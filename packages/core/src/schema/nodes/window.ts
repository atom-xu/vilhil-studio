/**
 * @vilhil-managed-file
 *
 * 此文件由 VilHil 修改过（新增 presetId 字段，恢复了原 Pascal 上游字段为 optional）。
 * 合并上游时：上游所有字段保留为 optional；VilHil 的 presetId 字段不动；
 * 上游对该 schema 的字段语义如有改动，优先采纳上游版本。
 *
 * 详见 docs/ARCHITECTURE-LAYERING.md §4、docs/UPSTREAM-PATCHES.md L2。
 */
import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'
import { quantizePoint3 } from '../precision'

// 上游 Pascal 的 WindowType 枚举。VilHil 当前未消费，但保留以避免合并冲突。
export const WindowType = z.enum([
  'fixed',
  'sliding',
  'casement',
  'awning',
  'hopper',
  'single-hung',
  'double-hung',
  'bay',
  'bow',
  'louvered',
])
export type WindowType = z.infer<typeof WindowType>

export const WindowNode = BaseNode.extend({
  id: objectId('window'),
  type: nodeType('window'),
  material: MaterialSchema.optional(),

  // 窗位置：墙局部坐标系。挂 1cm 量化
  position: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 0])
    .transform(quantizePoint3),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  side: z.enum(['front', 'back']).optional(),

  // Wall reference
  wallId: z.string().optional(),

  // Overall dimensions
  width: z.number().default(1.5),
  height: z.number().default(1.5),

  // ────────────────────────────────────────────────────────────
  // 上游 Pascal 字段（VilHil 当前未消费，全部恢复为 optional）。
  // 合并上游时：保留 optional；如上游有语义变更优先采纳上游。
  // ────────────────────────────────────────────────────────────

  // Opening mode - when set to "opening", the window is only a shaped cutout
  openingKind: z.enum(['window', 'opening']).optional(),

  // Window family
  windowType: WindowType.optional(),
  operationState: z.number().min(0).max(1).optional(),
  awningDirection: z.enum(['up', 'down']).optional(),
  casementStyle: z.enum(['single', 'french']).optional(),
  hingesSide: z.enum(['left', 'right']).optional(),
  openingShape: z.enum(['rectangle', 'rounded', 'arch']).optional(),
  openingRadiusMode: z.enum(['all', 'individual']).optional(),
  openingCornerRadii: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional(),
  cornerRadius: z.number().optional(),
  archHeight: z.number().optional(),
  openingRevealRadius: z.number().optional(),

  // Frame
  frameThickness: z.number().default(0.05),
  frameDepth: z.number().default(0.07),

  // Divisions — ratios allow non-uniform panes
  // [0.5, 0.5] = two equal panes
  // [0.6, 0.4] = one larger, one smaller
  // [1] = single pane (no division)
  columnRatios: z.array(z.number()).default([1]),
  rowRatios: z.array(z.number()).default([1]),
  columnDividerThickness: z.number().default(0.03),
  rowDividerThickness: z.number().default(0.03),

  // Sill
  sill: z.boolean().default(true),
  sillDepth: z.number().default(0.08),
  sillThickness: z.number().default(0.03),

  /**
   * 窗户类型预设 id —— 'standard' / 'wide' / 'floor_ceiling' / 'high' 等。
   *
   * 现状：用户画窗时选预设决定 width / height / sillHeight，画完之后 preset 信息
   * 丢失——只剩具体尺寸。结果：
   *   1) 想换"窗户类型"必须删掉重画
   *   2) 手调高度容易调出墙体范围、穿模
   *
   * 把 presetId 持久化到节点上，右侧面板就可以"切窗户类型"，切到目标预设时
   * 自动套上对应 width / height / sillHeight，不再让用户手调到穿模。
   *
   * optional + 老数据无值时 UI 用 'standard' 兜底。
   */
  presetId: z.string().optional(),
}).describe(dedent`Window node - a parametric window placed on a wall
  - position: center of the window in wall-local coordinate system
  - width/height: overall outer dimensions
  - frameThickness: width of the frame members
  - frameDepth: how deep the frame sits within the wall
  - columnRatios/rowRatios: pane division ratios
  - sill: whether to show a window sill
`)

export type WindowNode = z.infer<typeof WindowNode>
