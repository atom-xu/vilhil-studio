# VilHil ↔ Pascal 分层架构

> 本文件是 VilHil 与底层开源依赖 Pascal Editor 之间的**分层契约**。
> 任何对 `packages/core/**`、`packages/editor/**`、`packages/viewer/**` 的改动都必须先读这份文件。
>
> **优先级**：本文件 ≥ `docs/ARCHITECTURE.md` ≥ `docs/PASCAL-REUSE-AUDIT.md`。

---

## 1. 核心原则（不可破坏）

VilHil 是 Pascal Editor 之上的**业务扩展层**，**不是 Pascal 的分叉版**。

```
┌─────────────────────────────────────────────────┐
│  VilHil 上层（业务 / 渲染 / 智能 / 服务）        │
│  ───────────────────────────────────             │
│  · proposal-demo 演示渲染体系                    │
│  · smarthome 9 子系统设备与场景                  │
│  · 设备品牌定义（Lutron/UniFi/HDL/Aqara...）     │
│  · 账号 / 分享 / 项目持久化                      │
│  · Home Assistant 接入（未来）                   │
└────────────── ▲ 仅通过扩展点交互 ───────────────┘
                │  (registry / capability / hook / event)
┌────────────── ▼ ──────────────────────────────┐
│  Pascal 底层（建筑建模工具，作为依赖）            │
│  ───────────────────────────────────             │
│  · 2D 平面图编辑器（我们要用的核心）             │
│  · 建筑 schema（墙/门/窗/楼梯/屋顶/楼层）        │
│  · 几何系统（wall-system / roof-system 等）      │
│  · drawTool / placement / snap 工具链            │
│  · Pascal 自带 3D 渲染（保留但 VilHil 不使用）   │
└─────────────────────────────────────────────────┘
```

### 五条硬规则

1. **`packages/core/**`、`packages/editor/**`、`packages/viewer/**` 视同第三方依赖**，新增功能**默认不修改**这些文件。
2. **要扩展 Pascal 必须走它的扩展点**（registry / capability / event）；如果没有合适的扩展点，先在 VilHil 层包一层 adapter，**不要 inline 进 Pascal 源码**。
3. **如果某个能力必须 Pascal 配合**，写 PR 给上游加扩展点；在 PR 合并前临时打补丁的，必须在 `docs/UPSTREAM-PATCHES.md` 登记并标记 TODO。
4. **永不删除 Pascal 自带节点类型/字段**。需要禁用，靠 VilHil 层 UI 隐藏，不动 schema。
5. **VilHil 自己的渲染**走 `apps/editor/app/proposal-demo/**`，不依赖、也不污染 Pascal 的 viewer 渲染管线。

### 一句话原则

> **Pascal 的代码我们看，不改。改的全在 VilHil 自己的目录里。**

---

## 2. 分层模型详解

### 2.1 Pascal（底层）我们用什么、不用什么

| 子能力 | 使用方式 | VilHil 是否依赖 |
|---|---|---|
| **2D 平面图编辑器** | 直接用 | 🟢 核心依赖 |
| **建筑 schema**（墙/门/窗/楼梯/屋顶/楼层/物件）| 直接用 | 🟢 核心依赖 |
| **几何系统**（wall-mitering / roof-segments / wall-cutout）| 直接用 | 🟢 核心依赖 |
| **placement / snap / drawTool** 工具链 | 直接用 | 🟢 核心依赖 |
| **scene-registry / undo-redo / readOnly / 选中系统** | 直接用 | 🟢 核心依赖 |
| **Pascal 自带 3D 渲染（viewer 包默认管线）** | 编辑模式仍用 | 🟡 部分依赖 |
| **AI 建模功能** | 不用 | 🔴 不依赖 |
| **Pascal 的 preset/render-mode/edges 等新功能** | 选择性引入 | 🟡 视情况 |

### 2.2 VilHil（上层）有哪些独立领地

| 目录 | 职责 | 越界程度 |
|---|---|---|
| `packages/smarthome/**` | 智能家居业务包（catalog / models / tools / hooks）| 🟢 0% |
| `apps/editor/app/proposal-demo/**` | 演示渲染体系（自己的 R3F 场景）| 🟢 0% |
| `apps/editor/app/api/**` | 项目持久化、分享、认证 API | 🟢 0% |
| `apps/editor/app/{share,login,projects,...}/**` | 业务页面 | 🟢 0% |

这部分**完全干净**，是 VilHil 与上游的契约边界。后续所有新功能默认落在这里。

### 2.3 双向数据流

```
用户操作 (VilHil UI)
   ↓
VilHil tool 函数 (packages/smarthome/src/tools/**)
   ↓
通过 Pascal 的 useScene store 写真值
   ↓ ← Pascal 自己的事件系统 emitter
   ↓
sceneRegistry 注册的设备 ref / 节点
   ↓
VilHil proposal-demo 渲染器订阅 useScene → 渲染
```

