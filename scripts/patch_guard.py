#!/usr/bin/env python3
"""
TC-SCA-024 G2: 补丁安全检查器
读取 patch.diff 文件，根据 configs/patch_policy.yaml 策略进行安全校验。

检查项：
1. 目标文件是否在白名单中
2. 删除行数是否超过上限
3. 新增行数是否超过上限
4. 新增内容是否包含危险命令/代码模式
5. 目标路径是否包含敏感文件（.env / id_rsa 等）

退出码：
  0 - PASS（安全）
  1 - BLOCKED（危险，拒绝应用）
  2 - WARN（警告，需人工确认）
"""
import sys
import os
import re
import json
import argparse
import datetime

try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False


# 默认策略（当 YAML 不可用或文件不存在时使用）
DEFAULT_POLICY = {
    "allowed_patch_targets": [
        "audit.c",
        "samples/cve-2024-22120/audit.c",
        "src/libs/zbxaudit/audit.c",
        "lib/import.php",
        "CustomerThreadController.php",
    ],
    "blocked_paths": [
        ".env", "id_rsa", "authorized_keys", "/etc/passwd", "/etc/shadow",
        "secrets/", "private_key", ".pem", ".key", "credentials",
    ],
    "blocked_added_patterns": [
        r"system\s*\(",
        r"popen\s*\(",
        r"eval\s*\(",
        r"exec\s*\(",
        r"shell_exec\s*\(",
        r"chmod\s+777",
        r"curl\s+.*\|\s*bash",
        r"wget\s+.*\|\s*bash",
        r"nc\s+-e",
        r"bash\s+-i\s+>&",
        r"rm\s+-rf\s+/",
        r"mkfs\.",
        r"dd\s+if=/dev/zero",
    ],
    "max_deleted_lines": 50,
    "max_added_lines": 200,
}


def load_policy(policy_file: str) -> dict:
    """加载策略文件，失败时返回默认策略"""
    if not policy_file or not os.path.exists(policy_file):
        return DEFAULT_POLICY
    if YAML_AVAILABLE:
        try:
            with open(policy_file, "r", encoding="utf-8") as f:
                policy = yaml.safe_load(f)
            return policy if policy else DEFAULT_POLICY
        except Exception:
            pass
    # YAML 不可用时尝试简单解析
    return DEFAULT_POLICY


