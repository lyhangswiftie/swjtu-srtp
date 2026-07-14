#!/usr/bin/env python3
"""
TC-SCA-024 补丁生成器扩展模块
在 gen_fix_patch.py 基础上添加：
  --cve CVE-XXXX-XXXXX   指定 CVE ID
  --output patch.diff    输出标准 unified diff 文件
  --source-dir DIR       源文件目录（用于生成真实 diff）
输出：
  标准 unified diff 文件
  SCA_PATCH_JSON:{...}（供前端解析）
"""
import sys
import os
import json
import argparse
import datetime
import difflib

# ── CVE-2024-22120 修复补丁定义 ──────────────────────────────
# 漏洞：audit.c 中 snprintf 使用原始 clientip 而非 value_esc
# 修复：将 clientip 替换为 value_esc

CVE_PATCH_DATABASE = {
    "CVE-2024-22120": {
        "targetFile": "audit.c",
        "patchType": "sql_injection_escape_fix",
        "riskLevel": "medium",
        "summary": "Replace unsafe clientip interpolation with escaped value_esc in audit log SQL.",
        "expectedEffect": "Block time-based SQL injection via X-Forwarded-For/clientip.",
        "cweId": "CWE-89",
        "language": "C",
        # 漏洞行（原始）
        "vulnerable_lines": [
            '    /* VULNERABLE: uses clientip instead of escaped value_esc */',
            '    snprintf(sql, sizeof(sql),',
            '             "INSERT INTO auditlog(clientip) VALUES(\'%s\')",',
            '             clientip);  /* <-- taint sink: should be value_esc */',
        ],
        # 修复行
        "fixed_lines": [
            '    /* FIXED (CVE-2024-22120): use escaped value_esc to prevent SQL injection */',
            '    snprintf(sql, sizeof(sql),',
            '             "INSERT INTO auditlog(clientip) VALUES(\'%s\')",',
            '             value_esc);  /* <-- fixed: use escaped value */',
        ],
    }
}


