/**
 * @vilhil-managed-file
 *
 * 此文件由 VilHil 修改过：
 *   - position 加了 quantizePoint3 量化转换（precision.ATOM = 1cm 网格对齐）
 *   - 恢复了原 Pascal 上游字段为 optional（materialPreset / topMaterial / edgeMaterial / wallMaterial 及其 preset 字段）
 *   - 恢复了上游导出的 RoofSurfaceMaterialSpec 类型与 getEffectiveRoofSurfaceMaterial
 *
 * 合并上游时：上游所有字段保持 optional；VilHil 的 quantizePoint3 不动；
 * 上游对该 schema 的字段语义如有改动，优先采纳上游版本。
 *
 * 详见 docs/ARCHITECTURE-LAYERING.md §4、docs/UPSTREAM-PATCHES.md L7。
 */
import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import type { MaterialSchema as MaterialSchemaType } from '../material'
import { MaterialSchema } from '../material'
import { quantizePoint3 } from '../precision'
import { RoofSegmentNode } from './roof-segment'

export type RoofSurfaceMaterialRole = 'top' | 'edge' | 'wall'
export type RoofSurfaceMaterialSpec = {
  material?: MaterialSchemaType
  materialPreset?: string
}

export const RoofNode = BaseNode.extend({
  id: objectId('roof'),
  type: nodeType('roof'),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
  topMaterial: MaterialSchema.optional(),
  topMaterialPreset: z.string().optional(),
  edgeMaterial: MaterialSchema.optional(),
  edgeMaterialPreset: z.string().optional(),
  wallMaterial: MaterialSchema.optional(),
  wallMaterialPreset: z.string().optional(),
  position: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 0])
    .transform(quantizePoint3),
  // Rotation around Y axis in radians
  rotation: z.number().default(0),
  // Child roof segment IDs
  children: z.array(RoofSegmentNode.shape.id).default([]),
}).describe(
  dedent`
  Roof group node - a container for one or more RoofSegmentNodes.
  Acts as a group that holds individual roof segments which can be combined
  to form complex roof shapes.
  - position: center position of the roof group
  - rotation: rotation around Y axis
  - children: array of RoofSegmentNode IDs
  `,
)

export type RoofNode = z.infer<typeof RoofNode>

function getLegacyRoofSurfaceMaterial(node: RoofNode): RoofSurfaceMaterialSpec {
  return {
    material: node.material,
    materialPreset: node.materialPreset,
  }
}

export function getEffectiveRoofSurfaceMaterial(
  node: RoofNode,
  role: RoofSurfaceMaterialRole,
): RoofSurfaceMaterialSpec {
  if (role === 'top') {
    if (node.topMaterial !== undefined || typeof node.topMaterialPreset === 'string') {
      return {
        material: node.topMaterial,
        materialPreset:
          typeof node.topMaterialPreset === 'string' ? node.topMaterialPreset : undefined,
      }
    }
  }

  if (role === 'edge') {
    if (node.edgeMaterial !== undefined || typeof node.edgeMaterialPreset === 'string') {
      return {
        material: node.edgeMaterial,
        materialPreset:
          typeof node.edgeMaterialPreset === 'string' ? node.edgeMaterialPreset : undefined,
      }
    }
  }

  if (role === 'wall') {
    if (node.wallMaterial !== undefined || typeof node.wallMaterialPreset === 'string') {
      return {
        material: node.wallMaterial,
        materialPreset:
          typeof node.wallMaterialPreset === 'string' ? node.wallMaterialPreset : undefined,
      }
    }
  }

  // No cross-role fallback: an unset role resolves only to the legacy
  // catch-all (which covers all three roles for back-compat) and otherwise
  // to the caller's theme default. Painting one surface must never bleed
  // onto the others.
  return getLegacyRoofSurfaceMaterial(node)
}
