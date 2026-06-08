# Nodes / Plugin 架构

> 配套：`docs/ARCHITECTURE-LAYERING.md` §5.3、`docs/UPSTREAM-PATCHES.md` N1 / L1。
> 当前状态：**Phase 2B 完成（2026-06-08）**——`smarthomePlugin` 已注册 `device` kind 到 `nodeRegistry`；viewer/editor 仍走硬编码 dispatch 实际渲染 device。

---

## 1. 为什么要有 Plugin/Registry

Pascal 上游在 v0.8 引入了 `NodeDefinition / Plugin / nodeRegistry / loadPlugin` 一整套节点定义注册机制。其核心目标是：

1. **节点能力描述化**：把"这是哪种节点、它有什么 capability、它怎么渲染、面板长啥样"都收敛到一份 `NodeDefinition` 数据里
2. **第三方扩展可插拔**：外部包（包括 VilHil 自家的 smarthome）可以 export 一个 `Plugin = { id, apiVersion, nodes: [...] }`，由 host app 通过 `loadPlugin(plugin)` 注册到全局 `nodeRegistry`
3. **viewer/editor 走通用 dispatch**：上游目标是让 `<NodeRenderer>` / `ToolManager` / `PanelManager` 等核心组件从 `nodeRegistry.get(kind)` 读出 `def.renderer / def.tool / def.panel` 再 mount，**不再**为每个 kind 写 `switch (node.type) { case 'wall': ... }`

VilHil 长期想要的是第 2 条：**让 `smarthomePlugin` 注册 9 子系统设备**，从而把 device 渲染 / 面板 / 工具从 viewer/editor 包内迁出到 `@vilhil/smarthome`，彻底实现"VilHil 上层 / Pascal 下层"分层。

---

## 2. Phase 2A 做了什么

### 2.1 引入 `packages/core/src/registry/`

从上游 `upstream/main` 直接 checkout 下面 7 个文件（无修改，纯类型 + Map）：

| 文件 | 用途 |
|---|---|
| `types.ts` | `NodeDefinition / Plugin / Capabilities / Presentation / NodeCategory / SurfaceRole / GeometryContext / FloorplanGeometry / ParametricDescriptor / DragAction / SceneApi / NodeRegistry` 等核心类型 |
| `registry.ts` | `nodeRegistry`（单例 Map）+ `loadPlugin / registerNode / getSelectableKinds / isRegistrySelectable / kindsWithFloorplanScope / isRegistryMovable / isPresettable / isDrawnViaTool / setPluginDiscovery / discoverPlugins` 等查询 / 注册函数 |
| `handles.ts` | 在世界中的 resize / move 箭头描述符（`HandleList / TranslateHandle / LinearResizeHandle / ArcResizeHandle / EndpointMoveHandle` 等） |
| `scene-api.ts` | `createSceneApi(store)` —— 将 `useScene` store 包装成 NodeDefinition 用的 `SceneApi`（get / update / upsert / delete / pauseHistory / cloneNodesInto） |
| `subtree.ts` | 子树克隆 + 收集（`collectSubtree / cloneNodesInto`），用于 preset 保存 / 粘贴 |
| `relations-resolver.ts` | `cascadeDirty` —— 顺着 `relations.hosts / relations.affectsSpatial` 把 dirty 标记传播到关联节点 |
| `index.ts` | 包内 barrel，re-export 上述全部 |

外加一个依赖文件：

- `packages/core/src/store/history-control.ts` —— `pauseSceneHistory / resumeSceneHistory`（reference counting；scene-api 用）

**唯一的 VilHil-managed 改动**：`registry.ts` 顶部 `isDevMode()` 把 `process` 引用通过 `(globalThis as { process? }).process` 安全转换，让 core 包在不依赖 `@types/node` 的前提下能 typecheck。运行时语义完全不变。

### 2.2 `packages/core/src/index.ts` 新导出

```ts
// Registry / Plugin infrastructure (Phase 2A)
export {
  discoverPlugins, getHostRefFields, getSelectableKinds,
  isDrawnViaTool, isDrawnViaToolKind, isPresettable, isPresettableKind,
  isRegistryMovable, isRegistrySelectable, kindsWithFloorplanScope,
  loadPlugin, nodeRegistry, type PluginDiscovery,
  registerNode, setPluginDiscovery,
} from './registry/registry'
export type {
  AnyNodeDefinition, Capabilities, NodeCategory,
  NodeDefinition, NodeRegistry, Plugin, Presentation, SurfaceRole,
} from './registry/types'
```

