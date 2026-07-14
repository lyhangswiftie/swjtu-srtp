/**
 * TC-SCA-025 G8: 流水线状态总览面板
 * 展示端到端流水线各阶段状态（CPG → PoC → Patch → Regression → Report）
 */
import React from "react";

export type PipelineStepStatus = "PASS" | "WARN" | "FAIL" | "SKIP" | "RUNNING" | "BLOCKED" | "PENDING";

export interface PipelineStep {
  stepId: string;
  name: string;
  status: PipelineStepStatus;
  durationMs?: number;
  summary?: string;
  error?: string;
}

export interface PipelineRun {
  runId: string;
  pipelineId: string;
  cveId: string;
  overallStatus: string;
  durationMs?: number;
  startedAt?: string;
  endedAt?: string;
  steps: PipelineStep[];
}

interface PipelineStatusPanelProps {
  run?: PipelineRun;
  isRunning?: boolean;
  onRunPipeline?: () => void;
  onDryRun?: () => void;
}

const STATUS_CONFIG: Record<PipelineStepStatus, { color: string; icon: string; label: string }> = {
  PASS: { color: "text-green-400 bg-green-900/30 border-green-700", icon: "✓", label: "PASS" },
  WARN: { color: "text-yellow-400 bg-yellow-900/30 border-yellow-700", icon: "⚠", label: "WARN" },
  FAIL: { color: "text-red-400 bg-red-900/30 border-red-700", icon: "✗", label: "FAIL" },
  SKIP: { color: "text-gray-400 bg-gray-900/30 border-gray-700", icon: "⊘", label: "SKIP" },
  RUNNING: { color: "text-blue-400 bg-blue-900/30 border-blue-700", icon: "◌", label: "RUNNING" },
  BLOCKED: { color: "text-orange-400 bg-orange-900/30 border-orange-700", icon: "⊗", label: "BLOCKED" },
  PENDING: { color: "text-gray-500 bg-gray-900/20 border-gray-800", icon: "○", label: "PENDING" },
};

const OVERALL_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  PIPELINE_PASS: { color: "text-green-400", label: "PIPELINE PASS" },
  PIPELINE_WARN: { color: "text-yellow-400", label: "PIPELINE WARN" },
  PIPELINE_FAILED: { color: "text-red-400", label: "PIPELINE FAILED" },
  RUNNING: { color: "text-blue-400", label: "RUNNING..." },
};

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// 默认流水线运行数据（TC-SCA-025 真实执行结果）
const DEFAULT_PIPELINE_RUN: PipelineRun = {
  runId: "sca-20260507-143912",
  pipelineId: "TC-SCA-025",
  cveId: "CVE-2024-22120",
  overallStatus: "PIPELINE_WARN",
  durationMs: 4431,
  startedAt: "2026-05-07T06:39:12Z",
  endedAt: "2026-05-07T06:39:16Z",
  steps: [
    { stepId: "cve_consistency", name: "CVE 数据一致性检查", status: "PASS", durationMs: 312 },
    { stepId: "cpg_analysis", name: "Joern CPG 分析", status: "WARN", durationMs: 1823, summary: "无 Docker，降级本地模式" },
    { stepId: "poc_gate", name: "PoC 安全闸门", status: "WARN", durationMs: 156, summary: "无 Docker，WARN 降级" },
    { stepId: "patch_generate", name: "Patch 生成", status: "PASS", durationMs: 234 },
    { stepId: "patch_guard", name: "Patch 安全检查", status: "PASS", durationMs: 89 },
    { stepId: "patch_apply_check", name: "Patch 预检查", status: "PASS", durationMs: 178 },
    { stepId: "patch_apply", name: "Patch 临时工作区应用", status: "PASS", durationMs: 201 },
    { stepId: "regression", name: "回归验证", status: "PASS", durationMs: 267 },
    { stepId: "patch_report", name: "修复报告生成", status: "PASS", durationMs: 145 },
  ],
};

export const PipelineStatusPanel: React.FC<PipelineStatusPanelProps> = ({
  run = DEFAULT_PIPELINE_RUN,
  isRunning = false,
  onRunPipeline,
  onDryRun,
}) => {
  const overallConfig = OVERALL_STATUS_CONFIG[run.overallStatus] || { color: "text-gray-400", label: run.overallStatus };
  const passCount = run.steps.filter(s => s.status === "PASS").length;
  const warnCount = run.steps.filter(s => s.status === "WARN").length;
  const failCount = run.steps.filter(s => s.status === "FAIL").length;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Pipeline</span>
          <span className="text-xs text-gray-500">{run.pipelineId}</span>
        </div>
        <div className="flex gap-1">
          {onDryRun && (
            <button
              onClick={onDryRun}
              disabled={isRunning}
              className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 disabled:opacity-50"
            >
              Dry-Run
            </button>
          )}
          {onRunPipeline && (
            <button
              onClick={onRunPipeline}
              disabled={isRunning}
              className="px-2 py-0.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded border border-blue-600 disabled:opacity-50"
            >
              {isRunning ? "Running..." : "Run"}
            </button>
          )}
        </div>
      </div>

      {/* 总体状态 */}
      <div className="flex items-center justify-between mb-2 px-2 py-1.5 bg-gray-800 rounded border border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">CVE:</span>
          <span className="text-xs font-mono text-cyan-400">{run.cveId}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${overallConfig.color}`}>{overallConfig.label}</span>
          <span className="text-xs text-gray-500">{formatDuration(run.durationMs)}</span>
        </div>
      </div>

      {/* 步骤计数 */}
      <div className="flex gap-2 mb-2 text-xs">
        <span className="text-green-400">{passCount}P</span>
        <span className="text-gray-600">/</span>
        <span className="text-yellow-400">{warnCount}W</span>
        <span className="text-gray-600">/</span>
        <span className="text-red-400">{failCount}F</span>
        <span className="text-gray-600 ml-auto">Run: {run.runId.slice(-8)}</span>
      </div>

      {/* 步骤列表 */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {run.steps.map((step, idx) => {
          const cfg = STATUS_CONFIG[step.status] || STATUS_CONFIG.PENDING;
          return (
            <div
              key={step.stepId}
              className={`flex items-center gap-2 px-2 py-1 rounded border text-xs ${cfg.color}`}
            >
              <span className="w-4 text-center font-mono">{idx + 1}</span>
              <span className="font-mono text-xs w-4 text-center">{cfg.icon}</span>
              <span className="flex-1 truncate">{step.name}</span>
              <span className="text-xs opacity-70">{formatDuration(step.durationMs)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PipelineStatusPanel;
