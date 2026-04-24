# DeviceSpec 设计蓝图（实施版）

> 本文是 `DEVICE-SPEC-BRIEF.md`（调研版）的续篇。
> BRIEF 提问，本文回答并给 Claude Code 可执行的实施清单。
> 决策已基于调研证据拍板，无需再讨论。
>
> 产出日期：2026-04-23
> 决策人：Cowork（在用户授权 "你们自行商议处理吧" 下）

---

## 0. 背景一句话

Claude Code 已写了 ~2099 行 effect 代码 + 两个分发层（`device-effects.tsx` / `device-render-mode.tsx`）。
调研结论：**保留既成事实，不做大抽象；在边缘补轻量配套，让结构能撑到 S2-S3。**

---

## 1. 五项决策

### 决策 1 — switch-case 现状保留，设"升级触发线"

**方向**：不抽象 registry。保留 `device-effects.tsx`（9 subsystem 分支）和 `device-geometry.tsx`（34 renderType case）。

**证据**：
- `device-effects.tsx` 174 行、分发模式为 if-and 链，新增 1 个 subsystem 仅需改 1 处 dispatch。
- `device-geometry.tsx` 890 行、34 case，逼近单文件可读上限。
- 每加 1 个效果文件只动 4-5 处，非指数增长。

**实施动作**：
1. 在 `device-effects.tsx` 文件顶部加注释：
   ```
   // 扩容触发线：当 effects 总数 > 15 或 device-geometry renderType > 40 时，
   // 必须拆分为 registry 架构。参考 docs/DEVICE-SPEC-DESIGN.md 决策 1。
   ```
2. 在 `device-geometry.tsx` 顶部加同款触发线注释。
3. 新增 `packages/viewer/src/components/renderers/device/README.md`（30 行），说明"当前为手工 dispatch + 触发线"策略。

**非目标**：不写 EffectPlugin interface、不建 registry、不做依赖注入。

---

### 决策 2 — EffectPlugin 抽象延期

**方向**：13 个 effect 保持各自独立的 Props 接口。不抽象基类，不做 plugin system。

**证据**：
- 13 个 effect 的 Props 共有字段仅 8/13 复用 `position`、6/13 复用 `intensity`、5/13 复用 `color`（60% 以下）。
- 独有字段差异巨大：particle-count / fovDeg / busType / signalRadius / aps[]。
- 生命周期（useFrame + useRef）已 100% 一致，无需抽象。
- 抽象所需胶水代码反而增加复杂度。

**实施动作**：
1. 写一个轻量约定文件 `packages/viewer/src/components/renderers/device/animations/CONVENTIONS.md`（50 行内），规定：
   - 所有 effect 必须接 `position: [number, number, number]`
   - Lighting 类用 `intensity: 0-1`、其他用场景特定字段
   - 必须实现 useEffect cleanup（geometry.dispose / material.dispose）
   - 命名规则：`<subsystem>-<effect>.tsx`
2. 把 light-cone 的 `brightness` 字段在 Props 里加 alias `intensity`（向前兼容），让新 effect 的统一字段名可以逐步推广。

**非目标**：不做强制接口、不做 HOC 包装、不引入 inversify/DI 库。

---

### 决策 3 — 双渲染模式 Context 保留原样

**方向**：`device-render-mode.tsx` 保留，31 行成本远低于重构收益。

**证据**：
- Context 仅暴露 'base' | 'demo' 枚举 + hook + provider。
- 全仓 6 处引用，分流点集中在 `device-renderer.tsx` 第 135-161 行 1 处三元表达式。
- 编辑器无原生 `isPreviewMode` 可复用，此 context 无冗余。

**实施动作**：
1. 不动代码。
2. 在 `docs/STATE-FLOW.md` 补一段："渲染模式分层 — DeviceRenderMode context 决定是否渲染 3D effects"（20 行）。
3. 在 `packages/viewer/src/components/renderers/device/device-render-mode.tsx` 加文件头注释，说明用途 + 何时扩展第三种模式（如未来的 "walkthrough"）。

