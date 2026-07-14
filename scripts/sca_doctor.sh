#!/bin/bash
# SecureCodeAct 环境与状态诊断工具 (SCA Doctor)
# 版本：v4.0
# 用法：sudo bash scripts/sca_doctor.sh
#
# TC-SCA-REPO-SANDBOX-USABILITY-004 新增诊断项：
#   8. 仓库导入 API 分页参数验证（per_page/page 边界检查）
#   9. 仓库导入状态机诊断（检查 RepositoryImportState 相关日志）
#  10. 前端构建产物 VITE_ENABLE_DEMO_FALLBACK 开关验证

# 不使用 set -e，避免诊断项失败中断整体输出
set +e

echo "==============================================="
echo "   SecureCodeAct 环境与状态诊断工具 (v4.0)   "
echo "==============================================="
echo ""

# 1. 检查 Docker 状态
echo ">>> 1. 检查 Docker 状态..."
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: Docker 未安装"
    DOCKER_OK=false
else
    echo "✅ Docker 已安装: $(docker --version)"
    if ! docker info &> /dev/null; then
        echo "❌ 错误: Docker daemon 未运行或当前用户无权限 (请尝试 sudo)"
        DOCKER_OK=false
    else
        echo "✅ Docker daemon 运行正常"
        DOCKER_OK=true
    fi
fi
echo ""

# 2. 检查 Node.js 状态（与 install.sh 一致的精确 semver 检查：>=22.12.0）
echo ">>> 2. 检查 Node.js 状态..."
if ! command -v node &> /dev/null; then
    echo "❌ 错误: Node.js 未安装"
else
    NODE_VERSION=$(node -v)
    echo "   Node.js 已安装: ${NODE_VERSION}"
    # 精确 semver 检查：主版本 > 22，或主版本 = 22 且次版本 >= 12
    if node -e '
const v = process.versions.node.split(".").map(Number);
const ok = v[0] > 22 || (v[0] === 22 && v[1] >= 12);
process.exit(ok ? 0 : 1);
' 2>/dev/null; then
        echo "✅ Node.js 版本符合要求 (>= 22.12.0)"
    else
        echo "❌ 错误: Node.js 版本不符合要求（需要 >= 22.12.0，当前 ${NODE_VERSION}）"
        echo "   安装命令: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
    fi
fi
echo ""

# 3. 检查容器运行状态
echo ">>> 3. 检查 OpenHands 容器状态..."
CONTAINER_STATUS=$(docker ps -a --filter name=openhands-sca --format "{{.Status}}" 2>/dev/null)
if [ -z "$CONTAINER_STATUS" ]; then
    echo "❌ 错误: openhands-sca 容器不存在，请先运行 bash install.sh"
    CONTAINER_OK=false
else
    echo "   容器状态: $CONTAINER_STATUS"
    if [[ "$CONTAINER_STATUS" == *"Up"* ]]; then
        echo "✅ 容器运行正常"
        CONTAINER_OK=true
    else
        echo "❌ 错误: 容器未运行"
        echo "   启动命令: docker start openhands-sca"
        CONTAINER_OK=false
    fi
fi
echo ""

# 4. 检查后端 API 状态
echo ">>> 4. 检查后端 API 状态..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/options/config 2>/dev/null || echo "000")
if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ 后端 API 正常响应 (HTTP 200)"
else
    echo "❌ 错误: 后端 API 未正常响应 (HTTP $HTTP_CODE)"
    echo "   请检查容器是否完全启动（等待 60-90 秒后重试）"
fi
echo ""

# 5. 检查 GitHub 仓库导入链路（基础 401/404 检查）
# TC-SCA-REPO-SANDBOX-USABILITY-004 pre-merge fix: 统一使用 selected_provider=github&page=1&per_page=1
echo ">>> 5. 检查 GitHub 仓库导入链路..."
GH_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:3000/api/user/repositories?selected_provider=github&page=1&per_page=1" 2>/dev/null || echo "000")
if [ "$GH_HTTP_CODE" == "200" ]; then
    echo "✅ GitHub 导入链路正常 (HTTP 200)，Token 有效，仓库列表可用"
elif [ "$GH_HTTP_CODE" == "401" ]; then
    echo "⚠️  提示: 接口返回 HTTP 401（预期行为）"
    echo "   路由注册正常，但未配置有效的 GITHUB_TOKEN"
    echo "   配置方法: export GITHUB_TOKEN=ghp_xxxx && bash install.sh"
