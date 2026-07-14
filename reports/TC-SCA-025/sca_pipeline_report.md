# TC-SCA-025 端到端流水线总报告（最终版）

**CVE ID**: `CVE-2024-22120`  
**Run ID**: `sca-20260507-143912`  
**总体状态**: ✅ `PIPELINE_WARN`  
**耗时**: 4.4s  
**生成时间**: 2026-05-07T15:21:31Z（C8 刷新）

---

## 验收 Gates（G0–G10）

| Gate | 验收项 | 状态 |
|------|--------|------|
| G0 | 分支、Issue、任务卡、配置文件、目录结构 | ✅ PASS |
| G1 | dry-run 输出 9 步骤计划 + pipeline-plan.json | ✅ PASS |
| G2 | 真实执行 7P/2W/0F，SCA_PIPELINE_STATUS: PIPELINE_WARN | ✅ PASS |
| G3 | sca_pipeline_smoke.sh 冒烟测试 | ✅ PASS |
| G4 | CPG 阶段：Joern 分析 + joern-cpg.json | ⚠️ WARN（无 Docker，降级 + inherited evidence） |
| G5 | PoC 阶段：poc_gate.py 安全闸门 | ⚠️ WARN（无 Docker，降级模式） |
| G6 | Patch 阶段：生成→检查→应用→回归→报告 | ✅ PASS（PATCH_VERIFIED） |
| G7 | 总报告生成：sca_pipeline_report.py + sca_evidence_index.py | ✅ PASS |
| G8 | 前端 Pipeline 组件（4 个）+ RvpActionsPanel 修改 | ✅ PASS（C5） |
| G9 | 前端构建验证（npm run build，5747 模块，27s） | ✅ PASS（C6，退出码 0） |
| G10 | 证据归档 reports/TC-SCA-025/ + evidence/TC-SCA-025/ | ✅ PASS（C7） |

---

## 流水线步骤详情

| 步骤 | 名称 | 状态 | 耗时 |
|------|------|------|------|
| 01 | CVE 数据一致性检查 | ✅ PASS | 25ms |
| 02 | Joern CPG 分析 | ⚠️ WARN | 3.9s |
| 03 | PoC 安全闸门 | ⚠️ WARN | 121ms |
| 04 | Patch 生成 | ✅ PASS | 42ms |
| 05 | Patch 安全检查 | ✅ PASS | 90ms |
| 06 | Patch 预检查 | ✅ PASS | 64ms |
| 07 | Patch 临时工作区应用 | ✅ PASS | 72ms |
| 08 | 回归验证 | ✅ PASS | 78ms |
| 09 | 修复报告生成 | ✅ PASS | 36ms |

---

## CPG 阶段说明（WARN + Inherited Evidence）

**降级原因**：TC-SCA-025 流水线执行时，沙箱环境无完整 Docker/Joern 运行时，
`c2cpg.sh` 未能在 `reports/TC-SCA-025/cpg/` 目录下生成新的 `joern-cpg.json`，
导致流水线 CPG 阶段返回 WARN（Missing artifacts）。

**处理方式（C8）**：CPG 证据继承自 TC-SCA-019（同一目标文件 `audit.c`，
同一 CVE `CVE-2024-22120`），已归档至 `reports/TC-SCA-025/cpg/joern-cpg.json`，
并在 `sca_pipeline_summary.json` 中标注 `inherited_from_TC-SCA-019`。

**CPG 统计**：
- 节点数（Node Count）：**124**
- 边数（Edge Count）：**124**
- 来源：TC-SCA-019 真实 Joern 分析结果（`reports/TC-SCA-019/joern-cpg.json`）

> 核心修复链路（Patch → Regression）不依赖 CPG 阶段输出，PATCH_VERIFIED 结论不受影响。

---

## 补丁验证结果

| 阶段 | 状态 |
|------|------|
| patch_guard 安全检查 | ✅ PASS |
| patch_apply --check 预检查 | ✅ PASS |
| regression_runner 回归验证 | ✅ REGRESSION_PASS |
| 总体补丁状态 | ✅ PATCH_VERIFIED |

---

## 前端 Pipeline 组件（G8）

| 组件 | 文件 | 功能 |
|------|------|------|
| PipelineStatusPanel | PipelineStatusPanel.tsx | 流水线状态总览面板（9 步骤 + P/W/F 计数） |
| PipelineStepCard | PipelineStepCard.tsx | 单步骤卡片（可展开详情） |
| PipelineRunHistory | PipelineRunHistory.tsx | 历史运行记录列表 |
| PipelineControlPanel | PipelineControlPanel.tsx | 控制面板（Run/Dry-Run + CVE 输入） |
| RvpActionsPanel | RvpActionsPanel.tsx | 修改：添加端到端 Pipeline 运行入口 |

---

## 证据文件清单

| 文件 | 说明 |
|------|------|
| `sca_pipeline_run.json` | 流水线完整运行记录（9 步骤状态/耗时/命令） |
| `pipeline-plan.json` | dry-run 计划（9 步骤命令预览） |
| `sca_pipeline_summary.json` | 总报告 JSON 摘要（C8 更新：cpgStats + G8/G9/G10） |
| `sca_evidence_index.json` | 证据索引（所有产物路径） |
| `cpg/joern-cpg.json` | CPG 证据（inherited from TC-SCA-019，124N/124E） |
| `patch/patch.diff` | CVE-2024-22120 unified diff（+2/-2 行） |
| `patch/patch-guard.json` | 补丁安全检查结果（PASS） |
| `patch/patch-apply-result.json` | 补丁应用结果（APPLIED） |
| `patch/regression-result.json` | 回归验证结果（REGRESSION_PASS） |
| `patch/patch_run.json` | 补丁运行完整报告（PATCH_VERIFIED） |
| `poc/poc_audit.jsonl` | PoC 审计日志（5 条记录） |
| `build-025.log` | 前端构建日志（5747 模块，27s，BUILD_PASS） |

---

## 分支与提交

**分支**: `fix/TC-SCA-025-e2e-pipeline-report`  
**Issue**: #40  
**Commits**: C1–C8（共 8 个，C8 为最终修正）

| Commit | 描述 |
|--------|------|
| C1 `962a58929` | docs: 任务卡 + sca_pipeline.yaml + 目录结构 |
| C2 `939e13253` | feat: sca_pipeline.py + sca_pipeline_steps.py + smoke.sh |
| C3 `0575b4117` | fix: patch_guard.py 接口修复 + pipeline.yaml 更新 |
| C4 `d383797a4` | feat: sca_pipeline_report.py + sca_evidence_index.py |
| C5 `84250d3ae` | feat: 4 个 Pipeline 前端组件 + RvpActionsPanel 修改 |
| C6 `8fc4d7772` | ci: 前端构建验证通过（G9） |
| C7 `f30601d12` | docs: 证据归档 + REPORT.md |
| C8 TBD | fix: 刷新总报告 + CPG inherited evidence + G8/G9/G10 PASS |

---

*报告由 `sca_pipeline_report.py` 生成，C8 刷新于 2026-05-07T15:21:31Z*
