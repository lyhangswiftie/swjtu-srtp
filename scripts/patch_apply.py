#!/usr/bin/env python3
"""
TC-SCA-024 G3/G4: 补丁应用器
支持两种模式：
  --check   仅执行 git apply --check（预检查），不修改任何文件
  --apply   在临时工作区应用补丁，不污染原仓库

工作流：
  1. 将源文件复制到临时工作区
  2. 在临时工作区执行 git apply --check（G3）
  3. 若 --apply，在临时工作区执行 git apply（G4）
  4. 输出应用结果和 SCA_APPLY_JSON

退出码：
  0 - 成功（CHECK_PASSED 或 APPLIED）
  1 - 失败（CHECK_FAILED 或 APPLY_FAILED）
"""
import sys
import os
import json
import argparse
import shutil
import subprocess
import tempfile
import datetime


def copy_to_workdir(source_file: str, workdir: str) -> str:
    """将源文件复制到临时工作区，保持相对路径结构"""
    basename = os.path.basename(source_file)
    dest = os.path.join(workdir, basename)
    shutil.copy2(source_file, dest)
    return dest


def adjust_diff_for_workdir(diff_file: str, workdir: str, source_file: str) -> str:
    """
    调整 diff 文件中的路径，使其适配临时工作区。
    将 a/audit.c / b/audit.c 替换为实际的临时工作区路径。
    返回调整后的临时 diff 文件路径。
    """
    basename = os.path.basename(source_file)
    with open(diff_file, "r", encoding="utf-8") as f:
        content = f.read()

    # 替换 diff 头部的路径
    # --- a/audit.c → --- a/<basename>
    # +++ b/audit.c → +++ b/<basename>
    import re
    content = re.sub(r'^--- a/.*$', f'--- a/{basename}', content, flags=re.MULTILINE)
    content = re.sub(r'^\+\+\+ b/.*$', f'+++ b/{basename}', content, flags=re.MULTILINE)

    # 写入临时 diff 文件
    tmp_diff = os.path.join(workdir, "adjusted.diff")
    with open(tmp_diff, "w", encoding="utf-8") as f:
        f.write(content)
    return tmp_diff


def run_git_apply(diff_file: str, workdir: str, check_only: bool = False) -> dict:
    """
    在 workdir 中执行 git apply（或 git apply --check）。
    返回执行结果字典。
    """
    # 初始化临时 git 仓库（git apply 需要 git 环境）
    init_result = subprocess.run(
        ["git", "init", "-q"],
        cwd=workdir,
        capture_output=True,
        text=True
    )

    # 配置 git 用户（避免 git apply 报错）
    subprocess.run(
        ["git", "config", "user.email", "sca-024@securecodeact.local"],
        cwd=workdir, capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.name", "TC-SCA-024"],
        cwd=workdir, capture_output=True
    )

    # 先 git add 所有文件（git apply 需要文件在 index 中）
    subprocess.run(
        ["git", "add", "."],
        cwd=workdir, capture_output=True
    )
    subprocess.run(
        ["git", "commit", "-m", "baseline", "--allow-empty", "-q"],
        cwd=workdir, capture_output=True
    )

    # 构建 git apply 命令
    cmd = ["git", "apply"]
    if check_only:
        cmd.append("--check")
    cmd.append(diff_file)

    result = subprocess.run(
        cmd,
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=30
    )

    return {
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "command": " ".join(cmd),
    }


def apply_patch_to_workdir(source_file: str, diff_file: str, workdir: str) -> dict:
    """
    在临时工作区应用补丁，返回应用结果。
    """
    # 复制源文件到工作区
    dest_file = copy_to_workdir(source_file, workdir)

    # 调整 diff 路径
    adjusted_diff = adjust_diff_for_workdir(diff_file, workdir, source_file)

    # 执行 git apply --check
    check_result = run_git_apply(adjusted_diff, workdir, check_only=True)
    if check_result["returncode"] != 0:
        return {
            "stage": "CHECK_FAILED",
            "check_result": check_result,
            "apply_result": None,
            "patched_file": None,
        }

    # 执行 git apply
    apply_result = run_git_apply(adjusted_diff, workdir, check_only=False)
    if apply_result["returncode"] != 0:
        return {
            "stage": "APPLY_FAILED",
            "check_result": check_result,
            "apply_result": apply_result,
            "patched_file": None,
        }

    # 读取应用后的文件内容
    with open(dest_file, "r", encoding="utf-8") as f:
        patched_content = f.read()

    return {
        "stage": "APPLIED",
        "check_result": check_result,
        "apply_result": apply_result,
        "patched_file": dest_file,
        "patched_content_preview": patched_content[:500],
    }


