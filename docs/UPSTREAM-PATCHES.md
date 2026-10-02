# 上游侵入点登记表

> 配套 `docs/ARCHITECTURE-LAYERING.md`。所有改动 `packages/core/**`、`packages/editor/**`、`packages/viewer/**` 的地方，必须在此登记。
>
> 每次合并上游前必须读此文件，逐条决定如何处理冲突。
>
> 状态说明：
> - 🔴 **active**：当前仍以侵入方式存在
> - 🟡 **migrating**：正在迁出
> - 🟢 **upstreamed**：已 PR 给上游或上游已提供等价能力
> - ⚪ **resolved**：已完全迁到 VilHil 自有目录

---

## 当前侵入点（按 ARCHITECTURE-LAYERING.md §4 分类）

### 🟢 Phase 2A 引入（基础设施奠基，非业务越界）

#### N1 · registry 基础设施引入
- **文件**：
  - `packages/core/src/registry/{types,registry,handles,scene-api,subtree,relations-resolver,index}.ts`（全部 `git checkout upstream/main -- ...` 引入，**未做语义修改**）
  - `packages/core/src/store/history-control.ts`（scene-api 依赖，自包含模块）
  - `packages/core/src/registry/registry.ts` 头部 `isDevMode()` 函数把 `process` 引用改为 `(globalThis as { process? }).process` 安全转换，**运行时语义不变**——仅为让 core 在无 `@types/node` 下 typecheck 通过
- **状态**：🟢 upstreamed（即与上游同步，无 VilHil 自有侵入）
- **代价**：合并上游时这些文件应直接 take theirs；若上游又改了 `isDevMode()` 中的 process 引用方式，保留 VilHil 的安全转换形态
- **新建文件**（VilHil-managed）：
  - `packages/nodes/{package.json,tsconfig.json,src/index.ts}` —— 空 `builtinPlugin: Plugin = { id: 'pascal:core', apiVersion: 1, nodes: [] }`
  - `apps/editor/app/plugin-bootstrap.ts` —— 模块级 `loadPlugin(builtinPlugin)`，由 `apps/editor/app/page.tsx` side-effect import
  - `docs/NODES-PLUGIN-ARCHITECTURE.md` —— Plugin pattern 说明
- **`packages/core/src/index.ts` 导出新增**：`loadPlugin / nodeRegistry / registerNode / setPluginDiscovery / discoverPlugins / isRegistry* / type Plugin / type NodeDefinition / type Capabilities / type NodeCategory / type SurfaceRole / type Presentation` 等
- **未引入的上游子集**：
  - `packages/core/src/registry/__bench__/`（性能基准，需要 vitest bench）
  - `packages/core/src/registry/*.test.ts`（4 个测试文件，需要完整测试基础设施）
  - 注：以上是测试/基准代码，与运行时无关。后续若要引入测试基础设施再补
- **viewer / editor / device 渲染保持硬编码 dispatch 不变**——Phase 2A 的空 Map 已在 Phase 2B 注册 device；注册尚未接管实际渲染
- **关联文档**：`docs/ARCHITECTURE-LAYERING.md` §5.3 Phase 2A、`docs/NODES-PLUGIN-ARCHITECTURE.md`
- **关联 commit**：Phase 2A（2026-06-08）

---

### 🔴 严重越界

#### L1 · DeviceNode inline 进 core schema
- **文件**：`packages/core/src/schema/nodes/device.ts`（294 行，整文件新增）
- **状态**：🟡 migrating（Phase 2B：schema 仍住 core，但 device kind 已通过 `smarthomePlugin.deviceDefinition` 注册到 `nodeRegistry`——节点的「逻辑归属」已搬到 VilHil 上层）
- **代价**：上游若修改 NodeBase 类型/导出方式即冲突
- **迁出方案**：等待 PR1（`Node.extensions`）；过渡期保留，但**禁止**继续往这个文件加字段
- **Phase 2B 进度**：`packages/smarthome/src/plugin/{device-definition,index}.ts` 通过 `loadPlugin(smarthomePlugin)` 在 app 启动时注册 device kind；现有 viewer/editor 硬编码 dispatch 仍负责实际渲染
- **责任人**：未指定
- **关联 commit**：`279e0446`、`b0fdbfe3`、Phase 2B（2026-06-08）

