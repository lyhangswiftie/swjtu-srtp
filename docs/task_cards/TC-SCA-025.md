# TC-SCA-025：端到端一键流水线编排与总报告生成

## 任务定位

将 TC-SCA-018/019/023/024 的分散能力串成统一流水线：

```
CVE-2024-22120 / audit.c
  → 环境检查 → CVE 数据一致性检查 → Joern CPG 分析
  → PoC 安全闸门与审计 → Patch 生成 → Patch 安全检查
  → 临时工作区应用 → 回归验证 → 风险评估
  → 总报告生成 → 前端 Pipeline 面板展示
```

## 分支

- 修复分支：`fix/TC-SCA-025-e2e-pipeline-report`
- 基线分支：`fix/TC-SCA-024-patch-regression-loop`
- GitHub Issue：#40

## 验收 Gates

| Gate | 验收项 | 标准 |
|------|--------|------|
| G0 | 分支与任务卡 | 文件存在 |
| G1 | Pipeline 配置（dry-run） | 输出计划，生成 pipeline-plan.json |
| G2 | 一键真实执行 | 退出码 0，生成 sca_pipeline_run.json |
| G3 | 阶段状态完整 | steps >= 6，status 合法 |
| G4 | CPG 阶段证据 | cpg/joern-cpg.json 存在，nodes/edges > 0 |
| G5 | PoC 阶段证据 | poc/poc_audit.jsonl 存在，含 gate_decision |
| G6 | Patch 阶段证据 | patch/{patch.diff, patch-guard.json, regression-result.json, patch_run.json} 存在 |
| G7 | 总报告生成 | sca_pipeline_report.md/json 存在，overallStatus 合法 |
| G8 | 前端构建 | npm run build 退出码 0 |
| G9 | 前端展示 | PipelineStatusPanel 可见，不破坏三列布局 |
| G10 | 证据归档 | reports/evidence 包含所有阶段日志、JSON、截图 |

## 新增文件

### 脚本
- `scripts/sca_pipeline.py` - 一键流水线编排器
- `scripts/sca_pipeline_steps.py` - 阶段适配器与状态模型
- `scripts/sca_pipeline_report.py` - 总报告生成器
- `scripts/sca_evidence_index.py` - 证据索引生成器
- `scripts/sca_pipeline_smoke.sh` - 快速冒烟测试

### 配置
- `configs/sca_pipeline.yaml` - 流水线配置文件

### 前端组件
- `PipelineStatusPanel.tsx` - 完整步骤链展示
- `PipelineStepBadge.tsx` - 单个阶段状态徽章
- `PipelineReportPanel.tsx` - 总报告摘要展示
- `EvidenceArchivePanel.tsx` - 证据索引展示

## Commit 规划

- C1: 任务卡、配置与目录结构
- C2: sca_pipeline.py + sca_pipeline_steps.py
- C3: sca_pipeline_smoke.sh（dry-run 验证）
- C4: sca_pipeline_report.py + sca_evidence_index.py
- C5: 前端 4 个 Pipeline 组件
- C6: RvpActionsPanel 联动入口修改
- C7: 证据归档 + REPORT.md
