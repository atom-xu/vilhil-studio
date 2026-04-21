# VilHil Studio — 部署上线 Checklist

> 以下事项**仅在上线前执行**，开发阶段保持现状即可。

---

## 🔐 一、认证与访问控制

- [ ] **取消 Middleware 注释**
  - 文件：`apps/editor/middleware.ts`
  - 操作：取消注释第 14-24 行，恢复 `/projects/*` 路由的登录保护
  - 备注：确保端到端测试先跑通再开启

- [ ] **开启 Better Auth 严格模式**
  - 文件：`apps/editor/lib/auth.ts`
  - 建议配置：
    ```ts
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,        // 强制邮箱验证后才登录
      requireEmailVerification: true,
    },
    advanced: {
      cookiePrefix: 'vh',
      useSecureCookies: true,   // HTTPS only
    },
    ```

- [ ] **服务端 Admin 权限二次校验**
  - 当前 Admin API（`/api/auth/admin/*`）直接由 Better Auth handler 代理
  - 上线前确认 Better Auth admin plugin 已配置 `adminRoles: ['admin']` 且服务端有默认拒绝策略

---

## 🛡️ 二、基础设施安全

- [ ] **Rate Limiting（速率限制）**
  - 关键端点：登录、注册、分享密码验证、分享 token 访问
  - 推荐方案：
    - Vercel Edge：Upstash Redis + `@upstash/ratelimit`
    - 自有服务器：Nginx `limit_req` + fail2ban
  - 建议阈值：登录/密码验证端点每 IP 5 次/分钟

- [ ] **生产环境密钥管理**
  - `.env.local` **不得**打包进镜像或提交到仓库
  - 按部署平台配置：
    - Vercel：Dashboard → Project Settings → Environment Variables
    - Docker：运行时通过 `-e` 或 `.env` 挂载（.env 不加入镜像层）
    - K8s：使用 Secret + ConfigMap
  - 必配变量：`POSTGRES_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`BETTER_AUTH_SECRET`

- [ ] **HTTPS + 安全响应头**
  - 强制 HTTPS（HSTS）
  - 添加响应头：
    ```
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    Referrer-Policy: strict-origin-when-cross-origin
    Content-Security-Policy: default-src 'self'; ...（根据实际资源域调整）
    ```
  - Next.js 可在 `next.config.ts` 中配置 `headers()` 输出

---

## 🗄️ 三、数据库与性能

- [ ] **PostgreSQL 连接池调优**
  - 当前 `max: 20` 适合开发，生产根据 Supabase / RDS 规格调整
  - Serverless 环境（Vercel/Netlify）建议配合连接池中间件（PgBouncer/Supabase Transaction Pooler）

- [ ] **数据库备份策略**
  - 开启 Supabase Point-in-Time Recovery 或 RDS 自动备份
  - 确认 `share_links.expiresAt` 的过期记录有定时清理任务（可选）

- [ ] **请求体大小网关层限制**
  - 当前代码层限制 20MB，建议在 Nginx / CDN / API Gateway 再做一层限制（如 10MB）
  - 大文件上传（如有）应走预签名 URL 直传对象存储，而非经过 Next.js

---

## 📊 四、监控与运维

- [ ] **日志与告警**
  - 接入 Sentry / LogRocket 捕获前端异常
  - 服务端错误（500、413、429）接入告警通道（Slack/钉钉/企业微信）

- [ ] **健康检查**
  - 已有 `GET /api/health`，确保负载均衡器 / K8s probe 配置指向该端点

- [ ] **依赖漏洞扫描**
  - 上线前运行 `npm audit` / `bun audit` 或 Snyk 扫描
  - 特别关注 `better-auth`、`next`、`pg` 等核心依赖的 CVE

---

## 🌐 五、域名与 SEO

- [ ] **更新 `NEXT_PUBLIC_APP_URL`**
  - 生产域名：`https://your-domain.com`
  - 影响：分享链接生成、Auth 回调 URL

- [ ] **Robots / Sitemap**
  - `/admin/*` 和 `/api/*` 路径在 `robots.txt` 中设为 `Disallow`
  - 公开分享页 `/share/[token]` 根据业务决定是否允许索引

---

## 🧪 六、上线前测试

- [ ] **端到端流程测试**
  - [ ] 匿名用户保存项目 → 创建分享链接 → 密码保护 → 访客访问
  - [ ] 注册用户登录 → 保存项目 → 更新项目 → 删除项目
  - [ ] Admin 创建用户 → 重置密码 → 删除用户
  - [ ] 过期分享链接返回 410
  - [ ] 无权限访问返回 403

- [ ] **安全测试**
  - [ ] 开放重定向：尝试 `?redirect=https://evil.com` 应被拦截到 `/`
  - [ ] 分享密码暴力破解：连续错误 10 次应触发限流
  - [ ] 超大请求体：上传 50MB JSON 应返回 413

---

## 📌 快速参考：部署顺序建议

```
1. 配置生产环境变量（不在仓库中）
2. 开启 HTTPS + 安全响应头
3. 接入 Rate Limiting
4. 取消 middleware.ts 注释 → 恢复登录保护
5. 开启 Better Auth 严格模式（邮箱验证）
6. 跑通端到端测试
7. 上线 🚀
```

---

*最后更新：2026-04-21*
