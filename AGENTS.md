# VilHil Studio — Claude/AI 协作标准

> 本文件是 AI 协作主规范。`CLAUDE.md` 软链到本文件。
> 当文档冲突时，优先级：`AGENTS.md` > `docs/CODE-REVIEW.md` > `docs/UI-STANDARD.md` > 其他 docs。
> **每次提交前必须对照 `docs/CODE-REVIEW.md` 的自检清单逐项确认。**

## 1. 项目定位

VilHil Studio 是基于 Pascal Editor 的智能家居方案工作台：

1. 设计师在 3D 空间完成建筑、设备、场景编排。
2. 客户在展示模式直接操控设备并体验场景。
3. 同一套 3D 场景贯穿设计与演示。

## 2. 硬规则（不可破坏）

1. 智能设备归属 `Furnish` 体系，不得塞入 `Structure` 主流程。
2. 功能先做工具函数，再做 UI 包装（`packages/smarthome/src/tools/`）。
3. 设备运行时真值在 `useScene`；UI 偏好放 `useDeviceState`。
4. 一次交互只做一件事（例如“聚焦”和“显隐”必须分离）。
5. 改动前必须读取目标文件上下文，不做盲改。

## 3. 文件边界

- 编辑器 UI：`packages/editor/src/components/ui/**`
- 展示模式 UI：`packages/editor/src/components/proposal/**`
- 3D 渲染层：`packages/viewer/src/components/renderers/**`
- 智能工具层：`packages/smarthome/src/tools/**`
- 业务与工程文档：`docs/**`

## 4. 标准文档阅读顺序

### 负责人/业务

1. `docs/UI-START-HERE.md`
2. `docs/UI-STANDARD.md`
3. `docs/NAVIGATION-ARCHITECTURE.md`
4. `docs/BDD-REQUIREMENTS.md`

### 开发/AI

1. `docs/CONVENTIONS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/STATE-FLOW.md`
4. `docs/DATA-SCHEMA.md`
5. `docs/UI-LOGIC-STANDARD.md`

## 5. Claude 开发流程

1. 先对齐 BDD 场景与验收目标。
2. 先改工具函数，再改 UI。
3. 优先增量改造，不大拆现有稳定结构。
4. 完成后至少执行包级类型检查（受基线问题影响需注明）。
5. 输出业务可读说明：改了什么、为什么改、怎么验收。

## 6. 评审门禁

1. 是否遵守真值分层（`useScene` / `useDeviceState`）。
2. 是否保持单向事件流（UI -> Tool -> Store -> Render）。
3. 是否满足楼层作用域一致性。
4. 是否遵守 UI 标准（按钮/颜色/圆角/尺寸）。
5. 是否同步更新文档与 BDD。

## 7. AI 接力规范（长期维护）

1. 新 AI 接手先读本文件与 `docs/README.md`。
2. 若发现文档与代码不一致，先修正文档再继续编码。
3. 任何新增业务能力，必须补至少 1 条 Given/When/Then 场景。
4. 改动涉及状态流或数据字段，必须同步更新 `STATE-FLOW.md` 或 `DATA-SCHEMA.md`。

## 8. 当前协作重点

1. 场景执行状态可观测（执行中/完成）。
2. 子系统聚焦与显隐语义分离。
3. 楼层维度一致视图（场景/设备按当前楼层过滤）。
4. 交付页（设备清单/报价）作为下一阶段核心交付。
5. **账号体系与分享体系**（本次新增）：
   - Better Auth + 邮箱密码登录
   - 项目云端持久化（PostgreSQL）
   - 匿名分享链接（短 token + 过期控制）
   - 分享落地页（只读展示模式）

## 9. 更新记录

- 2026-04-20: 增加账号体系 & 分享体系（Better Auth 邮箱+密码、项目云端持久化、匿名分享链接、路由保护、登录回跳）。
- 2026-04-17: 扩展为长期 AI 协作标准，并关联工程规约文档。
