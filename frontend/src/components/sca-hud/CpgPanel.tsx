/**
 * CpgPanel.tsx
 *
 * SCA-HUD CPG 图谱面板子组件（TC-SCA-020 拆分）
 *
 * 职责：
 * - 渲染 CPG 图谱（CpgGraph 组件）
 * - 支持 joernError 错误态 Banner（继承自 TC-SCA-019）
 * - 支持 CPG 加载状态
 * - 支持节点高亮联动（highlightNodeId）
 */
import React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import CpgGraph, { type CpgGraphData } from "./CpgGraph";
import HudErrorBoundary from "./HudErrorBoundary";

interface CpgPanelProps {
  cpgData: CpgGraphData | null;
  cpgLoading: boolean;
  joernError: string | null;
  highlightNodeId?: string | null;
  selectedCveId: string;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
}

export default function CpgPanel({
  cpgData,
  cpgLoading,
  joernError,
  highlightNodeId,
  selectedCveId,
  onNodeClick,
  className = "",
}: CpgPanelProps) {
  return (
    <div className={`flex flex-col h-full relative ${className}`}>
      {/* Joern 错误态 Banner（TC-SCA-019 G6 验收项） */}
      {joernError && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/40 border-b border-red-500/50 text-red-400 text-[10px] shrink-0">
          <AlertCircle size={12} className="shrink-0" />
          <span className="font-bold">⚠ JOERN ERROR</span>
          <span className="text-red-300/70 truncate">{joernError}</span>
        </div>
      )}

      {/* CPG 加载状态 */}
      {cpgLoading && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/20 border-b border-amber-500/30 text-amber-400 text-[10px] shrink-0">
          <Loader2 size={12} className="animate-spin shrink-0" />
          <span>正在运行 Joern CPG 分析...</span>
        </div>
      )}

      {/* CPG 图谱主体 */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <HudErrorBoundary panelName="CPG 代码属性图">
          <CpgGraph
            data={cpgData}
            highlightNodeId={highlightNodeId ?? undefined}
            selectedCveId={selectedCveId}
            joernError={joernError ?? undefined}
            onNodeClick={onNodeClick}
          />
        </HudErrorBoundary>
      </div>
    </div>
  );
}
