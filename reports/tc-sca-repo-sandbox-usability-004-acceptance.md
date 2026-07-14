# TC-SCA-REPO-SANDBOX-USABILITY-004 验收日志

**执行日期**: 2026-06-01  
**分支**: `tc-sca-repo-sandbox-usability-004`  
**基于**: `main` (70a20c69a5)

---

## 验收矩阵

| 验收项 | 命令 / 检查方式 | 结果 |
|--------|----------------|------|
| `bash -n install.sh` | `bash -n install.sh` | ✅ PASS |
| `bash -n scripts/sca_doctor.sh` | `bash -n scripts/sca_doctor.sh` | ✅ PASS |
| `npm run build` (DEMO_FALLBACK=false) | `VITE_ENABLE_DEMO_FALLBACK=false npm run build` | ✅ PASS (built in 1.78s) |
| `npm run build` (DEMO_FALLBACK=true) | `VITE_ENABLE_DEMO_FALLBACK=true npm run build` | ✅ PASS (built in 1.62s) |
| GitServiceError 错误分类 | `grep -rn "GitServiceError\|GitErrorType" frontend/src/` | ✅ PASS (10 matches) |
| RepositoryImportPanel 状态机 | `grep -rn "RepositoryImportPanel\|RepositoryImportState" frontend/src/` | ✅ PASS (15+ matches) |
| ENABLE_DEMO_FALLBACK 全量保护 | `grep -R "ENABLE_DEMO_FALLBACK" frontend/src/` | ✅ PASS (12 matches) |
| SCA_FORCE_RECREATE / SCA_UI_ONLY | `grep -n "SCA_FORCE_RECREATE\|SCA_UI_ONLY" install.sh` | ✅ PASS (8 matches) |
| sca_doctor.sh v4.0 (10 诊断项) | `bash -n scripts/sca_doctor.sh` | ✅ PASS |
| 设计文档 (3 份) | `ls docs/task-cards/REPOSITORY_IMPORT_STATE_MACHINE.md ...` | ✅ PASS |

---

## Commit 历史

```
f8df059c5d  docs: add design documents for repo import and sandbox lifecycle
439947de27  feat(install,doctor): add SCA_FORCE_RECREATE/SCA_UI_ONLY modes + sca_doctor v4.0
ae9e63e758  feat(sca-hud): full VITE_ENABLE_DEMO_FALLBACK protection for all mock data
0cf366f284  feat(sca-hud): integrate RepositoryImportPanel + sandbox status linkage + Agent error Banner
7881a544dd  feat(sca-hud): add RepositoryImportPanel with state machine
c1c6313b19  feat(git-service): add GitServiceError classification + fix installation index boundary
```

---

## 关键验收细节

### ENABLE_DEMO_FALLBACK 全量保护

所有 Mock 数据均受 `VITE_ENABLE_DEMO_FALLBACK` 开关保护：
- `MOCK_DIFF_DATA`: 已保护（TC-SCA-MAIN-STABILITY-003）
- `MOCK_CHAT_MESSAGES`: 已保护（TC-SCA-MAIN-STABILITY-003）
- `MOCK_TERMINAL_LOGS`: 已保护（本次 TC-SCA-REPO-SANDBOX-USABILITY-004）
- `INITIAL_VULN_LIST`: 已保护（本次 TC-SCA-REPO-SANDBOX-USABILITY-004）
- `MOCK_CPG_GRAPH`: 确认不存在，`cpgData` 始终初始化为 `null`

### RepositoryImportState 状态机

状态转换链：`IDLE → VALIDATING → CLONING → INDEXING → READY`  
错误状态：任意步骤失败 → `FAILED`（保留错误信息，支持 Retry）

### install.sh v4.0 安全模式

- `SCA_FORCE_RECREATE=1`: 强制删除并重建容器
- `SCA_UI_ONLY=1`: 跳过镜像拉取和容器启动，仅构建前端并注入

### sca_doctor.sh v4.0 新增诊断项

- 第 8 项: 仓库导入 API 分页参数边界验证（per_page=200, page=0）
- 第 9 项: 仓库导入状态机诊断（容器日志关键词扫描）
- 第 10 项: 前端构建产物 VITE_ENABLE_DEMO_FALLBACK 开关验证
