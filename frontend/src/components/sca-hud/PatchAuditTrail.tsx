/**
 * TC-SCA-024 G7: PatchAuditTrail
 * 展示补丁验证的完整审计迹迹（G1-G6 各阶段）
 */
import React, { useState } from "react";
import { PatchStatusBadge, PatchStageStatus } from "./PatchStatusBadge";

export interface PatchRunStage {
  name: string;
  gateLabel: string;
  status: PatchStageStatus;
  detail?: string;
  checks?: Record<string, string>;
  timestamp?: string;
}

export interface PatchRunReport {
  schema: string;
  cveId: string;
  generatedAt: string;
  overallStatus: string;
  stages: {
    G1_patch_gen?: { status: string; patchType?: string; riskLevel?: string; summary?: string; patchFile?: string };
    G2_guard?: { status: string; checks?: Record<string, string>; reasons?: string[] };
    G3_check?: { status: string; gitApplyCheck?: boolean };
    G4_apply?: { status: string; stage?: string; completedAt?: string };
    G5_regression?: {
      status: string;
      reason?: string;
      checks?: Record<string, { status: string; reason?: string }>;
      vulnEliminated?: string[];
      funcPreserved?: string[];
      fixPresent?: string[];
    };
  };
  summary?: {
    guardDecision?: string;
    applyStage?: string;
    regressionStatus?: string;
    overallStatus?: string;
  };
}

interface PatchAuditTrailProps {
  report: PatchRunReport | null;
  loading?: boolean;
  error?: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  G1_patch_gen: "G1 补丁生成",
  G2_guard: "G2 安全检查",
  G3_check: "G3 预检查",
  G4_apply: "G4 应用补丁",
  G5_regression: "G5 回归验证",
};

const StageRow: React.FC<{
  gateKey: string;
  stageData: Record<string, unknown>;
}> = ({ gateKey, stageData }) => {
  const [expanded, setExpanded] = useState(false);
  const label = STAGE_LABELS[gateKey] ?? gateKey;
  const rawStatus = (stageData.status as string) ?? "UNKNOWN";
  // 映射 stage 字段到 PatchStageStatus
  const status: PatchStageStatus = (() => {
    if (gateKey === "G4_apply") {
      const stage = stageData.stage as string;
      if (stage === "APPLIED") return "APPLIED";
      if (stage === "CHECK_PASSED") return "CHECK_PASSED";
      if (stage === "CHECK_FAILED") return "CHECK_FAILED";
      if (stage === "APPLY_FAILED") return "APPLY_FAILED";
    }
    if (gateKey === "G5_regression") {
      const s = stageData.status as string;
      if (s === "REGRESSION_PASS") return "REGRESSION_PASS";
      if (s === "REGRESSION_FAIL") return "REGRESSION_FAIL";
      if (s === "REGRESSION_WARN") return "REGRESSION_WARN";
    }
    return rawStatus as PatchStageStatus;
  })();

  const hasDetail = Object.keys(stageData).length > 2;

  return (
    <div className="border border-gray-700/40 rounded bg-gray-900/30 mb-1">
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-gray-800/30"
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-400 w-28">{label}</span>
          <PatchStatusBadge status={status} size="sm" />
        </div>
        {hasDetail && (
          <span className="text-gray-500 text-[10px]">{expanded ? "▲" : "▼"}</span>
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-2 border-t border-gray-700/30 mt-1">
          <pre className="text-[9px] font-mono text-gray-400 whitespace-pre-wrap break-all">
            {JSON.stringify(stageData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export const PatchAuditTrail: React.FC<PatchAuditTrailProps> = ({
  report,
  loading = false,
  error = null,
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-24 text-gray-500 text-xs font-mono">
        <span className="animate-pulse">⟳ 正在生成补丁报告...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-2 rounded border border-red-700/40 bg-red-900/20">
        <span className="text-red-400 text-[10px] font-mono">✗ {error}</span>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center h-16 text-gray-600 text-[10px] font-mono">
        暂无补丁报告
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {/* 报告头部 */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-gray-400">
          {report.cveId} · {report.generatedAt?.slice(0, 19).replace("T", " ")} UTC
        </span>
        <PatchStatusBadge
          status={report.overallStatus as PatchStageStatus}
          size="sm"
        />
      </div>

      {/* 各阶段 */}
      {Object.entries(report.stages ?? {}).map(([key, data]) => (
        <StageRow
          key={key}
          gateKey={key}
          stageData={data as Record<string, unknown>}
        />
      ))}
    </div>
  );
};

export default PatchAuditTrail;
