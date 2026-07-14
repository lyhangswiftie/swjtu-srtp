/**
 * TerminalPanel.tsx
 *
 * SCA-HUD 终端面板子组件（TC-SCA-020 拆分）
 *
 * 职责：
 * - 渲染沙箱 Agent 执行终端输出（OpenHandsTerminal）
 * - 接收 logs 字符串数组作为 props
 */
import React from "react";
import { TerminalSquare } from "lucide-react";
import { OpenHandsTerminal } from "./OpenHandsMocks";

interface TerminalPanelProps {
  logs: string[];
  className?: string;
}

export default function TerminalPanel({
  logs,
  className = "",
}: TerminalPanelProps) {
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#00FF9F]/30 shrink-0">
        <TerminalSquare size={12} className="text-[#00FF9F]" />
        <span className="text-[11px] font-bold text-slate-200">
          沙箱Agent执行终端（Terminal）
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <OpenHandsTerminal logs={logs} />
      </div>
    </div>
  );
}
