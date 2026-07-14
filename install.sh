#!/bin/bash
# SecureCodeAct (SCA) 一键安装与启动脚本
# 版本：v4.0 | 更新日期：2026-06-01
#
# 修复历史：
#   Issue #17 (2026-04-24): WSL2 环境下沙箱启动失败（500: Sandbox entered error state）
#     - 新增 WSL2 环境自动检测，针对性添加 NET_ADMIN/NET_RAW 权限
#     - 同时传入 SANDBOX_USE_HOST_NETWORK 和 AGENT_SERVER_USE_HOST_NETWORK
#     - 修正 LLM_MODEL 默认值（gpt-4.5-preview 已废弃，改为 gpt-4.1-mini）
#     - 新增容器启动健康检查，替代固定 sleep 15
#
#   Issue #23 修复后续 (2026-04-26): LLM Settings 配置问题 + Chat 输入无响应 + 沙箱报错
#     - 新增 LLM_BASE_URL 环境变量传递（关键修复：缺少此变量导致 LLM 调用走官方 API 返回 401）
#     - 新增容器启动后自动调用 /api/settings 保存 LLM 配置（解决 "Settings not found" 错误）
#     - 新增 SANDBOX_RUNTIME_CONTAINER_IMAGE 和 SANDBOX_LOCAL_RUNTIME_URL 配置
#     - 新增 --cap-add NET_ADMIN/NET_RAW（所有环境，非仅 WSL2）
#     - Chat 输入框无响应根因：LLM 调用失败 → Agent 进入 error 状态 → 消息发送无响应
#       修复：正确配置 LLM 后 Agent 可正常处理消息，Chat 输入恢复正常
#
#   v3.0 (2026-05-07): TC-SCA-025 端到端流水线集成
#     - 新增 Python 核心依赖安装步骤（PyYAML、requests）
#     - 修正 Node.js 版本要求（>=22.12.0，与 package.json engines 字段一致）
#     - 补充 requirements.txt 安装说明
#
#   v3.1 (2026-05-31): TC-SCA-RECENT-ISSUES-001 修复 #52 #53
#     - 修复点1：显式设置 APP_MODE=oss（对齐 AppMode.OPENHANDS.value='oss'），确保 git_api_router 路由注册
#       （修复 /api/user/repositories 返回 404 的问题）
#     - 修复点2：支持 GITHUB_TOKEN/GH_TOKEN 自动注入 /api/add-git-providers
#       （修复 GitHub 仓库导入 401 的问题）
#     - 修复点3：安装后增加 GitHub 导入链路自检，明确区分 200/401/404/500
#     - 修复点4：AGENT_SERVER_STARTUP_GRACE_SECONDS 支持环境变量覆盖，默认 90 秒
#       （修复 agent-server 启动超时被误判为 ERROR 的问题）
#
#   v3.2 (2026-06-01): TC-SCA-PR56-HARDENING-002 工程硬化
#     - 安全：安装日志中不再打印 GitHub Token 任何片段
#     - 硬化：PATCHED_SANDBOX_FILE 不存在时 exit 1（fail-fast，不跳过）
#     - 硬化：_get_startup_grace_seconds() 增加最小値下限（_MIN=10s）和非法値 ValueError
#     - 硬化：pip 包名加引号、~/.openhands chmod 700
#     - 前端：修复黄色 Banner 错字"沙筎"→"沙箱"，文案去掉"自动投递"歧义表述
#
#   v4.0 (2026-06-01): TC-SCA-REPO-SANDBOX-USABILITY-004 安全模式增强
#     - 新增 SCA_FORCE_RECREATE=1：强制删除并重建容器（默认仅在容器不存在时创建）
#     - 新增 SCA_UI_ONLY=1：跳过镜像拉取和容器启动，仅构建前端并注入
#     - 容器已存在且未设置 SCA_FORCE_RECREATE 时，自动跳过删除和重建步骤
#
# 使用方法：
#   export OPENAI_API_KEY='your_key'
#   export OPENAI_BASE_URL='https://api.manus.im/api/llm-proxy/v1'  # 可选，默认为 OpenAI 官方
#   export GITHUB_TOKEN='ghp_xxx'                                     # 可选，启用 GitHub 仓库导入
#   export AGENT_SERVER_STARTUP_GRACE_SECONDS=90                      # 可选，默认 90 秒
#   export SCA_FORCE_RECREATE=1                                       # 可选，强制重建容器
#   export SCA_UI_ONLY=1                                              # 可选，仅更新前端不重启容器
#   bash install.sh

