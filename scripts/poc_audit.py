"""
poc_audit.py - PoC 执行审计日志记录器（Audit Logger）

职责：
  - 将每次 PoC 执行（包括 BLOCKED）记录到 JSON Lines 格式审计日志
  - 提供查询接口：按 CVE ID、时间范围、状态过滤
  - 生成审计摘要报告

日志格式（每行一个 JSON 对象）：
  {
    "ts": "2026-05-07T08:00:00.000Z",  // ISO 8601 时间戳
    "cve_id": "CVE-2024-22120",
    "status": "PASS",                   // PASS/FAIL/TIMEOUT/BLOCKED/ERROR
    "exit_code": 0,
    "duration_ms": 1234,
    "gate_decision": "ALLOW",
    "gate_reason": "所有安全校验通过",
    "stdout_digest": "SQL injection confirmed...",  // 前 200 字符
    "stderr_digest": "",
    "error_msg": ""
  }
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

# 默认审计日志路径
DEFAULT_AUDIT_LOG = Path(__file__).parent.parent / "reports" / "poc_audit.jsonl"


# ---------------------------------------------------------------------------
# 审计日志写入
# ---------------------------------------------------------------------------

def write_audit_entry(
    run_result,
    audit_log: Path = DEFAULT_AUDIT_LOG,
) -> dict:
    """
    将 RunResult 写入审计日志文件（JSON Lines 格式）。

    Args:
        run_result: poc_runner.RunResult 对象
        audit_log: 审计日志文件路径

    Returns:
        写入的日志条目 dict
    """
    audit_log.parent.mkdir(parents=True, exist_ok=True)

    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "cve_id": run_result.cve_id,
        "status": run_result.status.value if hasattr(run_result.status, "value") else str(run_result.status),
        "exit_code": run_result.exit_code,
        "duration_ms": run_result.duration_ms,
        "gate_decision": run_result.gate_decision,
        "gate_reason": run_result.gate_reason,
        "stdout_digest": (run_result.stdout or "")[:200],
        "stderr_digest": (run_result.stderr or "")[:200],
        "error_msg": run_result.error_msg or "",
    }

    with open(audit_log, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return entry


def write_gate_blocked_entry(
    cve_id: str,
    gate_result,
    audit_log: Path = DEFAULT_AUDIT_LOG,
) -> dict:
    """
    记录被安全闸门拦截的事件（不经过 RunResult）。
    """
    audit_log.parent.mkdir(parents=True, exist_ok=True)

    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "cve_id": cve_id,
        "status": "BLOCKED",
        "exit_code": None,
        "duration_ms": 0,
        "gate_decision": gate_result.decision.value,
        "gate_reason": gate_result.reason,
        "stdout_digest": "",
        "stderr_digest": "",
        "error_msg": "; ".join(gate_result.matched_patterns) if gate_result.matched_patterns else "",
    }

    with open(audit_log, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return entry


# ---------------------------------------------------------------------------
# 审计日志查询
# ---------------------------------------------------------------------------

def read_audit_log(audit_log: Path = DEFAULT_AUDIT_LOG) -> List[dict]:
    """读取全部审计日志条目"""
    if not audit_log.exists():
        return []
    entries = []
    with open(audit_log, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return entries


def query_by_cve(cve_id: str, audit_log: Path = DEFAULT_AUDIT_LOG) -> List[dict]:
    """按 CVE ID 过滤审计日志"""
    return [e for e in read_audit_log(audit_log) if e.get("cve_id") == cve_id.upper()]


def query_by_status(status: str, audit_log: Path = DEFAULT_AUDIT_LOG) -> List[dict]:
    """按执行状态过滤审计日志"""
    return [e for e in read_audit_log(audit_log) if e.get("status") == status.upper()]


def generate_summary(audit_log: Path = DEFAULT_AUDIT_LOG) -> dict:
    """
    生成审计摘要报告。

    Returns:
        {
          "total": 10,
          "by_status": {"PASS": 3, "FAIL": 2, "BLOCKED": 4, "ERROR": 1},
          "by_cve": {"CVE-2024-22120": 5, ...},
          "avg_duration_ms": 1234,
        }
    """
    entries = read_audit_log(audit_log)
    if not entries:
        return {"total": 0, "by_status": {}, "by_cve": {}, "avg_duration_ms": 0}

    by_status: dict[str, int] = {}
    by_cve: dict[str, int] = {}
    durations = []

    for e in entries:
        status = e.get("status", "UNKNOWN")
        cve = e.get("cve_id", "UNKNOWN")
        by_status[status] = by_status.get(status, 0) + 1
        by_cve[cve] = by_cve.get(cve, 0) + 1
        if e.get("duration_ms"):
            durations.append(e["duration_ms"])

    return {
        "total": len(entries),
        "by_status": by_status,
        "by_cve": by_cve,
        "avg_duration_ms": int(sum(durations) / len(durations)) if durations else 0,
    }


# ---------------------------------------------------------------------------
# CLI 入口
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else "summary"

    if cmd == "summary":
        summary = generate_summary()
        print(json.dumps(summary, ensure_ascii=False, indent=2))

    elif cmd == "list":
        entries = read_audit_log()
        for e in entries[-20:]:  # 最近 20 条
            print(json.dumps(e, ensure_ascii=False))

    elif cmd == "query-cve" and len(sys.argv) > 2:
        entries = query_by_cve(sys.argv[2])
        print(json.dumps(entries, ensure_ascii=False, indent=2))

    elif cmd == "query-status" and len(sys.argv) > 2:
        entries = query_by_status(sys.argv[2])
        print(json.dumps(entries, ensure_ascii=False, indent=2))

    else:
        print("用法: python3 poc_audit.py [summary|list|query-cve <CVE>|query-status <STATUS>]")