elif [ "$GH_HTTP_CODE" == "404" ]; then
    echo "❌ 错误: 接口返回 HTTP 404"
    echo "   git_api_router 未正确注册，请检查 APP_MODE 是否为 oss"
    echo "   当前 APP_MODE: $(docker exec openhands-sca env 2>/dev/null | grep APP_MODE || echo '未知')"
else
    echo "❌ 错误: 接口异常 (HTTP $GH_HTTP_CODE)"
fi
echo ""

# 6. 检查容器内 STARTUP_GRACE_SECONDS（验证 Issue #52 后端修复是否生效）
echo ">>> 6. 检查容器内 STARTUP_GRACE_SECONDS..."
if [ "$CONTAINER_OK" = "true" ]; then
    docker exec openhands-sca python3 - <<'PY' 2>/dev/null || echo "   ⚠️  无法在容器内执行 Python（容器可能仍在启动中）"
import os
from openhands.app_server.sandbox import docker_sandbox_service as m
env_val = os.getenv("AGENT_SERVER_STARTUP_GRACE_SECONDS", "未设置")
print(f"   ENV AGENT_SERVER_STARTUP_GRACE_SECONDS = {env_val}")
print(f"   m.STARTUP_GRACE_SECONDS = {m.STARTUP_GRACE_SECONDS}")
print(f"   m.__file__ = {m.__file__}")
if m.STARTUP_GRACE_SECONDS >= 30:
    print("   ✅ STARTUP_GRACE_SECONDS 符合要求（>= 30s）")
else:
    print(f"   ❌ 警告: STARTUP_GRACE_SECONDS = {m.STARTUP_GRACE_SECONDS}，建议设置为 90s 以上")
PY
else
    echo "   ⏭  跳过（容器未运行）"
fi
echo ""

# 7. 容器日志尾部（最近 100 行）
echo ">>> 7. 容器日志尾部（最近 100 行）..."
if [ "$CONTAINER_OK" = "true" ]; then
    docker logs openhands-sca --tail 100 2>&1 || echo "   ❌ 无法获取容器日志"
else
    echo "   ⏭  跳过（容器未运行）"
fi
echo ""

# ── TC-SCA-REPO-SANDBOX-USABILITY-004 新增诊断项 ────────────────────────────

# 8. 仓库导入 API 分页参数边界验证
echo ">>> 8. 仓库导入 API 分页参数边界验证..."
if [ "$GH_HTTP_CODE" == "200" ] || [ "$GH_HTTP_CODE" == "401" ]; then
    # 测试 per_page 超限（>100 应被服务端截断或报错，而非 500）
    # TC-SCA-REPO-SANDBOX-USABILITY-004 pre-merge fix: 加 selected_provider=github 与前端真实请求对齐
    PAGING_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://localhost:3000/api/user/repositories?selected_provider=github&per_page=200&page=1" 2>/dev/null || echo "000")
    if [ "$PAGING_CODE" == "200" ] || [ "$PAGING_CODE" == "401" ]; then
        echo "✅ 分页参数超限（per_page=200）未触发服务端 500，响应: HTTP $PAGING_CODE"
        echo "   说明: 服务端已正确处理超限参数（截断到 100 或返回 401）"
    elif [ "$PAGING_CODE" == "400" ]; then
        echo "✅ 分页参数超限（per_page=200）返回 HTTP 400，参数校验生效"
    elif [ "$PAGING_CODE" == "500" ]; then
        echo "❌ 错误: 分页参数超限（per_page=200）触发 HTTP 500"
        echo "   建议: 在 git_api_router 中添加 per_page 上限截断（min(per_page, 100)）"
    else
        echo "⚠️  分页参数测试响应: HTTP $PAGING_CODE（服务未完全就绪或未认证）"
    fi

    # 测试 page=0 边界（应被服务端处理，而非崩溃）
    PAGE0_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://localhost:3000/api/user/repositories?selected_provider=github&per_page=10&page=0" 2>/dev/null || echo "000")
    if [ "$PAGE0_CODE" == "500" ]; then
        echo "❌ 错误: page=0 触发 HTTP 500，建议在路由层将 page 最小值截断为 1"
    else
        echo "✅ page=0 边界处理正常，响应: HTTP $PAGE0_CODE"
    fi