**真值在 Pascal 的 `useScene`，UI 偏好在 VilHil 的 `useDeviceState`**（CLAUDE.md 已有此规则）。

---

## 3. Pascal 已有的扩展点（VilHil 必须优先使用）

| 扩展点 | 位置 | 用法示例 | VilHil 当前使用 |
|---|---|---|---|
| **sceneRegistry** (`useRegistry`) | `packages/core/src/registry/**` | `useRegistry(nodeId, 'device', ref)` | ✅ device-renderer 正确使用 |
| **emitter**（事件总线）| `packages/core/src/events/bus.ts` | `emitter.on('device:click', fn)` | ✅ proposal-demo 监听 |
| **commandRegistry** | `packages/editor/src/store/**` | `useCommandRegistry.register([...])` | ✅ proposal-demo 注册 |
| **paletteViewRegistry** | `packages/editor/src/store/**` | `usePaletteViewRegistry.register({...})` | ✅ proposal-demo 注册 |
| **placement strategies** | `packages/editor/src/tools/item/placement-strategies.ts` | 复用 floor/wall/ceiling 放置策略 | ✅ device 复用 |
| **wallId + wallT 吸附** | `packages/core/src/schema/nodes/item.ts` | `node.wallId / node.wallT` | ✅ 面板/门锁使用 |
| **wall-cutout** | `packages/core/src/systems/wall/wall-cutout.tsx` | 展示模式 cutaway 自动隐藏外墙 | ✅ 复用 |

### Pascal 当前**没有**的扩展点（VilHil 不得不打补丁的地方）

| 缺失的扩展点 | VilHil 当前的妥协 | 升级路径 |
|---|---|---|
| **节点 schema 扩展（metadata/extensions 字段）** | `DeviceNode` 直接 inline 进 `core/schema/nodes/device.ts` | 给上游 PR：`Node.extensions?: Record<string, unknown>` |
| **renderRegistry**（让外部包注册节点渲染器）| viewer 包硬编码 device-renderer | 给上游 PR：`registerNodeRenderer(kind, Component)` |
| **drawTool registry** | floorplan-panel inline 加灯带/窗帘画线 | 上游 #346 已开此口（drawTool capability），尚未公开 API；跟进 |
| **panel slot** | device-panel / floorplan-panel inline 修改 | 上游 #350 有 `headless inspector footer slot`；跟进 |
| **capability/hook 注入** | use-editor.tsx +627 行 inline | 上游 #348 `floorPlaced` capability 雏形；扩展之 |

---

## 4. 当前越界点清单（违反原则的地方，需逐步偿还）

> 数据来源：`origin/main..HEAD` 共 48 commit，**24 个修改了 Pascal 源码**，影响 ~160 个文件。

### 🔴 严重越界（结构性侵入，必须迁出）

| # | Pascal 文件 | VilHil 加了什么 | 性质 | 偿还方案 |
|---|---|---|---|---|
| **L1** | `packages/core/src/schema/nodes/device.ts`（294 行，新文件）| 完整的 DeviceNode + 9 子系统 enum + 安装类型 + 参数 schema | `inline-feature` | **方案 A**：上游 PR `Node.extensions`，把整段挪到 `packages/smarthome/src/schema/`；**方案 B（临时）**：在文件顶部加 `@vilhil-managed` 标记，合并冲突时 VilHil 始终保留 |
| **L2** | `packages/core/src/schema/nodes/window.ts` | 删除 17 个上游字段（openingKind/windowType/operationState/...），改用 `presetId` | `destructive-refactor` | **回滚删除**：恢复上游字段为可选；新加的 `presetId` 留作扩展字段。**这是合并最大障碍** |
| **L3** | `packages/core/src/schema/nodes/{elevator,fence,column,shelf,spawn,ridge-vent,skylight,solar-panel}.ts` | 整文件删除 | `destructive` | **恢复**：上游节点类型禁止删除，VilHil 不需要的，在 UI 层 hide 即可 |
| **L4** | `packages/editor/src/store/use-editor.tsx`（+627 行）| deviceWorkspace / topologyWorkspace / proposal mode | `inline-feature` | 拆为 `packages/smarthome/src/store/use-smart-editor.ts`，通过 zustand 切片合并 |
| **L5** | `packages/editor/src/components/editor/floorplan-panel.tsx` | 灯带画线 / 窗帘 ghost / 设备放置交互 | `inline-feature` | 等上游 drawTool registry 落地后迁出；过渡期保留补丁 |

### 🟡 中度越界（局部 inline，可短期容忍）

