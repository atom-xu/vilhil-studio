# 上线前 Readiness 评估（朋友内测前必读）

> 产出日期：2026-04-24
> 范围：邀请 5-10 个朋友做内测前的 must-fix / should-fix 清单
> 评估角度：质疑者视角 + 端到端账号数据流 + 可观测性
>
> **核心结论：当前状态不能上线。** 但只要完成 P0（约 1-1.5 天工作量），可进入"受控内测"。

---

## 0. 直接回答你三个问题

### 问题 1 — 架构有遗漏吗？

**有，且不止一处**：

- 🔴 **同账号多设备并发编辑会覆盖丢数据**（无 last-modified 检查）
- 🔴 **API 路由缺 rate limiting**（登录、分享密码、save 都可被刷）
- 🔴 **没有任何错误收集机制**（朋友报错你只能靠 ta 主动说）
- 🟡 **输入校验薄弱**（API 直接吃 raw body，无 zod/yup）
- 🟡 **Cookie 安全配置缺失**（production 下 secure/httpOnly/sameSite 没设）
- 🟡 **WebGL context 切换可能泄漏**（多页切换可能撞 Chrome 16 个上限）
- 🟡 **Safari / iPad 完全没测过**

### 问题 2 — 账号 + 数据体系跑通了吗？测试人员能直接用吗？

**没跑通**。两个致命缺口：

1. **❌ 自动保存禁用**：编辑器主页 `apps/editor/app/page.tsx:233` 的 `<Editor>` 组件**没传 onSave callback**。意味着用户改东西只写 localStorage，**不会自动写到 PostgreSQL**。要让朋友"刷新还在、跨设备同步"，必须手动点"上传"。
2. **❌ 路由保护禁用**：`apps/editor/middleware.ts` 第 14-24 行的鉴权代码**全部被注释掉**了。所有页面公开访问，账号体系形同虚设。

可以工作的是：
- ✅ 注册 / 登录 / session
- ✅ Schema、迁移、PostgreSQL 连接
- ✅ 项目 API（POST/GET/PUT/DELETE）齐全
- ✅ `/projects` 列表页可用
- ✅ 分享链接（匿名访问、密码、过期）

**5 步真实可用性判断**：

| 测试场景 | 当前状态 |
|---------|---------|
| 注册账号 | ✅ |
| 创建项目 + 放灯 | ✅ |
| 刷新页面项目还在 | ⚠️ 需先手动点"上传"，否则刷新丢 |
| 关浏览器再打开 | ❌ 丢 |
| 另一台电脑登录看到项目 | ❌（除非先手动上传） |
| 分享链接给不登录的朋友看 | ✅ |

### 问题 3 — Debug / 远程观察系统是否需要？

**强烈建议有**，且现在几乎为零。

朋友测试场景：
- 朋友 A 在 Mac Chrome 报"3D 加载一片黑" → 你看不到错误堆栈、不知道 ta 浏览器版本、不能重放操作
- 朋友 B 在 iPad Safari 打不开 → 你完全不知道 ta 出问题
- 5 个朋友里 3 个遇到同一个 bug → 你只听到 1 个朋友提，以为是个例

**最小有效观测**：上 Sentry（前端 + 后端两端 SDK，1-2 小时配完，免费档够内测）。这一项 ROI 极高，**强烈建议上线前必做**。

不需要：LogRocket（session replay）、PostHog 这些等公开测试再说。

---

## 1. P0 — 不修不能让朋友登录使用（必做）

### P0-1：开启 Editor 的 onSave，接到 PostgreSQL（约 30 行）

**位置**：`apps/editor/app/page.tsx:233`

```tsx
// 当前
<Editor layoutVersion="v2" projectId="local-editor" navbarSlot={<UserNavbar />} />

// 改后
<Editor
  layoutVersion="v2"
  projectId={currentProject?.id ?? null}
  onSave={async ({ nodes, rootNodeIds }) => {
    if (!session?.user) return  // 未登录跳过
    await saveProjectToCloud(currentProject?.name ?? '未命名项目', { nodes, rootNodeIds }, currentProject?.id)
  }}
  navbarSlot={<UserNavbar />}
/>
```

需要：
- 引入 `useSession()` 拿登录态
- 引入 `saveProjectToCloud()`（已存在 `lib/project-api.ts`）
- 处理 401 → 跳登录
- autosave 内部已有 1000ms debounce，无需重做

### P0-2：取消注释 middleware 路由保护（5 分钟）

**位置**：`apps/editor/middleware.ts:14-24`

按文件里现有的注释模板取消注释即可。`PROTECTED_PATHS = ['/projects', '/editor']`。`/share/[token]` 和 `/login` 保持公开。

### P0-3：Better Auth session cookie 加 production 安全配置（10 分钟）

**位置**：`apps/editor/lib/auth.ts`

在 `betterAuth({...})` 配置加：

```ts
advanced: {
  cookiePrefix: 'vilhil',
  defaultCookieAttributes: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
},
```

### P0-4：production 环境变量检查（30 分钟）

部署前确认（部署平台 env 配置）：

- `POSTGRES_URL` — 不能是 dev 数据库
- `BETTER_AUTH_SECRET` — 必须是新生成的强密钥（`openssl rand -base64 32`），**不能是 dev 默认值**
- `NEXT_PUBLIC_APP_URL` — 必须是公网域名
- 删除 `NEXT_PUBLIC_SUPABASE_*`（代码没用）

