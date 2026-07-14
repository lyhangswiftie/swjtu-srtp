#!/bin/bash
# SecureCodeAct 部署脚本
# 版本：v3.0 | 更新日期：2026-05-07
# 适用于：Ubuntu 22.04/24.04，Docker 已安装，支持 --network host 模式
#
# 使用方式：
#   export LLM_API_KEY=<your-openai-api-key>
#   bash scripts/deploy-sca.sh
#
# 环境要求：
#   - Docker 27.x+
#   - 宿主机支持 --network host（Linux 原生，不适用于 macOS/Windows）
#   - 至少 8GB RAM，20GB 磁盘空间

set -e

# 配置
CONTAINER_NAME="openhands-sca"
OPENHANDS_IMAGE="ghcr.io/openhands/openhands:1.6.0"  # SCA v3.0 基础镜像
RUNTIME_IMAGE="ghcr.io/openhands/runtime:1.6.0-nikolaik"
# 如果已构建自定义镜像，取消注释以下行：
# RUNTIME_IMAGE="securecodeact-runtime:1.6.0-lite"

LLM_MODEL="${LLM_MODEL:-gpt-4.1-mini}"
LLM_API_KEY="${LLM_API_KEY:?请设置 LLM_API_KEY 环境变量}"
LLM_BASE_URL="${LLM_BASE_URL:-https://api.openai.com/v1}"

OPENHANDS_DATA_DIR="${HOME}/.openhands"
FRONTEND_BUILD_DIR="$(pwd)/frontend/build"

# 创建数据目录
mkdir -p "$OPENHANDS_DATA_DIR"
chmod -R 777 "$OPENHANDS_DATA_DIR"

# 停止并删除旧容器
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "停止旧容器 ${CONTAINER_NAME}..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
fi

# 拉取最新镜像
echo "拉取 OpenHands 镜像..."
docker pull "$OPENHANDS_IMAGE"
docker pull "$RUNTIME_IMAGE"

# 构建挂载参数
MOUNT_ARGS="-v /var/run/docker.sock:/var/run/docker.sock"
MOUNT_ARGS="$MOUNT_ARGS -v ${OPENHANDS_DATA_DIR}:/.openhands"

# 如果前端构建产物存在，挂载自定义前端
if [ -d "$FRONTEND_BUILD_DIR" ]; then
    echo "检测到自定义前端构建产物，将挂载..."
    MOUNT_ARGS="$MOUNT_ARGS -v ${FRONTEND_BUILD_DIR}:/app/frontend/build"
fi

# 启动容器
echo "启动 OpenHands SecureCodeAct..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --network host \
    --add-host=host.docker.internal:host-gateway \
    -e SANDBOX_RUNTIME_CONTAINER_IMAGE="$RUNTIME_IMAGE" \
    -e SANDBOX_LOCAL_RUNTIME_URL=http://localhost:8000 \
    -e ENABLE_BROWSER=false \
    -e DISABLE_VSCODE_PLUGIN=true \
    -e LLM_MODEL="$LLM_MODEL" \
    -e LLM_API_KEY="$LLM_API_KEY" \
    -e LLM_BASE_URL="$LLM_BASE_URL" \
    $MOUNT_ARGS \
    "$OPENHANDS_IMAGE"

echo "等待服务就绪..."
for i in $(seq 1 30); do
    if curl -s --max-time 3 http://localhost:3000/api/options/models > /dev/null 2>&1; then
        echo "✅ OpenHands 已就绪！访问 http://localhost:3000"
        break
    fi
    echo "  等待中... ($i/30)"
    sleep 2
done

echo ""
echo "部署完成！"
echo "  - 主界面：http://localhost:3000"
echo "  - 容器名：$CONTAINER_NAME"
echo "  - 查看日志：docker logs -f $CONTAINER_NAME"
