import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { CeilingNode } from './ceiling'
import { GuideNode } from './guide'
import { RoofNode } from './roof'
import { ScanNode } from './scan'
import { SlabNode } from './slab'
import { StairNode } from './stair'
import { WallNode } from './wall'
import { ZoneNode } from './zone'

export const LevelNode = BaseNode.extend({
  id: objectId('level'),
  type: nodeType('level'),
  children: z
    .array(
      z.union([
        WallNode.shape.id,
        ZoneNode.shape.id,
        SlabNode.shape.id,
        CeilingNode.shape.id,
        RoofNode.shape.id,
        StairNode.shape.id,
        ScanNode.shape.id,
        GuideNode.shape.id,
      ]),
    )
    .default([]),
  // Specific props
  level: z.number().default(0),
  // 建筑朝向：正北方向相对于平面图"上方"顺时针旋转的角度（度）
  // 0 = 上北下南（默认）；90 = 北向右；180 = 北向下；270 = 北向左
  northAngle: z.number().min(0).max(360).default(0),
}).describe(
  dedent`
  Level node - used to represent a level in the building
  - children: array of floor, wall, ceiling, roof, item nodes
  - level: level number
  - northAngle: degrees clockwise from screen-up to true north (0 = north up)
  `,
)

export type LevelNode = z.infer<typeof LevelNode>
