# VilHil Studio 开发规约

> 面向所有开发者与 AI 协作者。开始改动前必须先读本文件。
> 若与 `AGENTS.md` 冲突，以 `AGENTS.md` 为准。

## 1. 目标与边界

1. 项目目标是“一套 3D 场景贯穿编辑与演示”。
2. 智能设备能力归属 `Furnish` 体系，不进入 `Structure` 主流程。
3. 任何新功能优先增量实现，避免大范围重写稳定模块。

## 2. 工具化硬规则

1. 业务动作必须先落地工具函数，再落 UI。
2. 工具函数目录：`packages/smarthome/src/tools/**`。
3. UI 组件不得直接拼接跨模块业务逻辑。

必备工具动作（示例）：
- `placeDevice`
- `removeDevice`
- `setDeviceParams`
- `toggleDevice`
- `applyScene`

## 3. 状态分层规则

1. 业务真值：`useScene`（节点、设备运行态、场景定义）。
2. UI 偏好：`useDeviceState`（显隐、聚焦、面板偏好）。
3. 局部临时态：组件内部草稿输入、弹窗开关。

禁止：
- 维护第二份设备运行真值。
- 组件私自创建全局共享状态源。

## 4. 交互语义规则

1. 一次交互只做一件事。
2. 子系统“聚焦”和“显隐”必须拆分。
3. 场景执行必须可观测：`idle/running/active`。
4. 楼层作用域一致：画布与面板数据必须同楼层。

## 5. 文件边界

- 编辑器 UI：`packages/editor/src/components/ui/**`
- 展示模式 UI：`packages/editor/src/components/proposal/**`
- 3D 渲染：`packages/viewer/src/components/renderers/**`
- 智能工具层：`packages/smarthome/src/tools/**`
- 业务文档：`docs/**`

## 6. 开发流程

### 开始前

1. 阅读目标文件上下文，不盲改。
2. 在 `docs/BDD-REQUIREMENTS.md` 对应场景下确认验收标准。
3. 明确本次改动范围与不改范围。

### 实施中

1. 先改工具函数，再接 UI。
2. 复杂交互先补状态流文档（`STATE-FLOW.md`）。
3. 只修问题，不为“重构而重构”。

### 提交前

1. 至少完成包级类型检查（受基线问题影响要注明）。
2. 验证关键 BDD 场景。
3. 更新相关文档（数据契约/状态流/UI 标准）。

## 7. 禁止事项

1. `useFrame` 内触发 React 高频重渲染。
2. 在 UI 页面硬编码分散样式体系，绕开统一 Token。
3. 在业务页面绕过工具层直接改设备真值。
4. 不读取上下文就改文件。

## 8. DoD（完成定义）

1. 功能可用且行为可观测。
2. 无新增跨层耦合。
3. 文档同步完成。
4. 业务可读说明可直接用于评审。

## 9. 变更记录

- 2026-04-17: 建立统一开发规约（工具化、状态分层、边界与 DoD）。