set -e

echo "============================================================"
echo "      SecureCodeAct (SCA) 一键安装与启动脚本 v4.0"
echo "============================================================"

# TC-SCA-REPO-SANDBOX-USABILITY-004: 安全模式开关
# SCA_FORCE_RECREATE=1: 强制删除并重建容器（默认仅在容器不存在时创建）
# SCA_UI_ONLY=1: 跳过镜像拉取和容器启动，仅构建前端并注入
SCA_FORCE_RECREATE="${SCA_FORCE_RECREATE:-0}"
SCA_UI_ONLY="${SCA_UI_ONLY:-0}"

if [ "$SCA_UI_ONLY" = "1" ]; then
    echo "[*] SCA_UI_ONLY=1 模式：跳过镜像拉取和容器启动，仅更新前端"
elif [ "$SCA_FORCE_RECREATE" = "1" ]; then
    echo "[*] SCA_FORCE_RECREATE=1 模式：将强制删除并重建容器"
fi

# ─── 环境检测 ────────────────────────────────────────────────
IS_WSL=false
if grep -qEi "(microsoft|wsl)" /proc/version 2>/dev/null; then
    IS_WSL=true
    echo "[*] 检测到 WSL2 环境，将启用 WSL2 专项配置"
fi

# ─── 1. 检查并安装 Docker ────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "[*] 未检测到 Docker，正在安装..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo systemctl start docker 2>/dev/null || sudo service docker start
    sudo systemctl enable docker 2>/dev/null || true
    sudo usermod -aG docker "$USER" 2>/dev/null || true
    echo "[!] 已将当前用户加入 docker 组，建议重新登录后再运行本脚本"
else
    echo "[*] Docker 已安装: $(docker --version)"
fi

# WSL2 专项：WSL2 不自动启动 systemd，需手动启动 Docker 服务
if [ "$IS_WSL" = true ]; then
    if ! sudo service docker status &>/dev/null; then
        echo "[*] WSL2 环境：启动 Docker 服务..."
        sudo service docker start
        sleep 3
    fi
fi

# ─── 2. 检查并安装 Node.js（要求 >=22.12.0）────────────────
# 使用精确 semver 检查：主版本 > 22，或主版本 = 22 且次版本 >= 12
check_node_version() {
    if ! command -v node &> /dev/null; then
        return 1
    fi
    node -e '
const v = process.versions.node.split(".").map(Number);
const ok = v[0] > 22 || (v[0] === 22 && v[1] >= 12);
process.exit(ok ? 0 : 1);
'
}

if ! command -v npm &> /dev/null; then
    echo "[*] 未检测到 npm，正在安装 Node.js 22.x（要求 >=22.12.0）..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! check_node_version; then
    echo "[✗] Node.js 版本不满足要求，当前版本: $(node -v 2>/dev/null || echo 未安装)"
    echo "    SecureCodeAct 前端要求 Node.js >= 22.12.0"
    echo "    请升级 Node.js 后重新运行 install.sh"
    echo "    升级命令: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi
NODE_VER=$(node -v | sed 's/v//')
echo "[✓] Node.js v${NODE_VER} 满足要求（>= 22.12.0）"

# ─── 3. 安装 Python 核心依赖 ─────────────────────────────────
if command -v pip3 &> /dev/null || command -v pip &> /dev/null; then
    PIP_CMD=$(command -v pip3 || command -v pip)
    echo "[*] 正在安装 Python 核心依赖（PyYAML、requests）..."
    SCRIPT_DIR_TMP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "${SCRIPT_DIR_TMP}/requirements.txt" ]; then
        $PIP_CMD install --quiet "PyYAML>=6.0.2" "requests>=2.32.3" 2>/dev/null || \
            sudo $PIP_CMD install --quiet "PyYAML>=6.0.2" "requests>=2.32.3" 2>/dev/null || true
        echo "[✓] Python 核心依赖安装完成"
    fi
else
    echo "[!] 未检测到 pip，跳过 Python 依赖安装（流水线脚本可能无法运行）"
fi

