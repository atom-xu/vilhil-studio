# VilHil Studio — 本地开发初始化

> 2026-09-19 校正：开发端口是 **3002**，环境文件是 **apps/editor/.env.local**。
> 数据库直接使用 PostgreSQL；Supabase 是可选托管方，不需要 Supabase 客户端密钥。

## 1. 依赖与配置

本次验证环境：Node.js 22.22.3、Bun 1.3.11、PostgreSQL 18.4。

```bash
bun install --frozen-lockfile
```

在 `apps/editor/.env.local` 配置以下变量。已有文件时先备份，勿覆盖现有连接信息：

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3002
BETTER_AUTH_SECRET=<openssl rand -base64 48 生成的本地密钥>
POSTGRES_URL=postgresql://vilhil_dev:<本地随机密码>@127.0.0.1:55432/vilhil_dev
```

文件已被 Git 忽略。`apps/editor/.env.example` 是生产环境模板，不能直接用于本地开发。
`RESEND_API_KEY`、Sentry 变量、`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 均为可选。
根目录 `.env.example` 是本地模板，复制目标是 `apps/editor/.env.local`。

## 2. 本机 PostgreSQL

本次初始化建立了专用实例，与其他项目数据库分开：

- 监听：`127.0.0.1:55432`
- 数据库及普通登录角色：`vilhil_dev`
- 数据目录：`~/Library/Application Support/VilHil Studio/postgres`
- 日志：`~/Library/Application Support/VilHil Studio/postgres.log`
- Unix socket：`~/Library/Application Support/VilHil Studio/socket`
- 旧环境备份：`~/Library/Application Support/VilHil Studio/env-before-onboarding.local`（权限 600）

重启电脑后，先启动数据库（已经运行时无须重复启动）：

```bash
pg_ctl -D "$HOME/Library/Application Support/VilHil Studio/postgres" -l "$HOME/Library/Application Support/VilHil Studio/postgres.log" -w start
pg_isready -h 127.0.0.1 -p 55432
```

停用本项目数据库：

```bash
pg_ctl -D "$HOME/Library/Application Support/VilHil Studio/postgres" -m fast -w stop
```

新机器需先准备同地址、同库名、同角色的空开发数据库，并配置自己的密码。
上述数据目录是本机路径记录，不是可复制的数据库备份。

## 3. 初始化表结构与样板间

```bash
cd apps/editor
bun run db:init:local
bun run db:seed
cd ../..
```

`db:init:local` 仅接受 `127.0.0.1:55432/vilhil_dev`、角色 `vilhil_dev`，拒绝生产模式及 URL 附加参数。
它按文件名执行仓库 SQL，用独立的本地迁移表记录文件摘要，重复执行会跳过；已执行的 SQL 若被修改则报错。
之后根据实际 Better Auth 配置补齐缺失表或字段（旧 SQL 缺少 admin 插件的 banned / banReason / banExpires / impersonatedBy）。
此脚本不适用于生产数据库，也不取代生产迁移治理。

不要使用旧文档中的 `bun run db:push`：仓库没有这个脚本，且 Drizzle 的 `user` 定义只是查询投影，不能覆盖 Better Auth 的完整表结构。
Drizzle journal 也未覆盖两个手写 Auth SQL 文件，不能把 journal 当作完整初始化清单。
`db:seed` 会更新现有 `__system_sample_living_room__` 的数据，仅在需要恢复本地样板间时重跑。

## 4. 启动与检查

```bash
# 前台开发：终端保持打开，Ctrl+C 停止
bun dev
# 后台使用：Codex 任务结束后仍需保持服务时使用
bun run dev:start
bun run dev:status
# 停止本项目管理的开发服务
bun run dev:stop
# http://localhost:3002
```

实际流程是 Turbo 先构建 core / viewer / nodes，再启动 Next.js；没有持续运行的 `tsc --watch`。
应用的 dev 脚本显式加载 `apps/editor/.env.local`，并固定 `--port 3002`，仅设置 PORT 不会改变开发端口。

2026-09-21 起统一从仓库根目录使用上述命令。后台日志写入 `docs/tmp/dev-service/dev.log` 并轮转，不依赖任务输出管道；Node 断管时有界退出。直接从 `apps/editor` 调用旧 dev 脚本会绕过服务管理。详见 [开发服务生命周期](docs/DEV-SERVICE.md)。

```bash
curl --fail http://localhost:3002/api/health
bun test packages/core/src/schema/asset-url.test.ts
bun run check-types
bun run lint
```

`/api/health` 返回 `status=ok, db=ok` 只证明数据库连通；不代表完整业务验收。
当前类型检查和 lint 有历史失败，详见接手记录。Next 配置启用了 `ignoreBuildErrors`，构建成功也不能替代类型检查。
补充包级检查：`bun x tsc --noEmit --project packages/smarthome/tsconfig.json`（core / viewer / nodes 同理）。

## 5. 初始化验收场景

Given 本地环境文件已指向专用开发库，且该库为空；
When 执行初始化、种子数据和 `bun dev`；
Then 健康检查成功，游客能打开编辑器，账号注册登录及项目保存可以在本地验证。
When 再次执行 `db:init:local`；
Then 已执行的 SQL 被跳过，业务数据不被重建。

业务功能的验收标准仍以 `docs/BDD-REQUIREMENTS.md` 为准。
