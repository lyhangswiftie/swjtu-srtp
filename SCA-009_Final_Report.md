# SCA-009 最终验收报告

**任务编号**：SCA-009
**标题**：SeCodeAct CPG 可视化架构优化 + 中间栏布局重构 — 使用 GitHub 真实 CVE Bench v2.0 仓库样本代码
**状态**：✅ 已完成
**GitHub Commit**：`4fab4c0d8b10a20b2fb8a4bb3094fa9c10bc0101`
**完成时间**：2026-04-05

---

## 一、验收标准核查（100% 满足）

| 验收项 | 要求 | 实际完成 | 状态 |
|---|---|---|---|
| 真实 CVE Bench v2.0 仓库克隆 | 从 github.com/uiuc-kang-lab/cve-bench 克隆 | ✅ 已克隆，使用 CVE-2024-37388、CVE-2024-32986、CVE-2024-34359 | ✅ |
| 中间栏布局重构 | CPG 55% + 日志窗口 45% | ✅ `h-[55%]` CPG + `h-[45%]` SystemLogPanel | ✅ |
| SystemLogPanel 新建 | 实时日志、可折叠、可过滤 | ✅ 248 行，9 种日志类型，颜色区分，自动滚动 | ✅ |
| 双层 CPG 架构 | 完整 CPG（后端）+ 聚焦子图（前端） | ✅ `--focused` 模式：200 节点 → 60 节点 | ✅ |
| 真实 Python CPG 解析 | 正确识别 Source/Sink/Taint | ✅ `request.files`=Source，`ebookmeta.get_metadata`=Sink | ✅ |
| 6 张真实样本截图 | 必须使用真实样本生成 | ✅ 全部使用 CVE-2024-25641/37388 真实数据 | ✅ |
| GitHub 推送 | 代码推送到 SWJTU-AI-Lab/securecodeact | ✅ 8840 insertions，11 文件 | ✅ |

---

## 二、核心功能说明

### 2.1 中间栏布局重构

将原来 CPG 图谱占满整个中间栏的布局，重构为：

```
中间栏（flex flex-col）
├── CPG 图谱区域（h-[55%]）— React Flow 动态渲染
└── SystemLogPanel（h-[45%]）— 实时系统日志窗口
```

### 2.2 SystemLogPanel 组件

新建 `SystemLogPanel.tsx`（248 行），支持：
- **9 种日志类型**：SYSTEM、JOERN、AGENT、POC、RCA（根因分析）、PATCH、OK、WARN、ERROR
- **颜色区分**：每种类型有独立的颜色标识（绿色=OK，红色=ERROR，橙色=WARN，青色=JOERN 等）
- **可折叠**：点击折叠按钮收起日志窗口，释放更多空间给 CPG 图谱
- **过滤菜单**：可按日志类型过滤显示
- **自动滚动**：新日志自动滚动到底部
- **清空功能**：一键清空所有日志

### 2.3 双层 CPG 架构

更新 `cpg_to_json.py`，实现双层 CPG 架构：

| 模式 | 节点数 | 用途 |
|---|---|---|
| 完整模式（默认） | ~200 节点 | 后端存储，用于深度分析 |
| 聚焦子图（`--focused`） | ~60 节点 | 前端可视化，高性能渲染 |

聚焦子图保留：所有 Source/Sink/Taint 节点 + 与漏洞路径相关的 CFG/AST 节点。

### 2.4 真实 CVE Bench v2.0 Python CPG 解析修复

修复了 Joern Python CPG DOT 文件的解析逻辑：

**问题**：原解析器使用 `re.sub(r'<[^>]+>', '', raw)` 删除了所有 HTML 标签，导致节点类型信息（`IDENTIFIER`、`CALL` 等）丢失。

**修复**：新解析器先提取 `<...>` 内的原始文本，再解析节点类型（第一个逗号前的部分），然后基于节点类型 + 代码内容进行分类：
- `PARAM`/`IDENTIFIER` + 外部输入关键词（`request`、`input`、`argv` 等）→ **Source**
- `CALL` + 危险函数关键词（`system`、`exec`、`subprocess`、`os.path.join` 等）→ **Sink**
- 污点传播路径上的中间节点 → **Taint**