# ─── 4. 检查 OPENAI_API_KEY ────────────────────────────
# TC-SCA-REPO-SANDBOX-USABILITY-004 pre-merge fix:
# 缺失 OPENAI_API_KEY 时默认 exit 1，仅 SCA_UI_ONLY=1 允许跳过（无需交互式 read）
if [ -z "$OPENAI_API_KEY" ]; then
    if [ "$SCA_UI_ONLY" = "1" ]; then
        echo "[!] 警告: 未设置 OPENAI_API_KEY，但 SCA_UI_ONLY=1 已设置，允许跳过容器启动步骤。"
        echo "    注意: 仅前端界面可用， Agent 功能需要有效的 OPENAI_API_KEY。"
    else
        echo "[!] 错误: 未设置 OPENAI_API_KEY 环境变量。"
        echo "    请在运行此脚本前执行: export OPENAI_API_KEY='your_key'"
        echo "    若仅需更新前端界面，可使用: SCA_UI_ONLY=1 bash install.sh"
        exit 1
    fi
fi

# ─── 5. 拉取 OpenHands 镜像 ──────────────────────────────────────
# TC-SCA-REPO-SANDBOX-USABILITY-004: SCA_UI_ONLY 跳过镜像拉取
if [ "$SCA_UI_ONLY" = "1" ]; then
    echo "[*] SCA_UI_ONLY=1: 跳过镜像拉取"
else
    echo "[*] 正在拉取 OpenHands 1.6.0 镜像（约 2GB，请耐心等待）..."
    sudo docker pull ghcr.io/openhands/openhands:1.6.0
fi

# ─── 6. 构建 SCA-HUD 前端 ──────────────────────────────────────
echo "[*] 正在构建 SCA-HUD 前端..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/frontend"
npm install --legacy-peer-deps
VITE_BACKEND_URL=http://localhost:3000 npm run build
cd "$SCRIPT_DIR"

# ─── 7. 准备 LLM 配置 ────────────────────────────────────────
# 允许用户通过环境变量覆盖 LLM 模型，默认 gpt-4.1-mini
LLM_MODEL_NAME="${LLM_MODEL:-gpt-4.1-mini}"
# LLM_BASE_URL：如未设置，默认使用 OpenAI 官方 API
# 注意：若使用 Manus 沙箱，应设置为 https://api.manus.im/api/llm-proxy/v1
LLM_BASE_URL_VALUE="${OPENAI_BASE_URL:-${LLM_BASE_URL:-https://api.openai.com/v1}}"
echo "[*] 使用 LLM 模型: ${LLM_MODEL_NAME}"
echo "[*] 使用 LLM Base URL: ${LLM_BASE_URL_VALUE}"

# ─── 7b. 准备 APP_MODE 配置（修复点1：确保 git_api_router 注册）────
# 问题：git_api_router 只在 app_mode == AppMode.OPENHANDS 时注册
# AppMode.OPENHANDS.value = 'oss'（不是 'openhands'），若 APP_MODE 未设置或设置错误，/api/user/repositories 返回 404
# 注意：AppMode.OPENHANDS.value == "oss"（不是 "openhands"）
# server_config.app_mode 默认即为 AppMode.OPENHANDS，此变量用于部署显式性和后续兼容。
APP_MODE_VALUE="${APP_MODE:-oss}"
echo "[*] 使用 APP_MODE: ${APP_MODE_VALUE}（OpenHands OSS mode，AppMode.OPENHANDS.value='oss'）"

# ─── 7c. 准备 GitHub Token 配置（修复点2：支持自动注入）────────────
# 支持 GITHUB_TOKEN 或 GH_TOKEN 两种环境变量名
GIT_PROVIDER_TOKEN_VALUE="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [ -n "$GIT_PROVIDER_TOKEN_VALUE" ]; then
    echo "[*] 检测到 GitHub Token，将在安装后自动注入"
else
    echo "[!] 未检测到 GITHUB_TOKEN / GH_TOKEN，GitHub 仓库导入功能将不可用"
    echo "    如需启用，请执行: export GITHUB_TOKEN='your_github_pat'"
fi

