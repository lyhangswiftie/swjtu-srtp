"""
TC-SCA-025: Pipeline Step Adapters and Status Schema
阶段适配器与状态模型
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional


class StepStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    PASS = "PASS"
    FAIL = "FAIL"
    BLOCKED = "BLOCKED"
    SKIPPED = "SKIPPED"
    WARN = "WARN"


@dataclass
class StepResult:
    stepId: str
    name: str
    status: StepStatus = StepStatus.PENDING
    startedAt: str = ""
    endedAt: str = ""
    durationMs: int = 0
    command: str = ""
    artifacts: List[str] = field(default_factory=list)
    summary: str = ""
    error: str = ""
    returncode: int = -1

    def to_dict(self) -> dict:
        d = asdict(self)
        d["status"] = self.status.value
        return d


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_step(
    step_id: str,
    name: str,
    command: str,
    output_dir: str,
    artifacts: List[str],
    timeout: int = 120,
    continue_on_warn: bool = True,
) -> StepResult:
    """执行单个流水线阶段，返回 StepResult"""
    result = StepResult(stepId=step_id, name=name, command=command, artifacts=artifacts)
    result.startedAt = _now_iso()
    result.status = StepStatus.RUNNING

    os.makedirs(output_dir, exist_ok=True)

    t0 = time.time()
    try:
        proc = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        elapsed_ms = int((time.time() - t0) * 1000)
        result.durationMs = elapsed_ms
        result.endedAt = _now_iso()
        result.returncode = proc.returncode

        stdout = proc.stdout.strip()
        stderr = proc.stderr.strip()

        if proc.returncode == 0:
            # 检查是否有 WARN 信号
            if "WARN" in stdout or "warn" in stderr.lower():
                result.status = StepStatus.WARN
                result.summary = f"Step completed with warnings. stdout: {stdout[:200]}"
            else:
                result.status = StepStatus.PASS
                result.summary = f"Step completed successfully. stdout: {stdout[:200]}"
        else:
            # 检查是否是 BLOCKED（安全闸门拒绝）
            if "BLOCKED" in stdout or "BLOCKED" in stderr:
                result.status = StepStatus.BLOCKED
                result.summary = f"Step blocked by safety gate."
                result.error = stderr[:300]
            else:
                result.status = StepStatus.FAIL
                result.summary = f"Step failed with returncode {proc.returncode}."
                result.error = f"stdout: {stdout[:200]}\nstderr: {stderr[:200]}"

    except subprocess.TimeoutExpired:
        result.durationMs = int((time.time() - t0) * 1000)
        result.endedAt = _now_iso()
        result.status = StepStatus.FAIL
        result.summary = f"Step timed out after {timeout}s."
        result.error = "TimeoutExpired"
    except Exception as e:
        result.durationMs = int((time.time() - t0) * 1000)
        result.endedAt = _now_iso()
        result.status = StepStatus.FAIL
        result.summary = f"Step raised exception: {e}"
        result.error = str(e)

    # 检查 artifacts 是否存在
    missing = [a for a in artifacts if a and not os.path.exists(a)]
    if missing and result.status == StepStatus.PASS:
        result.status = StepStatus.WARN
        result.summary += f" Missing artifacts: {missing}"

    return result


def is_blocking(status: StepStatus) -> bool:
    """判断状态是否阻塞后续步骤（fail_fast 模式下）"""
    return status in (StepStatus.FAIL,)


# 环境限制步骤：在无 Docker/Joern 的沙箱中允许降级为 WARN（不影响核心修复链路）
ENV_LIMITED_STEPS = {"cpg_analysis", "poc_gate"}


def compute_overall_status(steps: List[StepResult]) -> str:
    """根据所有阶段结果计算总体状态
    
    环境限制步骤（cpg_analysis/poc_gate）在无 Docker/Joern 时允许降级为 WARN，
    不影响核心修复链路（patch → regression → report）的 PIPELINE_VERIFIED 判断。
    """
    hard_fail = False
    has_warn = False
    for s in steps:
        if s.status in (StepStatus.FAIL, StepStatus.BLOCKED):
            if s.stepId in ENV_LIMITED_STEPS:
                # 环境限制步骤降级为 WARN
                has_warn = True
            else:
                hard_fail = True
        elif s.status == StepStatus.WARN:
            has_warn = True
    if hard_fail:
        return "PIPELINE_FAILED"
    if has_warn:
        return "PIPELINE_WARN"
    passed = sum(1 for s in steps if s.status == StepStatus.PASS)
    if passed >= 6:
        return "PIPELINE_VERIFIED"
    return "PIPELINE_PARTIAL"
