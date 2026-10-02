#!/bin/bash
# Step 4: 跑数据库迁移（drizzle SQL 文件直接 psql 执行）
#
# 用法：sudo bash deploy/04-migrate.sh
# 前置：Step 3 完成（postgres 容器在跑）
# 原理：apps/editor/drizzle/*.sql 按文件名排序依次执行
#       Drizzle 自带的 __drizzle_migrations 元表会跳过已执行的

set -e

DEPLOY_ROOT="/var/www/vilhil-studio"
cd "$DEPLOY_ROOT"

if [ ! -f .env.production ]; then
  echo "[ERR] .env.production 不存在"
  exit 1
fi

echo "[1/3] 等待 postgres 容器就绪"
for i in {1..15}; do
  if docker compose -f deploy/docker-compose.yml --env-file .env.production exec -T postgres pg_isready -U vilhil -d vilhil_prod >/dev/null 2>&1; then
    echo "  ✓ postgres 就绪"
    break
  fi
  echo "  等待中 ($i/15)..."
  sleep 2
done

echo "[2/3] 创建迁移记录表（drizzle 风格）"
docker compose -f deploy/docker-compose.yml --env-file .env.production exec -T postgres \
  psql -U vilhil -d vilhil_prod -c "
CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at timestamp DEFAULT now()
);
" >/dev/null
echo "  ✓"

echo "[3/3] 依次执行 drizzle/*.sql"
for sql_file in $(ls apps/editor/drizzle/*.sql | sort); do
  filename=$(basename "$sql_file")
  echo "  → $filename"

  # 检查是否已执行
  exists=$(docker compose -f deploy/docker-compose.yml --env-file .env.production exec -T postgres \
    psql -U vilhil -d vilhil_prod -tA -c "SELECT 1 FROM __drizzle_migrations WHERE hash = '$filename'" 2>/dev/null || echo "")

  if [ "$exists" = "1" ]; then
    echo "    ⏭  已执行，跳过"
    continue
  fi

  # 执行 SQL（drizzle 用 --> statement-breakpoint 分隔，psql 能直接处理）
  if docker compose -f deploy/docker-compose.yml --env-file .env.production exec -T postgres \
       psql -U vilhil -d vilhil_prod -v ON_ERROR_STOP=1 < "$sql_file" >/dev/null 2>&1; then
    docker compose -f deploy/docker-compose.yml --env-file .env.production exec -T postgres \
      psql -U vilhil -d vilhil_prod -c "INSERT INTO __drizzle_migrations(hash) VALUES('$filename')" >/dev/null
    echo "    ✓ 已执行"
  else
    echo "    ✗ 执行失败，重跑日志："
    docker compose -f deploy/docker-compose.yml --env-file .env.production exec -T postgres \
      psql -U vilhil -d vilhil_prod -v ON_ERROR_STOP=1 < "$sql_file" 2>&1 | tail -20
    exit 1
  fi
done

echo ""
echo "[OK] 数据库迁移完成。查看表："
docker compose -f deploy/docker-compose.yml --env-file .env.production exec -T postgres \
  psql -U vilhil -d vilhil_prod -c "\dt"

echo ""
echo "下一步：sudo bash deploy/05-health.sh"
