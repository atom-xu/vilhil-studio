/**
 * BVH 加速工具
 *
 * 把射线拾取从 O(n) 降到 O(log n)，大场景多设备/多楼层下点选帧率显著改善。
 *
 * 【设计修正 2026-04-30】
 * 早期版本曾全局 patch `BufferGeometry.prototype.computeBoundsTree` 和
 * `Mesh.prototype.raycast`。但 Three.js r0.163+ 的 BatchedMesh 也用 `boundsTree`
 * 字段 + 原生 BVH（`.raycastObject3D` 接口），prototype patch 会把 BatchedMesh
 * 的内置 BVH 替换成 three-mesh-bvh 的 MeshBVH（接口是 `.raycast`），运行时一旦
 * 走到 BatchedMesh.raycast 就 `boundsTree.raycastObject3D is not a function`。
 *
 * 现在改成"按 mesh opt-in"：调用方主动 attach 才生效，不污染 Three 全局原型。
 *
 * 使用：
 *   import { applyBvh } from '@/lib/bvh'
 *   applyBvh(scene)  // GLB / 程序化 geometry 加载后调用一次
 */

import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import * as THREE from 'three'

// ─── 工具函数（不再 patch prototype）─────────────────────────────────────

/**
 * 给单个 BufferGeometry 显式建 BVH（如果还没建）。
 * 直接 new MeshBVH 而不是走 prototype 调用 —— 不依赖也不动 prototype。
 */
export function applyBvhToGeometry(geometry: THREE.BufferGeometry): void {
  if (!geometry.boundsTree) {
    // 仓库里同时存在 three-mesh-bvh 0.8.3 + 0.9.9（不同 peer 拉的版本），
    // Three.js types 拿的是 0.8.3 的 MeshBVH，三方包 import 的是 0.9.9 →
    // TS 类型不兼容（运行时是同一个 API）。这里 cast 绕一下。
    geometry.boundsTree = new MeshBVH(geometry) as unknown as NonNullable<
      THREE.BufferGeometry['boundsTree']
    >
  }
}

/**
 * 给 Object3D 子树里所有 Mesh 加 BVH。
 * - 跳过 BatchedMesh：它有自己的内置 BVH 系统，不要覆盖。
 * - 给 mesh 自己 attach acceleratedRaycast（per-instance，不动 prototype）。
 */
export function applyBvh(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    // BatchedMesh 用自己的 BVH，跳过
    if ((obj as { isBatchedMesh?: boolean }).isBatchedMesh) return
    if (!obj.geometry || !(obj.geometry instanceof THREE.BufferGeometry)) return
    applyBvhToGeometry(obj.geometry)
    obj.raycast = acceleratedRaycast as unknown as THREE.Mesh['raycast']
  })
}

/**
 * 释放子树里所有 mesh 的 BVH（节点销毁时调用，避免内存泄漏）。
 */
export function disposeBvh(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if ((obj as { isBatchedMesh?: boolean }).isBatchedMesh) return
    const tree = obj.geometry?.boundsTree
    if (tree && typeof (tree as { dispose?: () => void }).dispose === 'function') {
      ;(tree as { dispose: () => void }).dispose()
      obj.geometry.boundsTree = undefined
    }
  })
}
