# 上线最后一公里 — 执行单

> 产出日期：2026-04-28
> 状态：备案已完成，部署目标 studio.vilhil.cn（阿里云 ECS）
> 此文档面向做 commit 的 Claude Code（实施者），非用户
>
> **配套已完成的 commits**：
> - 84384a4 路由保护 + Cookie + zod + rate limit
> - a34efea autosave + Resend + 404/error + brand cleanup
> - 6615e3a 阿里云部署配置（nginx/Dockerfile/docker-compose）
> - 665ec91 Preview 模式 DeviceRenderMode

---

## 当前真实状态

仓库就绪度 **85%**，剩 5 项代码工作。

LAUNCH-READINESS.md P0 完成度：6/7 ✅，**仅 P0-5 Sentry 未接**。
LAUNCH-OPS-CHECKLIST 代码侧完成度：邮件 ✅、404 ✅、安全 headers ✅、邮箱替换 ✅。**剩 sample project / 反馈群链接两项**。

**未提交改动**：proposal-demo 灯光参数化大改造（约 +2091/-633 行），不影响上线核心，但散在工作区会让发车节奏乱。先收。

---

## E1 — 收当前未提交改动

**类别**：commit only（无新代码）
**操作者**：实施 Claude Code

**现状**（`git status`）：

```
 M apps/editor/app/proposal-demo/_modules/bloom.tsx
 M apps/editor/app/proposal-demo/_modules/hud.tsx              (+1988)
 M apps/editor/app/proposal-demo/_modules/lighting.tsx          (+294)
 M apps/editor/app/proposal-demo/_modules/render-presets.ts     (+201)
 M apps/editor/app/proposal-demo/_modules/structure.tsx
 M apps/editor/app/proposal-demo/page.tsx
 M docs/BDD-REQUIREMENTS.md
 M docs/PROPOSAL-RENDER-COLOR-MAP.md
 M docs/README.md
 M packages/viewer/src/components/renderers/device/device-geometry.tsx
?? apps/editor/app/proposal-demo/_modules/light-property-popup.tsx
?? apps/editor/app/proposal-demo/_modules/lighting-config.ts
?? apps/editor/app/smart-home-demo/
?? docs/PROPOSAL-STYLE-SYSTEM.md
```

**做法**：拆 2-3 个 commit：

1. `feat(proposal-demo): 灯光参数化系统` — `lighting-config.ts` + `light-property-popup.tsx` + `lighting.tsx` + `hud.tsx` 灯光相关 + `device-geometry.tsx` 灯光相关
2. `feat(proposal-demo): 渲染预设 + 风格系统` — `render-presets.ts` + `bloom.tsx` + `structure.tsx` + `PROPOSAL-RENDER-COLOR-MAP.md` + `PROPOSAL-STYLE-SYSTEM.md`
3. `feat(smart-home-demo): 新页面` — `apps/editor/app/smart-home-demo/`
4. `docs: BDD + README 同步` — 三份 docs 改动

**验收**：`git status` clean。`bun run typecheck` 无新增错误。

---

## E2 — 接 Sentry（LAUNCH-READINESS P0-5）

**类别**：必修（朋友报错可观测性，最高 ROI 项）
**工作量**：~2 小时
**操作者**：实施 Claude Code + 用户在 sentry.io 注册账号拿 DSN

### 步骤

1. 用户在 sentry.io 注册项目（Next.js 类型），拿到 DSN
2. 在 `apps/editor` 下：

```bash
cd apps/editor
bun add @sentry/nextjs
bunx @sentry/wizard@latest -i nextjs
```

3. 向导会自动生成 `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` 和修改 `next.config.ts`
4. 添加环境变量到 `.env.example`：

```
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
```

5. **修改 `apps/editor/app/error.tsx`**，在 useEffect 加 Sentry 上报：

```tsx
import * as Sentry from '@sentry/nextjs'

useEffect(() => {
  console.error('[GlobalError]', error)
  Sentry.captureException(error)  // 新增
}, [error])
```

6. **每个 API route 的 catch** 加 Sentry.captureException：

```tsx
} catch (err) {
  Sentry.captureException(err)
  console.error('[API /...]', err)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
```

涉及的 routes：`/api/project/save`、`/api/project/[id]`、`/api/project/list`、`/api/share`、`/api/share/[token]`、`/api/auth/*`（如有 custom handler）。

7. 配置采样率（控制成本）：

```ts
// sentry.client.config.ts
tracesSampleRate: 0.1,  // 性能采样 10%
replaysSessionSampleRate: 0,  // 内测期不开 replay
replaysOnErrorSampleRate: 1.0,  // 出错时 100% 录制
```

### 验收

- 本地启动 → 故意抛个错（在 home page 加临时 `throw new Error('sentry-test')`） → Sentry dashboard 1 分钟内能看到事件
- 测完删除临时 throw

