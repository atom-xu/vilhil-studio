import type { WallNode } from '../../schema'
import { type Point2D, pointToKey, type WallMiterData } from './wall-mitering'

export const DEFAULT_WALL_THICKNESS = 0.1
export const DEFAULT_WALL_HEIGHT = 2.5

export function getWallThickness(wallNode: WallNode): number {
  return wallNode.thickness ?? DEFAULT_WALL_THICKNESS
}

export function getWallPlanFootprint(wallNode: WallNode, miterData: WallMiterData): Point2D[] {
  const { junctionData, junctions } = miterData

  const wallStart: Point2D = { x: wallNode.start[0], y: wallNode.start[1] }
  const wallEnd: Point2D = { x: wallNode.end[0], y: wallNode.end[1] }
  const thickness = getWallThickness(wallNode)
  const halfT = thickness / 2

  const v = { x: wallEnd.x - wallStart.x, y: wallEnd.y - wallStart.y }
  const L = Math.sqrt(v.x * v.x + v.y * v.y)
  if (L < 1e-9) {
    return []
  }
  const nUnit = { x: -v.y / L, y: v.x / L }

  const keyStart = pointToKey(wallStart)
  const keyEnd = pointToKey(wallEnd)

  const startJunction = junctionData.get(keyStart)?.get(wallNode.id)
  const endJunction = junctionData.get(keyEnd)?.get(wallNode.id)

  const pStartLeft: Point2D = startJunction?.left || {
    x: wallStart.x + nUnit.x * halfT,
    y: wallStart.y + nUnit.y * halfT,
  }
  const pStartRight: Point2D = startJunction?.right || {
    x: wallStart.x - nUnit.x * halfT,
    y: wallStart.y - nUnit.y * halfT,
  }

  // Junction offsets are stored relative to the outgoing direction.
  const pEndLeft: Point2D = endJunction?.right || {
    x: wallEnd.x + nUnit.x * halfT,
    y: wallEnd.y + nUnit.y * halfT,
  }
  const pEndRight: Point2D = endJunction?.left || {
    x: wallEnd.x - nUnit.x * halfT,
    y: wallEnd.y - nUnit.y * halfT,
  }

  // T 形节点（直通墙）检测：
  //   T 形：插入中心点会在直通墙内部产生 V 形描边缺口 → 排除 wallStart/wallEnd
  //   L 形：wallStart 与 pStartLeft/pStartRight 三点共线 → 插入无几何影响
  //   四通（十字）：wallStart 填充节点中心缺口，避免 3D 挤出产生三角形空洞 → 插入
  const hasPassthroughAtStart =
    junctions.get(keyStart)?.connectedWalls.some((cw) => cw.endType === 'passthrough') ?? false
  const hasPassthroughAtEnd =
    junctions.get(keyEnd)?.connectedWalls.some((cw) => cw.endType === 'passthrough') ?? false

  const polygon: Point2D[] = [pStartRight, pEndRight]
  if (endJunction && !hasPassthroughAtEnd) {
    polygon.push(wallEnd)
  }
  polygon.push(pEndLeft, pStartLeft)
  if (startJunction && !hasPassthroughAtStart) {
    polygon.push(wallStart)
  }

  return polygon
}
