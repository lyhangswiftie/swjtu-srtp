# SecureCodeAct (SCA) 前端完整代码文档

本文档汇集了 SecureCodeAct (SCA) 前端的核心代码，包括目录结构说明、SCA 专属定制组件源码，以及被拦截和修改的核心路由代码。

## 1. 前端目录结构

```text
frontend/src/
├── api/                  # API 服务封装（ConversationService, GitService）
├── components/           # UI 组件库
│   ├── features/         # 原生功能组件
│   ├── sca-hud/          # ✅ SCA 专属定制组件（核心新增）
│   │   ├── index.ts
│   │   ├── ScaComponents.tsx # 基础展示组件 (Chat, Terminal, DiffViewer)
│   │   └── ScaDashboard.tsx  # 主控制台容器
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

## 2. SCA 核心定制代码说明

SCA 的核心修改集中在拦截默认的对话界面，并替换为安全审计专属的 `ScaDashboard`。核心组件位于 `components/sca-hud/` 目录下，并修改了 `routes/conversation.tsx` 进行路由劫持。

## 3. 核心源代码

### 文件: `routes/conversation.tsx`

```tsx
import React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { useConversationId } from "#/hooks/use-conversation-id";
import { useCommandStore } from "#/stores/command-store";
import { useConversationStore } from "#/stores/conversation-store";
import { useAgentStore } from "#/stores/agent-store";
import { AgentState } from "#/types/agent-state";

import { useBatchFeedback } from "#/hooks/query/use-batch-feedback";
import { EventHandler } from "../wrapper/event-handler";
import { useConversationConfig } from "#/hooks/query/use-conversation-config";

import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useTaskPolling } from "#/hooks/query/use-task-polling";

import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useIsAuthed } from "#/hooks/query/use-is-authed";
import { ConversationSubscriptionsProvider } from "#/context/conversation-subscriptions-provider";

import { ConversationMain } from "#/components/features/conversation/conversation-main/conversation-main";
import { ConversationNameWithStatus } from "#/components/features/conversation/conversation-name-with-status";

import { ConversationTabs } from "#/components/features/conversation/conversation-tabs/conversation-tabs";
import { WebSocketProviderWrapper } from "#/contexts/websocket-provider-wrapper";
import { useErrorMessageStore } from "#/stores/error-message-store";
import { I18nKey } from "#/i18n/declaration";
import { useEventStore } from "#/stores/use-event-store";
// ✅ SeCodeAct HUD
import { ScaDashboard } from "#/components/sca-hud";

function AppContent() {
  useConversationConfig();
  const { t } = useTranslation();
  const { conversationId } = useConversationId();
  const clearEvents = useEventStore((state) => state.clearEvents);
  const [searchParams] = useSearchParams();
  // 通过 ?view=original 切换回原生界面（调试用）
  const useOriginalView = searchParams.get("view") === "original";

  // Handle both task IDs (task-{uuid}) and regular conversation IDs
  const { isTask, taskStatus, taskDetail } = useTaskPolling();

  const { data: conversation, isFetched } = useActiveConversation();
  const { data: isAuthed } = useIsAuthed();
  const { resetConversationState } = useConversationStore();
  const navigate = useNavigate();
  const clearTerminal = useCommandStore((state) => state.clearTerminal);
  const setCurrentAgentState = useAgentStore(
    (state) => state.setCurrentAgentState,
  );
  const removeErrorMessage = useErrorMessageStore(
    (state) => state.removeErrorMessage,
  );

  // Fetch batch feedback data when conversation is loaded
  useBatchFeedback();

  // 1. Cleanup Effect - runs when navigating to a different conversation
  React.useEffect(() => {
    clearTerminal();
    resetConversationState();
    setCurrentAgentState(AgentState.LOADING);
    removeErrorMessage();
    clearEvents();
  }, [
    conversationId,
    clearTerminal,
    resetConversationState,
    setCurrentAgentState,
    removeErrorMessage,
    clearEvents,
  ]);

  // 2. Task Error Display Effect
  React.useEffect(() => {
    if (isTask && taskStatus === "ERROR") {
      displayErrorToast(
        taskDetail || t(I18nKey.CONVERSATION$FAILED_TO_START_FROM_TASK),
      );
    }
  }, [isTask, taskStatus, taskDetail, t]);

  // 3. Handle conversation not found
  // NOTE: Resuming STOPPED conversations is handled by useSandboxRecovery in WebSocketProviderWrapper
  React.useEffect(() => {
    // Wait for data to be fetched
    if (!isFetched || !isAuthed) return;

    // Handle conversation not found
    if (!conversation) {
      displayErrorToast(t(I18nKey.CONVERSATION$NOT_EXIST_OR_NO_PERMISSION));
      navigate("/");
    }
  }, [conversation, isFetched, isAuthed, navigate, t]);

  const isV0Conversation = conversation?.conversation_version === "V0";

  // ✅ SeCodeAct HUD 内容（默认视图）
  const scaContent = (
    <ConversationSubscriptionsProvider>
      <EventHandler>
        <div
          data-testid="sca-hud-route"
          className="flex flex-col h-full overflow-hidden"
          style={{ background: "#0D1117" }}
        >
          <ScaDashboard />
        </div>
      </EventHandler>
    </ConversationSubscriptionsProvider>
  );

  // 原生 OpenHands 界面（通过 ?view=original 切换）
  const originalContent = (
    <ConversationSubscriptionsProvider>
      <EventHandler>
        <div
          data-testid="app-route"
          className="p-3 md:p-0 flex flex-col h-full gap-3"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4.5 pt-2 lg:pt-0">
            <ConversationNameWithStatus />
            <ConversationTabs />
          </div>
          <ConversationMain />
        </div>
      </EventHandler>
    </ConversationSubscriptionsProvider>
  );

  return (
    <WebSocketProviderWrapper
      version={isV0Conversation ? 0 : 1}
      conversationId={conversationId}
    >
      {useOriginalView ? originalContent : scaContent}
    </WebSocketProviderWrapper>
  );
}

function App() {
  return <AppContent />;
}

export default App;

```

### 文件: `components/sca-hud/index.ts`

```ts
export { ScaDashboard } from "./ScaDashboard";
export { ScaChat, ScaTerminal, ScaDiffViewer, HudPanel } from "./ScaComponents";
export type { ScaChatMessage, ScaDiffLine, ScaTerminalCommand } from "./ScaComponents";

