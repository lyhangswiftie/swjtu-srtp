# TC-SCA-RECENT-ISSUES-001 G6 本地执行操作指南

**任务卡**：TC-SCA-RECENT-ISSUES-001  
**Gate**：G6 真实前端端到端验证  
**方案**：方案 B（Volume Mount）— 不重新构建镜像，通过 `-v` 挂载修改后的 Python 文件进容器  
**前提**：本地机器已安装 Docker，已克隆 `SWJTU-AI-Lab/securecodeact` 仓库

---

## 1. 界面架构说明

securecodeact 的前端界面**不是**原生 OpenHands 界面，而是定制的 **SCA-HUD（SeCodeAct 安全分析主控制台）**。

### 1.1 路由结构

| 路由 | 界面 | 说明 |
|------|------|------|
| `/` | 首页（Home） | OpenHands 风格首页，含 GitHub 仓库选择器 + 新建会话 |
| `/conversations/:id` | SCA-HUD 主控制台 | 默认视图，`DashboardConnected.tsx` |
| `/conversations/:id?view=original` | 原生 OpenHands 界面 | 调试用，通过 URL 参数切换 |

### 1.2 SCA-HUD 主控制台布局

```
┌─────────────────────────────────────────────────────────────────────┐
│ 活动栏 │              主内容区                                        │
│ (56px) │  ┌─────────────────────────────────────────────────────┐   │
│  🛡️   │  │ 顶部状态栏 Header（60px）                           │   │
│  📁   │  │ 代码安全智能体（SeCodeAct）-SCA  | Neo4j Connected   │   │
│  🔗   │  ├──────────┬──────────────────────────┬──────────────┤   │
│  ▶    │  │ 左列(25%)│      中列(50%)            │ 右列(25%)    │   │
│       │  │ 任务交互 │ 仓库级总CPG知识图谱        │ 沙箱Agent    │   │
│       │  │ 终端     │                           │ 执行终端     │   │
│       │  │ (Chat)   ├──────────────────────────┤ (Terminal)   │   │
│       │  │          │ [CPG] [PoC] [Diff] 三Tab  │              │   │
│       │  │ 漏洞列表 │                           │ 元数据面板   │   │
│       │  │ (Vuln)   ├──────────────────────────┤              │   │
│       │  │          │ 系统日志窗口               │ MVP操作面板  │   │
│       │  └──────────┴──────────────────────────┴──────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**关键组件对应关系**：

| 界面区域 | 组件 | 数据来源 |
|----------|------|----------|
| 左列 Chat（任务交互终端） | `OpenHandsChat`（来自 OpenHandsMocks.tsx） | `useEventStore` WebSocket 消息流 |
| 右列 Terminal（沙箱Agent执行终端） | `OpenHandsTerminal`（来自 OpenHandsMocks.tsx） | `useCommandStore` 命令输出流 |
| Agent 状态 Banner | `AgentStatusBanner`（内嵌于 OpenHandsChat 顶部） | `useAgentStore.curAgentState` |
| 中列 CPG/PoC/Diff Tab | `CpgGraph`/`PoCUtilTab`/`OpenHandsDiffViewer` | 真实 API + WebSocket |
| 顶部状态栏 | Header（内联 JSX） | `vulnList`/`gitChangedPaths` 状态 |

---

## 2. 环境准备

### 2.1 克隆仓库（如未克隆）

```bash
git clone https://github.com/SWJTU-AI-Lab/securecodeact.git
cd securecodeact
git checkout fix/recent-git-import-agent-startup
```

### 2.2 设置必要环境变量

```bash
# 必须：OpenAI API Key（用于 LLM 功能）
export OPENAI_API_KEY='sk-your_openai_api_key'

# 必须：GitHub Personal Access Token（用于仓库导入功能）
# 需要 repo 权限（read:user + repo）
export GITHUB_TOKEN='ghp_your_github_pat'

