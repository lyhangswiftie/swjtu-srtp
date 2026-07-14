# SecureCodeAct (SCA) — 代码安全智能体平台

> **TC-SCA-HUD-E2E-SAMPLE-005 HUD 端到端样本验证 — 已完成并合并到 main**
> 完成日期：2026-06-01 | 验收项：9/9 PASS | 版本：**SecureCodeAct v4.0**
> 核心特性：真实漏洞仓库端到端安全检查闭环、HUD 状态呈现、Playwright 截图脚本

> **TC-SCA-USABILITY-004-FOLLOWUP 可用性改进 — 已完成并合并到 main**
> 完成日期：2026-06-01 | 验收项：8/8 PASS | 版本：**SecureCodeAct v4.0**
> 核心特性：空仓库列表提示、`sca_doctor.sh` 宽松容器发现、多沙箱风险文档

> **TC-SCA-REPO-SANDBOX-USABILITY-004 仓库与沙箱可用性 — 已完成并合并到 main**
> 完成日期：2026-06-01 | 验收项：12/12 PASS | 版本：**SecureCodeAct v4.0**
> 核心特性：`RepositoryImportState` 状态机、API 错误分类、`SCA_FORCE_RECREATE` / `SCA_UI_ONLY` 安全模式

> **历史版本记录**
> - **v3.2**: TC-SCA-MAIN-STABILITY-003, TC-SCA-PR56-HARDENING-002
> - **v3.0**: TC-SCA-025 端到端一键流水线编排, TC-SCA-RECENT-ISSUES-001 近期 Issues 修复

---

## 目录