### P0-5：上 Sentry（前端 + 后端，2 小时）

```bash
cd apps/editor
bun add @sentry/nextjs
bunx @sentry/wizard@latest -i nextjs
```

向导会自动生成 `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts`。注意：

- 在 `app/error.tsx` 的 `useEffect` 里调 `Sentry.captureException(error)`
- 在每个 API route 的 catch 里调 `Sentry.captureException`
- 设置 `tracesSampleRate: 0.1`（采样 10%）控成本
- 内测期 user feedback 自带 contexts，足够定位 90% 问题

### P0-6：API rate limit（4 小时）

**位置**：登录 / 注册 / 分享密码验证 / 项目 save 这 4 个端点。

**最简方案**：用 `@upstash/ratelimit` + 任意 KV（Vercel KV / Upstash Redis 免费档）。

```ts
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const authLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'),  // 5 次/分钟
})
```

每个敏感 route 顶部：

```ts
const ip = req.headers.get('x-forwarded-for') ?? 'anon'
const { success } = await authLimiter.limit(ip)
if (!success) return NextResponse.json({ error: 'rate limited' }, { status: 429 })
```

**预估**：4 个端点 × 5 行 = 20 行 + 配置 ~30 行。

### P0-7：API 输入校验（zod，3 小时）

至少给 `/api/project/save`、`/api/share` 这两个核心写入端点加 zod schema。其他可以慢点。

---

## 2. P1 — 上线第一周内必修

### P1-1：并发编辑冲突检测（1 天）

**最简方案**：projects 表已有 `updatedAt` 字段。save API 改为：

```ts
// 客户端发请求时带上加载时拿到的 updatedAt
PATCH /api/project/save
body: { id, data, expectedUpdatedAt: '2026-04-24T10:00:00Z' }

// 服务端：
const current = await db.query.projects.findFirst({ where: eq(projects.id, id) })
if (current.updatedAt > new Date(expectedUpdatedAt)) {
  return NextResponse.json({ error: 'CONFLICT', currentData: current.data }, { status: 409 })
}
```

客户端拿到 409 后弹"另一设备已修改，刷新还是覆盖？"

### P1-2：401 / session 过期友好处理（半天）

`saveProjectToCloud` 检查 res.status === 401 → 弹 toast"登录过期，正在跳转..." → 跳 `/login?redirect=<当前页>`。

### P1-3：localStorage 大小检查 + 私密模式 fallback（2 小时）

包一层：

```ts
function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch (err) {
    Sentry.captureException(err, { tags: { kind: 'localstorage-write' } })
    return false
  }
}
```

全仓 `localStorage.setItem` 替换为 `safeLocalStorageSet`。

### P1-4：Safari / iPad 测试一遍（半天）

用真机或 BrowserStack。重点：
- WebGL Canvas 是否正常
- localStorage 私密模式
- Cookie sameSite=lax 在 ITP 下是否丢

---

## 3. P2 — 内测过程中观察决定

- CSP / HSTS / X-Frame-Options 安全 headers（next.config.ts 加 `headers()` 函数）
- WebGL context 切页清理（监控 Chrome devtools 看 context 数量）
- 分享 token 加长（10 → 16 字符）— 看是否真有恶意访问再决定
- Analytics（PostHog 或 Plausible）— 用户行为统计
- LogRocket session replay — 朋友 100 人级别再上

---

## 4. 时间预算

| 阶段 | 工作量 | 内容 |
|-----|--------|------|
| **P0 全部完成** | 1-1.5 天 | 6 项，按上面顺序 |
| **冒烟测试** | 半天 | 自己跑一遍 5 步可用性场景 + Sentry 收到 test event |
| **首批朋友（2-3 人）** | 1 天 | 受控放量，看 Sentry 错误率 |
| **扩大到 10 人** | 1 天 | 修首批反馈的问题 |
| **P1 全部完成** | 2 天 | 在朋友测的同时做 |

**最早可上线时间：从今天起 2-3 天**（假设 P0 顺利）。

---

## 5. 上线 checklist（自检表）

部署前对照打勾：

```
[ ] P0-1 onSave 已接 PostgreSQL（修改 + 刷新 验证项目还在）
[ ] P0-2 middleware 已开（未登录访问 /editor 跳 /login）
[ ] P0-3 cookie 安全设置已加
[ ] P0-4 production env 全部就位（数据库不是 dev、secret 不是默认）
[ ] P0-5 Sentry 收到 test event（前端 + 后端各一）
[ ] P0-6 rate limit 4 个端点全配
[ ] P0-7 至少 2 个写入端点有 zod 校验
[ ] 自己用一个新邮箱完整走完：注册 → 创建项目 → 放灯 → 刷新 → 关浏览器再打开 → 另一台电脑登录 → 看到项目 → 生成分享链接 → 朋友（不登录）能看到
[ ] 把上面这一遍录视频，作为 launch baseline
```

---

## 6. 不上线就不能开始的事

- 朋友的反馈没有 Sentry 接不住
- 没有 rate limit 一旦被刷会慢到崩
- 没接 PostgreSQL autosave 朋友会以为软件丢数据是 bug

**反过来，下面这些事可以一边内测一边补**：

- WebGL context 优化
- 移动端适配
- UI 美化
- Localization 完整化
- 子系统详情页扩展

---

## 7. 更新记录

- 2026-04-24：初稿。基于账号数据体系审计 + adversarial 架构审计 + 可观测性评估。
