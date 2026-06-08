import type { Plugin } from '@pascal-app/core'

/**
 * Pascal 上游内置 plugin（Phase 2A 占位）。
 *
 * 当前 VilHil 不实际消费上游 `packages/nodes/<kind>/` 文件
 * （viewer/editor 仍走硬编码 dispatch）。此 Plugin 仅作为类型占位，
 * 让 `loadPlugin(builtinPlugin)` 调用合法化，并为未来引入上游 nodes
 * 留接口。Phase 2B 起，`@vilhil/smarthome` 将以同样的 Plugin 形态
 * 注册自己的 `device` 节点定义。
 *
 * @vilhil-managed-file
 * 详见 docs/ARCHITECTURE-LAYERING.md §5、docs/NODES-PLUGIN-ARCHITECTURE.md、
 *      docs/UPSTREAM-PATCHES.md 条目 N1。
 */
export const builtinPlugin: Plugin = {
  id: 'pascal:core',
  apiVersion: 1,
  nodes: [],
}
