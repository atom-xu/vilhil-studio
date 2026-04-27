import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'
import { quantizePoint3 } from '../precision'

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