注意：暂未导出全部 type（`GeometryContext / FloorplanGeometry / DragAction / HandleList` 等）。Phase 2B 起会按需扩展。

### 2.3 新建 `@pascal-app/nodes` workspace

```
packages/nodes/
├── package.json          # 私有 workspace，唯一依赖 @pascal-app/core
├── tsconfig.json         # 继承 react-library，path 映射到 ../core/src
└── src/
    └── index.ts          # export const builtinPlugin: Plugin = { id: 'pascal:core', apiVersion: 1, nodes: [] }
```

**为什么是空数组？** 因为：
- 上游 `packages/nodes/<kind>/` 的每个 kind 都包含完整 `renderer.tsx / tool.tsx / panel.tsx / system.tsx / geometry.ts / floorplan.ts / definition.ts`，**强依赖** viewer / editor 内部组件 API
- VilHil 当前 viewer/editor 仍走硬编码 dispatch（`switch (node.type)`），上游 NodeDefinition 没人消费
- 把 `nodes: []` 留空，意味着 `loadPlugin(builtinPlugin)` 是空操作，但**接口已经打通**——任何后续注册（包括 smarthomePlugin）走的是同一条管道

### 2.4 App 入口接入

`apps/editor/app/plugin-bootstrap.ts`：

```ts
import { loadPlugin } from '@pascal-app/core'
import { builtinPlugin } from '@pascal-app/nodes'

let bootstrapped = false
export function ensurePluginsBootstrapped(): void {
  if (bootstrapped) return
  bootstrapped = true
  loadPlugin(builtinPlugin).catch(err => console.warn(...))
}
ensurePluginsBootstrapped()  // 模块层立刻触发一次
```

`apps/editor/app/page.tsx` 顶部 side-effect import：

```ts
import './plugin-bootstrap'
```

Next.js / Webpack 保证模块只执行一次。HMR 下 `loadPlugin` 内部 `_register` 在 dev mode 会 warn 而不抛——但 `bootstrapped` 守卫先于 `loadPlugin`，正常情况只会走一次。

---

## 2.5 Phase 2B 做了什么（已落地）

把 `device` kind 通过 `smarthomePlugin` 注册进 `nodeRegistry`——让 device 在架构上"独立成 plugin"，是 VilHil smarthome 的 domain 节点，不再是 inline 进 Pascal core 的杂质。**Runtime 行为不变**：viewer/editor 仍走硬编码 dispatch 渲染 device，plugin 注册是声明式 + 元数据。

### 2.5.1 新增文件

| 文件 | 用途 |
|---|---|
| `packages/smarthome/src/plugin/device-definition.ts` | `deviceDefinition: NodeDefinition<typeof DeviceNode>`——只填 schema/category/defaults/capabilities/presentation，渲染相关字段全留 undefined |
| `packages/smarthome/src/plugin/index.ts` | `smarthomePlugin: Plugin = { id: 'vilhil:smarthome', apiVersion: 1, nodes: [deviceDefinition] }` |

### 2.5.2 修改文件

| 文件 | 改动 |
|---|---|
| `packages/smarthome/src/index.ts` | 新 export `smarthomePlugin / deviceDefinition` |
| `apps/editor/app/plugin-bootstrap.ts` | 在 `loadPlugin(builtinPlugin)` 之后追加 `loadPlugin(smarthomePlugin)`，dev 模式打印一行 sanity console |

### 2.5.3 deviceDefinition 字段实际填法

```ts
export const deviceDefinition: NodeDefinition<typeof DeviceNode> = {
  kind: 'device',
  schemaVersion: 1,
  schema: DeviceNode,
  category: 'furnish',            // device 属于 Furnish 体系（CLAUDE.md §2 硬规则 1）
  defaults: () => {
    // 跟上游 door 一致：parse 最小 stub，丢 id/type
    const stub = DeviceNode.parse({
      id: 'device_default', type: 'device',
      parentId: null, subsystem: 'lighting', renderType: '',
    })
    const { id, type, ...rest } = stub
    return rest
  },
  capabilities: {
    movable: { axes: ['x','y','z'] },
    rotatable: { axes: ['y'] },
    selectable: { hitVolume: 'bbox' },
    duplicable: true, deletable: true,
    hostable: { parents: ['level','wall','ceiling'], fromAsset: 'attachTo' },
    hostRefFields: ['wallId', 'wallT'],
  },
  presentation: {
    label: '智能设备',
    icon: { kind: 'iconify', name: 'lucide:zap' },
    paletteSection: 'furnish',
  },
  // renderer/geometry/floorplan/tool/system/parametrics/handles/affordances/
  // preview/toolHints/affordanceTools/keyboardActions 全部留 undefined
  // —— viewer/editor 现有硬编码 dispatch 继续工作。
}
```