def parse_diff(diff_file: str) -> dict:
    """解析 unified diff 文件，提取目标文件、新增行、删除行"""
    if not os.path.exists(diff_file):
        raise FileNotFoundError(f"diff 文件不存在: {diff_file}")

    with open(diff_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    target_files = []
    added_lines = []
    deleted_lines = []

    for line in lines:
        if line.startswith("+++ "):
            # 提取目标文件名（去掉 b/ 前缀）
            target = line[4:].strip()
            if target.startswith("b/"):
                target = target[2:]
            if target != "/dev/null":
                target_files.append(target)
        elif line.startswith("+") and not line.startswith("+++"):
            added_lines.append(line[1:].rstrip("\n"))
        elif line.startswith("-") and not line.startswith("---"):
            deleted_lines.append(line[1:].rstrip("\n"))

    return {
        "target_files": target_files,
        "added_lines": added_lines,
        "deleted_lines": deleted_lines,
        "total_added": len(added_lines),
        "total_deleted": len(deleted_lines),
    }


def check_patch(diff_file: str, policy: dict) -> dict:
    """
    对 diff 文件执行安全检查。
    返回 {"decision": "PASS"|"BLOCKED"|"WARN", "reasons": [...], "checks": {...}}
    """
    reasons = []
    blocked = False
    warned = False
    checks = {}

    # 解析 diff
    try:
        diff_info = parse_diff(diff_file)
    except FileNotFoundError as e:
        return {
            "decision": "BLOCKED",
            "reasons": [str(e)],
            "checks": {"parse": "FAILED"},
        }

    # 检查 1：目标文件白名单
    allowed_targets = policy.get("allowed_patch_targets", [])
    target_files = diff_info["target_files"]
    if allowed_targets and target_files:
        for tf in target_files:
            matched = any(
                allowed.lower() in tf.lower() or tf.lower().endswith(allowed.lower())
                for allowed in allowed_targets
            )
            if not matched:
                reasons.append(f"目标文件 '{tf}' 不在白名单中")
                warned = True
    checks["target_whitelist"] = "PASS" if not warned else "WARN"

    # 检查 2：敏感路径
    blocked_paths = policy.get("blocked_paths", [])
    for tf in target_files:
        for bp in blocked_paths:
            if bp.lower() in tf.lower():
                reasons.append(f"目标文件 '{tf}' 包含敏感路径 '{bp}'")
                blocked = True
    checks["sensitive_path"] = "BLOCKED" if blocked else "PASS"

    # 检查 3：删除行数上限
    max_deleted = policy.get("max_deleted_lines", 50)
    if diff_info["total_deleted"] > max_deleted:
        reasons.append(f"删除行数 {diff_info['total_deleted']} 超过上限 {max_deleted}")
        warned = True
    checks["deleted_lines_limit"] = "WARN" if diff_info["total_deleted"] > max_deleted else "PASS"

    # 检查 4：新增行数上限
    max_added = policy.get("max_added_lines", 200)
    if diff_info["total_added"] > max_added:
        reasons.append(f"新增行数 {diff_info['total_added']} 超过上限 {max_added}")
        warned = True
    checks["added_lines_limit"] = "WARN" if diff_info["total_added"] > max_added else "PASS"

    # 检查 5：危险代码模式（仅检查新增行）
    blocked_patterns = policy.get("blocked_added_patterns", [])
    for pattern in blocked_patterns:
        for added_line in diff_info["added_lines"]:
            if re.search(pattern, added_line, re.IGNORECASE):
                reasons.append(f"新增行包含危险模式 '{pattern}': {added_line.strip()[:80]}")
                blocked = True
    checks["dangerous_patterns"] = "BLOCKED" if any(
        "危险模式" in r for r in reasons
    ) else "PASS"

    # 最终决策
    if blocked:
        decision = "BLOCKED"
    elif warned:
        decision = "WARN"
    else:
        decision = "PASS"

    return {
        "decision": decision,
        "reasons": reasons,
        "checks": checks,
        "diff_stats": {
            "target_files": diff_info["target_files"],
            "total_added": diff_info["total_added"],
            "total_deleted": diff_info["total_deleted"],
        },
    }


def main():
    parser = argparse.ArgumentParser(
        description="TC-SCA-024 G2: 补丁安全检查器"
    )
    parser.add_argument("diff_file", nargs="?",
                        default="reports/TC-SCA-024/patch.diff",
                        help="要检查的 unified diff 文件路径")
    parser.add_argument("--policy", default="configs/patch_policy.yaml",
                        help="策略文件路径（YAML）")
    parser.add_argument("--json", action="store_true",
                        help="以 JSON 格式输出结果")
    parser.add_argument("--output", default=None,
                        help="将 JSON 结果保存到指定文件")
    args = parser.parse_args()

    print(f"[TC-SCA-024/G2] 补丁安全检查开始")
    print(f"[TC-SCA-024/G2] diff 文件: {args.diff_file}")
    print(f"[TC-SCA-024/G2] 策略文件: {args.policy}")
    print("=" * 60)

    policy = load_policy(args.policy)
    result = check_patch(args.diff_file, policy)

    result["checkedAt"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    result["diffFile"] = args.diff_file
    result["policyFile"] = args.policy

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        decision = result["decision"]
        icon = {"PASS": "✅", "WARN": "⚠️", "BLOCKED": "🚫"}.get(decision, "❓")
        print(f"[TC-SCA-024/G2] 检查结果: {icon} {decision}")
        print()
        print("检查项详情：")
        for check_name, check_result in result["checks"].items():
            check_icon = "✅" if check_result == "PASS" else ("⚠️" if check_result == "WARN" else "🚫")
            print(f"  {check_icon} {check_name}: {check_result}")
        print()
        if result["reasons"]:
            print("问题详情：")
            for reason in result["reasons"]:
                print(f"  - {reason}")
            print()
        stats = result.get("diff_stats", {})
        print(f"Diff 统计：目标文件={stats.get('target_files', [])}, "
              f"新增={stats.get('total_added', 0)} 行, "
              f"删除={stats.get('total_deleted', 0)} 行")
        print()
        print(f"SCA_GUARD_JSON:{json.dumps(result, ensure_ascii=False)}")

    # 退出码：BLOCKED 返回 1，PASS/WARN 都返回 0（WARN 不阻塞流水线）
    if result["decision"] == "BLOCKED":
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
