# SCA-004 侧边栏功能补全集成说明

## 1. 概述
本阶段任务（SCA-004）完成了 SeCodeAct 战术 HUD 左侧侧边栏的真实功能集成，将“代码仓库对接”和“会话与沙箱控制”两个模块从静态 UI 升级为真实可操作的功能组件，实现了与 OpenHands 后端 API 的端到端联动。

## 2. 核心功能实现

### 2.1 代码仓库对接 (Repository Integration)
实现了将指定的 GitHub 仓库克隆到当前沙箱工作区的功能：
- **用户输入**：支持输入 GitHub Repository URL 和指定 Branch/Commit。
- **指令下发**：通过 `useSendMessage` 钩子，向 Agent 发送包含 `git clone` 逻辑的终端指令。
- **状态联动**：指令发送后，自动触发前端状态更新，侧边栏自动切换至“文件资源管理器”视图，并通过 `loadFileTree()` 触发文件树的刷新。

### 2.2 会话与沙箱控制 (Session Control)
实现了对 OpenHands 会话和底层沙箱的生命周期管理：
- **新建空白会话**：调用 `POST /api/conversations` 创建全新会话，获取新的 `conversation_id` 后通过 `useNavigate` 进行路由跳转，实现状态隔离。
- **终止当前沙箱**：调用 `POST /api/conversations/{id}/stop` 停止当前 Agent 的运行。
- **历史会话恢复**：
  - 支持通过输入 Token（Conversation ID）直接跳转恢复。
  - 自动调用 `GET /api/conversations` 获取最近的会话列表，展示会话 ID、状态（RUNNING/STOPPED）及创建时间，支持点击列表项直接恢复。

## 3. 技术实现细节
- **文件修改**：主要修改了 `frontend/src/components/sca-hud/DashboardConnected.tsx`（v4.0 版本）。
- **API 接口调用**：
  - `ConversationService.createConversation()`
  - `ConversationService.stopConversation(id)`
  - `ConversationService.getUserConversations(limit)`
- **状态管理**：利用 React 的 `useState` 管理各操作的 loading 状态及结果提示，使用 `useNavigate` 处理页面路由跳转。

## 4. 部署与验证
本功能已在 Manus 沙箱环境中完成 E2E 验证：
- 代码仓库对接功能成功克隆了测试仓库并触发了文件树刷新。
- 会话控制功能成功创建了新会话，并能正确获取并展示历史会话列表。

生成的 `sca-004-sidebar.patch` 文件包含了所有前端代码的修改，可直接应用于真实服务器环境。
