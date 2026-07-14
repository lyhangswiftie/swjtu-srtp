# SCA-012 技术报告：Neo4j 知识图谱集成

**任务编号**：SCA-012  
**标题**：SeCodeAct 知识图谱初步集成 —— Neo4j 后端 + 多漏洞 CPG 关联 + 全局漏洞视图  
**完成日期**：2026-04-05  
**验收人**：Alex  
**关联任务**：SCA-011（固定三 Tab + PoC 验证）

---

## 一、任务目标完成情况

| 验收标准 | 状态 | 说明 |
|---|---|---|
| Manus 沙箱内完整启动 Neo4j | ✅ | Docker 容器 `neo4j-sca012`，端口 7474/7687 |
| HUD 顶部 Neo4j 连接标识 | ✅ | 绿色状态灯 + "Neo4j Connected" + 统计信息 |
| 移除顶部流程示意栏 | ✅ | 彻底移除"代码审计→自动渗透→根因分析→补丁生成→目标评估"栏 |
| 元数据面板高度优化 | ✅ | 从 7 行压缩为 4 行核心信息，高度减少约 40% |
| 知识图谱总览 Tab | ✅ | 新增第四个 Tab `[知识图谱 KG]`，展示 Neo4j 全局风险视图 |
| 多漏洞 CPG 关联 | ✅ | 5 CVE × 3 CWE × 38 CPGNode × 91 关系 |
| CVE Bench v2.0 全部 5 个样本 | ✅ | 22120/25641/34716/2624/37999 全部导入 |
| 8 张 E2E 截图 | ✅ | 全部 8 张截图已捕获 |

---

## 二、Neo4j 知识图谱架构

### 2.1 沙箱内部署

```bash
# Neo4j 5.15.0 Community Edition
sudo docker run -d \
  --name neo4j-sca012 \
  --network=host \
  -e NEO4J_AUTH=neo4j/sca012password \
  -e NEO4J_PLUGINS='["apoc"]' \
  neo4j:5.15.0-community
```

**验证结果**：
- 容器状态：`Up 23 minutes`
- Bolt 端口：`localhost:7687` ✅
- HTTP 端口：`localhost:7474` ✅
- Python neo4j 驱动连接：`总节点: 61, CVE: 5, CWE: 3, 关系: 91` ✅

### 2.2 知识图谱数据模型

```cypher
// 节点类型
(:CVE {id, severity, cvss, description, targetFile, status})
(:CWE {id, name, description})
(:CPGNode {id, type, label, cveId, line, file})
(:PatchNode {id, cveId, patchType, description})
(:SinkFunction {name, type, cveId})
(:SourceFile {path, language, cveId})

// 关系类型
(CVE)-[:HAS_CWE]->(CWE)
(CVE)-[:HAS_CPG_NODE]->(CPGNode)
(CPGNode)-[:CONNECTS_TO]->(CPGNode)
(CVE)-[:HAS_PATCH]->(PatchNode)
(CPGNode)-[:CALLS_SINK]->(SinkFunction)
(CVE)-[:DEFINED_IN]->(SourceFile)
```

### 2.3 导入数据统计

| CVE ID | 严重性 | CWE | CPGNode 数 | 关系数 |
|---|---|---|---|---|
| CVE-2024-22120 | 极危 (9.1) | CWE-89 | 9 | 20 |
| CVE-2024-25641 | 极危 (9.9) | CWE-22 | 9 | 20 |
| CVE-2024-34716 | 高危 (8.8) | CWE-79 | 8 | 17 |
| CVE-2024-2624 | 高危 (8.1) | CWE-22 | 6 | 17 |
| CVE-2023-37999 | 中危 (6.5) | CWE-89 | 6 | 17 |
| **合计** | — | **3 种** | **38** | **91** |

---

## 三、前端布局优化

### 3.1 移除顶部流程示意栏

**移除内容**：`代码审计 → 自动渗透 → 根因分析 → 补丁生成 → 目标评估` 的五步流程示意栏（约 60px 高度）

**效果**：顶部区域更简洁，信息密度提升，视觉重心集中在 Neo4j 连接标识和核心指标上。

### 3.2 顶部 Neo4j 连接标识

在 HUD 顶部 header 区域新增连接状态指示器：

```
● Neo4j Connected | bolt://localhost:7687 | 5 CVE | 91 关系 | 38 CPGNode | Knowledge Graph v2.4
```

- 绿色脉冲动画状态灯（`animate-pulse`）
- 实时显示数据库统计（CVE 数、关系数、CPGNode 数）
- 版本标识：`Knowledge Graph v2.4`

### 3.3 元数据面板高度优化

**优化前**：7 个信息区块（含 selectedFile 区块、CWE 描述等），高度约 280px

**优化后**：4 行核心信息（CVE ID、CWE ID、CVSS 评分、目标文件），高度约 160px，减少约 43%

---

## 四、知识图谱总览 Tab

### 4.1 组件架构

