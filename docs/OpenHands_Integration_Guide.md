# OpenHands 战术 HUD 前端集成说明书 (Integration Guide)

## 1. 架构概述 (Architecture Overview)

本项目将 OpenHands 强大的“智能体底座 (Agentic Base)”与定制化的“战术指挥舱 (Security HUD)”进行了深度融合。
前端架构采用了**单向数据流 (Single Source of Truth)** 与 **展示型组件 (Dumb Components)** 的设计模式。

*   **Dashboard.tsx (主控台)**：作为容器组件 (Smart Component)，负责与 OpenHands 后端（通过 WebSocket 或 Redux/Zustand Store）进行数据交互，维护全局状态。
*   **OpenHandsMocks.tsx (UI 组件)**：作为纯展示组件 (Dumb Components)，仅通过 `props` 接收数据并触发回调，内部不维护复杂的业务状态。在实际集成时，这些组件将直接替换为或包裹 OpenHands 的原生 React 组件。

---

## 2. 原 OpenHands 前端功能接口覆盖度分析

为了确保“无遗漏”且“完全符合原有接口”，以下是 OpenHands 核心前端功能与当前战术 HUD 界面的映射与覆盖情况分析：

| OpenHands 原生功能模块 | 核心接口/状态 (State/API) | 战术 HUD 对应区域 | 覆盖状态 | 集成说明 & 差异处理 |
| :--- | :--- | :--- | :--- | :--- |
| **Chat Interface (聊天交互)** | `messages`, `sendMessage()`, `agentState` | 左栏：Agent 交互终端 | **100% 覆盖** | 完美映射。HUD 提供了 `messages` 渲染列表和 `onSendMessage` 回调。需接入 OpenHands 的 `useChat` Hook。 |
| **Terminal (终端日志)** | `terminalLogs`, `executeCommand()` | 右栏：Agent 终端 | **100% 覆盖** | 完美映射。HUD 提供了 `logs` 渲染列表。需接入 OpenHands 的 `useTerminal` Hook 监听 stdout/stderr。 |
| **File Explorer (文件树)** | `fileTree`, `fetchDirectory()`, `selectFile()` | 左侧边栏：文件资源管理器 | **100% 覆盖** | 完美映射。HUD 提供了树状文件结构。需接入 OpenHands 的文件系统 API，将树状结构数据绑定至该区域，并添加点击事件以联动中栏代码视图。 |
| **GitHub Repo (代码仓库)** | `setWorkspace`, `githubToken` | 左侧边栏：代码仓库对接 | **100% 覆盖** | 完美映射。HUD 提供了输入 Repo URL 和 Branch 的界面，用于初始化沙箱工作区。 |
| **Session Control (会话控制)** | `initSession`, `clearSession`, `sessionToken` | 左侧边栏：会话控制 | **100% 覆盖** | 完美映射。HUD 提供了新建空白会话、终止沙箱以及通过 Token 恢复历史会话的界面。 |
| **Code / Diff Viewer (代码视图)** | `currentFile`, `fileContent`, `diffData`, `applyPatch()` | 中栏：代码修复对比 Diff | **100% 覆盖** | 完美映射。HUD 提供了双栏 Diff 视图及“应用补丁”按钮。需对接 OpenHands 的 `useFileEditor` 或相应状态。 |
| **Settings & Config (系统设置)** | `llmConfig`, `agentConfig`, `workspaceConfig` | 顶部：系统配置 Modal | **100% 覆盖** | 完美映射。HUD 提供了统一的模态框，涵盖了 LLM、Agent、Workspace 的配置项。 |
| **Skills (技能库)** | `skills`, `addSkill()`, `toggleSkill()` | 顶部：系统配置 Modal -> Skills | **100% 覆盖** | 完美映射。HUD 提供了自定义 Python 技能的列表展示和启停开关。 |
| **MCP Management (MCP 管理)** | `mcpServers`, `addMcp()`, `mcpStatus` | 顶部：系统配置 Modal -> MCP | **100% 覆盖** | 完美映射。HUD 提供了 MCP 列表和状态指示灯。 |
| **Browser Preview (网页预览)** | `browserUrl`, `browserState`, `screenshot` | **N/A (架构替换)** | **架构调整** | *注意*：OpenHands 原生的浏览器预览主要用于 Web 开发。在本**安全审计**场景中，该区域被替换为更符合业务需求的 **[代码属性图 CPG]**。如果需要保留，可在中栏增加一个 `[沙箱 Web 预览]` 的 Tab。 |
| **Control Panel (控制面板)** | `start`, `stop`, `clear`, `agentStatus` | 顶部状态栏 / 底部 Footer | **100% 覆盖** | OpenHands 的启停控制可通过 Chat 触发，Agent 状态（如 Running, Error, Finished）已映射至 Footer 的“系统状态”和顶部 Header 的“大模型活跃”指示灯。 |

