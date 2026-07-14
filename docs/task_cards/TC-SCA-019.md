# TC-SCA-019：真实 Joern CPG 端到端链路打通

## 任务目标

将 SecureCodeAct 的 CPG 能力从"前端静态展示"推进到"真实源码分析链路"。

最终链路：

```text
真实源码文件
  → joern-parse
  → joern-export
  → cpg_to_json.py
  → SCA_CPG_JSON:{...}
  → JoernService.extractCpgJsonFromOutput()
  → CpgGraph 前端渲染
  → Source / Taint / Sink 路径高亮
```

## 分支

`fix/TC-SCA-019-real-joern-cpg`（基于 main）

## 验收 Gates

| Gate | 验收项 | 标准 |
|------|--------|------|
| G0 | 分支与文档 | 创建分支，所有文件存在 |
| G1 | CPG 转换脚本离线测试 | `cpg_to_json.py --dot samples/cpg-dot-minimal` 生成合法 JSON |
| G2 | Joern 真实 smoke | `joern_cpg_smoke.sh` 输出 `SCA_CPG_JSON:` |
| G3 | JSON Schema 校验 | 包含 cveId/file/nodes/edges/generatedAt |
| G4 | 前端构建 | `npm run build` 退出码 0 |
| G5 | 前端渲染 | CPG Tab 显示真实节点和边 |
| G6 | 错误态 | Joern 缺失/JSON 错误时 UI 不崩溃 |
| G7 | 证据归档 | 日志、JSON、截图全部提交 |

## 新增文件清单

```
scripts/cpg_to_json.py           # DOT → CPG JSON 转换脚本
scripts/joern_cpg_smoke.sh       # Joern smoke 测试脚本
samples/cve-2024-22120/audit.c   # 最小可解析 C 样例（CVE-2024-22120）
samples/cpg-dot-minimal/         # 最小 DOT fixture（离线测试用）
docs/task_cards/TC-SCA-019.md    # 本任务卡
reports/TC-SCA-019/              # 验收证据目录
evidence/TC-SCA-019/             # 截图证据目录
```

## CPG JSON Schema

```json
{
  "cveId": "REAL-CPG",
  "file": "samples/cve-2024-22120/audit.c",
  "generatedAt": "2026-05-07T12:00:00Z",
  "nodes": [
    { "id": "n1", "type": "source", "label": "clientip", "subLabel": "PARAM", "file": "audit.c", "line": 12, "code": "const char *clientip" }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "type": "dataflow", "label": "REACHING_DEF" }
  ],
  "meta": {
    "tool": "joern",
    "format": "dot",
    "nodeCount": 10,
    "edgeCount": 12
  }
}
```

## 节点类型映射

| Joern 节点 / 代码特征 | 前端类型 |
|----------------------|---------|
| PARAM / METHOD_PARAMETER_IN | source |
| CALL + zbx_db_execute / strcpy / system | sink |
| IDENTIFIER / LOCAL | taint |
| METHOD / BLOCK / CONTROL_STRUCTURE | cfg |
| CALL | call |
| 其他 | ast |

## 边类型映射

| Joern 边 | 前端类型 |
|---------|---------|
| CFG | controlflow |
| DDG / REACHING_DEF | dataflow |
| CALL | callrel |
| 其他 flow 类 | taintprop |
