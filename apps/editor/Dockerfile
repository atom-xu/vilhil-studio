# ====================================================================
# VilHil Studio — 多阶段 Docker 构建
# 适用于阿里云 ECS / ACK / ACR 部署
# 构建命令（从 monorepo 根目录执行）：
#   docker build -f apps/editor/Dockerfile -t vilhil-studio:latest .
# ====================================================================

# ── Stage 1: 安装依赖 ──────────────────────────────────────────────
FROM oven/bun:1.2-slim AS deps
WORKDIR /app

# 只复制 package.json，避免源码变化导致缓存失效
COPY package.json bun.lock ./
COPY apps/editor/package.json apps/editor/
COPY packages/core/package.json       packages/core/
COPY packages/editor/package.json     packages/editor/
COPY packages/smarthome/package.json  packages/smarthome/
COPY packages/viewer/package.json     packages/viewer/

# frozen-lockfile：保证构建可复现
RUN bun install --frozen-lockfile

# ── Stage 2: 构建 ──────────────────────────────────────────────────
FROM oven/bun:1.2-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建时注入的 public 变量（必须在 docker build 时通过 --build-arg 传入）
ARG NEXT_PUBLIC_APP_URL=https://studio.vilhil.cn
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# turbo build 只构建 editor app（packages 已通过 dependsOn 自动构建）
RUN bun run build --filter=editor

# ── Stage 3: 生产镜像 ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# standalone 输出结构（outputFileTracingRoot = monorepo root）：
#   apps/editor/.next/standalone/
#     ├── node_modules/          ← 精简依赖
#     ├── apps/editor/server.js  ← 入口
#     └── packages/...
COPY --from=builder /app/apps/editor/.next/standalone ./
COPY --from=builder /app/apps/editor/.next/static     ./apps/editor/.next/static
COPY --from=builder /app/apps/editor/public           ./apps/editor/public

# 非 root 用户运行（安全最佳实践）
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 启动独立 Node.js 服务（不依赖 bun / next CLI）
CMD ["node", "apps/editor/server.js"]
