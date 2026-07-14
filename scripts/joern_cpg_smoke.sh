#!/usr/bin/env bash
# scripts/joern_cpg_smoke.sh
#
# TC-SCA-019: Joern CPG Smoke Test
# 用法: bash scripts/joern_cpg_smoke.sh <source_file>
#
# 流程:
#   Step 1: c2cpg.sh (或 joern-parse) → 生成 CPG bin
#   Step 2: joern-export → 导出 DOT 格式
#   Step 3: cpg_to_json.py → 转换为 SCA CPG JSON
#   输出: SCA_CPG_JSON:{...}
#
# 失败处理:
#   如果 joern 工具链不存在，输出 [SCA-019][ERROR] 并退出非 0

set -euo pipefail

# ── 参数解析 ──────────────────────────────────────────────────────────────────
SOURCE_FILE="${1:-}"

if [[ -z "$SOURCE_FILE" ]]; then
    echo "[SCA-019][ERROR] Usage: bash scripts/joern_cpg_smoke.sh <source_file>"
    exit 1
fi

if [[ ! -f "$SOURCE_FILE" ]]; then
    echo "[SCA-019][ERROR] Source file not found: $SOURCE_FILE"
    exit 1
fi

# ── 路径配置 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="$REPO_ROOT/reports/TC-SCA-019"
EVIDENCE_DIR="$REPO_ROOT/evidence/TC-SCA-019"

mkdir -p "$REPORT_DIR" "$EVIDENCE_DIR"

# 工作目录（临时）
WORK_DIR="$(mktemp -d /tmp/sca-019-XXXXXX)"
CPG_BIN="$WORK_DIR/cpg.bin"
DOT_EXPORT_DIR="$WORK_DIR/cpg-dot-export"
OUTPUT_JSON="$REPORT_DIR/joern-cpg.json"

echo "[SCA-019] =============================================="
echo "[SCA-019] TC-SCA-019 Joern CPG Smoke Test"
echo "[SCA-019] 源码文件: $SOURCE_FILE"
echo "[SCA-019] 工作目录: $WORK_DIR"
echo "[SCA-019] 报告目录: $REPORT_DIR"
echo "[SCA-019] =============================================="

# ── 设置 Java 17（Joern 最新版需要 Java 17+）────────────────────────────────
if [[ -d "/usr/lib/jvm/java-17-openjdk-amd64" ]]; then
    export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
    export PATH="$JAVA_HOME/bin:$PATH"
fi
echo "[SCA-019] Java 版本: $(java -version 2>&1 | head -1)"

# ── 检查 Joern 工具链 ─────────────────────────────────────────────────────────
JOERN_HOME="${JOERN_HOME:-/opt/joern-cli}"
JOERN_C2CPG="${JOERN_HOME}/c2cpg.sh"
JOERN_EXPORT="${JOERN_HOME}/joern-export"

if [[ ! -x "$JOERN_C2CPG" ]]; then
    echo "[SCA-019][ERROR] c2cpg.sh not found at $JOERN_C2CPG"
    echo "[SCA-019][HINT] Please set JOERN_HOME or install Joern from:"
    echo "[SCA-019][HINT] https://github.com/joernio/joern/releases"
    rm -rf "$WORK_DIR"
    exit 1
fi

if [[ ! -x "$JOERN_EXPORT" ]]; then
    echo "[SCA-019][ERROR] joern-export not found at $JOERN_EXPORT"
    rm -rf "$WORK_DIR"
    exit 1
fi

echo "[SCA-019] Joern 工具链: $JOERN_HOME"

# ── Step 1: c2cpg.sh 解析 C 源码 ─────────────────────────────────────────────
echo ""
echo "[SCA-019] Step 1: c2cpg.sh 解析"
echo "[SCA-019]   输入: $SOURCE_FILE"
echo "[SCA-019]   输出: $CPG_BIN"

# c2cpg.sh 需要目录输入，创建临时目录
SRC_DIR="$(mktemp -d /tmp/sca-019-src-XXXXXX)"
cp "$SOURCE_FILE" "$SRC_DIR/"

"$JOERN_C2CPG" \
    -o "$CPG_BIN" \
    "$SRC_DIR" 2>&1 | while IFS= read -r line; do
    echo "[SCA-019][c2cpg] $line"
done

rm -rf "$SRC_DIR"