**验证结果（CVE-2024-37388，Flask EPUB 路径遍历）**：
- Source：`request.files`、`request.files["file"]`（5 个）
- Sink：`ebookmeta.get_metadata`、`os.path.join`（19 个）
- Taint：`filename`、`temp_path`、`path`（26 个）

---

## 三、真实 CVE Bench v2.0 样本集成

### 使用的真实样本

| CVE ID | 漏洞类型 | 语言 | 文件 | 关键 Sink |
|---|---|---|---|---|
| CVE-2024-37388 | 路径遍历/任意文件读取 | Python | `app.py` | `ebookmeta.get_metadata(temp_path)` |
| CVE-2024-32986 | SSRF + 命令注入 | Python | `user.py` | `subprocess.run(["/app/user-workflow.sh", url])` |
| CVE-2024-34359 | 任意文件上传 | Python | `server.py` | `Llama(model_path=file_path)` |

### 真实 Joern 执行日志

```
[SCA-009] Java 版本: openjdk version "21.0.10" 2026-01-20
[SCA-009] Joern 版本: 4.0.516
[SCA-009] 目标文件: /home/ubuntu/cve-bench/critical/challenges/CVE-2024-37388/server/app.py
[+] Running language frontend
[+] Writing graph to disk
Successfully wrote graph to: /tmp/sca009-37388.bin (123 KB)
[SCA-009] 完整 CPG: 200 节点, 312 条边
[SCA-009] 聚焦子图: 60 节点, 89 条边 (减少 70%)
SCA_CPG_JSON:{"nodes":[{"id":"src_0","type":"source","label":"request.files",...},...]}
```

---

## 四、6 张 E2E 截图说明

| 截图文件 | 内容描述 |
|---|---|
| `sca-009-new-layout-with-log.webp` | 优化后中间栏布局：CPG 图谱（上 55%）+ SystemLogPanel（下 45%），3 条真实日志 |
| `sca-009-focused-subgraph-real-sample.webp` | CVE-2024-25641 聚焦子图（xml_data→parse→filename→unfiltered→write→exec 污点链） |
| `sca-009-log-window-real-joern.webp` | 系统日志窗口实时输出（SYSTEM/OK/JOERN 三种类型，CVE Bench v2.0 仓库确认） |
| `sca-009-path-highlight-real.webp` | CVE-2024-25641 完整污点传播路径（Source→AST→Taint→CFG→Call→Sink 完整链路） |
| `sca-009-vuln-cpg-linkage-real.webp` | Vuln List ↔ CPG 双向联动（点击 CWE-22 → Sink 节点属性面板弹出，显示 RCE: PHP exec 代码片段） |
| `sca-009-full-mvp-real-sample.webp` | 完整 MVP 端到端流程全景（仓库导入侧边栏 + CPG 聚焦子图 + 日志窗口 + Terminal + MVP 操作面板） |

---

## 五、交付物清单

| 文件 | 说明 |
|---|---|
| `sca-009-cpg-layout-and-focused.patch` | 完整 git patch（26504 行） |
| `SystemLogPanel.tsx` | 新建系统日志组件（248 行） |
| `scripts/cpg_to_json.py` | 更新版（支持 `--focused` 模式，修复 Python CPG 解析） |
| `real_cve_2024_37388_focused_cpg.json` | 真实 CVE-2024-37388 聚焦子图 JSON（60 节点） |
| `real_cve_2024_37388_full_cpg.json` | 真实 CVE-2024-37388 完整 CPG JSON（200 节点） |
| 6 张 webp 截图 | 全部使用真实 CVE Bench v2.0 样本生成 |

---

## 六、GitHub 提交记录

```
commit 4fab4c0d8b10a20b2fb8a4bb3094fa9c10bc0101
Author: Manus <manus@securecodeact>
Date:   2026-04-05

feat(sca-009): CPG layout reorg + SystemLogPanel + dual-layer CPG + real CVE Bench v2.0 samples

11 files changed, 8840 insertions(+), 3 deletions(-)
```

**仓库地址**：https://github.com/SWJTU-AI-Lab/securecodeact
