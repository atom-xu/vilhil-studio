import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/Addons.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { applyBvh } from '../lib/bvh'

// ─── KTX2 ──────────────────────────────────────────────────────────────────────
const ktx2LoaderInstance = new KTX2Loader()
ktx2LoaderInstance.setTranscoderPath('https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/')
const ktx2ConfiguredRenderers = new WeakSet<object>()
const ktx2WarningLoggedRenderers = new WeakSet<object>()

// ─── Draco ─────────────────────────────────────────────────────────────────────
// 参考 iCraft @icraft/engine 方案：使用 Draco 解码器压缩几何体，减少 60-80% 模型体积。
// 解码器路径优先读本地 /draco/（生产），回退到 Google CDN（开发快速验证）。
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')

/**
 * useGLTFKTX2 — 扩展版 GLB 加载 hook
 *
 * 在标准 useGLTF 基础上叠加：
 * - KTX2 纹理压缩（WebGPU / WebGL2）
 * - Meshopt 几何体优化
 * - Draco 几何体解压（参考 iCraft 方案）
 * - BVH 射线拾取加速（参考 iCraft 方案，three-mesh-bvh）
 */
const useGLTFKTX2 = (path: string): ReturnType<typeof useGLTF> => {
  const gl = useThree((state) => state.gl)

  const result = useGLTF(path, true, true, (loader) => {
    const renderer = gl as unknown as object

    if (!ktx2ConfiguredRenderers.has(renderer)) {
      try {
        ktx2LoaderInstance.detectSupport(gl)
        ktx2ConfiguredRenderers.add(renderer)
      } catch (error) {
        // Some WebGPU flows can transiently call this before backend init.
        // Avoid crashing the whole scene; scans may render without KTX2 on this pass.
        if (!ktx2WarningLoggedRenderers.has(renderer)) {
          console.warn('[viewer] Skipping KTX2 support detection for now.', error)
          ktx2WarningLoggedRenderers.add(renderer)
        }
      }
    }

    if (ktx2ConfiguredRenderers.has(renderer)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loader.setKTX2Loader(ktx2LoaderInstance as any)
    }

    loader.setMeshoptDecoder(MeshoptDecoder)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loader.setDRACOLoader(dracoLoader as any)
  })

  // BVH：GLB 加载完成后对整棵 scene 树预计算 BVH，后续 raycaster 走 O(log n)
  useEffect(() => {
    if (result.scene) {
      applyBvh(result.scene)
    }
  }, [result.scene])

  return result
}

export { useGLTFKTX2 }
