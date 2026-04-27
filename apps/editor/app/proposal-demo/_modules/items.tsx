'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Clone, useGLTF } from '@react-three/drei'
import { INTERIOR_LAYER } from './geometry'
import type { ItemData } from './types'

export type { ItemData }

// ─── 家具渲染器 — 加载 GLB 模型 + 统一视觉语言 ──────────────────────────────
//
// 视觉规范：
//   - 灰模（默认）：不可交互，接受灯光打亮
//   - 白模+勾勒（interactive=true）：本视图可交互，勾勒由 drei <Outlines> 实现（TODO）
// 双层 group：外层 runtime transform，内层 Clone 应用 asset 矫正 transform。
// 遍历 clone 场景把所有 mesh 原材质替换为统一灰模/白模材质（忽略 GLB 原色）。

// 家具材质默认值（当 preset 未提供时兜底）
const DEFAULT_FURNITURE_DAY_COLOR = '#c0bdb6'
const DEFAULT_FURNITURE_NIGHT_COLOR = '#9aa6b8'
const DEFAULT_FURNITURE_INTERACTIVE_COLOR = '#f2efea'
const DEFAULT_FURNITURE_ROUGHNESS = 0.62
const DEFAULT_FURNITURE_METALNESS = 0.04

// ─── Keynote 式倒影 — 给任意 material 注入 y-based alpha fade ─────────────────
//
// 方案：每个 mesh 再渲染一份镜像版本（scale Y = -1），放在 y=0 之下。
// 镜像 material 的 fragment shader 根据 world.y 衰减 alpha：y=0 不透，y=-FADE_DIST 完全透明。
// 不需要实时反射 RenderTarget → 不会有摩尔纹/横线/性能瓶颈。
// 倒影 = 水面斜视角感：贴地面 25cm 内有淡淡倒影，再高就看不到
// 不是"物体立在镜面上"的完整镜像，只是湿地面的接触感
const REFLECTION_FADE_DIST = 0.4  // 倒影衰减距离（m）：缩短到 0.4 贴地面只露微弱接触感
const REFLECTION_STRENGTH  = 0.18 // 贴地面那一小段的 alpha 起始值：从 0.28 降到 0.18
const mirrorMatCache = new Map<string, THREE.Material>()

/** 把一个 material 转为"镜像 fade"版本（alpha 按 world.y 衰减）。同原 material 共享一个镜像版本。 */
export function makeMirrorMaterial(orig: THREE.Material): THREE.Material {
  const key = `mirror:${orig.uuid}`
  const cached = mirrorMatCache.get(key)
  if (cached) return cached
  const cloned = orig.clone()
  cloned.transparent = true
  cloned.depthWrite = false
  cloned.side = THREE.DoubleSide  // 镜像后法线翻转，用 DoubleSide 简单处理
  cloned.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeDist   = { value: REFLECTION_FADE_DIST }
    shader.uniforms.uStartAlpha = { value: REFLECTION_STRENGTH }
    // 自己用 modelMatrix * transformed 算 worldPosition.y，不依赖 Three.js
    // 内置 <worldpos_vertex> chunk 里的 worldPosition——那个变量被 USE_ENVMAP /
    // USE_SHADOWMAP 等宏包着，材质如果没用 envMap、没收阴影，worldPosition 根本
    // 没声明，shader 编译报 "undeclared identifier worldPosition"。
    // `transformed` 是 Three.js 内置的"已经过骨骼/形变后的 local 坐标"，永远存在。
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying float vMirrorY;`)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvMirrorY = (modelMatrix * vec4(transformed, 1.0)).y;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        `#include <common>\nvarying float vMirrorY;\nuniform float uFadeDist;\nuniform float uStartAlpha;`)
      .replace('#include <dithering_fragment>',
        `#include <dithering_fragment>\nfloat mirrorFade = uStartAlpha * smoothstep(-uFadeDist, 0.0, vMirrorY);\ngl_FragColor.a *= mirrorFade;\nif (gl_FragColor.a < 0.01) discard;`)
  }
  mirrorMatCache.set(key, cloned)
  return cloned
}

// 灰模/白模 material 缓存 — 同一原 material 按 interactive 状态各缓存一份
// 保留 GLB 的细节贴图（normalMap/aoMap/roughnessMap）让灰模有真实的凹凸和阴影质感
const matByKey = new Map<string, THREE.Material>()
export function grayify(orig: THREE.Material | THREE.Material[], isInteractive: boolean): THREE.Material | THREE.Material[] {
  return tintify(orig, isInteractive, DEFAULT_FURNITURE_DAY_COLOR)
}

