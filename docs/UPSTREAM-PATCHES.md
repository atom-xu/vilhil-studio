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

### 🔴 严重越界

#### L1 · DeviceNode inline 进 core schema
- **文件**：`packages/core/src/schema/nodes/device.ts`（294 行，整文件新增）
- **状态**：🔴 active
- **代价**：上游若修改 NodeBase 类型/导出方式即冲突
- **迁出方案**：等待 PR1（`Node.extensions`）；过渡期保留，但**禁止**继续往这个文件加字段
- **责任人**：未指定
- **关联 commit**：`279e0446`、`b0fdbfe3`

#### L2 · window.ts 删除上游字段
- **文件**：`packages/core/src/schema/nodes/window.ts`
- **状态**：🔴 active（**Phase 1 必须修复**）
- **代价**：删除 `openingKind/windowType/operationState` 等 17 个上游字段；上游任何依赖这些字段的代码合并都冲突
- **迁出方案**：恢复所有删除字段为 `optional`，新加的 `presetId` 保留为扩展字段
- **责任人**：未指定
- **关联 commit**：`279e0446`

#### L3 · 删除 8 个上游节点类型
- **文件**：`packages/core/src/schema/nodes/{elevator,fence,column,shelf,spawn,ridge-vent,skylight,solar-panel}.ts`
- **状态**：🔴 active（**Phase 1 必须修复**）
- **代价**：上游任何用到这些类型的代码合并都冲突；上游若新增依赖会持续撞车
- **迁出方案**：`git show upstream/main:<path>` 恢复文件原状；VilHil UI 在 `apps/editor/app/**` 层 hide
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
- **文件**：`packages/editor/src/components/ui/panels/device-panel.tsx`
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
- [ ] 合并后 `pnpm typecheck` 通过？
- [ ] proposal-demo / 编辑器主流程冒烟通过？

合并完成后更新本表：
- 若某条 active → migrating 或 resolved，移到对应区块
- 若上游新增了某个能力让某个 PR 候选不再需要，移除该 PR 行

---

## 更新记录

- 2026-06-03：初版建表；从 `ARCHITECTURE-LAYERING.md` §4 审计结果迁入
- 2026-06-03 · Phase 1.5：恢复剩余被删的上游 schema —— 整文件（box-vent / chimney / cupola / dormer / downspout / eyebrow-vent / gutter / surface-hole-metadata / turbine-vent / asset-url）+ 字段恢复（wall / roof / roof-segment / stair / door / item / ceiling / slab / stair-segment / building / site / guide / scan / material）。VertexNode / precision 保留为 VilHil 自有。chimney/dormer/box-vent 调研：schema 文件已恢复；上游 `packages/nodes/**` 子节点完整实现包暂不引入（与 VilHil 上层架构耦合度低，留作后续）。新增 L6–L15 侵入点登记。typecheck：core / viewer / smarthome 全绿，editor 维持基线 40 错（与改动前相同）。