#### L2 · window.ts 删除上游字段
- **文件**：`packages/core/src/schema/nodes/window.ts`
- **状态**：⚪ resolved（删除问题已在 Phase 1 恢复；2026-09-19 对照源码复核）
- **当前差异**：上游字段作为 optional 保留，VilHil 的 `presetId` 和位置量化仍需在合并时维护
- **后续**：保留字段恢复成果；本条 resolved 不表示整个 window schema 与上游相同
- **责任人**：未指定
- **关联 commit**：`279e0446`

#### L3 · 删除 8 个上游节点类型
- **文件**：`packages/core/src/schema/nodes/{elevator,fence,column,shelf,spawn,ridge-vent,skylight,solar-panel}.ts`
- **状态**：⚪ resolved（8 个 schema 文件已恢复并纳入版本控制；2026-09-19 复核）
- **后续**：UI 层按需隐藏；schema 文件存在不代表对应 renderer/tool 已完成注册迁移
- **责任人**：未指定
- **关联 commit**：`b0fdbfe3`

#### L4 · use-editor 设备/拓扑/proposal 切片 inline
- **文件**：`packages/editor/src/store/use-editor.tsx`（+627 行）
- **状态**：🔴 active
- **代价**：上游 store 重构必冲突；耦合度高
- **迁出方案**：拆为 `packages/smarthome/src/store/use-smart-editor.ts`
- **责任人**：未指定

#### L5 · floorplan-panel 智能家居交互 inline
- **文件**：`packages/editor/src/components/editor/floorplan-panel.tsx`
- **状态**：🔴 active
- **代价**：~1 万行文件，上游和 VilHil 都猛改 —— 高冲突
- **迁出方案**：等上游 drawTool registry 公开 API；过渡期保持现状
- **责任人**：未指定

---

### 🟡 中度越界

#### M1 · level.ts 加 northAngle + circuitMeta
- **文件**：`packages/core/src/schema/nodes/level.ts`
- **状态**：🔴 active（但**可接受**）
- **性质**：纯加字段、向后兼容
- **迁出方案**：等 PR1 合并后迁到 `extensions`

#### M2 · device-renderer 在 viewer 包内
- **文件**：`packages/viewer/src/components/renderers/device/device-renderer.tsx`
- **状态**：🔴 active
- **迁出方案**：迁到 `packages/smarthome/src/viewer/`，通过 renderRegistry 注册

#### M3 · device-geometry 在 viewer 包内
- **文件**：`packages/viewer/src/components/renderers/device/device-geometry.tsx`
- **状态**：🔴 active
- **迁出方案**：同 M2

#### M4 · device-panel 在 editor 包内
- **文件**：`packages/editor/src/components/ui/sidebar/panels/device-panel/index.tsx`
- **状态**：🔴 active
- **迁出方案**：等 panel slot；过渡期挪到 `packages/smarthome/src/components/`

#### M5 · DeviceEvent 加进 EditorEvents
- **文件**：`packages/core/src/events/bus.ts`
- **状态**：🔴 active
- **迁出方案**：PR3 `extendEditorEvents<T>()`

#### L6 · wall.ts 量化转换 + VertexNode 软引用
- **文件**：`packages/core/src/schema/nodes/wall.ts`
- **状态**：🔴 active
- **性质**：position 加 quantizePoint 转换、新增 `startNodeId/endNodeId` 可选字段。Phase 1.5 已恢复上游所有删除字段（materialPreset / 内外饰面 / curveOffset / `WallSurfaceMaterialSpec`）为 optional
- **代价**：合并上游若 wall schema 调整，需重新挂载 quantizePoint
- **迁出方案**：等 PR1（`Node.extensions`）将 startNodeId/endNodeId 迁到 extensions
- **关联 commit**：Phase 1.5

