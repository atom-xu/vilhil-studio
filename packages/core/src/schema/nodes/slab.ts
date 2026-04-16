import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'
import { quantizePolygon } from '../precision'

export const SlabNode = BaseNode.extend({
  id: objectId('slab'),
  type: nodeType('slab'),
  material: MaterialSchema.optional(),
  // polygon / holes 经 precision.ATOM (1cm) 量化，与墙端点共用同一网格
  polygon: z.array(z.tuple([z.number(), z.number()])).transform(quantizePolygon),
  holes: z
    .array(z.array(z.tuple([z.number(), z.number()])))
    .default([])
    .transform((holes) => holes.map((h) => quantizePolygon(h))),
  elevation: z.number().default(0.05), // Elevation in meters
}).describe(
  dedent`
  Slab node - used to represent a slab/floor in the building
  - polygon: array of [x, z] points defining the slab boundary
  - elevation: elevation in meters
  `,
)

export type SlabNode = z.infer<typeof SlabNode>
