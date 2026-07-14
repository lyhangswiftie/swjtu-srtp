/**
 * VulnListPanel.tsx
 *
 * SCA-HUD 漏洞列表面板子组件（TC-SCA-020 拆分）
 *
 * 职责：
 * - 渲染 CVE 漏洞列表表格
 * - 支持点击选择 CVE（触发联动）
 * - 显示修复进度统计
 */
import React from "react";
import type { VulnItem } from "./hooks/useVulnSelection";

interface VulnListPanelProps {
  vulnList: VulnItem[];
  selectedCveId: string;
  onVulnSelect: (cveId: string) => void;
  className?: string;
}

export default function VulnListPanel({
  vulnList,
  selectedCveId,
  onVulnSelect,
  className = "",
}: VulnListPanelProps) {
  const fixedCount = vulnList.filter((v) => v.status === "已修复").length;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* 面板标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#00FF9F]/30 shrink-0">
        <span className="text-[11px] font-bold text-slate-200">
          漏洞列表 (Vuln List)
        </span>
        <span className="text-[10px] text-slate-500">
          已修复 {fixedCount}/{vulnList.length}
        </span>
      </div>
      {/* 漏洞表格 */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar scrollbar-thin scrollbar-track-[#1A202C] scrollbar-thumb-[#00FF9F] hover:scrollbar-thumb-[#39FF14] scrollbar-rounded border border-[#00FF9F]/30 bg-[#0F172A]/80 rounded-lg m-1">
        <table className="w-full text-left text-[10px]">
          <thead className="text-[#00FF9F]/70 border-b border-[#00FF9F]/20 bg-[#00FF9F]/5 sticky top-0">
            <tr>
              <th className="p-1.5">漏洞编号</th>
              <th className="p-1.5">文件:行号</th>
              <th className="p-1.5">危险等级</th>
              <th className="p-1.5">状态</th>
            </tr>
          </thead>
          <tbody>
            {vulnList.map((vuln, idx) => (
              <tr
                key={idx}
                className={`cursor-pointer transition-colors ${
                  vuln.active || vuln.id === selectedCveId
                    ? "text-[#00FF9F] bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]"
                    : "text-slate-400 border-b border-slate-800 hover:bg-slate-800/50"
                }`}
                onClick={() => onVulnSelect(vuln.id)}
              >
                <td
                  className={`p-1.5 ${vuln.active || vuln.id === selectedCveId ? "font-bold" : ""}`}
                >
                  {vuln.id}
                </td>
                <td
                  className={
                    vuln.active || vuln.id === selectedCveId ? "font-bold" : ""
                  }
                >
                  {vuln.file}
                </td>
                <td
                  className={`${vuln.severityClass} ${vuln.active || vuln.id === selectedCveId ? "font-bold" : ""}`}
                >
                  {vuln.severity}
                </td>
                <td className="p-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded-sm border text-[9px] ${vuln.statusClass}`}
                  >
                    {vuln.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