# 可选：覆盖 Agent 启动宽限时间（默认已为 90 秒）
export AGENT_SERVER_STARTUP_GRACE_SECONDS=90
```

---

## 3. 启动服务

```bash
cd securecodeact
bash install.sh
```

**install.sh 执行过程说明**：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1-6  | 环境检查 | 检查 Docker、Node.js、npm 等依赖 |
| 7    | 构建前端 | `npm run build` 生成 SCA-HUD 前端 |
| 8    | 启动容器 | `docker run` 含 Volume Mount（方案 B） |
| 9    | 等待就绪 | 最多等待 90 秒，轮询 `/api/options/config` |
| 10   | 注入前端 | `docker cp` 将 SCA-HUD 前端 build 复制进容器 |
| 11   | 保存 LLM 配置 | 调用 `/api/settings` 保存 LLM 设置 |
| 12   | 注入 GitHub Token | 调用 `/api/add-git-providers` 注入 Token |
| 13   | 自检 | 验证 `/api/user/repositories` 返回 200 |

**关键 Volume Mount（方案 B 核心）**：

```
${SCRIPT_DIR}/openhands/app_server/sandbox/docker_sandbox_service.py
    -> /app/openhands/app_server/sandbox/docker_sandbox_service.py:ro
```

此挂载确保修复后的 `STARTUP_GRACE_SECONDS=90`（从环境变量读取）代码进入容器，无需重新构建镜像。

---

## 4. G6.0 容器内后端代码验证

**目的**：确认 Volume Mount 生效，`STARTUP_GRACE_SECONDS` 已从硬编码 15 秒改为从环境变量读取（默认 90 秒）。

```bash
sudo docker exec openhands-sca python3 - <<'PY'
import os
from openhands.app_server.sandbox import docker_sandbox_service as m
print("STARTUP_GRACE_SECONDS =", m.STARTUP_GRACE_SECONDS)
print("ENV AGENT_SERVER_STARTUP_GRACE_SECONDS =", os.getenv('AGENT_SERVER_STARTUP_GRACE_SECONDS', '(not set)'))
if m.STARTUP_GRACE_SECONDS != 15:
    print("VERDICT: PASS - Volume Mount 生效，已覆盖硬编码 15 秒")
else:
    print("VERDICT: FAIL - 仍为硬编码 15 秒，Volume Mount 未生效")
PY
```

**预期输出**：

```
STARTUP_GRACE_SECONDS = 90
ENV AGENT_SERVER_STARTUP_GRACE_SECONDS = 90
VERDICT: PASS - Volume Mount 生效，已覆盖硬编码 15 秒
```

**截图要求**：截取终端输出，包含 `VERDICT: PASS` 行。

---

## 5. G6.1 GitHub 仓库导入验证

**目的**：验证 GitHub Token 注入成功，`/api/user/repositories` 返回仓库列表。

```bash
curl -s http://localhost:3000/api/user/repositories | python3 -m json.tool | head -30
```

**预期输出**：JSON 数组，包含 GitHub 仓库列表（`full_name`、`description` 等字段）。

**截图要求**：截取 curl 输出，显示仓库列表（至少 1 个仓库）。

---

## 6. G6.2 SCA-HUD 首页验证

**目的**：验证前端服务正常运行，首页可访问，GitHub 仓库选择器正常显示。

**操作步骤**：

(1) 打开浏览器访问 `http://localhost:3000`  
(2) 应看到 OpenHands 风格首页，包含：
   - 顶部左侧：OpenHands Logo（盾牌图标）+ 侧边栏
   - 中央区域：**"Let's Start Building!"** 标题
   - 左侧卡片：**GitHub 仓库选择器**（`RepoConnector`）— 显示仓库下拉列表
   - 右侧卡片：**新建会话**（`NewConversation`）— "Start from scratch" 按钮
   - 下方：最近会话列表（`RecentConversations`）

**截图要求**：截取首页完整截图，重点显示 GitHub 仓库选择器已加载仓库列表。

---

## 7. G6.3 SCA-HUD 主控制台进入验证

**目的**：验证点击仓库或新建会话后，进入 SCA-HUD 主控制台（而非原生 OpenHands 界面）。

**操作步骤**：

(1) 在首页选择一个 GitHub 仓库，或点击"Start from scratch"新建会话  
(2) 等待跳转到 `/conversations/:id` 路由  
(3) 确认界面显示 SCA-HUD 主控制台，特征如下：
   - 左侧：深色活动栏（56px），含盾牌图标 🛡️、文件夹图标 📁、GitHub 图标等
   - 顶部状态栏：显示 **"代码安全智能体（SeCodeAct）-SCA"** 标题
   - 右上角：**"Neo4j Connected"** 状态指示器（绿色脉冲点）
   - 三列布局：左列 Chat、中列 CPG/PoC/Diff、右列 Terminal

