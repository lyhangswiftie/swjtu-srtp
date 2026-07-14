/**
 * RepositoryImportPanel.tsx
 *
 * TC-SCA-REPO-SANDBOX-USABILITY-004 — Commit 2/3
 *
 * 仓库导入状态机面板：
 *
 * 状态机（RepositoryImportState）：
 *   IDLE → VALIDATING → CLONING → INDEXING → READY
 *                ↘ FAILED（任意阶段均可跳转）
 *
 * 组件职责：
 * - 展示当前导入阶段和进度
 * - 展示错误信息（含 GitServiceErrorCode 分类说明）
 * - 提供"重试"按钮（FAILED 状态）
 * - 提供"取消"按钮（CLONING/INDEXING 状态）
 * - 沙箱状态联动：READY 后显示"沙箱就绪"标识
 */

import React from "react";
import {
  GitBranch,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  X,
  Database,
  Search,
} from "lucide-react";
import { GitServiceErrorCode, GIT_ERROR_MESSAGES } from "#/api/git-service/git-service-errors";

// ── 状态机类型定义 ─────────────────────────────────────────────────────────────

/**
 * 仓库导入状态枚举
 *
 * 状态转换图：
 *   IDLE → VALIDATING → CLONING → INDEXING → READY
 *                ↘ FAILED（任意阶段均可跳转）
 *   FAILED → IDLE（用户点击"重试"后重置）
 */
export enum RepositoryImportState {
  /** 初始状态：未开始导入 */
  IDLE = "IDLE",
  /** 校验阶段：检查仓库 URL 格式、Token 有效性 */
  VALIDATING = "VALIDATING",
  /** 克隆阶段：Agent 正在执行 git clone */
  CLONING = "CLONING",
  /** 索引阶段：Joern 正在构建 CPG 图谱 */
  INDEXING = "INDEXING",
  /** 就绪状态：仓库已克隆并索引完成 */
  READY = "READY",
  /** 失败状态：任意阶段出现不可恢复错误 */
  FAILED = "FAILED",
}

/** 各阶段的人类可读标签 */
export const IMPORT_STATE_LABELS: Record<RepositoryImportState, string> = {
  [RepositoryImportState.IDLE]: "等待导入",
  [RepositoryImportState.VALIDATING]: "校验仓库",
  [RepositoryImportState.CLONING]: "克隆中",
  [RepositoryImportState.INDEXING]: "索引构建中",
  [RepositoryImportState.READY]: "就绪",
  [RepositoryImportState.FAILED]: "导入失败",
};

/** 仓库导入上下文数据 */
export interface RepositoryImportContext {
  /** 当前状态 */
  state: RepositoryImportState;
  /** 目标仓库 URL */
  repoUrl: string;
  /** 目标分支 */
  branch: string;
  /** 错误分类码（FAILED 状态时有效） */
  errorCode?: GitServiceErrorCode;
  /** 错误详情（FAILED 状态时有效） */
  errorMessage?: string;
  /** 克隆进度（0-100，CLONING 阶段） */
  cloneProgress?: number;
  /** 索引进度（0-100，INDEXING 阶段） */
  indexProgress?: number;
  /** 就绪时间戳（READY 状态时有效） */
  readyAt?: string;
}

// ── 进度步骤配置 ───────────────────────────────────────────────────────────────

interface ImportStep {
  state: RepositoryImportState;
  label: string;
  icon: React.ElementType;
}

const IMPORT_STEPS: ImportStep[] = [
  { state: RepositoryImportState.VALIDATING, label: "校验", icon: Search },
  { state: RepositoryImportState.CLONING, label: "克隆", icon: GitBranch },
  { state: RepositoryImportState.INDEXING, label: "索引", icon: Database },
  { state: RepositoryImportState.READY, label: "就绪", icon: CheckCircle2 },
];

/** 判断某阶段是否已完成（当前状态在其之后） */
function isStepCompleted(
  step: RepositoryImportState,
  current: RepositoryImportState,
): boolean {
  const order = [
    RepositoryImportState.IDLE,
    RepositoryImportState.VALIDATING,
    RepositoryImportState.CLONING,
    RepositoryImportState.INDEXING,
    RepositoryImportState.READY,
  ];
  const stepIdx = order.indexOf(step);
  const currentIdx = order.indexOf(current);
  return currentIdx > stepIdx;
}

/** 判断某阶段是否为当前活跃阶段 */
function isStepActive(
  step: RepositoryImportState,
  current: RepositoryImportState,
): boolean {
  return step === current;
}

// ── 组件 Props ─────────────────────────────────────────────────────────────────

export interface RepositoryImportPanelProps {
  context: RepositoryImportContext;
  onRetry?: () => void;
  onCancel?: () => void;
  /** 是否显示沙箱就绪联动标识（READY 状态时） */
  sandboxReady?: boolean;
}

// ── 主组件 ─────────────────────────────────────────────────────────────────────

/**
 * RepositoryImportPanel
 *
 * 展示仓库导入的实时状态、进度条和错误信息。
 * 由 DashboardConnected 的 Repository 侧边栏调用，
 * 通过 context 属性接收当前导入状态。
 */
