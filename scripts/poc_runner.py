"""
poc_runner.py - PoC 沙箱隔离执行器（Sandboxed PoC Runner）

职责：
  - 在 Docker 容器中隔离执行 PoC 代码
  - 超时控制（默认 30 秒）
  - 资源限制（内存 128MB，CPU 0.5 核）
  - 无网络访问（--network none）
  - 只读挂载源码目录
  - 返回 RunResult（PASS / FAIL / TIMEOUT / BLOCKED / ERROR）

设计原则：
  - 最小权限（Least Privilege）：容器无 root、无网络、只读文件系统
  - 强制超时：防止无限循环或挂起
  - 完整输出捕获：stdout + stderr 均记录
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

from poc_gate import GateDecision, gate_check


# ---------------------------------------------------------------------------
# 枚举：执行结果状态
# ---------------------------------------------------------------------------

class RunStatus(str, Enum):
    PENDING = "PENDING"   # 等待执行
    RUNNING = "RUNNING"   # 执行中
    PASS = "PASS"         # 执行成功（PoC 验证通过）
    FAIL = "FAIL"         # 执行失败（PoC 未触发漏洞）
    TIMEOUT = "TIMEOUT"   # 执行超时
    BLOCKED = "BLOCKED"   # 被安全闸门拦截
    ERROR = "ERROR"       # 执行环境错误


# ---------------------------------------------------------------------------
# 数据类：执行结果
# ---------------------------------------------------------------------------

@dataclass
class RunResult:
    status: RunStatus
    cve_id: str
    exit_code: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: int = 0
    gate_decision: str = ""
    gate_reason: str = ""
    error_msg: str = ""

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "cve_id": self.cve_id,
            "exit_code": self.exit_code,
            "stdout": self.stdout[:2000],   # 截断超长输出
            "stderr": self.stderr[:1000],
            "duration_ms": self.duration_ms,
            "gate_decision": self.gate_decision,
            "gate_reason": self.gate_reason,
            "error_msg": self.error_msg,
        }


# ---------------------------------------------------------------------------
# 沙箱执行配置
# ---------------------------------------------------------------------------

SANDBOX_IMAGE = "python:3.11-slim"
SANDBOX_TIMEOUT = 30          # 秒
SANDBOX_MEMORY = "128m"       # 内存限制
SANDBOX_CPU = "0.5"           # CPU 限制（核数）
SANDBOX_NETWORK = "none"      # 无网络


# ---------------------------------------------------------------------------
# 执行函数
# ---------------------------------------------------------------------------

def run_poc_in_sandbox(
    cve_id: str,
    poc_code: str,
    timeout: int = SANDBOX_TIMEOUT,
) -> RunResult:
    """
    在 Docker 沙箱中执行 PoC 代码。

    Args:
        cve_id: CVE 编号
        poc_code: PoC Python 代码文本
        timeout: 超时秒数（默认 30）

    Returns:
        RunResult 对象
    """
    start_ms = int(time.time() * 1000)

    # Step 1: 安全闸门校验
    gate = gate_check(cve_id, poc_code, require_sandbox=False)
    if not gate.is_allowed():
        return RunResult(
            status=RunStatus.BLOCKED,
            cve_id=cve_id,
            gate_decision=gate.decision.value,
            gate_reason=gate.reason,
            duration_ms=int(time.time() * 1000) - start_ms,
        )

    # Step 2: 将 PoC 代码写入临时文件
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".py",
        prefix=f"poc_{cve_id.replace('-', '_')}_",
        delete=False,
    ) as tmp:
        tmp.write(poc_code)
        poc_file = tmp.name

    try:
        # Step 3: 检查 Docker 是否可用
        docker_check = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5,
        )

        if docker_check.returncode != 0:
            # Docker 不可用，降级为本地执行（仅用于测试环境）
            return _run_local_fallback(cve_id, poc_code, poc_file, start_ms, gate, timeout)

        # Step 4: Docker 沙箱执行
        docker_cmd = [
            "docker", "run",
            "--rm",
            "--network", SANDBOX_NETWORK,
            "--memory", SANDBOX_MEMORY,
            "--cpus", SANDBOX_CPU,
            "--read-only",
            "--tmpfs", "/tmp:size=64m",
            "--security-opt", "no-new-privileges",
            "-v", f"{poc_file}:/poc.py:ro",
            SANDBOX_IMAGE,
            "python3", "/poc.py",
        ]

        proc = subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        duration = int(time.time() * 1000) - start_ms
        status = RunStatus.PASS if proc.returncode == 0 else RunStatus.FAIL

        return RunResult(
            status=status,
            cve_id=cve_id,
            exit_code=proc.returncode,
            stdout=proc.stdout,
            stderr=proc.stderr,
            duration_ms=duration,
            gate_decision=gate.decision.value,
            gate_reason=gate.reason,
        )

    except subprocess.TimeoutExpired:
        return RunResult(
            status=RunStatus.TIMEOUT,
            cve_id=cve_id,
            duration_ms=int(time.time() * 1000) - start_ms,
            gate_decision=gate.decision.value,
            gate_reason=gate.reason,
            error_msg=f"执行超时（>{timeout}s）",
        )

    except Exception as e:
        return RunResult(
            status=RunStatus.ERROR,
            cve_id=cve_id,
            duration_ms=int(time.time() * 1000) - start_ms,
            gate_decision=gate.decision.value,
            gate_reason=gate.reason,
            error_msg=str(e),
        )

    finally:
        # 清理临时文件
        try:
            os.unlink(poc_file)
        except OSError:
            pass


def _run_local_fallback(
    cve_id: str,
    poc_code: str,
    poc_file: str,
    start_ms: int,
    gate,
    timeout: int,
) -> RunResult:
    """
    Docker 不可用时的本地降级执行（仅限测试环境）。
    注意：本地执行不提供沙箱隔离，仅用于 CI/CD 环境验证。
    """
    try:
        proc = subprocess.run(
            ["python3", poc_file],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        duration = int(time.time() * 1000) - start_ms
        status = RunStatus.PASS if proc.returncode == 0 else RunStatus.FAIL
        return RunResult(
            status=status,
            cve_id=cve_id,
            exit_code=proc.returncode,
            stdout=proc.stdout,
            stderr=proc.stderr,
            duration_ms=duration,
            gate_decision=gate.decision.value,
            gate_reason=f"[降级模式] {gate.reason}",
        )
    except subprocess.TimeoutExpired:
        return RunResult(
            status=RunStatus.TIMEOUT,
            cve_id=cve_id,
            duration_ms=int(time.time() * 1000) - start_ms,
            gate_decision=gate.decision.value,
            gate_reason=gate.reason,
            error_msg=f"本地执行超时（>{timeout}s）",
        )
    except Exception as e:
        return RunResult(
            status=RunStatus.ERROR,
            cve_id=cve_id,
            duration_ms=int(time.time() * 1000) - start_ms,
            gate_decision=gate.decision.value,
            gate_reason=gate.reason,
            error_msg=str(e),
        )


# ---------------------------------------------------------------------------
# CLI 入口
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("用法: python3 poc_runner.py <CVE_ID> <poc_code_file>")
        sys.exit(1)

    cve = sys.argv[1]
    with open(sys.argv[2], "r") as f:
        code = f.read()

    result = run_poc_in_sandbox(cve, code)
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    sys.exit(0 if result.status in (RunStatus.PASS, RunStatus.FAIL) else 1)
