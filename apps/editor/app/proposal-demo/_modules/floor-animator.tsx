'use client'

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ─── 楼层走马灯动画 ────────────────────────────────────────────────────────────
//
// 单层→单层切换（电梯式）：
//   到达层  从自然 SINGLE_GAP 位置（Y=±6）滑入 Y=0，同步从 alpha=0 渐显（底部先出现）
//   离开层  从 Y=0 滑走到自然 SINGLE_GAP 位置，同步从 alpha=1 渐隐（顶部先消失）
//   两层始终保持 6m 间距（> WALL_HEIGHT=2.7m），任意时刻不重叠
//   其他层  立即 snap 到新的 SINGLE_GAP 位置，保持隐藏
//
// 整层渐变：同一楼层内所有 mesh 材质共享同一 alpha，
//   到达层：整层一起淡入
//   离开层：整层一起淡出
// 避免“墙体/地板/家具一个一个消失”的割裂感
//
// 位置稳定性：触发时强制将 arriving/departing 楼层 snap 到理论起始位置，
//   防止上一次动画中断后 group.position.y 偏离导致起始帧跳动

// ── 交错渐变辅助 ─────────────────────────────────────────────────────────────

type FadeMatState = {
  mat: any
  origTransparent: boolean
  origOpacity: number
  origDepthWrite: boolean
  origUOpacity: number | undefined
}

function collectFadeMatStates(group: THREE.Group): FadeMatState[] {
  const byUuid = new Map<string, FadeMatState>()
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      const mat = m as any
      if (!mat || byUuid.has(mat.uuid)) continue
      byUuid.set(mat.uuid, {
        mat,
        origTransparent: !!mat.transparent,
        origOpacity: typeof mat.opacity === 'number' ? mat.opacity : 1,
        origDepthWrite: typeof mat.depthWrite === 'boolean' ? mat.depthWrite : true,
        origUOpacity: mat.isShaderMaterial ? (mat.uniforms?.uOpacity?.value as number | undefined) : undefined,
      })
    }
  })
  return [...byUuid.values()]
}

function applyGroupAlpha(states: FadeMatState[], alpha: number) {
  const a = Math.min(Math.max(alpha, 0), 1)
  for (const s of states) {
    const mat = s.mat
    // 统一整层 alpha，避免对象级“一个个消失”的不稳定观感
    mat.transparent = true
    mat.opacity = s.origOpacity * a
    mat.depthWrite = a > 0.995 ? s.origDepthWrite : false
    if (mat.isShaderMaterial && mat.uniforms?.uOpacity !== undefined && s.origUOpacity !== undefined) {
      mat.uniforms.uOpacity.value = s.origUOpacity * a
    }
    mat.needsUpdate = true
  }
}

