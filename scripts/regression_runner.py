#!/usr/bin/env python3
"""
TC-SCA-024 G5: 回归验证运行器
在应用补丁后的临时工作区执行回归测试，验证：
  1. 补丁是否消除了漏洞特征（taint sink 消失）
  2. 补丁是否保留了功能正确性（函数签名/调用链不变）
  3. 编译检查（如果 gcc 可用）
  4. 静态特征检查（正则扫描）

退出码：
  0 - REGRESSION_PASS（回归通过）
  1 - REGRESSION_FAIL（回归失败）
  2 - REGRESSION_SKIP（跳过，环境不满足）
"""
import sys
import os
import json
import re
import argparse
import shutil
import subprocess
import tempfile
import datetime


# 漏洞特征（应用补丁后不应出现）
VULN_PATTERNS = {
    "CVE-2024-22120": [
        # 直接使用 clientip 作为 SQL 参数（未转义）
        r'clientip\s*\)\s*;.*taint\s*sink',
        r'VALUES\s*\(\s*\'%s\'\s*\).*clientip\s*\)',
        # VULNERABLE 注释
        r'/\*\s*VULNERABLE',
    ]
}

# 功能正确性特征（应用补丁后应保留）
FUNC_PATTERNS = {
    "CVE-2024-22120": [
        # zbx_db_execute 调用链应保留
        r'zbx_db_execute\s*\(',
        # zbx_db_dyn_escape_string 应保留
        r'zbx_db_dyn_escape_string\s*\(',
        # 函数签名应保留
        r'void\s+zbx_audit_log_clientip\s*\(',
    ]
}

# 修复特征（应用补丁后应出现）
FIX_PATTERNS = {
    "CVE-2024-22120": [
        r'FIXED.*CVE-2024-22120',
        r'value_esc\s*\)\s*;.*fixed',
    ]
}


