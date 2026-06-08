/**
 * Plugin bootstrap (Phase 2A — VilHil 上层占位接入).
 *
 * 此模块在被任意 client 组件 import 时执行一次 `loadPlugin(builtinPlugin)`，
 * 注册 Pascal 上游内置 plugin。当前 `builtinPlugin.nodes` 为空数组，所以这次
 * 调用对 viewer / editor 的硬编码 dispatch 没有任何运行时影响——它仅仅让 plugin
 * 注入管道在 App 启动时被走通，为后续 Phase 2B 的 `smarthomePlugin` 等扩展铺路。
 *
 * 真正的注册逻辑（写入 `nodeRegistry`）被 `loadPlugin` 内部完成；这里把返回
 * promise 显式 catch，避免在不期望的 apiVersion / 重复注册场景下把未处理的
 * rejection 吞到 console 之外。
 *
 * 调用时机：模块顶层 IIFE，Next.js / Webpack 会保证同一模块只执行一次。
 *
 * @vilhil-managed-file
 * 详见 docs/ARCHITECTURE-LAYERING.md §5、docs/NODES-PLUGIN-ARCHITECTURE.md。
 */
import { loadPlugin } from '@pascal-app/core'
import { builtinPlugin } from '@pascal-app/nodes'

let bootstrapped = false

export function ensurePluginsBootstrapped(): void {
  if (bootstrapped) return
  bootstrapped = true
  loadPlugin(builtinPlugin).catch((err) => {
    // 注册重复 / apiVersion mismatch 是开发期 HMR 常见情况，记录但不抛。
    console.warn('[plugin-bootstrap] loadPlugin failed:', err)
  })
}

// 模块层面立刻触发一次——任何 import 此文件的 client 组件都会带动它。
ensurePluginsBootstrapped()
