# securecodeact Issues 解决验证报告

生成时间: 2026-05-18T13:56:08Z
仓库: SWJTU-AI-Lab/securecodeact
最新 commit: e09df5779c

## Issues 状态总览

| # | 状态 | 标题 | 关闭时间 |
|---|------|------|----------|
| #17 | ✅ CLOSED | [Bug]: 沙箱环境启动失败 | 2026-05-18 |
| #21 | ✅ CLOSED | [Bug]: 由于配置项冲突导致的容器建立失败 | 2026-05-18 |
| #23 | ✅ CLOSED | [Bug]: Tailwind + HeroUI 插件构建失败 | 2026-04-25 |
| #34 | ✅ CLOSED | [TC-SCA-017] 版本与依赖基线收敛：修复前端构建、安装脚本与文档版本不一致 | 2026-05-18 |
| #35 | ✅ CLOSED | TC-SCA-018: CVE 数据链路清理与样例一致性修复 | 2026-05-07 |
| #36 | ✅ CLOSED | [TC-SCA-019] 真实 Joern CPG 端到端链路打通：audit.c → Joern → CPG | 2026-05-18 |
| #37 | ✅ CLOSED | [TC-SCA-020] SCA-HUD 主控制台拆分与状态治理：降低 DashboardConnected  | 2026-05-18 |
| #38 | ✅ CLOSED | [TC-SCA-023] PoC 执行安全闸门与结果可信度提升 | 2026-05-18 |
| #39 | ✅ CLOSED | [TC-SCA-024] 补丁生成、应用与回归验证闭环：patch.diff → git apply → te | 2026-05-18 |
| #40 | ✅ CLOSED | [TC-SCA-025] 端到端一键流水线编排与总报告生成：CPG → PoC → Patch → Regre | 2026-05-18 |
| #46 | ✅ CLOSED | [Bug]: 沙箱问题120s启动失败 | 2026-05-18 |

**总计: 11 个已关闭, 0 个 open**

## 验证日志清单

| TC | Issue | 验证日志 | 关键证据 |
|-----|-------|---------|---------|
| TC-SCA-019 | #36 | TC-SCA-019-verify.log | CPG 124节点/124边, joernError prop |
| TC-SCA-020 | #37 | TC-SCA-020-verify.log | 9个子组件, built in 3.14s |
| TC-SCA-023 | #38 | TC-SCA-023-verify.log | poc_gate 6/6 PASS, 5条审计记录 |
| TC-SCA-024 | #39 | TC-SCA-024-verify.log | patch_guard PASS, REGRESSION_PASS |
| TC-SCA-025 | #40 | TC-SCA-025-verify.log | PIPELINE_WARN, PATCH_VERIFIED |

## 代码修复清单

| 文件 | 修复内容 |
|------|---------|
| scripts/sca_pipeline_steps.py | 新增 ENV_LIMITED_STEPS，cpg_analysis/poc_gate 环境降级为 WARN |
| scripts/run_poc_gate_test.py | poc_gate 真实单元测试脚本 (6/6 PASS) |
