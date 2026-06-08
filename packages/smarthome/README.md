# @vilhil/smarthome

VilHil 智能家居 domain 包：设备目录 / 模型库 / 状态管理 / 工具函数 / 3D 组件。

## 作为 plugin（Phase 2B 起）

自 Phase 2B（2026-06-08）起，本包导出 `smarthomePlugin: Plugin`，由 app 入口
通过 `loadPlugin(smarthomePlugin)` 注册到全局 `nodeRegistry`：

```ts
import { smarthomePlugin } from '@vilhil/smarthome'
import { loadPlugin } from '@pascal-app/core'

await loadPlugin(smarthomePlugin)  // 注册 device kind 等
```

当前 `smarthomePlugin.nodes` 只含 `deviceDefinition`，且 definition 中
renderer / tool / panel / system 等渲染相关字段一律留 undefined ——
VilHil 现有 viewer / editor 硬编码 dispatch 继续负责实际渲染。

plugin 注册的实际作用是**让 device 成为 nodeRegistry 的一等公民**：
`isRegistrySelectable('device')` / `getSelectableKinds()` /
`kindsWithFloorplanScope(...)` 等上游查询函数能正确识别 device，
为 Phase 2C+ 真正接管渲染做铺垫。

详见：
- `src/plugin/device-definition.ts` —— deviceDefinition 实际字段
- `src/plugin/index.ts` —— smarthomePlugin 装配
- `docs/NODES-PLUGIN-ARCHITECTURE.md` §2.5 Phase 2B 段
- `docs/ARCHITECTURE-LAYERING.md` §5.3 Phase 2B
- `docs/UPSTREAM-PATCHES.md` L1

## 主要导出

| 来源 | 内容 |
|---|---|
| `./device-catalog` | 设备目录、子系统元数据 |
| `./device-state` | useDeviceState（UI 偏好真值，与 useScene 设备运行时真值分层） |
| `./meta` | Product / Instance 分层元数据框架 |
| `./models` | 3D 模型库（设计师维护的程序化模型 + 注册表） |
| `./tools` | 工具函数（placeDevice / executeScene / buildTopology / ...） |
| `./components` | 3D 渲染 / 交互 / 动画组件 |
| `./plugin` | smarthomePlugin（Phase 2B 新增） |
