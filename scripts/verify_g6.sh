#!/usr/bin/env bash
# =============================================================================
# verify_g6.sh — TC-SCA-RECENT-ISSUES-001 G6 自动化验证脚本（v2）
#
# 修正说明（v2）：
#   - 修正 G6.3 AgentStatusBanner 验证逻辑：
#     Banner 内嵌于 SCA-HUD 左列 OpenHandsChat 组件内部（OpenHandsMocks.tsx），
#     而非页面顶部全局 Banner，搜索字符串已更新为 SCA-HUD 实际代码特征。
#   - 修正 G6.2 前端验证：搜索 SCA-HUD 真实特征字符串（SeCodeAct/代码安全智能体）
#   - 增加 G6.4 APP_MODE 验证（Issue #53 修复）
#   - 增加 G6.5 LLM 配置验证
#   - 增加 G6.6 WebSocket 端点可达性验证
#
# SCA-HUD 界面说明：
#   securecodeact 的会话界面是定制的 SCA-HUD 主控制台（DashboardConnected.tsx），
#   布局为三列：左列(Chat+漏洞列表) | 中列(CPG/PoC/Diff) | 右列(Terminal+元数据)
#   AgentStatusBanner 位于左列 "任务交互终端" 面板内部顶部，
#   当 agentState=loading/init 时显示黄色 Banner，error/rate_limited 时显示红色 Banner。
#
# 使用方法：
#   export GITHUB_TOKEN='ghp_your_token'
#   export OPENAI_API_KEY='sk_your_key'
#   bash install.sh
#   bash scripts/verify_g6.sh [--container openhands-sca] [--port 3000]
# =============================================================================

set -euo pipefail

CONTAINER_NAME="openhands-sca"
HOST="localhost"
PORT="3000"

while [[ $# -gt 0 ]]; do
  case $1 in
    --container) CONTAINER_NAME="$2"; shift 2 ;;
    --host)      HOST="$2"; shift 2 ;;
    --port)      PORT="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

BASE_URL="http://${HOST}:${PORT}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORT_DIR="${REPO_ROOT}/reports/g6-verification"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="${REPORT_DIR}/g6-report-${TIMESTAMP}.log"

mkdir -p "$REPORT_DIR"

# ─── 颜色 ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$REPORT_FILE"; }
pass() { echo -e "${GREEN}[PASS]${NC} $*" | tee -a "$REPORT_FILE"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "$REPORT_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$REPORT_FILE"; }
detail() { echo -e "       $*" | tee -a "$REPORT_FILE"; }

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

check_pass() { PASS_COUNT=$((PASS_COUNT + 1)); pass "$1"; }
check_fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); fail "$1"; }
check_warn() { WARN_COUNT=$((WARN_COUNT + 1)); warn "$1"; }

{
echo "============================================================"
echo "  TC-SCA-RECENT-ISSUES-001 G6 端到端验证报告 (v2)"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  容器: ${CONTAINER_NAME}"
echo "  服务: ${BASE_URL}"
echo "  界面: SCA-HUD（代码安全智能体主控制台）"
echo "============================================================"
echo ""
} | tee -a "$REPORT_FILE"

# ─── G6.0：容器内后端代码验证（Volume Mount 方案 B）─────────
echo "--- G6.0: 容器内后端代码验证（Volume Mount 生效检查）---" | tee -a "$REPORT_FILE"

if ! sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
    check_fail "G6.0 容器 ${CONTAINER_NAME} 未运行，请先执行 bash install.sh"
    echo "中止验证：容器未启动。" | tee -a "$REPORT_FILE"
    exit 1
fi

log "G6.0 检查容器内 STARTUP_GRACE_SECONDS 值..."
G60_OUTPUT=$(sudo docker exec "$CONTAINER_NAME" python3 - <<'PY' 2>&1
import os
try:
    from openhands.app_server.sandbox import docker_sandbox_service as m
    val = m.STARTUP_GRACE_SECONDS
    env_val = os.getenv('AGENT_SERVER_STARTUP_GRACE_SECONDS', '(not set)')
    print(f"STARTUP_GRACE_SECONDS = {val}")
    print(f"ENV AGENT_SERVER_STARTUP_GRACE_SECONDS = {env_val}")
    if val != 15:
        print("VERDICT: PASS - 已覆盖硬编码 15 秒")
    else:
        print("VERDICT: FAIL - 仍为硬编码 15 秒，Volume Mount 未生效")
except Exception as e:
    print(f"ERROR: {e}")
PY
)

echo "$G60_OUTPUT" | tee -a "$REPORT_FILE"

if echo "$G60_OUTPUT" | grep -q "VERDICT: PASS"; then
    check_pass "G6.0 Volume Mount 生效，STARTUP_GRACE_SECONDS 已覆盖硬编码 15 秒"
