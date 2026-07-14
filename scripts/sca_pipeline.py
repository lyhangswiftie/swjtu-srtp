"""
TC-SCA-025: SCA End-to-End Pipeline Orchestrator
一键流水线编排器

Usage:
  python3 scripts/sca_pipeline.py --config configs/sca_pipeline.yaml \
      --cve CVE-2024-22120 --source samples/cve-2024-22120/audit.c \
      --output reports/TC-SCA-025

  python3 scripts/sca_pipeline.py --config configs/sca_pipeline.yaml \
      --dry-run --output reports/TC-SCA-025
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml

from sca_pipeline_steps import (
    StepResult,
    StepStatus,
    run_step,
    is_blocking,
    compute_overall_status,
)

STEP_DISPLAY_NAMES = {
    "cve_consistency": "CVE 数据一致性检查",
    "cpg_analysis": "Joern CPG 分析",
    "poc_gate": "PoC 安全闸门",
    "patch_generate": "Patch 生成",
    "patch_guard": "Patch 安全检查",
    "patch_apply_check": "Patch 预检查",
    "patch_apply": "Patch 临时工作区应用",
    "regression": "回归验证",
    "patch_report": "修复报告生成",
}


def load_config(config_path: str) -> dict:
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def resolve_command(template: str, cve: str, source: str, output: str) -> str:
    """替换命令模板中的占位符（output 统一转为绝对路径）"""
    abs_output = str(Path(output).resolve())
    abs_source = str(Path(source).resolve()) if source else source
    return (
        template
        .replace("{cve}", cve)
        .replace("{source}", abs_source)
        .replace("{output}", abs_output)
    )


def resolve_artifacts(artifacts: list, cve: str, source: str, output: str) -> list:
    return [resolve_command(a, cve, source, output) for a in (artifacts or [])]


def run_pipeline(
    config: dict,
    cve: str,
    source: str,
    output: str,
    dry_run: bool = False,
) -> dict:
    """执行完整流水线，返回 pipeline run 结果"""
    pipeline_id = config.get("pipeline_id", "TC-SCA-025")
    execution = config.get("execution", {})
    fail_fast = execution.get("fail_fast", False)
    continue_on_warn = execution.get("continue_on_warn", True)
    timeout_per_step = execution.get("timeout_seconds_per_step", 120)

    steps_config = config.get("steps", {})
    run_id = f"sca-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    t0 = time.time()

    step_results: list[StepResult] = []
    plan = []

    for step_id, step_cfg in steps_config.items():
        if not step_cfg.get("enabled", True):
            continue
        cmd_template = step_cfg.get("command", "")
        out_dir_template = step_cfg.get("output_dir", output)
        artifacts_template = step_cfg.get("artifacts", [])

        cmd = resolve_command(cmd_template, cve, source, output)
        out_dir = resolve_command(out_dir_template, cve, source, output)
        artifacts = resolve_artifacts(artifacts_template, cve, source, output)
        name = STEP_DISPLAY_NAMES.get(step_id, step_id)

        plan.append({
            "stepId": step_id,
            "name": name,
            "command": cmd,
            "outputDir": out_dir,
            "artifacts": artifacts,
        })

    # dry-run 模式：只输出计划
    if dry_run:
        print(f"\n[DRY-RUN] Pipeline: {pipeline_id}")
        print(f"[DRY-RUN] CVE: {cve}  Source: {source}  Output: {output}")
        print(f"[DRY-RUN] Steps ({len(plan)}):")
        for i, p in enumerate(plan, 1):
            print(f"  [{i:02d}] {p['stepId']}: {p['name']}")
            print(f"       cmd: {p['command'][:80]}...")
        os.makedirs(output, exist_ok=True)
        plan_path = os.path.join(output, "pipeline-plan.json")
        with open(plan_path, "w") as f:
            json.dump({
                "pipelineId": pipeline_id,
                "runId": run_id,
                "dryRun": True,
                "cveId": cve,
                "sourceFile": source,
                "outputDir": output,
                "steps": plan,
            }, f, indent=2, ensure_ascii=False)
        print(f"\n[DRY-RUN] Plan saved: {plan_path}")
        print("SCA_PIPELINE_DRY_RUN: OK")
        return {"dryRun": True, "plan": plan, "planPath": plan_path}

    # 真实执行
    print(f"\n[PIPELINE] Starting: {pipeline_id}  RunID: {run_id}")
    print(f"[PIPELINE] CVE: {cve}  Source: {source}  Output: {output}")
    print(f"[PIPELINE] Steps: {len(plan)}")
    print("=" * 60)

    blocked = False
    for p in plan:
        if blocked:
            sr = StepResult(
                stepId=p["stepId"],
                name=p["name"],
                status=StepStatus.SKIPPED,
                summary="Skipped due to upstream failure (fail_fast=True).",
            )
            step_results.append(sr)
            print(f"  [SKIP] {p['stepId']}")
            continue

        print(f"  [RUN ] {p['stepId']}: {p['name']}")
        sr = run_step(
            step_id=p["stepId"],
            name=p["name"],
            command=p["command"],
            output_dir=p["outputDir"],
            artifacts=p["artifacts"],
            timeout=timeout_per_step,
            continue_on_warn=continue_on_warn,
        )
        step_results.append(sr)
        status_str = sr.status.value
        print(f"  [{status_str:8s}] {p['stepId']}: {sr.summary[:80]}")

        if fail_fast and is_blocking(sr.status):
            blocked = True
            print(f"  [FAIL-FAST] Blocking on {p['stepId']}")

    elapsed_ms = int((time.time() - t0) * 1000)
    ended_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    overall = compute_overall_status(step_results)

    steps_total = len(step_results)
    steps_passed = sum(1 for s in step_results if s.status == StepStatus.PASS)
    steps_warned = sum(1 for s in step_results if s.status == StepStatus.WARN)
    steps_failed = sum(1 for s in step_results if s.status in (StepStatus.FAIL, StepStatus.BLOCKED))
    steps_skipped = sum(1 for s in step_results if s.status == StepStatus.SKIPPED)

    run_data = {
        "schema": "SCA_PIPELINE_RUN_V1",
        "pipelineId": pipeline_id,
        "runId": run_id,
        "cveId": cve,
        "sourceFile": source,
        "outputDir": output,
        "overallStatus": overall,
        "startedAt": started_at,
        "endedAt": ended_at,
        "durationMs": elapsed_ms,
        "steps": [s.to_dict() for s in step_results],
        "metrics": {
            "stepsTotal": steps_total,
            "stepsPassed": steps_passed,
            "stepsWarned": steps_warned,
            "stepsFailed": steps_failed,
            "stepsSkipped": steps_skipped,
        },
    }

    os.makedirs(output, exist_ok=True)
    run_path = os.path.join(output, "sca_pipeline_run.json")
    with open(run_path, "w") as f:
        json.dump(run_data, f, indent=2, ensure_ascii=False)

    print("=" * 60)
    print(f"[PIPELINE] Overall: {overall}")
    print(f"[PIPELINE] Steps: {steps_passed}P / {steps_warned}W / {steps_failed}F / {steps_skipped}S (total {steps_total})")
    print(f"[PIPELINE] Duration: {elapsed_ms}ms")
    print(f"[PIPELINE] Run saved: {run_path}")
    print(f"SCA_PIPELINE_STATUS: {overall}")

    return run_data


def main():
    parser = argparse.ArgumentParser(description="SCA End-to-End Pipeline Orchestrator")
    parser.add_argument("--config", default="configs/sca_pipeline.yaml", help="Pipeline config file")
    parser.add_argument("--cve", help="CVE ID (overrides config default)")
    parser.add_argument("--source", help="Source file path (overrides config default)")
    parser.add_argument("--output", help="Output directory (overrides config default)")
    parser.add_argument("--dry-run", action="store_true", help="Dry run: show plan without executing")
    args = parser.parse_args()

    config = load_config(args.config)
    cve = args.cve or config.get("default_cve", "CVE-2024-22120")
    source = args.source or config.get("default_source", "samples/cve-2024-22120/audit.c")
    output = args.output or config.get("default_output", "reports/TC-SCA-025")

    result = run_pipeline(
        config=config,
        cve=cve,
        source=source,
        output=output,
        dry_run=args.dry_run,
    )

    overall = result.get("overallStatus", "PIPELINE_FAILED")
    if overall in ("PIPELINE_VERIFIED", "PIPELINE_WARN", "PIPELINE_PARTIAL") or result.get("dryRun"):
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