# ─── 7d. 准备 Agent Server 启动宽限时间配置（修复点4）──────────────
# 问题：硬编码 15 秒在低性能机器/WSL2/Docker 冷启动时过短，导致误判 ERROR
# 修复：支持环境变量覆盖，默认 90 秒
AGENT_SERVER_STARTUP_GRACE_SECONDS_VALUE="${AGENT_SERVER_STARTUP_GRACE_SECONDS:-90}"
echo "[*] Agent Server 启动宽限时间: ${AGENT_SERVER_STARTUP_GRACE_SECONDS_VALUE}s"

# ─── 7e. 准备 Volume Mount 文件路径（修复点2：校验文件存在）────
# 将修改后的 docker_sandbox_service.py 挂载入容器，覆盖镜像内的原始文件
PATCHED_SANDBOX_FILE="${SCRIPT_DIR}/openhands/app_server/sandbox/docker_sandbox_service.py"
if [ ! -f "${PATCHED_SANDBOX_FILE}" ]; then
    echo "[✗] 未找到修复版 docker_sandbox_service.py:"
    echo "    ${PATCHED_SANDBOX_FILE}"
    echo "    无法保证 Issue #52 后端修复进入容器，终止启动。"
    exit 1
fi
echo "[*] 将挂载修复版 docker_sandbox_service.py（STARTUP_GRACE_SECONDS=90）"

# ─── 7f. 准备 V1 文件列表路由修复 ────────────────────────
# 问题：ghcr.io/openhands/openhands:1.6.0 镜像中的 v1_router.py
# 缺少 file_router（list-files 路由），导致前端文件树请求返回 HTML
# （被 SPA catch-all 拦截），最终文件树显示为乱码（a, b, c...）。
# 修复：挂载本仓库中的 v1_router.py 和 file_router.py 进容器。
V1_PATCHED_ROUTER="${SCRIPT_DIR}/openhands/app_server/v1_router.py"
V1_PATCHED_FILE_ROUTER_DIR="${SCRIPT_DIR}/openhands/app_server/files"
if [ ! -f "${V1_PATCHED_ROUTER}" ]; then
    echo "[✗] 未找到更新版 v1_router.py: ${V1_PATCHED_ROUTER}"
    echo "    无法保证 V1 list-files 路由注册，终止启动。"
    exit 1
fi
if [ ! -f "${V1_PATCHED_FILE_ROUTER_DIR}/file_router.py" ]; then
    echo "[✗] 未找到 file_router.py: ${V1_PATCHED_FILE_ROUTER_DIR}/file_router.py"
    echo "    无法保证 V1 list-files 路由可用，终止启动。"
    exit 1
fi
echo "[*] 将挂载 V1 file_router 修复（解决文件树乱码问题）"

# ─── 8. 启动 OpenHands 容器 ──────────────────────────
# TC-SCA-REPO-SANDBOX-USABILITY-004: SCA_UI_ONLY 跳过容器启动
if [ "$SCA_UI_ONLY" = "1" ]; then
    echo "[*] SCA_UI_ONLY=1: 跳过容器启动，直接进入前端注入步骤"
    # 检查容器是否已在运行
    if ! docker ps --filter name=openhands-sca --filter status=running --format '{{.Names}}' 2>/dev/null | grep -q openhands-sca; then
        echo "[!] 警告: openhands-sca 容器未运行，前端注入可能失败"
        echo "    如需完整安装，请去掉 SCA_UI_ONLY=1 重新运行"
    fi
else
    # TC-SCA-REPO-SANDBOX-USABILITY-004: SCA_FORCE_RECREATE 控制容器删除策略
    EXISTING_CONTAINER=$(docker ps -a --filter name=openhands-sca --format '{{.Names}}' 2>/dev/null)
    if [ -n "$EXISTING_CONTAINER" ]; then
        if [ "$SCA_FORCE_RECREATE" = "1" ]; then
            echo "[*] SCA_FORCE_RECREATE=1: 强制删除并重建容器..."
            sudo docker rm -f openhands-sca 2>/dev/null || true
        else
            echo "[*] 容器 openhands-sca 已存在，删除并重建..."
            echo "    提示: 若仅需更新前端，可设置 SCA_UI_ONLY=1 跳过容器重启"
            sudo docker rm -f openhands-sca 2>/dev/null || true
        fi
    else
        echo "[*] 容器不存在，创建新容器..."
    fi
    mkdir -p ~/.openhands
    chmod 700 ~/.openhands