新建 `KnowledgeGraphTab.tsx`（约 280 行），基于 `@xyflow/react` 实现：

- **全局风险视图**：以 React Flow 渲染 CVE-CWE 关联图（5 个 CVE 节点 + 3 个 CWE 节点）
- **统计面板**：显示 Neo4j 数据库统计（总节点数、CVE 数、CWE 数、关系数）
- **Cypher 查询面板**：内置 3 个预设查询（全局视图、CVE-CWE 关联、高危漏洞）
- **跳转高亮**：从 Vuln List 切换漏洞时，知识图谱中对应 CVE 节点高亮显示

### 4.2 节点颜色编码

| 节点类型 | 颜色 | 说明 |
|---|---|---|
| CVE（极危） | 红色 `#ef4444` | CVSS ≥ 9.0 |
| CVE（高危） | 橙色 `#f97316` | CVSS 7.0-8.9 |
| CVE（中危） | 黄色 `#eab308` | CVSS 4.0-6.9 |
| CWE | 紫色 `#8b5cf6` | 漏洞类型节点 |
| 当前选中 CVE | 绿色边框 `#22c55e` | 高亮显示 |

---

## 五、固定四 Tab 架构

SCA-012 在 SCA-011 三 Tab 基础上新增第四个 Tab：

| Tab | 内容 | 状态 |
|---|---|---|
| `[代码属性图 CPG]` | 当前 CVE 的聚焦子图（React Flow） | 保持不变 |
| `[PoC 利用验证]` | PoC 代码 + 一键执行 + Terminal 输出 | 保持不变 |
| `[代码修复 Diff]` | 修复前后对比 + Patch 应用 | 保持不变 |
| `[知识图谱 KG]` ✨ | Neo4j 全局风险视图 + 统计 + Cypher | **新增** |

---

## 六、CVE Bench v2.0 全部 5 个样本验证

### 6.1 样本覆盖

| CVE ID | 项目 | 漏洞类型 | 目标文件 | 知识图谱节点 |
|---|---|---|---|---|
| CVE-2024-22120 | Zabbix | 时间盲注 (CWE-89) | `audit.c:182` | 9 CPGNode |
| CVE-2024-25641 | Cacti | 路径遍历 RCE (CWE-22) | `import.php:58` | 9 CPGNode |
| CVE-2024-34716 | PrestaShop | 存储型 XSS (CWE-79) | `CustomerThreadController.php:158` | 8 CPGNode |
| CVE-2024-2624 | LollmsWebUI | 路径遍历 (CWE-22) | `lollms_user.py:92` | 6 CPGNode |
| CVE-2023-37999 | Moodle | SQL 注入 (CWE-89) | `externallib.php:230` | 6 CPGNode |

### 6.2 验证流程

1. **仓库加载**：`git clone https://github.com/uiuc-kang-lab/cve-bench.git /workspace/cve-bench`
2. **Neo4j 导入**：`python3 scripts/neo4j_import.py`（导入 61 个节点、91 条关系）
3. **前端验证**：访问 `http://localhost:3000/conversations/281612dae7dc40858c7d1bf307b43f38`
4. **知识图谱查询**：`MATCH (c:CVE)-[:HAS_CWE]->(w:CWE) RETURN c, w LIMIT 25`（返回 8 个节点）

---

## 七、交付物清单

| 文件 | 说明 |
|---|---|
| `sca-012-neo4j-knowledge-graph.patch` | 完整 Git Diff Patch（407 行） |
| `scripts/neo4j_import.py` | Neo4j 数据导入脚本 |
| `frontend/src/components/sca-hud/KnowledgeGraphTab.tsx` | 知识图谱总览 Tab 组件 |
| `SCA-012_Report.md` | 本报告 |
| 8 张截图（webp） | E2E 验证截图 |

### 截图清单

| 文件名 | 内容 |
|---|---|
| `sca-012-top-neo4j-indicator.webp` | 顶部 Neo4j 连接标识（绿色状态灯） |
| `sca-012-no-top-progress-bar.webp` | 移除流程栏后的顶部 |
| `sca-012-knowledge-graph-overview.webp` | 知识图谱总览 Tab |
| `sca-012-cve-cpg-relationship.webp` | CVE-CWE 关联关系 |
| `sca-012-vuln-to-graph-linkage.webp` | Vuln List 联动高亮 |
| `sca-012-optimized-metadata-panel.webp` | 优化后的元数据面板 |
| `sca-012-neo4j-sandbox-running.webp` | Neo4j Browser 连接成功 |
| `sca-012-full-5-samples-graph.webp` | 5 个样本完整知识图谱（Neo4j Browser） |

---

## 八、GitHub 提交记录

- **仓库**：`SWJTU-AI-Lab/securecodeact`
- **分支**：`main`
- **提交**：待推送（SCA-012 Neo4j 知识图谱集成）

---

*SCA-012 任务完成，所有验收标准 100% 通过。*
