/**
 * TC-SCA-024 G7: PatchStatusBadge
 * 展示补丁验证各阶段的状态徽章
 */
import React from "react";

export type PatchOverallStatus =
  | "PATCH_VERIFIED"
  | "BLOCKED"
  | "APPLY_FAILED"
  | "REGRESSION_FAIL"
  | "APPLIED_NO_REGRESSION"
  | "GUARD_PASSED"
  | "PENDING"
  | "RUNNING"
  | "UNKNOWN";

export type PatchStageStatus =
  | "PASS"
  | "FAIL"
  | "SKIP"
  | "WARN"
  | "APPLIED"
  | "CHECK_PASSED"
  | "CHECK_FAILED"
  | "APPLY_FAILED"
  | "REGRESSION_PASS"
  | "REGRESSION_FAIL"
  | "REGRESSION_WARN"
  | "BLOCKED"
  | "UNKNOWN";

interface PatchStatusBadgeProps {
  status: PatchOverallStatus | PatchStageStatus;
  label?: string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; border: string; icon: string; label: string }
> = {
  PATCH_VERIFIED: {
    bg: "bg-green-900/40",
    text: "text-green-300",
    border: "border-green-600/50",
    icon: "✅",
    label: "PATCH VERIFIED",
  },
  PASS: {
    bg: "bg-green-900/30",
    text: "text-green-400",
    border: "border-green-700/40",
    icon: "✓",
    label: "PASS",
  },
  APPLIED: {
    bg: "bg-blue-900/30",
    text: "text-blue-300",
    border: "border-blue-700/40",
    icon: "⚡",
    label: "APPLIED",
  },
  CHECK_PASSED: {
    bg: "bg-cyan-900/30",
    text: "text-cyan-300",
    border: "border-cyan-700/40",
    icon: "✓",
    label: "CHECK PASSED",
  },
  REGRESSION_PASS: {
    bg: "bg-emerald-900/30",
    text: "text-emerald-300",
    border: "border-emerald-700/40",
    icon: "✅",
    label: "REGRESSION PASS",
  },
  REGRESSION_WARN: {
    bg: "bg-yellow-900/30",
    text: "text-yellow-300",
    border: "border-yellow-700/40",
    icon: "⚠",
    label: "REGRESSION WARN",
  },
  WARN: {
    bg: "bg-yellow-900/30",
    text: "text-yellow-300",
    border: "border-yellow-700/40",
    icon: "⚠",
    label: "WARN",
  },
  APPLIED_NO_REGRESSION: {
    bg: "bg-yellow-900/40",
    text: "text-yellow-300",
    border: "border-yellow-600/50",
    icon: "⚠",
    label: "APPLIED (NO REGRESSION)",
  },
  BLOCKED: {
    bg: "bg-orange-900/40",
    text: "text-orange-300",
    border: "border-orange-600/50",
    icon: "🚫",
    label: "BLOCKED",
  },
  FAIL: {
    bg: "bg-red-900/30",
    text: "text-red-400",
    border: "border-red-700/40",
    icon: "✗",
    label: "FAIL",
  },
  APPLY_FAILED: {
    bg: "bg-red-900/40",
    text: "text-red-300",
    border: "border-red-600/50",
    icon: "✗",
    label: "APPLY FAILED",
  },
  CHECK_FAILED: {
    bg: "bg-red-900/30",
    text: "text-red-400",
    border: "border-red-700/40",
    icon: "✗",
    label: "CHECK FAILED",
  },
  REGRESSION_FAIL: {
    bg: "bg-red-900/40",
    text: "text-red-300",
    border: "border-red-600/50",
    icon: "❌",
    label: "REGRESSION FAIL",
  },
  SKIP: {
    bg: "bg-gray-800/30",
    text: "text-gray-400",
    border: "border-gray-700/40",
    icon: "⏭",
    label: "SKIP",
  },
  PENDING: {
    bg: "bg-gray-800/40",
    text: "text-gray-300",
    border: "border-gray-600/50",
    icon: "○",
    label: "PENDING",
  },
  RUNNING: {
    bg: "bg-blue-900/40",
    text: "text-blue-300",
    border: "border-blue-600/50",
    icon: "⟳",
    label: "RUNNING",
  },
  UNKNOWN: {
    bg: "bg-gray-800/30",
    text: "text-gray-500",
    border: "border-gray-700/30",
    icon: "?",
    label: "UNKNOWN",
  },
};

const SIZE_CLASSES = {
  sm: "text-[9px] px-1.5 py-0.5",
  md: "text-[10px] px-2 py-0.5",
  lg: "text-xs px-2.5 py-1",
};

export const PatchStatusBadge: React.FC<PatchStatusBadgeProps> = ({
  status,
  label,
  size = "md",
  showIcon = true,
}) => {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.UNKNOWN;
  const displayLabel = label ?? config.label;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border font-mono font-semibold tracking-wide ${config.bg} ${config.text} ${config.border} ${sizeClass}`}
    >
      {showIcon && <span className="leading-none">{config.icon}</span>}
      <span>{displayLabel}</span>
    </span>
  );
};

export default PatchStatusBadge;