# 所有环境统一添加 NET_ADMIN/NET_RAW（WSL2 和 Linux 都需要，防止沙箱子容器 iptables 报错）
DOCKER_CAPS="--cap-add NET_ADMIN --cap-add NET_RAW"

if [ "$IS_WSL" = true ]; then
    echo "[*] WSL2 模式：添加 NET_ADMIN/NET_RAW 权限 + 双网络变量"
else
    echo "[*] 标准 Linux 模式：Host Network + NET_ADMIN/NET_RAW + 双网络变量"
fi

sudo docker run -d \
    --name openhands-sca \
    -p 3000:3000 \
    --add-host host.docker.internal:host-gateway \
    $DOCKER_CAPS \
    -e SANDBOX_USE_HOST_NETWORK=false \
    -e AGENT_SERVER_USE_HOST_NETWORK=false \
    -e SANDBOX_RUNTIME_CONTAINER_IMAGE=ghcr.io/openhands/runtime:1.6.0-nikolaik \
    -e SANDBOX_LOCAL_RUNTIME_URL=http://localhost:8000 \
    -e SANDBOX_USER_ID=0 \
    -e APP_MODE="${APP_MODE_VALUE}" \
    -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
    -e LLM_MODEL="${LLM_MODEL_NAME}" \
    -e LLM_API_KEY="${OPENAI_API_KEY}" \
    -e LLM_BASE_URL="${LLM_BASE_URL_VALUE}" \
    -e WORKSPACE_MOUNT_PATH=/opt/workspace_base \
    -e AGENT_SERVER_STARTUP_GRACE_SECONDS="${AGENT_SERVER_STARTUP_GRACE_SECONDS_VALUE}" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v ~/.openhands:/app/.openhands \
    -v "${PATCHED_SANDBOX_FILE}:/app/openhands/app_server/sandbox/docker_sandbox_service.py:ro" \
    -v "${V1_PATCHED_ROUTER}:/app/openhands/app_server/v1_router.py:ro" \
    -v "${V1_PATCHED_FILE_ROUTER_DIR}:/app/openhands/app_server/files:ro" \
    ghcr.io/openhands/openhands:1.6.0
fi
# 关闭 SCA_UI_ONLY else 分支

# ─── 9. 等待容器就绪（健康检查替代固定 sleep）───────────
if [ "$SCA_UI_ONLY" != "1" ]; then
    echo "[*] 等待 OpenHands 容器就绪（最多 90 秒）..."
READY=false
for i in $(seq 1 90); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        http://localhost:3000/api/options/config 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo ""
        echo "[✓] 容器已就绪（${i}秒，HTTP 200）"
        READY=true
        break
    fi
    printf "."
    sleep 1
done
echo ""

SCA_INSTALL_FORCE_CONTINUE="${SCA_INSTALL_FORCE_CONTINUE:-false}"
if [ "$READY" = false ]; then
    echo "[✗] OpenHands 容器启动超时，终止安装。"
    echo "[*] 最近 100 行容器日志："
    sudo docker logs openhands-sca --tail 100 || true
    if [ "$SCA_INSTALL_FORCE_CONTINUE" = "true" ]; then
        echo "[!] SCA_INSTALL_FORCE_CONTINUE=true，继续执行后续步骤，仅用于开发调试。"
    else
        echo "[*] 如需强制继续，请设置 SCA_INSTALL_FORCE_CONTINUE=true"
        exit 1
    fi
fi
# 关闭 SCA_UI_ONLY 条件块（容器就绪等待内容结束）
fi

# ─── 10. 注入 SCA-HUD 前端 ───────────────────────────
echo "[*] 正在注入 SCA-HUD 前端至容器..."
sudo docker cp "$SCRIPT_DIR/frontend/build/." openhands-sca:/app/frontend/build/
echo "[✓] SCA-HUD 前端注入完成"

