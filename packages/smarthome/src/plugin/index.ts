/**
 * smarthomePlugin — VilHil 智能家居 domain plugin（Phase 2B）.
 *
 * 这是 VilHil 上层业务的 plugin 注册入口。当前只包含 device 节点定义；
 * 未来扩展（subsystem-specific 节点、Home Assistant / Matter 集成等）
 * 也会加在这里。
 *
 * 在 app 入口（apps/editor/app/plugin-bootstrap.ts）通过
 *   loadPlugin(smarthomePlugin)
 * 注册到全局 `nodeRegistry`。
 *
 * 详见：
 *   - docs/ARCHITECTURE-LAYERING.md（VilHil 上层 / Pascal 下层）
 *   - docs/NODES-PLUGIN-ARCHITECTURE.md
 */
import type { AnyNodeDefinition, Plugin } from '@pascal-app/core'
import { deviceDefinition } from './device-definition'

export const smarthomePlugin: Plugin = {
  id: 'vilhil:smarthome',
  apiVersion: 1,
  nodes: [
    // `as unknown as AnyNodeDefinition` —— 与上游 `packages/nodes/src/index.ts`
    // 对齐：NodeDefinition<typeof DeviceNode> 在结构上等价于 AnyNodeDefinition
    //（= NodeDefinition<ZodObject<any>>），但 TS 在 ZodObject 的复杂泛型参数上
    // 不接受协变，必须显式 cast。
    deviceDefinition as unknown as AnyNodeDefinition,
  ],
}

export { deviceDefinition }
