import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'
import { quantizePoint } from '../precision'
import { ItemNode } from './item'
// import { DoorNode } from "./door";
// import { ItemNode } from "./item";
// import { WindowNode } from "./window";

export const WallNode = BaseNode.extend({
  id: objectId('wall'),
  type: nodeType('wall'),
  children: z.array(ItemNode.shape.id).default([]),
  material: MaterialSchema.optional(),
  thickness: z.number().optional(),
  height: z.number().optional(),
  // e.g., start/end points for path —— 经 precision.ATOM (1cm) 量化，保证端点精确对齐
  start: z.tuple([z.number(), z.number()]).transform(quantizePoint),
  end: z.tuple([z.number(), z.number()]).transform(quantizePoint),
  /**
   * F2 阶段新增：可选的"软引用"到 VertexNode。
   * - 存在时：start/end 仍然是主数据，但 startNodeId/endNodeId 作为索引供"拖动节点联动"使用。
   * - 不存在时：老数据兼容，按纯坐标模式使用（和 F1 之前完全一致）。
   * 当前最小版只定义 schema，不强制要求填写。F2 完整版会在画墙时自动填。
   */
  startNodeId: z.string().optional(),
  endNodeId: z.string().optional(),
  // Space detection for cutaway mode
  frontSide: z.enum(['interior', 'exterior', 'unknown']).default('unknown'),
  backSide: z.enum(['interior', 'exterior', 'unknown']).default('unknown'),
}).describe(
  dedent`
  Wall node - used to represent a wall in the building
  - thickness: thickness in meters
  - height: height in meters
  - start: start point of the wall in level coordinate system
  - end: end point of the wall in level coordinate system
  - size: size of the wall in grid units
  - frontSide: whether the front side faces interior, exterior, or unknown
  - backSide: whether the back side faces interior, exterior, or unknown
  `,
)
export type WallNode = z.infer<typeof WallNode>
