/**
 * @vilhil-managed-file
 *
 * 此文件由 VilHil 修改过：
 *   - start/end 加了 quantizePoint 量化转换（precision.ATOM = 1cm 网格对齐）
 *   - 新增 startNodeId/endNodeId 可选字段（F2 阶段"拖动节点联动"软引用）
 *   - 恢复了原 Pascal 上游字段为 optional（materialPreset / 内外饰面 / curveOffset）
 *   - 恢复了上游导出的 WallSurfaceMaterialSpec 类型与材质解析辅助函数
 *
 * 合并上游时：上游所有字段保持 optional；VilHil 的 quantizePoint 与 startNodeId/endNodeId 不动；
 * 上游对该 schema 的字段语义如有改动，优先采纳上游版本。
 *
 * 详见 docs/ARCHITECTURE-LAYERING.md §4、docs/UPSTREAM-PATCHES.md L6。
 */
import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'
import { quantizePoint } from '../precision'
import { DoorNode } from './door'
import { ItemNode } from './item'
import { WindowNode } from './window'

export const WallNode = BaseNode.extend({
  id: objectId('wall'),
  type: nodeType('wall'),
  children: z
    .array(z.union([ItemNode.shape.id, DoorNode.shape.id, WindowNode.shape.id]))
    .default([]),
  // Legacy single-material wall finish. Read for backward compatibility only.
  material: MaterialSchema.optional(),
  // Legacy single-material wall finish preset. Read for backward compatibility only.
  materialPreset: z.string().optional(),
  interiorMaterial: MaterialSchema.optional(),
  interiorMaterialPreset: z.string().optional(),
  exteriorMaterial: MaterialSchema.optional(),
  exteriorMaterialPreset: z.string().optional(),
  thickness: z.number().optional(),
  height: z.number().optional(),
  curveOffset: z.number().optional(),
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
  - curveOffset: midpoint sagitta offset used to bend the wall into an arc
  - start: start point of the wall in level coordinate system
  - end: end point of the wall in level coordinate system
  - size: size of the wall in grid units
  - frontSide: whether the front side faces interior, exterior, or unknown
  - backSide: whether the back side faces interior, exterior, or unknown
  `,
)
export type WallNode = z.infer<typeof WallNode>

export type WallSurfaceSide = 'interior' | 'exterior'

export type WallSurfaceMaterialSpec = {
  material?: z.infer<typeof MaterialSchema>
  materialPreset?: string
}

type WallSurfaceMaterialSource = {
  material?: z.infer<typeof MaterialSchema>
  materialPreset?: string
  interiorMaterial?: z.infer<typeof MaterialSchema>
  interiorMaterialPreset?: string
  exteriorMaterial?: z.infer<typeof MaterialSchema>
  exteriorMaterialPreset?: string
}

function getConfiguredWallSurfaceMaterial(
  wall: WallSurfaceMaterialSource,
  side: WallSurfaceSide,
): WallSurfaceMaterialSpec {
  if (side === 'interior') {
    return {
      material: wall.interiorMaterial,
      materialPreset: wall.interiorMaterialPreset,
    }
  }

  return {
    material: wall.exteriorMaterial,
    materialPreset: wall.exteriorMaterialPreset,
  }
}

function hasSurfaceMaterial(spec: WallSurfaceMaterialSpec): boolean {
  return spec.material !== undefined || typeof spec.materialPreset === 'string'
}

export function getEffectiveWallSurfaceMaterial(
  wall: WallSurfaceMaterialSource,
  side: WallSurfaceSide,
): WallSurfaceMaterialSpec {
  const configured = getConfiguredWallSurfaceMaterial(wall, side)
  if (hasSurfaceMaterial(configured)) {
    return configured
  }

  return {
    material: wall.material,
    materialPreset: wall.materialPreset,
  }
}

export function getWallSurfaceMaterialSignature(spec: WallSurfaceMaterialSpec): string {
  return JSON.stringify({
    material: spec.material ?? null,
    materialPreset: spec.materialPreset ?? null,
  })
}