**截图要求**：截取 SCA-HUD 主控制台完整截图，显示三列布局和顶部状态栏。

---

## 8. G6.4 Agent 黄色 Banner 验证（Issue #52 修复验证）

**目的**：验证 Agent 处于 LOADING/INIT 状态时，左列 Chat 面板顶部显示黄色 Banner 且输入框禁用。

**Banner 位置**：SCA-HUD 左列 **"任务交互终端"** 面板内部顶部（`OpenHandsChat` 组件内的 `AgentStatusBanner`）。

**操作步骤**：

(1) 进入 SCA-HUD 主控制台后，在 Agent 初始化期间（约 5-30 秒）  
(2) 观察左列 **"任务交互终端"** 面板顶部是否出现黄色 Banner  
(3) Banner 文字：`Agent 沙箱正在启动中（loading）… 请稍候，指令将在就绪后自动投递`  
(4) 确认 Chat 底部输入框处于禁用状态（灰色背景，无法输入）  
(5) 顶部状态栏右侧的 Agent 状态指示器显示**琥珀色脉冲点**（非绿色）

**预期界面（左列 Chat 面板）**：

```
┌─────────────────────────────────────┐
│ 任务交互终端                [图标]   │  <- 面板标题
├─────────────────────────────────────┤
│ ⟳ Agent 沙箱正在启动中（loading）   │  <- 黄色 Banner（amber-900/30 背景）
│   … 请稍候，指令将在就绪后自动投递  │
├─────────────────────────────────────┤
│  [消息列表区域]                      │
│                                     │
├─────────────────────────────────────┤
│ [灰色禁用输入框]         [禁用发送]  │  <- 输入框禁用
└─────────────────────────────────────┘
```

**截图要求**：截取 SCA-HUD 左列 Chat 面板，显示黄色 Banner 和禁用的输入框。

---

## 9. G6.5 Agent 红色 Banner 验证（Issue #52 修复验证）

**目的**：验证 Agent 处于 ERROR/RATE_LIMITED 状态时，左列 Chat 面板顶部显示红色 Banner。

**Banner 位置**：SCA-HUD 左列 **"任务交互终端"** 面板内部顶部（同 G6.4）。

**操作步骤（模拟 ERROR 状态）**：

(1) 方法 A：使用无效的 `OPENAI_API_KEY` 重新创建会话，触发 Agent 错误  
(2) 方法 B：在会话中发送指令后，如果 LLM 调用失败，Agent 进入 ERROR 状态  
(3) 方法 C（代码验证）：确认 `AgentStatusBanner` 组件代码已注入容器

```bash
# 验证 AgentStatusBanner 代码已注入容器前端 build
sudo docker exec openhands-sca grep -r "agent-status-banner\|AGENT_ERROR_STATES\|rate_limited" \
    /app/frontend/build/ 2>/dev/null | wc -l
```

**预期界面（左列 Chat 面板）**：

```
┌─────────────────────────────────────┐
│ 任务交互终端                [图标]   │
├─────────────────────────────────────┤
│ ⚠ Agent 出现错误（error）—          │  <- 红色 Banner（red-900/30 背景）
│   请检查沙箱日志或刷新页面重试       │
├─────────────────────────────────────┤
```

**截图要求**：截取红色 Banner 出现时的 Chat 面板截图，或截取上述命令输出（显示 > 0）。

---

## 10. G6.6 Chat 可用与 Agent 响应验证

**目的**：验证 Agent READY 后，Chat 输入框可用，发送指令后有 Agent 响应。

**操作步骤**：

(1) 等待 Agent 完成初始化（黄色 Banner 消失，顶部状态栏 Agent 状态点变为绿色）  
(2) 在左列 **"任务交互终端"** 底部输入框中输入：`请列出当前工作目录的文件`  
(3) 点击发送按钮（绿色 `[#00FF9F]` 发送按钮）  
(4) 等待 Agent 响应（约 10-30 秒）  
(5) 观察 Chat 面板是否出现 Agent 回复消息

**截图要求**：截取左列 Chat 面板，显示用户指令和 Agent 响应消息。

---

## 11. G6.7 Terminal 输出验证

**目的**：验证 Agent 执行命令时，右列 Terminal 面板（沙箱Agent执行终端）有真实输出。

**操作步骤**：