| # | Pascal 文件 | VilHil 加了什么 | 偿还方案 |
|---|---|---|---|
| M1 | `packages/core/src/schema/nodes/level.ts` | `northAngle` + `circuitMeta` 可选字段 | 等待 `Node.extensions` 后迁入；当前可保留（不破坏上游）|
| M2 | `packages/viewer/src/components/renderers/device/device-renderer.tsx` | DeviceRenderer 整套渲染 | 迁到 `packages/smarthome/src/viewer/`，通过 renderRegistry 注册 |
| M3 | `packages/viewer/src/components/renderers/device/device-geometry.tsx` | model-registry hookup + 子系统几何 switch | 同 M2 |
| M4 | `packages/editor/src/components/ui/panels/device-panel.tsx` | 设备控制面板 | 等 panel slot 后迁出 |
| M5 | `packages/core/src/events/bus.ts` | DeviceEvent 类型加进 union | 改为：上游导出 `extendEditorEvents<T>()`，VilHil 自己扩展 |

### 🟢 可接受越界（极小侵入，不计算入冲突预算）

| # | Pascal 文件 | VilHil 加了什么 |
|---|---|---|
| OK1 | `packages/core/src/index.ts` | 导出 DeviceNode（一行 re-export）|
| OK2 | `packages/viewer/.../device-renderer.tsx` | 传 `productId` 给子组件（一行 prop）|
| OK3 | r3f.d.ts 类型声明扩展 | TypeScript 类型补丁，不影响运行时 |
| OK4 | hvac-ribbon-flow.tsx 性能修复 | 修复 `clock.getDelta()` 误用 bug —— **应 PR 给上游** |

---

## 5. 修复路线图

### 5.1 阶段总览

```
当前 ───→ Phase 1：止血        ───→ Phase 2：迁出     ───→ Phase 3：上游接纳
        (2-3 天，零 Pascal 删除)    (1-2 周，迁 L4/M2-M5)  (持续，PR 上游)
                                                              ↓
                                                       Phase 4：合并 v0.9
                                                              ↓
                                                       Phase 5：双月同步
```

### 5.2 Phase 1 · 止血（最高优先级，2-3 天）

**目标**：把"破坏性"改动改回"加法"，立刻降低合并门槛。不增任何新功能。

| 任务 | 文件 | 工作量 |
|---|---|---|
| 1.1 恢复被删的 8 个节点类型文件 | `packages/core/src/schema/nodes/{elevator,fence,column,shelf,spawn,ridge-vent,skylight,solar-panel}.ts` | 0.5 天（git show + 复原） |
| 1.2 恢复 window.ts 被删的 17 个字段为可选 | `packages/core/src/schema/nodes/window.ts` | 0.5 天 |
| 1.3 VilHil UI 层添加节点类型黑名单，hide 不展示的节点 | `apps/editor/app/.../node-filter.ts`（新增）| 0.5 天 |
| 1.4 device.ts 顶部加 `@vilhil-managed-file` 注释 + 同步说明 | `packages/core/src/schema/nodes/device.ts` | 0.1 天 |
| 1.5 建立 `docs/UPSTREAM-PATCHES.md`，登记所有当前侵入点 | 新增 | 0.3 天 |

**完成判定**：`git diff upstream/main packages/core/src/schema/nodes/ -- ':!device.ts'` 只有"新增字段"和"新增文件"，**零删除**。

### 5.3 Phase 2 · 迁出（1-2 周，并行业务功能）

**目标**：把 L4 + M2~M5 从 Pascal 迁到 VilHil 自有包。

| 任务 | From → To | 风险 |
|---|---|---|
| 2.1 use-editor 设备/拓扑/proposal 切片迁出 | `packages/editor/.../use-editor.tsx` → `packages/smarthome/src/store/use-smart-editor.ts` | 🟡 需重新订阅 useScene |
| 2.2 device-renderer + device-geometry 迁出 | `packages/viewer/.../device/**` → `packages/smarthome/src/viewer/**` | 🟡 需在 proposal-demo 直接 mount，绕过 viewer node-renderer |
| 2.3 device-panel 迁出 | `packages/editor/.../device-panel.tsx` → `packages/smarthome/src/components/device-panel.tsx` | 🟢 已是独立组件，挪文件即可 |
| 2.4 floorplan-panel 智能家居交互抽出 | inline → `packages/smarthome/src/floorplan/{light-strip-tool,curtain-tool,device-tool}.tsx` | 🔴 等待 drawTool registry |

### 5.4 Phase 3 · 上游接纳（持续，背景任务）

**目标**：把 VilHil 需要但 Pascal 没有的扩展点，做成 PR 推给上游。被合并后我们就彻底不用打补丁。

PR 候选清单（按 ROI 排序）：

