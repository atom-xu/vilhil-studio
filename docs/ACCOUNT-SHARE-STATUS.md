# VilHil Studio — 账号体系 & 分享功能 开发状态

> 本文档仅覆盖账号体系（Auth）和分享功能（Share）两个模块。
> 最后更新：2026-04-20

---

## 一、整体结论

**账号体系：基础链路已通，管理后台已交付，但缺少头像、用户资料编辑。**
**分享功能：核心链路已闭环（创建 → 落地页 → 密码/过期/权限），但 operate 权限的编辑限制有底层缺陷。**

---

## 二、账号体系（Auth）

### 2.1 已实现 ✅

| 功能 | 文件位置 | 说明 |
|------|----------|------|
| 注册页面 | `app/register/page.tsx` | 邮箱+密码，昵称可选，密码最小8位，自动登录 |
| 登录页面 | `app/login/page.tsx` | 邮箱+密码，支持 `?redirect=` 回跳，错误提示+loading |
| 会话管理 | `lib/auth-client.ts` | Better Auth `useSession` / `signIn` / `signUp` / `signOut` |
| 用户导航栏 | `components/user-navbar.tsx` | 匿名/登录双态 UI，登出刷新 |
| 路由保护（代码保留） | `middleware.ts` | 已注释掉，不强制拦截。上线前取消注释即可恢复 `/projects` 保护 |
| 数据库表 | `drizzle/0001_auth_setup.sql` | user / session / account / verification（Better Auth 自带） |
| 角色系统 | `lib/auth.ts` | 启用 Better Auth `admin` 插件，`user.role` 字段（默认 `user`） |
| Admin 管理后台 | `app/admin/users/page.tsx` | 用户列表、创建用户、重置密码、删除用户（仅 admin 可访问） |
| 项目列表页 | `app/projects/page.tsx` | 登录用户显示项目列表；匿名用户显示友好引导（不强制跳转） |

### 2.2 未实现 ❌（非当前任务，留给后续）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 用户资料编辑页 | P2 | 没有 `/profile`，用户改不了昵称、邮箱。`UserNavbar` 只显示文字，无头像。 |
| 头像展示 & 上传 | P2 | `user.image` 字段存在但前端未使用。`UserNavbar` 只有文字 `<span>`。 |
| 邮箱验证流程 | P2 | Better Auth 配置 `autoSignIn: true`，不强制验证。没有"请查收邮件"UI。 |
| 密码修改功能 | P2 | 用户无法自行修改密码（当前由管理员重置）。 |
| 会话管理（多设备/踢人） | P3 | 没有"查看活跃会话、登出其他设备"功能。 |

### 2.3 技术债务 / 注意事项

1. **Middleware 当前是"透明模式"**
   - 所有路由公开访问，已注释掉拦截逻辑。
   - 上线前取消 `middleware.ts` 中的注释即可恢复保护。

2. **第一个管理员需要手动设置**
   - 执行 SQL：`UPDATE "user" SET "role" = 'admin' WHERE "email" = 'xxx';`

3. **user 表由 Better Auth 管理**
   - `lib/schema.ts` 中定义了 `user` 表仅用于 Drizzle 查询，**不要**用 drizzle-kit 删除或重建该表。

---

## 三、分享功能（Share）

### 3.1 已实现 ✅

| 功能 | 文件位置 | 说明 |
|------|----------|------|
| 创建分享 API | `app/api/share/route.ts` | 接收场景快照，保存为项目，生成 10 位 nanoid token |
| 获取分享 API | `app/api/share/[token]/route.ts` | 检查过期、校验密码、递增浏览数 |
| 分享列表 API | `app/api/share/list/route.ts` | 返回当前用户创建的分享链接（JOIN projects 表） |
| 撤销分享 API | `app/api/share/revoke/route.ts` | `POST` 传 `{ id }`，创建者/所有者/管理员可撤销 |
| 分享弹窗 UI | `components/share-dialog.tsx` | 名称、权限(view/operate)、有效期(7/30/永久)、密码 |
| 分享落地页 | `app/share/[token]/page.tsx` | loading → 密码输入 → 场景加载。根据权限设置 readOnly |
| 我的分享管理页 | `app/shares/page.tsx` | 列表、复制链接、撤销、显示过期/密码状态 |
| 数据库表 | `lib/schema.ts` | `share_links`（含 `created_by` / `token` / `permission` / `expires_at` / `password` / `view_count`） |

