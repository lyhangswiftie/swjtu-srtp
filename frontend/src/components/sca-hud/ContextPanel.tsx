/**
 * ContextPanel.tsx
 *
 * SCA-HUD 漏洞上下文/元数据面板子组件（TC-SCA-020 拆分）
 *
 * 职责：
 * - 渲染当前选中 CVE 的元数据（CVE 编号、类型、CVSS、目标文件）
 * - 从 CVE_BENCH_DATASET 中查找对应条目
 */
import React from "react";
import { CVE_BENCH_DATASET } from "./CveBenchData";

interface ContextPanelProps {
  selectedCveId: string;
  className?: string;
}

export default function ContextPanel({
  selectedCveId,
  className = "",
}: ContextPanelProps) {
  const currentEntry = CVE_BENCH_DATASET.find((e) => e.id === selectedCveId);

  return (
    <div className={`p-2 flex flex-col gap-1.5 text-[10px] ${className}`}>
      <div className="text-[11px] font-bold text-slate-200 mb-1 border-b border-[#00FF9F]/20 pb-1">
        元数据与上下文
      </div>
      {currentEntry ? (
        <>
          <div className="flex justify-between">
            <span className="text-slate-500">CVE 编号:</span>
            <span className="text-red-400 font-bold">{currentEntry.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">类型/应用:</span>
            <span className="text-amber-400 truncate">
              {currentEntry.type} · {currentEntry.app}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">CVSS:</span>
            <span className="text-red-400 font-bold">{currentEntry.cvss}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">目标文件:</span>
            <span
              className="text-[#00FF9F] truncate"
              title={currentEntry.targetFile}
            >
              {(currentEntry.targetFile || "").split("/").pop()}
            </span>
          </div>
          {currentEntry.cwe && (
            <div className="flex justify-between">
              <span className="text-slate-500">CWE:</span>
              <span className="text-purple-400">{currentEntry.cwe}</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex justify-between">
          <span className="text-slate-500">CVE 编号:</span>
          <span className="text-red-400 font-bold">{selectedCveId}</span>
        </div>
      )}
    </div>
  );
}
