# VilHil Studio 系统架构

## 1. 架构目标

VilHil Studio 的核心是“工具化 + 分层解耦”：
- 编辑与展示共享同一套场景数据。
- UI 通过工具函数驱动业务，不直接混写状态逻辑。
- 为后续 AI 自动编排场景保留稳定入口。

## 2. 分层模型

```text
AI/Automation Layer
  -> 调用统一工具函数

Tool Layer (packages/smarthome/src/tools)
  -> place/remove/toggle/applyScene/setParams...

State Layer
  -> useScene (业务真值)
  -> useDeviceState (UI 偏好)

UI Layer
  -> packages/editor/src/components/ui
  -> packages/editor/src/components/proposal

Render Layer
  -> packages/viewer/src/components/renderers

Data & Schema Layer
  -> docs/DATA-SCHEMA.md
```

## 3. 工具化约束

1. 业务动作必须存在无 UI 依赖的函数入口。
2. 工具函数可被 UI、测试脚本、AI 编排复用。
3. 工具函数优先纯参数输入，不依赖 DOM。

## 4. 模式边界

1. 编辑模式：可创建/修改/删除节点与场景。
2. 展示模式：可操作设备与执行场景，不改结构。
3. `readOnly` 是最终权限开关，UI 只负责表达。

## 5. 目录职责

- `apps/editor/**`: 应用入口与路由装配。
  - `lib/auth.ts` — Better Auth 服务端配置
  - `lib/auth-client.ts` — Better Auth 客户端
  - `lib/db.ts` — Drizzle ORM + pg Pool
  - `lib/schema.ts` — 业务表 Drizzle Schema
  - `lib/project-api.ts` — 项目持久化工具函数
  - `lib/share-api.ts` — 分享体系工具函数
  - `app/api/auth/**` — 认证 API 路由
  - `app/api/project/**` — 项目 API 路由
  - `app/api/share/**` — 分享 API 路由
  - `app/login`, `app/register` — 账号页面
  - `app/projects` — 项目列表页（受 middleware 保护）
  - `app/share/[token]` — 分享落地页
  - `app/middleware.ts` — 路由保护（未登录禁止访问 /projects）
  - `components/user-navbar.tsx` — 用户状态 + 保存/分享入口
  - `components/share-dialog.tsx` — 分享配置对话框（名称/权限/有效期）
- `packages/editor/**`: 编辑器与展示 UI 组件。
- `packages/smarthome/**`: 智能设备模型与工具函数。
- `packages/viewer/**`: 3D 渲染与可视化。
- `docs/**`: 业务与工程标准。

## 6. 关键技术决策

1. 工具先行：支持 AI 直接调用。
2. 单向事件流：UI -> Tool -> Store -> Render。
3. 真值分层：避免状态分叉与显示不一致。
4. 楼层一致性：面板列表与画布按同一楼层过滤。
5. **账号与分享**：
   - 纯内部邮箱+密码（Better Auth + PostgreSQL），零外部 OAuth。
   - 匿名用户可生成分享链接，场景数据以匿名项目形式存入云端。
   - 分享页通过短 token 加载场景快照到 `useScene`，复用 `ProposalLayout + Viewer` 渲染。
   - Middleware 保护受保护路由（`/projects`），未登录自动重定向到 `/login` 并携带 `redirect` 参数。
   - 登录/注册成功后读取 `redirect` 参数自动回跳原页面。

## 7. 非目标（当前阶段）

1. 不做大规模框架迁移。
2. 不引入第二套 UI 设计体系。
3. 不在稳定主链上做破坏性重构。

## 8. 变更记录

- 2026-04-17: 新增架构总览，明确 Tool/State/UI/Render/Data 分层。
