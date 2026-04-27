'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ─── 视角系统（Overview / Detail 两层 + Module 过滤）───────────────────────────

export type ModuleKey = 'lighting' | 'curtain' | 'sensor' | 'panel' | 'hvac' | 'av' | 'security' | 'network'

export type ViewLevel = 'global' | 'overview' | 'detail'

export interface ViewState {
  level: ViewLevel
  module: ModuleKey
  targetId?: string        // lighting detail → room id；其他 detail → device id
}

export type Vec3Tuple = [number, number, number]

// 相机单段动画（一次推进 / 一次后退）
export interface CameraShot {
  fromPos: Vec3Tuple
  fromTgt: Vec3Tuple
  toPos:   Vec3Tuple
  toTgt:   Vec3Tuple
  midPos?: Vec3Tuple                    // 贝塞尔中转点（弧线过墙顶），无则直线
  duration: number
  t: number                             // 0..1 动画进度
  onDone?: () => void                   // 落位回调（用于复合动画接力）
}

// 外部通过 ref 访问的相机 API
// play 的参数不含 t —— 由 play 内部初始化
export type CameraShotInput = Omit<CameraShot, 't'>
export interface CameraRigApi {
  play: (shot: CameraShotInput) => void
  isAnimating: () => boolean
  sampleCurrent: () => { pos: Vec3Tuple; tgt: Vec3Tuple }
}

// ─── 相机曲线 & 插值工具 ──────────────────────────────────────────────────────

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function bezier2(a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, t: number): Vec3Tuple {
  const u = 1 - t
  return [
    u * u * a[0] + 2 * u * t * b[0] + t * t * c[0],
    u * u * a[1] + 2 * u * t * b[1] + t * t * c[1],
    u * u * a[2] + 2 * u * t * b[2] + t * t * c[2],
  ]
}

