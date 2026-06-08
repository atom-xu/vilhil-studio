/**
 * @vilhil-managed-file
 *
 * 此文件由 VilHil 修改过：polygon / holes 加了 quantizePolygon 量化转换（与墙端点共用 1cm 网格）。
 * 其余字段与上游一致；之前曾被 VilHil 简化（删除 materialPreset / holeMetadata /
 * autoFromWalls），Phase 1.5 已恢复上游字段并把 quantizePolygon 重新应用。
 *
 * 合并上游时：上游所有字段保留；VilHil 的 quantizePolygon 不动；
 * 上游对 schema 的字段语义如有改动，优先采纳上游版本。
 *
 * 详见 docs/ARCHITECTURE-LAYERING.md §4、docs/UPSTREAM-PATCHES.md L14。
 */
import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'
import { quantizePolygon } from '../precision'
import { SurfaceHoleMetadata } from './surface-hole-metadata'

export const SlabNode = BaseNode.extend({
  id: objectId('slab'),
  type: nodeType('slab'),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
  // polygon / holes 经 precision.ATOM (1cm) 量化，与墙端点共用同一网格
  polygon: z.array(z.tuple([z.number(), z.number()])).transform(quantizePolygon),
  holes: z
    .array(z.array(z.tuple([z.number(), z.number()])))
    .default([])
    .transform((holes) => holes.map((h) => quantizePolygon(h))),
  holeMetadata: z.array(SurfaceHoleMetadata).default([]),
  elevation: z.number().default(0.05), // Elevation in meters
  autoFromWalls: z.boolean().default(false),
}).describe(
  dedent`
  Slab node - used to represent a slab/floor in the building
  - polygon: array of [x, z] points defining the slab boundary
  - holes: array of [x, z] polygons representing cutouts in the slab
  - holeMetadata: metadata parallel to holes, used to preserve manual and auto-managed cutouts
  - elevation: elevation in meters
  - autoFromWalls: whether the slab is automatically generated from a closed wall loop
  `,
)

export type SlabNode = z.infer<typeof SlabNode>
