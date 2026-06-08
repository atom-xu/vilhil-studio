/**
 * @vilhil-managed-file
 *
 * 此文件由 VilHil 修改过：polygon / holes 加了 quantizePolygon 量化转换。
 * 其余字段与上游一致；之前曾被 VilHil 简化（删除 materialPreset / holeMetadata /
 * autoFromWalls），Phase 1.5 已恢复上游字段并把 quantizePolygon 重新应用。
 *
 * 合并上游时：上游所有字段保留；VilHil 的 quantizePolygon 不动；
 * 上游对 schema 的字段语义如有改动，优先采纳上游版本。
 *
 * 详见 docs/ARCHITECTURE-LAYERING.md §4、docs/UPSTREAM-PATCHES.md L13。
 */
import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'
import { quantizePolygon } from '../precision'
import { ItemNode } from './item'
import { SurfaceHoleMetadata } from './surface-hole-metadata'

export const CeilingNode = BaseNode.extend({
  id: objectId('ceiling'),
  type: nodeType('ceiling'),
  children: z.array(ItemNode.shape.id).default([]),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
  polygon: z.array(z.tuple([z.number(), z.number()])).transform(quantizePolygon),
  holes: z
    .array(z.array(z.tuple([z.number(), z.number()])))
    .default([])
    .transform((holes) => holes.map((h) => quantizePolygon(h))),
  holeMetadata: z.array(SurfaceHoleMetadata).default([]),
  height: z.number().default(2.5), // Height in meters
  autoFromWalls: z.boolean().default(false),
}).describe(
  dedent`
  Ceiling node - used to represent a ceiling in the building
  - polygon: array of [x, z] points defining the ceiling boundary
  - holes: array of polygons representing holes in the ceiling
  - holeMetadata: metadata parallel to holes, used to preserve manual and auto-managed cutouts
  - autoFromWalls: whether the ceiling is automatically generated from a closed wall loop
  `,
)

export type CeilingNode = z.infer<typeof CeilingNode>
