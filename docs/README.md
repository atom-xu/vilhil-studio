# VilHil Studio Docs Index

本目录是 VilHil Studio 的业务与工程标准中心。
新增需求、修复问题、AI 协作都从这里进入。

当前接手快照：[2026-09-19 接手记录](./HANDOFF-2026-09-19.md)。本地启动参见 [SETUP.md](../SETUP.md)。

2026-09-21 开发服务故障恢复与后续启动：[开发服务生命周期](./DEV-SERVICE.md)。

## 1. 必读顺序（负责人/产品）

1. `UI-START-HERE.md`
2. `UI-STANDARD.md`
3. `NAVIGATION-ARCHITECTURE.md`
4. `BDD-REQUIREMENTS.md`

## 2. 必读顺序（开发/AI）

1. `ARCHITECTURE-LAYERING.md`
2. `UPSTREAM-PATCHES.md`
3. `CONVENTIONS.md`
4. `ARCHITECTURE.md`
5. `STATE-FLOW.md`
6. `DATA-SCHEMA.md`
7. `UI-LOGIC-STANDARD.md`
8. `GLB-RENDER-STANDARD.md`
9. `UI-COMPONENT-LIBRARY.md`

## 3. 文档职责

- `CONVENTIONS.md`: 团队开发规约、禁止事项、交付前检查。
- `ARCHITECTURE.md`: 系统分层、工具化边界、目录边界。
- `STATE-FLOW.md`: 核心交互事件流与状态流。
- `DATA-SCHEMA.md`: 项目/楼层/设备/场景的数据契约。
- `CODE-REVIEW.md`: PR 评审标准与风险分级。
- `UI-STANDARD.md`: UI 单一标准源（SSOT）。
- `PROPOSAL-STYLE-SYSTEM.md`: Proposal Demo 风格参数化体系（token 分层与扩展协议）。

## 4. AI 协作入口

- 根目录 `AGENTS.md` 是 AI 协作主规范。
- 根目录 `CLAUDE.md` 软链到 `AGENTS.md`，两者保持一致。

## 5. 文档维护规则

1. 文档有冲突时，以 `AGENTS.md` 的硬规则为准。
2. 涉及字段新增或语义变化，必须同步更新 `DATA-SCHEMA.md`。
3. 涉及交互变化，必须同步更新 `STATE-FLOW.md` 与至少一条 BDD。
4. 文档更新必须写明日期和影响范围。

## 6. 变更记录

- 2026-09-19: 接手初始化，校正开发必读顺序，与根目录 `AGENTS.md` 的分层契约保持一致。

- 2026-04-17: 新增工程规约骨架（CONVENTIONS/ARCHITECTURE/STATE-FLOW/DATA-SCHEMA/CODE-REVIEW）与文档入口索引。