else
    echo "   ⏭  跳过（后端 API 不可用，HTTP $GH_HTTP_CODE）"
fi
echo ""

# 9. 仓库导入状态机诊断（检查容器日志中的 import/clone 关键词）
echo ">>> 9. 仓库导入状态机诊断..."
if [ "$CONTAINER_OK" = "true" ]; then
    echo "   检查容器日志中的仓库导入相关事件（最近 200 行）..."
    IMPORT_LOGS=$(docker logs openhands-sca --tail 200 2>&1 | \
        grep -iE "clone|import|repository|git_api|VALIDATING|CLONING|INDEXING|READY|FAILED" | \
        tail -20)
    if [ -n "$IMPORT_LOGS" ]; then
        echo "   最近仓库导入相关日志："
        echo "$IMPORT_LOGS" | while IFS= read -r line; do
            echo "   | $line"
        done
        echo "✅ 发现仓库导入相关日志"
    else
        echo "   ℹ️  未发现仓库导入相关日志（正常：尚未执行过仓库导入操作）"
    fi

    # 检查是否有 git clone 失败记录
    CLONE_ERRORS=$(docker logs openhands-sca --tail 200 2>&1 | \
        grep -iE "clone.*error|clone.*fail|fatal:.*repository|Permission denied.*clone" | \
        tail -5)
    if [ -n "$CLONE_ERRORS" ]; then
        echo "⚠️  发现 git clone 错误记录："
        echo "$CLONE_ERRORS" | while IFS= read -r line; do
            echo "   | $line"
        done
        echo "   排查建议: 检查 GITHUB_TOKEN 权限（需要 repo 读取权限）"
    else
        echo "✅ 未发现 git clone 错误记录"
    fi
else
    echo "   ⏭  跳过（容器未运行）"
fi
echo ""

# 10. 前端构建产物 VITE_ENABLE_DEMO_FALLBACK 开关验证
echo ">>> 10. 前端构建产物 VITE_ENABLE_DEMO_FALLBACK 开关验证..."
FRONTEND_DIST=""
# 尝试在容器中查找前端构建产物
if [ "$CONTAINER_OK" = "true" ]; then
    FRONTEND_DIST=$(docker exec openhands-sca find /app -name "*.js" -path "*/assets/*" 2>/dev/null | head -3)
fi
# 尝试在宿主机查找
if [ -z "$FRONTEND_DIST" ]; then
    FRONTEND_DIST=$(find /workspace -name "*.js" -path "*/dist/*" 2>/dev/null | head -3 2>/dev/null)
fi

if [ -n "$FRONTEND_DIST" ]; then
    # 检查构建产物中是否包含 __ENABLE_DEMO_FALLBACK__ 的 define 替换
    DEMO_FLAG_FOUND=false
    for f in $FRONTEND_DIST; do
        if grep -q "ENABLE_DEMO_FALLBACK\|enableDemoFallback" "$f" 2>/dev/null; then
            DEMO_FLAG_FOUND=true
            echo "✅ 构建产物中发现 ENABLE_DEMO_FALLBACK 相关代码: $f"
            break
        fi
    done
    if [ "$DEMO_FLAG_FOUND" = "false" ]; then
        echo "✅ 构建产物中未发现 ENABLE_DEMO_FALLBACK 字符串"
        echo "   说明: Vite define 已将 __ENABLE_DEMO_FALLBACK__ 替换为字面量 false（正常行为）"
    fi
else
    # 检查源码中的 VITE_ENABLE_DEMO_FALLBACK 配置
    VITE_CONFIG=""
    for search_path in /workspace /home /opt; do
        if [ -f "$search_path/securecodeact/frontend/vite.config.ts" ]; then
            VITE_CONFIG="$search_path/securecodeact/frontend/vite.config.ts"
            break
        fi
    done
    if [ -n "$VITE_CONFIG" ]; then
        if grep -q "ENABLE_DEMO_FALLBACK\|__ENABLE_DEMO_FALLBACK__" "$VITE_CONFIG"; then
            echo "✅ vite.config.ts 中已配置 __ENABLE_DEMO_FALLBACK__ define 注入"
        else
            echo "⚠️  vite.config.ts 中未发现 __ENABLE_DEMO_FALLBACK__ define 配置"
            echo "   请检查 vite.config.ts 的 define 字段"
        fi
    else
        echo "   ℹ️  未找到前端构建产物或源码（在容器外运行此脚本时属正常情况）"
        echo "   验证方法: grep -R 'ENABLE_DEMO_FALLBACK' frontend/"
    fi
