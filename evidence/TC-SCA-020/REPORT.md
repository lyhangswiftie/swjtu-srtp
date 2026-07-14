# TC-SCA-020 验收报告：SCA-HUD 主控制台拆分与状态治理

**分支**：`fix/TC-SCA-020-hud-state-refactor`
**基线分支**：`fix/TC-SCA-019-real-joern-cpg`（继承真实 CPG 链路）
**执行时间**：2026-05-07
**最终结论**：✅ PASS（G0–G7 全部通过）

---

## 验收 Gates 结果

| Gate | 验收项 | 结果 | 证据 |
|------|--------|------|------|
| G0 | 分支创建 + 目录结构 + 任务卡文档 | ✅ PASS | `docs/task_cards/TC-SCA-020.md` |
| G1 | DashboardConnected 拆分 ≥6 个子组件/hooks | ✅ PASS | 9 子组件 + 5 hooks（见下表） |
| G2 | 视觉布局不退化（三列 + 顶部/底部状态栏） | ✅ PASS | `g5-hud-full-3col-layout.webp` |
| G3 | TC-SCA-019 真实 CPG 图谱仍可渲染 | ✅ PASS | `g5-hud-full-3col-layout.webp`（CPG 区域可见） |
| G4 | 状态边界清晰，核心状态不再全堆在 DashboardConnected | ✅ PASS | 5 个状态 hooks 独立管理各自状态域 |
| G5 | 前端构建成功 (npm run build) | ✅ PASS | `frontend-build.log`（✓ built in 5m 59s） |
| G6 | 选择不同 CVE 后至少 3 处联动正常 | ✅ PASS | `g6-cve-linkage-34716.webp`（3 处联动截图） |
| G7 | 证据归档到 reports/TC-SCA-020/ + evidence/TC-SCA-020/ | ✅ PASS | 本报告 + 截图 + 日志 |

---

## 拆分成果

### 新增子组件（9 个）

| 文件 | 职责 | 行数 |
|------|------|------|
| `HudLayout.tsx` | 三列主布局骨架 + 顶部/底部状态栏 | ~100 |
| `ChatPanel.tsx` | 聊天消息列表 + 输入框 | ~120 |
| `VulnListPanel.tsx` | CVE 漏洞列表（可选中） | ~100 |
| `CpgPanel.tsx` | CPG 图谱区域（含 joernError 错误态） | ~80 |
| `TerminalPanel.tsx` | 终端输出区域（xterm.js 封装） | ~80 |
| `SystemLogPanel.tsx` | 系统日志面板（独立滚动） | ~80 |
| `ContextPanel.tsx` | 漏洞上下文/元数据面板 | ~70 |
| `RvpActionsPanel.tsx` | RVP 安全分析操作按钮组 | ~150 |
| `DiffPanel.tsx` | 代码修复 Diff 视图 | ~50 |

### 新增状态 hooks（5 个）

| 文件 | 管理的状态域 |
|------|-------------|
| `useVulnSelection.ts` | 当前选中 CVE、目标文件、联动触发 |
| `useCpgRuntime.ts` | CPG JSON 数据、Joern 错误状态、渲染模式 |
| `useTerminalLogs.ts` | 终端日志条目、过滤器、自动滚动 |
| `useRvpActions.ts` | RVP 操作状态、命令历史、执行结果 |
| `useScaHudState.ts` | 全局 HUD 状态协调（组合上述 hooks） |

---

## 前端构建结果

```
$ npm run build
✓ built in 5m 59s（退出码 0）
```

**无 TypeScript 错误，无 ESLint 错误。** 仅有 chunk size 警告（非错误，已知问题，不影响功能）。

---

## G6 CVE 联动验证

切换到 CVE-2024-34716（PrestaShop XSS）后，以下 3 处均已联动更新：

1. **底部状态栏**：`CVE-2024-34716 | PrestaShop 客服工单上传未验证文件类型...`
2. **右侧元数据面板**：CVE 编号/类型（Stored XSS 8.1）/CVSS/目标文件（CustomerThreadController.php）全部更新
3. **中列 CPG 图谱**：切换为 CustomerThreadController.php 的 XSS 污点传播图谱

---

## 证据文件清单

| 文件 | 说明 |
|------|------|
| `REPORT.md` | 本报告 |
| `frontend-build.log` | npm run build 完整日志（✓ built in 5m 59s） |
| `g5-hud-full-3col-layout.webp` | G2/G3/G5 - HUD 三列布局 + CPG 渲染截图 |
| `g6-cve-linkage-34716.webp` | G6 - CVE-2024-34716 联动截图（3 处变化） |

---

## 组件映射（component-map）

```
DashboardConnected.tsx（主协调器，已瘦身）
├── HudLayout.tsx（布局骨架）
│   ├── 左列
│   │   ├── ChatPanel.tsx
│   │   └── VulnListPanel.tsx
│   ├── 中列
│   │   ├── CpgPanel.tsx（含 joernError Banner）
│   │   ├── SystemLogPanel.tsx
│   │   └── DiffPanel.tsx
│   └── 右列
│       ├── TerminalPanel.tsx
│       ├── ContextPanel.tsx
│       └── RvpActionsPanel.tsx
└── hooks/
    ├── useScaHudState.ts（全局协调）
    ├── useVulnSelection.ts
    ├── useCpgRuntime.ts
    ├── useTerminalLogs.ts
    └── useRvpActions.ts
```
