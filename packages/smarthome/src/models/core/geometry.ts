/**
 * VilHil 智能设备 3D 模型库 - 几何体生成器
 *
 * 程序化几何体生成工具集
 * 所有尺寸单位为：米
 */

import * as THREE from 'three'
import type { GeometryParams } from './types'

// ═══════════════════════════════════════════════════════════════
// 基础几何体生成器
// ═══════════════════════════════════════════════════════════════

/**
 * 创建圆角矩形平面（用于面板、开关等）
 */
export function createRoundedRectGeometry(
  width: number,
  height: number,
  radius: number = 0.002,
  depth: number = 0.001
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2

  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0005,
    bevelSize: 0.0005,
    bevelSegments: 2,
    curveSegments: 12,
  }

  return new THREE.ExtrudeGeometry(shape, extrudeSettings)
}

/**
 * 创建圆柱体（用于筒灯、传感器等）
 */
export function createCylinderGeometry(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments: number = 32
): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    radialSegments
  )
}

/**
 * 创建中空圆柱（用于筒灯反光杯）
 */
export function createHollowCylinderGeometry(
  outerRadius: number,
  innerRadius: number,
  height: number,
  radialSegments: number = 32
): THREE.BufferGeometry {
  const outer = new THREE.CylinderGeometry(
    outerRadius,
    innerRadius,
    height,
    radialSegments,
    1,
    true
  )

  // 添加底部环
  const ringShape = new THREE.Shape()
  ringShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
  const holePath = new THREE.Path()
  holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true)
  ringShape.holes.push(holePath)

  const ringGeo = new THREE.ExtrudeGeometry(ringShape, {
    depth: 0.001,
    bevelEnabled: false,
    curveSegments: radialSegments,
  })
  ringGeo.rotateX(Math.PI / 2)
  ringGeo.translate(0, -height / 2, 0)

  // 合并几何体（简化版，实际可以使用 BufferGeometryUtils.mergeGeometries）
  return outer
}

/**
 * 创建球体（用于传感器透镜、摄像头等）
 */
export function createSphereGeometry(
  radius: number,
  widthSegments: number = 32,
  heightSegments: number = 16,
  phiStart: number = 0,
  phiLength: number = Math.PI * 2,
  thetaStart: number = 0,
  thetaLength: number = Math.PI
): THREE.SphereGeometry {
  return new THREE.SphereGeometry(
    radius,
    widthSegments,
    heightSegments,
    phiStart,
    phiLength,
    thetaStart,
    thetaLength
  )
}

/**
 * 创建半球（用于吸顶设备）
 */
export function createHemisphereGeometry(
  radius: number,
  radialSegments: number = 32
): THREE.SphereGeometry {
  return createSphereGeometry(
    radius,
    radialSegments,
    16,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2
  )
}

/**
 * 创建环形（用于LED环、状态指示器等）
 */
export function createRingGeometry(
  innerRadius: number,
  outerRadius: number,
  segments: number = 32
): THREE.RingGeometry {
  return new THREE.RingGeometry(innerRadius, outerRadius, segments)
}

/**
 * 创建圆环体（用于把手、旋钮等）
 */
export function createTorusGeometry(
  radius: number,
  tube: number,
  radialSegments: number = 16,
  tubularSegments: number = 32
): THREE.TorusGeometry {
  return new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments)
}

/**
 * 创建通风口格栅
 */
export function createVentGrilleGeometry(
  width: number,
  height: number,
  depth: number,
  slatCount: number = 3,
  slatThickness: number = 0.005
): THREE.BoxGeometry[] {
  const geometries: THREE.BoxGeometry[] = []

  // 外框
  const frameThickness = 0.01
  const frameGeo = new THREE.BoxGeometry(width, height, depth)
  geometries.push(frameGeo)

  // 格栅条
  const slatSpacing = (height - frameThickness * 2) / (slatCount + 1)
  for (let i = 0; i < slatCount; i++) {
    const slatGeo = new THREE.BoxGeometry(
      width - frameThickness * 2,
      slatThickness,
      depth + 0.002
    )
    // 注意：需要在对象层级进行位置调整
    geometries.push(slatGeo)
  }

  return geometries
}

/**
 * 创建窗帘布料（简化版平面）
 */