if [[ ! -f "$CPG_BIN" ]]; then
    echo "[SCA-019][ERROR] c2cpg.sh failed: CPG bin not generated"
    rm -rf "$WORK_DIR"
    exit 1
fi

CPG_SIZE=$(du -sh "$CPG_BIN" | cut -f1)
echo "[SCA-019] Step 1 完成: CPG bin 生成 ($CPG_SIZE)"

# ── Step 2: joern-export ──────────────────────────────────────────────────────
echo ""
echo "[SCA-019] Step 2: joern-export"
echo "[SCA-019]   输入: $CPG_BIN"
echo "[SCA-019]   输出: $DOT_EXPORT_DIR"
echo "[SCA-019]   格式: DOT (Cpg14)"

"$JOERN_EXPORT" \
    --repr cpg14 \
    --format dot \
    -o "$DOT_EXPORT_DIR" \
    "$CPG_BIN" 2>&1 | while IFS= read -r line; do
    echo "[SCA-019][joern-export] $line"
done

DOT_COUNT=$(find "$DOT_EXPORT_DIR" -name "*.dot" 2>/dev/null | wc -l)
if [[ "$DOT_COUNT" -eq 0 ]]; then
    echo "[SCA-019][ERROR] joern-export failed: no DOT files generated"
    rm -rf "$WORK_DIR"
    exit 1
fi

echo "[SCA-019] Step 2 完成: 生成 $DOT_COUNT 个 DOT 文件"

# 复制 DOT 文件到报告目录
DOT_REPORT_DIR="$REPORT_DIR/cpg-dot-export"
rm -rf "$DOT_REPORT_DIR"
cp -r "$DOT_EXPORT_DIR" "$DOT_REPORT_DIR"
echo "[SCA-019]   DOT 文件已保存到: $DOT_REPORT_DIR"

# ── Step 3: cpg_to_json.py ────────────────────────────────────────────────────
echo ""
echo "[SCA-019] Step 3: cpg_to_json.py"
echo "[SCA-019]   DOT 目录: $DOT_EXPORT_DIR"
echo "[SCA-019]   输出 JSON: $OUTPUT_JSON"

# 提取 CVE ID（从文件路径推断）
CVE_ID="CVE-2024-22120"
if echo "$SOURCE_FILE" | grep -qiP 'cve-\d{4}-\d+'; then
    CVE_ID=$(echo "$SOURCE_FILE" | grep -oiP 'cve-\d{4}-\d+' | head -1 | tr '[:lower:]' '[:upper:]')
fi

python3 "$SCRIPT_DIR/cpg_to_json.py" \
    --dot "$DOT_EXPORT_DIR" \
    --output "$OUTPUT_JSON" \
    --file "$SOURCE_FILE" \
    --cve-id "$CVE_ID" 2>&1 | while IFS= read -r line; do
    echo "[SCA-019][cpg_to_json] $line"
done

if [[ ! -f "$OUTPUT_JSON" ]]; then
    echo "[SCA-019][ERROR] cpg_to_json.py failed: output JSON not generated"
    rm -rf "$WORK_DIR"
    exit 1
fi

# ── 输出 SCA_CPG_JSON 标记 ────────────────────────────────────────────────────
echo ""
echo "[SCA-019] 输出 SCA_CPG_JSON 标记..."
CPG_JSON_CONTENT=$(cat "$OUTPUT_JSON")
echo "SCA_CPG_JSON:$CPG_JSON_CONTENT"

# ── 统计摘要 ──────────────────────────────────────────────────────────────────
NODE_COUNT=$(python3 -c "import json; d=json.load(open('$OUTPUT_JSON')); print(len(d['nodes']))" 2>/dev/null || echo "?")
EDGE_COUNT=$(python3 -c "import json; d=json.load(open('$OUTPUT_JSON')); print(len(d['edges']))" 2>/dev/null || echo "?")
NODE_TYPES=$(python3 -c "import json; d=json.load(open('$OUTPUT_JSON')); print(sorted({n['type'] for n in d['nodes']}))" 2>/dev/null || echo "?")

echo ""
echo "[SCA-019] =============================================="
echo "[SCA-019] DONE"
echo "[SCA-019] 节点数: $NODE_COUNT"
echo "[SCA-019] 边数:   $EDGE_COUNT"
echo "[SCA-019] 节点类型: $NODE_TYPES"
echo "[SCA-019] CPG JSON: $OUTPUT_JSON"
echo "[SCA-019] =============================================="

# 清理临时目录
rm -rf "$WORK_DIR"