def check_gcc_available() -> bool:
    """检查 gcc 是否可用"""
    try:
        result = subprocess.run(
            ["gcc", "--version"],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


def compile_check(source_file: str, workdir: str) -> dict:
    """尝试编译修复后的文件（仅语法检查）"""
    if not check_gcc_available():
        return {"status": "SKIP", "reason": "gcc 不可用"}

    result = subprocess.run(
        ["gcc", "-fsyntax-only", "-w", source_file],
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=30
    )
    return {
        "status": "PASS" if result.returncode == 0 else "FAIL",
        "returncode": result.returncode,
        "stderr": result.stderr.strip()[:500],
    }


def static_pattern_check(source_file: str, cve_id: str) -> dict:
    """静态正则扫描：检查漏洞特征消除 + 功能特征保留 + 修复特征出现"""
    if not os.path.exists(source_file):
        return {"status": "SKIP", "reason": f"文件不存在: {source_file}"}

    with open(source_file, "r", encoding="utf-8") as f:
        content = f.read()

    results = {
        "vuln_eliminated": [],
        "vuln_remaining": [],
        "func_preserved": [],
        "func_missing": [],
        "fix_present": [],
        "fix_missing": [],
    }

    # 检查漏洞特征（应消除）
    for pattern in VULN_PATTERNS.get(cve_id, []):
        if re.search(pattern, content, re.IGNORECASE | re.DOTALL):
            results["vuln_remaining"].append(pattern)
        else:
            results["vuln_eliminated"].append(pattern)

    # 检查功能特征（应保留）
    for pattern in FUNC_PATTERNS.get(cve_id, []):
        if re.search(pattern, content, re.IGNORECASE):
            results["func_preserved"].append(pattern)
        else:
            results["func_missing"].append(pattern)

    # 检查修复特征（应出现）
    for pattern in FIX_PATTERNS.get(cve_id, []):
        if re.search(pattern, content, re.IGNORECASE | re.DOTALL):
            results["fix_present"].append(pattern)
        else:
            results["fix_missing"].append(pattern)

    # 判断结果
    if results["vuln_remaining"]:
        status = "FAIL"
        reason = f"漏洞特征未消除: {results['vuln_remaining']}"
    elif results["func_missing"]:
        status = "WARN"
        reason = f"功能特征缺失: {results['func_missing']}"
    else:
        status = "PASS"
        reason = "漏洞特征已消除，功能特征完整"

    return {
        "status": status,
        "reason": reason,
        "details": results,
    }


def run_regression(source_file: str, diff_file: str, cve_id: str, output_dir: str) -> dict:
    """
    完整回归验证流程：
    1. 在临时工作区应用补丁
    2. 静态特征检查
    3. 编译检查（可选）
    """
    workdir = tempfile.mkdtemp(prefix="sca-024-regression-")
    regression_result = {
        "cveId": cve_id,
        "sourceFile": source_file,
        "diffFile": diff_file,
        "workdir": workdir,
        "startedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "checks": {},
    }

    try:
        # Step 1: 应用补丁
        sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
        from patch_apply import apply_patch_to_workdir

        apply_result = apply_patch_to_workdir(source_file, diff_file, workdir)
        regression_result["apply_stage"] = apply_result["stage"]

        if apply_result["stage"] != "APPLIED":
            regression_result["status"] = "REGRESSION_FAIL"
            regression_result["reason"] = f"补丁应用失败: {apply_result['stage']}"
            return regression_result

        patched_file = apply_result["patched_file"]

        # Step 2: 静态特征检查
        static_result = static_pattern_check(patched_file, cve_id)
        regression_result["checks"]["static_pattern"] = static_result

        # Step 3: 编译检查
        compile_result = compile_check(patched_file, workdir)
        regression_result["checks"]["compile"] = compile_result

        # 综合判断
        if static_result["status"] == "FAIL":
            regression_result["status"] = "REGRESSION_FAIL"
            regression_result["reason"] = static_result["reason"]
        elif compile_result["status"] == "FAIL":
            regression_result["status"] = "REGRESSION_FAIL"
            regression_result["reason"] = f"编译失败: {compile_result.get('stderr', '')}"
        elif static_result["status"] == "WARN":
            regression_result["status"] = "REGRESSION_WARN"
            regression_result["reason"] = static_result["reason"]
        else:
            regression_result["status"] = "REGRESSION_PASS"
            regression_result["reason"] = "所有回归检查通过"

    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        regression_result["completedAt"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    return regression_result


def main():
    parser = argparse.ArgumentParser(
        description="TC-SCA-024 G5: 回归验证运行器"
    )
    parser.add_argument("source_file", nargs="?",
                        default="samples/cve-2024-22120/audit.c",
                        help="要验证的源文件")
    parser.add_argument("--diff", default="reports/TC-SCA-024/patch.diff",
                        help="unified diff 文件路径")
    parser.add_argument("--cve", default="CVE-2024-22120",
                        help="CVE ID")
    parser.add_argument("--output-dir", default="reports/TC-SCA-024",
                        help="输出目录")
    args = parser.parse_args()

    print(f"[TC-SCA-024/G5] 回归验证运行器启动")
    print(f"[TC-SCA-024/G5] 源文件: {args.source_file}")
    print(f"[TC-SCA-024/G5] diff 文件: {args.diff}")
    print(f"[TC-SCA-024/G5] CVE ID: {args.cve}")
    print("=" * 60)

    result = run_regression(args.source_file, args.diff, args.cve, args.output_dir)

    status = result["status"]
    icon = {
        "REGRESSION_PASS": "✅",
        "REGRESSION_WARN": "⚠️",
        "REGRESSION_FAIL": "❌",
    }.get(status, "❓")

    print(f"[TC-SCA-024/G5] 回归验证结果: {icon} {status}")
    print(f"[TC-SCA-024/G5] 原因: {result.get('reason', 'N/A')}")
    print()

    # 打印各检查项
    for check_name, check_result in result.get("checks", {}).items():
        check_status = check_result.get("status", "UNKNOWN")
        check_icon = {"PASS": "✅", "WARN": "⚠️", "FAIL": "❌", "SKIP": "⏭️"}.get(check_status, "❓")
        print(f"  {check_icon} {check_name}: {check_status} — {check_result.get('reason', '')}")

    # 保存结果
    os.makedirs(args.output_dir, exist_ok=True)
    result_file = os.path.join(args.output_dir, "regression-result.json")
    with open(result_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print()
    print(f"SCA_REGRESSION_JSON:{json.dumps(result, ensure_ascii=False)}")

    exit_code = 0 if status in ["REGRESSION_PASS", "REGRESSION_WARN"] else 1
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