#### L7 · roof.ts 量化转换
- **文件**：`packages/core/src/schema/nodes/roof.ts`
- **状态**：🔴 active
- **性质**：position 加 quantizePoint3 转换。Phase 1.5 已恢复所有上游字段（materialPreset / role-specific materials / getEffectiveRoofSurfaceMaterial）
- **迁出方案**：长期保留——quantizePoint3 是 VilHil 核心精度策略
- **关联 commit**：Phase 1.5

#### L8 · roof-segment.ts 量化转换
- **文件**：`packages/core/src/schema/nodes/roof-segment.ts`
- **状态**：🔴 active
- **性质**：position 加 quantizePoint3 转换。Phase 1.5 已恢复所有上游字段（pitch / 各 shape ratios / slope helpers / getActiveRoofHeight 等）；早先 VilHil 用 roofHeight 替代 pitch 已撤回
- **关联坑**：`packages/core/src/systems/roof/roof-system.tsx` 仍依赖语义层的 roofHeight，已改为通过 `getActiveRoofHeight()` 派生
- **迁出方案**：长期保留 quantizePoint3
- **关联 commit**：Phase 1.5

#### L9 · stair.ts 量化转换
- **文件**：`packages/core/src/schema/nodes/stair.ts`
- **状态**：🔴 active
- **性质**：position 加 quantizePoint3 转换。Phase 1.5 已恢复上游所有字段（stairType / 楼梯参数 / surface material 角色 / getEffectiveStairSurfaceMaterial）
- **迁出方案**：长期保留 quantizePoint3
- **关联 commit**：Phase 1.5

#### L10 · door.ts 量化转换
- **文件**：`packages/core/src/schema/nodes/door.ts`
- **状态**：🔴 active
- **性质**：position 加 quantizePoint3 转换。Phase 1.5 已恢复上游所有删除字段（doorCategory / doorType / openingKind / swingAngle 等门型相关字段）
- **迁出方案**：长期保留 quantizePoint3
- **关联 commit**：Phase 1.5

#### L11 · item.ts 量化转换 + 设备扩展字段
- **文件**：`packages/core/src/schema/nodes/item.ts`
- **状态**：🔴 active
- **性质**：position 加 quantizePoint3 转换；新增 cameraParams（安防摄像头 FOV/range/yaw）、rotationEffect（控件驱动节点旋转）、assetSchema.wallArm（自动 wall-side 手臂 + 安装板）、WallArm 类型导出。Phase 1.5 已恢复上游字段（floorPlanUrl / source / isDraft / functionTags / isLowProfileItemSurface）
- **代价**：合并上游若 ItemNode 重构，需重新挂载 VilHil 新增字段
- **迁出方案**：等 PR1（`Node.extensions`）将 cameraParams/wallArm 迁到 extensions
- **关联 commit**：Phase 1.5

#### L12 · guide.ts 上游版本恢复
- **文件**：`packages/core/src/schema/nodes/guide.ts`
- **状态**：🔴 active（实际无 VilHil 改动，标 active 仅为登记）
- **性质**：Phase 1.5 已从上游恢复完整版本（AssetUrl / GuideScaleReference / scaleReference）；之前曾被 VilHil 简化
- **迁出方案**：无需迁出
- **关联 commit**：Phase 1.5

#### L13 · ceiling.ts 量化转换
- **文件**：`packages/core/src/schema/nodes/ceiling.ts`
- **状态**：🔴 active
- **性质**：polygon/holes 加 quantizePolygon 转换。Phase 1.5 已恢复 materialPreset/holeMetadata/autoFromWalls 与 SurfaceHoleMetadata 依赖
- **迁出方案**：长期保留 quantizePolygon
- **关联 commit**：Phase 1.5

