import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'
import { quantizePolygon } from '../precision'
import { ItemNode } from './item'

export const CeilingNode = BaseNode.extend({
  id: objectId('ceiling'),
  type: nodeType('ceiling'),
  children: z.array(ItemNode.shape.id).default([]),
  material: MaterialSchema.optional(),
  polygon: z.array(z.tuple([z.number(), z.number()])).transform(quantizePolygon),
  holes: z
    .array(z.array(z.tuple([z.number(), z.number()])))
    .default([])
    .transform((holes) => holes.map((h) => quantizePolygon(h))),
  height: z.number().default(2.5), // Height in meters
}).describe(
  dedent`
  Ceiling node - used to represent a ceiling in the building
  - polygon: array of [x, z] points defining the ceiling boundary
  - holes: array of polygons representing holes in the ceiling
  `,
)

export type CeilingNode = z.infer<typeof CeilingNode>
