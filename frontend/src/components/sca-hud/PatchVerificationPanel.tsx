/**
 * TC-SCA-024 G7: PatchVerificationPanel
 * 补丁验证主面板，整合 PatchStatusBadge + PatchAuditTrail
 * 展示完整的补丁生成→安全检查→应用→回归验证闭环
 */
import React, { useState, useCallback } from "react";
import { PatchStatusBadge } from "./PatchStatusBadge";
import { PatchAuditTrail, PatchRunReport } from "./PatchAuditTrail";

// 内嵌 TC-SCA-024 真实 patch_run.json 数据（用于演示）
const DEMO_PATCH_RUN: PatchRunReport = {
  schema: "SCA_PATCH_RUN_V1",
  cveId: "CVE-2024-22120",
  generatedAt: "2026-05-07T14:09:35Z",
  overallStatus: "PATCH_VERIFIED",
  stages: {
    G1_patch_gen: {
      status: "PASS",
      patchType: "sql_injection_escape_fix",
      riskLevel: "medium",
      summary: "Replace unsafe clientip interpolation with escaped value_esc in audit log SQL.",
      patchFile: "reports/TC-SCA-024/patch.diff",
    },
    G2_guard: {
      status: "PASS",
      checks: {
        target_whitelist: "PASS",
        sensitive_path: "PASS",
        deleted_lines_limit: "PASS",
        added_lines_limit: "PASS",
        dangerous_patterns: "PASS",
      },
      reasons: [],
    },
    G3_check: {
      status: "PASS",
      gitApplyCheck: true,
    },
    G4_apply: {
      status: "PASS",
      stage: "APPLIED",
      completedAt: "2026-05-07T14:04:38Z",
    },
    G5_regression: {
      status: "REGRESSION_PASS",
      reason: "所有回归检查通过",
      checks: {
        static_pattern: { status: "PASS", reason: "漏洞特征已消除，功能特征完整" },
        compile: { status: "SKIP", reason: "gcc 不可用" },
      },
      vulnEliminated: [
        "clientip taint sink pattern",
        "VALUES('%s') clientip pattern",
        "/* VULNERABLE comment",
      ],
      funcPreserved: [
        "zbx_db_execute()",
        "zbx_db_dyn_escape_string()",
        "void zbx_audit_log_clientip()",
      ],
      fixPresent: [
        "FIXED (CVE-2024-22120) comment",
        "value_esc usage",
      ],
    },
  },
  summary: {
    guardDecision: "PASS",
    applyStage: "APPLIED",
    regressionStatus: "REGRESSION_PASS",
    overallStatus: "PATCH_VERIFIED",
  },
};

interface PatchVerificationPanelProps {
  cveId?: string;
  patchRunReport?: PatchRunReport | null;
  onRunPatchVerification?: (cveId: string) => Promise<PatchRunReport>;
  className?: string;
}

export const PatchVerificationPanel: React.FC<PatchVerificationPanelProps> = ({
  cveId = "CVE-2024-22120",
  patchRunReport,
  onRunPatchVerification,
  className = "",
}) => {
  const [report, setReport] = useState<PatchRunReport | null>(
    patchRunReport ?? DEMO_PATCH_RUN
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "audit">("summary");

  const handleRunVerification = useCallback(async () => {
    if (!onRunPatchVerification) {
      // Demo 模式：模拟运行
      setLoading(true);
      setError(null);
      await new Promise((r) => setTimeout(r, 1200));
      setReport(DEMO_PATCH_RUN);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await onRunPatchVerification(cveId);
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "补丁验证失败");
    } finally {
      setLoading(false);
    }
  }, [cveId, onRunPatchVerification]);

  const overallStatus = report?.overallStatus ?? "PENDING";

  return (
    <div className={`flex flex-col bg-gray-900/50 border border-gray-700/50 rounded ${className}`}>
      {/* 面板标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/40">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-300 font-semibold tracking-wide">
            PATCH VERIFICATION
          </span>
          <span className="text-[9px] font-mono text-gray-500">{cveId}</span>
        </div>
        <div className="flex items-center gap-2">
          <PatchStatusBadge
            status={overallStatus as Parameters<typeof PatchStatusBadge>[0]["status"]}
            size="sm"
          />
          <button
            onClick={handleRunVerification}
            disabled={loading}
            className="text-[9px] font-mono px-2 py-0.5 rounded border border-blue-700/50 text-blue-400 hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "⟳ 运行中..." : "▶ 运行验证"}
          </button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-700/30">
        {(["summary", "audit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 text-[9px] font-mono transition-colors ${
              activeTab === tab
                ? "text-blue-300 border-b border-blue-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "summary" ? "摘要" : "审计迹迹"}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === "summary" && report && (
          <div className="space-y-1.5">
            {/* 快速摘要表格 */}
            <div className="grid grid-cols-2 gap-1">
              {[
                { label: "G1 补丁生成", status: report.stages?.G1_patch_gen?.status ?? "UNKNOWN" },
                { label: "G2 安全检查", status: report.stages?.G2_guard?.status ?? "UNKNOWN" },
                { label: "G3 预检查", status: report.stages?.G3_check?.status ?? "UNKNOWN" },
                { label: "G4 应用补丁", status: report.stages?.G4_apply?.stage ?? report.stages?.G4_apply?.status ?? "UNKNOWN" },
                { label: "G5 回归验证", status: report.stages?.G5_regression?.status ?? "UNKNOWN" },
              ].map(({ label, status }) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-2 py-1 rounded bg-gray-800/40 border border-gray-700/30"
                >
                  <span className="text-[9px] font-mono text-gray-400">{label}</span>
                  <PatchStatusBadge
                    status={status as Parameters<typeof PatchStatusBadge>[0]["status"]}
                    size="sm"
                    showIcon={false}
                  />
                </div>
              ))}
            </div>

            {/* 回归验证详情 */}
            {report.stages?.G5_regression && (
              <div className="mt-2 p-2 rounded border border-gray-700/30 bg-gray-800/20">
                <div className="text-[9px] font-mono text-gray-400 mb-1">回归验证详情</div>
                {report.stages.G5_regression.vulnEliminated && (
                  <div className="mb-1">
                    <span className="text-[8px] text-green-500 font-mono">漏洞特征消除 ({report.stages.G5_regression.vulnEliminated.length})：</span>
                    {report.stages.G5_regression.vulnEliminated.map((p, i) => (
                      <div key={i} className="text-[8px] font-mono text-gray-500 pl-2">✓ {p}</div>
                    ))}
                  </div>
                )}
                {report.stages.G5_regression.funcPreserved && (
                  <div className="mb-1">
                    <span className="text-[8px] text-blue-400 font-mono">功能特征保留 ({report.stages.G5_regression.funcPreserved.length})：</span>
                    {report.stages.G5_regression.funcPreserved.map((p, i) => (
                      <div key={i} className="text-[8px] font-mono text-gray-500 pl-2">✓ {p}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "audit" && (
          <PatchAuditTrail report={report} loading={loading} error={error} />
        )}
      </div>
    </div>
  );
};

export default PatchVerificationPanel;
