import React, { useState, useEffect, useRef } from 'react';
import { Send, Terminal, Code, Play, CheckCircle, XCircle, Paperclip } from 'lucide-react';

//1. Chat Component: Now accepts messages and an onSendMessage callback
// This makes it compatible with an OpenHands backend where messages come from a WebSocket stream.
export function OpenHandsChat({ messages, onSendMessage }) {
 const [input, setInput] = useState('');
 const [isSending, setIsSending] = useState(false);
 const messagesEndRef = useRef(null);

 const scrollToBottom = () => {
 messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
 };

 useEffect(() => {
 scrollToBottom();
 }, [messages]);

 const handleSend = async () => {
 const text = input.trim();
 if (!text || isSending) return;

 console.log('[SCA-Chat] handleSend triggered:', text);
 setIsSending(true);
 try {
 await onSendMessage(text);
 console.log('[SCA-Chat] onSendMessage completed');
 setInput('');
 } catch (error) {
 console.error('[SCA-Chat] onSendMessage failed:', error);
 } finally {
 setIsSending(false);
 }
 };

 return (
 <div className="flex flex-col h-full bg-[#0b1120] text-[11px] font-mono">
 <div className="flex-1 overflow-y-auto p-3 space-y-3">
 {messages.map((msg, idx) => (
 <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
 <span className="text-[9px] text-slate-500 mb-0.5">{msg.role === 'user' ? '安全专家 (User)' : '智能体 (Agent)'}</span>
 <div className={`p-2 rounded-sm max-w-[90%] ${msg.role === 'user' ? 'bg-blue-900/30 border border-blue-500/30 text-blue-100' : 'bg-[#00FF9F]/10 border border-[#00FF9F]/30 text-[#00FF9F]'}`}>
 {msg.text}
 </div>
 </div>
 ))}
 <div ref={messagesEndRef} />
 </div>
 <div className="p-2 border-t border-[#00FF9F]/20 bg-[#1A202C] flex gap-2">
 <button className="bg-slate-800 text-slate-400 p-1.5 rounded-sm hover:bg-slate-700 hover:text-slate-200 border border-slate-700 transition-colors" title="添加附件">
 <Paperclip size={14} />
 </button>
 <input
 type="text"
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter') {
 e.preventDefault();
 handleSend();
 }
 }}
 placeholder={isSending ? '正在发送...' : '输入安全指令...'}
 disabled={isSending}
 className="flex-1 bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1 text-slate-300 focus:outline-none focus:border-[#00FF9F]/50 disabled:opacity-60"
 />
 <button onClick={handleSend} disabled={isSending || !input.trim()} className="bg-[#00FF9F]/20 text-[#00FF9F] p-1.5 rounded-sm hover:bg-[#00FF9F]/30 border border-[#00FF9F]/50 transition-colors disabled:opacity-40" title="发送指令">
 <Send size={14} />
 </button>
 </div>
 </div>
 );
}

//2. Terminal Component: Now accepts a logs array
// This maps to the OpenHands sandbox execution stream (stdout/stderr).
export function OpenHandsTerminal({ logs }) {
 const terminalEndRef = useRef(null);

 useEffect(() => {
 terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
 }, [logs]);

 return (
 <div className="flex flex-col h-full bg-[#000000] text-[#00FF9F]/80 font-mono text-[10px] p-2 overflow-y-auto leading-relaxed">
 <div className="flex items-center gap-2 mb-2 pb-1 border-b border-slate-800 text-slate-500 sticky top-0 bg-[#000000]">
 <Terminal size={12} />
 <span>agent-sandbox-tty1</span>
 </div>
 {logs.map((log, idx) => {
 // Simple heuristic to colorize logs based on content
 let colorClass = "text-slate-400";
 if (log.includes("SIGSEGV") || log.includes("Error") || log.includes("Exception")) colorClass = "text-amber-400";
 else if (log.includes("成功") || log.includes("通过") || log.includes("Success")) colorClass = "text-[#00FF9F] font-bold";
 else if (log.startsWith("$")) colorClass = "text-blue-400";

 return <p key={idx} className={colorClass}>{log}</p>;
 })}
 <p className="text-slate-400 mt-2">$ <span className="animate-pulse">_</span></p>
 <div ref={terminalEndRef} />
 </div>
 );
}

//3. Diff Viewer Component: Now accepts file name and code blocks
// This ensures consistency with the currently selected vulnerability.
export function OpenHandsDiffViewer({ file, originalCode, modifiedCode }) {
 return (
 <div className="flex flex-col h-full bg-[#0b1120] font-mono text-[11px]">
 <div className="flex items-center justify-between bg-[#1A202C] px-3 py-1.5 border-b border-[#00FF9F]/20">
 <div className="flex items-center gap-2 text-slate-300">
 <Code size={14} className="text-blue-400" />
 <span>{file}</span>
 </div>
 <div className="flex items-center gap-2">
 <button className="flex items-center gap-1 bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-sm border border-blue-500/30 hover:bg-blue-500/30 transition-colors">
 <Play size={10} />运行测试
 </button>
 <button className="flex items-center gap-1 bg-[#00FF9F]/20 text-[#00FF9F] px-2 py-0.5 rounded-sm border border-[#00FF9F]/30 hover:bg-[#00FF9F]/30 transition-colors">
 <CheckCircle size={10} /> 应用补丁
 </button>
 </div>
 </div>

 <div className="flex-1 overflow-y-auto">
 <div className="grid grid-cols-2 gap-0 min-h-full">
 {/* Original Code */}
 <div className="border-r border-slate-800">
 <div className="bg-red-900/20 text-red-400 px-2 py-1 border-b border-red-900/30 text-[10px] flex items-center gap-1 sticky top-0">
 <XCircle size={10} /> 存在漏洞的代码 (Original)
 </div>
 <div className="p-2 text-slate-400 leading-loose">
 {originalCode.map((line, idx) => (
 <div key={idx} className={`flex ${line.isHighlight ? 'bg-red-900/30 border-l-2 border-red-500' : ''}`}>
 <span className="w-8 text-slate-600 select-none text-right pr-2">{line.line}</span>
 <span className={line.isHighlight ? 'text-red-400' : ''}>{line.text}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Modified Code */}
 <div>
 <div className="bg-[#00FF9F]/10 text-[#00FF9F] px-2 py-1 border-b border-[#00FF9F]/20 text-[10px] flex items-center gap-1 sticky top-0">
 <CheckCircle size={10} /> 修复后的代码 (Modified)
 </div>
 <div className="p-2 text-slate-300 leading-loose">
 {modifiedCode.map((line, idx) => (
 <div key={idx} className={`flex ${line.isHighlight ? 'bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]' : ''}`}>
 <span className="w-8 text-slate-600 select-none text-right pr-2">{line.line}</span>
 <span className={line.isHighlight ? 'text-[#00FF9F]' : ''}>{line.text}</span>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}
