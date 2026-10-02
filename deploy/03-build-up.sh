#!/bin/bash
# Step 3: 构建并启动 Docker 容器
#
# 用法：sudo bash deploy/03-build-up.sh
# 前置：Step 1 + Step 2 完成
# 输出：docker compose 起两个容器（app + postgres）
# 时间：首次 build 大约 5-15 分钟（依赖构建慢）

set -e

DEPLOY_ROOT="/var/www/vilhil-studio"
cd "$DEPLOY_ROOT"

if [ ! -f .env.production ]; then
  echo "[ERR] .env.production 不存在，先跑 Step 2"
  exit 1
fi

echo "[1/4] 检查可用内存（build 需要 ≥ 2GB free）"
FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')
echo "  available: ${FREE_MB} MB"
if [ "$FREE_MB" -lt 1500 ]; then
  echo "  ✗ 可用内存不足 1.5GB，build 可能 SIGKILL"
  echo "    建议先 docker stop 一些占用内存的容器，或 systemctl stop 不必要服务"
  echo "    若坚持继续，按 Ctrl+C 后手动跑 docker compose build --no-cache"
  echo ""
  read -p "  仍要继续？(y/N) " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

echo "[2/4] docker compose build（首次较慢）"
cd "$DEPLOY_ROOT/deploy"
docker compose --env-file ../.env.production build 2>&1 | tee /tmp/vilhil-build.log
BUILD_EXIT=${PIPESTATUS[0]}
if [ "$BUILD_EXIT" -ne 0 ]; then
  echo "  ✗ build 失败，看 /tmp/vilhil-build.log 最后 50 行："
  tail -50 /tmp/vilhil-build.log
  exit 1
fi
echo "  ✓ build 完成"

echo "[3/4] docker compose up -d"
docker compose --env-file ../.env.production up -d
echo "  容器启动中..."
sleep 8

echo "[4/4] 状态检查"
docker compose --env-file ../.env.production ps
echo ""
APP_RUNNING=$(docker compose --env-file ../.env.production ps --status running --services 2>/dev/null | grep -c "^app$" || echo 0)
PG_RUNNING=$(docker compose --env-file ../.env.production ps --status running --services 2>/dev/null | grep -c "^postgres$" || echo 0)

if [ "$APP_RUNNING" -eq 1 ] && [ "$PG_RUNNING" -eq 1 ]; then
  echo "[OK] 两个容器都 running，下一步："
  echo "  1) 跑 Step 4：sudo bash deploy/04-migrate.sh（数据库迁移）"
  echo "  2) 等约 30 秒让 app 启动完，curl localhost:3001/api/health 看看"
else
  echo "[WARN] 容器未全部 running，看日志："
  echo "  docker compose --env-file ../.env.production logs app | tail -50"
  echo "  docker compose --env-file ../.env.production logs postgres | tail -30"
  exit 1
fi
