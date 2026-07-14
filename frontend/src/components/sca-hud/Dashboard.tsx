import React, { useState } from 'react';
import { ShieldAlert, Cpu, Database, Activity, TerminalSquare, Server, CheckCircle2, FileCode2, FolderOpen, File, ChevronRight, ChevronDown, AlertCircle, MessageSquare, Code, Settings, X, Box, LayoutDashboard, History, FolderKanban, Plus, Search, Clock, FolderTree, Github, GitBranch, FileText, PlayCircle } from 'lucide-react';
import { OpenHandsChat, OpenHandsTerminal, OpenHandsDiffViewer } from './OpenHandsMocks';

// Reusable HUD Panel Component with L-shaped corners and neon glow
function HudPanel({ title = null, children, className = "", headerRight = null, titleIcon: Icon = null }) {
  return (
    <div className={`relative border border-[#00FF9F]/30 bg-[#1A202C] flex flex-col ${className}`}>
      {/* L-shaped corners */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t-[2px] border-l-[2px] border-[#00FF9F] z-20"></div>
      <div className="absolute top-0 right-0 w-3 h-3 border-t-[2px] border-r-[2px] border-[#00FF9F] z-20"></div>
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[2px] border-l-[2px] border-[#00FF9F] z-20"></div>
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[2px] border-r-[2px] border-[#00FF9F] z-20"></div>
      
      {title && (
        <div className="text-[11px] font-bold text-[#00FF9F] bg-[#00FF9F]/10 px-3 py-1.5 border-b border-[#00FF9F]/30 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={14} className="text-[#00FF9F]" />}
            <span className="tracking-wide drop-shadow-[0_0_2px_rgba(0,255,159,0.8)]">{title}</span>
          </div>
          {headerRight}
        </div>
      )}
      <div className="flex-1 flex flex-col relative z-10 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('cpg');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('llm');
  const [activeSidebar, setActiveSidebar] = useState<string | null>(null);

  // State lifted up to Dashboard to ensure consistency across components
  // In a real OpenHands integration, these would be populated via WebSocket/Redux
  const [chatMessages, setChatMessages] = useState([
    { role: 'agent', text: '您好，我是 OpenHands 安全审计智能体。已连接到目标系统，准备执行漏洞扫描与渗透测试。请下达指令。' },
    { role: 'user', text: '扫描 src/core/utils/io.c 文件中的潜在漏洞。' },
    { role: 'agent', text: '正在分析 io.c... 发现潜在的缓冲区溢出漏洞 (CWE-119)。已在右侧终端生成 PoC 脚本，并在中央视图生成 CPG 图谱。' }
  ]);

  const [vulnList, setVulnList] = useState([
    { id: 'CWE-89', file: 'db.py:45', severity: '高危', severityClass: 'text-red-400', status: '未修复', statusClass: 'text-red-400 border-red-400/30 bg-red-400/10', active: false },
    { id: 'CWE-119', file: 'io.c:120', severity: '极危', severityClass: 'text-red-400', status: '已验证', statusClass: 'text-amber-400 border-amber-400/30 bg-amber-400/10', active: true },
    { id: 'CWE-502', file: 'svc.java:8', severity: '中危', severityClass: 'text-amber-400', status: '未验证', statusClass: 'text-slate-400 border-slate-600 bg-slate-800/50', active: false },
    { id: 'CWE-22', file: 'file.py:32', severity: '低危', severityClass: 'text-emerald-400', status: '已修复', statusClass: 'text-[#00FF9F] border-[#00FF9F]/30 bg-[#00FF9F]/10', active: false },
  ]);

  const [terminalLogs, setTerminalLogs] = useState([
    "$ ./run_poc.sh --target src/core/utils/io.c",
    "> 初始化多智能体协同渗透...",
    "> 结合图谱合成针对性 Payload...",
    "> 注入动态沙箱环境执行...",
    "> [eBPF] 捕获内核级异常信号:",
    "SIGSEGV @ 0x4f2a (kernel_sys_write)",
    "> [结果] 漏洞可利用性验证通过 (RCE).",
    "> 成功获取目标系统 Shell 权限."
  ]);

  const diffData = {
    file: "src/core/utils/io.c",
    originalCode: [
      { line: 118, text: "// Process input buffer", isHighlight: false },
      { line: 119, text: "void process(char *in) {", isHighlight: false },
      { line: 120, text: "-   strcpy(buffer, in);", isHighlight: true },
      { line: 121, text: "}", isHighlight: false }
    ],
    modifiedCode: [
      { line: 118, text: "// Process input buffer safely", isHighlight: false },
      { line: 119, text: "void process(char *in) {", isHighlight: false },
      { line: 120, text: "+   strncpy(buffer, in, sizeof(buffer)-1);", isHighlight: true },
      { line: 121, text: "+   buffer[sizeof(buffer)-1] = '\\0';", isHighlight: true },
      { line: 122, text: "}", isHighlight: false }
    ]
  };

  const handleSendMessage = (text) => {
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    
    // Simulate OpenHands backend processing and dispatching events to both Chat and Terminal
    setTimeout(() => {
      if (text.includes('修复') || text.includes('patch') || text.includes('fix')) {
        setChatMessages(prev => [...prev, { role: 'agent', text: '收到指令，正在应用 AI 推荐的补丁并进行回归测试...' }]);
        setTerminalLogs(prev => [...prev, `$ apply_patch io.c`, "> 补丁应用成功", "> 重新编译并运行测试用例...", "> [结果] 漏洞已修复"]);
        setVulnList(prev => prev.map(v => v.id === 'CWE-119' ? { ...v, status: '已修复', statusClass: 'text-[#00FF9F] border-[#00FF9F]/30 bg-[#00FF9F]/10' } : v));
      } else if (text.includes('验证') || text.includes('渗透') || text.includes('poc')) {
        setChatMessages(prev => [...prev, { role: 'agent', text: '收到指令，正在针对 CWE-119 执行自动化渗透测试...' }]);
        setTerminalLogs(prev => [...prev, `$ ./run_poc.sh --target src/core/utils/io.c`, "> 注入动态沙箱环境执行...", "> [eBPF] 捕获内核级异常信号: SIGSEGV", "> [结果] 漏洞可利用性验证通过 (RCE)"]);
        setVulnList(prev => prev.map(v => v.id === 'CWE-119' ? { ...v, status: '已验证', statusClass: 'text-amber-400 border-amber-400/30 bg-amber-400/10' } : v));
      } else {
        setChatMessages(prev => [...prev, { role: 'agent', text: '收到指令，正在调度底层扫描引擎执行后续安全分析任务...' }]);
        setTerminalLogs(prev => [...prev, `$ 接收到上层指令: ${text}`, "> 正在解析指令语义并映射至底层操作..."]);
      }
    }, 800);
  };

  return (
    <div className="h-screen w-screen bg-[#2D3748] text-slate-300 font-mono text-[11px] flex overflow-hidden selection:bg-[#00FF9F]/30">
      
      {/* Global Activity Bar */}
      <div className="w-14 bg-[#1A202C] border-r border-[#00FF9F]/30 flex flex-col items-center py-4 z-50 justify-between shrink-0 shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col gap-4 w-full items-center">
          <div className="w-8 h-8 rounded-md bg-[#00FF9F]/20 border border-[#00FF9F]/50 flex items-center justify-center mb-2 shadow-[0_0_10px_rgba(0,255,159,0.2)]">
            <ShieldAlert size={18} className="text-[#00FF9F]" />
          </div>
          <button 
            onClick={() => setActiveSidebar(activeSidebar === 'files' ? null : 'files')}
            className={`p-2 rounded-md transition-colors ${activeSidebar === 'files' ? 'text-[#00FF9F] bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
            title="文件资源管理器 (File Explorer)"
          >
            <FolderTree size={20} />
          </button>
          <button 
            onClick={() => setActiveSidebar(activeSidebar === 'repo' ? null : 'repo')}
            className={`p-2 rounded-md transition-colors ${activeSidebar === 'repo' ? 'text-[#00FF9F] bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
            title="代码仓库对接 (GitHub Integration)"
          >
            <Github size={20} />
          </button>
          <button 
            onClick={() => setActiveSidebar(activeSidebar === 'sessions' ? null : 'sessions')}
            className={`p-2 rounded-md transition-colors ${activeSidebar === 'sessions' ? 'text-[#00FF9F] bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
            title="会话与沙箱控制 (Session Control)"
          >
            <PlayCircle size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-4 w-full items-center">
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-md text-slate-500 hover:text-[#00FF9F] hover:bg-[#00FF9F]/10 transition-colors"
            title="系统配置 (Settings)"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Secondary Sidebar */}
      {activeSidebar === 'files' && (
        <div className="w-64 bg-[#1A202C] border-r border-[#00FF9F]/30 flex flex-col z-40 shrink-0 shadow-[5px_0_15px_rgba(0,0,0,0.5)]">
          <div className="p-3 border-b border-[#00FF9F]/30 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-200">文件资源管理器</span>
            <button className="p-1 bg-[#00FF9F]/20 text-[#00FF9F] rounded-sm hover:bg-[#00FF9F]/30 transition-colors" title="刷新文件树">
              <Activity size={14} />
            </button>
          </div>
          <div className="p-2 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1 mt-1 text-slate-300">
              <div className="flex items-center gap-1.5 p-1 hover:bg-slate-800 rounded-sm cursor-pointer">
                <ChevronDown size={14} className="text-slate-500" />
                <FolderOpen size={14} className="text-blue-400" />
                <span>src</span>
              </div>
              <div className="flex flex-col gap-1 pl-5">
                <div className="flex items-center gap-1.5 p-1 hover:bg-slate-800 rounded-sm cursor-pointer">
                  <ChevronDown size={14} className="text-slate-500" />
                  <FolderOpen size={14} className="text-blue-400" />
                  <span>core</span>
                </div>
                <div className="flex flex-col gap-1 pl-5">
                  <div className="flex items-center gap-1.5 p-1 hover:bg-slate-800 rounded-sm cursor-pointer">
                    <ChevronRight size={14} className="text-slate-500" />
                    <FolderOpen size={14} className="text-blue-400" />
                    <span>utils</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 bg-[#00FF9F]/10 text-[#00FF9F] rounded-sm cursor-pointer">
                    <FileCode2 size={14} />
                    <span>io.c</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-1 hover:bg-slate-800 rounded-sm cursor-pointer">
                  <FileCode2 size={14} className="text-amber-400" />
                  <span>db.py</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 p-1 hover:bg-slate-800 rounded-sm cursor-pointer">
                <FileText size={14} className="text-slate-400" />
                <span>README.md</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSidebar === 'repo' && (
        <div className="w-64 bg-[#1A202C] border-r border-[#00FF9F]/30 flex flex-col z-40 shrink-0 shadow-[5px_0_15px_rgba(0,0,0,0.5)]">
          <div className="p-3 border-b border-[#00FF9F]/30 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-200">代码仓库 (Repository)</span>
          </div>
          <div className="p-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-[10px] font-bold">GitHub Repository URL</label>
              <div className="flex items-center bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1.5">
                <Github size={14} className="text-slate-500 mr-2" />
                <input type="text" defaultValue="https://github.com/example/core-system-v2" className="bg-transparent border-none outline-none text-[10px] w-full text-slate-300" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-[10px] font-bold">Branch / Commit</label>
              <div className="flex items-center bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1.5">
                <GitBranch size={14} className="text-slate-500 mr-2" />
                <input type="text" defaultValue="main" className="bg-transparent border-none outline-none text-[10px] w-full text-slate-300" />
              </div>
            </div>
            <button className="w-full bg-[#00FF9F]/20 text-[#00FF9F] border border-[#00FF9F]/50 py-2 rounded-sm hover:bg-[#00FF9F]/30 transition-colors font-bold mt-2">
              加载仓库到沙箱
            </button>
          </div>
        </div>
      )}

      {activeSidebar === 'sessions' && (
        <div className="w-64 bg-[#1A202C] border-r border-[#00FF9F]/30 flex flex-col z-40 shrink-0 shadow-[5px_0_15px_rgba(0,0,0,0.5)]">
          <div className="p-3 border-b border-[#00FF9F]/30 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-200">会话控制 (Sessions)</span>
          </div>
          <div className="p-4 flex flex-col gap-4">
            <div className="bg-[#0b1120] border border-[#00FF9F]/30 p-3 rounded-sm">
              <div className="text-[#00FF9F] font-bold mb-1 flex items-center gap-2"><Activity size={14}/> 当前活跃会话</div>
              <div className="text-slate-400 text-[9px] break-all">ID: sess_9f8a2b1c-4d5e-6f7a</div>
              <div className="text-slate-500 text-[9px] mt-1">已消耗 Token: 12,450</div>
            </div>
            
            <div className="flex flex-col gap-2 mt-2">
              <button className="w-full bg-blue-500/20 text-blue-400 border border-blue-500/50 py-2 rounded-sm hover:bg-blue-500/30 transition-colors font-bold flex items-center justify-center gap-2">
                <Plus size={14} /> 新建空白会话
              </button>
              <button className="w-full bg-red-500/20 text-red-400 border border-red-500/50 py-2 rounded-sm hover:bg-red-500/30 transition-colors font-bold flex items-center justify-center gap-2">
                <X size={14} /> 终止当前沙箱
              </button>
            </div>

            <div className="mt-4 border-t border-slate-700 pt-4">
              <label className="text-slate-400 text-[10px] font-bold mb-2 block">恢复历史会话 (Resume)</label>
              <div className="flex items-center bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1.5 mb-2">
                <input type="text" placeholder="输入 Session Token..." className="bg-transparent border-none outline-none text-[10px] w-full text-slate-300" />
              </div>
              <button className="w-full bg-slate-800 text-slate-300 border border-slate-600 py-1.5 rounded-sm hover:bg-slate-700 transition-colors">
                恢复会话
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col gap-3 p-3 overflow-hidden">
        {/* 1. Header (60px height) */}
        <header className="h-[60px] shrink-0 relative border border-[#00FF9F]/30 bg-[#1A202C] flex items-center justify-between px-4">
        {/* L-shaped corners for Header */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-[2px] border-l-[2px] border-[#00FF9F] z-20"></div>
        <div className="absolute top-0 right-0 w-3 h-3 border-t-[2px] border-r-[2px] border-[#00FF9F] z-20"></div>
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[2px] border-l-[2px] border-[#00FF9F] z-20"></div>
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[2px] border-r-[2px] border-[#00FF9F] z-20"></div>

        <div className="flex items-center gap-4">
          <ShieldAlert className="text-[#00FF9F] drop-shadow-[0_0_5px_rgba(0,255,159,0.8)]" size={24} />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-slate-100 tracking-wide drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]">代码安全智能体（SeCodeAct）-SCA</h1>
            <div className="flex gap-4 text-[10px] mt-1 font-bold text-slate-400">
              <span className="flex items-center gap-1"><FolderOpen size={10} className="text-blue-400"/> 项目: core-system-v2</span>
              <span className="flex items-center gap-1"><FileCode2 size={10} className="text-slate-300"/> 代码量: 128,450 行</span>
              <span className="flex items-center gap-1"><AlertCircle size={10} className="text-red-400"/> 发现漏洞: {vulnList.length}</span>
              <span className="flex items-center gap-1"><CheckCircle2 size={10} className="text-[#00FF9F]"/> 已修复: {vulnList.filter(v => v.status === '已修复').length}</span>
              <span className="flex items-center gap-1"><TerminalSquare size={10} className="text-amber-400"/> 利用验证: {vulnList.filter(v => v.status === '已验证').length}</span>
            </div>
          </div>
        </div>

        {/* 5-Stage Workflow Progress Bar */}
        <div className="flex items-center gap-4">
          <div className="flex items-center text-[10px] font-bold bg-[#0f172a] border border-[#00FF9F]/20 px-3 py-1.5 rounded-sm">
            <span className="text-slate-400">代码审计</span>
            <span className="text-[#00FF9F]/40 mx-2">──▶</span>
            <span className="text-slate-400">自动渗透</span>
            <span className="text-[#00FF9F]/40 mx-2">──▶</span>
            <span className="text-[#00FF9F] drop-shadow-[0_0_3px_rgba(0,255,159,0.8)] border-b border-[#00FF9F]">根因分析</span>
            <span className="text-[#00FF9F]/40 mx-2">──▶</span>
            <span className="text-slate-400">补丁生成</span>
            <span className="text-[#00FF9F]/40 mx-2">──▶</span>
            <span className="text-slate-400">回归评估</span>
          </div>
        </div>
      </header>

      {/* 2. Main 3-Column Workspace */}
      <div className="flex flex-row gap-3 flex-1 min-h-[400px]">
        
        {/* Left Column (25%) */}
        <div className="w-[25%] flex flex-col gap-3">
          {/* Agent Chat Interface */}
          <HudPanel title="任务交互终端" titleIcon={MessageSquare} className="flex-1 min-h-[250px]">
            <OpenHandsChat messages={chatMessages} onSendMessage={handleSendMessage} />
          </HudPanel>

          {/* Vulnerability List */}
          <HudPanel title="漏洞列表 (Vuln List)" className="flex-1 min-h-[200px]">
            <div className="overflow-y-auto">
              <table className="w-full text-left text-[10px]">
                <thead className="text-[#00FF9F]/70 border-b border-[#00FF9F]/20 bg-[#00FF9F]/5">
                  <tr>
                    <th className="p-1.5">漏洞编号</th>
                    <th className="p-1.5">文件:行号</th>
                    <th className="p-1.5">危险等级</th>
                    <th className="p-1.5">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {vulnList.map((vuln, idx) => (
                    <tr key={idx} className={vuln.active ? "text-[#00FF9F] bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]" : "text-slate-400 border-b border-slate-800"}>
                      <td className={`p-1.5 ${vuln.active ? 'font-bold' : ''}`}>{vuln.id}</td>
                      <td className={vuln.active ? 'font-bold' : ''}>{vuln.file}</td>
                      <td className={`${vuln.severityClass} ${vuln.active ? 'font-bold' : ''}`}>{vuln.severity}</td>
                      <td className="p-1.5">
                        <span className={`px-1.5 py-0.5 rounded-sm border text-[9px] ${vuln.statusClass}`}>
                          {vuln.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HudPanel>
        </div>

        {/* Center Column (50%) */}
        <div className="w-[50%] flex flex-col">
          <HudPanel className="flex-1">
            {/* Modern Tabs */}
            <div className="flex border-b border-[#00FF9F]/30 bg-[#0f172a]">
              <div 
                onClick={() => setActiveTab('cpg')}
                className={`px-4 py-2 text-[11px] font-bold cursor-pointer border-b-2 ${activeTab === 'cpg' ? 'text-[#00FF9F] border-[#00FF9F] bg-[#00FF9F]/10 drop-shadow-[0_0_2px_rgba(0,255,159,0.5)]' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
              >
                [代码属性图 CPG]
              </div>
              <div 
                onClick={() => setActiveTab('diff')}
                className={`px-4 py-2 text-[11px] font-bold cursor-pointer border-b-2 ${activeTab === 'diff' ? 'text-[#00FF9F] border-[#00FF9F] bg-[#00FF9F]/10 drop-shadow-[0_0_2px_rgba(0,255,159,0.5)]' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
              >
                [代码修复对比 Diff]
              </div>
            </div>
            
            {/* Tab Content */}
            {activeTab === 'cpg' ? (
              <div className="flex-1 relative bg-[#0b1120] overflow-hidden flex items-center justify-center p-4 bg-[linear-gradient(to_right,#00FF9F05_1px,transparent_1px),linear-gradient(to_bottom,#00FF9F05_1px,transparent_1px)] bg-[size:20px_20px]">
                 <svg width="100%" height="100%" viewBox="0 0 600 300" className="max-w-full max-h-full">
                   <defs>
                     <marker id="arrow-gray" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 z" fill="#475569"/></marker>
                     <marker id="arrow-amber" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 z" fill="#f59e0b"/></marker>
                     <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 z" fill="#ef4444"/></marker>
                     <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 z" fill="#3b82f6"/></marker>
                   </defs>
                   
                   {/* Legend Box */}
                   <rect x="10" y="10" width="130" height="80" fill="#1A202C" stroke="#00FF9F" strokeWidth="0.5" opacity="0.9" rx="2"/>
                   <text x="18" y="25" fill="#00FF9F" fontSize="9" fontFamily="monospace" fontWeight="bold">图例 (Legend):</text>
                   <polygon points="18,35 28,35 33,40 28,45 18,45 13,40" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="1"/>
                   <text x="40" y="43" fill="#cbd5e1" fontSize="8" fontFamily="monospace">污染源 (Source)</text>
                   <circle cx="23" cy="55" r="5" fill="#1e293b" stroke="#f59e0b" strokeWidth="1"/>
                   <text x="40" y="58" fill="#cbd5e1" fontSize="8" fontFamily="monospace">逻辑节点 (AST/CFG)</text>
                   <polygon points="18,65 28,65 23,75" fill="#451a03" stroke="#ef4444" strokeWidth="1"/>
                   <text x="40" y="73" fill="#cbd5e1" fontSize="8" fontFamily="monospace">执行陷阱 (Sink)</text>
  
                   {/* Edges */}
                   <line x1="100" y1="150" x2="180" y2="80" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="2 2" markerEnd="url(#arrow-blue)"/>
                   <line x1="100" y1="150" x2="180" y2="150" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-amber)"/>
                   <line x1="100" y1="150" x2="180" y2="230" stroke="#475569" strokeWidth="1.5" markerEnd="url(#arrow-gray)"/>
                   
                   <line x1="220" y1="150" x2="310" y2="150" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arrow-amber)"/>
                   <line x1="220" y1="230" x2="310" y2="230" stroke="#475569" strokeWidth="1.5" markerEnd="url(#arrow-gray)"/>
                   
                   <line x1="350" y1="150" x2="430" y2="150" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrow-red)"/>
                   <line x1="350" y1="230" x2="430" y2="165" stroke="#475569" strokeWidth="1.5" markerEnd="url(#arrow-gray)"/>
                   
                   <line x1="470" y1="150" x2="530" y2="150" stroke="#ef4444" strokeWidth="2.5" markerEnd="url(#arrow-red)"/>
  
                   {/* Edge Labels */}
                   <text x="130" y="105" fill="#3b82f6" fontSize="8" fontFamily="monospace" transform="rotate(-35 130 105)">[AST Decl]</text>
                   <text x="130" y="145" fill="#f59e0b" fontSize="8" fontFamily="monospace">[数据流依赖]</text>
                   <text x="130" y="205" fill="#475569" fontSize="8" fontFamily="monospace" transform="rotate(35 130 205)">[控制流分支]</text>
                   <text x="240" y="145" fill="#f59e0b" fontSize="8" fontFamily="monospace">[污点传播]</text>
                   <text x="365" y="145" fill="#ef4444" fontSize="9" fontFamily="monospace" fontWeight="bold">[核心利用路径]</text>
  
                   {/* Source Node (Hexagon) */}
                   <polygon points="70,130 100,130 115,150 100,170 70,170 55,150" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="1.5" className="drop-shadow-[0_0_5px_rgba(59,130,246,0.6)]"/>
                   <text x="85" y="153" fill="#bfdbfe" fontSize="10" textAnchor="middle" fontFamily="monospace">Source</text>
                   <text x="85" y="185" fill="#64748b" fontSize="9" textAnchor="middle" fontFamily="monospace">char *in</text>
  
                   {/* AST Node 1 (Circle) */}
                   <circle cx="200" cy="80" r="20" fill="#1e293b" stroke="#3b82f6" strokeWidth="1.5"/>
                   <text x="200" y="83" fill="#e2e8f0" fontSize="10" textAnchor="middle" fontFamily="monospace">AST</text>
                   <text x="200" y="115" fill="#64748b" fontSize="9" textAnchor="middle" fontFamily="monospace">ParamDecl</text>
  
                   {/* AST Node 2 (Circle) */}
                   <circle cx="200" cy="150" r="20" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5"/>
                   <text x="200" y="153" fill="#e2e8f0" fontSize="10" textAnchor="middle" fontFamily="monospace">AST</text>
                   <text x="200" y="185" fill="#64748b" fontSize="9" textAnchor="middle" fontFamily="monospace">AssignStmt</text>
  
                   {/* CFG Node 1 (Circle) */}
                   <circle cx="200" cy="230" r="20" fill="#1e293b" stroke="#475569" strokeWidth="1.5"/>
                   <text x="200" y="233" fill="#e2e8f0" fontSize="10" textAnchor="middle" fontFamily="monospace">CFG</text>
                   <text x="200" y="265" fill="#64748b" fontSize="9" textAnchor="middle" fontFamily="monospace">IfStmt(False)</text>
  
                   {/* Taint Prop Node (Circle) */}
                   <circle cx="330" cy="150" r="20" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5"/>
                   <text x="330" y="153" fill="#e2e8f0" fontSize="10" textAnchor="middle" fontFamily="monospace">Taint</text>
                   <text x="330" y="185" fill="#64748b" fontSize="9" textAnchor="middle" fontFamily="monospace">BypassFilter</text>
  
                   {/* CFG Node 2 (Circle) */}
                   <circle cx="330" cy="230" r="20" fill="#1e293b" stroke="#475569" strokeWidth="1.5"/>
                   <text x="330" y="233" fill="#e2e8f0" fontSize="10" textAnchor="middle" fontFamily="monospace">CFG</text>
                   <text x="330" y="265" fill="#64748b" fontSize="9" textAnchor="middle" fontFamily="monospace">BasicBlock_4</text>
  
                   {/* Call Node (Circle) */}
                   <circle cx="450" cy="150" r="20" fill="#451a03" stroke="#ef4444" strokeWidth="1.5"/>
                   <text x="450" y="153" fill="#fca5a5" fontSize="10" textAnchor="middle" fontFamily="monospace">Call</text>
                   <text x="450" y="185" fill="#64748b" fontSize="9" textAnchor="middle" fontFamily="monospace">CallExpr</text>
  
                   {/* Sink Node (Inverted Triangle) */}
                   <polygon points="530,130 590,130 560,170" fill="#451a03" stroke="#ef4444" strokeWidth="1.5" className="drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]"/>
                   <text x="560" y="145" fill="#fca5a5" fontSize="10" textAnchor="middle" fontFamily="monospace">Sink</text>
                   <text x="560" y="185" fill="#64748b" fontSize="9" textAnchor="middle" fontFamily="monospace">strcpy()</text>
                 </svg>
              </div>
            ) : (
              <div className="flex-1 relative bg-[#0b1120] overflow-hidden">
                <OpenHandsDiffViewer 
                  file={diffData.file} 
                  originalCode={diffData.originalCode} 
                  modifiedCode={diffData.modifiedCode} 
                />
              </div>
            )}
          </HudPanel>
        </div>

        {/* Right Column (25%) */}
        <div className="w-[25%] flex flex-col gap-3">
          {/* PoC Pentest Console */}
          <HudPanel 
            title="沙箱Agent执行终端（Terminal）" 
            titleIcon={TerminalSquare}
            className="flex-1"
            headerRight={<span className="text-[#00FF9F] animate-pulse text-[10px]">● Live</span>}
          >
            <OpenHandsTerminal logs={terminalLogs} />
          </HudPanel>

          {/* Metadata & Context */}
          <HudPanel title="元数据与上下文" className="h-[120px] shrink-0">
            <div className="p-2 space-y-1.5 text-[10px]">
              <div className="flex justify-between"><span className="text-slate-500">漏洞编号 (CWE):</span> <span className="text-red-400 font-bold">CWE-119</span></div>
              <div className="flex justify-between"><span className="text-slate-500">漏洞属性:</span> <span className="text-slate-300">内存越界写入</span></div>
              <div className="flex justify-between"><span className="text-slate-500">关联图谱实体:</span> <span className="text-blue-400">内存破坏原语</span></div>
              <div className="flex justify-between"><span className="text-slate-500">CVSS 评分:</span> <span className="text-red-400 font-bold">9.8 (极危)</span></div>
            </div>
          </HudPanel>
        </div>
      </div>

      {/* 4. Bottom Row: Root Cause & Patch Synthesis */}
      <HudPanel title="根因定位与补丁生成" className="shrink-0">
        {/* Root Cause Description */}
        <div className="p-2 bg-[#1A202C] text-[10px] text-slate-300 flex items-start gap-2">
          <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-amber-400 font-bold mr-1">[根因分析]:</span> 
            变量 <code className="text-slate-100 bg-slate-800 px-1 rounded">in</code> 未经边界校验直接拷贝至固定长度的 <code className="text-slate-100 bg-slate-800 px-1 rounded">buffer</code> 中。攻击者可构造超长输入覆盖相邻栈内存，导致任意代码执行 (RCE)。
          </div>
        </div>
      </HudPanel>

      {/* 5. Footer (30px height) */}
      <footer className="h-[30px] shrink-0 border border-[#00FF9F]/30 bg-[#1A202C] px-3 flex justify-between items-center text-[10px] text-slate-500 relative">
        {/* L-shaped corners for Footer */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00FF9F] z-20"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00FF9F] z-20"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#00FF9F] z-20"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#00FF9F] z-20"></div>

        <div className="flex items-center gap-3 font-bold">
          <span className="text-purple-400 flex items-center gap-1 bg-purple-400/10 px-2 py-0.5 border border-purple-400/30"><Cpu size={10}/> 大模型: Security-LLM-V3 (活跃)</span>
          <span className="text-blue-400 flex items-center gap-1 bg-blue-400/10 px-2 py-0.5 border border-blue-400/30"><Database size={10}/> 知识图谱: V2.4 (已同步)</span>
          <span className="text-[#00FF9F] flex items-center gap-1 bg-[#00FF9F]/10 px-2 py-0.5 border border-[#00FF9F]/30"><Activity size={10}/> eBPF 探针: 运行中</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Server size={10} /> 系统状态: 正常</span>
          <span className="flex items-center gap-1 border-l border-slate-700 pl-4"><Activity size={10} /> 任务 ID: TSK-8829-X</span>
          <span className="flex items-center gap-1 border-l border-slate-700 pl-4"><FileCode2 size={10} /> SBOM: v2.1.4</span>
        </div>
      </footer>
      </div>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-[650px] bg-[#1A202C] border border-[#00FF9F]/50 shadow-[0_0_20px_rgba(0,255,159,0.15)] flex flex-col font-mono text-[11px]">
            {/* L-shaped corners */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t-[2px] border-l-[2px] border-[#00FF9F] z-20"></div>
            <div className="absolute top-0 right-0 w-3 h-3 border-t-[2px] border-r-[2px] border-[#00FF9F] z-20"></div>
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[2px] border-l-[2px] border-[#00FF9F] z-20"></div>
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[2px] border-r-[2px] border-[#00FF9F] z-20"></div>
            
            {/* Modal Header */}
            <div className="flex justify-between items-center p-3 border-b border-[#00FF9F]/30 bg-[#00FF9F]/10 relative z-10">
              <div className="flex items-center gap-2 text-[#00FF9F] font-bold text-[12px]">
                <Settings size={16} /> 系统高级配置 (OpenHands Settings)
              </div>
              <button onClick={() => setShowSettings(false)} className="text-[#00FF9F] hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex h-[400px] relative z-10">
              {/* Sidebar */}
              <div className="w-[140px] flex flex-col gap-1 border-r border-[#00FF9F]/20 p-2 bg-[#0b1120]">
                <div 
                  onClick={() => setSettingsTab('llm')}
                  className={`p-2 cursor-pointer rounded-sm ${settingsTab === 'llm' ? 'bg-[#00FF9F]/20 text-[#00FF9F] border-l-2 border-[#00FF9F]' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                >
                  LLM 配置
                </div>
                <div 
                  onClick={() => setSettingsTab('agent')}
                  className={`p-2 cursor-pointer rounded-sm ${settingsTab === 'agent' ? 'bg-[#00FF9F]/20 text-[#00FF9F] border-l-2 border-[#00FF9F]' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                >
                  Agent 设置
                </div>
                <div 
                  onClick={() => setSettingsTab('skills')}
                  className={`p-2 cursor-pointer rounded-sm ${settingsTab === 'skills' ? 'bg-[#00FF9F]/20 text-[#00FF9F] border-l-2 border-[#00FF9F]' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                >
                  Skills 技能库
                </div>
                <div 
                  onClick={() => setSettingsTab('mcp')}
                  className={`p-2 cursor-pointer rounded-sm ${settingsTab === 'mcp' ? 'bg-[#00FF9F]/20 text-[#00FF9F] border-l-2 border-[#00FF9F]' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                >
                  MCP 服务
                </div>
                <div 
                  onClick={() => setSettingsTab('workspace')}
                  className={`p-2 cursor-pointer rounded-sm ${settingsTab === 'workspace' ? 'bg-[#00FF9F]/20 text-[#00FF9F] border-l-2 border-[#00FF9F]' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                >
                  工作区 (Workspace)
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 p-4 overflow-y-auto bg-[#1A202C] text-slate-300">
                {settingsTab === 'llm' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[#00FF9F] font-bold">大模型提供商 (LLM Provider)</label>
                      <select className="bg-[#0b1120] border border-slate-600 p-2 rounded-sm outline-none focus:border-[#00FF9F]/50 text-slate-200">
                        <option>OpenAI</option>
                        <option>Anthropic</option>
                        <option>Ollama (Local)</option>
                        <option>Custom API</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[#00FF9F] font-bold">模型版本 (Model)</label>
                      <input type="text" defaultValue="gpt-4o" className="bg-[#0b1120] border border-slate-600 p-2 rounded-sm outline-none focus:border-[#00FF9F]/50 text-slate-200" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[#00FF9F] font-bold">API Key</label>
                      <input type="password" defaultValue="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="bg-[#0b1120] border border-slate-600 p-2 rounded-sm outline-none focus:border-[#00FF9F]/50 text-slate-200" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[#00FF9F] font-bold">Base URL (可选)</label>
                      <input type="text" placeholder="https://api.openai.com/v1" className="bg-[#0b1120] border border-slate-600 p-2 rounded-sm outline-none focus:border-[#00FF9F]/50 text-slate-200" />
                    </div>
                  </div>
                )}

                {settingsTab === 'skills' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-end border-b border-slate-700 pb-2">
                      <div>
                        <h3 className="text-[#00FF9F] font-bold text-[12px]">智能体技能库 (Agent Skills)</h3>
                        <p className="text-slate-500 text-[9px] mt-1">管理和注入自定义 Python 技能/工具，扩展智能体操作能力。</p>
                      </div>
                      <button className="bg-[#00FF9F]/20 border border-[#00FF9F]/50 text-[#00FF9F] px-2 py-1 rounded-sm hover:bg-[#00FF9F]/30 transition-colors">
                        + 新增技能
                      </button>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <div className="bg-[#0b1120] border border-slate-700 p-3 rounded-sm flex justify-between items-center group hover:border-[#00FF9F]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-blue-500/10 rounded-sm"><Code size={14} className="text-blue-400"/></div>
                          <div>
                            <div className="font-bold text-slate-200">code_analyzer</div>
                            <div className="text-[9px] text-slate-500">AST/CFG 静态分析辅助函数</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[#00FF9F] text-[9px]">已启用</span>
                          <div className="w-8 h-4 bg-[#00FF9F]/20 rounded-full relative cursor-pointer border border-[#00FF9F]/50">
                            <div className="absolute right-0.5 top-0.5 w-2.5 h-2.5 bg-[#00FF9F] rounded-full"></div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#0b1120] border border-slate-700 p-3 rounded-sm flex justify-between items-center group hover:border-[#00FF9F]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-red-500/10 rounded-sm"><ShieldAlert size={14} className="text-red-400"/></div>
                          <div>
                            <div className="font-bold text-slate-200">cve_search</div>
                            <div className="text-[9px] text-slate-500">NVD 漏洞库自动化检索工具</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[#00FF9F] text-[9px]">已启用</span>
                          <div className="w-8 h-4 bg-[#00FF9F]/20 rounded-full relative cursor-pointer border border-[#00FF9F]/50">
                            <div className="absolute right-0.5 top-0.5 w-2.5 h-2.5 bg-[#00FF9F] rounded-full"></div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#0b1120] border border-slate-700 p-3 rounded-sm flex justify-between items-center opacity-60">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-slate-500/10 rounded-sm"><TerminalSquare size={14} className="text-slate-400"/></div>
                          <div>
                            <div className="font-bold text-slate-400">gdb_debugger</div>
                            <div className="text-[9px] text-slate-500">GDB 动态调试自动化脚本</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 text-[9px]">已禁用</span>
                          <div className="w-8 h-4 bg-slate-800 rounded-full relative cursor-pointer border border-slate-600">
                            <div className="absolute left-0.5 top-0.5 w-2.5 h-2.5 bg-slate-500 rounded-full"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === 'mcp' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-end border-b border-slate-700 pb-2">
                      <div>
                        <h3 className="text-[#00FF9F] font-bold text-[12px]">Model Context Protocol (MCP)</h3>
                        <p className="text-slate-500 text-[9px] mt-1">配置外部工具与知识源，扩展 Agent 能力边界。</p>
                      </div>
                      <button className="bg-[#00FF9F]/20 border border-[#00FF9F]/50 text-[#00FF9F] px-2 py-1 rounded-sm hover:bg-[#00FF9F]/30 transition-colors">
                        + 添加 MCP
                      </button>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <div className="bg-[#0b1120] border border-slate-700 p-3 rounded-sm flex justify-between items-center group hover:border-[#00FF9F]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-blue-500/10 rounded-sm"><Box size={14} className="text-blue-400"/></div>
                          <div>
                            <div className="font-bold text-slate-200">github-mcp-server</div>
                            <div className="text-[9px] text-slate-500">提供代码仓库读取与 PR 提交能力</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#00FF9F] text-[9px] flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#00FF9F] animate-pulse"></div> Connected</span>
                        </div>
                      </div>

                      <div className="bg-[#0b1120] border border-slate-700 p-3 rounded-sm flex justify-between items-center group hover:border-[#00FF9F]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-purple-500/10 rounded-sm"><ShieldAlert size={14} className="text-purple-400"/></div>
                          <div>
                            <div className="font-bold text-slate-200">sec-tools-mcp</div>
                            <div className="text-[9px] text-slate-500">集成 Nmap, SQLMap 等渗透测试工具链</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#00FF9F] text-[9px] flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#00FF9F] animate-pulse"></div> Connected</span>
                        </div>
                      </div>

                      <div className="bg-[#0b1120] border border-slate-700 p-3 rounded-sm flex justify-between items-center opacity-50">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-slate-500/10 rounded-sm"><Database size={14} className="text-slate-400"/></div>
                          <div>
                            <div className="font-bold text-slate-400">neo4j-cpg-mcp</div>
                            <div className="text-[9px] text-slate-500">代码属性图 (CPG) 知识图谱查询接口</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 text-[9px] flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div> Disconnected</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === 'agent' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[#00FF9F] font-bold">智能体类型 (Agent Class)</label>
                      <select className="bg-[#0b1120] border border-slate-600 p-2 rounded-sm outline-none focus:border-[#00FF9F]/50 text-slate-200">
                        <option>SecurityAuditorAgent (Default)</option>
                        <option>CodeActAgent</option>
                        <option>BrowsingAgent</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[#00FF9F] font-bold">最大迭代次数 (Max Iterations)</label>
                      <input type="number" defaultValue={50} className="bg-[#0b1120] border border-slate-600 p-2 rounded-sm outline-none focus:border-[#00FF9F]/50 text-slate-200" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[#00FF9F] font-bold">系统提示词 (System Prompt Override)</label>
                      <textarea rows={4} className="bg-[#0b1120] border border-slate-600 p-2 rounded-sm outline-none focus:border-[#00FF9F]/50 text-slate-400 resize-none" placeholder="You are an expert security researcher..."></textarea>
                    </div>
                  </div>
                )}

                {settingsTab === 'workspace' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[#00FF9F] font-bold">挂载目录 (Workspace Mount Path)</label>
                      <input type="text" defaultValue="/var/lib/openhands/workspace" className="bg-[#0b1120] border border-slate-600 p-2 rounded-sm outline-none focus:border-[#00FF9F]/50 text-slate-200" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[#00FF9F] font-bold">沙箱镜像 (Sandbox Container Image)</label>
                      <input type="text" defaultValue="ghcr.io/all-hands-ai/runtime:latest" className="bg-[#0b1120] border border-slate-600 p-2 rounded-sm outline-none focus:border-[#00FF9F]/50 text-slate-200" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-[#00FF9F]/30 flex justify-end gap-3 bg-[#0b1120] relative z-10">
              <button 
                onClick={() => setShowSettings(false)} 
                className="px-4 py-1.5 border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 rounded-sm transition-colors"
              >
                取消
              </button>
              <button 
                onClick={() => setShowSettings(false)} 
                className="px-4 py-1.5 bg-[#00FF9F]/20 border border-[#00FF9F]/50 text-[#00FF9F] hover:bg-[#00FF9F]/30 rounded-sm transition-colors font-bold shadow-[0_0_10px_rgba(0,255,159,0.2)]"
              >
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
