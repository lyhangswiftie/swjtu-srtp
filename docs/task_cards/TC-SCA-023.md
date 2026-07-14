# TC-SCA-023：PoC 执行安全闸门与结果可信度提升

**Issue**：#38
**分支**：`fix/TC-SCA-023-poc-gate`
**基线分支**：`fix/TC-SCA-020-hud-state-refactor`
**优先级**：P1

---

## 背景

TC-SCA-020 完成了 SCA-HUD 主控制台拆分与状态治理。现在 HUD、CPG、状态治理都具备基础，下一步最有价值的是把 PoC（Proof of Concept，漏洞利用验证代码）从"生成文本"推进到"受控执行、可审计、可复现"。

当前问题：
- `gen_poc.py` 只生成 PoC 文本，不执行
- 没有安全校验机制（危险命令可能直接执行）
- 没有审计日志，无法追溯执行历史
- 前端只显示静态 PoC 文本，无法反映执行状态

---

## 目标

将 PoC 执行从纯文本生成升级为受控、可审计的安全执行链路：

```
gen_poc.py（生成 PoC 文本）
  → poc_gate.py（安全闸门：白名单/黑名单校验）
  → poc_runner.py（沙箱隔离执行：Docker subprocess）
  → poc_audit.py（审计日志：JSON Lines 格式）
  → 前端 PocStatusBadge（状态展示：PENDING/RUNNING/PASS/FAIL/BLOCKED）
```

---

## 验收 Gates

| Gate | 验收项 | 证据 |
|------|--------|------|
| G0 | 分支创建 + 任务卡文档 | `docs/task_cards/TC-SCA-023.md` |
| G1 | `poc_gate.py` 实现白名单/黑名单校验，单元测试通过 | `tests/test_poc_gate.py` 输出 |
| G2 | `poc_runner.py` 实现沙箱隔离执行（Docker subprocess），超时控制 | `poc_runner.py` + 执行日志 |
| G3 | `poc_audit.py` 生成结构化审计日志（JSON Lines 格式） | `poc_audit.jsonl` 样例 |
| G4 | 前端 `PocStatusBadge` 组件展示执行状态，前端构建通过 | `npm run build` 退出码 0 |
| G5 | 真实执行 CVE-2024-22120 PoC，审计日志记录完整 | `poc_audit.jsonl` 实际记录 |
| G6 | 浏览器截图：PocStatusBadge 状态变化（PENDING/RUNNING/PASS/FAIL/BLOCKED） | 截图证据 |
| G7 | 证据归档到 `reports/TC-SCA-023/` + `evidence/TC-SCA-023/` | 目录文件清单 |

---

## 核心文件

### 后端脚本

| 文件 | 职责 |
|------|------|
| `scripts/poc_gate.py` | 安全闸门：CVE 白名单、危险命令黑名单、执行前校验 |
| `scripts/poc_runner.py` | 沙箱隔离执行器：Docker subprocess、超时控制、资源限制 |
| `scripts/poc_audit.py` | 审计日志：JSON Lines 格式，记录每次执行的完整上下文 |
| `tests/test_poc_gate.py` | poc_gate.py 单元测试 |

### 前端组件

| 文件 | 职责 |
|------|------|
| `frontend/src/components/sca-hud/PocStatusBadge.tsx` | PoC 执行状态徽章组件 |
| `frontend/src/components/sca-hud/PocAuditTrail.tsx` | 审计迹迹展示组件 |

---

## 安全设计原则

1. **最小权限**：PoC 在 Docker 容器中执行，无网络访问，只读挂载源码
2. **白名单优先**：只允许 CVE 白名单中的 PoC 执行
3. **黑名单兜底**：危险命令（`rm -rf`、`curl`、`wget` 等）直接 BLOCKED
4. **超时强制**：默认 30 秒超时，防止无限循环
5. **完整审计**：每次执行（包括 BLOCKED）都记录到审计日志
