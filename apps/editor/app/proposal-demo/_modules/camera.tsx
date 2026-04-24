'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

// ─── 视角系统（Overview / Detail 两层 + Module 过滤）───────────────────────────

export type ModuleKey = 'lighting' | 'curtain' | 'sensor' | 'panel' | 'hvac' | 'av' | 'security' | 'network'

export type ViewLevel = 'overview' | 'detail'

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

// 弧线中转点：65% 偏终点、仅高出 0.3m → 推进为主，"上升"只是微弯不显著
export function computeArcMidpoint(from: Vec3Tuple, to: Vec3Tuple): Vec3Tuple {
  const bias = 0.65
  const baseY = (from[1] + to[1]) * 0.5
  return [
    from[0] + (to[0] - from[0]) * bias,
    baseY + 0.3,
    from[2] + (to[2] - from[2]) * bias,
  ]
}

// ─── Pose Resolvers（每种视角的相机预设位姿）─────────────────────────────────

export interface PoseInput {
  bboxCx: number
  bboxCz: number
  bboxSpan: number
  rooms: Array<{ id: string; cx: number; cz: number; radius: number; width: number; depth: number }>
  devices: Array<{ id: string; position: Vec3Tuple }>
}

// Canvas 相机 FOV（垂直），写死 50°（和 Canvas 设置一致）
const CAMERA_FOV_DEG = 50

// Overview：建筑外 30° 斜俯视
export function resolveOverviewPose(input: PoseInput): { pos: Vec3Tuple; tgt: Vec3Tuple } {
  const dist = input.bboxSpan * 2.2
  const tgt: Vec3Tuple = [input.bboxCx, 0.6, input.bboxCz]
  const pos: Vec3Tuple = [tgt[0] + dist * 0.612, tgt[1] + dist * 0.5, tgt[2] + dist * 0.612]
  return { pos, tgt }
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

  const tgt: Vec3Tuple = [room.cx, 0.1, room.cz]
  const pos: Vec3Tuple = [
    room.cx + ox * xzOffset,
    tgt[1] + camH,
    room.cz + oz * xzOffset,
  ]
  return { pos, tgt }
}

// Device Detail：设备前方 1.5m，仰角 15°
export function resolveDeviceDetailPose(input: PoseInput, deviceId: string): { pos: Vec3Tuple; tgt: Vec3Tuple } | null {
  const device = input.devices.find((d) => d.id === deviceId)
  if (!device) return null
  const [dx, dy, dz] = device.position
  // 朝向房间中心的反方向（让设备"面对"相机）
  const dirToCenter = { x: input.bboxCx - dx, z: input.bboxCz - dz }
  const len = Math.hypot(dirToCenter.x, dirToCenter.z) || 1
  const nx = -dirToCenter.x / len  // 背对房间中心 = 朝外
  const nz = -dirToCenter.z / len
  const dist = 1.5
  const tgt: Vec3Tuple = [dx, dy, dz]
  const pos: Vec3Tuple = [
    dx + nx * dist,
    dy + dist * 0.28,     // 仰角 ~15°
    dz + nz * dist,
  ]
  return { pos, tgt }
}

export function resolvePoseForView(
  view: ViewState,
  input: PoseInput,
  fromPos?: Vec3Tuple,   // 当前相机位置，用于继承方位（避免落位时"转正"）
): { pos: Vec3Tuple; tgt: Vec3Tuple } | null {
  if (view.level === 'overview') return resolveOverviewPose(input)
  if (!view.targetId) return resolveOverviewPose(input)
  if (view.module === 'lighting') return resolveLightingDetailPose(input, view.targetId, fromPos)
  return resolveDeviceDetailPose(input, view.targetId)
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
        // 打断规则：动画中再触发，从当前插值位姿接力
        if (shotRef.current) {
          const snap = sampleShot(shotRef.current, shotRef.current.t)
          shotRef.current = { ...incoming, fromPos: snap.pos, fromTgt: snap.tgt, t: 0 }
        } else {
          shotRef.current = { ...incoming, t: 0 }
        }
        // 清零 OrbitControls 的 damping 残留（sphericalDelta / panOffset）
        // 不清的话，动画结束 enable 时残留量会一次性释放造成"跳一下"
        const ctl = controlsRef.current
        if (ctl) {
          const wasDamping = ctl.enableDamping
          ctl.enableDamping = false
          ctl.update()              // enableDamping=false 时 update 会把 delta 清为 0
          ctl.enableDamping = wasDamping
          ctl.enabled = false
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
      // 落位：相机落到终点位置 + 朝向最终 target
      camera.position.set(shot.toPos[0], shot.toPos[1], shot.toPos[2])
      camera.lookAt(shot.toTgt[0], shot.toTgt[1], shot.toTgt[2])
      const ctl = controlsRef.current
      if (ctl) {
        ctl.target.set(shot.toTgt[0], shot.toTgt[1], shot.toTgt[2])
        // 清 damping delta 后再 enable，避免残留量释放造成"跳一下"
        const wasDamping = ctl.enableDamping
        ctl.enableDamping = false
        ctl.update()
        ctl.enableDamping = wasDamping
        ctl.enabled = true
      }
      const cb = shot.onDone
      shotRef.current = null
      cb?.()
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
