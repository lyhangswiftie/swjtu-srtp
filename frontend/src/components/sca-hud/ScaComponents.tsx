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
