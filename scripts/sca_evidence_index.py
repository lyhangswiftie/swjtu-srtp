#!/usr/bin/env python3
"""
TC-SCA-025 G7: 证据索引生成器
扫描 output_dir 下所有证据文件，生成 sca_evidence_index.json。

用法：
  python3 scripts/sca_evidence_index.py \
      --output-dir reports/TC-SCA-025 \
      --cve CVE-2024-22120
"""
import sys
import os
import json
import argparse
import datetime
from pathlib import Path


EVIDENCE_CATEGORIES = {
    "pipeline": ["sca_pipeline_run.json", "pipeline-plan.json", "sca_pipeline_summary.json",
                 "sca_pipeline_report.md", "pipeline.log", "pipeline-dry-run.log"],
    "cpg": ["joern-cpg.json", "cpg.dot", "joern-smoke.log"],
    "poc": ["poc_audit.jsonl", "sample_poc.py"],
    "patch": ["patch.diff", "patch-guard.json", "patch-apply-result.json",
              "regression-result.json", "patch_run.json"],
    "reports": ["REPORT.md", "doctor.log", "npm-ci.log", "frontend-build.log"],
    "screenshots": [".webp", ".png", ".jpg"],
}


def scan_evidence(output_dir: str) -> dict:
    """扫描目录下所有证据文件，按类别分组"""
    index = {cat: [] for cat in EVIDENCE_CATEGORIES}
    index["other"] = []

    output_path = Path(output_dir)
    if not output_path.exists():
        return index

    for file_path in sorted(output_path.rglob("*")):
        if not file_path.is_file():
            continue

        rel_path = str(file_path.relative_to(output_path))
        file_info = {
            "path": rel_path,
            "size": file_path.stat().st_size,
            "modifiedAt": datetime.datetime.utcfromtimestamp(
                file_path.stat().st_mtime
            ).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        # 按类别分类
        categorized = False
        for cat, patterns in EVIDENCE_CATEGORIES.items():
            for pattern in patterns:
                if pattern.startswith("."):
                    # 扩展名匹配
                    if file_path.suffix.lower() == pattern:
                        index[cat].append(file_info)
                        categorized = True
                        break
                else:
                    # 文件名匹配
                    if file_path.name == pattern or pattern in file_path.name:
                        index[cat].append(file_info)
                        categorized = True
                        break
            if categorized:
                break

        if not categorized:
            index["other"].append(file_info)

    return index


def main():
    parser = argparse.ArgumentParser(
        description="TC-SCA-025 G7: 证据索引生成器"
    )
    parser.add_argument("--output-dir",
                        default="reports/TC-SCA-025",
                        help="证据目录路径")
    parser.add_argument("--cve",
                        default="CVE-2024-22120",
                        help="CVE ID")
    args = parser.parse_args()

    print(f"[TC-SCA-025/G7] 证据索引生成器启动")
    print(f"[TC-SCA-025/G7] 扫描目录: {args.output_dir}")
    print("=" * 60)

    evidence = scan_evidence(args.output_dir)

    # 统计
    total_files = sum(len(v) for v in evidence.values())
    total_size = 0
    for cat_files in evidence.values():
        for f in cat_files:
            total_size += f["size"]

    index_data = {
        "schema": "sca-evidence-index-v1",
        "cveId": args.cve,
        "outputDir": args.output_dir,
        "generatedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stats": {
            "totalFiles": total_files,
            "totalSizeBytes": total_size,
            "byCategory": {cat: len(files) for cat, files in evidence.items()},
        },
        "evidence": evidence,
    }

    # 保存索引
    index_path = os.path.join(args.output_dir, "sca_evidence_index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)

    print(f"[TC-SCA-025/G7] ✅ 证据索引: {index_path}")
    print(f"[TC-SCA-025/G7] 总文件数: {total_files}")
    print(f"[TC-SCA-025/G7] 总大小: {total_size / 1024:.1f} KB")
    print(f"")
    for cat, files in evidence.items():
        if files:
            print(f"  {cat}: {len(files)} 个文件")
    print(f"")
    print(f"SCA_EVIDENCE_INDEX: GENERATED")


if __name__ == "__main__":
    main()
