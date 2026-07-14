# TC-SCA-024：补丁生成、应用与回归验证闭环

**Issue**：#39
**分支**：`fix/TC-SCA-024-patch-regression-loop`
**基线分支**：`fix/TC-SCA-023-poc-gate`
**状态**：进行中

---

## 任务定位

TC-SCA-024 要解决的是最后一个关键问题：

> "发现漏洞以后，系统能不能安全、可信、可验证地完成修复？"

当前已有 `gen_fix_patch.py` 补丁生成脚本，但它更偏"生成修复建议/模板"。TC-SCA-024 要把它升级为：

```
生成补丁 → 校验补丁 → 应用补丁 → 运行测试 → 生成风险报告 → 前端 Diff/验证状态展示
```

---

## 验收 Gates

| Gate | 验收项 | 标准 |
|------|--------|------|
| G0 | 分支与任务卡 | 创建 fix/TC-SCA-024-patch-regression-loop，新增任务卡 |
| G1 | Patch 生成 | gen_fix_patch.py 能输出标准 unified diff |
| G2 | Patch 安全检查 | patch_guard.py 能阻断危险补丁 |
| G3 | Patch 预检查 | patch_apply.py --check 调用 git apply --check 成功 |
| G4 | 临时工作区应用 | Patch 应用在临时目录，不污染原仓库 |
| G5 | 回归验证 | regression_runner.py 可执行最小测试并输出 PASS/FAIL |
| G6 | 审计记录 | 生成 patch_run.json，包含生成、检查、应用、测试、风险结论 |
| G7 | 前端构建 | npm ci && npm run build 成功 |
| G8 | 前端展示 | DiffPanel 展示 patch 状态、测试结果、风险等级 |
| G9 | 证据归档 | reports/evidence 目录包含日志、JSON、截图 |

---

## 修复范围

### 后端新增脚本

- `scripts/patch_guard.py`
- `scripts/patch_apply.py`
- `scripts/regression_runner.py`
- `scripts/patch_report.py`
- `configs/patch_policy.yaml`
- `tests/fixtures/patches/`
- `tests/unit/test_patch_guard.py`
- `tests/unit/test_patch_apply.py`
- `tests/regression/test_cve_2024_22120_patch.py`

### 后端修改

- `scripts/gen_fix_patch.py`（添加 --cve/--output 参数，输出 unified diff + SCA_PATCH_JSON）

### 前端新增组件

- `PatchStatusBadge.tsx`
- `PatchAuditTrail.tsx`
- `PatchVerificationPanel.tsx`

### 前端修改

- `DiffPanel.tsx`
- `RvpActionsPanel.tsx`
- `hooks/useRvpActions.ts`

---

## 核心状态机

```
IDLE → GENERATING_PATCH → PATCH_GENERATED
  → PATCH_GUARD_CHECKING → PATCH_GUARD_PASSED / BLOCKED
  → APPLY_CHECKING → APPLY_CHECK_PASSED / APPLY_CHECK_FAILED
  → APPLYING_TO_TEMP_WORKDIR → PATCH_APPLIED / APPLY_FAILED
  → RUNNING_REGRESSION → REGRESSION_PASSED / REGRESSION_FAILED
  → RISK_ASSESSING → REPORT_SAVED
```

---

## CVE-2024-22120 修复补丁样例

针对 `samples/cve-2024-22120/audit.c`，修复目标：

- 不要把原始 `clientip` 直接写入 SQL
- 应使用 `value_esc` 或更安全的参数化机制

---

## Commit 规划

| Commit | 内容 |
|--------|------|
| C1 | 任务卡、策略文件与目录 |
| C2 | gen_fix_patch.py 标准化（unified diff + SCA_PATCH_JSON） |
| C3 | patch_guard.py + patch_policy.yaml + 单元测试 |
| C4 | patch_apply.py（--check + --apply）+ 单元测试 |
| C5 | regression_runner.py + 回归测试 |
| C6 | patch_report.py（patch_run.json） |
| C7 | 前端 Patch 状态与 Diff 闭环 |
| C8 | 验收证据归档 |
