# SecureCodeAct (SCA) 用户手册 (User Manual)

## 1 绪论

### 1.1 系统简介
SecureCodeAct（SCA）是基于 OpenHands 框架深度定制的**代码安全智能体平台 (Code Security Agent Platform)**。本系统旨在解决传统静态应用安全测试（SAST）工具误报率高、缺乏修复上下文以及难以验证漏洞可利用性的痛点。SCA 引入了代码属性图（Code Property Graph, CPG）、沙箱内动态验证（Dynamic Validation in Sandbox）和智能补丁生成（Intelligent Patch Generation）技术，实现了从已知漏洞（CVE）检测到自动修复的端到端（End-to-End）闭环。

### 1.2 核心功能与应用场景
系统提供以下核心能力：
- **端到端一键流水线 (End-to-End Pipeline)**：自动执行数据检查、CPG 分析、PoC 验证、补丁生成、安全预检和回归验证。
- **CPG 可视化 (CPG Visualization)**：基于 Neo4j 图数据库，直观展示语法树（AST）、控制流（CFG）、数据流（DFG）以及污点传播路径（Taint Path）。
- **动态沙箱验证 (Dynamic Sandbox Validation)**：在安全的隔离环境中执行利用代码（PoC），真实确认漏洞危害。
- **实时联动 HUD (Head-Up Display)**：三列式仪表盘，实时呈现对话（Chat）、图谱（Graph）、日志（Log）和终端（Terminal）状态。

主要应用场景包括：企业内部代码库的安全审计、开源组件漏洞的快速应急响应、安全研究人员的漏洞复现与分析。

---

## 2 安装与部署指南

### 2.1 环境要求
部署 SCA 平台前，请确保宿主机满足以下要求：
- **操作系统**：Ubuntu 22.04 LTS 或兼容的 Linux 发行版（支持 WSL2）。
- **Docker**：20.10 及以上版本（必须启动 Docker Daemon）。
- **Node.js**：22.12.0 及以上版本（用于构建前端 HUD）。
- **Python**：3.9 及以上版本（用于执行核心分析脚本）。

### 2.2 环境变量配置
在安装前，建议配置以下环境变量：

| 变量名 | 说明 | 是否必填 | 默认值 |
|--------|------|----------|--------|
| `OPENAI_API_KEY` | 驱动智能体分析的 LLM API 密钥 | **是** | 无 |
| `LLM_MODEL` | 使用的大语言模型名称 | 否 | `gpt-4.1-mini` |
| `OPENAI_BASE_URL` | 自定义 API 代理地址 | 否 | `https://api.openai.com/v1` |
| `GITHUB_TOKEN` | 用于导入 GitHub 私有或公共仓库 | 否 | 无 |
| `SCA_FORCE_RECREATE` | 设为 `1` 时强制重建已有的沙箱容器 | 否 | `0` |
| `SCA_UI_ONLY` | 设为 `1` 时仅更新前端，跳过容器启动 | 否 | `0` |

### 2.3 一键安装
我们提供了自动化的一键安装脚本，执行以下命令即可完成部署：

```bash
# 克隆仓库
git clone https://github.com/SWJTU-AI-Lab/securecodeact.git
cd securecodeact

# 导出必需的环境变量
export OPENAI_API_KEY="your-api-key"

# 执行安装脚本
bash install.sh
```

**安装流程解析：**
(1) 脚本首先进行环境预检（Node.js semver 检查、Docker 状态检查）。
(2) 安装 Python 依赖并拉取核心镜像（OpenHands 1.6.0）。
(3) 编译前端 SCA-HUD（`npm run build`）。
(4) 启动 Docker 沙箱容器，并将前端静态资源安全注入。
(5) 自动配置 API 密钥并进行系统自检。

安装完成后，请在浏览器中访问：**http://localhost:3000**。

---

## 3 操作与使用指南