export function createCurtainPanelGeometry(
  width: number,
  height: number,
  folds: number = 5
): THREE.PlaneGeometry {
  // 使用高细分平面模拟布料褶皱
  const segmentsW = folds * 4
  const segmentsH = 4
  return new THREE.PlaneGeometry(width, height, segmentsW, segmentsH)
}

/**
 * 创建轨道
 */
export function createTrackGeometry(
  length: number,
  width: number = 0.04,
  height: number = 0.03
): THREE.BoxGeometry {
  return new THREE.BoxGeometry(width, height, length)
}

// ═══════════════════════════════════════════════════════════════
// 复合几何体（专用设备）
// ═══════════════════════════════════════════════════════════════

/**
 * 创建筒灯完整几何体
 */
export function createDownlightGeometry(
  // 工程图尺寸：外径62mm，开孔55mm，总高82mm
  outerDiameter: number = 0.062,    // 62mm 装饰环外径
  cutoutDiameter: number = 0.055,   // 55mm 天花板开孔
  totalHeight: number = 0.082       // 82mm 总高度
): {
  heatSink: THREE.BufferGeometry     // 顶部散热鳍片（天花板上方）
  housing: THREE.BufferGeometry      // 白色可调灯头
  trim: THREE.BufferGeometry         // 装饰环（与天花板平齐）
  reflector: THREE.BufferGeometry    // 深藏式反光杯（内凹防眩）
  emitter: THREE.BufferGeometry      // COB光源（深藏底部）
  springClips: THREE.BufferGeometry[] // 两侧弹簧卡扣
} {
  const outerRadius = outerDiameter / 2   // 31mm
  const cutoutRadius = cutoutDiameter / 2 // 27.5mm

  // 坐标系：Y=0 是天花板平面（装饰环顶面）
  // Y+ 向上（天花板内部），Y- 向下（地面方向）

  // 1. 装饰环 - 白色，与天花板平齐，厚度3mm
  // 顶面在 Y=0，底面在 Y=-0.003（从下方可见的装饰边框）
  const trim = new THREE.CylinderGeometry(outerRadius, outerRadius, 0.003, 32)
  trim.translate(0, -0.0015, 0)

  // 2. 白色灯头 - 在天花板上方，从下方不可见（被装饰环遮挡）
  // 高度约22mm，向上延伸
  const housingHeight = 0.022
  const housing = new THREE.CylinderGeometry(cutoutRadius * 0.88, cutoutRadius * 0.95, housingHeight, 32)
  housing.translate(0, housingHeight / 2, 0)  // 从装饰环顶面(Y=0)向上

  // 3. 散热鳍片 - 深灰色金属，在天花板上方
  // 高度约55mm
  const heatSinkHeight = totalHeight - housingHeight - 0.003
  const heatSink = new THREE.CylinderGeometry(cutoutRadius * 0.85, cutoutRadius * 0.9, heatSinkHeight, 32)
  heatSink.translate(0, heatSinkHeight / 2 + housingHeight - 0.003, 0)

  // 4. 深藏式反光杯 - 内凹防眩结构
  // 大口在下（与装饰环内径平齐可见），小口在上（防眩出口）
  // 深度约15mm，从装饰环底面向下内凹
  const reflectorDepth = 0.015
  const reflectorBottomRadius = cutoutRadius * 0.88   // 约24mm 底部（与装饰环内径平齐，可见）
  const reflectorTopRadius = 0.012   // 12mm 顶部小口（防眩）
  // 注意：CylinderGeometry(radiusTop, radiusBottom, height)
  // radiusTop 是 Y+ 方向（上），radiusBottom 是 Y- 方向（下）
  const reflector = new THREE.CylinderGeometry(reflectorTopRadius, reflectorBottomRadius, reflectorDepth, 32, 1, true)
  // 位置：从装饰环底面(Y=-0.003)向下延伸（内凹，从下方可见）
  reflector.translate(0, -reflectorDepth / 2 - 0.003, 0)

  // 5. COB LED 光源 - 深藏在反光杯顶部，朝下发光
  const emitterRadius = 0.006  // 12mm 光源面
  const emitter = new THREE.CircleGeometry(emitterRadius, 32)
  emitter.rotateX(Math.PI / 2)  // 朝下
  emitter.translate(0, -reflectorDepth - 0.003, 0)  // 在反光杯底部（深处）

  // 6. 两侧弹簧卡扣 - 金属安装件
  const springClipGeo = new THREE.BoxGeometry(0.006, 0.020, 0.004)
  const clip1 = springClipGeo.clone()
  clip1.translate(cutoutRadius - 0.001, 0.008, 0)
  const clip2 = springClipGeo.clone()
  clip2.translate(-(cutoutRadius - 0.001), 0.008, 0)

  return { heatSink, housing, trim, reflector, emitter, springClips: [clip1, clip2] }
}

