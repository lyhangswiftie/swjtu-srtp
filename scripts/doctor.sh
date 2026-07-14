#!/usr/bin/env bash
# doctor.sh — SecureCodeAct 环境健康检查脚本
# TC-SCA-017 版本基线收敛
set -e

PASS=0
WARN=0
FAIL=0

check() {
    local name="$1"
    local cmd="$2"
    local expected="$3"
    local actual
    actual=$(eval "$cmd" 2>/dev/null || echo "NOT_FOUND")
    if echo "$actual" | grep -q "$expected"; then
        echo "  [PASS] $name: $actual"
        PASS=$((PASS+1))
    else
        echo "  [WARN] $name: 期望 $expected，实际 $actual"
        WARN=$((WARN+1))
    fi
}

echo "============================================================"
echo "  SecureCodeAct 环境健康检查 (doctor.sh)"
echo "============================================================"

echo ""
echo "[1] Docker 版本检查"
check "Docker" "docker --version" "Docker version"

echo ""
echo "[2] Node.js 版本检查（要求 >=22.12.0）"
NODE_VER=$(node --version 2>/dev/null | sed 's/v//' || echo "NOT_FOUND")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -ge 22 ] 2>/dev/null; then
    echo "  [PASS] Node.js: v$NODE_VER"
    PASS=$((PASS+1))
else
    echo "  [WARN] Node.js: 期望 >=22.12.0，实际 v$NODE_VER"
    WARN=$((WARN+1))
fi

echo ""
echo "[3] Python 版本检查（推荐 >=3.12，前端基线不强制）"
PY_VER=$(python3 --version 2>/dev/null | awk '{print $2}' || echo "NOT_FOUND")
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 11 ] 2>/dev/null; then
    echo "  [PASS] Python: $PY_VER（>=3.11 满足前端基线）"
    PASS=$((PASS+1))
else
    echo "  [WARN] Python: 期望 >=3.11，实际 $PY_VER"
    WARN=$((WARN+1))
fi

echo ""
echo "[4] 前端 package.json 版本检查"
if [ -f "frontend/package.json" ]; then
    PKG_VER=$(python3 -c "import json; d=json.load(open('frontend/package.json')); print(d.get('version','?'))" 2>/dev/null)
    echo "  [PASS] frontend/package.json version: $PKG_VER"
    PASS=$((PASS+1))
else
    echo "  [FAIL] frontend/package.json 不存在"
    FAIL=$((FAIL+1))
fi

echo ""
echo "[5] OPENAI_API_KEY 环境变量检查"
if [ -n "$OPENAI_API_KEY" ]; then
    echo "  [PASS] OPENAI_API_KEY 已设置"
    PASS=$((PASS+1))
else
    echo "  [WARN] OPENAI_API_KEY 未设置，请在运行 install.sh 前设置"
    WARN=$((WARN+1))
fi

echo ""
echo "[6] install.sh SANDBOX_LOCAL_RUNTIME_URL 端口检查"
if grep -q "SANDBOX_LOCAL_RUNTIME_URL=http://localhost:8000" install.sh 2>/dev/null; then
    echo "  [PASS] install.sh SANDBOX_LOCAL_RUNTIME_URL 已包含 :8000 端口"
    PASS=$((PASS+1))
else
    echo "  [FAIL] install.sh SANDBOX_LOCAL_RUNTIME_URL 缺少 :8000 端口，可能导致沙箱 120s 超时"
    FAIL=$((FAIL+1))
fi

echo ""
echo "============================================================"
echo "  结果: PASS=$PASS  WARN=$WARN  FAIL=$FAIL"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
