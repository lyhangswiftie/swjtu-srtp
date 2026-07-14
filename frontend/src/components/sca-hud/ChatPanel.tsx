/**
 * ChatPanel.tsx
 *
 * SCA-HUD 聊天面板子组件（TC-SCA-020 拆分）
 *
 * 职责：
 * - 渲染聊天消息列表（Chat Messages）
 * - 渲染消息输入框（Chat Input）
 * - 接收 messages 和 onSendMessage 作为 props
 */
import React from "react";
import { MessageSquare } from "lucide-react";
import { OpenHandsChat } from "./OpenHandsMocks";

interface ChatPanelProps {
  messages: { role: "user" | "agent"; text: string }[];
  onSendMessage: (message: string) => void;
  className?: string;
}

export default function ChatPanel({
  messages,
  onSendMessage,
  className = "",
}: ChatPanelProps) {
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#00FF9F]/30 shrink-0">
        <MessageSquare size={12} className="text-[#00FF9F]" />
        <span className="text-[11px] font-bold text-slate-200">
          任务交互终端
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <OpenHandsChat messages={messages} onSendMessage={onSendMessage} />
      </div>
    </div>
  );
}
