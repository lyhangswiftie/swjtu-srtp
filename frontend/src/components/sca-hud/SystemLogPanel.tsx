import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Trash2, Filter, Circle } from 'lucide-react';

/** 日志条目类型 */
export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'joern' | 'agent' | 'poc' | 'rca' | 'patch';

export interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

interface SystemLogPanelProps {
  logs: SystemLogEntry[];
  onClear?: () => void;
  className?: string;
  /** 是否默认展开 */
  defaultExpanded?: boolean;
}

/** 日志级别对应的颜色和标签 */
const LOG_LEVEL_CONFIG: Record<LogLevel, { color: string; bg: string; label: string; dot: string }> = {
  info:    { color: 'text-slate-300',   bg: 'bg-slate-800/50',   label: 'INFO',    dot: 'text-slate-400' },
  warn:    { color: 'text-amber-400',   bg: 'bg-amber-900/20',   label: 'WARN',    dot: 'text-amber-400' },
  error:   { color: 'text-red-400',     bg: 'bg-red-900/20',     label: 'ERROR',   dot: 'text-red-400' },
  success: { color: 'text-[#00FF9F]',   bg: 'bg-[#00FF9F]/5',    label: 'OK',      dot: 'text-[#00FF9F]' },
  joern:   { color: 'text-cyan-300',    bg: 'bg-cyan-900/20',    label: 'JOERN',   dot: 'text-cyan-400' },
  agent:   { color: 'text-violet-300',  bg: 'bg-violet-900/20',  label: 'AGENT',   dot: 'text-violet-400' },
  poc:     { color: 'text-red-300',     bg: 'bg-red-900/20',     label: 'POC',     dot: 'text-red-400' },
  rca:     { color: 'text-orange-300',  bg: 'bg-orange-900/20',  label: 'RCA',     dot: 'text-orange-400' },
  patch:   { color: 'text-emerald-300', bg: 'bg-emerald-900/20', label: 'PATCH',   dot: 'text-emerald-400' },
};

const ALL_LEVELS: LogLevel[] = ['info', 'warn', 'error', 'success', 'joern', 'agent', 'poc', 'rca', 'patch'];

/** 从 Agent 终端输出中推断日志级别和来源 */
export function inferLogEntry(raw: string, index: number): SystemLogEntry {
  const now = new Date();
  const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

  let level: LogLevel = 'info';
  let source = 'SYSTEM';

  const lower = raw.toLowerCase();
  if (lower.includes('joern') || lower.includes('cpg') || lower.includes('joern-parse') || lower.includes('joern-export')) {
    level = 'joern'; source = 'JOERN';
  } else if (lower.includes('sca_cpg_json') || lower.includes('[sca-006]') || lower.includes('[sca-009]')) {
    level = 'joern'; source = 'JOERN';
  } else if (lower.includes('poc') || lower.includes('exploit') || lower.includes('payload') || lower.includes('sigsegv')) {
    level = 'poc'; source = 'POC';
  } else if (lower.includes('root cause') || lower.includes('根因') || lower.includes('taint path') || lower.includes('[rca]')) {
    level = 'rca'; source = 'RCA';
  } else if (lower.includes('patch') || lower.includes('diff') || lower.includes('fix') || lower.includes('[patch]')) {
    level = 'patch'; source = 'PATCH';
  } else if (lower.includes('error') || lower.includes('exception') || lower.includes('failed') || lower.includes('fatal')) {
    level = 'error'; source = 'ERROR';
  } else if (lower.includes('warn') || lower.includes('warning')) {
    level = 'warn'; source = 'WARN';
  } else if (lower.includes('success') || lower.includes('completed') || lower.includes('done') || lower.includes('✓') || lower.includes('✅')) {
    level = 'success'; source = 'OK';
  } else if (lower.includes('agent') || lower.includes('[action]') || lower.includes('observation')) {
    level = 'agent'; source = 'AGENT';
  }

  return {
    id: `log-${Date.now()}-${index}`,
    timestamp,
    level,
    source,
    message: raw.trim(),
  };
}