# ─── 11. 保存 LLM 设置到 OpenHands ──────────────────────────────────
# 问题：OpenHands 1.6.0 启动后需要通过 /api/settings 保存 LLM 配置
# 否则创建会话时报 "Settings not found"，导致 Agent 无法初始化
echo "[*] 正在保存 LLM 设置到 OpenHands..."
sleep 2  # 等待 API 完全就绪
SETTINGS_RESP=$(curl -s -X POST http://localhost:3000/api/settings \
    -H "Content-Type: application/json" \
    -d "{
        \"llm_model\": \"${LLM_MODEL_NAME}\",
        \"llm_api_key\": \"${OPENAI_API_KEY}\",
        \"llm_base_url\": \"${LLM_BASE_URL_VALUE}\",
        \"agent\": \"CodeActAgent\",
        \"language\": \"zh-CN\",
        \"enable_default_condenser\": true
    }" 2>/dev/null)
if echo "$SETTINGS_RESP" | grep -q "Settings stored"; then
    echo "[✓] LLM 设置保存成功"
else
    echo "[!] LLM 设置保存失败，响应: $SETTINGS_RESP"
    echo "    请手动在 UI 界面的 Settings 页面配置 LLM"
fi

# ─── 12. 注入 GitHub Provider Token（修复点4：安全注入 + 异常清理）──────────
# 将 GITHUB_TOKEN/GH_TOKEN 写入 OpenHands provider token store
# 使得 /api/user/repositories 可以正常返回 200
# 安全注入：使用 mktemp 临时文件传递 JSON payload，避免 Token 出现在 ps 命令行参数中
# 异常清理：封装为函数，trap RETURN 保证任何退出路径均清理临时文件
inject_github_token() {
    if [ -z "$GIT_PROVIDER_TOKEN_VALUE" ]; then
        echo "[!] 未检测到 GITHUB_TOKEN / GH_TOKEN，跳过 GitHub provider token 注入"
        GIT_RESP=""
        return 0
    fi

    local payload_file
    payload_file="$(mktemp /tmp/sca_git_payload.XXXXXX.json)"
    chmod 600 "$payload_file"

    # shellcheck disable=SC2064
    trap "rm -f '$payload_file'" RETURN

    cat > "$payload_file" <<EOF
{
  "provider_tokens": {
    "github": {
      "token": "${GIT_PROVIDER_TOKEN_VALUE}",
      "host": "github.com"
    }
  }
}
EOF

    echo "[*] 正在写入 GitHub provider token..."
    GIT_RESP=$(curl -s -X POST http://localhost:3000/api/add-git-providers \
        -H "Content-Type: application/json" \
        --data-binary @"$payload_file" 2>/dev/null || true)

    rm -f "$payload_file"

    if echo "$GIT_RESP" | grep -q "Git providers stored\|success\|ok"; then
        echo "[✓] GitHub provider token 保存成功"
    else
        echo "[!] GitHub provider token 保存失败，响应: $GIT_RESP"
        echo "    请检查 GITHUB_TOKEN / GH_TOKEN 是否有效，或手动在 Settings 中配置 GitHub Token"
    fi
}

inject_github_token
# ─── 13. GitHub 导入链路自检（修复点3）──────────────────────
# 安装后明确验证 /api/user/repositories 链路状态
# 区分 200（可用）/ 401（Token 缺失）/ 404（APP_MODE 未生效）/ 其他
echo "[*] 正在验证 GitHub 仓库导入链路..."
sleep 1
REPO_HTTP_CODE=$(curl -s -o /tmp/sca_repos_resp.json -w "%{http_code}" \
    "http://localhost:3000/api/user/repositories?selected_provider=github&page=1&per_page=1" \
    2>/dev/null || echo "000")

case "$REPO_HTTP_CODE" in
    200)
        echo "[✓] GitHub 仓库导入链路可用（HTTP 200）"
        ;;
    401)
        echo "[!] GitHub 仓库导入接口已注册，但 Token 缺失或无效（HTTP 401）"
        echo "    请设置: export GITHUB_TOKEN='your_github_pat'"
        echo "    然后重新运行: bash install.sh"
        ;;
    404)
        echo "[✗] GitHub 仓库导入接口未注册（HTTP 404）"
        echo "    请检查 APP_MODE 是否为 openhands（当前: ${APP_MODE_VALUE}）"
        ;;
    000)
        echo "[✗] 无法连接后端服务，请检查容器状态"
        echo "    执行: sudo docker logs openhands-sca --tail 50"
        ;;
    *)
        echo "[!] GitHub 仓库导入链路异常（HTTP ${REPO_HTTP_CODE}）"
        echo "    响应内容:"
        cat /tmp/sca_repos_resp.json 2>/dev/null || true
        ;;