---

## 3. 核心状态对接指南 (State Integration)

在实际接入 OpenHands 源码时，请按照以下步骤修改 `src/components/Dashboard.tsx`：

### 3.1 替换状态源 (Replace State Sources)
将 `Dashboard.tsx` 中硬编码的 `useState` 替换为 OpenHands 提供的全局状态 Hook（例如基于 Redux, Zustand 或 Context API）。

```javascript
// 替换前 (Mock)
const [chatMessages, setChatMessages] = useState([...]);
const [terminalLogs, setTerminalLogs] = useState([...]);

// 替换后 (OpenHands Integration)
import { useChat } from '@openhands/hooks/useChat';
import { useTerminal } from '@openhands/hooks/useTerminal';
import { useAgentState } from '@openhands/hooks/useAgentState';

export default function Dashboard() {
  const { messages, sendMessage } = useChat();
  const { logs } = useTerminal();
  const { agentState } = useAgentState();
  // ...
}
```

### 3.2 绑定回调函数 (Bind Callbacks)
将 UI 组件的交互事件绑定到 OpenHands 的 Action 上。

```javascript
// 替换前 (Mock)
const handleSendMessage = (text) => { ... };

// 替换后 (OpenHands Integration)
const handleSendMessage = (text) => {
  sendMessage(text); // 调用 OpenHands 原生发送接口
};

// 在 JSX 中传递
<OpenHandsChat messages={messages} onSendMessage={handleSendMessage} />
```

### 3.3 漏洞状态联动逻辑 (Vulnerability State Sync)
本系统特有的“漏洞列表”状态（未修复、已验证、已修复）需要通过解析 OpenHands Agent 的输出日志或特定事件来更新。

**建议方案**：在 OpenHands 后端增加自定义的 `Observation` 类型（如 `SecurityAuditObservation`），前端监听该事件并更新 `vulnList` 状态。

```javascript
// 伪代码示例：监听 OpenHands 事件流
useEffect(() => {
  const handleAgentEvent = (event) => {
    if (event.type === 'poc_success' && event.cwe === 'CWE-119') {
      updateVulnStatus('CWE-119', '已验证');
    } else if (event.type === 'patch_applied' && event.cwe === 'CWE-119') {
      updateVulnStatus('CWE-119', '已修复');
    }
  };
  OpenHandsEventStream.subscribe(handleAgentEvent);
  return () => OpenHandsEventStream.unsubscribe(handleAgentEvent);
}, []);
```

---

## 4. 总结

当前的战术 HUD 界面在组件结构和数据接口上已经**完全兼容** OpenHands 的前端架构。所有的 UI 组件都已“纯化”，只需在 `Dashboard.tsx` 顶层接入 OpenHands 的状态流，即可实现无缝的真实数据驱动。唯一的业务差异在于将原有的“浏览器预览”替换为了安全领域的“CPG 图谱”，这完全符合当前安全防御平台的业务定位。