### 3.1 仓库导入与初始化
进入系统后，首先需要导入待分析的代码仓库：
(1) 点击顶部导航栏的 **GitHub Integration**（GitHub 集成）按钮。
(2) 在弹出的导入面板中，输入目标仓库的 URL（例如：`https://github.com/SWJTU-AI-Lab/securecodeact-sample-vuln-repo`）。
(3) 系统将进行状态流转：`VALIDATING`（验证） -> `CLONING`（克隆） -> `INDEXING`（索引） -> `READY`（就绪）。
(4) 当状态变为 `READY` 后，即可开始安全分析。

### 3.2 交互式安全分析
在左侧的 **Chat（任务交互端）** 输入自然语言指令。例如：
> "分析当前仓库的命令注入漏洞，生成 CPG 图谱，并提供修复补丁。"

智能体（CodeActAgent）将自动解析意图，并在右侧的 **Terminal（沙箱终端）** 中执行相应的检测脚本。

### 3.3 CPG 图谱查看与污点分析
(1) 分析完成后，中列的 **CPG 图谱（代码属性图）** 区域将渲染漏洞的结构。
(2) 图谱中，红色节点表示 **Source（污点源）**，青色节点表示 **Sink（执行点）**，黄色路径表示 **Taint（污点传播）**。
(3) 支持通过鼠标滚轮缩放，拖拽平移，以详细审查数据流向。

### 3.4 补丁生成与应用
(1) 在右侧的 **MVP 操作面板** 中，点击 **生成修复 Patch**。
(2) 智能体将基于漏洞根因，生成安全的修复代码。
(3) 中列将自动切换至 **代码修复 Diff 标签**，展示修改前后的对比（红色为删除，绿色为新增）。
(4) 确认无误后，点击 **应用补丁**，左侧的 **Vuln List（漏洞列表）** 状态将更新为"已修复"。

---

## 4 故障排查与诊断

### 4.1 使用 sca_doctor.sh 进行全方位诊断
当系统运行异常时，请在宿主机执行内置的诊断工具：

```bash
bash scripts/sca_doctor.sh
```

该工具将执行 12 项严格检查，包括：
- Docker 服务状态与权限。
- Node.js 版本兼容性。
- 核心容器（`openhands-sca`）的运行状态。
- `/api/user/repositories` 接口连通性。
- 容器内工作区（Workspace）的读写权限。
- 容器运行时日志扫描（检测严重错误）。

### 4.2 常见问题与解决方案
**问题 1：仓库导入面板提示 "401 Unauthorized"**
- **原因**：未配置 `GITHUB_TOKEN`，系统无法调用 GitHub API。
- **解决**：点击左下角齿轮图标进入 **Settings（系统配置）**，在 Integrations 标签页中填入有效的 GitHub Personal Access Token。

**问题 2：Agent 启动超时或无响应**
- **原因**：网络延迟导致沙箱初始化失败，或 LLM API 无法连接。
- **解决**：检查 `OPENAI_BASE_URL` 是否配置正确。使用 `docker logs openhands-sca` 查看底层报错。若需重启，可执行 `bash install.sh` 并设置 `SCA_FORCE_RECREATE=1`。

**问题 3：前端界面显示空白或样式错乱**
- **原因**：前端构建失败或静态资源未正确注入容器。
- **解决**：确保 Node.js 版本 `>=22.12.0`。执行 `SCA_UI_ONLY=1 bash install.sh` 重新编译并注入前端资源。

---

## 5 附录：操作过程记录（实践报告）

为确保操作的可重复性，以下是标准部署与验证过程的记录：
(1) 准备一台全新的 Ubuntu 22.04 虚拟机。
(2) 执行 `sudo apt update && sudo apt install -y docker.io curl` 安装基础依赖。
(3) 安装 Node.js 22：`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`。
(4) 克隆项目并设置环境变量：`export OPENAI_API_KEY="sk-..."`。
(5) 运行 `bash install.sh`，观察终端输出，确认各阶段（环境检查、镜像拉取、前端构建、容器启动）均显示 `PASS`。
(6) 访问 `http://localhost:3000`，成功加载 SCA-HUD 界面。
(7) 导入测试仓库并执行漏洞扫描，确认 CPG 图谱和 Diff 视图正常渲染。