```

### 文件: `components/sca-hud/ScaComponents.tsx`

```tsx
/**
 * SeCodeAct HUD - UI 展示组件
 * 纯展示型（Dumb Components），通过 props 接收数据，不维护业务状态
 */
import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Terminal,
  Code,
  Play,
  CheckCircle,
  XCircle,
  Paperclip,
  Loader2,
} from "lucide-react";

// ============================================================
// 1. 聊天消息类型
// ============================================================
export interface ScaChatMessage {
  id?: string;
  role: "user" | "agent" | "system";
  text: string;
  timestamp?: string;
}

// ============================================================
// 2. 聊天组件 - 对接 OpenHands WebSocket 事件流
// ============================================================
interface ScaChatProps {
  messages: ScaChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading?: boolean;
  agentStatus?: string;
}

export function ScaChat({
  messages,
  onSendMessage,
  isLoading = false,
  agentStatus,
}: ScaChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput("");
  };

  const isAgentRunning =
    agentStatus === "running" || agentStatus === "loading";

  return (
    <div className="flex flex-col h-full bg-[#0b1120] text-[11px] font-mono">
      {/* 状态指示器 */}
      {agentStatus && (
        <div className="px-3 py-1 border-b border-[#00FF9F]/10 flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isAgentRunning
                ? "bg-amber-400 animate-pulse"
                : agentStatus === "finished"
                  ? "bg-[#00FF9F]"
                  : agentStatus === "error"
                    ? "bg-red-400"
                    : "bg-slate-500"
            }`}
          />
          <span className="text-[9px] text-slate-500">
            Agent:{" "}
            {agentStatus === "running"
              ? "执行中"
              : agentStatus === "loading"
                ? "初始化"
                : agentStatus === "awaiting_user_input"
                  ? "等待指令"
                  : agentStatus === "finished"
                    ? "已完成"
                    : agentStatus === "error"
                      ? "错误"
                      : agentStatus}
          </span>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-600 text-[10px] mt-4">
            <div className="text-[#00FF9F]/40 mb-2">▶ SeCodeAct 安全智能体已就绪</div>
            <div>输入安全指令开始分析...</div>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={msg.id || idx}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <span className="text-[9px] text-slate-500 mb-0.5">
              {msg.role === "user"
                ? "安全专家 (User)"
                : msg.role === "system"
                  ? "系统 (System)"
                  : "智能体 (Agent)"}
            </span>
            <div
              className={`p-2 rounded-sm max-w-[90%] whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "bg-blue-900/30 border border-blue-500/30 text-blue-100"
                  : msg.role === "system"
                    ? "bg-slate-800/50 border border-slate-600/30 text-slate-400"
                    : "bg-[#00FF9F]/10 border border-[#00FF9F]/30 text-[#00FF9F]"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isAgentRunning && (
          <div className="flex items-start gap-2">
            <div className="bg-[#00FF9F]/10 border border-[#00FF9F]/30 text-[#00FF9F] p-2 rounded-sm flex items-center gap-2">
              <Loader2 size={10} className="animate-spin" />
              <span>智能体正在处理...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="p-2 border-t border-[#00FF9F]/20 bg-[#1A202C] flex gap-2">
        <button
          className="bg-slate-800 text-slate-400 p-1.5 rounded-sm hover:bg-slate-700 hover:text-slate-200 border border-slate-700 transition-colors"
          title="添加附件"
        >
          <Paperclip size={14} />
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={
            isAgentRunning ? "Agent 执行中，请稍候..." : "输入安全指令..."
          }
          disabled={isAgentRunning}
          className="flex-1 bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1 text-slate-300 focus:outline-none focus:border-[#00FF9F]/50 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={isAgentRunning || !input.trim()}
          className="bg-[#00FF9F]/20 text-[#00FF9F] p-1.5 rounded-sm hover:bg-[#00FF9F]/30 border border-[#00FF9F]/50 transition-colors disabled:opacity-40"
          title="发送指令"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 3. 终端组件 - 对接 OpenHands command-store (appendInput/appendOutput)
// ============================================================
export interface ScaTerminalCommand {
  content: string;
  type: "input" | "output";
}

interface ScaTerminalProps {
  commands: ScaTerminalCommand[];
}

export function ScaTerminal({ commands }: ScaTerminalProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [commands]);

  return (
    <div className="flex flex-col h-full bg-[#000000] text-[#00FF9F]/80 font-mono text-[10px] p-2 overflow-y-auto leading-relaxed">
      <div className="flex items-center gap-2 mb-2 pb-1 border-b border-slate-800 text-slate-500 sticky top-0 bg-[#000000]">
        <Terminal size={12} />
        <span>agent-sandbox-tty1</span>
      </div>
      {commands.length === 0 && (
        <p className="text-slate-600">等待 Agent 执行命令...</p>
      )}
      {commands.map((cmd, idx) => {
        if (cmd.type === "input") {
          return (
            <p key={idx} className="text-blue-400">
              $ {cmd.content}
            </p>
          );
        }
        // output - 根据内容着色
        let colorClass = "text-slate-400";
        if (
          cmd.content.includes("SIGSEGV") ||
          cmd.content.includes("Error") ||
          cmd.content.includes("Exception") ||
          cmd.content.includes("error") ||
          cmd.content.includes("FAILED")
        ) {
          colorClass = "text-amber-400";
        } else if (
          cmd.content.includes("成功") ||
          cmd.content.includes("通过") ||
          cmd.content.includes("Success") ||
          cmd.content.includes("OK") ||
          cmd.content.includes("PASSED")
        ) {
          colorClass = "text-[#00FF9F] font-bold";
        }
        return (
          <p key={idx} className={colorClass}>
            {cmd.content}
          </p>
        );
      })}
      <p className="text-slate-400 mt-2">
        $ <span className="animate-pulse">_</span>
      </p>
      <div ref={terminalEndRef} />
    </div>
  );
}

// ============================================================
// 4. Diff 查看器 - 对接 OpenHands git-service (getGitChangeDiff)
// ============================================================
export interface ScaDiffLine {
  line: number;
  text: string;
  isHighlight: boolean;
}

interface ScaDiffViewerProps {
  file: string;
  originalCode: ScaDiffLine[];
  modifiedCode: ScaDiffLine[];
  onApplyPatch?: () => void;
  onRunTest?: () => void;
  isLoading?: boolean;
}

export function ScaDiffViewer({
  file,
  originalCode,
  modifiedCode,
  onApplyPatch,
  onRunTest,
  isLoading = false,
}: ScaDiffViewerProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0b1120]">
        <div className="flex items-center gap-2 text-[#00FF9F]/50">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[11px] font-mono">加载 Diff 数据...</span>
        </div>
      </div>
    );
  }

  if (!file && originalCode.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0b1120]">
        <div className="text-slate-600 text-[11px] font-mono text-center">
          <div className="text-[#00FF9F]/30 mb-2">◈ 代码修复对比视图</div>
          <div>等待 Agent 执行代码修改...</div>
          <div className="mt-1 text-[9px]">或点击左侧文件树查看文件内容</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0b1120] font-mono text-[11px]">
      <div className="flex items-center justify-between bg-[#1A202C] px-3 py-1.5 border-b border-[#00FF9F]/20">
        <div className="flex items-center gap-2 text-slate-300">
          <Code size={14} className="text-blue-400" />
          <span>{file || "未选择文件"}</span>
        </div>
        <div className="flex items-center gap-2">
          {onRunTest && (
            <button
              onClick={onRunTest}
              className="flex items-center gap-1 bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-sm border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
            >
              <Play size={10} /> 运行测试
            </button>
          )}
          {onApplyPatch && (
            <button
              onClick={onApplyPatch}
              className="flex items-center gap-1 bg-[#00FF9F]/20 text-[#00FF9F] px-2 py-0.5 rounded-sm border border-[#00FF9F]/30 hover:bg-[#00FF9F]/30 transition-colors"
            >
              <CheckCircle size={10} /> 应用补丁
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-0 min-h-full">
          {/* 原始代码 */}
          <div className="border-r border-slate-800">
            <div className="bg-red-900/20 text-red-400 px-2 py-1 border-b border-red-900/30 text-[10px] flex items-center gap-1 sticky top-0">
              <XCircle size={10} /> 原始代码 (Original)
            </div>
            <div className="p-2 text-slate-400 leading-loose">
              {originalCode.map((line, idx) => (
                <div
                  key={idx}
                  className={`flex ${line.isHighlight ? "bg-red-900/30 border-l-2 border-red-500" : ""}`}
                >
                  <span className="w-8 text-slate-600 select-none text-right pr-2">
                    {line.line}
                  </span>
                  <span className={line.isHighlight ? "text-red-400" : ""}>
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 修改后代码 */}
          <div>
            <div className="bg-[#00FF9F]/10 text-[#00FF9F] px-2 py-1 border-b border-[#00FF9F]/20 text-[10px] flex items-center gap-1 sticky top-0">
              <CheckCircle size={10} /> 修复后代码 (Modified)
            </div>
            <div className="p-2 text-slate-300 leading-loose">
              {modifiedCode.map((line, idx) => (
                <div
                  key={idx}
                  className={`flex ${line.isHighlight ? "bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]" : ""}`}
                >
                  <span className="w-8 text-slate-600 select-none text-right pr-2">
                    {line.line}
                  </span>
                  <span className={line.isHighlight ? "text-[#00FF9F]" : ""}>
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 5. HUD 面板容器组件（带 L 型角标装饰）
// ============================================================
interface HudPanelProps {
  title?: string | null;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
  titleIcon?: React.ComponentType<{ size?: number; className?: string }>;
}

export function HudPanel({
  title = null,
  children,
  className = "",
  headerRight = null,
  titleIcon: Icon,
}: HudPanelProps) {
  return (
    <div
      className={`relative border border-[#00FF9F]/30 bg-[#1A202C] flex flex-col ${className}`}
    >
      {/* L 型角标 */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t-[2px] border-l-[2px] border-[#00FF9F] z-20" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-[2px] border-r-[2px] border-[#00FF9F] z-20" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[2px] border-l-[2px] border-[#00FF9F] z-20" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[2px] border-r-[2px] border-[#00FF9F] z-20" />

      {title && (
        <div className="text-[11px] font-bold text-[#00FF9F] bg-[#00FF9F]/10 px-3 py-1.5 border-b border-[#00FF9F]/30 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={14} className="text-[#00FF9F]" />}
            <span className="tracking-wide drop-shadow-[0_0_2px_rgba(0,255,159,0.8)]">
              {title}
            </span>
          </div>
          {headerRight}
        </div>
      )}
      <div className="flex-1 flex flex-col relative z-10 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

```

### 文件: `components/sca-hud/ScaDashboard.tsx`

```tsx
/**
 * SeCodeAct HUD - 主 Dashboard 组件
 * 集成 OpenHands 真实 WebSocket 事件流 + REST API
 *
 * 架构说明：
 * - 聊天：通过 useSendMessage hook 发送，通过 useEventStore 接收 V1 MessageEvent
 * - 终端：通过 useCommandStore 读取 Agent 执行的命令和输出
 * - 文件树：通过 ConversationService.getFiles() REST API 获取
 * - Diff 视图：通过 GitService.getGitChangeDiff() REST API 获取
 * - Agent 状态：通过 useAgentState hook 读取
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen,
  Terminal,
  GitCompare,
  MessageSquare,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  AlertTriangle,
  Shield,
  Activity,
  Cpu,
  Zap,
  GitBranch,
  Lock,
  Loader2,
} from "lucide-react";
import { useCommandStore } from "#/stores/command-store";
import { useEventStore } from "#/stores/use-event-store";
import { useSendMessage } from "#/hooks/use-send-message";
import { useAgentState } from "#/hooks/use-agent-state";
import { useConversationId } from "#/hooks/use-conversation-id";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import GitService from "#/api/git-service/git-service.api";
import { createChatMessage } from "#/services/chat-service";
import { isMessageEvent, isV1Event } from "#/types/v1/type-guards";
import { AgentState } from "#/types/agent-state";
import {
  ScaChat,
  ScaTerminal,
  ScaDiffViewer,
  HudPanel,
  ScaChatMessage,
  ScaDiffLine,
} from "./ScaComponents";

// ============================================================
// 辅助函数：将 Git Diff 字符串解析为行数组
// ============================================================
function parseDiffToLines(
  diffText: string,
  isOriginal: boolean,
): ScaDiffLine[] {
  if (!diffText) return [];
  const lines = diffText.split("\n");
  const result: ScaDiffLine[] = [];
  let lineNum = 1;

  for (const line of lines) {
    if (isOriginal) {
      // 原始代码：跳过以 + 开头的行（新增行）
      if (line.startsWith("+") && !line.startsWith("+++")) continue;
      const isHighlight = line.startsWith("-") && !line.startsWith("---");
      result.push({
        line: lineNum++,
        text: isHighlight ? line.slice(1) : line.replace(/^[-+ ]/, ""),
        isHighlight,
      });
    } else {
      // 修改后代码：跳过以 - 开头的行（删除行）
      if (line.startsWith("-") && !line.startsWith("---")) continue;
      const isHighlight = line.startsWith("+") && !line.startsWith("+++");
      result.push({
        line: lineNum++,
        text: isHighlight ? line.slice(1) : line.replace(/^[-+ ]/, ""),
        isHighlight,
      });
    }
  }
  return result;
}

// ============================================================
// 文件树节点组件
// ============================================================
interface FileTreeNodeProps {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeNodeProps[];
  level: number;
  onSelectFile: (path: string) => void;
  selectedFile?: string;
}

function FileTreeNode({
  name,
  path,
  isDir,
  children,
  level,
  onSelectFile,
  selectedFile,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(level < 2);

  if (isDir) {
    return (
      <div>
        <div
          className="flex items-center gap-1 cursor-pointer hover:bg-[#00FF9F]/5 px-1 py-0.5 rounded-sm"
          style={{ paddingLeft: `${level * 12 + 4}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown size={10} className="text-slate-500" />
          ) : (
            <ChevronRight size={10} className="text-slate-500" />
          )}
          <Folder size={12} className="text-blue-400" />
          <span className="text-slate-300 text-[10px]">{name}</span>
        </div>
        {expanded && children && (
          <div>
            {children.map((child) => (
              <FileTreeNode
                key={child.path}
                {...child}
                level={level + 1}
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedFile === path;
  return (
    <div
      className={`flex items-center gap-1 cursor-pointer px-1 py-0.5 rounded-sm ${
        isSelected
          ? "bg-[#00FF9F]/20 border-l-2 border-[#00FF9F]"
          : "hover:bg-slate-800/50"
      }`}
      style={{ paddingLeft: `${level * 12 + 4}px` }}
      onClick={() => onSelectFile(path)}
    >
      <File size={10} className="text-slate-500" />
      <span
        className={`text-[10px] ${isSelected ? "text-[#00FF9F]" : "text-slate-400"}`}
      >
        {name}
      </span>
    </div>
  );
}

// ============================================================
// 将扁平文件路径列表转换为树形结构
// ============================================================
function buildFileTree(
  paths: string[],
  basePath: string = "/workspace",
): FileTreeNodeProps[] {
  const root: Record<string, FileTreeNodeProps> = {};

  for (const fullPath of paths) {
    // 去掉 basePath 前缀
    const relativePath = fullPath.startsWith(basePath)
      ? fullPath.slice(basePath.length).replace(/^\//, "")
      : fullPath.replace(/^\//, "");

    const parts = relativePath.split("/").filter(Boolean);
    let current = root;
    let currentPath = basePath;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = `${currentPath}/${part}`;
      const isLast = i === parts.length - 1;

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          isDir: !isLast,
          children: isLast ? undefined : [],
          level: i,
        };
      }

      if (!isLast) {
        current = current[part].children as unknown as Record<
          string,
          FileTreeNodeProps
        >;
        if (!current) {
          current = {};
        }
      }
    }
  }

  const toArray = (
    obj: Record<string, FileTreeNodeProps>,
  ): FileTreeNodeProps[] =>
    Object.values(obj).sort((a, b) => {
      // 目录排在文件前面
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

  return toArray(root);
}

// ============================================================
// 顶部状态栏组件
// ============================================================
interface ScaStatusBarProps {
  agentState: AgentState;
  conversationId: string;
  messageCount: number;
  commandCount: number;
}

function ScaStatusBar({
  agentState,
  conversationId,
  messageCount,
  commandCount,
}: ScaStatusBarProps) {
  const isRunning =
    agentState === AgentState.RUNNING || agentState === AgentState.LOADING;
  const isError = agentState === AgentState.ERROR;
  const isFinished = agentState === AgentState.FINISHED;

  return (
    <div className="flex items-center justify-between bg-[#0D1117] border-b border-[#00FF9F]/20 px-4 py-1.5 text-[10px] font-mono">
      {/* 左侧：品牌标识 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Shield size={14} className="text-[#00FF9F]" />
          <span className="text-[#00FF9F] font-bold tracking-widest drop-shadow-[0_0_4px_rgba(0,255,159,0.8)]">
            SeCodeAct
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">安全代码智能体</span>
        </div>
        <div className="text-slate-600">
          Session:{" "}
          <span className="text-slate-400">
            {conversationId.slice(0, 8)}...
          </span>
        </div>
      </div>

      {/* 中间：Agent 状态 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isRunning
                ? "bg-amber-400 animate-pulse"
                : isError
                  ? "bg-red-500"
                  : isFinished
                    ? "bg-[#00FF9F]"
                    : "bg-slate-500"
            }`}
          />
          <span
            className={
              isRunning
                ? "text-amber-400"
                : isError
                  ? "text-red-400"
                  : isFinished
                    ? "text-[#00FF9F]"
                    : "text-slate-500"
            }
          >
            {agentState === AgentState.RUNNING
              ? "RUNNING"
              : agentState === AgentState.LOADING
                ? "INITIALIZING"
                : agentState === AgentState.AWAITING_USER_INPUT
                  ? "AWAITING INPUT"
                  : agentState === AgentState.FINISHED
                    ? "FINISHED"
                    : agentState === AgentState.ERROR
                      ? "ERROR"
                      : agentState === AgentState.PAUSED
                        ? "PAUSED"
                        : agentState.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <MessageSquare size={10} />
          <span>{messageCount} msgs</span>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <Terminal size={10} />
          <span>{commandCount} cmds</span>
        </div>
      </div>

      {/* 右侧：系统信息 */}
      <div className="flex items-center gap-3 text-slate-600">
        <div className="flex items-center gap-1">
          <Cpu size={10} />
          <span>CodeActAgent</span>
        </div>
        <div className="flex items-center gap-1">
          <GitBranch size={10} />
          <span>main</span>
        </div>
        <div className="flex items-center gap-1">
          <Lock size={10} className="text-[#00FF9F]/50" />
          <span className="text-[#00FF9F]/50">SECURE</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主 Dashboard 组件
// ============================================================
export function ScaDashboard() {
  const { conversationId } = useConversationId();
  const { curAgentState } = useAgentState();
  const { send } = useSendMessage();

  // 从 Zustand stores 读取数据
  const commands = useCommandStore((state) => state.commands);
  const events = useEventStore((state) => state.events);
  const uiEvents = useEventStore((state) => state.uiEvents);

  // 本地 UI 状态
  const [fileTree, setFileTree] = useState<FileTreeNodeProps[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffOriginal, setDiffOriginal] = useState<ScaDiffLine[]>([]);
  const [diffModified, setDiffModified] = useState<ScaDiffLine[]>([]);
  const [diffFile, setDiffFile] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"diff" | "file">("diff");
  const [gitChanges, setGitChanges] = useState<
    Array<{ status: string; path: string }>
  >([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  const [repoError, setRepoError] = useState<string>("");
  const fileRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================
  // 从 V1 事件流中提取聊天消息
  // ============================================================
  const chatMessages: ScaChatMessage[] = React.useMemo(() => {
    const msgs: ScaChatMessage[] = [];

    // 处理 V1 事件
    for (const event of uiEvents) {
      if (!isV1Event(event)) continue;
      if (!isMessageEvent(event)) continue;

      const msg = event.llm_message;
      if (!msg?.content) continue;

      // 只显示 user 和 assistant 消息
      if (msg.role !== "user" && msg.role !== "assistant") continue;

      let text = "";
      if (Array.isArray(msg.content)) {
        text = msg.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { type: "text"; text: string }).text)
          .join("\n");
      } else if (typeof msg.content === "string") {
        text = msg.content;
      }

      if (!text.trim()) continue;

      msgs.push({
        id: event.id,
        role: msg.role === "user" ? "user" : "agent",
        text,
        timestamp: event.timestamp,
      });
    }

    // 如果没有 V1 事件，处理 V0 事件
    if (msgs.length === 0) {
      for (const event of events) {
        if (isV1Event(event)) continue; // 跳过 V1 事件，已处理
        const v0Event = event as Record<string, unknown>;
        if (!v0Event.action && !v0Event.observation) continue;

        if (v0Event.action === "message") {
          const args = v0Event.args as Record<string, unknown>;
          if (args?.content) {
            msgs.push({
              role:
                (v0Event.source as string) === "user" ? "user" : "agent",
              text: String(args.content),
            });
          }
        }
      }
    }

    return msgs;
  }, [events, uiEvents]);

  // ============================================================
  // 加载文件树
  // ============================================================
  const loadFileTree = useCallback(async () => {
    if (!conversationId) return;
    setIsLoadingFiles(true);
    try {
      const response = await ConversationService.getFiles(conversationId);
      if (response && Array.isArray(response)) {
        const tree = buildFileTree(response as unknown as string[]);
        setFileTree(tree);
      }
    } catch (err) {
      console.warn("[ScaDashboard] 文件树加载失败:", err);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [conversationId]);

  // ============================================================
  // 加载 Git 变更列表
  // ============================================================
  const loadGitChanges = useCallback(async () => {
    if (!conversationId) return;
    try {
      const changes = await GitService.getGitChanges(conversationId);
      setGitChanges(changes || []);
    } catch {
      // Git 变更可能在没有 git 仓库时失败，静默处理
    }
  }, [conversationId]);

  // ============================================================
  // 点击文件：加载 Diff 或文件内容
  // ============================================================
  const handleSelectFile = useCallback(
    async (filePath: string) => {
      setSelectedFile(filePath);

      // 检查是否有 Git 变更
      const hasChange = gitChanges.some((c) => filePath.endsWith(c.path));

      if (hasChange) {
        setActiveTab("diff");
        setIsLoadingDiff(true);
        setDiffFile(filePath);
        try {
          const diff = await GitService.getGitChangeDiff(
            conversationId,
            filePath,
          );
          setDiffOriginal(parseDiffToLines(diff.original, true));
          setDiffModified(parseDiffToLines(diff.modified, false));
        } catch (err) {
          console.warn("[ScaDashboard] Diff 加载失败:", err);
          setDiffOriginal([]);
          setDiffModified([]);
        } finally {
          setIsLoadingDiff(false);
        }
      } else {
        // 加载文件内容（通过 V1 API）
        setActiveTab("file");
        setIsLoadingDiff(true);
        setDiffFile(filePath);
        try {
          const content = await ConversationService.getFiles(
            conversationId,
            filePath,
          );
          // 将文件内容转为 diff 格式展示
          const lines = String(content).split("\n");
          const fileLines: ScaDiffLine[] = lines.map((text, idx) => ({
            line: idx + 1,
            text,
            isHighlight: false,
          }));
          setDiffOriginal(fileLines);
          setDiffModified(fileLines);
        } catch (err) {
          console.warn("[ScaDashboard] 文件内容加载失败:", err);
        } finally {
          setIsLoadingDiff(false);
        }
      }
    },
    [conversationId, gitChanges],
  );

  // ============================================================
  // 发送消息到 Agent
  // ============================================================
  const handleSendMessage = useCallback(
    async (text: string) => {
      const timestamp = new Date().toISOString();
      const message = createChatMessage(text, [], [], timestamp);
      await send(message);
    },
    [send],
  );

  // ============================================================
  // 加载 GitHub 仓库
  // ============================================================
  const handleLoadRepo = useCallback(async () => {
    if (!repoUrl.trim()) return;
    setIsLoadingRepo(true);
    setRepoError("");
    try {
      // 通过 Agent 指令克隆仓库
      const cloneCmd = `请克隆以下 GitHub 仓库到工作区并列出文件结构：${repoUrl}`;
      await handleSendMessage(cloneCmd);
      // 等待 Agent 处理后刷新文件树
      setTimeout(() => {
        loadFileTree();
        loadGitChanges();
      }, 5000);
    } catch (err) {
      setRepoError("仓库加载失败，请检查 URL 格式");
    } finally {
      setIsLoadingRepo(false);
    }
  }, [repoUrl, handleSendMessage, loadFileTree, loadGitChanges]);

  // ============================================================
  // 初始化和定时刷新
  // ============================================================
  useEffect(() => {
    loadFileTree();
    loadGitChanges();

    // 每 10 秒刷新一次文件树和 Git 变更
    fileRefreshTimer.current = setInterval(() => {
      loadFileTree();
      loadGitChanges();
    }, 10000);

    return () => {
      if (fileRefreshTimer.current) {
        clearInterval(fileRefreshTimer.current);
      }
    };
  }, [conversationId]);

  // Agent 完成时刷新文件树
  useEffect(() => {
    if (
      curAgentState === AgentState.FINISHED ||
      curAgentState === AgentState.AWAITING_USER_INPUT
    ) {
      loadFileTree();
      loadGitChanges();
    }
  }, [curAgentState]);

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="flex flex-col h-full bg-[#0D1117] text-white overflow-hidden font-mono">
      {/* 顶部状态栏 */}
      <ScaStatusBar
        agentState={curAgentState}
        conversationId={conversationId}
        messageCount={chatMessages.length}
        commandCount={commands.length}
      />

      {/* 主内容区：三列布局 */}
      <div className="flex flex-1 overflow-hidden gap-1 p-1">
        {/* ===== 左列：文件树 + 仓库对接 ===== */}
        <div className="flex flex-col gap-1 w-[220px] min-w-[180px]">
          {/* 文件资源管理器 */}
          <HudPanel
            title="文件资源管理器"
            titleIcon={FolderOpen}
            className="flex-1 overflow-hidden"
            headerRight={
              <button
                onClick={() => {
                  loadFileTree();
                  loadGitChanges();
                }}
                className="text-slate-500 hover:text-[#00FF9F] transition-colors"
                title="刷新文件树"
              >
                <RefreshCw size={11} />
              </button>
            }
          >
            <div className="flex-1 overflow-y-auto p-1">
              {isLoadingFiles && fileTree.length === 0 ? (
                <div className="flex items-center gap-2 text-slate-600 text-[10px] p-2">
                  <Loader2 size={10} className="animate-spin" />
                  <span>加载文件树...</span>
                </div>
              ) : fileTree.length === 0 ? (
                <div className="text-slate-600 text-[10px] p-2">
                  <div className="text-[#00FF9F]/30 mb-1">◈ 工作区</div>
                  <div>等待 Agent 初始化...</div>
                </div>
              ) : (
                fileTree.map((node) => (
                  <FileTreeNode
                    key={node.path}
                    {...node}
                    level={0}
                    onSelectFile={handleSelectFile}
                    selectedFile={selectedFile}
                  />
                ))
              )}
            </div>

            {/* Git 变更列表 */}
            {gitChanges.length > 0 && (
              <div className="border-t border-slate-800 p-1">
                <div className="text-[9px] text-slate-500 px-1 mb-1 flex items-center gap-1">
                  <Activity size={9} />
                  <span>Git 变更 ({gitChanges.length})</span>
                </div>
                {gitChanges.slice(0, 5).map((change, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 px-1 py-0.5 cursor-pointer hover:bg-slate-800/50 rounded-sm"
                    onClick={() =>
                      handleSelectFile(`/workspace/${change.path}`)
                    }
                  >
                    <span
                      className={`text-[9px] font-bold ${
                        change.status === "M" || change.status === "UPDATED"
                          ? "text-amber-400"
                          : change.status === "A" ||
                              change.status === "ADDED"
                            ? "text-[#00FF9F]"
                            : change.status === "D" ||
                                change.status === "DELETED"
                              ? "text-red-400"
                              : "text-blue-400"
                      }`}
                    >
                      {change.status.charAt(0)}
                    </span>
                    <span className="text-[9px] text-slate-400 truncate">
                      {change.path.split("/").pop()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </HudPanel>

          {/* 代码仓库对接 */}
          <HudPanel
            title="代码仓库对接"
            titleIcon={GitBranch}
            className="shrink-0"
          >
            <div className="p-2 space-y-1.5">
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLoadRepo()}
                placeholder="https://github.com/owner/repo"
                className="w-full bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-[#00FF9F]/50"
              />
              {repoError && (
                <div className="flex items-center gap-1 text-red-400 text-[9px]">
                  <AlertTriangle size={9} />
                  <span>{repoError}</span>
                </div>
              )}
              <button
                onClick={handleLoadRepo}
                disabled={isLoadingRepo || !repoUrl.trim()}
                className="w-full flex items-center justify-center gap-1 bg-blue-500/20 text-blue-400 py-1 rounded-sm border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-40 text-[10px]"
              >
                {isLoadingRepo ? (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    <span>克隆中...</span>
                  </>
                ) : (
                  <>
                    <Zap size={10} />
                    <span>挂载仓库</span>
                  </>
                )}
              </button>
            </div>
          </HudPanel>
        </div>

        {/* ===== 中列：Diff 视图 ===== */}
        <HudPanel
          title={
            activeTab === "diff"
              ? `代码修复对比 ${diffFile ? `- ${diffFile.split("/").pop()}` : ""}`
              : `文件查看器 ${diffFile ? `- ${diffFile.split("/").pop()}` : ""}`
          }
          titleIcon={GitCompare}
          className="flex-1 overflow-hidden"
          headerRight={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("diff")}
                className={`text-[9px] px-1.5 py-0.5 rounded-sm border transition-colors ${
                  activeTab === "diff"
                    ? "bg-[#00FF9F]/20 text-[#00FF9F] border-[#00FF9F]/30"
                    : "text-slate-500 border-slate-700 hover:text-slate-300"
                }`}
              >
                Diff
              </button>
              <button
                onClick={() => setActiveTab("file")}
                className={`text-[9px] px-1.5 py-0.5 rounded-sm border transition-colors ${
                  activeTab === "file"
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    : "text-slate-500 border-slate-700 hover:text-slate-300"
                }`}
              >
                文件
              </button>
            </div>
          }
        >
          <ScaDiffViewer
            file={diffFile}
            originalCode={diffOriginal}
            modifiedCode={diffModified}
            isLoading={isLoadingDiff}
            onApplyPatch={
              diffFile
                ? () => handleSendMessage(`请应用对 ${diffFile} 的修改`)
                : undefined
            }
            onRunTest={
              diffFile
                ? () =>
                    handleSendMessage(
                      `请对 ${diffFile} 运行相关测试并报告结果`,
                    )
                : undefined
            }
          />
        </HudPanel>

        {/* ===== 右列：聊天 + 终端 ===== */}
        <div className="flex flex-col gap-1 w-[300px] min-w-[250px]">
          {/* 任务交互终端（聊天）*/}
          <HudPanel
            title="任务交互终端"
            titleIcon={MessageSquare}
            className="flex-1 overflow-hidden"
          >
            <ScaChat
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              isLoading={
                curAgentState === AgentState.RUNNING ||
                curAgentState === AgentState.LOADING
              }
              agentStatus={curAgentState}
            />
          </HudPanel>

          {/* 沙箱 Agent 执行终端 */}
          <HudPanel
            title="沙箱执行终端"
            titleIcon={Terminal}
            className="h-[280px] shrink-0 overflow-hidden"
          >
            <ScaTerminal commands={commands} />
          </HudPanel>
        </div>
      </div>
    </div>
  );
}

```

### 文件: `routes.ts`

```ts
import {
  type RouteConfig,
  layout,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("onboarding", "routes/onboarding-form.tsx"),
  route("information-request", "routes/information-request.tsx"),
  layout("routes/root-layout.tsx", [
    index("routes/home.tsx"),
    route("accept-tos", "routes/accept-tos.tsx"),
    route("launch", "routes/launch.tsx"),
    route("settings", "routes/settings.tsx", [
      index("routes/llm-settings.tsx"),
      route("mcp", "routes/mcp-settings.tsx"),
      route("skills", "routes/skills-settings.tsx"),
      route("user", "routes/user-settings.tsx"),
      route("integrations", "routes/git-settings.tsx"),
      route("app", "routes/app-settings.tsx"),
      route("billing", "routes/billing.tsx"),
      route("secrets", "routes/secrets-settings.tsx"),
      route("api-keys", "routes/api-keys.tsx"),
      route("org-members", "routes/manage-organization-members.tsx"),
      route("org", "routes/manage-org.tsx"),
    ]),
    route("conversations/:conversationId", "routes/conversation.tsx"),
    route("microagent-management", "routes/microagent-management.tsx"),
    route("oauth/device/verify", "routes/device-verify.tsx"),
  ]),
  // Shared routes that don't require authentication
  route(
    "shared/conversations/:conversationId",
    "routes/shared-conversation.tsx",
  ),
] satisfies RouteConfig;

```

### 文件: `root.tsx`

```tsx
import {
  Links,
  Meta,
  MetaFunction,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import "./tailwind.css";
import "./index.css";
import React from "react";
import { Toaster } from "react-hot-toast";
import { useInvitation } from "#/hooks/use-invitation";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <Toaster />
        <div id="modal-portal-exit" />
      </body>
    </html>
  );
}

export const meta: MetaFunction = () => [
  { title: "OpenHands" },
  { name: "description", content: "Let's Start Building!" },
];

export default function App() {
  // Handle invitation token cleanup when invitation flow completes
  // This runs on all pages to catch redirects from auth callback
  useInvitation();

  return <Outlet />;
}

```

### 文件: `entry.client.tsx`

```tsx
/* eslint-disable react/react-in-jsx-scope */
/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { HydratedRouter } from "react-router/dom";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import "./i18n";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./query-client-config";
import { PostHogWrapper } from "./components/providers/posthog-wrapper";

async function prepareApp() {
  if (
    process.env.NODE_ENV === "development" &&
    import.meta.env.VITE_MOCK_API === "true"
  ) {
    const { worker } = await import("./mocks/browser");

    await worker.start({
      onUnhandledRequest: "bypass",
    });
  }
}

prepareApp().then(() =>
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <PostHogWrapper>
            <HydratedRouter />
          </PostHogWrapper>
        </QueryClientProvider>
      </StrictMode>,
    );
  }),
);

```

### 文件: `contexts/websocket-provider-wrapper.tsx`

```tsx
import React from "react";
import { WsClientProvider } from "#/context/ws-client-provider";
import { ConversationWebSocketProvider } from "#/contexts/conversation-websocket-context";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSubConversations } from "#/hooks/query/use-sub-conversations";
import { useSandboxRecovery } from "#/hooks/use-sandbox-recovery";
import { isTaskConversationId } from "#/utils/conversation-local-storage";

interface WebSocketProviderWrapperProps {
  children: React.ReactNode;
  conversationId: string;
  version: 0 | 1;
}

/**
 * A wrapper component that conditionally renders either the old v0 WebSocket provider
 * or the new v1 WebSocket provider based on the version prop.
 *
 * @param version - 0 for old WsClientProvider, 1 for new ConversationWebSocketProvider
 * @param conversationId - The conversation ID to pass to the provider
 * @param children - The child components to wrap
 */
export function WebSocketProviderWrapper({
  children,
  conversationId,
  version,
}: WebSocketProviderWrapperProps) {
  // Get conversation data for V1 provider
  const {
    data: conversation,
    refetch: refetchConversation,
    isFetched,
  } = useActiveConversation();
  // Get sub-conversation data for V1 provider
  const { data: subConversations } = useSubConversations(
    conversation?.sub_conversation_ids ?? [],
  );

  // Filter out null sub-conversations
  const filteredSubConversations = subConversations?.filter(
    (subConversation) => subConversation !== null,
  );

  const isConversationReady =
    !isTaskConversationId(conversationId) && isFetched && !!conversation;
  // Recovery for V1 conversations - handles page refresh and tab focus
  // Does NOT resume on WebSocket disconnect (server pauses after 20 min inactivity)
  useSandboxRecovery({
    conversationId,
    conversationStatus: conversation?.status,
    refetchConversation: isConversationReady ? refetchConversation : undefined,
  });

  if (version === 0) {
    return (
      <WsClientProvider conversationId={conversationId}>
        {children}
      </WsClientProvider>
    );
  }

  if (version === 1) {
    return (
      <ConversationWebSocketProvider
        conversationId={conversationId}
        conversationUrl={conversation?.url}
        sessionApiKey={conversation?.session_api_key}
        subConversationIds={conversation?.sub_conversation_ids}
        subConversations={filteredSubConversations}
      >
        {children}
      </ConversationWebSocketProvider>
    );
  }

  throw new Error(
    `Unsupported WebSocket provider version: ${version}. Supported versions are 0 and 1.`,
  );
}

```

### 文件: `hooks/use-send-message.ts`

```ts
import { useCallback } from "react";
import { useWsClient } from "#/context/ws-client-provider";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useConversationWebSocket } from "#/contexts/conversation-websocket-context";
import { useConversationId } from "#/hooks/use-conversation-id";
import { V1MessageContent } from "#/api/conversation-service/v1-conversation-service.types";

interface SendResult {
  queued: boolean; // true if message was queued for later delivery
}

/**
 * Unified hook for sending messages that works with both V0 and V1 conversations
 * - For V0 conversations: Uses Socket.IO WebSocket via useWsClient
 * - For V1 conversations: Uses native WebSocket via ConversationWebSocketProvider
 */
export function useSendMessage() {
  const { conversationId } = useConversationId();
  const { data: conversation } = useActiveConversation();
  const { send: v0Send } = useWsClient();

  // Get V1 context (will be null if not in V1 provider)
  const v1Context = useConversationWebSocket();

  // Check if this is a V1 conversation - match logic in useUnifiedWebSocketStatus
  // Use both ID prefix and conversation_version to handle cases where conversation
  // data is temporarily undefined during refetch
  const isV1Conversation =
    conversationId.startsWith("task-") ||
    conversation?.conversation_version === "V1";

  const send = useCallback(
    async (event: Record<string, unknown>): Promise<SendResult> => {
      if (isV1Conversation && v1Context) {
        // V1: Convert V0 event format to V1 message format
        const { action, args } = event as {
          action: string;
          args?: {
            content?: string;
            image_urls?: string[];
            file_urls?: string[];
            timestamp?: string;
          };
        };

        if (action === "message" && args?.content) {
          // Build V1 message content array
          const content: Array<V1MessageContent> = [
            {
              type: "text",
              text: args.content,
            },
          ];

          // Add images if present - using SDK's ImageContent format
          if (args.image_urls && args.image_urls.length > 0) {
            content.push({
              type: "image",
              image_urls: args.image_urls,
            });
          }

          // Send via V1 WebSocket context (uses correct host/port)
          const result = await v1Context.sendMessage({
            role: "user",
            content,
          });
          return result;
        }
        // For non-message events, fall back to V0 send
        // (e.g., agent state changes, other control events)
        v0Send(event);
        return { queued: false };
      }
      // V0: Use Socket.IO
      v0Send(event);
      return { queued: false };
    },
    [isV1Conversation, v1Context, v0Send, conversationId],
  );

  return { send };
}

```

### 文件: `stores/command-store.ts`

```ts
import { create } from "zustand";

export type Command = {
  content: string;
  type: "input" | "output";
};

interface CommandState {
  commands: Command[];
  appendInput: (content: string) => void;
  appendOutput: (content: string) => void;
  clearTerminal: () => void;
}

export const useCommandStore = create<CommandState>((set) => ({
  commands: [],
  appendInput: (content: string) =>
    set((state) => ({
      commands: [...state.commands, { content, type: "input" }],
    })),
  appendOutput: (content: string) =>
    set((state) => ({
      commands: [...state.commands, { content, type: "output" }],
    })),
  clearTerminal: () => set({ commands: [] }),
}));

```

### 文件: `stores/use-event-store.ts`

```ts
import { create } from "zustand";
import { OpenHandsEvent } from "#/types/v1/core";
import { handleEventForUI } from "#/utils/handle-event-for-ui";
import { OpenHandsParsedEvent } from "#/types/core";
import { isV1Event } from "#/types/v1/type-guards";

// While we transition to v1 events, our store can handle both v0 and v1 events
export type OHEvent = (OpenHandsEvent | OpenHandsParsedEvent) & {
  isFromPlanningAgent?: boolean;
};

const getEventId = (event: OHEvent): string | number | undefined =>
  "id" in event ? event.id : undefined;

const getEventTimestamp = (event: OHEvent): string | undefined =>
  "timestamp" in event ? event.timestamp : undefined;

/**
 * Compare two events by timestamp for sorting.
 * Events without timestamps are placed at the end.
 */
const compareEventsByTimestamp = (a: OHEvent, b: OHEvent): number => {
  const timestampA = getEventTimestamp(a);
  const timestampB = getEventTimestamp(b);

  // Events without timestamps go to the end
  if (!timestampA && !timestampB) return 0;
  if (!timestampA) return 1;
  if (!timestampB) return -1;

  // Compare ISO timestamp strings (lexicographic comparison works for ISO format)
  return timestampA.localeCompare(timestampB);
};

/**
 * Check if the new event needs sorting (i.e., it's out of order).
 * Returns true if the new event's timestamp is earlier than the last event's timestamp.
 */
const needsSorting = (events: OHEvent[], newEvent: OHEvent): boolean => {
  if (events.length === 0) return false;

  const lastEvent = events[events.length - 1];
  const lastTimestamp = getEventTimestamp(lastEvent);
  const newTimestamp = getEventTimestamp(newEvent);

  // If either event doesn't have a timestamp, don't sort
  if (!lastTimestamp || !newTimestamp) return false;

  // Sort needed if new event's timestamp is earlier than last event's timestamp
  return newTimestamp < lastTimestamp;
};

export interface EventState {
  events: OHEvent[];
  eventIds: Set<string | number>;
  uiEvents: OHEvent[];
  addEvent: (event: OHEvent) => void;
  clearEvents: () => void;
}

export const useEventStore = create<EventState>()((set) => ({
  events: [],
  eventIds: new Set(),
  uiEvents: [],
  addEvent: (event: OHEvent) =>
    set((state) => {
      // Deduplicate: skip if event with same id already exists (O(1) lookup)
      const eventId = getEventId(event);
      if (eventId !== undefined && state.eventIds.has(eventId)) {
        return state;
      }

      // Add event and sort if needed to maintain chronological order
      let newEvents = [...state.events, event];
      if (needsSorting(state.events, event)) {
        newEvents = newEvents.sort(compareEventsByTimestamp);
      }

      const newEventIds =
        eventId !== undefined
          ? new Set(state.eventIds).add(eventId)
          : state.eventIds;

      // Process UI events and sort if needed
      let newUiEvents = isV1Event(event)
        ? // @ts-expect-error - temporary, needs proper typing
          handleEventForUI(event, state.uiEvents)
        : [...state.uiEvents, event];

      if (needsSorting(state.uiEvents, event)) {
        newUiEvents = newUiEvents.sort(compareEventsByTimestamp);
      }

      return {
        events: newEvents,
        eventIds: newEventIds,
        uiEvents: newUiEvents,
      };
    }),
  clearEvents: () =>
    set(() => ({
      events: [],
      eventIds: new Set(),
      uiEvents: [],
    })),
}));

```

