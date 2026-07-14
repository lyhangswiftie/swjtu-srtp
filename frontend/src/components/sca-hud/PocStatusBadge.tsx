/**
 * PocStatusBadge.tsx - PoC 执行状态徽章组件（TC-SCA-023 G4）
 *
 * 展示 PoC 执行的当前状态：
 *   PENDING   → 灰色（等待执行）
 *   RUNNING   → 蓝色动画（执行中）
 *   PASS      → 绿色（执行成功，漏洞已验证）
 *   FAIL      → 橙色（执行失败，漏洞未触发）
 *   TIMEOUT   → 黄色（执行超时）
 *   BLOCKED   → 红色（被安全闸门拦截）
 *   ERROR     → 红色（执行环境错误）
 */

import React from "react";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type PocStatus =
  | "PENDING"
  | "RUNNING"
  | "PASS"
  | "FAIL"
  | "TIMEOUT"
  | "BLOCKED"
  | "ERROR";

export interface PocStatusBadgeProps {
  /** PoC 执行状态 */
  status: PocStatus;
  /** CVE ID（可选，显示在徽章旁） */
  cveId?: string;
  /** 执行耗时（毫秒，可选） */
  durationMs?: number;
  /** 闸门决策（ALLOW/WARN/BLOCKED，可选） */
  gateDecision?: string;
  /** 点击回调（可选） */
  onClick?: () => void;
  /** 是否显示详细信息 */
  showDetail?: boolean;
}

// ---------------------------------------------------------------------------
// 状态配置
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  PocStatus,
  {
    label: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
    icon: string;
    animate?: boolean;
  }
> = {
  PENDING: {
    label: "待执行",
    bgColor: "bg-gray-700",
    textColor: "text-gray-300",
    borderColor: "border-gray-500",
    icon: "○",
  },
  RUNNING: {
    label: "执行中",
    bgColor: "bg-blue-900",
    textColor: "text-blue-300",
    borderColor: "border-blue-500",
    icon: "◌",
    animate: true,
  },
  PASS: {
    label: "已验证",
    bgColor: "bg-green-900",
    textColor: "text-green-300",
    borderColor: "border-green-500",
    icon: "✓",
  },
  FAIL: {
    label: "未触发",
    bgColor: "bg-orange-900",
    textColor: "text-orange-300",
    borderColor: "border-orange-500",
    icon: "✗",
  },
  TIMEOUT: {
    label: "已超时",
    bgColor: "bg-yellow-900",
    textColor: "text-yellow-300",
    borderColor: "border-yellow-500",
    icon: "⏱",
  },
  BLOCKED: {
    label: "已拦截",
    bgColor: "bg-red-900",
    textColor: "text-red-300",
    borderColor: "border-red-500",
    icon: "⛔",
  },
  ERROR: {
    label: "执行错误",
    bgColor: "bg-red-900",
    textColor: "text-red-300",
    borderColor: "border-red-500",
    icon: "!",
  },
};

// ---------------------------------------------------------------------------
// 组件实现
// ---------------------------------------------------------------------------

export const PocStatusBadge: React.FC<PocStatusBadgeProps> = ({
  status,
  cveId,
  durationMs,
  gateDecision,
  onClick,
  showDetail = false,
}) => {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getGateColor = (decision?: string): string => {
    if (!decision) return "text-gray-400";
    if (decision === "ALLOW") return "text-green-400";
    if (decision === "WARN") return "text-yellow-400";
    if (decision === "BLOCKED") return "text-red-400";
    return "text-gray-400";
  };

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded border
        font-mono text-xs select-none
        ${config.bgColor} ${config.textColor} ${config.borderColor}
        ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
        ${config.animate ? "animate-pulse" : ""}
      `}
      onClick={onClick}
      title={`PoC 状态: ${status}${cveId ? ` (${cveId})` : ""}`}
    >
      {/* 状态图标 */}
      <span className="text-sm leading-none">{config.icon}</span>

      {/* 状态标签 */}
      <span className="font-semibold">{config.label}</span>

      {/* CVE ID */}
      {cveId && (
        <span className="opacity-70 text-xs">{cveId}</span>
      )}

      {/* 详细信息 */}
      {showDetail && (
        <>
          {durationMs !== undefined && durationMs > 0 && (
            <span className="opacity-60 text-xs">
              {formatDuration(durationMs)}
            </span>
          )}
          {gateDecision && (
            <span className={`text-xs ${getGateColor(gateDecision)}`}>
              [{gateDecision}]
            </span>
          )}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PoC 状态面板（展示多个 CVE 的执行状态）
// ---------------------------------------------------------------------------

export interface PocStatusEntry {
  cveId: string;
  status: PocStatus;
  durationMs?: number;
  gateDecision?: string;
  gateReason?: string;
  timestamp?: string;
}

export interface PocStatusPanelProps {
  entries: PocStatusEntry[];
  onRunPoc?: (cveId: string) => void;
  title?: string;
}

export const PocStatusPanel: React.FC<PocStatusPanelProps> = ({
  entries,
  onRunPoc,
  title = "PoC 执行状态",
}) => {
  if (entries.length === 0) {
    return (
      <div className="p-3 text-gray-500 text-xs font-mono">
        暂无 PoC 执行记录
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 p-2">
      {title && (
        <div className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1">
          {title}
        </div>
      )}
      {entries.map((entry) => (
        <div
          key={entry.cveId}
          className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-gray-800 border border-gray-700"
        >
          <PocStatusBadge
            status={entry.status}
            cveId={entry.cveId}
            durationMs={entry.durationMs}
            gateDecision={entry.gateDecision}
            showDetail
          />
          {onRunPoc && entry.status === "PENDING" && (
            <button
              className="text-xs text-blue-400 hover:text-blue-300 font-mono transition-colors"
              onClick={() => onRunPoc(entry.cveId)}
            >
              ▶ 执行
            </button>
          )}
          {entry.timestamp && (
            <span className="text-xs text-gray-500 font-mono ml-auto">
              {entry.timestamp.slice(11, 19)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default PocStatusBadge;