const SystemLogPanel: React.FC<SystemLogPanelProps> = ({
  logs,
  onClear,
  className = '',
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeFilters, setActiveFilters] = useState<Set<LogLevel>>(new Set(ALL_LEVELS));
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, expanded]);

  // 点击外部关闭过滤菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFilter = useCallback((level: LogLevel) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        if (next.size > 1) next.delete(level); // 至少保留一个
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  const filteredLogs = logs.filter(log => activeFilters.has(log.level));

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 30;
    setAutoScroll(atBottom);
  };

  return (
    <div className={`border border-[#00FF9F]/30 bg-[#1A202C] flex flex-col overflow-hidden ${className}`}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0f172a] border-b border-[#00FF9F]/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#00FF9F] tracking-wide drop-shadow-[0_0_2px_rgba(0,255,159,0.8)]">
            [系统日志 SystemLog]
          </span>
          <span className="text-[9px] text-slate-500 font-mono">
            {filteredLogs.length}/{logs.length} 条
          </span>
          {/* 实时指示器 */}
          <span className="flex items-center gap-1 text-[9px] text-slate-500">
            <Circle size={5} className="text-[#00FF9F] fill-[#00FF9F] animate-pulse" />
            实时
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* 过滤按钮 */}
          <div className="relative" ref={filterMenuRef}>
            <button
              onClick={() => setShowFilterMenu(v => !v)}
              className="p-1 rounded text-slate-500 hover:text-[#00FF9F] hover:bg-[#00FF9F]/10 transition-colors"
              title="过滤日志类型"
            >
              <Filter size={10} />
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[#1A202C] border border-[#00FF9F]/30 rounded shadow-xl p-2 min-w-[120px]">
                {ALL_LEVELS.map(level => {
                  const cfg = LOG_LEVEL_CONFIG[level];
                  return (
                    <button
                      key={level}
                      onClick={() => toggleFilter(level)}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[9px] font-mono transition-colors ${
                        activeFilters.has(level) ? cfg.color + ' ' + cfg.bg : 'text-slate-600 hover:text-slate-400'
                      }`}
                    >
                      <Circle size={5} className={activeFilters.has(level) ? cfg.dot + ' fill-current' : 'text-slate-700 fill-current'} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* 清空按钮 */}
          {onClear && (
            <button
              onClick={onClear}
              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="清空日志"
            >
              <Trash2 size={10} />
            </button>
          )}
          {/* 折叠/展开 */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1 rounded text-slate-500 hover:text-[#00FF9F] hover:bg-[#00FF9F]/10 transition-colors"
            title={expanded ? '折叠' : '展开'}
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
          </button>
        </div>
      </div>

      {/* 日志内容区 */}
      {expanded && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto font-mono text-[9px] leading-relaxed"
          style={{ minHeight: 0 }}
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-600 text-[10px] py-4">
              暂无日志输出 — 等待系统事件...
            </div>
          ) : (
            filteredLogs.map(log => {
              const cfg = LOG_LEVEL_CONFIG[log.level];
              return (
                <div
                  key={log.id}
                  className={`flex items-start gap-2 px-3 py-0.5 border-b border-slate-800/50 hover:bg-slate-800/30 ${cfg.bg}`}
                >
                  {/* 时间戳 */}
                  <span className="text-slate-600 whitespace-nowrap shrink-0 mt-0.5">{log.timestamp}</span>
                  {/* 级别标签 */}
                  <span className={`font-bold whitespace-nowrap shrink-0 mt-0.5 w-[38px] text-center ${cfg.color}`}>
                    [{cfg.label}]
                  </span>
                  {/* 来源 */}
                  <span className="text-slate-500 whitespace-nowrap shrink-0 mt-0.5 w-[40px]">{log.source}</span>
                  {/* 消息内容 */}
                  <span className={`${cfg.color} break-all flex-1`}>{log.message}</span>
                </div>
              );
            })
          )}
          {/* 自动滚动指示器 */}
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }}
              className="sticky bottom-0 w-full py-1 text-[9px] text-center bg-[#00FF9F]/10 text-[#00FF9F] border-t border-[#00FF9F]/30 hover:bg-[#00FF9F]/20 transition-colors"
            >
              ↓ 滚动到最新日志
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemLogPanel;
