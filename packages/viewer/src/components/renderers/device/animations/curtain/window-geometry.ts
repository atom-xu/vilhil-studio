/**
 * 窗户世界几何计算 —— 纯函数
 *
 * Wall.start/end: 2D [x, z] 级坐标
 * Window.position: 墙局部 [沿墙距起点, 高度, 0]
 * Window.width/height: 外部尺寸
 *
 * 本模块把这些数据转换为窗帘渲染需要的世界坐标参数。
 */

import type { WallNode, WindowNode } from '@pascal-app/core'

export interface WindowWorldGeometry {
  /** 窗户中心的世界坐标 */
  center: [number, number, number]
  /** 窗户宽度（沿墙方向） */
  width: number
  /** 窗户高度 */
  height: number
  /** 墙的沿长方向单位向量（平行于窗户长边） */
  wallDir: [number, number, number]
  /** 墙的法线方向（垂直于墙面指向室内侧，单位向量） */
  wallNormal: [number, number, number]
  /** 墙面的厚度（用于百叶窗定位到窗框内） */
  wallThickness: number
}

/**
 * 计算窗户的世界几何。
 * 返回 null 表示数据不完整（缺 wallId、window position 等）。
 */
export function computeWindowWorldGeometry(
  window: WindowNode,
  wall: WallNode,
): WindowWorldGeometry | null {
  const [sx, sz] = wall.start
  const [ex, ez] = wall.end
  const dx = ex - sx
  const dz = ez - sz
  const len = Math.hypot(dx, dz)
  if (len < 0.001) return null

  // 墙方向（沿长方向，单位向量，y=0）
  const wallDir: [number, number, number] = [dx / len, 0, dz / len]
  // 墙法线：以 frontSide='interior' 为正（用户室内侧）
  // 默认法线方向：对墙方向顺时针 90° = [dz, 0, -dx]/len
  // 但具体哪一侧是室内，取决于 frontSide / backSide。简化：默认取 [-dz, 0, dx]/len，
  // 由调用方根据实际效果按需反转。
  const wallNormal: [number, number, number] = [-dz / len, 0, dx / len]

  // 窗户在墙局部的沿墙距起点 = window.position[0]
  const alongWall = window.position[0]
  const windowCenterWorld: [number, number, number] = [
    sx + wallDir[0] * alongWall,
    window.position[1],
    sz + wallDir[2] * alongWall,
  ]

  return {
    center: windowCenterWorld,
    width: window.width,
    height: window.height,
    wallDir,
    wallNormal,
    wallThickness: wall.thickness ?? 0.2,
  }
}
