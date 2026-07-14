#!/usr/bin/env bash
# TC-SCA-025: SCA Pipeline Smoke Test
# 快速冒烟测试：验证 dry-run 和真实执行

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${REPO_DIR}/reports/TC-SCA-025"
LOG_FILE="${OUTPUT_DIR}/pipeline-smoke.log"

mkdir -p "${OUTPUT_DIR}"

echo "=== TC-SCA-025 Pipeline Smoke Test ===" | tee "${LOG_FILE}"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "${LOG_FILE}"
echo "Repo: ${REPO_DIR}" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"

cd "${REPO_DIR}"

# Step 1: dry-run
echo "[SMOKE-1] Dry-run test..." | tee -a "${LOG_FILE}"
python3 scripts/sca_pipeline.py \
    --config configs/sca_pipeline.yaml \
    --dry-run \
    --output "${OUTPUT_DIR}" 2>&1 | tee -a "${LOG_FILE}"

if [ -f "${OUTPUT_DIR}/pipeline-plan.json" ]; then
    echo "[SMOKE-1] PASS: pipeline-plan.json generated" | tee -a "${LOG_FILE}"
else
    echo "[SMOKE-1] FAIL: pipeline-plan.json not found" | tee -a "${LOG_FILE}"
    exit 1
fi

echo "" | tee -a "${LOG_FILE}"

# Step 2: 真实执行
echo "[SMOKE-2] Real execution..." | tee -a "${LOG_FILE}"
python3 scripts/sca_pipeline.py \
    --config configs/sca_pipeline.yaml \
    --cve CVE-2024-22120 \
    --source samples/cve-2024-22120/audit.c \
    --output "${OUTPUT_DIR}" 2>&1 | tee -a "${LOG_FILE}"

if [ -f "${OUTPUT_DIR}/sca_pipeline_run.json" ]; then
    echo "[SMOKE-2] PASS: sca_pipeline_run.json generated" | tee -a "${LOG_FILE}"
    OVERALL=$(python3 -c "import json; d=json.load(open('${OUTPUT_DIR}/sca_pipeline_run.json')); print(d.get('overallStatus','UNKNOWN'))")
    echo "[SMOKE-2] Overall status: ${OVERALL}" | tee -a "${LOG_FILE}"
else
    echo "[SMOKE-2] FAIL: sca_pipeline_run.json not found" | tee -a "${LOG_FILE}"
    exit 1
fi

echo "" | tee -a "${LOG_FILE}"
echo "=== Smoke Test Complete ===" | tee -a "${LOG_FILE}"
