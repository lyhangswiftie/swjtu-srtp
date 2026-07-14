# TC-SCA-020：SCA-HUD 主控制台拆分与状态治理

**分支**: `fix/TC-SCA-020-hud-state-refactor`  
**派生自**: `fix/TC-SCA-019-real-joern-cpg`（继承真实 CPG 链路）  
**关联 Issue**: #37  

---

## 目标

将 `DashboardConnected.tsx` 拆分为多个子组件和状态 hooks，降低耦合度，同时保持视觉布局和 TC-SCA-019 真实 CPG 渲染能力不退化。

---

## 拆分目标

### 子组件（9 个）

| 组件 | 职责 |
|------|------|
| `HudLayout.tsx` | 三列布局骨架，不含业务逻辑 |
| `ChatPanel.tsx` | 聊天消息列表 + 输入框 |
| `VulnListPanel.tsx` | CVE 漏洞列表 + 选择联动 |
| `CpgPanel.tsx` | CPG 图谱区域（含 joernError Banner） |
| `TerminalPanel.tsx` | 终端输出区域 |
| `SystemLogPanel.tsx` | 系统日志面板 |
| `ContextPanel.tsx` | 漏洞上下文/代码片段 |
| `RvpActionsPanel.tsx` | RVP 操作按钮区 |
| `DiffPanel.tsx` | Patch Diff 视图 |

### 状态 Hooks（5 个）

| Hook | 职责 |
|------|------|
| `useScaHudState.ts` | 全局 HUD 状态（顶层协调） |
| `useVulnSelection.ts` | CVE 选择与联动 |
| `useCpgRuntime.ts` | CPG 运行时状态（joernError/loading/data） |
| `useTerminalLogs.ts` | 终端日志状态 |
| `useRvpActions.ts` | RVP 操作状态 |

---

## 验收 Gates（G0–G7）

| Gate | 验收项 |
|------|--------|
| G0 | 分支存在 + 任务卡文档 + 目录结构 |
| G1 | DashboardConnected 职责减少，至少拆分 6 个子组件/hooks |
| G2 | 视觉布局不退化（HUD 三列、顶部状态栏、CPG、Terminal、右侧上下文） |
| G3 | TC-SCA-019 的真实 CPG 图谱仍可渲染，joernError Banner 正常 |
| G4 | 状态边界清晰，核心状态不再全堆在 DashboardConnected |
| G5 | 前端构建成功（npm ci && npm run build） |
| G6 | 选择不同 CVE 后至少 3 处联动正常 |
| G7 | 证据归档到 reports/TC-SCA-020/ 与 evidence/TC-SCA-020/ |

---

## 验证步骤

```bash
git fetch origin
git checkout fix/TC-SCA-020-hud-state-refactor

bash scripts/doctor.sh | tee reports/TC-SCA-020/doctor.log

cd frontend
npm ci | tee ../reports/TC-SCA-020/npm-ci.log
npm run build | tee ../reports/TC-SCA-020/frontend-build.log
cd ..

bash install.sh --mode demo | tee reports/TC-SCA-020/install-demo.log
```

---

## 证据要求

**reports/TC-SCA-020/**:
- `REPORT.md`、`doctor.log`、`npm-ci.log`、`frontend-build.log`、`install-demo.log`
- `component-map.md`（组件拆分关系图）
- `refactor-summary.md`（重构摘要）

**evidence/TC-SCA-020/**:
- HUD 前后截图、真实 CPG 渲染截图、Joern 错误态截图