**Commit message**：`obs: integrate Sentry for client + server error tracking (P0-5)`

---

## E3 — Sample Project（DB seed + 新用户 fork）

**类别**：必做（影响第一印象）
**工作量**：~1 天
**操作者**：实施 Claude Code

### 设计

新用户注册后，`/projects` 页面如果为空，在右上角放一个"从样板创建"按钮，点击后调用 `/api/sample/fork` 复制一份样板项目到当前用户名下。

### 步骤

1. **样板数据**：在编辑器里手动建一个"客厅样板间"项目：
   - 4 面墙围成 5m×4m 的客厅
   - 1 个门 + 2 个窗
   - 3 盏筒灯（天花，2700K，70%亮度）
   - 1 条灯带（暗槽）
   - 1 个 4 键面板（墙面）
   - 1 个温控面板
   - 1 个 PIR 传感器（天花）
   - 1 个 WiFi AP（天花）
   
   导出场景 JSON，保存为 `apps/editor/lib/sample-project.json`

2. **API 路由**：新建 `apps/editor/app/api/sample/fork/route.ts`（约 40 行）：
   - 检查登录态
   - 读取 `sample-project.json`
   - 在 projects 表插入一条新记录（owner 设为当前用户）
   - 返回新 project id

3. **UI 改动**：`apps/editor/app/projects/page.tsx` 空状态时显示两个按钮：
   - 主按钮："从样板开始" → POST `/api/sample/fork` → 跳到新项目
   - 次按钮："新建空白项目"

4. **i18n**：使用现有的中文文案

### 验收

- 新邮箱注册 → 进 `/projects` 看到空状态 → 点"从样板开始" → 跳到新建项目 → 看到客厅+灯+面板已就位
- 测试两个用户：A fork → B fork → 两份独立 project，互不影响

**Commit message**：`feat(onboarding): sample project for new users (LAUNCH-OPS 2.1)`

---

## E4 — error.tsx 加反馈群链接（小改）

**类别**：建议
**工作量**：5 分钟
**操作者**：实施 Claude Code（等用户提供群二维码 URL）

**等用户提供** 微信群 / 飞书群 / Discord 的链接或二维码图片地址，然后改 `apps/editor/app/error.tsx`：

把当前的"联系支持"按钮（`mailto:support@vilhil.cn`）旁边再加一个"加入反馈群"按钮，链到群（或弹出二维码 modal）。

**验收**：错误页能看到两个按钮，"联系支持"和"反馈群"。

---

## E5 — Health check 增强（小改）

**类别**：建议
**工作量**：10 分钟

当前 `/api/health` 太简单，增强为：

```ts
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`)
    return Response.json({
      status: 'ok',
      db: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return Response.json(
      { status: 'degraded', db: 'fail', error: String(err) },
      { status: 503 }
    )
  }
}
```

UptimeRobot 监控这个端点，DB 挂了能立即知道。

**Commit message**：`obs: enhance /api/health with DB ping`

---

## 执行顺序

按此顺序执行（每完成打 ✅）：

```
[ ] E1 — 收当前未提交改动（拆 2-3 commit）
[ ] E2 — 接 Sentry（等用户给 DSN）
[ ] E3 — Sample project + DB seed
[ ] E5 — Health check 增强
[ ] E4 — 反馈群链接（等用户给群 URL）
```

E1 必须最先，否则后续 commit 会和 E1 改动混。

---

## 不要做（明确边界）

不要在这一轮做以下事，避免 scope 蔓延：

- 不要重构 hud.tsx 或 device-geometry.tsx（它们已经过大但不堵塞上线）
- 不要做 i18n 完整化
- 不要给所有 API 加 zod（关键端点已加，其他延后）
- 不要做移动端适配
- 不要换数据库 / 换部署方案
- 不要补全 DEVICE-SPEC-DESIGN.md 的 P2 项
- 不要做 Interaction 层 / S2 的工作

**有疑问回到 Cowork 对齐，不要自行扩范围。**

---

## 上线最终自检（5 项全勾才发车）

```
[ ] git log 显示 E1-E5 全部 commit
[ ] bun run build 在 Dockerfile 环境下成功
[ ] 用一个新邮箱完整走完：
    注册 → 验证邮件 → 登录 → 从样板创建 → 改灯 → 刷新 → 关浏览器再开 → 
    另一台电脑登录看到 → 生成分享链接 → 朋友（不登录）能看
[ ] 故意触发一个错误（前端 + 后端各一）→ Sentry dashboard 收到
[ ] curl https://studio.vilhil.cn/api/health 返回 status:ok
```

---

## 更新记录

- 2026-04-28：初稿。备案完成后的最后一公里执行单。
