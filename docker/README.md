# RMS + OpenClaw + Memcached All-in-One Docker 部署指南

## 📦 容器内容

| 组件 | 说明 | 端口 |
|------|------|------|
| RMS | Next.js 需求管理系统 | 3800 |
| OpenClaw | AI Agent Gateway | 18789 |
| MySQL 8 | 数据库（含完整 schema + 数据） | 3306 |
| Memcached | 缓存服务 | 11211 |

## 🚀 快速开始

### 方式一：Docker Compose（推荐）

```bash
# 1. 复制环境配置
cp docker/.env.example .env

# 2. 修改 .env 中的配置（密码、飞书凭据等）
vi .env

# 3. 构建并启动
docker-compose up -d --build

# 4. 查看日志
docker-compose logs -f

# 5. 访问
#    RMS:       http://localhost:3800
#    OpenClaw:  http://localhost:18789
```

### 方式二：Docker 单命令

```bash
# 构建镜像
docker build -t rms-openclaw:latest .

# 运行容器
docker run -d \
  --name rms-openclaw \
  -p 3800:3800 \
  -p 18789:18789 \
  -p 3306:3306 \
  -p 11211:11211 \
  -e MYSQL_PASSWORD=rms123456 \
  -e FEISHU_APP_ID=your_app_id \
  -e FEISHU_APP_SECRET=your_app_secret \
  -v rms-mysql:/var/lib/mysql \
  -v rms-uploads:/app/rms/public/uploads \
  -v openclaw-data:/app/openclaw \
  --restart unless-stopped \
  rms-openclaw:latest

# 查看日志
docker logs -f rms-openclaw
```

### 方式三：Kubernetes

```bash
# 1. 创建 secrets（替换为你的实际值）
kubectl create secret generic rms-secrets \
  --from-literal=mysql-password=rms123456 \
  --from-literal=feishu-app-id=your_app_id \
  --from-literal=feishu-app-secret=your_app_secret

# 2. 部署
kubectl apply -f k8s.yaml

# 3. 查看状态
kubectl get pods -l app=rms-openclaw
kubectl logs -f deployment/rms-openclaw

# 4. 访问（NodePort）
#    RMS:       http://<node-ip>:30800
#    OpenClaw:  http://<node-ip>:31878
```

## ⚙️ 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MYSQL_USER` | `rms` | MySQL 用户名 |
| `MYSQL_PASSWORD` | `rms123456` | MySQL 密码 |
| `MYSQL_DATABASE` | `rms` | 数据库名 |
| `RMS_PORT` | `3800` | RMS Web 端口 |
| `OPENCLAW_ENABLED` | `true` | 是否启动 OpenClaw |
| `OPENCLAW_PORT` | `18789` | OpenClaw Gateway 端口 |
| `FEISHU_APP_ID` | (空) | 飞书应用 ID |
| `FEISHU_APP_SECRET` | (空) | 飞书应用 Secret |
| `MEMCACHE_PORT` | `11211` | Memcached 端口 |

## 🔑 默认登录

- **用户名**: `admin`
- **密码**: `admin`

## 📁 数据持久化

| Volume | 容器路径 | 说明 |
|--------|----------|------|
| `mysql-data` | `/var/lib/mysql` | MySQL 数据 |
| `rms-uploads` | `/app/rms/public/uploads` | RMS 上传文件 |
| `openclaw-data` | `/app/openclaw` | OpenClaw 配置、会话、工作区 |

## 🛠️ OpenClaw 配置

OpenClaw 配置文件位于 `/app/openclaw/openclaw.json`，首次启动时自动生成默认配置。

### 启用飞书通道

1. 编辑 `.env` 文件，填入飞书凭据：
   ```
   FEISHU_APP_ID=cli_xxxxx
   FEISHU_APP_SECRET=xxxxx
   ```
2. 进入容器修改 OpenClaw 配置：
   ```bash
   docker exec -it rms-openclaw bash
   vi /app/openclaw/openclaw.json
   # 将 channels.feishu.enabled 改为 true
   # 填入 appId 和 appSecret
   ```
3. 重启容器：`docker restart rms-openclaw`

### 配置 AI 模型

编辑 `/app/openclaw/openclaw.json`，在 `models.providers` 中添加你的 API Key：

```json
{
  "models": {
    "providers": {
      "tencentmaas": {
        "baseUrl": "https://tokenhub.tencentmaas.com/plan/v3",
        "api": "openai-completions",
        "apiKey": "YOUR_API_KEY",
        "models": [...]
      }
    }
  }
}
```

## 🔧 常用操作

```bash
# 进入容器
docker exec -it rms-openclaw bash

# 查看 MySQL
mysql -u rms -prms123456 rms

# 查看进程状态
pm2 list

# 重启 RMS
pm2 restart rms

# 查看 OpenClaw 日志
cat /var/log/supervisor/openclaw.log

# 备份 MySQL
docker exec rms-openclaw mysqldump -u rms -prms123456 rms > backup.sql

# 恢复 MySQL
docker exec -i rms-openclaw mysql -u rms -prms123456 rms < backup.sql
```

## 📐 架构

```
┌─────────────────────────────────────────────┐
│           Docker Container                   │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ MySQL 8  │  │Memcached │  │  OpenClaw │ │
│  │  :3306   │  │  :11211  │  │  Gateway  │ │
│  └────┬─────┘  └────┬─────┘  │  :18789   │ │
│       │              │        └─────┬─────┘ │
│       │              │              │       │
│  ┌────┴──────────────┴──────────────┴────┐  │
│  │         RMS (Next.js) :3800           │  │
│  └───────────────────────────────────────┘  │
│                                              │
│  Supervisor (进程管理)                       │
│  entrypoint.sh (启动脚本)                    │
└─────────────────────────────────────────────┘
```

## ⚠️ 注意事项

1. **首次启动**需要 30-60 秒（MySQL 初始化 + schema 导入）
2. **生产环境**请务必修改默认密码和 OpenClaw Gateway Token
3. **单容器模式**适合开发/测试，生产环境建议拆分 MySQL 为独立容器
4. MySQL 数据在首次启动时初始化，后续重启会保留数据
5. 容器内存建议 ≥ 2GB