function restoreGroupAlpha(states: FadeMatState[]) {
  for (const s of states) {
    const mat = s.mat
    mat.transparent = s.origTransparent
    mat.opacity = s.origOpacity
    mat.depthWrite = s.origDepthWrite
    if (mat.isShaderMaterial && mat.uniforms?.uOpacity !== undefined && s.origUOpacity !== undefined) {
      mat.uniforms.uOpacity.value = s.origUOpacity
    }
    mat.needsUpdate = true
  }
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

export const COMPRESSED_GAP = 5.5
const SINGLE_GAP            = 6.0
export const FLOOR_ANIM_DUR = 0.9
const GAP_RATIO_MIN = 0.72
const GAP_RATIO_MAX = 1.35

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const _tmpCamDir = new THREE.Vector3()
const _tmpP0 = new THREE.Vector3()
const _tmpP1 = new THREE.Vector3()

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * 透视补偿：
 * 固定世界间距在透视相机下会出现“近处更大、远处更小”的视觉差。
 * 用相机 forward 深度比（depthY/depth0）修正 Y 偏移，让屏幕上的楼层间距更均匀。
 */
function perspectiveCompensatedY(
  linearY: number,
  camera: THREE.Camera | undefined,
  cx: number,
  cz: number,
): number {
  if (!camera || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return linearY
  camera.getWorldDirection(_tmpCamDir)
  _tmpP0.set(cx, 0, cz)
  _tmpP1.set(cx, linearY, cz)
  const depth0 = Math.abs(_tmpP0.sub(camera.position).dot(_tmpCamDir))
  const depthY = Math.abs(_tmpP1.sub(camera.position).dot(_tmpCamDir))
  if (depth0 < 0.0001 || depthY < 0.0001) return linearY
  const ratio = clamp(depthY / depth0, GAP_RATIO_MIN, GAP_RATIO_MAX)
  return linearY * ratio
}

function getTargetY(
  floorIdx: number,
  numFloors: number,
  activeFloorIdx: number | null,
  camera: THREE.Camera | undefined,
  cx: number,
  cz: number,
): number {
  if (activeFloorIdx === null) {
    const centerIdx = (numFloors - 1) / 2
    const linearY = (floorIdx - centerIdx) * COMPRESSED_GAP
    return perspectiveCompensatedY(linearY, camera, cx, cz)
  }
  return (floorIdx - activeFloorIdx) * SINGLE_GAP
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

export function FloorAnimator({
  children,
  floorIdx,
  numFloors,
  activeFloorIdx,
  switchTrigger,
  cx = 0,
  cz = 0,
  azimuthRef,
}: {
  children: React.ReactNode
  floorIdx: number
  numFloors: number
  activeFloorIdx: number | null
  switchTrigger: number
  cx?: number
  cz?: number
  azimuthRef?: { current: number }
}) {
  const groupRef      = useRef<THREE.Group>(null!)
  const pivotRef      = useRef<THREE.Group>(null!)
  const { camera }    = useThree()
  const startYRef     = useRef<number | null>(null)
  const elapsedRef    = useRef(FLOOR_ANIM_DUR + 1)
  const prevTrigger   = useRef(switchTrigger)
  const prevActiveRef = useRef<number | null>(null)
  const roleRef       = useRef<'arriving' | 'departing' | 'normal' | 'hidden'>('normal')
  const fadeStatesRef = useRef<FadeMatState[] | null>(null)

  // 组件卸载/重建时兜底恢复材质，防止快速切换中断后出现“蓝线残影”
  useEffect(() => {
    return () => {
      if (fadeStatesRef.current && (roleRef.current === 'arriving' || roleRef.current === 'departing')) {
        restoreGroupAlpha(fadeStatesRef.current)
        fadeStatesRef.current = null
      }
    }
  }, [])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    if (pivotRef.current && azimuthRef) {
      pivotRef.current.rotation.y = azimuthRef.current
    }

    // ── 首帧：写入正确 Y，设置可见性 ─────────────────────────────────────────
    if (startYRef.current === null) {
      const y = getTargetY(floorIdx, numFloors, activeFloorIdx, camera, cx, cz)
      group.position.y      = y
      startYRef.current     = y
      prevActiveRef.current = activeFloorIdx
      group.visible = !(activeFloorIdx !== null && floorIdx !== activeFloorIdx)
      return
    }

    // ── 新触发：分配角色 ──────────────────────────────────────────────────────
    if (prevTrigger.current !== switchTrigger) {
      const prevActive      = prevActiveRef.current
      prevTrigger.current   = switchTrigger
      prevActiveRef.current = activeFloorIdx
      elapsedRef.current    = 0

      // 关键修复：
      // 快速连续切换时，上一段 arriving/departing 可能还没走完。
      // 若不先恢复材质，楼层会残留半透明状态，出现“只剩顶面蓝线、墙体消失”。
      if (fadeStatesRef.current && (roleRef.current === 'arriving' || roleRef.current === 'departing')) {
        restoreGroupAlpha(fadeStatesRef.current)
      }
      roleRef.current = 'normal'
      fadeStatesRef.current = null

      const toFocused = activeFloorIdx !== null
      const fromFocused = prevActive !== null
      const isSingleToSingle = toFocused && fromFocused && prevActive !== activeFloorIdx
      const isAllToSingle = toFocused && !fromFocused
      const isSingleToAll = !toFocused && fromFocused

      if (isSingleToSingle || isAllToSingle || isSingleToAll) {
        if (floorIdx === activeFloorIdx) {
          // 到达层：从“当前实时位置”接力，避免快速切换时回弹到理论起点造成跳变
          startYRef.current = group.position.y
          // all->single 时目标层保持完全可见，不做淡入；single->single 才做 arriving
          roleRef.current   = isAllToSingle ? 'normal' : 'arriving'
          if (roleRef.current === 'arriving') {
            fadeStatesRef.current = collectFadeMatStates(group)
            applyGroupAlpha(fadeStatesRef.current, 0)
          }
          group.visible     = true
        } else if (fromFocused && floorIdx === prevActive) {
          // 离开层：同样从当前实时位置接力，避免中断后强制归位再出发
          startYRef.current = group.position.y
          roleRef.current   = isSingleToAll ? 'normal' : 'departing'
          if (roleRef.current === 'departing') {
            fadeStatesRef.current = collectFadeMatStates(group)
            applyGroupAlpha(fadeStatesRef.current, 1)
          }
          group.visible     = true
        } else if (isAllToSingle) {
          // 全楼层->单楼层：非目标层在移动中整层淡出
          startYRef.current = group.position.y
          roleRef.current = 'departing'
          fadeStatesRef.current = collectFadeMatStates(group)
          applyGroupAlpha(fadeStatesRef.current, 1)
          group.visible = true
        } else if (isSingleToAll) {
          // 单楼层->全楼层：其他楼层从隐藏状态整层淡入并归位
          startYRef.current = group.position.y
          roleRef.current = 'arriving'
          fadeStatesRef.current = collectFadeMatStates(group)
          applyGroupAlpha(fadeStatesRef.current, 0)
          group.visible = true
        } else {
          // 旁观层：snap 到相对新活跃层的正确位置，保持隐藏
          const snapY       = getTargetY(floorIdx, numFloors, activeFloorIdx, camera, cx, cz)
          group.position.y  = snapY
          startYRef.current = snapY
          roleRef.current   = 'hidden'
          group.visible     = false
          return
        }
      } else {
        // 爆炸 ↔ 单层：整体滑动，全部可见
        roleRef.current   = 'normal'
        startYRef.current = group.position.y
        group.visible     = true
      }
    }

    if (roleRef.current === 'hidden') return

    // ── 插值动画 ────────────────────────────────────────────────────────────
    const targetY = getTargetY(floorIdx, numFloors, activeFloorIdx, camera, cx, cz)
    const rawT    = Math.min(elapsedRef.current / FLOOR_ANIM_DUR, 1)
    elapsedRef.current += delta
    const eased = easeInOutCubic(rawT)

    group.position.y = startYRef.current! + (targetY - startYRef.current!) * eased

    if (fadeStatesRef.current) {
      if (roleRef.current === 'arriving') {
        applyGroupAlpha(fadeStatesRef.current, eased)
      } else if (roleRef.current === 'departing') {
        applyGroupAlpha(fadeStatesRef.current, 1 - eased)
      }
    }

    // ── 动画结束：落位并恢复材质 ──────────────────────────────────────────
    if (rawT >= 1) {
      group.position.y = getTargetY(floorIdx, numFloors, activeFloorIdx, camera, cx, cz)
      if (fadeStatesRef.current && (roleRef.current === 'arriving' || roleRef.current === 'departing')) {
        restoreGroupAlpha(fadeStatesRef.current)
        fadeStatesRef.current = null
      }
      group.visible   = !(activeFloorIdx !== null && floorIdx !== activeFloorIdx)
      roleRef.current = 'normal'
    }
  })

  return (
    <group ref={groupRef}>
      <group ref={pivotRef} position={[cx, 0, cz]}>
        <group position={[-cx, 0, -cz]}>
          {children}
        </group>
      </group>
    </group>
  )
}