### 2.5.4 验证

- `nodeRegistry.get('device')` 返回 deviceDefinition（运行时）
- `isRegistrySelectable('device')` → `true`（`selectable` 已声明）
- `isRegistryMovable('device')` → `true`（`movable` 已声明）
- `getSelectableKinds()` 包含 `'device'`
- `kindsWithFloorplanScope('level')` 包含 `'device'`（默认 scope）
- typecheck：editor 维持 40 错（baseline），apps/editor 维持 37 错（baseline），零新增
- VilHil 编辑器主流程：设备放置、子系统聚焦、proposal-demo、curtain 动画、subsystem panel 全部不变

### 2.5.5 一个 TS 类型 quirk

`Plugin.nodes: AnyNodeDefinition[]`（= `NodeDefinition<ZodObject<any>>[]`）与 `NodeDefinition<typeof DeviceNode>` 之间，TS 不接受 ZodObject 复杂泛型参数上的协变，**必须显式 `as unknown as AnyNodeDefinition` cast**。这与上游 `packages/nodes/src/index.ts` 同款（上游对每个 def 都同样 cast），不是 VilHil 引入的污点。

---

## 3. 未来扩展（Phase 2C+）

### 3.1 注册一个 device kind（smarthomePlugin 示例）

**注意**：以下是早先 Phase 2A 草拟的"如果要做"模板，**Phase 2B 已经按此模板落地**（见 §2.5）。保留示例作为新 plugin 作者的参考。

在 `@vilhil/smarthome` 中：

```ts
// packages/smarthome/src/plugin.ts
import type { Plugin, NodeDefinition } from '@pascal-app/core'
import { DeviceNode } from '@pascal-app/core'  // 已在 schema/nodes/device.ts

export const deviceDefinition: NodeDefinition<typeof DeviceNode> = {
  kind: 'device',
  schemaVersion: 1,
  schema: DeviceNode,
  category: 'furnish',
  defaults: () => ({
    subsystem: 'lighting',
    productId: '',
    parameters: {},
    /* ... */
  }),
  capabilities: {
    movable: { axes: ['x', 'y', 'z'] },
    rotatable: { axes: ['y'] },
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    hostable: { parents: ['level', 'wall', 'ceiling'], fromAsset: 'attachTo' },
    hostRefFields: ['wallId', 'wallT'],
  },
  presentation: {
    label: '智能设备',
    icon: { kind: 'iconify', name: 'lucide:zap' },
    paletteSection: 'furnish',
  },
  // renderer/tool/panel/parametrics 等字段当前阶段**不填**——viewer/editor 仍走硬编码 dispatch
}

export const smarthomePlugin: Plugin = {
  id: 'vilhil:smarthome',
  apiVersion: 1,
  nodes: [deviceDefinition],
}
```

然后在 `apps/editor/app/plugin-bootstrap.ts` 加：

```ts
import { smarthomePlugin } from '@vilhil/smarthome'
// ...
loadPlugin(smarthomePlugin)
```

### 3.2 各字段当前阶段如何填

| NodeDefinition 字段 | Phase 2A | Phase 2B（device 注册）| Phase 3+（实际接管渲染）|
|---|---|---|---|
| `kind` | — | ✅ `'device'` | ✅ |
| `schemaVersion` | — | ✅ `1` | ✅ |
| `schema` | — | ✅ `DeviceNode` | ✅ |
| `category` | — | ✅ `'furnish'` | ✅ |
| `defaults()` | — | ✅ | ✅ |
| `capabilities` | — | ✅（核心 capability 填上）| ✅ |
| `presentation` | — | ✅（按需）| ✅ |
| `renderer` | — | ❌ null/undefined | ✅ migrate from viewer/.../device-renderer.tsx |
| `geometry` | — | ❌ | ✅ |
| `floorplan` | — | ❌ | ✅ |
| `tool` | — | ❌ | ✅ |
| `system` | — | ❌ | ✅ |
| `parametrics` | — | ❌（device-panel 仍是 inline）| ✅ migrate from editor/.../device-panel.tsx |
| `affordances / handles / preview / toolHints` | — | ❌ | 视需要 |

