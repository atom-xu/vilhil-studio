#!/bin/bash
# Step 1: 修复 Docker 镜像加速器（阿里云）
#
# 用途：让 docker pull 能从阿里云镜像源拉镜像，避开 Docker Hub 网络问题
# 用法：sudo bash deploy/01-fix-docker.sh
# 失败处理：看输出最后一行的 [ERR] 或 [OK] 决定下一步

set -e

ALIYUN_MIRROR="https://w189l9na.mirror.aliyuncs.com"

echo "[1/5] 写入 /etc/docker/daemon.json"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": [
    "$ALIYUN_MIRROR",
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
echo "  写入完成"

echo "[2/5] 重启 Docker daemon"
systemctl daemon-reload
systemctl restart docker
sleep 3

echo "[3/5] 验证加速器是否生效"
if docker info 2>/dev/null | grep -A 5 "Registry Mirrors" | grep -q "$ALIYUN_MIRROR"; then
  echo "  ✓ 加速器已生效"
else
  echo "  ✗ 加速器未生效，请检查 daemon.json 语法"
  exit 1
fi

echo "[4/5] 拉一个小镜像测试网络"
if docker pull registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.9 >/dev/null 2>&1; then
  echo "  ✓ 阿里云镜像源可达"
else
  echo "  ✗ 阿里云镜像源不通，可能是 ECS 网络问题"
  echo "    请在阿里云控制台检查 ECS 安全组的 outbound 规则"
  exit 1
fi

echo "[5/5] 测试 Docker Hub 通过加速器"
if timeout 60 docker pull alpine:latest >/dev/null 2>&1; then
  echo "  ✓ Docker Hub 镜像可拉取"
  echo ""
  echo "[OK] Docker 加速器配置成功，可以继续 Step 2"
else
  echo "  ⚠ Docker Hub 镜像加速器还是慢，但阿里云源可用"
  echo "    可以走 fallback：把所有 FROM 改成阿里云镜像"
  echo ""
  echo "[PARTIAL] Step 1 完成但需要走 fallback 方案，告知 Cowork"
  exit 2
fi