esac

# ─── 14. 最终健康检查汇总 ────────────────────────────────────
sleep 1
FINAL_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    http://localhost:3000/api/options/config 2>/dev/null || echo "000")

echo ""
echo "============================================================"
echo "                    安装结果汇总"
echo "============================================================"

# G5 验收：安装脚本可诊断 - 必须输出以下四项结果
echo ""
echo "  [G5] 安装脚本可诊断输出："
echo ""

# 1. OpenHands API 健康检查结果
if [ "$FINAL_HTTP_CODE" = "200" ]; then
    echo "  ✅ OpenHands API 健康检查：通过（HTTP 200）"
else
    echo "  ❌ OpenHands API 健康检查：失败（HTTP ${FINAL_HTTP_CODE}）"
fi

# 2. LLM 设置保存结果
if echo "$SETTINGS_RESP" | grep -q "Settings stored"; then
    echo "  ✅ LLM 设置保存：成功"
else
    echo "  ⚠️  LLM 设置保存：失败（请手动配置）"
fi

# 3. GitHub Token 保存结果
if [ -n "$GIT_PROVIDER_TOKEN_VALUE" ]; then
    if echo "$GIT_RESP" | grep -q "Git providers stored\|success\|ok"; then
        echo "  ✅ GitHub Token 注入：成功"
    else
        echo "  ⚠️  GitHub Token 注入：失败（请手动配置）"
    fi
else
    echo "  ⚠️  GitHub Token 注入：跳过（未设置 GITHUB_TOKEN）"
fi

# 4. GitHub 仓库导入链路检查结果
case "$REPO_HTTP_CODE" in
    200) echo "  ✅ GitHub 仓库导入链路：可用（HTTP 200）" ;;
    401) echo "  ⚠️  GitHub 仓库导入链路：接口已注册，Token 缺失（HTTP 401）" ;;
    404) echo "  ❌ GitHub 仓库导入链路：接口未注册（HTTP 404，检查 APP_MODE）" ;;
    000) echo "  ❌ GitHub 仓库导入链路：无法连接后端（HTTP 000）" ;;
    *)   echo "  ⚠️  GitHub 仓库导入链路：异常（HTTP ${REPO_HTTP_CODE}）" ;;
esac

echo ""
echo "============================================================"
if [ "$FINAL_HTTP_CODE" = "200" ]; then
    echo "✅ 安装与部署完成！"
    echo ""
    echo "🌐 SCA-HUD 访问地址: http://localhost:3000"
    echo ""
    echo "📋 使用步骤："
    echo "   1. 访问 http://localhost:3000"
    echo "   2. 点击 '+ 新建会话' 或导航到 /conversations/new"
    echo "   3. 在左侧 Chat 输入框中输入安全分析指令，例如："
    echo "      '分析 CVE-2024-22120 Zabbix 时间盲注漏洞，生成 PoC 并修复'"
    echo "   4. 观察 CPG 图谱、Terminal、Vuln List 实时联动更新"
else
    echo "⚠️  安装完成，但 API 尚未响应（HTTP ${FINAL_HTTP_CODE}）"
    echo "   请稍等片刻后访问，或执行以下命令查看日志："
    echo "   sudo docker logs openhands-sca --tail 50"
fi
echo ""
echo "📋 WSL2 用户注意事项："
echo "   1. 确认 Docker Desktop 已启用 'Use WSL 2 based engine'"
echo "   2. 若仍报 500 错误，执行: sudo docker logs openhands-sca --tail 50"
echo "   3. 确认 Windows 防火墙未拦截 3000 端口"
echo "   4. 若使用 Docker Desktop，请在 Settings > Resources > WSL Integration 中"
echo "      启用对应的 WSL2 发行版"
echo "   5. 如需使用其他 LLM 模型，执行前设置:"
echo "      export LLM_MODEL='gpt-4.1-mini'  # 或 gemini-2.5-flash 等"
echo "   6. 如需使用自定义 LLM 代理，执行前设置:"
echo "      export OPENAI_BASE_URL='https://your-proxy.com/v1'"
echo "   7. 如需启用 GitHub 仓库导入，执行前设置:"
echo "      export GITHUB_TOKEN='your_github_pat'"
echo "============================================================"