def main():
    parser = argparse.ArgumentParser(
        description="TC-SCA-024 G3/G4: 补丁应用器"
    )
    parser.add_argument("source_file", nargs="?",
                        default="samples/cve-2024-22120/audit.c",
                        help="要应用补丁的源文件")
    parser.add_argument("--diff", default="reports/TC-SCA-024/patch.diff",
                        help="unified diff 文件路径")
    parser.add_argument("--check", action="store_true",
                        help="仅执行 git apply --check（预检查模式）")
    parser.add_argument("--apply", action="store_true",
                        help="在临时工作区应用补丁")
    parser.add_argument("--workdir", default=None,
                        help="临时工作区路径（默认自动创建）")
    parser.add_argument("--output-dir", default="reports/TC-SCA-024",
                        help="输出目录")
    args = parser.parse_args()

    if not args.check and not args.apply:
        args.check = True  # 默认执行预检查

    print(f"[TC-SCA-024/G3-G4] 补丁应用器启动")
    print(f"[TC-SCA-024/G3-G4] 源文件: {args.source_file}")
    print(f"[TC-SCA-024/G3-G4] diff 文件: {args.diff}")
    print(f"[TC-SCA-024/G3-G4] 模式: {'--check' if args.check and not args.apply else '--apply'}")
    print("=" * 60)

    # 创建临时工作区
    cleanup_workdir = False
    if args.workdir:
        workdir = args.workdir
        os.makedirs(workdir, exist_ok=True)
    else:
        workdir = tempfile.mkdtemp(prefix="sca-024-patch-")
        cleanup_workdir = True

    print(f"[TC-SCA-024/G3-G4] 临时工作区: {workdir}")

    result_meta = {
        "cveId": "CVE-2024-22120",
        "sourceFile": args.source_file,
        "diffFile": args.diff,
        "workdir": workdir,
        "startedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    try:
        if args.check and not args.apply:
            # 仅预检查模式（G3）
            dest_file = copy_to_workdir(args.source_file, workdir)
            adjusted_diff = adjust_diff_for_workdir(args.diff, workdir, args.source_file)
            check_result = run_git_apply(adjusted_diff, workdir, check_only=True)

            if check_result["returncode"] == 0:
                stage = "CHECK_PASSED"
                print(f"[TC-SCA-024/G3] ✅ git apply --check 通过")
            else:
                stage = "CHECK_FAILED"
                print(f"[TC-SCA-024/G3] ❌ git apply --check 失败")
                print(f"  stderr: {check_result['stderr']}")

            result_meta.update({
                "stage": stage,
                "check_result": check_result,
                "completedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            })

        else:
            # 完整应用模式（G3 + G4）
            apply_result = apply_patch_to_workdir(args.source_file, args.diff, workdir)
            stage = apply_result["stage"]

            if stage == "APPLIED":
                print(f"[TC-SCA-024/G4] ✅ 补丁应用成功（临时工作区）")
                print(f"[TC-SCA-024/G4] 已修改文件: {apply_result['patched_file']}")
                print()
                print("=== 修复后文件预览（前 20 行）===")
                preview = apply_result.get("patched_content_preview", "")
                for i, line in enumerate(preview.split('\n')[:20], 1):
                    print(f"  {i:3d}: {line}")
            elif stage == "CHECK_FAILED":
                print(f"[TC-SCA-024/G3] ❌ git apply --check 失败")
                print(f"  stderr: {apply_result['check_result']['stderr']}")
            else:
                print(f"[TC-SCA-024/G4] ❌ 补丁应用失败")
                print(f"  stderr: {apply_result['apply_result']['stderr']}")

            result_meta.update({
                "stage": stage,
                "check_result": apply_result.get("check_result"),
                "apply_result": apply_result.get("apply_result"),
                "patchedFile": apply_result.get("patched_file"),
                "completedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            })

        # 保存结果 JSON
        os.makedirs(args.output_dir, exist_ok=True)
        result_file = os.path.join(args.output_dir, "patch-apply-result.json")
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump(result_meta, f, ensure_ascii=False, indent=2)

        print()
        print(f"SCA_APPLY_JSON:{json.dumps(result_meta, ensure_ascii=False)}")

        success = result_meta.get("stage") in ["CHECK_PASSED", "APPLIED"]
        sys.exit(0 if success else 1)

    finally:
        if cleanup_workdir and os.path.exists(workdir):
            shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    main()
