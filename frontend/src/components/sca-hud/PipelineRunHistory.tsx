/**
 * TC-SCA-025 G8: 流水线历史运行记录列表
 * 展示多次流水线运行的状态/时间/CVE/耗时等摘要信息
 */
import React from "react";
import type { PipelineRun } from "./PipelineStatusPanel";

interface PipelineRunHistoryProps {
  runs?: PipelineRun[];
  onSelectRun?: (run: PipelineRun) => void;
  selectedRunId?: string;
}

const OVERALL_STATUS_STYLE: Record<string, { color: string; label: string }> = {
  PIPELINE_PASS: { color: "text-green-400", label: "PASS" },
  PIPELINE_WARN: { color: "text-yellow-400", label: "WARN" },
  PIPELINE_FAILED: { color: "text-red-400", label: "FAIL" },
  RUNNING: { color: "text-blue-400", label: "RUN" },
};

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatTime(iso?: string): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(0, 16);
  }
}

// 默认历史数据（TC-SCA-025 真实执行结果）
const DEFAULT_RUNS: PipelineRun[] = [
  {
    runId: "sca-20260507-143912",
    pipelineId: "TC-SCA-025",
    cveId: "CVE-2024-22120",
    overallStatus: "PIPELINE_WARN",
    durationMs: 4431,
    startedAt: "2026-05-07T06:39:12Z",
    endedAt: "2026-05-07T06:39:16Z",
    steps: [],
  },
];

export const PipelineRunHistory: React.FC<PipelineRunHistoryProps> = ({
  runs = DEFAULT_RUNS,
  onSelectRun,
  selectedRunId,
}) => {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 h-full flex flex-col">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Run History</span>
        <span className="text-xs text-gray-500">{runs.length} 条记录</span>
      </div>

      {/* 历史列表 */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {runs.length === 0 ? (
          <div className="text-xs text-gray-600 text-center py-4">暂无历史记录</div>
        ) : (
          runs.map((run) => {
            const statusStyle = OVERALL_STATUS_STYLE[run.overallStatus] || { color: "text-gray-400", label: run.overallStatus };
            const isSelected = run.runId === selectedRunId;
            const passCount = run.steps.filter(s => s.status === "PASS").length;
            const warnCount = run.steps.filter(s => s.status === "WARN").length;
            const failCount = run.steps.filter(s => s.status === "FAIL").length;

            return (
              <div
                key={run.runId}
                onClick={() => onSelectRun?.(run)}
                className={`px-2 py-1.5 rounded border text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? "border-blue-600 bg-blue-900/20"
                    : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-mono text-cyan-400">{run.cveId}</span>
                  <span className={`font-bold ${statusStyle.color}`}>{statusStyle.label}</span>
                </div>
                <div className="flex items-center justify-between text-gray-500">
                  <span>{formatTime(run.startedAt)}</span>
                  <div className="flex gap-1.5">
                    {run.steps.length > 0 && (
                      <>
                        <span className="text-green-500">{passCount}P</span>
                        <span className="text-yellow-500">{warnCount}W</span>
                        <span className="text-red-500">{failCount}F</span>
                      </>
                    )}
                    <span>{formatDuration(run.durationMs)}</span>
                  </div>
                </div>
                <div className="text-gray-600 mt-0.5 font-mono text-xs truncate">
                  {run.runId}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PipelineRunHistory;
