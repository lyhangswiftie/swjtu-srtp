/**
 * HudLayout.tsx
 *
 * SCA-HUD 三列主布局骨架子组件（TC-SCA-020 拆分）
 *
 * 职责：
 * - 渲染 HUD 的三列布局容器（左 25% + 中 50% + 右 25%）
 * - 渲染顶部状态栏（Header）
 * - 渲染底部状态栏（Footer）
 * - 接收 left / center / right 插槽作为 props
 */
import React from "react";
import { ShieldAlert, Activity } from "lucide-react";
import { CVE_BENCH_DATASET } from "./CveBenchData";

interface HudLayoutProps {
  /** 左列内容（Chat + VulnList） */
  left: React.ReactNode;
  /** 中列内容（KnowledgeGraph + CPG/PoC/Diff Tab + SystemLog） */
  center: React.ReactNode;
  /** 右列内容（Terminal + Context + RvpActions） */
  right: React.ReactNode;
  /** 当前选中的 CVE ID（用于底部状态栏显示） */
  selectedCveId: string;
  /** 当前 Agent 状态文本 */
  agentStatus?: string;
  /** 会话 ID */
  conversationId?: string;
  className?: string;
}

export default function HudLayout({
  left,
  center,
  right,
  selectedCveId,
  agentStatus = "活跃",
  conversationId,
  className = "",
}: HudLayoutProps) {
  const currentEntry = CVE_BENCH_DATASET.find((e) => e.id === selectedCveId);

  return (
    <div
      className={`flex flex-col flex-1 min-h-0 overflow-hidden ${className}`}
    >
      {/* 顶部状态栏 Header */}
      <div className="h-[36px] shrink-0 bg-[#1A202C] border-b border-[#00FF9F]/30 flex items-center px-4 gap-4 text-[11px]">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className="text-[#00FF9F]" />
          <span className="text-[#00FF9F] font-bold">SeCodeAct HUD v5.0</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">CVE Bench v2.0</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Activity size={12} className="text-[#00FF9F]" />
          <span className="text-slate-400">Agent: </span>
          <span className="text-[#00FF9F] font-bold">{agentStatus}</span>
        </div>
      </div>

      {/* 三列主工作区 */}
      <div className="flex flex-row gap-3 flex-1 min-h-[400px] p-3 overflow-hidden">
        {/* 左列 (25%) */}
        <div className="w-[25%] flex flex-col gap-3 min-h-0">{left}</div>
        {/* 中列 (50%) */}
        <div className="w-[50%] flex flex-col gap-0 overflow-hidden min-h-0">
          {center}
        </div>
        {/* 右列 (25%) */}
        <div className="w-[25%] flex flex-col gap-3 min-h-0">{right}</div>
      </div>

      {/* 底部状态栏 Footer */}
      <div className="h-[30px] shrink-0 bg-[#1A202C] border-t border-[#00FF9F]/20 flex items-center px-4 gap-6 text-[10px]">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="text-slate-500 whitespace-nowrap">
            CVE Bench v2.0:
          </span>
          <span className="text-[#00FF9F] font-bold whitespace-nowrap">
            {selectedCveId}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 truncate">
            {currentEntry?.description || "CVE 漏洞分析"}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-slate-500">
          <span>
            大模型: Security-LLM-V3{" "}
            <span className="text-[#00FF9F]">[活跃]</span>
          </span>
          <span>
            知识图谱: V2.4 <span className="text-[#00FF9F]">[已同步]</span>
          </span>
          <span>
            eBPF 探针: <span className="text-[#00FF9F]">运行中</span>
          </span>
          <span className="text-slate-600">系统状态: 正常</span>
          {conversationId && (
            <span className="text-slate-600">
              会话 ID: {conversationId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