- [项目简介](#项目简介)
- [快速安装（一键部署）](#快速安装一键部署)
- [v4.0 核心特性更新](#v40-核心特性更新)
- [UI 界面说明](#ui-界面说明)
- [典型使用流程](#典型使用流程)
- [系统真实运行截图](#系统真实运行截图)
- [二次开发指南](#二次开发指南)
- [交付物清单](#交付物清单)
- [许可证](#许可证)

---

## 项目简介

SecureCodeAct（SCA）是基于 [OpenHands](https://github.com/OpenHands/OpenHands) 框架构建的**代码安全智能体平台**，专注于已知漏洞（CVE）的自动化分析、PoC 验证与补丁生成。

平台核心能力：

- **端到端一键流水线（v3.0）**：从 CVE 数据检查到修复报告生成的 9 步骤全自动化编排。
- **代码属性图（CPG）可视化**：基于 Joern 静态分析，生成包含 AST / CFG / Taint / Sink 的完整图谱。
- **自动化 PoC 验证**：在隔离沙箱中执行漏洞利用代码，确认可利用性。
- **智能补丁生成**：自动生成修复代码并通过 Diff 视图展示修复前后对比。
- **实时联动 HUD**：SCA-HUD 3 列布局，Chat 指令触发后所有功能区域毫秒级同步更新。
- **仓库导入与生命周期管理（v4.0）**：标准化的 `RepositoryImportState` 状态机，支持从克隆到分析的全生命周期监控。

---

## 快速安装（一键部署）

### 环境要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Docker | 20.10+ | 用于运行 OpenHands 容器 |
| Node.js | **22.12+** | 用于构建 SCA-HUD 前端 |
| Python | 3.9+ | 用于运行流水线脚本（核心依赖见 requirements.txt） |
| OpenAI API Key | — | 驱动 CodeActAgent 智能分析 |

### 一键安装

```bash
# 1. 克隆仓库
git clone https://github.com/SWJTU-AI-Lab/securecodeact.git
cd securecodeact

# 2. 设置 API Key
export OPENAI_API_KEY="your-api-key"

# 3. 执行一键安装脚本（v4.0）
bash install.sh
```

> **环境配置表（安装前可选设置）：**
> | 环境变量 | 说明 | 默认值 |
> |---------|------|--------|
> | `OPENAI_API_KEY` | **必填**。OpenAI 或兼容 API 的密钥（无交互提示，缺失时 `exit 1`） | 无 |
> | `LLM_MODEL` | 选填。使用的 LLM 模型 | `gpt-4.1-mini` |
> | `OPENAI_BASE_URL` | 选填。自定义 API 代理地址 | `https://api.openai.com/v1` |
> | `GITHUB_TOKEN` | 选填。启用 GitHub 仓库导入功能所需 | 无 |
> | `APP_MODE` | 选填。运行模式 | `oss` |
> | `AGENT_SERVER_STARTUP_GRACE_SECONDS` | 选填。沙箱启动超时宽限时间 | `90` |
> | `SCA_INSTALL_FORCE_CONTINUE` | 选填。容器超时是否强制继续（仅调试用） | `false` |
> | `SCA_FORCE_RECREATE` | 选填。设置为 `1` 时强制删除并重建容器 | `0` |
> | `SCA_UI_ONLY` | 选填。设置为 `1` 时跳过容器启动，仅更新前端注入 | `0` |
> | `VITE_ENABLE_DEMO_FALLBACK` | 选填。前端构建开关，控制是否启用 Mock 数据保护 | `false` |

脚本将自动完成以下步骤：

1. 检测并安装 Docker（如未安装）
2. 严格检测并安装 Node.js（精确检查 >=22.12.0）
3. 安装 Python 核心依赖（用于流水线脚本）
4. 拉取 OpenHands 1.6.0 镜像
5. 构建 SCA-HUD 前端（`npm install && npm run build`）
6. 启动 OpenHands 容器（注入环境配置和修复补丁）
7. 自动配置 LLM 和 GitHub Token（安全注入）
8. 将 SCA-HUD 前端注入容器，替换默认 OpenHands 界面
9. 自动执行链路自检（包含 API 状态和 GitHub 导入链路）

启动完成后访问：**http://localhost:3000**

> **注意**：如果安装脚本提示 `/api/user/repositories` 返回 401，说明未配置 `GITHUB_TOKEN`。这是预期行为，您可以在 UI 界面的 Settings 中手动配置，或在运行脚本前 `export GITHUB_TOKEN='your_token'`。

### 故障排查

如果您在安装或运行过程中遇到问题，可以运行自带的诊断工具（v4.1 支持 12 项全方位检查，包含宽松容器发现）：

```bash
bash scripts/sca_doctor.sh
```

---

## v4.0 核心特性更新

### 1. 仓库导入状态机 (RepositoryImportState)
引入标准化的状态机管理仓库导入流程，包含 `IDLE` -> `VALIDATING` -> `CLONING` -> `INDEXING` -> `READY` -> `FAILED` 完整状态流转。支持沙箱状态联动与 `Agent error` 诊断。

### 2. API 错误分类与降级保护
重构 `GitService` API，新增 `GitServiceError` 类型，支持 `ROUTE_NOT_FOUND` (404)、`AUTH_FAILED` (401)、`PERMISSION_DENIED` (403) 细粒度分类。前端 Mock 数据（CPG 图谱、漏洞列表、终端日志）全面受 `VITE_ENABLE_DEMO_FALLBACK` 开关保护。

### 3. 安装脚本安全模式
`install.sh` v4.0 引入 `SCA_FORCE_RECREATE=1` 和 `SCA_UI_ONLY=1`，支持无损前端更新与强制环境重建。`OPENAI_API_KEY` 缺失时默认非交互式退出，提升 CI/CD 安全性。

### 4. 端到端样本验证 (TC-SCA-HUD-E2E-SAMPLE-005)
完成真实漏洞仓库（`securecodeact-sample-vuln-repo`）的端到端闭环验证。成功复现 CWE-78 命令注入漏洞，自动生成修复补丁（`os.system` 替换为 `subprocess.run`），并通过 Pytest 全量验证。

---

## UI 界面说明

SCA-HUD 采用**三列布局**设计，各功能区域如下：

### 左侧列

| 区域 | 功能 |
|------|------|
| **Chat（任务交互端）** | 输入自然语言指令，与 CodeActAgent 实时对话。支持中英文混合指令。 |
| **Vuln List（漏洞列表）** | 实时展示当前会话中所有 CVE 的分析状态（未分析 / 分析中 / 已修复）。点击条目可聚焦对应 CVE 的 CPG 图谱。 |

### 中间列

| 区域 | 功能 |
|------|------|
| **CPG 图谱（代码属性图）** | 可视化展示漏洞代码的静态分析结果。节点类型包括：Source（污点源）、AST（语法树节点）、CFG（控制流节点）、Taint（污点传播路径）、Sink（执行点）。支持缩放、拖拽、节点聚焦。 |
| **PoC 利用验证标签** | 展示 Agent 生成的 PoC 利用代码及执行结果。 |
| **代码修复 Diff 标签** | 展示漏洞修复前后的代码对比（左红右绿），支持逐行查看。 |
| **SystemLog（系统日志）** | 实时追加 Agent 的分析步骤日志，包含时间戳、操作类型、执行结果。 |

### 右侧列

| 区域 | 功能 |
|------|------|
| **Terminal（沙箱终端）** | 实时显示 Agent 在隔离沙箱中执行的底层命令及输出，完全透明可审计。 |
| **MVP 操作面板** | 提供快捷操作按钮，点击即可触发对应分析任务（无需手动输入指令）。 |

**MVP 操作面板按钮说明：**

| 按钮 | 触发动作 |
|------|----------|
| 生成 POC 利用代码 | Agent 自动生成并执行漏洞利用脚本，验证可利用性 |
| 执行根因分析 | Agent 定位漏洞根本原因，生成 CPG 图谱并标注 Taint 路径 |
| 生成修复 Patch | Agent 生成代码修复方案，展示 Diff 视图 |
| 应用补丁 | 将修复代码写入目标文件，Vuln List 状态更新为"已修复" |
| Neo4j 建议 | 基于知识图谱推荐相关漏洞的修复模式 |

---

## 典型使用流程

以分析 **CVE-2024-22120**（Zabbix 时间盲注，CVSS 9.1）为例：

**步骤 1：发送分析指令**

在左侧 Chat 框输入：

```
分析 CVE-2024-22120（Zabbix 时间盲注漏洞），执行完整的 5 步端到端测试：
1. 生成 CPG 图谱
2. 定位漏洞根因
3. 生成 PoC 验证代码
4. 生成修复 Patch
5. 验证修复效果
```

**步骤 2：观察实时联动**

指令发送后，各区域将依次更新：

- **CPG 图谱**：自动重绘，展示 `audit.c:182` 处的 SQL 注入污点路径
- **Terminal**：显示 Joern 静态分析命令执行过程
- **SystemLog**：追加分析步骤日志

**步骤 3：执行 PoC 验证**

点击右侧"生成 POC 利用代码"，Agent 在沙箱中执行时间盲注验证（`SLEEP(5)` 延迟响应），Terminal 实时输出执行结果。

**步骤 4：查看修复 Diff**

点击"生成修复 Patch"，中间面板切换至 Diff 标签，展示：

```diff
- zbx_snprintf_alloc(..., clientip);   // 漏洞：直接拼接，未转义
+ zbx_snprintf_alloc(..., value_esc);  // 修复：使用转义后的字符串
```

**步骤 5：应用补丁**

点击"应用补丁"，左侧 Vuln List 中 CVE-2024-22120 状态实时更新为 **已修复**。

---

## 系统真实运行截图

> 截图日期：2026-05-31 | 系统版本：SecureCodeAct v4.0 | 测试：端到端样本验证
> 完整 HUD 截图见 `reports/hud/` 目录。

### 截图 1：SCA-HUD 系统全景（3 列布局）

![SCA-HUD 系统全景](https://files.manuscdn.com/user_upload_by_module/session_file/310419663030409984/fInUIadzoGYhQdwt.webp)

**说明**：系统启动后的初始状态。完整的 3 列布局：左列任务交互端（Chat + Vuln List）、中列仓库级 CPG 知识图谱（Neo4j Live Data + CPG 图谱 + SystemLog）、右列沙箱 Agent 执行端（Terminal + 元数据与上下文 + MVP 安全操作面板）。

### 截图 2：Neo4j CPG 知识图谱

![Neo4j CPG 知识图谱](https://files.manuscdn.com/user_upload_by_module/session_file/310419663030409984/jTjQjiwuohASZBDm.webp)

**说明**：中列 CPG 图谱切换至该 CVE 的代码属性图。可见 Source 节点 → AST 节点链 → Taint 传播路径 → Sink 节点的完整漏洞路径。

### 截图 3：仓库导入面板

![仓库导入面板](https://files.manuscdn.com/user_upload_by_module/session_file/310419663030409984/ztZBWbQXxUoWvJYw.webp)

**说明**：新增的仓库导入面板，支持 GitHub 仓库的快速加载，并提供标准化的 `RepositoryImportState` 状态流转指示。

### 截图 4：会话与沙箱控制面板

![会话与沙箱控制面板](https://files.manuscdn.com/user_upload_by_module/session_file/310419663030409984/EqhMkxBfoHvuPLjo.webp)

**说明**：会话控制区域，支持新建空白会话、终止当前沙箱、根据 Conversation ID 跳转历史会话等核心操作。

---

## 二次开发指南

完整二次开发文档请参考 [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md)。

---

## 交付物清单

| 类别 | 路径 | 说明 |
|------|------|------|
| **一键安装** | `install.sh` | 自动化部署脚本 v4.0，含安全模式 (`SCA_UI_ONLY`, `SCA_FORCE_RECREATE`) |
| **前端代码** | `frontend/` | SCA-HUD React 前端工程（含 4 个 Pipeline 组件与导入状态机） |
| **流水线脚本** | `scripts/` | `sca_pipeline.py` 及相关步骤脚本 |
| **诊断工具** | `scripts/sca_doctor.sh` | 环境诊断工具 v4.1（12 项检查，宽松容器发现） |
| **截图工具** | `scripts/capture_hud_screenshots.js` | 基于 Playwright 的 HUD 自动化截图脚本 |
| **报告** | `reports/HUD_E2E_VALIDATION_REPORT.md` | v4.0 端到端样本验证报告（9/9 PASS） |
| **文档** | `docs/USER_MANUAL.md` | 完整用户手册（安装、配置、使用、排障） |
| **文档** | `docs/DEVELOPER_GUIDE.md` | 二次开发指南（架构、核心模块、扩展接口） |
| **设计文档** | `docs/task-cards/` | 包含状态机、生命周期模型等设计文档 |

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
