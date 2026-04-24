'use client'

import { sceneRegistry } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Material, Mesh } from 'three'
import { useSelectedSubsystem } from '@vilhil/smarthome'

/**
 * XrayOverlay —— X 光透明模式
 *
 * 触发时机：
 *   - 聚焦 network / architecture → 墙体变透明
 *   - 其他 → 墙体恢复
 *
 * 性能设计：
 *   - 稳态（目标达到）→ useFrame 直接 return，0 CPU 成本
 *   - 过渡期 → lerp material.opacity 到目标（约 0.25s 到位）
 *   - 只在 wall 集合变化时重建 material 缓存，不每帧 traverse
 *   - 只在 transparent 翻转时设 needsUpdate（避免 shader 重编译）
 */

const XRAY_BASE_KEY = '__vilhilXrayBase'
const XRAY_SUBSYSTEMS = new Set(['network', 'architecture'])

const XRAY_OPACITY = 0.12
const LERP_RATE = 5.0
const SETTLE_THRESHOLD = 0.003

type MaterialWithXray = Material & {
  opacity?: number
  transparent?: boolean
  depthWrite?: boolean
  needsUpdate?: boolean
  userData: Record<string, unknown>
}

type XrayBase = { opacity: number; transparent: boolean; depthWrite: boolean }

function captureBase(mat: MaterialWithXray): XrayBase | null {
  if (typeof mat.opacity !== 'number') return null
  let base = mat.userData[XRAY_BASE_KEY] as XrayBase | undefined
  if (!base) {
    base = {
      opacity: mat.opacity,
      transparent: mat.transparent ?? false,
      depthWrite: mat.depthWrite ?? true,
    }
    mat.userData[XRAY_BASE_KEY] = base
  }
  return base
}

export const XrayOverlay = () => {
  const selected = useSelectedSubsystem()

  // 缓动当前值（0 = 完全透明，1 = 完全不透明）
  const currentRef = useRef(1)
  // 上次采集的墙集合 size，变化时重建缓存
  const lastWallSizeRef = useRef(0)
  // 扁平材质列表（避免每帧 traverse）
  const materialsRef = useRef<MaterialWithXray[]>([])

  useFrame((_, dt) => {
    const goal = selected && XRAY_SUBSYSTEMS.has(selected) ? 0 : 1

    // 稳态早退：已经在目标 ±threshold 内就不做任何事
    if (Math.abs(currentRef.current - goal) < SETTLE_THRESHOLD) {
      return
    }

    // 墙集合变化时重建材质缓存
    const wallIds = sceneRegistry.byType.wall
    if (wallIds.size !== lastWallSizeRef.current) {
      const cache: MaterialWithXray[] = []
      for (const id of wallIds) {
        const obj = sceneRegistry.nodes.get(id)
        if (!obj) continue
        obj.traverse((o) => {
          const mesh = o as Mesh & { material?: Material | Material[] }
          if (!mesh.material) return
          if (Array.isArray(mesh.material)) {
            for (const m of mesh.material) {
              const mat = m as MaterialWithXray
              if (captureBase(mat)) cache.push(mat)
            }
          } else {
            const mat = mesh.material as MaterialWithXray
            if (captureBase(mat)) cache.push(mat)
          }
        })
      }
      materialsRef.current = cache
      lastWallSizeRef.current = wallIds.size
    }

    // Lerp current → goal
    const dtClamped = Math.min(dt, 0.1)
    const diff = goal - currentRef.current
    currentRef.current += diff * Math.min(dtClamped * LERP_RATE, 1)
    // 吸附
    if (Math.abs(goal - currentRef.current) < SETTLE_THRESHOLD) {
      currentRef.current = goal
    }

    // Apply 到所有缓存材质
    const t = currentRef.current
    const mats = materialsRef.current
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i]
      if (!mat) continue
      const base = mat.userData[XRAY_BASE_KEY] as XrayBase | undefined
      if (!base || typeof mat.opacity !== 'number') continue

      const goalOpacity = t * base.opacity + (1 - t) * XRAY_OPACITY
      mat.opacity = goalOpacity

      // 只在"是否需要透明"翻转时改 transparent/depthWrite/needsUpdate
      const needTransparent = goalOpacity < 0.995
      if (needTransparent) {
        if (!mat.transparent) {
          mat.transparent = true
          mat.depthWrite = false
          mat.needsUpdate = true
        }
      } else {
        if (mat.transparent !== base.transparent) {
          mat.transparent = base.transparent
          mat.depthWrite = base.depthWrite
          mat.needsUpdate = true
        }
      }
    }
  })

  return null
}
