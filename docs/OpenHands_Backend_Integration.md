# OpenHands 后端集成详细说明文档 (Backend Integration Guide)

## 1. 架构概览 (Architecture Overview)

本系统前端（战术 HUD）与 OpenHands 后端的通信主要依赖两种协议：
1. **WebSocket (WS)**：用于实时双向通信，包括 Agent 状态流、终端日志输出、聊天消息收发等。
2. **REST API (HTTP)**：用于一次性或配置类操作，如获取系统配置、初始化会话、拉取 GitHub 仓库等。

## 2. 核心通信链路对接 (Core Communication Links)

### 2.1 WebSocket 实时事件流
OpenHands 后端的核心是一个事件驱动的架构。前端需要连接到后端的 WebSocket 服务（通常为 `ws://<backend-host>:<port>/ws`）。

*   **发送指令 (Action)**：当用户在 `OpenHandsChat` 中发送消息时，前端需要向 WS 发送一个 `Action` 对象。
    ```json
    {
      "action": "CmdRunAction", // 或 "MessageAction"
      "args": { "command": "扫描 src/core/utils/io.c" }
    }
    ```
*   **接收观测 (Observation)**：前端需要监听 WS 传来的 `Observation` 事件，并分发到不同的组件：
    *   `CmdOutputObservation` -> 更新 `OpenHandsTerminal` 的日志输出。
    *   `AgentMessageObservation` -> 更新 `OpenHandsChat` 的对话列表。
    *   `FileReadObservation` / `FileEditObservation` -> 更新 `OpenHandsDiffViewer` 的代码视图。

### 2.2 REST API 接口映射
左侧边栏和顶部配置栏的操作需要对接以下 REST API：

*   **会话控制 (Session Control)**
    *   `POST /api/session`：新建空白会话，获取 `sessionToken`。
    *   `GET /api/session/{token}`：恢复历史会话。
*   **代码仓库 (GitHub Repo)**
    *   `POST /api/workspace/github`：传入 Repo URL 和 Branch，后端将克隆代码并挂载到沙箱。
*   **系统配置 (Settings)**
    *   `GET /api/config`：获取当前的 LLM、Agent、MCP 配置。
    *   `POST /api/config`：保存用户在 Settings Modal 中修改的配置。

## 3. 组件级对接指南 (Component-Level Integration)

### 3.1 侧边栏：文件资源管理器 (File Explorer)
*   **接口**：`GET /api/files/list?path=/`
*   **逻辑**：在 `activeSidebar === 'files'` 时触发请求，将返回的 JSON 树状结构渲染到侧边栏。点击文件时，触发 `GET /api/files/read?path={filepath}`，并将内容传递给 `OpenHandsDiffViewer`。

### 3.2 侧边栏：代码仓库对接 (GitHub Integration)
*   **逻辑**：用户在输入框填写 URL 和 Branch，点击“加载仓库到沙箱”后，前端调用 `POST /api/workspace/github`。成功后，触发文件资源管理器的刷新，并向 Chat 发送一条系统消息：“已成功挂载 GitHub 仓库”。

### 3.3 侧边栏：会话控制 (Session Control)
*   **逻辑**：
    *   **新建会话**：调用 `POST /api/session`，清空当前的 Chat、Terminal 和 Diff 状态，重置沙箱环境。
    *   **恢复会话**：用户输入 Token，调用 `GET /api/session/{token}`，后端返回该会话的历史事件流，前端重放这些事件以恢复 Chat 和 Terminal 的状态。

### 3.4 核心工作区 (Chat, Terminal, Diff)
*   **状态管理**：建议引入 Redux Toolkit (RTK) 或 Zustand。将 `Dashboard.tsx` 中的 `chatMessages`, `terminalLogs`, `vulnList` 提升为全局 Store。
*   **WebSocket 中间件**：在 Redux 中间件中拦截 WS 消息，根据消息类型（Action/Observation）派发对应的 Redux Action，从而自动触发 React 组件的重新渲染。

## 4. 安全审计特有逻辑 (Security Audit Specifics)

OpenHands 原生主要面向通用软件开发。为了适配本系统的“代码安全智能体”定位，需要在后端进行以下定制：

1.  **自定义 Agent Class**：在后端实现一个 `SecurityAuditorAgent`，其 System Prompt 专注于漏洞挖掘、PoC 编写和补丁生成。
2.  **漏洞状态同步**：当 Agent 成功执行 PoC（如捕获到 SIGSEGV）或成功应用补丁时，后端应发送自定义的 `SecurityObservation`。前端监听到此事件后，更新 Dashboard 顶部的统计数据和漏洞列表的状态（未修复 -> 已验证 -> 已修复）。
