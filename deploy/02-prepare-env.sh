#!/bin/bash
# Step 2: 准备环境变量 + 清理 OpenClaw 之前的临时部署
#
# 用途：
#   1. 停掉 OpenClaw 用 PM2 启动的临时服务
#   2. 生成 .env.production，含强密码 + 占位符（用户后面填外部 API key）
# 用法：sudo bash deploy/02-prepare-env.sh
# 前置：Step 1 完成（Docker 加速器可用）
# 后续：用户编辑 .env.production，填入 RESEND_API_KEY / Sentry DSN

set -e

DEPLOY_ROOT="/var/www/vilhil-studio"
ENV_FILE="$DEPLOY_ROOT/.env.production"

echo "[1/5] 检查仓库目录"
if [ ! -d "$DEPLOY_ROOT" ]; then
  echo "  ✗ $DEPLOY_ROOT 不存在"
  echo "    需要先把代码上传到这里。可以："
  echo "    a) 解压之前上传的 tar 包：tar -xzf /tmp/vilhil-studio.tar.gz -C /var/www/vilhil-studio --strip-components=0"
  echo "    b) 或 git clone（如果服务器能访问 GitHub）"
  exit 1
fi
cd "$DEPLOY_ROOT"
echo "  ✓ 在 $DEPLOY_ROOT"

echo "[2/5] 停掉 OpenClaw 之前的 PM2 临时进程"
if command -v pm2 >/dev/null 2>&1; then
  pm2 list 2>/dev/null | grep -i vilhil && pm2 delete vilhil-studio 2>/dev/null || true
  pm2 list 2>/dev/null | grep -i editor && pm2 delete editor 2>/dev/null || true
  echo "  ✓ PM2 已清理"
else
  echo "  - PM2 未安装，跳过"
fi

echo "[3/5] 释放 3001 端口（如果被占）"
PIDS=$(lsof -ti :3001 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "  发现 3001 端口占用：$PIDS"
  kill -9 $PIDS 2>/dev/null || true
  echo "  ✓ 已释放"
else
  echo "  ✓ 3001 端口空闲"
fi

echo "[4/5] 生成 .env.production"
if [ -f "$ENV_FILE" ]; then
  echo "  - $ENV_FILE 已存在，备份为 .env.production.bak.$(date +%s)"
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
fi

BETTER_AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')
POSTGRES_PASSWORD=$(openssl rand -hex 16)

cat > "$ENV_FILE" <<EOF
# ====================================================================
# VilHil Studio — 生产环境变量（自动生成于 $(date)）
# 不要 commit 这个文件到 git
# ====================================================================

# ── 自动生成（不要改）────────────────────────────────────────────────
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_URL=postgresql://vilhil:$POSTGRES_PASSWORD@postgres:5432/vilhil_prod

# ── 应用 URL ─────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://studio.vilhil.cn

# ── 必须填写：邮件服务（朋友忘记密码必备）────────────────────────────
# 注册 https://resend.com 拿到 api key 后填这里
RESEND_API_KEY=

# ── 强烈建议填写：错误监控 ───────────────────────────────────────────
# 注册 https://sentry.io 创建 Next.js 项目后填这里
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
EOF

chmod 600 "$ENV_FILE"
echo "  ✓ 已生成 $ENV_FILE（权限 600）"

echo "[5/5] 完成"
echo ""
echo "[OK] 环境准备完成。下一步："
echo ""
echo "  1) 编辑 $ENV_FILE，填入 RESEND_API_KEY"
echo "     vi $ENV_FILE"
echo "     （如果暂时没 Resend，留空也能跑，但密码重置发不出邮件）"
echo ""
echo "  2) 跑 Step 3：sudo bash deploy/03-build-up.sh"
