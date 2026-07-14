# SecureCodeAct (SCA) 前端代码汇总说明

## 1. 概述
本文档汇总了 SecureCodeAct (SCA) 平台前端的核心代码结构与说明。SCA 前端基于开源项目 OpenHands (v1.6.0) 进行了深度定制，核心目标是为安全代码审计与修复提供一个专属的交互式 HUD (Heads-Up Display) 界面。

## 2. 目录结构

前端项目位于 `frontend/` 目录下，主要结构如下：

```text
frontend/src/
├── api/                  # API 服务封装（如 ConversationService, GitService）
├── components/           # UI 组件库
│   ├── features/         # 原生功能组件（聊天、对话面板等）
│   ├── sca-hud/          # ✅ SCA 专属定制组件（核心新增）
│   └── ui/               # 基础 UI 库
├── contexts/             # React Contexts（WebSocket 状态管理等）
├── hooks/                # 自定义 React Hooks
├── routes/               # 页面路由配置
│   ├── conversation.tsx  # ✅ 核心对话路由（被 SCA 劫持并替换视图）
│   └── root-layout.tsx   # 根布局
├── stores/               # Zustand 状态管理
├── root.tsx              # 根组件
└── routes.ts             # 路由注册表
```

## 3. 核心技术栈
* **框架**: React 19 + React Router v7
* **构建**: Vite + TailwindCSS v4
* **状态管理**: Zustand + React Query
* **实时通信**: WebSocket (V1 协议) + Socket.io (V0 兼容)
* **代码编辑器**: Monaco Editor

## 4. SCA 核心定制代码说明

SCA 的核心修改集中在拦截默认的对话界面，并替换为安全审计专属的 `ScaDashboard`。

### (1) 路由拦截 (`routes/conversation.tsx`)
修改了原生的 `conversation.tsx`，当用户进入会话时，默认渲染 `ScaDashboard`，而非原生的 `ConversationMain`。保留了通过 `?view=original` URL 参数切换回原生界面的调试能力。

### (2) SCA Dashboard (`components/sca-hud/ScaDashboard.tsx`)
这是 SCA 的主界面容器，采用三列布局设计：
* **左列 (资源区)**：展示工作区文件树（`FileTreeNode`）和 Git 变更列表，支持通过输入 URL 动态挂载 GitHub 仓库。
* **中列 (工作区)**：展示代码文件内容或 Git Diff 视图（`ScaDiffViewer`），支持高亮显示修改前后的代码差异，并提供“应用补丁”和“运行测试”的快捷操作。
* **右列 (交互区)**：上方为与 Agent 交互的聊天窗口（`ScaChat`），下方为实时显示沙箱执行命令的终端窗口（`ScaTerminal`）。

### (3) SCA 基础组件 (`components/sca-hud/ScaComponents.tsx`)
包含了一系列纯展示组件：
* `ScaChat`: 解析并展示 V1 事件流中的用户和 Agent 消息。
* `ScaTerminal`: 监听并展示 Zustand `commandStore` 中的终端输入输出日志，对错误和成功信息进行颜色高亮。
* `ScaDiffViewer`: 接收 `originalCode` 和 `modifiedCode` 数组，并排渲染代码差异。
* `HudPanel`: 带有赛博朋克风格 L 型角标装饰的面板容器组件。

## 5. 核心源码参考

由于完整源码文件较多，这里仅提供最核心的 SCA 定制组件源码参考。

### `frontend/src/components/sca-hud/index.ts`
```typescript
export { ScaDashboard } from "./ScaDashboard";
export { ScaChat, ScaTerminal, ScaDiffViewer, HudPanel } from "./ScaComponents";
export type { ScaChatMessage, ScaDiffLine, ScaTerminalCommand } from "./ScaComponents";
```

*(完整组件源码见代码仓库)*
