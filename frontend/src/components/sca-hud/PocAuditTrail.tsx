/**
 * PocAuditTrail.tsx - PoC 执行审计迹迹展示组件（TC-SCA-023 G4）
 *
 * 展示 PoC 执行的完整审计日志，包括：
 *   - 执行时间戳
 *   - CVE ID
 *   - 执行状态（PASS/FAIL/BLOCKED/ERROR/TIMEOUT）
 *   - 闸门决策（ALLOW/WARN/BLOCKED）
 *   - 执行耗时
 *   - stdout 摘要
 *   - 拦截原因（BLOCKED 时）
 */

import React, { useState } from "react";
import { PocStatusBadge, PocStatus } from "./PocStatusBadge";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface AuditEntry {
  ts: string;
  cve_id: string;
  status: PocStatus;
  exit_code: number | null;
  duration_ms: number;
  gate_decision: string;
  gate_reason: string;
  stdout_digest: string;
  stderr_digest: string;
  error_msg: string;
}

export interface PocAuditTrailProps {
  /** 审计日志条目列表（最新在前） */
  entries: AuditEntry[];
  /** 最大显示条目数（默认 20） */
  maxEntries?: number;
  /** 是否显示过滤器 */
  showFilter?: boolean;
  /** 组件标题 */
  title?: string;
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

const formatTs = (ts: string): string => {
  try {
    const d = new Date(ts);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts.slice(0, 19).replace("T", " ");
  }
};

const formatDuration = (ms: number): string => {
  if (!ms || ms === 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const getGateBadgeClass = (decision: string): string => {
  if (decision === "ALLOW") return "bg-green-900 text-green-300 border-green-700";
  if (decision === "WARN") return "bg-yellow-900 text-yellow-300 border-yellow-700";
  if (decision === "BLOCKED") return "bg-red-900 text-red-300 border-red-700";
  return "bg-gray-800 text-gray-400 border-gray-600";
};

// ---------------------------------------------------------------------------
// 单条审计记录组件
// ---------------------------------------------------------------------------

const AuditEntryRow: React.FC<{ entry: AuditEntry; expanded: boolean; onToggle: () => void }> = ({
  entry,
  expanded,
  onToggle,
}) => {
  return (
    <div className="border border-gray-700 rounded mb-1 overflow-hidden">
      {/* 主行 */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-gray-800 cursor-pointer hover:bg-gray-750 transition-colors"
        onClick={onToggle}
      >
        {/* 时间戳 */}
        <span className="text-xs text-gray-500 font-mono w-28 shrink-0">
          {formatTs(entry.ts)}
        </span>

        {/* 状态徽章 */}
        <PocStatusBadge
          status={entry.status}
          durationMs={entry.duration_ms}
          showDetail
        />

        {/* CVE ID */}
        <span className="text-xs font-mono text-cyan-400 truncate flex-1">
          {entry.cve_id}
        </span>

        {/* 闸门决策 */}
        <span
          className={`text-xs font-mono px-1 py-0.5 rounded border ${getGateBadgeClass(entry.gate_decision)}`}
        >
          {entry.gate_decision || "-"}
        </span>

        {/* 耗时 */}
        <span className="text-xs text-gray-500 font-mono w-12 text-right shrink-0">
          {formatDuration(entry.duration_ms)}
        </span>

        {/* 展开箭头 */}
        <span className="text-gray-500 text-xs ml-1">
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="px-3 py-2 bg-gray-850 border-t border-gray-700 space-y-1.5">
          {/* 闸门原因 */}
          {entry.gate_reason && (
            <div className="text-xs font-mono">
              <span className="text-gray-500">闸门原因: </span>
              <span className="text-gray-300">{entry.gate_reason}</span>
            </div>
          )}

          {/* 退出码 */}
          {entry.exit_code !== null && (
            <div className="text-xs font-mono">
              <span className="text-gray-500">退出码: </span>
              <span className={entry.exit_code === 0 ? "text-green-400" : "text-red-400"}>
                {entry.exit_code}
              </span>
            </div>
          )}

          {/* stdout 摘要 */}
          {entry.stdout_digest && (
            <div className="text-xs font-mono">
              <div className="text-gray-500 mb-0.5">stdout:</div>
              <pre className="text-gray-300 bg-gray-900 p-1.5 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {entry.stdout_digest}
              </pre>
            </div>
          )}

          {/* stderr 摘要 */}
          {entry.stderr_digest && (
            <div className="text-xs font-mono">
              <div className="text-gray-500 mb-0.5">stderr:</div>
              <pre className="text-red-400 bg-gray-900 p-1.5 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {entry.stderr_digest}
              </pre>
            </div>
          )}

          {/* 错误信息 */}
          {entry.error_msg && (
            <div className="text-xs font-mono">
              <span className="text-gray-500">错误: </span>
              <span className="text-red-400">{entry.error_msg}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export const PocAuditTrail: React.FC<PocAuditTrailProps> = ({
  entries,
  maxEntries = 20,
  showFilter = true,
  title = "PoC 执行审计迹迹",
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // 过滤
  const filtered = entries
    .filter((e) => filterStatus === "ALL" || e.status === filterStatus)
    .slice(0, maxEntries);

  // 统计
  const stats = {
    total: entries.length,
    pass: entries.filter((e) => e.status === "PASS").length,
    blocked: entries.filter((e) => e.status === "BLOCKED").length,
    fail: entries.filter((e) => e.status === "FAIL").length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-700 bg-gray-800 shrink-0">
        <span className="text-xs font-mono text-gray-300 uppercase tracking-wider">
          {title}
        </span>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-green-400">{stats.pass}✓</span>
          <span className="text-red-400">{stats.blocked}⛔</span>
          <span className="text-orange-400">{stats.fail}✗</span>
          <span className="text-gray-500">/{stats.total}</span>
        </div>
      </div>

      {/* 过滤器 */}
      {showFilter && (
        <div className="flex gap-1 px-2 py-1 border-b border-gray-700 bg-gray-850 shrink-0">
          {["ALL", "PASS", "FAIL", "BLOCKED", "ERROR", "TIMEOUT"].map((s) => (
            <button
              key={s}
              className={`text-xs font-mono px-1.5 py-0.5 rounded transition-colors ${
                filterStatus === s
                  ? "bg-blue-700 text-blue-100"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              onClick={() => setFilterStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 审计条目列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="text-xs text-gray-500 font-mono text-center py-4">
            暂无审计记录
          </div>
        ) : (
          filtered.map((entry, idx) => (
            <AuditEntryRow
              key={`${entry.ts}-${entry.cve_id}-${idx}`}
              entry={entry}
              expanded={expandedIndex === idx}
              onToggle={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default PocAuditTrail;