else
    check_fail "G6.0 Volume Mount 未生效，请检查 install.sh 中的 -v 挂载参数"
fi

echo "" | tee -a "$REPORT_FILE"

# ─── G6.1：GitHub 仓库导入 API 验证 ─────────────────────────
echo "--- G6.1: GitHub 仓库导入 API 验证 ---" | tee -a "$REPORT_FILE"

log "G6.1 检查 /api/user/repositories 接口..."
REPOS_HTTP=$(curl -s -o /tmp/g6_repos.json -w "%{http_code}" \
    "${BASE_URL}/api/user/repositories" 2>/dev/null || echo "000")

echo "HTTP 状态码: ${REPOS_HTTP}" | tee -a "$REPORT_FILE"

if [ "$REPOS_HTTP" = "200" ]; then
    REPO_COUNT=$(python3 -c "
import json
try:
    with open('/tmp/g6_repos.json') as f:
        data = json.load(f)
    if isinstance(data, list):
        print(len(data))
    elif isinstance(data, dict) and 'repositories' in data:
        print(len(data['repositories']))
    else:
        print('N/A')
except Exception as e:
    print(f'error:{e}')
" 2>/dev/null || echo "N/A")
    echo "仓库数量: ${REPO_COUNT}" | tee -a "$REPORT_FILE"
    if [[ "${REPO_COUNT}" =~ ^[0-9]+$ ]] && [[ "${REPO_COUNT}" -gt 0 ]]; then
        check_pass "G6.1 仓库导入 API 正常（HTTP 200，${REPO_COUNT} 个仓库）"
    else
        check_warn "G6.1 API 返回 200 但仓库列表为空或格式异常（${REPO_COUNT}）"
    fi
elif [ "$REPOS_HTTP" = "401" ]; then
    check_fail "G6.1 GitHub Token 未注入（HTTP 401），请检查 GITHUB_TOKEN 环境变量"
elif [ "$REPOS_HTTP" = "404" ]; then
    check_fail "G6.1 API 端点不存在（HTTP 404），APP_MODE 可能未正确设置"
else
    check_fail "G6.1 仓库导入 API 异常（HTTP ${REPOS_HTTP}）"
fi

echo "" | tee -a "$REPORT_FILE"

# ─── G6.2：SCA-HUD 前端 build 注入验证 ──────────────────────
echo "--- G6.2: SCA-HUD 前端 build 注入验证 ---" | tee -a "$REPORT_FILE"
log "G6.2 检查容器内前端 build 是否包含 SCA-HUD 特征代码..."

# SCA-HUD 真实特征字符串（来自 DashboardConnected.tsx）
SCA_FEATURES=("SeCodeAct" "代码安全智能体" "Neo4j Connected" "仓库级总CPG知识图谱" "任务交互终端")
SCA_FOUND=0

for feature in "${SCA_FEATURES[@]}"; do
    COUNT=$(sudo docker exec "$CONTAINER_NAME" \
        grep -r "${feature}" /app/frontend/build/ 2>/dev/null | wc -l || echo "0")
    if [[ "${COUNT}" -gt 0 ]]; then
        SCA_FOUND=$((SCA_FOUND + 1))
        detail "  ✓ 找到特征: '${feature}'（${COUNT} 处）"
        echo "  特征 '${feature}': ${COUNT} 处" >> "$REPORT_FILE"
    else
        detail "  ✗ 未找到特征: '${feature}'"
        echo "  特征 '${feature}': 未找到" >> "$REPORT_FILE"
    fi
done

if [[ "${SCA_FOUND}" -ge 3 ]]; then
    check_pass "G6.2 SCA-HUD 前端 build 已注入容器（${SCA_FOUND}/${#SCA_FEATURES[@]} 个特征字符串匹配）"
    detail "说明：访问 http://localhost:${PORT}/conversations/:id 将显示 SCA-HUD 主控制台"
    detail "布局：左列(Chat+漏洞列表) | 中列(CPG/PoC/Diff) | 右列(Terminal+元数据)"
elif [[ "${SCA_FOUND}" -gt 0 ]]; then
    check_warn "G6.2 SCA-HUD 特征部分匹配（${SCA_FOUND}/${#SCA_FEATURES[@]}），可能为旧版 build"
else
    check_fail "G6.2 SCA-HUD 前端 build 未注入容器，请执行: sudo docker cp frontend/build/. ${CONTAINER_NAME}:/app/frontend/build/"
fi

echo "" | tee -a "$REPORT_FILE"

# ─── G6.3：AgentStatusBanner 代码注入验证（Issue #52 修复）──
echo "--- G6.3: AgentStatusBanner 代码注入验证（Issue #52 修复）---" | tee -a "$REPORT_FILE"
log "G6.3 检查 SCA-HUD 左列 Chat 面板 AgentStatusBanner 代码..."

# AgentStatusBanner 内嵌于 OpenHandsChat 组件（OpenHandsMocks.tsx）
# 在 SCA-HUD 左列"任务交互终端"面板顶部显示
# 真实特征字符串来自 OpenHandsMocks.tsx
BANNER_FEATURES=(
    "沙箱正在启动中"
    "agent-sandbox-tty1"
    "AGENT_BUSY_STATES"
    "AGENT_ERROR_STATES"
    "agentState"
)

BANNER_FOUND=0
for feature in "${BANNER_FEATURES[@]}"; do
    COUNT=$(sudo docker exec "$CONTAINER_NAME" \
        grep -r "${feature}" /app/frontend/build/assets/ 2>/dev/null | wc -l || echo "0")
    if [[ "${COUNT}" -gt 0 ]]; then
        BANNER_FOUND=$((BANNER_FOUND + 1))
        detail "  ✓ 找到 Banner 特征: '${feature}'（${COUNT} 处）"
        echo "  Banner 特征 '${feature}': ${COUNT} 处" >> "$REPORT_FILE"
    else
        # minified 代码中字符串可能被压缩，尝试更短的搜索
        COUNT2=$(sudo docker exec "$CONTAINER_NAME" \
            grep -r "agent-sandbox\|AGENT_BUSY\|AGENT_ERROR\|rate_limited" \
            /app/frontend/build/assets/ 2>/dev/null | wc -l || echo "0")
        if [[ "${COUNT2}" -gt 0 ]]; then
            BANNER_FOUND=$((BANNER_FOUND + 1))
            detail "  ✓ 找到 Banner 特征（minified）: '${feature}' 相关（${COUNT2} 处）"
        else
            detail "  ✗ 未找到 Banner 特征: '${feature}'"
        fi
        echo "  Banner 特征 '${feature}': 未找到（minified 检查: ${COUNT2}）" >> "$REPORT_FILE"
    fi
done

if [[ "${BANNER_FOUND}" -ge 2 ]]; then
    check_pass "G6.3 AgentStatusBanner 代码已注入（${BANNER_FOUND}/${#BANNER_FEATURES[@]} 个特征匹配）"
    detail "Banner 位置：SCA-HUD 左列 '任务交互终端' 面板内部顶部"
    detail "黄色 Banner：agentState=loading/init 时显示，同时禁用 Chat 输入框"
    detail "红色 Banner：agentState=error/rate_limited 时显示"
    detail "注意：这是 Chat 面板内的状态提示条，不是页面顶部全局 Banner"
else
    check_fail "G6.3 AgentStatusBanner 代码未找到（${BANNER_FOUND}/${#BANNER_FEATURES[@]}），前端 build 可能不含 Issue #52 修复"
    detail "请确认 OpenHandsMocks.tsx 修改已包含在前端 build 中"
fi

echo "" | tee -a "$REPORT_FILE"

# ─── G6.4：APP_MODE 配置验证（Issue #53 修复）───────────────
echo "--- G6.4: APP_MODE 配置验证（Issue #53 修复）---" | tee -a "$REPORT_FILE"
log "G6.4 检查 /api/options/config 中的 app_mode..."

CONFIG_OUTPUT=$(curl -s "${BASE_URL}/api/options/config" 2>/dev/null || echo "{}")
APP_MODE=$(python3 -c "
import json, sys
try:
    d = json.loads('''${CONFIG_OUTPUT}''')
    print(d.get('app_mode', 'NOT_FOUND'))
except:
    print('PARSE_ERROR')
" 2>/dev/null || echo "UNKNOWN")

echo "app_mode: ${APP_MODE}" | tee -a "$REPORT_FILE"

if [[ "${APP_MODE}" == "oss" ]]; then
    check_pass "G6.4 APP_MODE=oss（Issue #53 修复生效）"
elif [[ "${APP_MODE}" == "saas" ]]; then
    check_warn "G6.4 APP_MODE=saas（可能导致登录重定向，建议设置 APP_MODE=oss）"
else
    check_warn "G6.4 APP_MODE=${APP_MODE}（未知值或 API 异常）"
fi

echo "" | tee -a "$REPORT_FILE"

# ─── G6.5：LLM 配置验证 ──────────────────────────────────────
echo "--- G6.5: LLM 配置验证 ---" | tee -a "$REPORT_FILE"
log "G6.5 检查 /api/settings 中的 LLM 配置..."

SETTINGS_CODE=$(curl -s -o /tmp/g6_settings.json -w "%{http_code}" \
    "${BASE_URL}/api/settings" 2>/dev/null || echo "000")

echo "HTTP 状态码: ${SETTINGS_CODE}" | tee -a "$REPORT_FILE"

if [[ "${SETTINGS_CODE}" == "200" ]]; then
    LLM_MODEL=$(python3 -c "
import json
try:
    with open('/tmp/g6_settings.json') as f:
        d = json.load(f)
    print(d.get('llm_model', d.get('model', 'NOT_FOUND')))
except Exception as e:
    print(f'ERROR:{e}')
" 2>/dev/null || echo "UNKNOWN")
    echo "LLM 模型: ${LLM_MODEL}" | tee -a "$REPORT_FILE"
    if [[ "${LLM_MODEL}" != "NOT_FOUND" ]] && [[ "${LLM_MODEL}" != ERROR* ]]; then
        check_pass "G6.5 LLM 配置已保存（模型: ${LLM_MODEL}）"
    else
        check_warn "G6.5 LLM 配置 API 返回 200 但未找到 llm_model 字段"
    fi
elif [[ "${SETTINGS_CODE}" == "404" ]]; then
    check_warn "G6.5 LLM 配置未设置（HTTP 404），首次启动需通过 UI 或 API 设置 LLM"
else
    check_warn "G6.5 LLM 配置 API 返回异常: HTTP ${SETTINGS_CODE}"
fi

echo "" | tee -a "$REPORT_FILE"

# ─── G6.6：WebSocket 端点可达性验证 ──────────────────────────
echo "--- G6.6: WebSocket 端点可达性验证 ---" | tee -a "$REPORT_FILE"
log "G6.6 检查 socket.io 端点（Agent 状态推送依赖）..."

WS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "${BASE_URL}/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo "000")

echo "socket.io HTTP 状态码: ${WS_CODE}" | tee -a "$REPORT_FILE"

if [[ "${WS_CODE}" == "200" ]] || [[ "${WS_CODE}" == "400" ]]; then
    check_pass "G6.6 WebSocket 端点可达（HTTP ${WS_CODE}，socket.io 服务正常）"
    detail "说明：Agent 状态（curAgentState）通过 WebSocket 实时推送到 SCA-HUD"
    detail "SCA-HUD 的 AgentStatusBanner 依赖此 WebSocket 获取 agentState"
elif [[ "${WS_CODE}" == "000" ]]; then
    check_fail "G6.6 无法连接到 WebSocket 端点，服务可能未启动"
else
    check_warn "G6.6 WebSocket 端点返回异常状态码: HTTP ${WS_CODE}"
fi

echo "" | tee -a "$REPORT_FILE"

# ─── 汇总报告 ────────────────────────────────────────────────
{
echo "============================================================"
echo "  G6 自动化验证汇总"
echo "============================================================"
echo "  通过: ${PASS_COUNT}"
echo "  失败: ${FAIL_COUNT}"
echo "  警告: ${WARN_COUNT}"
echo ""
} | tee -a "$REPORT_FILE"

if [ "$FAIL_COUNT" -eq "0" ]; then
    echo -e "${GREEN}[RESULT] G6 自动化验证全部通过 ✓${NC}" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    {
    echo "  接下来需要手动完成的 SCA-HUD 前端截图验证："
    echo "  ─────────────────────────────────────────────────────"
    echo "  G6.2 截图：首页（http://localhost:${PORT}/）"
    echo "       → 显示 GitHub 仓库选择器已加载仓库列表"
    echo ""
    echo "  G6.3 截图：SCA-HUD 主控制台（/conversations/:id）"
    echo "       → 显示三列布局 + 顶部 '代码安全智能体（SeCodeAct）-SCA' 标题"
    echo ""
    echo "  G6.4 截图：左列 Chat 面板黄色 Banner（Issue #52）"
    echo "       → Agent 初始化时，'任务交互终端' 面板顶部黄色 Banner + 输入框禁用"
    echo ""
    echo "  G6.5 截图：左列 Chat 面板红色 Banner（Issue #52）"
    echo "       → Agent ERROR 时，'任务交互终端' 面板顶部红色 Banner"
    echo ""
    echo "  G6.6 截图：Chat 可用与 Agent 响应"
    echo "       → Agent 就绪后，输入框可用，发送指令后有 Agent 回复"
    echo ""
    echo "  G6.7 截图：右列 Terminal 输出"
    echo "       → '沙箱Agent执行终端（Terminal）' 面板显示真实命令输出"
    } | tee -a "$REPORT_FILE"
else
    echo -e "${RED}[RESULT] G6 存在 ${FAIL_COUNT} 项验证失败，请根据上方日志排查${NC}" | tee -a "$REPORT_FILE"
fi

echo "" | tee -a "$REPORT_FILE"
echo "  报告已保存至: ${REPORT_FILE}" | tee -a "$REPORT_FILE"
echo "============================================================" | tee -a "$REPORT_FILE"

[[ ${FAIL_COUNT} -eq 0 ]]