#### L14 · slab.ts 量化转换
- **文件**：`packages/core/src/schema/nodes/slab.ts`
- **状态**：🔴 active
- **性质**：polygon/holes 加 quantizePolygon 转换（与墙端点共用 1cm 网格）。Phase 1.5 已恢复 materialPreset/holeMetadata/autoFromWalls
- **迁出方案**：长期保留 quantizePolygon
- **关联 commit**：Phase 1.5

#### L15 · stair-segment.ts 量化转换
- **文件**：`packages/core/src/schema/nodes/stair-segment.ts`
- **状态**：🔴 active
- **性质**：position 加 quantizePoint3 转换。Phase 1.5 已恢复 materialPreset
- **迁出方案**：长期保留 quantizePoint3
- **关联 commit**：Phase 1.5

---

### 🟢 可接受越界

| ID | 文件 | 性质 |
|---|---|---|
| OK1 | `packages/core/src/index.ts` | DeviceNode re-export，一行 |
| OK2 | `packages/viewer/.../device-renderer.tsx` | productId prop 透传 |
| OK3 | r3f.d.ts | TypeScript 类型补丁，无运行时影响 |
| OK4 | `packages/viewer/.../hvac-ribbon-flow.tsx` | bug fix（`getDelta()` 误用）——**应反哺上游**（见 PR6）|

---

## 上游 PR 推进表（Phase 3）

| ID | PR 标题 | 状态 | VilHil 受益 |
|---|---|---|---|
| PR1 | feat(core): `Node.extensions?: Record<string, unknown>` for third-party fields | 未提交 | L1、M1 |
| PR2 | feat(viewer): `registerNodeRenderer(kind, Component)` API | 未提交 | M2、M3 |
| PR3 | feat(core): `extendEditorEvents<T>()` type augmentation API | 未提交 | M5 |
| PR4 | refactor(editor): drawTool registry public API | 跟进上游 #346 | L5 |
| PR5 | feat(editor): panel slot registry | 跟进上游 #350 | M4 |
| PR6 | fix(viewer): hvac-ribbon-flow `clock.getDelta()` per-frame correctness | 未提交 | bug fix |

---

## 合并上游时的检查清单

每次 `git merge upstream/main` 前必读：

- [ ] 本表 🔴 active 条目是否已减少？
- [ ] 上游新版本是否引入了能让我们去除某个侵入点的扩展点？
- [ ] L1~L5 各文件冲突如何解决？（默认：VilHil 保留侵入，但不破坏上游新加字段）
- [ ] 合并后 `bun run check-types` 及 core/viewer/smarthome 包级类型检查通过？
- [ ] proposal-demo / 编辑器主流程冒烟通过？

合并完成后更新本表：
- 若某条 active → migrating 或 resolved，移到对应区块
- 若上游新增了某个能力让某个 PR 候选不再需要，移除该 PR 行

---

## 更新记录

### 2026-10-02 本地 WIP 快照登记

按本次“先本地提交”的要求保存既有工作区。以下补丁仍为 **active / 待验收**；此快照不表示功能完成或生产发布门禁通过。

