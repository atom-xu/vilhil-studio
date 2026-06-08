/**
 * Plugin bootstrap.
 *
 * 此模块在被任意 client 组件 import 时执行一次 plugin 注册，写入全局
 * `nodeRegistry`。当前注册：
 *   1. `builtinPlugin`（@pascal-app/nodes）—— Pascal 上游内置 plugin
 *      （Phase 2A 起 nodes 为空数组，调用是占位语义）
 *   2. `smarthomePlugin`（@vilhil/smarthome）—— VilHil 智能家居 domain plugin
 *      （Phase 2B 起包含 deviceDefinition，类型层注册；viewer/editor 仍走
 *      硬编码 dispatch 渲染 device）
 *
 * 真正的注册逻辑（写入 `nodeRegistry`）由 `loadPlugin` 内部完成；这里把
 * 返回 promise 显式 catch，避免在不期望的 apiVersion / 重复注册场景下
 * 把未处理的 rejection 吞到 console 之外。
 *
 * 调用时机：模块顶层 IIFE，Next.js / Webpack 会保证同一模块只执行一次。
 *
 * @vilhil-managed-file
 * 详见 docs/ARCHITECTURE-LAYERING.md §5、docs/NODES-PLUGIN-ARCHITECTURE.md。
 */
import { loadPlugin, nodeRegistry } from '@pascal-app/core'
import { builtinPlugin } from '@pascal-app/nodes'
import { smarthomePlugin } from '@vilhil/smarthome'

function isDevMode(): boolean {
  const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process
  return proc?.env?.NODE_ENV !== 'production'
}

let bootstrapped = false

export function ensurePluginsBootstrapped(): void {
  if (bootstrapped) return
  bootstrapped = true
  loadPlugin(builtinPlugin).catch((err) => {
    // 注册重复 / apiVersion mismatch 是开发期 HMR 常见情况，记录但不抛。
    console.warn('[plugin-bootstrap] loadPlugin(builtinPlugin) failed:', err)
  })
  loadPlugin(smarthomePlugin)
    .then(() => {
      if (isDevMode()) {
        const got = nodeRegistry.get('device')
        // eslint-disable-next-line no-console
        console.debug(
          '[plugin-bootstrap] smarthome device registered:',
          !!got,
          got?.kind,
          got?.category,
        )
      }
    })
    .catch((err) => {
      console.warn('[plugin-bootstrap] loadPlugin(smarthomePlugin) failed:', err)
    })
}

// 模块层面立刻触发一次——任何 import 此文件的 client 组件都会带动它。
ensurePluginsBootstrapped()
