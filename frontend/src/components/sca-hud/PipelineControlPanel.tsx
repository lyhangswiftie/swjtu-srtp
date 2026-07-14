/**
 * TC-SCA-025 G9: 流水线控制面板
 * 提供 Run / Dry-Run 按钮 + CVE ID 输入 + 配置选项
 */
import React, { useState } from "react";

interface PipelineControlPanelProps {
  defaultCveId?: string;
  isRunning?: boolean;
  onRunPipeline?: (cveId: string, dryRun: boolean) => void;
  lastStatus?: string;
  lastRunId?: string;
}

export const PipelineControlPanel: React.FC<PipelineControlPanelProps> = ({
  defaultCveId = "CVE-2024-22120",
  isRunning = false,
  onRunPipeline,
  lastStatus,
  lastRunId,
}) => {
  const [cveId, setCveId] = useState(defaultCveId);
  const [dryRun, setDryRun] = useState(false);

  const handleRun = () => {
    if (!cveId.trim()) return;
    onRunPipeline?.(cveId.trim(), dryRun);
  };

  const statusColor =
    lastStatus === "PIPELINE_PASS"
      ? "text-green-400"
      : lastStatus === "PIPELINE_WARN"
      ? "text-yellow-400"
      : lastStatus === "PIPELINE_FAILED"
      ? "text-red-400"
      : "text-gray-400";

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 h-full flex flex-col">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Pipeline Control</span>
        {lastStatus && (
          <span className={`text-xs font-bold ${statusColor}`}>{lastStatus}</span>
        )}
      </div>

      {/* CVE ID 输入 */}
      <div className="mb-2">
        <label className="text-xs text-gray-500 mb-1 block">CVE ID</label>
        <input
          type="text"
          value={cveId}
          onChange={(e) => setCveId(e.target.value)}
          placeholder="CVE-YYYY-XXXXX"
          disabled={isRunning}
          className="w-full px-2 py-1 text-xs font-mono bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600 disabled:opacity-50"
        />
      </div>

      {/* 选项 */}
      <div className="mb-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            disabled={isRunning}
            className="accent-blue-500"
          />
          <span className="text-xs text-gray-400">Dry-Run（仅规划，不执行）</span>
        </label>
      </div>

      {/* 运行按钮 */}
      <button
        onClick={handleRun}
        disabled={isRunning || !cveId.trim()}
        className={`w-full py-1.5 text-xs font-bold rounded border transition-colors ${
          isRunning
            ? "bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed"
            : dryRun
            ? "bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200"
            : "bg-blue-700 hover:bg-blue-600 border-blue-600 text-white"
        }`}
      >
        {isRunning ? "⏳ Running..." : dryRun ? "▷ Dry-Run" : "▶ Run Pipeline"}
      </button>

      {/* 最近运行信息 */}
      {lastRunId && (
        <div className="mt-2 text-xs text-gray-600 font-mono truncate">
          Last: {lastRunId}
        </div>
      )}

      {/* 说明 */}
      <div className="mt-auto pt-2 border-t border-gray-800 text-xs text-gray-600">
        <div>端到端流水线：CPG → PoC → Patch → Regression → Report</div>
        <div className="mt-0.5">脚本：scripts/sca_pipeline.py</div>
      </div>
    </div>
  );
};

export default PipelineControlPanel;