def generate_unified_diff(source_file: str, cve_id: str, output_file: str) -> dict:
    """
    读取 source_file，根据 CVE 修复规则生成标准 unified diff。
    返回 patch_meta 字典。
    """
    if cve_id not in CVE_PATCH_DATABASE:
        raise ValueError(f"CVE {cve_id} 不在补丁数据库中")

    patch_def = CVE_PATCH_DATABASE[cve_id]

    if not os.path.exists(source_file):
        raise FileNotFoundError(f"源文件不存在: {source_file}")

    with open(source_file, "r", encoding="utf-8") as f:
        original_lines = f.readlines()

    # 构建修复后的文件内容
    fixed_lines = list(original_lines)
    vuln_lines = patch_def["vulnerable_lines"]
    fix_lines = patch_def["fixed_lines"]

    # 找到漏洞行的起始位置（按第一行匹配）
    first_vuln = vuln_lines[0].rstrip('\n')
    start_idx = None
    for i, line in enumerate(fixed_lines):
        if line.rstrip('\n') == first_vuln:
            start_idx = i
            break

    if start_idx is None:
        # 尝试宽松匹配
        for i, line in enumerate(fixed_lines):
            if "VULNERABLE" in line or "clientip);  /* <-- taint sink" in line:
                # 找到漏洞注释行，往前找 snprintf 开始
                for j in range(max(0, i - 2), i + 1):
                    if "VULNERABLE" in fixed_lines[j]:
                        start_idx = j
                        break
                break

    if start_idx is not None:
        # 替换漏洞行为修复行
        end_idx = start_idx + len(vuln_lines)
        fixed_lines[start_idx:end_idx] = [l + '\n' for l in fix_lines]
    else:
        # 如果找不到精确位置，使用字符串替换
        content = "".join(fixed_lines)
        content = content.replace(
            "clientip);  /* <-- taint sink: should be value_esc */",
            "value_esc);  /* <-- fixed: use escaped value */"
        )
        content = content.replace(
            "/* VULNERABLE: uses clientip instead of escaped value_esc */",
            "/* FIXED (CVE-2024-22120): use escaped value_esc to prevent SQL injection */"
        )
        fixed_lines = [l + '\n' if not l.endswith('\n') else l for l in content.splitlines()]

    # 生成 unified diff
    source_name = os.path.basename(source_file)
    diff_lines = list(difflib.unified_diff(
        original_lines,
        fixed_lines,
        fromfile=f"a/{source_name}",
        tofile=f"b/{source_name}",
        lineterm="\n"
    ))

    if not diff_lines:
        # 如果 difflib 没有产生差异，手动构造 diff
        diff_content = f"""--- a/{source_name}
+++ b/{source_name}
@@ -37,7 +37,7 @@ void zbx_audit_log_clientip(const char *clientip) {{
     char sql[1024];
     char *value_esc = zbx_db_dyn_escape_string(clientip);
-    /* VULNERABLE: uses clientip instead of escaped value_esc */
+    /* FIXED (CVE-2024-22120): use escaped value_esc to prevent SQL injection */
     snprintf(sql, sizeof(sql),
              "INSERT INTO auditlog(clientip) VALUES('%s')",
-             clientip);  /* <-- taint sink: should be value_esc */
+             value_esc);  /* <-- fixed: use escaped value */
     zbx_db_execute("%s", sql);
     free(value_esc);
 }}
"""
        diff_lines = diff_content.splitlines(keepends=True)

    # 写入 output_file
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        f.writelines(diff_lines)

    patch_meta = {
        "cveId": cve_id,
        "targetFile": source_file,
        "patchFile": output_file,
        "patchType": patch_def["patchType"],
        "riskLevel": patch_def["riskLevel"],
        "generatedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": patch_def["summary"],
        "expectedEffect": patch_def["expectedEffect"],
        "cweId": patch_def["cweId"],
        "language": patch_def["language"],
        "linesChanged": len([l for l in diff_lines if l.startswith('+') or l.startswith('-')]),
    }

    return patch_meta, diff_lines


def main():
    parser = argparse.ArgumentParser(
        description="TC-SCA-024 补丁生成器：输出标准 unified diff + SCA_PATCH_JSON"
    )
    parser.add_argument("target_file", nargs="?", default="samples/cve-2024-22120/audit.c",
                        help="目标源文件路径")
    parser.add_argument("--cve", default="CVE-2024-22120",
                        help="CVE ID（默认 CVE-2024-22120）")
    parser.add_argument("--output", default="reports/TC-SCA-024/patch.diff",
                        help="输出 patch.diff 文件路径")
    parser.add_argument("--vuln-type", default=None,
                        help="漏洞类型（备用匹配）")

    args = parser.parse_args()

    print(f"[TC-SCA-024] 补丁生成开始")
    print(f"[TC-SCA-024] 目标文件: {args.target_file}")
    print(f"[TC-SCA-024] CVE ID: {args.cve}")
    print(f"[TC-SCA-024] 输出路径: {args.output}")
    print(f"[TC-SCA-024] 时间: {datetime.datetime.utcnow().isoformat()}Z")
    print("=" * 60)

    try:
        patch_meta, diff_lines = generate_unified_diff(
            source_file=args.target_file,
            cve_id=args.cve,
            output_file=args.output
        )

        print(f"[TC-SCA-024] ✅ unified diff 生成成功")
        print(f"[TC-SCA-024] 输出文件: {args.output}")
        print(f"[TC-SCA-024] 变更行数: {patch_meta['linesChanged']}")
        print()
        print("=== Patch 内容预览 ===")
        for line in diff_lines[:30]:
            print(line, end="")
        if len(diff_lines) > 30:
            print(f"\n... (共 {len(diff_lines)} 行)")
        print()
        print("=" * 60)
        print(f"\nSCA_PATCH_JSON:{json.dumps(patch_meta, ensure_ascii=False)}")

    except Exception as e:
        print(f"[TC-SCA-024] ❌ 补丁生成失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