**非目标**：不合并到 Pascal 原生 preview flag（原生没有）、不改为全局 zustand store。

---

### 决策 4 — 子系统路由 = state 加 URL query 同步

**方向**：不迁移到 `[subsystem]` 动态路由，维持单页 + `view.module` state。但加 URL `?module=lighting` 双向同步，支持深链接。

**证据**：
- 当前 `apps/editor/app/proposal-demo/page.tsx` 为单页，`view = { level, module }` state 驱动。
- `_modules/hud.tsx` 已有完整子系统切换 UI。
- Next.js 动态路由重构成本 150+ 行，URL sync 仅 30 行。
- 深链接（客户打开"这是你家 HVAC 方案"链接）是分享体系的实用需求。

**实施动作**：
1. 在 `apps/editor/app/proposal-demo/page.tsx` 加 useEffect 和 useSearchParams：
   - 挂载时：读 `?module` → setView({ module })
   - 状态变化时：pushState 不触发 rerender（用 `window.history.replaceState`）
2. `_modules/hud.tsx` 的子系统切换按钮 onClick 保持调 setView，无需改。
3. 在 `docs/NAVIGATION-ARCHITECTURE.md` 文件里补一节"子系统深链接协议"：`?module=lighting|hvac|curtain|...`。

**非目标**：不建 `/proposal-demo/[subsystem]/` 路由、不建 nested layout、不做 SSR 数据预取。

---

### 决策 5 — light-cone 风格保留，不跟新效果统一

**方向**：粒子风格（light-cone）和几何风格（laser-scan-cone）各有其美学价值，并存。

**证据**：
- light-cone 143 行，使用 THREE.Points + 逐帧 attribute 更新，适合柔和光晕。
- laser-scan-cone 175 行，使用 ConeGeometry + shader，适合硬边扫描。
- 两者共存于不同 subsystem（lighting vs security），无代码冲突。
- device-light.tsx（PointLight / SpotLight）与 light-cone 完全解耦。

**实施动作**：
1. 不改代码。
2. 在 `animations/CONVENTIONS.md`（决策 2 新建的文件）里，加"两种美学范式"小节：
   - 粒子范式：柔和效果（灯光晕、气流、覆盖）
   - 几何范式：硬边效果（扫描锥、FOV、总线连线）
   - 新增 effect 时根据语义选择，不强制统一。

**非目标**：不把 light-cone 重写为 ConeGeometry、不把 laser-scan-cone 改为 Points。

---

## 2. 六层 DeviceSpec 落地地图

对照 BRIEF 中提出的 6 层抽象，现有代码已覆盖度如下：

| 层 | 定义 | 现有代码位置 | 状态 |
|----|------|-------------|------|
| **Identity** | 品牌、型号、分类、子系统 | `packages/core/src/schema/nodes/device.ts` | ✅ 已有 DeviceNodeSchema |
| **Physical** | 安装类型、挂载点、尺寸 | 同上 + `packages/smarthome/src/device-catalog.ts`（1300+ 行目录） | ✅ 可用 |
| **Geometry** | 3D mesh 造型 | `packages/viewer/.../device/device-geometry.tsx`（890 行，34 case） | ⚠️ 接近单文件上限（触发线生效） |
| **Effect** | 视觉效果层 | `packages/viewer/.../device/device-effects.tsx` + `animations/*`（13 文件 ~2099 行） | ✅ 覆盖 9 子系统 |
| **Presentation** | demo 页展示组合 | `apps/editor/app/proposal-demo/_modules/*`（8 模块） | ✅ 已拆分 |
| **Interaction** | L2 / L3 交互行为 | （空） | ❌ S2 阶段补 |

**结论**：6 层中 5 层已有代码落地。Interaction 层是 S2 BDD 的工作，本蓝图不展开。