export function tintify(
  orig: THREE.Material | THREE.Material[],
  isInteractive: boolean,
  baseColor: string,
  interactiveColor = DEFAULT_FURNITURE_INTERACTIVE_COLOR,
  roughnessFallback = DEFAULT_FURNITURE_ROUGHNESS,
  metalnessFallback = DEFAULT_FURNITURE_METALNESS,
): THREE.Material | THREE.Material[] {
  if (Array.isArray(orig)) return orig.map((m) => tintify(m, isInteractive, baseColor, interactiveColor, roughnessFallback, metalnessFallback) as THREE.Material)
  const key = `${orig.uuid}:${isInteractive ? 'white' : 'gray'}:${baseColor}:${interactiveColor}:${roughnessFallback}:${metalnessFallback}`
  const cached = matByKey.get(key)
  if (cached) return cached
  const std = orig as THREE.MeshStandardMaterial
  const newMat = new THREE.MeshStandardMaterial({
    color: isInteractive ? interactiveColor : baseColor,
    normalMap:      std.normalMap      ?? null,
    normalScale:    std.normalScale    ? std.normalScale.clone() : undefined,
    aoMap:          std.aoMap          ?? null,
    aoMapIntensity: std.aoMapIntensity ?? 1,
    roughnessMap:   std.roughnessMap   ?? null,
    metalnessMap:   std.metalnessMap   ?? null,
    roughness:      typeof std.roughness === 'number' ? std.roughness : roughnessFallback,
    metalness:      Math.min(typeof std.metalness === 'number' ? std.metalness : metalnessFallback, 0.3),
    transparent:    std.transparent ?? false,
    opacity:        typeof std.opacity === 'number' ? std.opacity : 1,
  })
  matByKey.set(key, newMat)
  return newMat
}

export function DemoItem({
  item,
  interactive = false,
  isMultiFloor = false,
  reflectionsEnabled = false,
  isNight = false,
  furnitureColorDay = DEFAULT_FURNITURE_DAY_COLOR,
  furnitureColorNight = DEFAULT_FURNITURE_NIGHT_COLOR,
  furnitureRoughness = DEFAULT_FURNITURE_ROUGHNESS,
  furnitureMetalness = DEFAULT_FURNITURE_METALNESS,
  furnitureInteractiveColor = DEFAULT_FURNITURE_INTERACTIVE_COLOR,
}: {
  item: ItemData
  interactive?: boolean
  isMultiFloor?: boolean
  reflectionsEnabled?: boolean
  isNight?: boolean
  furnitureColorDay?: string
  furnitureColorNight?: string
  furnitureRoughness?: number
  furnitureMetalness?: number
  furnitureInteractiveColor?: string
}) {
  const gltf = useGLTF(item.asset.src)
  const cloneRef = useRef<THREE.Group>(null!)
  const mirrorRef = useRef<THREE.Group>(null!)
  const baseColor = isNight ? furnitureColorNight : furnitureColorDay

  useEffect(() => {
    // 原 Clone：灰模材质
    const root = cloneRef.current
    if (root) {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh || !mesh.material) return
        mesh.material      = tintify(mesh.material, interactive, baseColor, furnitureInteractiveColor, furnitureRoughness, furnitureMetalness)
        mesh.castShadow    = true
        mesh.receiveShadow = true
        obj.layers.enable(INTERIOR_LAYER)   // 家具加入室内层，接收室内光照
      })
    }
    // 镜像 Clone：对每个 mesh 用 mirror 版本的灰模材质（y-fade）
    const mirror = mirrorRef.current
    if (mirror) {
      mirror.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh || !mesh.material) return
        const grayMat = tintify(mesh.material, interactive, baseColor, furnitureInteractiveColor, furnitureRoughness, furnitureMetalness) as THREE.Material
        mesh.material   = makeMirrorMaterial(grayMat)
        mesh.castShadow = false
        mesh.receiveShadow = false
      })
    }
  }, [gltf.scene, interactive, baseColor, furnitureInteractiveColor, furnitureRoughness, furnitureMetalness])

  return (
    <>
      <group position={item.position} rotation={item.rotation} scale={item.scale}>
        <Clone
          ref={cloneRef}
          object={gltf.scene}
          position={item.asset.offset}
          rotation={item.asset.rotation}
          scale={item.asset.scale}
        />
      </group>
      {/* 家具倒影 —— 多楼层 / 倒影开关关闭时都隐藏 */}
      {!isMultiFloor && reflectionsEnabled && (
        <group
          position={[item.position[0], -item.position[1], item.position[2]]}
          rotation={[-item.rotation[0], item.rotation[1], -item.rotation[2]]}
          scale={[item.scale[0], -item.scale[1], item.scale[2]]}
        >
          <Clone
            ref={mirrorRef}
            object={gltf.scene}
            position={item.asset.offset}
            rotation={item.asset.rotation}
            scale={item.asset.scale}
          />
        </group>
      )}
    </>
  )
}
