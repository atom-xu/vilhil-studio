#!/bin/bash
# Step 5: 健康检查 + 配置 nginx
#
# 用法：sudo bash deploy/05-health.sh
# 前置：Step 1-4 全部完成
# 输出：
#   - 容器状态、health 接口返回
#   - 安装 nginx 配置（要求已申请 SSL 证书）

set -e

DEPLOY_ROOT="/var/www/vilhil-studio"
cd "$DEPLOY_ROOT"

echo "[1/5] 容器状态"
docker compose -f deploy/docker-compose.yml --env-file .env.production ps
echo ""

echo "[2/5] App 内部 health 接口"
sleep 5  # 给 app 一点启动时间
HEALTH=$(curl -s -m 10 http://localhost:3001/api/health || echo "")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "  ✓ /api/health 返回 ok"
  echo "  $HEALTH"
else
  echo "  ✗ /api/health 异常，返回："
  echo "  ${HEALTH:-（无返回）}"
  echo ""
  echo "  看 app 日志："
  docker compose -f deploy/docker-compose.yml --env-file .env.production logs app | tail -40
  exit 1
fi
echo ""

echo "[3/5] 检查 SSL 证书是否就位"
if [ ! -f /etc/nginx/ssl/studio.vilhil.cn.pem ] || [ ! -f /etc/nginx/ssl/studio.vilhil.cn.key ]; then
  echo "  ✗ SSL 证书未上传"
  echo "    请在阿里云控制台申请免费 DV 证书（绑定 studio.vilhil.cn），用 DNS 验证"
  echo "    下载 nginx 格式后 scp 到："
  echo "      /etc/nginx/ssl/studio.vilhil.cn.pem"
  echo "      /etc/nginx/ssl/studio.vilhil.cn.key"
  echo "    然后重跑本脚本"
  echo ""
  echo "  在没装 SSL 之前，可以用 IP + 端口直接访问验证 app："
  echo "    curl -I http://47.97.111.79:3001/api/health"
  exit 0
fi
echo "  ✓ SSL 证书在位"

echo "[4/5] 安装 nginx 配置"
cp deploy/nginx.conf /etc/nginx/conf.d/studio.vilhil.cn.conf
nginx -t
systemctl reload nginx
echo "  ✓ nginx 配置已加载"

echo "[5/5] 外部 health 接口"
sleep 2
EXTERNAL=$(curl -sk -m 10 https://studio.vilhil.cn/api/health || echo "")
if echo "$EXTERNAL" | grep -q '"status":"ok"'; then
  echo "  ✓ https://studio.vilhil.cn/api/health 通"
  echo "  $EXTERNAL"
else
  echo "  ✗ 外部访问失败"
  echo "  返回：${EXTERNAL:-（无）}"
  echo ""
  echo "  排查："
  echo "    1) DNS 是否解析正确：dig studio.vilhil.cn"
  echo "    2) 阿里云安全组 443 端口是否开放"
  echo "    3) nginx 错误日志：tail -30 /var/log/nginx/vilhil-studio.error.log"
  exit 1
fi

echo ""
echo "================================================================"
echo "  ✓ VilHil Studio 已上线 https://studio.vilhil.cn"
echo "================================================================"
echo ""
echo "下一步（运营层）："
echo "  1) 用一个新邮箱注册并完整走一遍流程"
echo "  2) 故意触发一个错误看 Sentry 是否收到"
echo "  3) 在 UptimeRobot 加监控"
echo "  4) 告知朋友测试地址"
