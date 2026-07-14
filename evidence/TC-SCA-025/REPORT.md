# TC-SCA-025 证据归档报告（最终封板版）

**任务卡**：TC-SCA-025 — 端到端一键流水线编排与总报告生成  
**分支**：`fix/TC-SCA-025-e2e-pipeline-report`  
**Issue**：[#40](https://github.com/SWJTU-AI-Lab/securecodeact/issues/40)  
**归档日期**：2026-05-07  
**最终状态**：PIPELINE_WARN（7P/2W/0F）

---

## 验收 Gates 完成情况

| Gate | 描述 | 状态 | 证据 |
|------|------|------|------|
| G0 | 分支、Issue #40、任务卡、sca_pipeline.yaml、目录结构 | ✅ PASS | C1 |
| G1 | dry-run 验证（9 步骤计划 + pipeline-plan.json） | ✅ PASS | pipeline-plan.json |
| G2 | 真实执行（7P/2W/0F，PIPELINE_WARN，4431ms） | ✅ PASS | sca_pipeline_run.json |
| G3 | sca_pipeline_smoke.sh 冒烟测试 | ✅ PASS | C2 |
| G4 | CPG 阶段（WARN，无 Docker 降级） | ⚠️ WARN | cpg/joern-cpg.json (inherited) |
| G5 | PoC 阶段（WARN，无 Docker 降级） | ⚠️ WARN | poc/ |
| G6 | Patch 阶段（PASS，PATCH_VERIFIED） | ✅ PASS | patch/ |
| G7 | 总报告生成（sca_pipeline_report.py + sca_evidence_index.py） | ✅ PASS | sca_pipeline_report.md |
| G8 | 前端 Pipeline 组件（4 个组件） | ✅ PASS | frontend_components/ |
| G9 | 前端构建验证（npm run build，5747 模块，27s） | ✅ PASS | build-025.log |
| G10 | 证据归档（REPORT.md + evidence/TC-SCA-025/） | ✅ PASS | 本文件 |

---

## 核心成果与 CPG 降级说明

**核心修复链路闭环**：
Patch 生成、安全检查、预检查、临时工作区应用、回归验证、修复报告生成全部 PASS（PATCH_VERIFIED）。

**CPG 阶段降级说明（WARN）**：
TC-SCA-025 流水线执行时，沙箱环境无完整 Docker/Joern 运行时，`c2cpg.sh` 未能在 `reports/TC-SCA-025/cpg/` 目录下生成新的 `joern-cpg.json`。
**处理方式**：CPG 证据继承自 TC-SCA-019（同一目标文件 `audit.c`，同一 CVE `CVE-2024-22120`，124 Nodes / 124 Edges），已归档至 `evidence/TC-SCA-025/cpg/joern-cpg.json`，并在 `sca_pipeline_summary.json` 中标注 `inherited_from_TC-SCA-019`。核心修复链路不依赖此输出，不受影响。

---

## 证据文件清单

| 文件 | 描述 |
|------|------|
| sca_pipeline_run.json | 真实流水线执行结果（7P/2W/0F） |
| sca_pipeline_summary.json | 流水线 JSON 摘要（含 cpgStats 和 G8-G10 PASS） |
| sca_pipeline_report.md | Markdown 总报告（最终刷新版） |
| sca_evidence_index.json | 证据索引（包含 inherited CPG） |
| pipeline-plan.json | dry-run 规划结果（9 步骤） |
| build-025.log | 前端构建日志（5747 模块，27s，BUILD_PASS） |
| cpg/joern-cpg.json | CPG 分析阶段证据（inherited from TC-SCA-019） |
| poc/ | PoC 安全闸门阶段证据 |
| patch/ | Patch 生成/应用/验证阶段证据 |
| frontend_components/ | 4 个 Pipeline 前端组件源码 |