### 3.2 未实现 ❌（非当前任务，留给后续）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| **operate 权限的编辑限制** | 🔴 P0 | **底层缺陷**：`operate` 模式设 `readOnly(false)`，客户**可以添加/删除/移动设备**。BDD 要求"只能操作设备，不能编辑场景"。需要改 Pascal 核心 `useScene` 的权限粒度。 |
| 分享统计详情页 | P2 | 只有列表页显示浏览次数，没有单个分享的详细统计图表。 |
| 分享链接二次编辑 | P2 | 生成后不能修改有效期、密码、权限。只能撤销后重新生成。 |

### 3.3 技术债务 / 注意事项

1. **operate 权限语义不对（最重要）**
   - 当前实现：`view` → `readOnly(true)`（不能编辑，**也不能开关灯**）；`operate` → `readOnly(false)`（能开关灯，**也能误删设备**）。
   - 期望：无论 view 还是 operate，都不能添加/删除/移动设备；operate 允许开关灯、调亮度。
   - **根因**：Pascal 核心 `node-actions.ts` 中 `createNodesAction` / `updateNodesAction` / `deleteNodesAction` 共用同一个 `readOnly` 开关，无法区分"结构性编辑"和"状态性更新"。
   - **修复方向**：在 Pascal 核心中新增 `allowStateUpdate` 或类似标志，让设备状态更新（on/off/brightness）绕过 `readOnly`，但结构性操作（create/update position/delete）仍被阻止。

2. **分享密码前端用明文输入**
   - `share-dialog.tsx` 和落地页密码输入都是 `type="text"`，建议改为 `type="password"`（但内部使用场景可能希望明文方便口述）。

3. **密码哈希迭代次数已提升**
   - `lib/password-hash.ts` 从 1000 次提升到 600,000 次（OWASP 标准），并兼容旧格式（`v1:` / `v2:` 前缀）。

---

## 四、数据库迁移清单

已生成但未执行的迁移文件：

| 文件 | 内容 |
|------|------|
| `drizzle/0001_happy_terrax.sql` | `ALTER TABLE "project_members" ALTER COLUMN "user_id" SET DATA TYPE text; ALTER TABLE "projects" ALTER COLUMN "owner_id" SET DATA TYPE text;` |
| `drizzle/0002_admin_role.sql` | `ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user'; UPDATE "user" SET "role" = 'user' WHERE "role" IS NULL;` |
| `drizzle/0002_even_marvex.sql` | `CREATE TABLE IF NOT EXISTS "user" (...); ALTER TABLE "share_links" ADD COLUMN "created_by" text;` |

> ⚠️ 注意：`0002_even_marvex.sql` 包含 `CREATE TABLE IF NOT EXISTS "user"`，这是为了兼容 Drizzle schema 定义。由于 Better Auth 已创建 user 表，`IF NOT EXISTS` 会跳过，不会报错。

---

## 五、BDD 需求对照（P3-2 方案分享）

| BDD 场景 | 状态 | 备注 |
|----------|------|------|
| 设计师匿名分享方案 | ✅ | 完整实现 |
| 客户通过分享链接查看方案 | ⚠️ | 场景加载正常，但 operate 权限下客户可以编辑场景（需修 Pascal 核心） |
| 分享链接过期 | ✅ | 完整实现 |
| 设计师注册并登录 | ✅ | 完整实现 |
| 登录用户保存项目到云端 | ✅ | 完整实现 |
| 登录用户从项目列表加载方案 | ✅ | 完整实现 |
| 未登录用户访问受保护页面 | ⚠️ | 代码已写但已注释（按需求不激活） |

---

## 六、环境配置

`apps/editor/.env.local` 已创建，包含：
```
BETTER_AUTH_SECRET=dev-secret-key-change-in-production-32chars!
NEXT_PUBLIC_APP_URL=http://localhost:3002
POSTGRES_URL=postgresql://localhost:5432/vilhil_dev
```

> 生产环境务必替换 `BETTER_AUTH_SECRET` 为 `openssl rand -base64 32` 生成的真密钥。
