/**
 * PoCUtilTab.tsx — SCA-011 PoC 利用 Tab 组件
 *
 * 功能：
 *  - 展示当前选中漏洞的 PoC 利用代码（来自 CVE Bench v2.0 真实样本）
 *  - 支持"一键执行 PoC"按钮，执行后在 Tab 内显示验证结果
 *  - 验证结果包含：成功/失败状态、Terminal 输出日志、影响描述、Payload 信息
 *  - 与 Vuln List、CPG Tab、Diff Tab、元数据区域实时联动（通过 selectedCveId）
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  TerminalSquare, PlayCircle, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Code, Shield, Zap, Copy, ChevronDown, ChevronUp
} from 'lucide-react';
import type { CveBenchEntry } from './CveBenchData';

// ── 类型定义 ───────────────────────────────────────────────────────────────────

export interface PoCExecutionResult {
  success: boolean;
  output: string[];
  impact: string;
  payload: string;
  executedAt?: string;
}

export interface PoCUtilTabProps {
  /** 当前选中的 CVE 条目（来自 CVE Bench v2.0） */
  entry: CveBenchEntry | null;
  /** 执行 PoC 时的回调（发送到 Agent Terminal） */
  onExecutePoc?: (cveId: string, pocCode: string) => void;
  /** PoC 执行状态（由父组件控制） */
  pocRunning?: boolean;
  /** 外部传入的执行结果（来自 Agent 输出解析） */
  externalResult?: PoCExecutionResult | null;
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

/** 根据输出行内容确定颜色 */
function getOutputLineColor(line: string): string {
  if (line.startsWith('[+]')) return 'text-[#00FF9F]';
  if (line.startsWith('[!]')) return 'text-amber-400';
  if (line.startsWith('[*]')) return 'text-blue-400';
  if (line.startsWith('[-]') || line.startsWith('[ERROR]')) return 'text-red-400';
  if (line.includes('成功') || line.includes('Success')) return 'text-[#00FF9F]';
  if (line.includes('失败') || line.includes('Failed')) return 'text-red-400';
  if (line.includes('警告') || line.includes('Warning')) return 'text-amber-400';
  return 'text-slate-300';
}

// ── 主组件 ─────────────────────────────────────────────────────────────────────

