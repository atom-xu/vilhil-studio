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
  /**
   * 回路自定义元数据（per circuitId）
   *
   * 格式：`{ [circuitId]: { name?, color? } }`
   * - `name`：用户起的名字（"客厅射灯"），无值时 UI 用默认 "回路 N"
   * - `color`：自定义徽章颜色（HEX 字符串）；无值时按 lighting 子系统色或自动 hash
   *
   * 为什么挂在 level：回路是 level-scoped（编号器按楼层重置），元数据自然也归层。
   * 也避免给每盏灯都重复存一份回路名造成漂移。
   */
  circuitMeta: z
    .record(
      z.string(),
      z.object({
        name: z.string().optional(),
        color: z.string().optional(),
      }),
    )
    .optional(),
}).describe(
  dedent`
  Level node - used to represent a level in the building
  - children: array of floor, wall, ceiling, roof, item nodes
  - level: level number
  - northAngle: degrees clockwise from screen-up to true north (0 = north up)
  `,
)

export type LevelNode = z.infer<typeof LevelNode>
