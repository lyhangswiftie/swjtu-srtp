/**
 * RvpActionsPanel.tsx
 *
 * SCA-HUD RVP 安全分析操作面板子组件（TC-SCA-020 拆分）
 *
 * 职责：
 * - 渲染 MVP 安全分析操作按钮组（PoC 生成、根因分析、修复建议、报告生成）
 * - 接收 selectedCveId / selectedFile / cpgFile 作为 props
 * - 接收 onSendCommand 回调触发 Agent 命令
 * TC-SCA-025 G9: 添加端到端 Pipeline 运行入口
 */
import React from "react";
import {
  TerminalSquare,
  AlertCircle,
  GitCommit,
  BarChart2,
  FileText,
  Download,
  Play,
} from "lucide-react";
import { CVE_BENCH_DATASET } from "./CveBenchData";

interface RvpActionsPanelProps {
  selectedCveId: string;
  selectedFile?: string | null;
  cpgFile?: string | null;
  onSendCommand: (command: string) => void;
  className?: string;
}

export default function RvpActionsPanel({
  selectedCveId,
  selectedFile,
  cpgFile,
  onSendCommand,
  className = "",
}: RvpActionsPanelProps) {
  const getTargetFile = () => {
    const entry = CVE_BENCH_DATASET.find((e) => e.id === selectedCveId);
    return entry?.targetFile || selectedFile || cpgFile || selectedCveId;
  };

  return (
    <div
      className={`h-full overflow-auto scrollbar scrollbar-thin scrollbar-track-[#1A202C] scrollbar-thumb-[#00FF9F] hover:scrollbar-thumb-[#39FF14] scrollbar-rounded border border-[#00FF9F]/30 bg-[#0F172A]/90 p-1.5 rounded-xl flex flex-col gap-1 text-[10px] ${className}`}
    >
      {/* 面板标题 */}
      <div className="text-[11px] font-bold text-slate-200 mb-0.5 px-1">
        MVP 安全分析操作
      </div>

      {/* 功能块1: 生成 POC 利用代码 */}
      <button
        onClick={() =>
          onSendCommand(`python3 /opt/scripts/gen_poc.py ${getTargetFile()}`)
        }
        className="w-full px-2 py-1 text-left rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
      >
        <TerminalSquare size={10} />
        <span>生成 POC 利用代码</span>
      </button>

      {/* 功能块2: 执行根因分析 */}
      <button
        onClick={() =>
          onSendCommand(
            `python3 /opt/scripts/root_cause_analysis.py ${getTargetFile()}`,
          )
        }
        className="w-full px-2 py-1 text-left rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors flex items-center gap-2"
      >
        <AlertCircle size={10} />
        <span>执行根因分析</span>
      </button>

      {/* 功能块3: 生成修复补丁 */}
      <button
        onClick={() =>
          onSendCommand(
            `python3 /opt/scripts/gen_fix_patch.py ${getTargetFile()} --cve ${selectedCveId}`,
          )
        }
        className="w-full px-2 py-1 text-left rounded border border-[#00FF9F]/40 text-[#00FF9F] hover:bg-[#00FF9F]/10 transition-colors flex items-center gap-2"
      >
        <GitCommit size={10} />
        <span>生成修复补丁</span>
      </button>

      {/* 分隔线 */}
      <div className="border-t border-[#00FF9F]/20 my-0.5" />

      {/* 功能块4: Neo4j 修复建议 */}
      <div className="rounded border border-purple-500/30 overflow-hidden">
        <div className="px-2 py-1 bg-purple-500/10 text-purple-400 flex items-center gap-1.5 font-semibold">
          <GitCommit size={10} />
          <span>Neo4j 修复建议</span>
        </div>
        <div className="p-1 flex flex-col gap-1">
          <button
            onClick={() =>
              onSendCommand(
                `python3 /opt/scripts/neo4j_fix_advisor.py --cve ${selectedCveId} --file ${getTargetFile()} --neo4j bolt://localhost:7687`,
              )
            }
            className="w-full px-2 py-1 text-left rounded border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-colors flex items-center gap-2"
          >
            <GitCommit size={10} />
            <span>查询 Sink/Taint 路径推荐修复</span>
          </button>
          <button
            onClick={() =>
              onSendCommand(
                `python3 /opt/scripts/neo4j_fix_advisor.py --mode cross-cve --neo4j bolt://localhost:7687 --output /tmp/cross-cve-fix-suggestions.json`,
              )
            }
            className="w-full px-2 py-1 text-left rounded border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-colors flex items-center gap-2"
          >
            <BarChart2 size={10} />
            <span>跨 CVE 关联修复分析</span>
          </button>
        </div>
      </div>

      {/* 分隔线 */}
      <div className="border-t border-[#00FF9F]/20 my-0.5" />

      {/* TC-SCA-025 G9: 端到端 Pipeline 运行入口 */}
      <div className="rounded border border-cyan-500/40 overflow-hidden">
        <div className="px-2 py-1 bg-cyan-500/10 text-cyan-400 flex items-center gap-1.5 font-semibold">
          <Play size={10} />
          <span>端到端 Pipeline (TC-SCA-025)</span>
        </div>
        <div className="p-1 flex flex-col gap-1">
          <button
            onClick={() =>
              onSendCommand(
                `python3 /opt/scripts/sca_pipeline.py --cve ${selectedCveId} --source ${getTargetFile()} --output-dir reports/${selectedCveId}`,
              )
            }
            className="w-full px-2 py-1 text-left rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 transition-colors flex items-center gap-2"
          >
            <Play size={10} />
            <span>▶ 一键运行完整流水线</span>
          </button>
          <button
            onClick={() =>
              onSendCommand(
                `python3 /opt/scripts/sca_pipeline.py --cve ${selectedCveId} --source ${getTargetFile()} --output-dir reports/${selectedCveId} --dry-run`,
              )
            }
            className="w-full px-2 py-1 text-left rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 transition-colors flex items-center gap-2"
          >
            <FileText size={10} />
            <span>▷ Dry-Run（仅规划）</span>
          </button>
        </div>
      </div>

      {/* 分隔线 */}
      <div className="border-t border-[#00FF9F]/20 my-0.5" />

      {/* 功能块5: 测试报告生成 */}
      <div className="rounded border border-blue-500/40 overflow-hidden">
        <div className="px-2 py-1 bg-blue-500/10 text-blue-400 flex items-center gap-1.5 font-semibold">
          <BarChart2 size={10} />
          <span>测试报告生成 (SCA-014)</span>
        </div>
        <div className="p-1 flex flex-col gap-1">
          <button
            onClick={() =>
              onSendCommand(
                `python3 /opt/scripts/gen_test_report.py --format markdown --version sca-014 --output /tmp/sca-014-test-report.md --cve-bench /workspace/cve-bench --include-poc-rate --include-fix-rate`,
              )
            }
            className="w-full px-2 py-1 text-left rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-2"
          >
            <FileText size={10} />
            <span>生成 SCA-014 全量对比报告 (MD)</span>
          </button>
          <button
            onClick={() =>
              onSendCommand(
                `python3 /opt/scripts/gen_test_report.py --format excel --version sca-014 --output /tmp/sca-014-test-report.xlsx --cve-bench /workspace/cve-bench --include-poc-rate --include-fix-rate`,
              )
            }
            className="w-full px-2 py-1 text-left rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-2"
          >
            <Download size={10} />
            <span>导出 SCA-014 量化指标 Excel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