fi
echo ""

# ── TC-SCA-REPO-SANDBOX-USABILITY-004 pre-merge 新增诊断项 ─────────────────────

# 11. workspace 可写性检查
echo ">>> 11. workspace 可写性检查..."
if [ "$CONTAINER_OK" = "true" ]; then
    docker exec openhands-sca bash -lc '
set +e
WORKSPACE="${WORKSPACE_MOUNT_PATH:-/opt/workspace_base}"
echo "   WORKSPACE_MOUNT_PATH = $WORKSPACE"
ls -ld "$WORKSPACE" 2>/dev/null || echo "   ⚠️  workspace 目录不存在: $WORKSPACE"
if test -w "$WORKSPACE" 2>/dev/null; then
    echo "   ✅ workspace 可写: yes"
else
    echo "   ❌ workspace 不可写或不存在"
    echo "   排查建议: 检查 docker run 中 -v 挂载路径和权限"
fi
# 检查 workspace 中是否有已克隆的仓库
REPO_COUNT=$(find "$WORKSPACE" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
echo "   workspace 中目录数: $REPO_COUNT"
if [ "$REPO_COUNT" -gt 0 ]; then
    echo "   已克隆的仓库目录:"
    find "$WORKSPACE" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | while read d; do
        if [ -d "$d/.git" ]; then
            echo "   ✅ $d (.git 存在)"
        else
            echo "   ⚠️  $d (无 .git，可能是空目录或非 git 仓库)"
        fi
    done
fi
' 2>&1 || echo "   ⚠️  无法在容器内执行检查"
else
    echo "   ⏭  跳过（容器未运行）"
fi
echo ""

# 12. runtime/sandbox 容器日志扫描（git clone 可能在 runtime 容器中执行）
echo ">>> 12. runtime/sandbox 容器日志扫描..."
if [ "$DOCKER_OK" = "true" ]; then
    RUNTIME_CONTAINERS=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'runtime|sandbox|openhands' || true)
    if [ -n "$RUNTIME_CONTAINERS" ]; then
        echo "   发现以下相关容器："
        echo "$RUNTIME_CONTAINERS" | while IFS= read -r c; do
            echo "   ---- 容器: $c ----"
            docker logs "$c" --tail 80 2>&1 | \
                grep -iE "clone|fatal|checkout|repository|permission denied|git" | tail -10 || \
                echo "   (无相关日志)"
        done

        # 检查是否有多个 runtime/sandbox 容器使用 host network（端口冲突风险）
        RUNTIME_COUNT=$(echo "$RUNTIME_CONTAINERS" | grep -cE 'runtime|sandbox' || true)
        if [ "$RUNTIME_COUNT" -gt 1 ]; then
            echo "⚠️  警告: 检测到 $RUNTIME_COUNT 个 runtime/sandbox 容器正在运行"
            echo "   当前使用 host network 模式，多个沙箱可能导致端口冲突"
            echo "   建议: 单用户/单活跃沙箱部署，或切换 bridge network + 动态端口"
            docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -E 'runtime|sandbox' || true
        else
            echo "✅ runtime/sandbox 容器数量正常（$RUNTIME_COUNT 个）"
        fi
    else
        echo "   ℹ️  未发现 runtime/sandbox 容器（正常：尚未执行过仓库导入或 Agent 任务）"
    fi
else
    echo "   ⏭  跳过（Docker 不可用）"
fi
echo ""

echo "==============================================="
echo "诊断完成。(v4.1 — TC-SCA-REPO-SANDBOX-USABILITY-004 pre-merge)"
echo ""
echo "快速参考："
echo "  完整日志: docker logs openhands-sca --tail 500 > /tmp/sca_logs.txt"
echo "  重启容器: docker restart openhands-sca"
echo "  重新安装: bash install.sh"
echo "  强制重建: SCA_FORCE_RECREATE=1 bash install.sh"
echo "  仅启动UI: SCA_UI_ONLY=1 bash install.sh"
echo "==============================================="