export function lerp3(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

export function sampleShot(shot: CameraShot, tRaw: number): { pos: Vec3Tuple; tgt: Vec3Tuple } {
  const t = easeInOutCubic(Math.min(1, Math.max(0, tRaw)))
  const pos = shot.midPos
    ? bezier2(shot.fromPos, shot.midPos, shot.toPos, t)
    : lerp3(shot.fromPos, shot.toPos, t)
  const tgt = lerp3(shot.fromTgt, shot.toTgt, t)   // target 永远直线插值
  return { pos, tgt }
}

// 弧线中转点（贝塞尔控制点）：
//   下降（to.y 明显低于 from.y）：控制点高于起点，形成"先升后俯冲"的电影感弧线
//   上升或水平：控制点位于两端中值上方，形成平滑抛物弧
export function computeArcMidpoint(from: Vec3Tuple, to: Vec3Tuple): Vec3Tuple {
  const dx = to[0] - from[0]
  const dz = to[2] - from[2]
  const horiz = Math.hypot(dx, dz)
  const mx      = (from[0] + to[0]) * 0.5
  const mz      = (from[2] + to[2]) * 0.5
  const absDY   = Math.abs(to[1] - from[1])
  // 旧逻辑最小抬升固定 3m，短距离切换会出现明显“先起飞再落下”的突兀感。
  // 新逻辑按水平距离 + 高差自适应，限制到合理区间，保证近距稳、远距有电影感。
  const liftH   = THREE.MathUtils.clamp(horiz * 0.2 + absDY * 0.25, 1.2, 5.5)
  const midY    = to[1] < from[1] - 1
    ? from[1] + liftH                         // 下降：控制点高于起点 → 俯冲弧
    : (from[1] + to[1]) * 0.5 + liftH         // 上升/水平：标准抛物弧
  return [mx, midY, mz]
}

export function estimateShotDuration(
  fromPos: Vec3Tuple,
  toPos: Vec3Tuple,
  fromTgt: Vec3Tuple,
  toTgt: Vec3Tuple,
): number {
  const moveDist = Math.hypot(
    toPos[0] - fromPos[0],
    toPos[1] - fromPos[1],
    toPos[2] - fromPos[2],
  )
  const tgtDist = Math.hypot(
    toTgt[0] - fromTgt[0],
    toTgt[1] - fromTgt[1],
    toTgt[2] - fromTgt[2],
  )
  // 基准 0.58s，按相机位移 + 目标位移加时，统一约束区间避免过慢/过快。
  const dur = 0.58 + moveDist * 0.04 + tgtDist * 0.03
  return THREE.MathUtils.clamp(dur, 0.55, 1.35)
}

// ─── Pose Resolvers（每种视角的相机预设位姿）─────────────────────────────────

export interface PoseInput {
  bboxCx: number
  bboxCz: number
  bboxSpan: number
  rooms: Array<{ id: string; cx: number; cz: number; radius: number; width: number; depth: number }>
  devices: Array<{ id: string; position: Vec3Tuple }>
}

function resolveBearingXZ(
  target: Vec3Tuple,
  fromPos?: Vec3Tuple,
  fallback: [number, number] = [0.5, -0.866],
): [number, number] {
  if (!fromPos) return fallback
  const dx = fromPos[0] - target[0]
  const dz = fromPos[2] - target[2]
  const len = Math.hypot(dx, dz)
  if (len < 0.001) return fallback
  return [dx / len, dz / len]
}

// Canvas 相机 FOV（垂直），写死 50°（和 Canvas 设置一致）
const CAMERA_FOV_DEG = 50
const ROOM_DETAIL_TARGET_Y = 1.2

// 坐标系：+X=东, -X=西, +Z=北, -Z=南
// 坐标系：+X=东，-Z=北，+Z=南（2D图纸Y↓映射到3D+Z）
// 相机在东北（+X, -Z），朝西南看建筑正面
// 方位角约30°偏东（sin30°/cos30°=0.5/0.866，由用户实测位置推导）
// scale 下限15m，防止小建筑视距/高度太低

// Global Overview：与 page.tsx 初始相机位置保持完全一致，避免 backToGlobal 飞到错误位置
export function resolveGlobalOverviewPose(input: PoseInput, fromPos?: Vec3Tuple): { pos: Vec3Tuple; tgt: Vec3Tuple } {
  const scale = Math.max(input.bboxSpan, 10)
  // 全局总览：低机位斜看（再平一点），优先稳定体块比例，减弱“上大下小”
  const horizDist = scale * 1.85
  const tgt: Vec3Tuple = [input.bboxCx, 0, input.bboxCz]
  const [dirX, dirZ] = resolveBearingXZ(tgt, fromPos)
  const pos: Vec3Tuple = [
    tgt[0] + horizDist * dirX,
    scale * 0.78,
    tgt[2] + horizDist * dirZ,
  ]
  return { pos, tgt }
}

// Module Overview：与 Global 使用完全一致的位姿
// 切换子系统模块时相机不移动，只改变 UI 状态；仅 Detail zoom 才真正推进
// 旧值 horizDist=1.2x / height=2.8x 与 global 差距太大，导致点模块按钮时相机向后飞远
export function resolveOverviewPose(input: PoseInput, fromPos?: Vec3Tuple): { pos: Vec3Tuple; tgt: Vec3Tuple } {
  return resolveGlobalOverviewPose(input, fromPos)
}

// Lighting Detail：房间近俯视（保留 8° 斜视避免 lookAt 奇异），
// xz 偏移方向继承当前相机的方位 → 不会"转正"到固定方向
// 相机至 targetY 的垂直距离 H 按 FOV + 长边精算
export function resolveLightingDetailPose(
  input: PoseInput,
  roomId: string,
  fromPos?: Vec3Tuple,
): { pos: Vec3Tuple; tgt: Vec3Tuple } | null {
  const room = input.rooms.find((r) => r.id === roomId)
  if (!room) return null
  const longEdge = Math.max(room.width, room.depth)
  const halfFov  = (CAMERA_FOV_DEG * 0.5 * Math.PI) / 180
  const margin   = 1.3
  const camH     = Math.max((longEdge * 0.5) / Math.tan(halfFov) * margin, 3.0)

  // 俯视保留 14° 斜视（tan 14° ≈ 0.25）：
  //   - 远离 lookAt(up≈forward) 的奇异区（8° 在某些房间位置仍会触发轻微跳跃）
  //   - 设最小水平偏移 1.2m：保证不管房间多大、相机多高，forward 永远有明显横向分量
  const TILT_RATIO = 0.25
  const xzOffset = Math.max(camH * TILT_RATIO, 1.2)

  // 默认偏向 +z。如果提供了 fromPos 且 xz 距离足够，则沿用当前相机相对 target 的方位
  // 阈值放宽到 1.0m：如果相机几乎在目标正上方，继承的方位极其不稳定，退回默认
  let ox = 0, oz = 1
  if (fromPos) {
    const dx = fromPos[0] - room.cx
    const dz = fromPos[2] - room.cz
    const len = Math.hypot(dx, dz)
    if (len > 1.0) { ox = dx / len; oz = dz / len }
  }

  // 与 RoomBaseLight 的 Html 锚点保持同一空间点（y=1.2）：
  // “房间按钮位置”就是 detail 旋转轴心，避免视觉上的偏轴感。
  const tgt: Vec3Tuple = [room.cx, ROOM_DETAIL_TARGET_Y, room.cz]
  const pos: Vec3Tuple = [
    room.cx + ox * xzOffset,
    tgt[1] + camH,
    room.cz + oz * xzOffset,
  ]
  return { pos, tgt }
}

// Device Detail：设备前方 1.5m，仰角 15°
export function resolveDeviceDetailPose(
  input: PoseInput,
  deviceId: string,
  fromPos?: Vec3Tuple,
): { pos: Vec3Tuple; tgt: Vec3Tuple } | null {
  const device = input.devices.find((d) => d.id === deviceId)
  if (!device) return null
  const [dx, dy, dz] = device.position
  // 设备特写：优先继承当前相机方位，避免切换时"先转向再推进"。
  // 若当前方位不可用，再回退到建筑中心外侧方向。
  const fallbackBearing: [number, number] = (() => {
    const vx = dx - input.bboxCx
    const vz = dz - input.bboxCz
    const len = Math.hypot(vx, vz)
    if (len < 0.001) return [0.5, -0.866]
    return [vx / len, vz / len]
  })()

  const tgt: Vec3Tuple = [dx, dy + 0.12, dz]
  const [nx, nz] = resolveBearingXZ(tgt, fromPos, fallbackBearing)
  const dist = THREE.MathUtils.clamp(input.bboxSpan * 0.2, 1.7, 3.0)
  const pos: Vec3Tuple = [
    dx + nx * dist,
    dy + THREE.MathUtils.clamp(dist * 0.58, 1.05, 1.95),
    dz + nz * dist,
  ]
  return { pos, tgt }
}

export function resolvePoseForView(
  view: ViewState,
  input: PoseInput,
  fromPos?: Vec3Tuple,
): { pos: Vec3Tuple; tgt: Vec3Tuple } | null {
  if (view.level === 'global') return resolveGlobalOverviewPose(input, fromPos)
  if (view.level === 'overview') return resolveOverviewPose(input, fromPos)
  if (!view.targetId) return resolveOverviewPose(input, fromPos)
  if (view.module === 'lighting') return resolveLightingDetailPose(input, view.targetId, fromPos)
  return resolveDeviceDetailPose(input, view.targetId, fromPos)
}

// ─── CameraRig：挂 Canvas 内，useFrame 每帧推进动画 ───────────────────────────

export function CameraRig({
  apiRef,
  controlsRef,
}: {
  apiRef: React.MutableRefObject<CameraRigApi | null>
  controlsRef: React.MutableRefObject<any>
}) {
  const { camera } = useThree()
  const shotRef = useRef<CameraShot | null>(null)

  useEffect(() => {
    apiRef.current = {
      play: (incoming) => {
        // 打断规则：动画中再触发，从当前插值位姿接力；被中断的 onDone 直接丢弃（无法安全执行）
        if (shotRef.current) {
          const snap = sampleShot(shotRef.current, shotRef.current.t)
          shotRef.current = { ...incoming, fromPos: snap.pos, fromTgt: snap.tgt, t: 0 }
        } else {
          shotRef.current = { ...incoming, t: 0 }
        }
        // 清零 OrbitControls 的 damping 残留，并保持 disabled 状态直到动画结束
        const ctl = controlsRef.current
        if (ctl) {
          ctl.enabled = false
          const wasDamping = ctl.enableDamping
          ctl.enableDamping = false
          ctl.update()
          ctl.enableDamping = wasDamping
        }
      },
      isAnimating: () => shotRef.current !== null,
      sampleCurrent: () => {
        if (shotRef.current) return sampleShot(shotRef.current, shotRef.current.t)
        // 非动画状态：返回相机真实当前位姿
        const tgt: Vec3Tuple = controlsRef.current
          ? [controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z]
          : [0, 0, 0]
        return {
          pos: [camera.position.x, camera.position.y, camera.position.z],
          tgt,
        }
      },
    }
    return () => { apiRef.current = null }
  }, [apiRef, controlsRef, camera])

  useFrame((_, dt) => {
    const shot = shotRef.current
    if (!shot) return
    shot.t += dt / shot.duration

    if (shot.t >= 1) {
      // 落位：相机精确落到终点
      camera.position.set(shot.toPos[0], shot.toPos[1], shot.toPos[2])
      camera.lookAt(shot.toTgt[0], shot.toTgt[1], shot.toTgt[2])

      const ctl = controlsRef.current
      if (ctl) {
        ctl.target.set(shot.toTgt[0], shot.toTgt[1], shot.toTgt[2])
        // r183 OrbitControls 在每次 update() 开头就从 camera.position 重算 _spherical，
        // 不存在坐标 desync。只需清 delta（damping 残留）再交还控制权。
        const wasDamping = ctl.enableDamping
        ctl.enableDamping = false
        ctl.update()   // 清空 _sphericalDelta / _panOffset，无副作用
        ctl.enableDamping = wasDamping

        // onDone 先于 ctl.enabled = true 执行：
        // 若 onDone 立即链式触发下一段动画（play() → ctl.enabled=false），
        // 则控件在两段动画之间始终保持 disabled，消除"瞬间激活→snap"的硬切。
        const cb = shot.onDone
        shotRef.current = null
        cb?.()
        if (!shotRef.current) ctl.enabled = true
      } else {
        const cb = shot.onDone
        shotRef.current = null
        cb?.()
      }
      return
    }

    // 动画中：位置按贝塞尔/直线插值，朝向每帧 lookAt 当前插值 target
    // 这样相机"永远看着当前 target"，位置和朝向始终绑定，视觉上是推进/后退的自然运动
    // 奇异风险由俯视 14° tilt + 最小 1.2m xz 偏移共同消除
    const { pos, tgt } = sampleShot(shot, shot.t)
    camera.position.set(pos[0], pos[1], pos[2])
    if (controlsRef.current) controlsRef.current.target.set(tgt[0], tgt[1], tgt[2])
    camera.lookAt(tgt[0], tgt[1], tgt[2])
  })

  return null
}

// ─── 南北仪表盘驱动器（Canvas 内，每帧把北向投影写入 DOM ref）────────────────
//
// 把世界坐标系里的"北"方向（按 northAngle 旋转）投影到相机空间，
// 取 (x, y) 分量得到屏幕上北的方位角，写入 compassNeedleRef 的 CSS transform。
// 这样 DOM 指针随 OrbitControls 实时旋转，无需任何 React re-render。

export function CompassUpdater({
  northAngle,
  needleRef,
}: {
  northAngle: number
  needleRef: React.MutableRefObject<HTMLDivElement | null>
}) {
  const { camera } = useThree()

  useFrame(() => {
    if (!needleRef.current) return

    // OrbitControls 在 useFrame 里更新 camera.position，但 matrixWorld
    // 要等 renderer.render() 才会刷新 —— 必须手动强制更新，否则永远落后一帧
    camera.updateMatrixWorld()

    // 纯方位角罗盘：只用相机水平朝向（忽略俯仰），相机向上/向下看时指针不跳动
    // matrixWorld 列 2（elements[8..10]）= 相机 back 向量（world 空间）
    // 相机 forward（world）= -back
    const mx = camera.matrixWorld.elements
    const fwdX = -mx[8]
    const fwdZ = -mx[10]
    const fwdLen = Math.hypot(fwdX, fwdZ)
    if (fwdLen < 0.001) return  // 相机垂直向上/向下，跳过

    const rad = (northAngle * Math.PI) / 180
    const northX = Math.sin(rad)
    const northZ = Math.cos(rad)

    // 从相机水平 forward 到北方向的有符号角（XZ 平面，右手系 CCW 正）
    // CSS rotate 顺时针为正，取反
    const cross2D = fwdX * northZ - fwdZ * northX
    const dot2D   = fwdX * northX + fwdZ * northZ
    const angle   = Math.atan2(-cross2D / fwdLen, dot2D / fwdLen)
    needleRef.current.style.transform = `rotate(${angle}rad)`
  })

  return null
}

// Shader 预热（首帧强制编译所有材质，避免首次视角切换时 GPU 同步编译卡顿）
export function ShaderPreheat() {
  const { gl, scene, camera } = useThree()
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    try { gl.compile(scene, camera) } catch { /* 某些实现可能抛，忽略 */ }
  })
  return null
}
