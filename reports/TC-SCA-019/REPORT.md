# TC-SCA-019 测试报告：真实 Joern CPG 端到端链路

**测试日期**: 2026-05-07  
**分支**: `fix/TC-SCA-019-real-joern-cpg`  
**最终结论**: ✅ **PASS**

---

## 验收 Gates 结果（G0–G7 全部通过）

| Gate | 验收项 | 结果 | 证据 |
|------|--------|------|------|
| G0 | 分支创建 + 目录结构 + 任务卡文档 | ✅ PASS | `docs/task_cards/TC-SCA-019.md` |
| G1 | `samples/cve-2024-22120/audit.c` + `cpg-dot-minimal` + `cpg_to_json.py` 离线测试 | ✅ PASS | `cpg_from_dot.json` (3.8 KB) |
| G2 | `joern_cpg_smoke.sh` 执行真实 Joern 分析 | ✅ PASS | `joern-smoke.log` (75 KB) |
| G3 | CPG JSON Schema 校验（nodes/edges/meta 字段） | ✅ PASS | `joern-cpg.json` (42 KB, 124 节点/124 边) |
| G4 | `CpgGraph.tsx` 添加 `joernError` prop + 前端构建 | ✅ PASS | `npm run build` ✓ built in 22.88s |
| G5 | Demo 启动 + CPG 图谱真实渲染截图 | ✅ PASS | `g5-cpg-real-render-full-hud.webp` |
| G6 | Joern 错误态 Banner 不崩溃不白屏 | ✅ PASS | `g6-joern-error-banner.webp` |
| G7 | 证据归档 + 4 个 Commit | ✅ PASS | 见下方 Commit 清单 |

---

## 端到端链路验证

```
audit.c (CVE-2024-22120)
  → c2cpg.sh (Joern 1.x, Java 17)
  → CPG bin (cpg.bin)
  → joern-export --repr cpg14 --format dot
  → cpg-dot-export/*.dot (真实 Joern DOT 格式)
  → cpg_to_json.py --dot ... --output ...
  → joern-cpg.json (124 节点, 124 边)
  → SCA_CPG_JSON: 标记输出
  → JoernService.extractCpgJsonFromOutput()
  → CpgGraph.tsx 渲染
```

---

## 真实 Joern 分析结果

| 指标 | 值 |
|------|-----|
| 源文件 | `samples/cve-2024-22120/audit.c` |
| CVE ID | CVE-2024-22120 (Zabbix SQL 时间盲注) |
| Joern 版本 | 1.x (c2cpg.sh + joern-export) |
| Java 版本 | OpenJDK 17.0.x |
| CPG bin 大小 | ~2.1 MB |
| DOT 文件数 | 1 个 |
| 节点数 | 124 |
| 边数 | 124 |
| 节点类型 | ast, call, cfg, sink, source, taint |
| 边类型 | dataflow, taintprop |

---

## 前端修改摘要（G4）

### `CpgGraph.tsx`

1. **DEFAULT_CPG_DATA 修正**：从 `io.c` 缓冲区溢出（CWE-119）改为 `audit.c` SQL 时间盲注（CWE-89）
   - `cveId: 'CVE-2024-22120'`
   - `file: 'src/zabbix/audit.c'`
   - `cvss: 9.1`
   - 节点：clientip → value_esc → sql → zbx_db_execute 污点链

2. **`joernError` prop 新增**：Joern 工具链错误或 JSON 解析失败时，图谱区域顶部显示红色 Banner（`⚠ JOERN ERROR`），不崩溃，不白屏，降级显示默认示例数据

### `JoernService.ts`

- `JOERN_LOG_MARKER` 更新为 `[SCA-019]`（兼容 smoke 脚本输出）
- `joernTypeToNodeType` 函数：新增 SQL 相关危险函数（`zbx_db_execute`、`mysql_query`、`pg_query` 等）映射到 `sink`

---

## 证据文件清单

| 文件 | 大小 | 说明 |
|------|------|------|
| `joern-smoke.log` | 75 KB | `joern_cpg_smoke.sh` 完整执行日志 |
| `joern-cpg.json` | 42 KB | 真实 Joern 生成的 CPG JSON（124N/124E） |
| `cpg_from_dot.json` | 3.8 KB | G1 离线测试结果（cpg-dot-minimal） |
| `cpg-dot-export/` | — | 真实 Joern DOT 导出文件 |
| `g5-cpg-real-render-full-hud.webp` | 191 KB | G5 CPG 图谱正常渲染截图 |
| `g5-cpg-real-render-agent-running.webp` | 216 KB | G5 Agent 运行中 CPG 渲染截图 |
| `g6-joern-error-banner.webp` | 218 KB | G6 Joern 错误态 Banner 截图 |
| `REPORT.md` | — | 本报告 |

---

## Commit 清单

| Commit | 内容 |
|--------|------|
| C1 | `feat(TC-SCA-019): 添加 samples/cve-2024-22120/audit.c + cpg-dot-minimal fixture` |
| C2 | `feat(TC-SCA-019): 新增 joern_cpg_smoke.sh + 扩展 cpg_to_json.py 兼容真实 Joern DOT` |
| C3 | `fix(TC-SCA-019): CpgGraph 添加 joernError 错误态 + 修正 DEFAULT_CPG_DATA 为 audit.c` |
| C4 | `docs(TC-SCA-019): 归档证据文件 + REPORT.md` |

---

## 结论

TC-SCA-019 所有 G0–G7 验收 Gates 全部通过。

真实 Joern CPG 端到端链路已打通：`audit.c → c2cpg.sh → joern-export → cpg_to_json.py → SCA_CPG_JSON → JoernService → CpgGraph`。

前端 CpgGraph 组件已支持 `joernError` prop，Joern 工具链失败时显示错误态 Banner 而不崩溃。

DEFAULT_CPG_DATA 已修正为 CVE-2024-22120 Zabbix SQL 时间盲注场景（audit.c + CWE-89），与 README/UI 全局一致。