| ID | 文件范围 | 当前改动与迁出方向 |
|---|---|---|
| M6 | `packages/editor/src/components/editor/{index.tsx,device-workspace.tsx,topology-workspace.tsx,topology/*}`、`packages/editor/package.json`；延续 M4 的 device-panel | 设备目录独立工作区、拓扑节点/连线/布局与 Dagre 依赖；TODO：业务工作区迁到 smarthome，通过 editor slot 接入。楼层与保存行为仍需完整验收。 |
| M7 | `packages/viewer/src/components/renderers/device/animations/curtain/{curtain-container.tsx,index.ts,side-open.tsx,curtain-3d-class.ts,HANDOFF.md}` | 参数化单层/双层窗帘及 R3F 包装；TODO：随 M2/M3 迁出。隐藏窗帘仍持续更新，保留为后续性能修复项。 |
| M8 | `packages/viewer/src/components/renderers/device/{device-geometry.tsx,model-registry.ts}`、`packages/viewer/src/hooks/use-gltf-ktx2.tsx`、`packages/viewer/src/lib/bvh.ts`、`packages/viewer/package.json` | UniFi 模型映射、Draco 加载与按 mesh 启用 BVH；TODO：模型选择与业务渲染迁到 smarthome，通用加载扩展独立评审。共享缓存资源生命周期仍待完整验证。 |

提交前按 `CODE-REVIEW.md` 核对的状态：

- useFrame / 资源清理：已查看窗帘更新与 dispose、GLB/BVH 处理；已知隐藏窗帘持续更新和缓存资源清理边界尚未全部关闭。
- useMemo：窗帘用于实例初始化，销毁放在 effect cleanup；不将此静态检查等同于完整 StrictMode 验收。
- 导出：窗帘入口、Player API 工具入口及拓扑相对导入已存在；没有把辅助文件机械地全部重导出为公共 API。
- 数据字段：本快照未改变 core schema；Player API 的楼层读取问题及状态文档偏差仍见 `HANDOFF-2026-09-19.md`，未宣称字段与状态契约已收敛。
- effect 清理：键盘监听与窗帘销毁有 cleanup；拓扑自动布局的延迟 fitView 尚无定时器清理，完整切换/卸载回归待做。
- 800 行限制：未通过，device-workspace、topology-workspace、editor/index 与 device-geometry 仍超限；本次保留已有实现，不在保存快照时重构。
- 敏感配置：待提交文件仅有模板或运行时生成表达式；本机环境文件、数据库和运行日志不入库。
- 2026-10-02 重跑：core/viewer/smarthome 类型检查通过；editor 仍有 40 条、app 37 条类型错误（有重叠）；服务脚本 6 项测试、AssetUrl 39 项测试通过；全库 lint 仍有 21 errors / 46 warnings / 76 infos。该 WIP 快照保留已记录的 Tween、类型与生产迁移问题，后续交付必须继续关闭。

- 2026-09-19：复核 L2/L3 恢复状态、Phase 2B 注册状态与 M4 文件位置；仅校正文档，没有新增 Pascal 源码补丁。工作区中尚未提交的设备/拓扑/渲染改动仍需按接手记录逐项评审登记。

- 2026-06-03：初版建表；从 `ARCHITECTURE-LAYERING.md` §4 审计结果迁入
- 2026-06-03 · Phase 1.5：恢复剩余被删的上游 schema —— 整文件（box-vent / chimney / cupola / dormer / downspout / eyebrow-vent / gutter / surface-hole-metadata / turbine-vent / asset-url）+ 字段恢复（wall / roof / roof-segment / stair / door / item / ceiling / slab / stair-segment / building / site / guide / scan / material）。VertexNode / precision 保留为 VilHil 自有。chimney/dormer/box-vent 调研：schema 文件已恢复；上游 `packages/nodes/**` 子节点完整实现包暂不引入（与 VilHil 上层架构耦合度低，留作后续）。新增 L6–L15 侵入点登记。typecheck：core / viewer / smarthome 全绿，editor 维持基线 40 错（与改动前相同）。
- 2026-06-08 · Phase 2A：引入上游 registry 基础设施 + 建立 `@pascal-app/nodes` workspace + 接入 `loadPlugin(builtinPlugin)` 占位调用（见 N1）。viewer / editor / device 硬编码 dispatch 完全保留；nodeRegistry 当前为空 Map，对运行时零影响。typecheck：core / viewer / smarthome / nodes 全绿，editor 仍 40 错（基线不变）。