(1) 在 G6.6 的基础上，观察 SCA-HUD 右列 **"沙箱Agent执行终端（Terminal）"** 面板  
(2) 确认 Terminal 面板显示 Agent 执行的命令及其输出  
(3) 输出应包含真实的文件列表或命令执行结果  
(4) Terminal 面板顶部显示 `agent-sandbox-tty1` 标识

**预期界面（右列 Terminal 面板）**：

```
┌─────────────────────────────────────┐
│ 沙箱Agent执行终端（Terminal） [图标] │
├─────────────────────────────────────┤
│ ▶ agent-sandbox-tty1               │  <- 终端标识
│ $ ls -la /workspace                 │  <- 蓝色命令行
│ total 48                            │
│ drwxr-xr-x  5 user  user  4096 ... │
│ ...                                 │
│ $ _                                 │  <- 闪烁光标
└─────────────────────────────────────┘
```

**截图要求**：截取右列 Terminal 面板，显示真实的命令执行输出。

---

## 12. 使用自动化验证脚本

API 层和代码层验证可通过自动化脚本执行：

```bash
cd securecodeact
bash scripts/verify_g6.sh
```

脚本将自动执行 G6.0-G6.6 的 API 和代码层验证，并生成报告至 `reports/g6-verification/` 目录。

**注意**：G6.2-G6.7 的前端界面截图需要手动在浏览器中操作并截图，自动化脚本无法替代。

---

## 13. 验收清单

完成以下所有截图后，G6 验证即告完成：

| 编号 | 验证点 | 截图内容 | 状态 |
|------|--------|----------|------|
| G6.0 | 容器内代码验证 | 终端输出 `STARTUP_GRACE_SECONDS = 90` + `VERDICT: PASS` | ☐ |
| G6.1 | GitHub 仓库导入 API | curl 输出仓库 JSON 列表 | ☐ |
| G6.2 | SCA-HUD 首页 | 首页 GitHub 仓库选择器已加载 | ☐ |
| G6.3 | SCA-HUD 主控制台 | 三列布局 + 顶部 SeCodeAct 标题 | ☐ |
| G6.4 | 黄色 Banner（Issue #52） | 左列 Chat 顶部黄色 Banner + 输入框禁用 | ☐ |
| G6.5 | 红色 Banner（Issue #52） | 左列 Chat 顶部红色 Banner（ERROR 状态） | ☐ |
| G6.6 | Chat 可用与响应 | Chat 输入框可用 + Agent 回复消息 | ☐ |
| G6.7 | Terminal 输出 | 右列 Terminal 面板真实命令输出 | ☐ |

---

## 14. 常见问题排查

### 问题 1：进入会话后显示原生 OpenHands 界面而非 SCA-HUD

**原因**：前端 build 未注入容器，或 URL 包含 `?view=original` 参数。

```bash
# 检查前端 build 是否已注入
sudo docker exec openhands-sca ls /app/frontend/build/assets/ | head -5

# 手动注入（如未注入）
sudo docker cp frontend/build/. openhands-sca:/app/frontend/build/
```

### 问题 2：Volume Mount 未生效（G6.0 FAIL）

```bash
# 检查挂载是否正确
sudo docker inspect openhands-sca | python3 -c "
import json, sys
d = json.load(sys.stdin)
mounts = d[0].get('Mounts', [])
for m in mounts:
    print(m.get('Source'), '->', m.get('Destination'))
"
```

预期输出应包含：
```
/path/to/securecodeact/openhands/app_server/sandbox/docker_sandbox_service.py
    -> /app/openhands/app_server/sandbox/docker_sandbox_service.py
```

### 问题 3：GitHub 仓库列表返回 401

```bash
# 重新注入 GitHub Token
curl -s -X POST http://localhost:3000/api/add-git-providers \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"${GITHUB_TOKEN}\"}"
```

### 问题 4：SCA-HUD 左列 Chat Banner 未出现

**原因**：Agent 初始化太快，或 `agentState` prop 未正确传入。

```bash
# 确认 DashboardConnected.tsx 修改已注入容器
sudo docker exec openhands-sca grep -r "agentState\|curAgentState" \
    /app/frontend/build/assets/ 2>/dev/null | wc -l
```

### 问题 5：容器启动失败

```bash
# 查看容器日志
sudo docker logs openhands-sca --tail 50

# 重新启动
sudo docker rm -f openhands-sca
bash install.sh
```