---

## 3. 给 Claude Code 的实施清单

按优先级排序，每项标注预计改动行数。实施前必须 `git status` 确认 clean。

### P0 — 立即做（30 分钟）

- [ ] **C1**：在 `device-effects.tsx` 顶部加"扩容触发线"注释（10 行）
- [ ] **C2**：在 `device-geometry.tsx` 顶部加"扩容触发线"注释（10 行）
- [ ] **C3**：新建 `packages/viewer/src/components/renderers/device/README.md`（30 行），说明手工 dispatch 策略
- [ ] **C4**：新建 `packages/viewer/src/components/renderers/device/animations/CONVENTIONS.md`（50 行），含共有字段约定 + 两种美学范式说明

### P1 — 本 Sprint 内做（1-2 小时）

- [ ] **C5**：`light-cone.tsx` Props 加 `intensity` alias（向后兼容 `brightness`），5 行
- [ ] **C6**：`device-render-mode.tsx` 加文件头注释说明（15 行）
- [ ] **C7**：在 `docs/STATE-FLOW.md` 补"DeviceRenderMode 渲染模式分层"小节（20 行）

### P2 — 下 Sprint 做（半天）

- [ ] **C8**：`apps/editor/app/proposal-demo/page.tsx` 加 `?module=` URL 同步（30 行）
- [ ] **C9**：在 `docs/NAVIGATION-ARCHITECTURE.md` 补"子系统深链接协议"（20 行）

### P3 — 视情况再做（延期）

- [ ] Effect registry 抽象（触发线达到时再启动）
- [ ] Interaction 层设计（S2 BDD 开始时启动）

**总计 P0+P1+P2**：约 190 行新代码 + 约 70 行文档更新。**无大重构、无删除。**

---

## 4. 明确不做

| 不做 | 原因 |
|-----|------|
| EffectPlugin interface | 13 效果复杂度差异大，抽象收益为负 |
| Effect registry system | 等触发线（> 15 effects 或 > 40 renderType） |
| 子系统动态路由 `[subsystem]/page.tsx` | 成本 150+ 行 vs URL sync 30 行，收益同 |
| light-cone 重写 | 粒子与几何美学并存，无需统一 |
| `device-render-mode` 合并进 Pascal | Pascal 无等价 flag，合并是负工作 |
| 重写 `agentation` 的 instrumentation | 已禁用（2026-04-22），现阶段不需要 |

---

## 5. 风险与验收

### 风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| Claude Code 又忽略蓝图直接改大代码 | 高 | 明确标注每项 C# 的行数上限；任何超出立即 revert |
| URL sync 引入 hydration warning | 中 | 用 `useEffect + replaceState`，不碰 SSR |
| 触发线注释被后续 AI 忽视 | 中 | 在 CLAUDE.md 第 8 节加一条"遵守 device/ README 的扩容触发线" |

### 验收标准

所有 C1-C9 完成后：
1. `bun run typecheck` 无新增错误
2. `apps/editor` dev server 启动无 warning（内存稳定 < 3GB）
3. `/proposal-demo?module=hvac` 打开后 HUD 显示 HVAC 视图
4. `docs/STATE-FLOW.md` 和 `docs/NAVIGATION-ARCHITECTURE.md` 均有对应章节

---

## 6. 更新记录

- 2026-04-23：初稿。基于 BRIEF v2 的 5 项调研结论拍板。

---

## 附：一段话给人类看的摘要

**不大改、不大抽象。Claude Code 已经写的 2099 行 effect 代码保留；切换分发、渲染模式 context、子系统切换方式全部维持现状。** 新增内容是轻量的：两条"扩容触发线"注释、一份 animations 约定文档、URL 深链接同步、几个 alias 字段。总工作量约 260 行，分 3 档优先级。EffectPlugin / registry 架构等到 effects 数超过 15 或 renderType 超过 40 才做。Interaction 层留给 S2。
