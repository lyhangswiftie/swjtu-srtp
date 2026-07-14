/**
 * TC-SCA-025 G8: 流水线单步骤卡片
 * 展示单个流水线步骤的详细信息（状态、耗时、命令、输出摘要）
 */
import React, { useState } from "react";
import type { PipelineStep, PipelineStepStatus } from "./PipelineStatusPanel";

interface PipelineStepCardProps {
  step: PipelineStep;
  index: number;
  expanded?: boolean;
  onToggle?: () => void;
}

const STATUS_STYLES: Record<PipelineStepStatus, { border: string; bg: string; text: string; icon: string }> = {
  PASS: { border: "border-green-700", bg: "bg-green-900/20", text: "text-green-400", icon: "✓" },
  WARN: { border: "border-yellow-700", bg: "bg-yellow-900/20", text: "text-yellow-400", icon: "⚠" },
  FAIL: { border: "border-red-700", bg: "bg-red-900/20", text: "text-red-400", icon: "✗" },
  SKIP: { border: "border-gray-700", bg: "bg-gray-900/20", text: "text-gray-500", icon: "⊘" },
  RUNNING: { border: "border-blue-700", bg: "bg-blue-900/20", text: "text-blue-400", icon: "◌" },
  BLOCKED: { border: "border-orange-700", bg: "bg-orange-900/20", text: "text-orange-400", icon: "⊗" },
  PENDING: { border: "border-gray-800", bg: "bg-gray-900/10", text: "text-gray-600", icon: "○" },
};

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

export const PipelineStepCard: React.FC<PipelineStepCardProps> = ({
  step,
  index,
  expanded = false,
  onToggle,
}) => {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const style = STATUS_STYLES[step.status] || STATUS_STYLES.PENDING;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    onToggle?.();
  };

  return (
    <div className={`border rounded text-xs ${style.border} ${style.bg}`}>
      {/* 步骤头部 */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-white/5"
        onClick={handleToggle}
      >
        <span className="text-gray-500 font-mono w-5 text-right">{index + 1}.</span>
        <span className={`font-mono w-4 text-center font-bold ${style.text}`}>{style.icon}</span>
        <span className="flex-1 text-gray-200 truncate">{step.name}</span>
        <span className="text-gray-500">{formatDuration(step.durationMs)}</span>
        <span className={`font-bold ${style.text}`}>{step.status}</span>
        <span className="text-gray-600 ml-1">{isExpanded ? "▲" : "▼"}</span>
      </div>

      {/* 展开详情 */}
      {isExpanded && (
        <div className="px-3 pb-2 border-t border-gray-800 space-y-1 pt-1">
          {step.summary && (
            <div className="flex gap-1">
              <span className="text-gray-500 w-14 shrink-0">摘要:</span>
              <span className="text-gray-300">{step.summary}</span>
            </div>
          )}
          {step.error && (
            <div className="flex gap-1">
              <span className="text-red-500 w-14 shrink-0">错误:</span>
              <span className="text-red-300 font-mono break-all">{step.error}</span>
            </div>
          )}
          <div className="flex gap-1">
            <span className="text-gray-500 w-14 shrink-0">步骤 ID:</span>
            <span className="text-gray-400 font-mono">{step.stepId}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineStepCard;