**核心约定**：在 viewer/editor 还没接 NodeRenderer dispatch 之前，**只填 schema/category/defaults/capabilities/presentation 等纯数据字段**就够了。渲染 / tool / panel 这些 React 字段先**留空**，让现有硬编码 dispatch 继续 work。

### 3.3 device-renderer / device-geometry / animations/ 当前位置

- `packages/viewer/src/components/renderers/device/**` —— **保留**，硬编码 dispatch 继续工作
- `packages/viewer/src/components/renderers/device/animations/curtain/**` —— **保留**
- `packages/editor/src/components/ui/panels/device-panel/**` —— **保留**

迁移到 NodeDefinition 是 Phase 3+ 的事，要求 viewer 先接 `<NodeRenderer>` 通用 dispatch。Phase 2B **不强求**迁移，只把 device 在类型层注册到 `nodeRegistry`，让上游 `isRegistrySelectable('device') / kindsWithFloorplanScope('level')` 等查询能识别 device。

---

## 4. 兼容性与陷阱

### 4.1 nodeRegistry 是模块单例

`nodeRegistry` 是 `packages/core/src/registry/registry.ts` 顶层 `new NodeRegistryImpl()`，整个进程只有一份。Next.js dev 下 HMR 会重新执行 module body，但 `loadPlugin` 内部 `_register` 会 warn-and-replace（dev 模式），不会抛。

### 4.2 `loadPlugin` 是 async（返回 Promise）

虽然当前 `builtinPlugin.nodes` 为空，`loadPlugin` 立刻 resolve。但接口签名是 `Promise<void>`，将来可能加 lazy module 加载——所以 `apps/editor/app/plugin-bootstrap.ts` 显式 `.catch(...)` 避免 unhandled rejection。

### 4.3 重复 import bootstrap

`bootstrapped` 守卫确保多个 client component import 同一文件时只执行一次。同时 module-level IIFE 自带"只跑一次"语义——双保险。

### 4.4 SSR 安全性

`plugin-bootstrap.ts` 没有任何 DOM / window 引用，可以在 SSR 时也执行。Server / client 各跑一次，分别注册自己的 module-level Map，互不干扰。

### 4.5 dist 缓存

`@pascal-app/core` 的 package.json `main` 指 `./src/index.ts`，但当 `apps/editor` 通过 TS project reference 引用时，TypeScript 读的是 `dist/index.d.ts`。**修改 core 导出后必须 `cd packages/core && bunx tsc --build` 刷新 dist**，否则 apps/editor 看不到新类型。

---

## 5. 验收 checklist

### Phase 2A

- [x] `import { loadPlugin, nodeRegistry, type Plugin, type NodeDefinition } from '@pascal-app/core'` 类型可用
- [x] `import { builtinPlugin } from '@pascal-app/nodes'` 类型可用
- [x] `loadPlugin(builtinPlugin)` 调用通过（运行时与类型）
- [x] viewer / editor / device 渲染**完全不受影响**（硬编码 dispatch 保留）
- [x] typecheck：core / viewer / smarthome / nodes 全绿
- [x] typecheck：editor 仍 40 错（baseline 不变，零新增）
- [x] `docs/ARCHITECTURE-LAYERING.md` §5.3 Phase 2A 标记 ✅
- [x] `docs/UPSTREAM-PATCHES.md` 新增条目 N1

### Phase 2B

- [x] `import { smarthomePlugin, deviceDefinition } from '@vilhil/smarthome'` 在 app 入口可用
- [x] `loadPlugin(smarthomePlugin)` 调用通过；`nodeRegistry.get('device')` 返回 deviceDefinition
- [x] `isRegistrySelectable('device') / isRegistryMovable('device') / getSelectableKinds()` 识别 device
- [x] `kindsWithFloorplanScope('level')` 包含 device（默认 scope）
- [x] VilHil 编辑器主流程（设备放置、子系统聚焦、proposal-demo、curtain 动画）不受影响
- [x] typecheck baseline 保持：editor 40 / apps/editor 37 错，零新增
- [x] `docs/ARCHITECTURE-LAYERING.md` §5.3 Phase 2B 标记 ✅
- [x] `docs/UPSTREAM-PATCHES.md` L1 状态改为 🟡 migrating

---

## 6. 关联文档

- `docs/ARCHITECTURE-LAYERING.md` —— VilHil ↔ Pascal 分层契约
- `docs/UPSTREAM-PATCHES.md` —— 当前侵入点登记（含 N1 / Phase 2A）
- `docs/ARCHITECTURE.md` —— VilHil 内部分层
- `CLAUDE.md` —— AI 协作主规范