| # | PR 主题 | VilHil 受益 | 通用性 |
|---|---|---|---|
| PR1 | `Node.extensions?: Record<string, unknown>` | 摆脱 L1（device.ts inline）| 🌟🌟🌟 极高 |
| PR2 | `registerNodeRenderer(kind, Component)` | 摆脱 M2/M3 | 🌟🌟 高 |
| PR3 | `extendEditorEvents<T>()` 类型扩展 API | 摆脱 M5 | 🌟🌟 高 |
| PR4 | drawTool registry 公开 API | 摆脱 L5 | 🌟 中（上游已在做）|
| PR5 | panel slot registry | 摆脱 M4 | 🌟 中（上游已在做）|
| PR6 | hvac-ribbon-flow `getDelta()` 修复 | bug fix 反哺上游 | 🌟🌟 高（直接 cherry-pick）|

### 5.5 Phase 4 · 合并 v0.9（Phase 1+2 完成后）

完成 Phase 1+2 后，**`git diff upstream/main packages/` 的冲突应从 1432 文件 → 50 以内**。届时执行：

```bash
git checkout -b chore/upstream-sync-v0.9
git merge upstream/main          # 解决剩余冲突
pnpm typecheck && pnpm build     # 验证
# proposal-demo / 灯光 / 窗帘 / 设备放置 / 编辑器主流程 手工冒烟
```

预计 1-2 天完成。

### 5.6 Phase 5 · 双月同步（长期治理）

- 上游每发新版本（约 1-2 个月），开 `chore/upstream-sync-vX.Y` 分支
- 因为已经基本零侵入，合并应在 30 分钟内完成
- 同步同时检查：上游有没有新加扩展点能让 VilHil 进一步迁出？

---

## 6. 上游同步政策

### 6.1 拉取节奏

| 触发 | 行动 |
|---|---|
| 上游发新 minor 版（v0.X.0）| 1 周内开 sync 分支并合入 |
| 上游发 patch（v0.X.Y）| 视影响评估，安全 patch 直接合 |
| 上游修复影响 VilHil 的 bug | 立即 cherry-pick |
| 上游推出 VilHil 需要的扩展点 | 立即合并并启动对应迁出任务 |

### 6.2 不合入清单（明确不要的上游能力）

| 上游能力 | 不合入原因 |
|---|---|
| AI 建模（如果未来加入）| VilHil 不需要 AI 生成建筑；我们的智能在设备层 |
| Pascal 的 3D 演示渲染模式（Solid/Rendered/clay/themes）| VilHil 有自己的 proposal-demo 渲染体系，不混用 |

> 注：以上"不合入"指**功能选择性使用**，并不意味着拒绝合并对应代码——代码可以进 main，只是 VilHil 业务路由不调用即可。

### 6.3 冲突解决原则

1. **Pascal 文件冲突**：默认采纳上游版本，VilHil 侧改动迁到 smarthome 包
2. **VilHil 自有文件冲突**：不可能（不在上游路径上）
3. **同名但语义不同**：极少见，发生即升级为 Phase 3 PR

---

## 7. AI 协作规范（落到 CLAUDE.md）

**任何 AI session 在改 `packages/core/**`、`packages/editor/**`、`packages/viewer/**` 之前必须**：

1. 先读本文件第 1 节和第 4 节
2. 判断改动是否能放到 `packages/smarthome/**` 或 `apps/editor/app/**`
3. 如果只能改 Pascal 文件，必须在 `docs/UPSTREAM-PATCHES.md` 登记
4. 改动 PR/commit 标题加 `[pascal-leak]` 前缀，便于事后梳理

**禁止行为**：
- ❌ 删除 Pascal 现有节点类型/字段
- ❌ 修改 Pascal 现有 schema 的字段语义
- ❌ 把业务逻辑 inline 进 Pascal 文件而不登记
- ❌ 改 Pascal 文件的同时不更新本文件第 4 节

---

## 8. 决策日志

| 日期 | 决策 | 决定者 |
|---|---|---|
| 2026-06-03 | 确立"VilHil 上层 / Pascal 下层"分层原则；启动 Phase 1 止血 | shay1230 + Claude |
| 2026-06-03 | 不合入上游 AI 建模；不合入上游 3D 演示渲染（保留自己的 proposal-demo）| shay1230 |
| 2026-06-03 | 当前侵入点 24 commit 影响 160 文件，止血优先：恢复被删节点 + 恢复 window.ts 字段 | Claude 审计 |

---

## 9. 关联文档

- `docs/ARCHITECTURE.md` — VilHil 内部分层（Tool/State/UI/Render）
- `docs/PASCAL-REUSE-AUDIT.md` — Pascal 现有能力复用对照表
- `docs/UPSTREAM-PATCHES.md` — 所有未迁出的 Pascal 侵入点登记（待建）
- `docs/STATE-FLOW.md` — useScene / useDeviceState 真值分层
- `docs/DATA-SCHEMA.md` — 节点 schema 与字段
- `CLAUDE.md` — AI 协作主规范