export function RepositoryImportPanel({
  context,
  onRetry,
  onCancel,
  sandboxReady = false,
}: RepositoryImportPanelProps) {
  const { state, repoUrl, branch, errorCode, errorMessage, cloneProgress, indexProgress, readyAt } = context;

  const isFailed = state === RepositoryImportState.FAILED;
  const isReady = state === RepositoryImportState.READY;
  const isIdle = state === RepositoryImportState.IDLE;
  const isInProgress =
    state === RepositoryImportState.CLONING ||
    state === RepositoryImportState.INDEXING;

  // 从 GitServiceErrorCode 获取用户友好说明
  const errorHint =
    errorCode && GIT_ERROR_MESSAGES[errorCode]
      ? GIT_ERROR_MESSAGES[errorCode]
      : errorMessage ?? "未知错误";

  if (isIdle) return null;

  return (
    <div className="border border-[#00FF9F]/20 bg-[#0b1120] rounded-sm text-[11px] font-mono">
      {/* 头部：仓库信息 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#00FF9F]/10 bg-[#1A202C]">
        <div className="flex items-center gap-2 text-slate-300 truncate">
          <GitBranch size={12} className="text-[#00FF9F] shrink-0" />
          <span className="truncate">{repoUrl}</span>
          <span className="text-slate-500">@</span>
          <span className="text-blue-400 shrink-0">{branch}</span>
        </div>
        {isInProgress && onCancel && (
          <button
            onClick={onCancel}
            className="ml-2 text-slate-500 hover:text-amber-400 transition-colors shrink-0"
            title="重置状态（仅重置前端导入状态，不会终止已在沙箱中运行的命令）"
            aria-label="重置导入状态"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* 进度步骤条 */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#00FF9F]/10">
        {IMPORT_STEPS.map((step, idx) => {
          const completed = isStepCompleted(step.state, state) || (isReady && step.state === RepositoryImportState.READY);
          const active = isStepActive(step.state, state) && !isFailed;
          const StepIcon = step.icon;

          return (
            <React.Fragment key={step.state}>
              <div className="flex items-center gap-1">
                <div
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm transition-colors
                    ${completed ? "text-[#00FF9F] bg-[#00FF9F]/10" : ""}
                    ${active ? "text-amber-400 bg-amber-400/10" : ""}
                    ${!completed && !active ? "text-slate-600" : ""}
                  `}
                >
                  {active ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : completed ? (
                    <CheckCircle2 size={10} />
                  ) : (
                    <StepIcon size={10} />
                  )}
                  <span>{step.label}</span>
                </div>
              </div>
              {idx < IMPORT_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px ${completed ? "bg-[#00FF9F]/30" : "bg-slate-700"}`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* 进度条（CLONING / INDEXING 阶段） */}
      {state === RepositoryImportState.CLONING && cloneProgress !== undefined && (
        <div className="px-3 py-2 border-b border-[#00FF9F]/10">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span>git clone 进度</span>
            <span>{cloneProgress}%</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00FF9F]/60 transition-all duration-300"
              style={{ width: `${cloneProgress}%` }}
            />
          </div>
        </div>
      )}

      {state === RepositoryImportState.INDEXING && indexProgress !== undefined && (
        <div className="px-3 py-2 border-b border-[#00FF9F]/10">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span>Joern CPG 索引进度</span>
            <span>{indexProgress}%</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400/60 transition-all duration-300"
              style={{ width: `${indexProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 就绪状态 */}
      {isReady && (
        <div className="px-3 py-2 flex items-center gap-2 text-[#00FF9F]">
          <CheckCircle2 size={12} className="shrink-0" />
          <span>
            仓库已就绪
            {sandboxReady && " · 沙箱已就绪"}
            {readyAt && (
              <span className="text-slate-500 ml-1">（{readyAt}）</span>
            )}
          </span>
        </div>
      )}

      {/* 失败状态 */}
      {isFailed && (
        <div className="px-3 py-2">
          <div className="flex items-start gap-2 text-red-400 mb-2">
            <XCircle size={12} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-bold mb-0.5">
                导入失败
                {errorCode && (
                  <span className="ml-1 text-slate-500 font-normal">
                    [{errorCode}]
                  </span>
                )}
              </div>
              <div className="text-slate-400 text-[10px] leading-relaxed">
                {errorHint}
              </div>
            </div>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-2 py-1 bg-[#00FF9F]/10 text-[#00FF9F] border border-[#00FF9F]/30 rounded-sm hover:bg-[#00FF9F]/20 transition-colors"
            >
              <RefreshCw size={10} />
              重试导入
            </button>
          )}
        </div>
      )}

      {/* VALIDATING 状态 */}
      {state === RepositoryImportState.VALIDATING && (
        <div className="px-3 py-2 flex items-center gap-2 text-amber-400">
          <Loader2 size={10} className="animate-spin shrink-0" />
          <span>正在校验仓库 URL 和 Token 权限…</span>
        </div>
      )}
    </div>
  );
}

export default RepositoryImportPanel;
