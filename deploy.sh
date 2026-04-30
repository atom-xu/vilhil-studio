#!/bin/bash
# VilHil Studio 部署脚本

set -e

echo "=== 开始部署 VilHil Studio ==="

# 1. 创建部署目录
mkdir -p /var/www/vilhil-studio
cd /var/www/vilhil-studio

# 2. 克隆代码（如果还没有）
if [ ! -d ".git" ]; then
    echo "克隆代码..."
    git clone https://github.com/atom-xu/vilhil-studio.git .
fi

# 3. 拉取最新代码
git pull origin main

# 4. 创建环境变量文件
cat > .env.production << 'EOF'
# Better Auth
BETTER_AUTH_SECRET=vilhil-studio-secret-key-2024-change-me

# 应用 URL
NEXT_PUBLIC_APP_URL=https://studio.vilhil.cn

# PostgreSQL - 使用本地 PostgreSQL
POSTGRES_URL=postgresql://vilhil:vilhil123@postgres:5432/vilhil_prod

# 运行时端口
PORT=3001
EOF

# 5. 修改 docker-compose.yml 使用 3001 端口
cat > docker-compose.yml << 'EOF'
services:
  app:
    build:
      context: .
      dockerfile: apps/editor/Dockerfile
      args:
        NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-https://studio.vilhil.cn}
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - POSTGRES_URL=${POSTGRES_URL}
      - NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - vilhil

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: vilhil
      POSTGRES_PASSWORD: vilhil123
      POSTGRES_DB: vilhil_prod
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vilhil -d vilhil_prod"]
      interval: 10s
      timeout: 5s
      retries: 5
    ports:
      - "127.0.0.1:5433:5432"
    networks:
      - vilhil

volumes:
  postgres_data:

networks:
  vilhil:
    driver: bridge
EOF

# 6. 创建 Nginx 配置
cat > /etc/nginx/sites-available/studio.vilhil.cn << 'EOF'
server {
    listen 80;
    server_name studio.vilhil.cn;
    
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name studio.vilhil.cn;
    
    # SSL 证书（使用阿里云免费证书或 Let's Encrypt）
    ssl_certificate /etc/nginx/ssl/studio.vilhil.cn.pem;
    ssl_certificate_key /etc/nginx/ssl/studio.vilhil.cn.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    client_max_body_size 110m;
    proxy_read_timeout 120s;
    
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }
}
EOF

# 7. 启用 Nginx 配置
ln -sf /etc/nginx/sites-available/studio.vilhil.cn /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 8. 构建并启动 Docker 容器
echo "构建并启动服务..."
docker-compose down 2>/dev/null || true
docker-compose up -d --build

# 9. 检查状态
echo "=== 部署完成 ==="
echo "服务状态:"
docker-compose ps
echo ""
echo "访问地址: https://studio.vilhil.cn"