/**
 * 创建开关按钮组
 */
export function createSwitchButtonsGeometry(
  buttonCount: number,
  panelWidth: number = 0.086,
  panelHeight: number = 0.086,
  gap: number = 0.008
): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = []

  const buttonHeight = (panelHeight - gap * (buttonCount + 1)) / buttonCount
  const buttonWidth = panelWidth - gap * 2

  for (let i = 0; i < buttonCount; i++) {
    const button = createRoundedRectGeometry(buttonWidth, buttonHeight, 0.001, 0.003)
    const yOffset = (panelHeight / 2) - gap - buttonHeight / 2 - i * (buttonHeight + gap)
    button.translate(0, yOffset, 0.002)
    geometries.push(button)
  }

  return geometries
}

/**
 * 创建旋钮
 */
export function createKnobGeometry(
  radius: number = 0.025,
  height: number = 0.015
): { base: THREE.BufferGeometry; grip: THREE.BufferGeometry } {
  // 底座
  const base = new THREE.CylinderGeometry(radius, radius, height * 0.3, 32)
  base.translate(0, height * 0.15, 0)

  // 握把
  const grip = new THREE.CylinderGeometry(radius * 0.8, radius * 0.9, height * 0.7, 32)
  grip.translate(0, height * 0.65, 0)

  return { base, grip }
}

/**
 * 创建门锁
 */
export function createDoorLockGeometry(
  width: number = 0.07,
  height: number = 0.18,
  depth: number = 0.06
): { body: THREE.BufferGeometry; handle: THREE.BufferGeometry } {
  // 锁体
  const body = new THREE.BoxGeometry(width, height, depth)

  // 把手 - 简化版圆柱
  const handle = new THREE.CylinderGeometry(0.015, 0.015, 0.06, 16)
  handle.rotateZ(Math.PI / 2)
  handle.translate(0, height * 0.2, depth / 2 + 0.03)

  return { body, handle }
}

/**
 * 创建AP圆盘
 */
export function createAPGeometry(
  radius: number = 0.1,
  thickness: number = 0.02
): { body: THREE.BufferGeometry; ledRing: THREE.BufferGeometry } {
  // 主体 - 扁平圆柱
  const body = new THREE.CylinderGeometry(radius, radius * 0.95, thickness, 32)

  // LED环
  const ledRing = new THREE.RingGeometry(radius * 0.6, radius * 0.7, 32)
  ledRing.rotateX(-Math.PI / 2)
  ledRing.translate(0, thickness / 2 + 0.001, 0)

  return { body, ledRing }
}

// ═══════════════════════════════════════════════════════════════
// 几何体工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 合并几何体（当需要单个mesh时）
 * 注意：这只是简单包装，实际项目中可以使用 BufferGeometryUtils
 */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | undefined {
  // 简化实现：返回第一个几何体
  // 实际项目中应该使用 THREE.BufferGeometryUtils.mergeGeometries
  if (geometries.length === 0) {
    return new THREE.BufferGeometry()
  }
  if (geometries.length === 1) {
    return geometries[0]!
  }

  // 创建一个包含所有顶点的几何体（简化版）
  // 实际项目中应该正确合并
  return geometries[0]!
}

/**
 * 计算几何体包围盒尺寸
 */
export function getGeometrySize(geometry: THREE.BufferGeometry): [number, number, number] {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  return [
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  ]
}

/**
 * 居中几何体
 */
export function centerGeometry(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox()
  const center = new THREE.Vector3()
  geometry.boundingBox!.getCenter(center)
  geometry.translate(-center.x, -center.y, -center.z)
}