const PoCUtilTab: React.FC<PoCUtilTabProps> = ({
  entry,
  onExecutePoc,
  pocRunning = false,
  externalResult = null,
}) => {
  // ── 本地状态 ────────────────────────────────────────────────────────────────
  const [localRunning, setLocalRunning] = useState(false);
  const [result, setResult] = useState<PoCExecutionResult | null>(null);
  const [showCode, setShowCode] = useState(true);
  const [showResult, setShowResult] = useState(true);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // 当 entry 变化时，重置本地状态
  useEffect(() => {
    setLocalRunning(false);
    setResult(null);
    setShowCode(true);
    setShowResult(true);
  }, [entry?.id]);

  // 当外部结果传入时，更新本地结果
  useEffect(() => {
    if (externalResult) {
      setResult(externalResult);
      setLocalRunning(false);
    }
  }, [externalResult]);

  // 自动滚动到输出底部
  useEffect(() => {
    if (outputRef.current && result) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [result]);

  // ── 事件处理 ────────────────────────────────────────────────────────────────

  /** 一键执行 PoC */
  const handleExecutePoc = () => {
    if (!entry?.pocCode) return;
    setLocalRunning(true);
    setResult(null);

    // 调用父组件回调（发送到 Agent Terminal）
    if (onExecutePoc) {
      onExecutePoc(entry.id, entry.pocCode);
    }

    // 模拟执行延迟（真实场景下由 Agent 输出触发）
    setTimeout(() => {
      if (entry.pocResult) {
        setResult({
          ...entry.pocResult,
          executedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        });
      } else {
        setResult({
          success: false,
          output: ['[*] PoC 执行完成', '[-] 未找到预期的验证结果'],
          impact: '无法确认漏洞影响',
          payload: entry.pocCode?.split('\n')[0] || '',
          executedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        });
      }
      setLocalRunning(false);
    }, 2500);
  };

  /** 复制 PoC 代码 */
  const handleCopyCode = () => {
    if (entry?.pocCode) {
      navigator.clipboard.writeText(entry.pocCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const isRunning = localRunning || pocRunning;

  // ── 空状态 ──────────────────────────────────────────────────────────────────
  if (!entry) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#0b1120] text-slate-500">
        <Shield size={32} className="opacity-30" />
        <span className="text-[11px]">请从漏洞列表选择一个 CVE 以查看 PoC 利用代码</span>
      </div>
    );
  }

  if (!entry.pocCode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#0b1120] text-slate-500">
        <Code size={32} className="opacity-30" />
        <span className="text-[11px]">当前 CVE 暂无 PoC 利用代码</span>
        <span className="text-[10px] text-slate-600">{entry.id}</span>
      </div>
    );
  }

  // ── 主渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-[#0b1120] overflow-hidden">
      {/* 顶部信息栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#00FF9F]/20 bg-[#0d1526] flex-shrink-0">
        <Zap size={11} className="text-red-400" />
        <span className="text-[9px] text-slate-500 font-mono">PoC 利用验证:</span>
        <span className="text-[9px] text-red-400 font-mono font-bold">{entry.id}</span>
        <span className="text-[9px] text-slate-400 truncate">{entry.type}</span>
        <span className="ml-auto text-[9px] text-slate-600 font-mono">CVSS {entry.cvss}</span>
        {/* 执行状态指示器 */}
        {result && (
          <span className={`flex items-center gap-1 text-[9px] font-bold ${result.success ? 'text-[#00FF9F]' : 'text-red-400'}`}>
            {result.success
              ? <><CheckCircle2 size={9} /> 利用成功</>
              : <><XCircle size={9} /> 利用失败</>
            }
          </span>
        )}
      </div>

      {/* 内容区（可滚动） */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-0">

        {/* PoC 代码区 */}
        <div className="border-b border-slate-800/50">
          {/* 代码区标题栏 */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 bg-[#0f172a] cursor-pointer hover:bg-[#111827] transition-colors"
            onClick={() => setShowCode(!showCode)}
          >
            <Code size={10} className="text-blue-400" />
            <span className="text-[10px] font-bold text-slate-300">PoC 利用代码</span>
            <span className="text-[9px] text-slate-600 font-mono ml-1">
              {entry.pocCode.split('\n').length} 行
            </span>
            <div className="ml-auto flex items-center gap-2">
              {/* 复制按钮 */}
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyCode(); }}
                className="flex items-center gap-1 px-2 py-0.5 text-[9px] text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded transition-colors"
              >
                <Copy size={8} />
                {copied ? '已复制' : '复制'}
              </button>
              {/* 一键执行 PoC 按钮 */}
              <button
                onClick={(e) => { e.stopPropagation(); handleExecutePoc(); }}
                disabled={isRunning}
                className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded border transition-colors ${
                  isRunning
                    ? 'bg-slate-700 text-slate-400 border-slate-600 cursor-not-allowed'
                    : 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30'
                }`}
              >
                {isRunning
                  ? <><Loader2 size={9} className="animate-spin" /> 执行中...</>
                  : <><PlayCircle size={9} /> 一键执行 PoC</>
                }
              </button>
              {showCode ? <ChevronUp size={10} className="text-slate-500" /> : <ChevronDown size={10} className="text-slate-500" />}
            </div>
          </div>

          {/* 代码内容 */}
          {showCode && (
            <div className="relative">
              <pre className="p-3 text-[9px] font-mono text-slate-300 bg-[#080f1e] overflow-x-auto leading-relaxed max-h-[180px] overflow-y-auto">
                {entry.pocCode.split('\n').map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-slate-700 select-none w-6 text-right shrink-0">{i + 1}</span>
                    <span className={
                      line.startsWith('#') ? 'text-slate-500' :
                      line.includes('print(') ? 'text-[#00FF9F]' :
                      line.includes('requests.') || line.includes('import ') ? 'text-blue-400' :
                      line.includes('payload') || line.includes('PAYLOAD') ? 'text-red-400' :
                      'text-slate-300'
                    }>{line}</span>
                  </div>
                ))}
              </pre>
            </div>
          )}
        </div>

        {/* 执行结果区 */}
        {(result || isRunning) && (
          <div className="border-b border-slate-800/50">
            {/* 结果区标题栏 */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 bg-[#0f172a] cursor-pointer hover:bg-[#111827] transition-colors"
              onClick={() => setShowResult(!showResult)}
            >
              <TerminalSquare size={10} className={result?.success ? 'text-[#00FF9F]' : isRunning ? 'text-amber-400' : 'text-red-400'} />
              <span className="text-[10px] font-bold text-slate-300">验证结果</span>
              {result?.executedAt && (
                <span className="text-[9px] text-slate-600 font-mono">@ {result.executedAt}</span>
              )}
              {isRunning && (
                <span className="flex items-center gap-1 text-[9px] text-amber-400">
                  <Loader2 size={9} className="animate-spin" /> 正在执行...
                </span>
              )}
              {result && (
                <span className={`flex items-center gap-1 text-[9px] font-bold ml-auto ${result.success ? 'text-[#00FF9F]' : 'text-red-400'}`}>
                  {result.success ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                  {result.success ? '利用成功' : '利用失败'}
                </span>
              )}
              {showResult ? <ChevronUp size={10} className="text-slate-500 ml-auto" /> : <ChevronDown size={10} className="text-slate-500 ml-auto" />}
            </div>

            {showResult && (
              <div className="bg-[#060d1a]">
                {/* Terminal 输出 */}
                <div
                  ref={outputRef}
                  className="p-3 font-mono text-[9px] max-h-[140px] overflow-y-auto"
                >
                  {isRunning && !result ? (
                    <div className="flex items-center gap-2 text-amber-400">
                      <Loader2 size={10} className="animate-spin" />
                      <span>正在执行 PoC 利用代码...</span>
                    </div>
                  ) : result?.output.map((line, i) => (
                    <div key={i} className={`leading-relaxed ${getOutputLineColor(line)}`}>
                      {line}
                    </div>
                  ))}
                </div>

                {/* 影响描述 + Payload */}
                {result && (
                  <div className="border-t border-slate-800 px-3 py-2 flex flex-col gap-1.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={9} className="text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-[9px] text-slate-500 font-bold">影响描述: </span>
                        <span className="text-[9px] text-amber-300">{result.impact}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Code size={9} className="text-red-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-[9px] text-slate-500 font-bold">Payload: </span>
                        <code className="text-[9px] text-red-300 font-mono bg-red-500/10 px-1 rounded">{result.payload}</code>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 未执行时的提示区 */}
        {!result && !isRunning && (
          <div className="flex flex-col items-center justify-center gap-3 py-6 text-slate-600">
            <PlayCircle size={24} className="opacity-30" />
            <span className="text-[10px]">点击"一键执行 PoC"按钮开始验证漏洞</span>
            <div className="flex flex-col gap-1 text-[9px] text-slate-700 text-center">
              <span>目标文件: {entry.targetFile?.split('/').pop() || 'N/A'}</span>
              <span>漏洞类型: {entry.type}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PoCUtilTab;
