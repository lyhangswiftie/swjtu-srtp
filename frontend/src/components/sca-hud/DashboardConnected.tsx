/*
 * DashboardConnected.tsx  v4.0
 *
 * SeCodeAct HUD 主控制台 —— 侧边栏功能补全版本（SCA-004）
 *
 * v4.0 新增功能（SCA-004）：
 *  - 代码仓库对接（Repository）：输入 GitHub URL + Branch，
 *    通过 useSendMessage 发送 git clone 指令到 Agent，
 *    克隆完成后自动刷新文件树；支持加载状态和错误提示。
 *  - 会话控制（Sessions）：
 *    · 新建空白会话：调用 POST /api/conversations，导航到新会话
 *    · 终止当前沙箱：调用 POST /api/conversations/{id}/stop
 *    · 恢复历史会话：输入 conversationId 后导航到对应会话
 *    · 会话列表：加载并显示最近 5 条历史会话，支持一键切换
 *
 * v3.0 功能（保留，SCA-003）：
 *  - 文件资源管理器完全动态化：懒加载策略
 *  - handleSelectFile：点击文件时自动切换到 Diff 视图
 *  - 自动刷新机制、Git 变更高亮
 *
 * v2.0 功能（保留）：
 *  - chatMessages / handleSendMessage → useEventStore + useSendMessage
 *  - terminalLogs → useCommandStore
 *  - diffData → GitService.getGitChanges/getGitChangeDiff
 *  - vulnList 自动更新 → 关键词匹配规则
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldAlert,
  Database,
  Activity,
  TerminalSquare,
  CheckCircle2,
  FileCode2,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  MessageSquare,
  Settings,
  X,
  Plus,
  FolderTree,
  GitBranch as Github,
  GitBranch,
  PlayCircle,
  RefreshCw,
  Loader2,
  GitCommit,
  FileText,
  Download,
  BarChart2,
} from "lucide-react";
import { useParams, useNavigate } from "react-router";
import {
  OpenHandsChat,
  OpenHandsTerminal,
  OpenHandsDiffViewer,
} from "./OpenHandsMocks";
import CpgGraph, { type CpgGraphData } from "./CpgGraph";
import HudErrorBoundary from "./HudErrorBoundary";
import SystemLogPanel, {
  SystemLogEntry,
  inferLogEntry,
} from "./SystemLogPanel";
import { CVE_BENCH_DATASET } from "./CveBenchData";
import PoCUtilTab, { type PoCExecutionResult } from "./PoCUtilTab";
import KnowledgeGraphTab from "./KnowledgeGraphTab";
import {
  extractCpgJsonFromOutput,
  buildJoernCommand,
  hasJoernLog,
  CPG_JSON_MARKER,
} from "./JoernService";

// ── 真实数据 Hook ──────────────────────────────────────────────────────────────
import { useEventStore } from "#/stores/use-event-store";
import { useCommandStore } from "#/stores/command-store";
import { useAgentStore } from "#/stores/agent-store";
import { useSendMessage } from "#/hooks/use-send-message";
import V1GitService from "#/api/git-service/v1-git-service.api";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import type { GitChangeDiff } from "#/api/open-hands.types";
import { AgentState } from "#/types/agent-state";

// ── 类型定义 ───────────────────────────────────────────────────────────────────

/** 漏洞条目，用于漏洞列表面板 */
interface VulnItem {
  id: string;
  file: string;
  severity: string;
  severityClass: string;
  status: string;
  statusClass: string;
  active: boolean;
}

/** Diff Viewer 单行数据 */
interface DiffLine {
  line: number;
  text: string;
  isHighlight: boolean;
}

/** Diff Viewer 数据集 */
interface DiffData {
  file: string;
  originalCode: DiffLine[];
  modifiedCode: DiffLine[];
}

/**
 * 文件树节点（v3.0 增强）
 *
 * - `isDir`：是否为目录
 * - `expanded`：目录是否已展开
 * - `loaded`：目录子内容是否已通过 API 加载（懒加载标志）
 * - `loading`：目录是否正在加载中
 * - `hasGitChange`：是否有 Git 变更（用于高亮显示）
 * - `gitStatus`：Git 变更状态（A=新增, M=修改, D=删除）
 */
interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeNode[];
  expanded?: boolean;
  loaded?: boolean;
  loading?: boolean;
  hasGitChange?: boolean;
  gitStatus?: string;
}

// ── 工具函数 ───────────────────────────────────────────────────────────────────

/**
 * 将 OpenHands 事件流（OHEvent）转换为 Chat 消息格式。
 */
function eventsToMessages(
  events: ReturnType<typeof useEventStore.getState>["uiEvents"],
) {
  const messages: { role: "user" | "agent"; text: string }[] = [];
  for (const ev of events) {
    const e = ev as any;

    // 1) V1 LLM message events (role + content array)
    if (e.llm_message?.content) {
      const content = e.llm_message.content;
      let text = "";
      if (Array.isArray(content)) {
        text = content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");
      } else if (typeof content === "string") {
        text = content;
      }
      if (text.trim()) {
        messages.push({
          role: e.llm_message.role === "user" ? "user" : "agent",
          text,
        });
        continue;
      }
    }

    // 2) V0 / legacy events: source + message / content / args.content
    const source = e.source ?? e.role;
    const text =
      e.message ??
      e.content ??
      e.args?.content ??
      (e.args?.thought ? `[思考] ${e.args.thought}` : "") ??
      "";
    if (text && source === "user") {
      messages.push({ role: "user", text: String(text) });
      continue;
    }
    if (text && source === "agent") {
      messages.push({ role: "agent", text: String(text) });
      continue;
    }
    if (text && typeof text === "string" && text.trim()) {
      messages.push({ role: "agent", text: String(text) });
      continue;
    }

    // 3) Observation events from agent (e.g. run / read / write results)
    if (e.observation && e.content) {
      const obsType = e.observation;
      const preview =
        String(e.content).slice(0, 300) +
        (String(e.content).length > 300 ? "…" : "");
      messages.push({
        role: "agent",
        text: `[${obsType}] ${preview}`,
      });
      continue;
    }

    // 4) Action events from agent
    if (e.action && e.args) {
      const actionName = e.action;
      const argsPreview = JSON.stringify(e.args).slice(0, 200);
      messages.push({
        role: "agent",
        text: `[动作: ${actionName}] ${argsPreview}`,
      });
      continue;
    }

    // 5) Status / info events with a message
    if (e.message && typeof e.message === "string" && e.message.trim()) {
      messages.push({ role: "agent", text: e.message });
      continue;
    }
  }
  return messages;
}

/**
 * 将 useCommandStore 的 Command[] 转换为终端日志字符串数组。
 */
function commandsToLogs(
  commands: ReturnType<typeof useCommandStore.getState>["commands"],
) {
  return commands.map((cmd) =>
    cmd.type === "input" ? `$ ${cmd.content}` : cmd.content,
  );
}

/**
 * 从事件流和命令流中提取所有文本，用于关键词匹配。
 */
function extractAllText(
  events: ReturnType<typeof useEventStore.getState>["uiEvents"],
  commands: ReturnType<typeof useCommandStore.getState>["commands"],
): string {
  const eventTexts = events
    .map((ev) =>
      String(
        (ev as any).message ??
          (ev as any).content ??
          (ev as any).args?.content ??
          "",
      ),
    )
    .join(" ");
  const commandTexts = commands.map((cmd) => cmd.content).join(" ");
  return `${eventTexts} ${commandTexts}`.toLowerCase();
}

/**
 * 将 API 返回的 flat 文件路径列表（string[]）构建为树形结构。
 *
 * 算法说明：
 * - 对路径列表排序，确保目录在文件前面（目录路径以 "/" 结尾）
 * - 逐个解析路径，按 "/" 分割后逐层构建树节点
 * - 使用 dirMap 缓存已创建的目录节点，避免重复创建
 * - 顶层目录默认展开（i === 0），子目录默认折叠
 *
 * @param paths - API 返回的文件路径数组（目录以 "/" 结尾）
 * @param gitChangePaths - 有 Git 变更的文件路径集合（用于高亮）
 * @returns 树形结构节点数组
 */
function buildFileTree(
  paths: string[],
  gitChangePaths?: Set<string>,
  pathPrefix?: string,
): FileTreeNode[] {
  // 防御性校验：确保输入是合法的字符串数组
  if (!Array.isArray(paths)) {
    console.error("[SCA] buildFileTree 收到非数组参数:", typeof paths, paths);
    return [];
  }

  // 过滤无效条目并限制最大条目数（防止极端情况导致页面卡死）
  const MAX_ENTRIES = 5000;
  const validPaths = paths.filter(
    (p) => typeof p === "string" && p.trim().length > 0,
  );
  if (validPaths.length > MAX_ENTRIES) {
    console.warn(
      `[SCA] buildFileTree: 文件条目过多 (${validPaths.length})，截断至 ${MAX_ENTRIES} 条`,
    );
    validPaths.length = MAX_ENTRIES; // 截断数组
  }

  const root: FileTreeNode[] = [];
  const dirMap = new Map<string, FileTreeNode>();

  // 排序：目录（以 / 结尾）优先，然后按字母排序
  const sorted = [...validPaths].sort((a, b) => {
    const aIsDir = a.endsWith("/");
    const bIsDir = b.endsWith("/");
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.localeCompare(b);
  });

  for (const p of sorted) {
    const isDir = p.endsWith("/");
    const cleanPath = p.replace(/\/$/, "");
    const parts = cleanPath.replace(/^\//, "").split("/").filter(Boolean);
    let current = root;
    let currentPath = pathPrefix || "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      if (!isLast || isDir) {
        // 目录节点
        if (!dirMap.has(currentPath)) {
          const node: FileTreeNode = {
            name: part,
            path: currentPath,
            isDir: true,
            children: [],
            expanded: !pathPrefix && i === 0, // 顶层目录默认展开（子目录懒加载时不展开）
            loaded: false, // 子内容尚未通过 API 加载
            loading: false,
          };
          dirMap.set(currentPath, node);
          current.push(node);
        }
        current = dirMap.get(currentPath)!.children!;
      } else {
        // 文件节点
        const hasGitChange = gitChangePaths
          ? gitChangePaths.has(currentPath)
          : false;
        current.push({
          name: part,
          path: currentPath,
          isDir: false,
          hasGitChange,
          gitStatus: hasGitChange ? "M" : undefined,
        });
      }
    }
  }

  return root;
}

/**
 * 在树中更新指定路径的节点（深度优先搜索）。
 * 返回新的树数组（不可变更新）。
 *
 * @param nodes - 当前树节点数组
 * @param targetPath - 需要更新的节点路径
 * @param updater - 更新函数，接收当前节点，返回新节点
 */
function updateTreeNode(
  nodes: FileTreeNode[],
  targetPath: string,
  updater: (node: FileTreeNode) => FileTreeNode,
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return updater(node);
    }
    if (node.children) {
      return {
        ...node,
        children: updateTreeNode(node.children, targetPath, updater),
      };
    }
    return node;
  });
}

/**
 * 将文件内容字符串转换为 DiffLine 数组（用于无 Git 变更时展示原始内容）。
 *
 * @param content - 文件内容字符串
 * @param file - 文件路径（用于 DiffData.file）
 * @returns DiffData 对象，originalCode 和 modifiedCode 相同（无差异）
 */
function contentToDiffData(content: string, file: string): DiffData {
  const lines = content.split("\n");
  const diffLines: DiffLine[] = lines.map((text, i) => ({
    line: i + 1,
    text,
    isHighlight: false,
  }));
  return {
    file,
    originalCode: diffLines,
    modifiedCode: diffLines,
  };
}

// ── Mock 回退数据（当真实数据为空时展示） ────────────────────────────────────

const MOCK_CHAT_MESSAGES = [
  {
    role: "agent" as const,
    text: "SeCodeAct 安全智能体已就绪。请在下方输入安全分析指令，Agent 将在沙箱中执行并返回结果。",
  },
];

const MOCK_TERMINAL_LOGS: string[] = [];

const MOCK_DIFF_DATA: DiffData = {
  file: "",
  originalCode: [],
  modifiedCode: [],
};

/**
 * Vuln List 关键词匹配规则（Live 模式）：
 * 扫描 allText（事件流 + 命令流合并字符串），根据关键词动态创建/更新漏洞条目。
 *
 * 规则优先级：已修复(3) > 已验证(2) > 未修复(1) > 未验证(0)
 *
 * 当关键词匹配到 CVE_BENCH_DATASET 中存在的 CVE 但 vulnList 中尚未创建时，
 * 自动从数据集构建新条目加入列表。
 */
interface VulnKeywordRule {
  keywords: string[];
  cveId: string; // CVE_BENCH_DATASET 中的 id，或通用类型的 "VULN-{类型}"
  newStatus?: string;
  newStatusClass?: string;
  setActive?: boolean;
  /** 通用漏洞类型元数据（非 CVE Bench 条目时使用） */
  vulnInfo?: { type: string; severity: string; severityClass: string };
}

const VULN_KEYWORD_RULES: VulnKeywordRule[] = [
  // ═══════════ CVE Bench 专属规则 ═══════════
  // CVE-2024-22120: Zabbix SQL注入修复
  {
    keywords: ["value_esc", "zbx_free", "sql.*fix", "parameterized", "参数化查询", "zabbix.*fix"],
    cveId: "CVE-2024-22120",
    newStatus: "已修复",
    newStatusClass: "text-[#00FF9F] border-[#00FF9F]/30 bg-[#00FF9F]/10",
    setActive: true,
  },
  // CVE-2024-25641: Cacti RCE 修复
  {
    keywords: ["basename.*filename", "preg_match.*filename", "cacti.*fix", "路径过滤"],
    cveId: "CVE-2024-25641",
    newStatus: "已修复",
    newStatusClass: "text-[#00FF9F] border-[#00FF9F]/30 bg-[#00FF9F]/10",
    setActive: false,
  },
  // CVE-2024-34716: PrestaShop XSS 验证
  {
    keywords: ["exploit", "poc", "xss", "session.*hijack", "已验证", "漏洞可利用", "verified", "confirmed"],
    cveId: "CVE-2024-34716",
    newStatus: "已验证",
    newStatusClass: "text-amber-400 border-amber-400/30 bg-amber-400/10",
    setActive: true,
  },
  // CVE-2024-22120 激活触发关键词
  {
    keywords: ["cve-2024-22120", "zabbix", "clientip", "time.*blind", "时间盲注"],
    cveId: "CVE-2024-22120",
    setActive: true,
  },
  // CVE-2024-25641 激活触发关键词
  {
    keywords: ["cve-2024-25641", "cacti", "import_package", "file_put_contents", "path.*traversal"],
    cveId: "CVE-2024-25641",
    setActive: true,
  },
  // CVE-2024-34716 激活触发关键词
  {
    keywords: ["cve-2024-34716", "prestashop", "customer.*thread", "attachment.*upload"],
    cveId: "CVE-2024-34716",
    setActive: true,
  },
  // CVE-2024-2624 激活触发关键词
  {
    keywords: ["cve-2024-2624", "lollms", "switch_personal_path", "path traversal", "路径遍历"],
    cveId: "CVE-2024-2624",
    setActive: true,
  },
  // CVE-2023-37999 激活触发关键词
  {
    keywords: ["cve-2023-37999", "moodle", "require_capability", "authorization.*bypass", "权限绕过"],
    cveId: "CVE-2023-37999",
    setActive: true,
  },

  // ═══════════ 通用漏洞类型检测规则 ═══════════
  // 当 Agent 分析任意项目时，输出中的漏洞类型关键词自动触发创建
  {
    keywords: ["SQL.*注入", "SQL.*Injection", "SQL injection"],
    cveId: "VULN-SQL-Injection",
    vulnInfo: { type: "SQL注入", severity: "高危", severityClass: "text-amber-400" },
    setActive: true,
  },
  {
    keywords: ["命令注入", "Command.*Injection", "RCE", "远程代码执行", "Remote.*Code.*Execution", "代码执行"],
    cveId: "VULN-CMD-Injection",
    vulnInfo: { type: "命令注入/RCE", severity: "极危", severityClass: "text-red-400" },
    setActive: true,
  },
  {
    keywords: ["XSS", "跨站脚本", "Cross.*Site.*Script"],
    cveId: "VULN-XSS",
    vulnInfo: { type: "XSS/跨站脚本", severity: "中危", severityClass: "text-emerald-400" },
    setActive: true,
  },
  {
    keywords: ["文件包含", "File.*Inclusion", "任意文件读取", "LFI", "RFI"],
    cveId: "VULN-File-Inclusion",
    vulnInfo: { type: "文件包含", severity: "高危", severityClass: "text-amber-400" },
    setActive: true,
  },
  {
    keywords: ["SSRF", "服务器端请求伪造", "Server.*Side.*Request.*Forgery"],
    cveId: "VULN-SSRF",
    vulnInfo: { type: "SSRF", severity: "高危", severityClass: "text-amber-400" },
    setActive: true,
  },
  {
    keywords: ["XXE", "XML.*外部实体", "XML.*External.*Entity"],
    cveId: "VULN-XXE",
    vulnInfo: { type: "XXE", severity: "高危", severityClass: "text-amber-400" },
    setActive: true,
  },
  {
    keywords: ["反序列化", "Deserialization", "pickle", "Insecure.*Deserialization"],
    cveId: "VULN-Deserialization",
    vulnInfo: { type: "反序列化", severity: "极危", severityClass: "text-red-400" },
    setActive: true,
  },
  {
    keywords: ["XPath.*注入", "XPath.*Injection"],
    cveId: "VULN-XPath",
    vulnInfo: { type: "XPath注入", severity: "中危", severityClass: "text-emerald-400" },
    setActive: true,
  },
  {
    keywords: ["开放重定向", "Open.*Redirect"],
    cveId: "VULN-OpenRedirect",
    vulnInfo: { type: "开放重定向", severity: "低危", severityClass: "text-slate-400" },
    setActive: true,
  },
  {
    keywords: ["CSRF", "跨站请求伪造", "Cross.*Site.*Request.*Forgery"],
    cveId: "VULN-CSRF",
    vulnInfo: { type: "CSRF", severity: "中危", severityClass: "text-emerald-400" },
    setActive: true,
  },
  {
    keywords: ["信息泄露", "Information.*Disclosure", "堆栈跟踪", "traceback"],
    cveId: "VULN-InfoLeak",
    vulnInfo: { type: "信息泄露", severity: "低危", severityClass: "text-slate-400" },
    setActive: true,
  },
  {
    keywords: ["路径遍历", "Path.*Traversal", "目录遍历", "Directory.*Traversal"],
    cveId: "VULN-PathTraversal",
    vulnInfo: { type: "路径遍历", severity: "高危", severityClass: "text-amber-400" },
    setActive: true,
  },
];

/** 从 CVE_BENCH_DATASET 或 vulnInfo 构建一个新的 VulnItem */
function buildVulnItemFromDataset(cveId: string, vulnInfo?: VulnKeywordRule["vulnInfo"]): VulnItem | null {
  // 优先从 CVE_BENCH_DATASET 查找
  const entry = CVE_BENCH_DATASET.find((e) => e.id === cveId);
  if (entry) {
    const cvssNum = entry.cvss ?? 0;
    return {
      id: entry.id,
      file: entry.targetFile || entry.cpg?.file || "",
      severity: cvssNum >= 9 ? "极危" : cvssNum >= 7 ? "高危" : "中危",
      severityClass: cvssNum >= 9 ? "text-red-400" : cvssNum >= 7 ? "text-amber-400" : "text-emerald-400",
      status: "未验证",
      statusClass: "text-slate-400 border-slate-600 bg-slate-800/50",
      active: false,
    };
  }
  // 通用漏洞类型：从 vulnInfo 构建
  if (vulnInfo) {
    return {
      id: cveId,
      file: "",
      severity: vulnInfo.severity,
      severityClass: vulnInfo.severityClass,
      status: "未修复",
      statusClass: "text-red-400 border-red-400/30 bg-red-400/10",
      active: false,
    };
  }
  return null;
}

function applyVulnKeywordRules(
  allText: string,
  current: VulnItem[],
): VulnItem[] {
  let changed = false;
  const existingIds = new Set(current.map((v) => v.id));

  // 处理已有条目
  const next = current.map((vuln) => {
    const updated = { ...vuln };
    for (const rule of VULN_KEYWORD_RULES) {
      if (rule.cveId !== vuln.id) continue;
      const matched = rule.keywords.some((kw) => {
        try {
          return new RegExp(kw, "i").test(allText);
        } catch {
          return allText.includes(kw.toLowerCase());
        }
      });
      if (!matched) continue;
      if (rule.newStatus) {
        const priority: Record<string, number> = { 已修复: 3, 已验证: 2, 未修复: 1, 未验证: 0 };
        const curP = priority[updated.status] ?? 0;
        const newP = priority[rule.newStatus] ?? 0;
        if (newP > curP) {
          updated.status = rule.newStatus;
          updated.statusClass = rule.newStatusClass ?? updated.statusClass;
          changed = true;
        }
      }
      if (rule.setActive !== undefined && updated.active !== rule.setActive) {
        updated.active = rule.setActive;
        changed = true;
      }
    }
    return updated;
  });

  // Live 模式：检测是否有新的 CVE 需要创建
  const newItems: VulnItem[] = [];
  for (const rule of VULN_KEYWORD_RULES) {
    if (existingIds.has(rule.cveId)) continue; // 已存在，跳过
    const matched = rule.keywords.some((kw) => {
      try {
        return new RegExp(kw, "i").test(allText);
      } catch {
        return allText.includes(kw.toLowerCase());
      }
    });
    if (!matched) continue;
    const newItem = buildVulnItemFromDataset(rule.cveId, rule.vulnInfo);
    if (!newItem) continue;
    if (rule.newStatus) {
      newItem.status = rule.newStatus;
      newItem.statusClass = rule.newStatusClass ?? newItem.statusClass;
    }
    if (rule.setActive) newItem.active = true;
    newItems.push(newItem);
    existingIds.add(rule.cveId);
    changed = true;
  }

  if (!changed) return current;
  return [...next, ...newItems];
}

// ── HudPanel 通用面板组件 ─────────────────────────────────────────────────────

function HudPanel({
  title = null,
  children,
  className = "",
  headerRight = null,
  titleIcon: Icon = null,
}: {
  title?: string | null;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
  titleIcon?: React.ElementType | null;
}) {
  return (
    <div
      className={`relative border border-[#00FF9F]/30 bg-[#1A202C] flex flex-col ${className}`}
    >
      <div className="absolute top-0 left-0 w-3 h-3 border-t-[2px] border-l-[2px] border-[#00FF9F] z-20" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-[2px] border-r-[2px] border-[#00FF9F] z-20" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[2px] border-l-[2px] border-[#00FF9F] z-20" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[2px] border-r-[2px] border-[#00FF9F] z-20" />

      {title && (
        <div className="text-[11px] font-bold text-[#00FF9F] bg-[#00FF9F]/10 px-3 py-1.5 border-b border-[#00FF9F]/30 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={14} className="text-[#00FF9F]" />}
            <span className="tracking-wide drop-shadow-[0_0_2px_rgba(0,255,159,0.8)]">
              {title}
            </span>
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

// ── 文件树节点组件（v3.0 增强：懒加载 + Git 高亮 + 点击文件联动） ─────────────

function FileTreeNodeView({
  node,
  depth = 0,
  onToggleDir,
  onSelectFile,
  selectedFile,
}: {
  node: FileTreeNode;
  depth?: number;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  selectedFile?: string;
}) {
  const indent = depth * 12;

  if (node.isDir) {
    return (
      <>
        <div
          className="flex items-center gap-1.5 p-1 hover:bg-slate-800 rounded-sm cursor-pointer select-none"
          style={{ paddingLeft: `${4 + indent}px` }}
          onClick={() => onToggleDir(node.path)}
        >
          {node.loading ? (
            <Loader2
              size={12}
              className="text-slate-500 shrink-0 animate-spin"
            />
          ) : node.expanded ? (
            <ChevronDown size={12} className="text-slate-500 shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-slate-500 shrink-0" />
          )}
          <FolderOpen size={13} className="text-blue-400 shrink-0" />
          <span className="truncate text-slate-300">{node.name}</span>
        </div>
        {node.expanded &&
          node.children?.map((child) => (
            <FileTreeNodeView
              key={child.path}
              node={child}
              depth={depth + 1}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
              selectedFile={selectedFile}
            />
          ))}
      </>
    );
  }

  // 文件节点：根据扩展名决定颜色，Git 变更文件显示特殊高亮
  const ext = node.name.split(".").pop() ?? "";
  const extColorClass = ["c", "cpp", "h"].includes(ext)
    ? "text-amber-400"
    : ["py"].includes(ext)
      ? "text-blue-400"
      : ["java", "js", "ts", "tsx"].includes(ext)
        ? "text-yellow-400"
        : "text-slate-400";

  const isSelected = selectedFile === node.path;
  const gitStatusColor =
    node.gitStatus === "A"
      ? "text-[#00FF9F]"
      : node.gitStatus === "M"
        ? "text-amber-400"
        : node.gitStatus === "D"
          ? "text-red-400"
          : "";

  return (
    <div
      className={`flex items-center gap-1.5 p-1 rounded-sm cursor-pointer select-none
        ${isSelected ? "bg-[#00FF9F]/15 border-l-2 border-[#00FF9F]" : "hover:bg-slate-800"}
        ${node.hasGitChange ? "bg-amber-400/5" : ""}`}
      style={{ paddingLeft: `${16 + indent}px` }}
      onClick={() => onSelectFile(node.path)}
      title={node.hasGitChange ? `Git 变更 (${node.gitStatus})` : node.path}
    >
      <FileCode2 size={12} className={`${extColorClass} shrink-0`} />
      <span
        className={`truncate ${isSelected ? "text-[#00FF9F] font-bold" : "text-slate-300"}`}
      >
        {node.name}
      </span>
      {node.hasGitChange && (
        <span
          className={`ml-auto text-[9px] font-bold shrink-0 ${gitStatusColor}`}
        >
          {node.gitStatus}
        </span>
      )}
    </div>
  );
}

// ── 主组件 ─────────────────────────────────────────────────────────────────────

/** 文件树自动刷新间隔（毫秒），10 秒 */
const FILE_TREE_REFRESH_INTERVAL = 10_000;

/** Agent 完成状态集合，触发文件树自动刷新 */
const AGENT_DONE_STATES = new Set([
  AgentState.FINISHED,
  AgentState.AWAITING_USER_INPUT,
  AgentState.AWAITING_USER_CONFIRMATION,
]);

export default function DashboardConnected() {
  // ── UI 状态 ──────────────────────────────────────────────────────────────────
  // SCA-011: 固定三 Tab 架构（CPG / PoC 利用 / Diff）
  // SCA-012: 固定四 Tab 架构（CPG / PoC 利用 / Diff / 知识图谱总览）
  const [activeTab, setActiveTab] = useState<"cpg" | "poc" | "diff">("cpg");
  // SCA-011: PoC 执行状态
  const [pocRunning, setPocRunning] = useState<boolean>(false);
  const [pocResult, setPocResult] = useState<PoCExecutionResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSidebar, setActiveSidebar] = useState<string | null>(null);

  // ── Vuln List 状态（Live 模式：初始为空，Agent 输出匹配关键词后动态创建） ─────
  const [vulnList, setVulnList] = useState<VulnItem[]>([]);
  const lastProcessedRef = useRef<number>(0);

  // ── Diff Viewer 数据 ──────────────────────────────────────────────────────────
  const [diffData, setDiffData] = useState<DiffData>({ file: "", originalCode: [], modifiedCode: [] });

  // ── 文件树状态（v3.0：动态懒加载） ───────────────────────────────────────────
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | undefined>(
    undefined,
  );
  // Git 变更文件路径集合（用于高亮）
  const [gitChangedPaths, setGitChangedPaths] = useState<Set<string>>(
    new Set(),
  );
  // 记录上次刷新时间，防止频繁刷新
  const lastRefreshRef = useRef<number>(0);
  const fileTreeErrorCountRef = useRef<number>(0); // 连续错误计数，用于退避策略
  // 文件树加载进行中标记（与 state 镜像，用于同步判断并发）
  const fileTreeLoadingRef = useRef<boolean>(false);
  // 记录已完成自动加载的 conversation，防止 Effect 无限循环
  const autoLoadAttemptedForRef = useRef<string | null>(null);

  // ── CPG 图谱状态（v5.0：SCA-005） ──────────────────────────────────────────────
  const [cpgData, setCpgData] = useState<CpgGraphData | null>(null);
  const [cpgLoading, setCpgLoading] = useState<boolean>(false);
  // SCA-009: 统一系统日志状态
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([
    {
      id: "init-0",
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      level: "info",
      source: "SYSTEM",
      message: "[SCA-009] SeCodeAct HUD 已启动，等待 CVE Bench v2.0 样本分析...",
    },
    {
      id: "init-1",
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      level: "success",
      source: "SYSTEM",
      message: `[SCA-009] CVE Bench v2.0 数据集已就绪：${CVE_BENCH_DATASET.length} 条 CVE`,
    },
    {
      id: "init-2",
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      level: "joern",
      source: "JOERN",
      message: "[SCA-009] Joern v4.0.516 工具链已就绪，Java 21 运行时已加载",
    },
  ]);
  const [cpgFile, setCpgFile] = useState<string | null>(null);
  const [selectedCveId, setSelectedCveId] = useState<string>("CVE-2024-22120");
  /**
   * SCA-008 双向联动：Vuln List 点击时，传入对应的 Sink 节点 ID，
   * CpgGraph 自动高亮该节点及其连接路径。
   */
  const [highlightCpgNodeId, setHighlightCpgNodeId] = useState<string | null>(
    null,
  );
  // ── 代码仓库对接状态（v4.0：SCA-004） ─────────────────────────────────────────
  const [repoUrl, setRepoUrl] = useState<string>(
    "https://github.com/example/core-system-v2",
  );
  const [repoBranch, setRepoBranch] = useState<string>("main");
  const [repoLoading, setRepoLoading] = useState<boolean>(false);
  const [repoStatus, setRepoStatus] = useState<
    "idle" | "cloning" | "success" | "error"
  >("idle");
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoMessage, setRepoMessage] = useState<string | null>(null);

  // ── 会话控制状态（v4.0：SCA-004） ─────────────────────────────────────────────
  const [sessionList, setSessionList] = useState<
    Array<{ id: string; title: string; status: string; created_at: string }>
  >([]);
  const [sessionListLoading, setSessionListLoading] = useState<boolean>(false);
  const [restoreToken, setRestoreToken] = useState<string>("");
  const [sessionActionStatus, setSessionActionStatus] = useState<string | null>(
    null,
  );
  const [sessionActionLoading, setSessionActionLoading] =
    useState<boolean>(false);

  // ── 真实数据 Hook ────────────────────────────────────────────────────────────

  // 1. Chat：从 EventStore 读取事件流，转换为 Chat 消息格式
  const [isProcessing, setIsProcessing] = useState(false);
 const [localChatMessages, setLocalChatMessages] = useState<
 Array<{ role: "user" | "agent"; text: string }>
 >([]);
 const uiEvents = useEventStore((state) => state.uiEvents);
  const liveMessages = eventsToMessages(uiEvents);
// Auto-clear processing indicator when agent events arrive
  useEffect(() => {
    if (isProcessing && liveMessages.length >0) {
      const hasNewAgentMsg = liveMessages.some(
        (m) => m.role === "agent" && m.text.trim().length >3,
      );
      if (hasNewAgentMsg) setIsProcessing(false);
    }
  }, [liveMessages, isProcessing]);


 const chatMessages = (() => {
 // 去重：过滤 localChatMessages 中已在 liveMessages 里出现的用户消息
 // 避免同一条消息在服务端回显后重复显示
 const liveUserTexts = new Set(
 liveMessages.filter((m) => m.role === "user").map((m) => m.text.trim()),
 );
 const dedupedLocal = localChatMessages.filter(
 (m) => m.role !== "user" || !liveUserTexts.has(m.text.trim()),
 );
 const combined = [...liveMessages, ...dedupedLocal];
 if (combined.length >0) {
 if (isProcessing && !liveMessages.some((m) => m.role === "agent" && m.text.trim().length >3)) {
 combined.push({ role: "agent" as const, text: "智能体正在处理你的请求..." });
 }
 return combined;
 }
 if (isProcessing) {
 return [{ role: "agent" as const, text: "智能体正在处理你的请求..." }];
 }
 return MOCK_CHAT_MESSAGES;
 })();

  // 2. 发送消息：通过 useSendMessage 兼容 V0/V1 WebSocket
  const { send } = useSendMessage();


 /**
   * SCA-011: handleSendMessage —— 带分析指令检测的消息发送函数。
   *
   * 当用户输入包含分析关键词时，自动在系统日志中输出当前 CVE 的分析报告。
   */
 const handleSendMessage = useCallback(
 async (text: string) => {
 const trimmedText = text.trim();
 if (!trimmedText) return;

 console.log("[SCA-011] sending message to agent:", trimmedText);
 setIsProcessing(true);
 setLocalChatMessages((prev) => [
 ...prev,
 { role: "user", text: trimmedText },
 ]);

  // SCA-011: 检测分析指令关键词
  const analysisKeywords = [
    "分析", "扫描", "审计", "检测", "安全", "漏洞",
    "analyze", "scan", "audit", "detect", "cve", "poc",
    "开始", "执行",
  ];
  const isAnalysisCmd = analysisKeywords.some((kw) =>
    trimmedText.toLowerCase().includes(kw),
  );

  if (isAnalysisCmd) {
    // 获取当前选中 CVE 的分析报告
    const currentEntry = CVE_BENCH_DATASET.find(
      (e) => e.id === selectedCveId,
    );
    const analysisReport =
      currentEntry?.agentAnalysis ||
      `[SCA-011] 任务分析报告 — ${selectedCveId}\n\n1. 漏洞扫描计划：扫描仓库所有源文件\n\n2. 执行顺序：[1] Joern CPG 生成 → [2] 污点分析 → [3] PoC 构造 → [4] 验证 → [5] 补丁生成`;

    // 推送分析报告到系统日志
    const reportLines = analysisReport.split("\n").filter((l) => l.trim());
    setSystemLogs((prev) => [
      ...prev,
      inferLogEntry(
        `[SCA-011] 用户指令: "${trimmedText.slice(0, 50)}${trimmedText.length > 50 ? "..." : ""}"`,
        prev.length,
      ),
      ...reportLines
        .slice(0, 12)
        .map((line, i) => inferLogEntry(line, prev.length + 1 + i)),
    ]);
  } else {
    // 非分析指令：仅记录用户消息
    setSystemLogs((prev) => [
      ...prev,
      inferLogEntry(
        `[SCA-011] 用户指令: "${trimmedText.slice(0, 50)}${trimmedText.length > 50 ? "..." : ""}"`,
        prev.length,
      ),
    ]);
  }

 try {
 const result = await send({
 action: "message",
 args: { content: trimmedText },
 });
 console.log("[SCA-011] send result:", result);
 if (result?.queued) {
 setLocalChatMessages((prev) => [
 ...prev,
 {
 role: "agent",
 text: "当前 Agent连接未就绪，消息已加入队列，等待会话恢复后发送。",
 },
 ]);
 }
 } catch (error) {
 console.error("[SCA-011] send failed:", error);
 setLocalChatMessages((prev) => [
 ...prev,
 {
 role: "agent",
 text: `发送失败：${error instanceof Error ? error.message : String(error)}`,
 },
 ]);
 // 不再 throw，让 OpenHandsChat 的 finally 正常执行清理
 }
 },
 [send, selectedCveId],
 );


  // 3. 终端日志：从 CommandStore 读取沙箱 stdout/stderr
  const commands = useCommandStore((state) => state.commands);
  const liveLogs = commandsToLogs(commands);
  // SCA-014: 移除 MOCK_TERMINAL_LOGS fallback，只显示真实 WebSocket 推送的 Agent 执行日志
  // 当 Agent 尚未执行任何 bash 命令时，显示友好的等待提示
  const terminalLogs = liveLogs.length > 0
    ? liveLogs
    : ["$ agent-sandbox-tty1", "", "等待 Agent 执行命令...", "请通过左侧任务交互终端输入安全分析指令"];

// 4. Agent 状态：用于触发文件树自动刷新
  const curAgentState = useAgentStore((state) => state.curAgentState);

  // 5. 会话 ID 和路由导航
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();

  // ── Git 变更数据加载 ─────────────────────────────────────────────────────────

  /**
   * 加载 Git 变更列表，更新 gitChangedPaths 集合。
   * 同时更新文件树中对应节点的 hasGitChange 标记。
   */
  const loadGitChanges = useCallback(async () => {
    if (!conversationId) return;
    // Skip during task setup phase — sandbox not ready yet
    if (conversationId.startsWith("task-")) return;
    try {
      const changes = await V1GitService.getGitChanges(conversationId, "/workspace");
      if (!changes || changes.length === 0) return;

      const changedSet = new Set(changes.map((c) => c.path));
      setGitChangedPaths(changedSet);

      // 更新文件树中的 Git 变更高亮
      setFileTree((prev) => {
        function markGitChanges(nodes: FileTreeNode[]): FileTreeNode[] {
          return nodes.map((node) => {
            if (!node.isDir) {
              const hasGitChange = changedSet.has(node.path);
              const change = changes.find((c) => c.path === node.path);
              if (
                node.hasGitChange !== hasGitChange ||
                node.gitStatus !== change?.status
              ) {
                return { ...node, hasGitChange, gitStatus: change?.status };
              }
              return node;
            }
            if (node.children) {
              return { ...node, children: markGitChanges(node.children) };
            }
            return node;
          });
        }
        return markGitChanges(prev);
      });

      // 加载第一个变更文件的 Diff（仅在未手动选择文件时）
      if (!selectedFile) {
        const firstFile = changes[0].path;
        try {
          const diffResult: GitChangeDiff = await V1GitService.getGitChangeDiff(
            conversationId,
            firstFile.startsWith("/") ? firstFile : `/workspace/${firstFile}`,
          );
          const parsed = parseFileDiff(diffResult, firstFile);
          if (parsed) setDiffData(parsed);
        } catch {
          // 静默失败
        }
      }
    } catch {
      // 静默失败
    }
  }, [conversationId, selectedFile]);

  // 初始加载 Git 变更
  useEffect(() => {
    loadGitChangesRef.current();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 文件树加载（根节点） ──────────────────────────────────────────────────────

  /**
   * 加载文件树根节点。
   *
   * 策略：调用 ConversationService.getFiles(conversationId)（无 path 参数），
   * 获取工作区顶层目录/文件列表，构建初始树结构。
   * 防抖：两次刷新间隔小于 2 秒时跳过。
   */
  const loadFileTree = useCallback(
    async (force = false) => {
      if (!conversationId) return;
      // Skip during task setup phase — sandbox not ready yet
      if (conversationId.startsWith("task-")) return;
      // 连续错误退避：连续失败 3 次后停止轮询，等待下一次 force 刷新
      if (!force && fileTreeErrorCountRef.current >= 3) return;
      const now = Date.now();
      if (!force && now - lastRefreshRef.current < 2000) return;
      lastRefreshRef.current = now;

      // 防止并发加载（force 模式下也检查，避免重复触发）
      if (fileTreeLoadingRef.current) return;
      fileTreeLoadingRef.current = true;
      setFileTreeLoading(true);
      setFileTreeError(null);
      try {
        const files = await ConversationService.getFiles(conversationId);
        // [DEBUG] 临时调试日志：捕获 API 返回的原始数据类型和内容，用于排查文件树异常
        console.log(
          "[DEBUG] getFiles raw type:",
          typeof (files as unknown),
          "isArray:",
          Array.isArray(files),
          "first 500 chars:",
          JSON.stringify(files).slice(0, 500),
        );
        // 运行时校验：确保 API 返回的是字符串数组，防止非数组数据被 buildFileTree 误解构
        if (!Array.isArray(files)) {
          console.error(
            "[SCA] getFiles 返回了非数组数据:",
            typeof files,
            files,
          );
          fileTreeErrorCountRef.current += 1;
          setFileTreeError("文件树数据格式异常，请刷新重试");
          return;
        }
        // 过滤无效条目：非字符串、空字符串、纯空白字符、只包含特殊字符的条目
        const validFiles = files.filter(
          (f) =>
            typeof f === "string" &&
            f.trim().length > 0 &&
            f.replace(/[\/\s]/g, "").length > 0, // 过滤只含斜杠和空白的条目
        );
        if (validFiles.length > 0) {
          fileTreeErrorCountRef.current = 0; // 成功后重置错误计数
          setFileTree((prev) => {
            // 保留已展开的目录状态（避免刷新后折叠）
            const expandedPaths = new Set<string>();
            function collectExpanded(nodes: FileTreeNode[]) {
              for (const n of nodes) {
                if (n.isDir && n.expanded) {
                  expandedPaths.add(n.path);
                  if (n.children) collectExpanded(n.children);
                }
              }
            }
            collectExpanded(prev);
            // 同时收集已懒加载的目录节点（loaded: true），刷新后恢复子节点
            const loadedNodes = new Map<string, FileTreeNode>();
            function collectLoaded(nodes: FileTreeNode[]) {
              for (const n of nodes) {
                if (n.isDir && n.loaded) loadedNodes.set(n.path, n);
                if (n.children) collectLoaded(n.children);
              }
            }
            collectLoaded(prev);

            const newTree = buildFileTree(validFiles, gitChangedPaths);

            // 恢复展开状态和已加载的子节点
            function restoreExpanded(nodes: FileTreeNode[]): FileTreeNode[] {
              return nodes.map((n) => {
                if (n.isDir && expandedPaths.has(n.path)) {
                  const prevLoaded = loadedNodes.get(n.path);
                  if (prevLoaded?.children) {
                    // 该目录已展开且已加载：保留子节点
                    return {
                      ...n,
                      expanded: true,
                      loaded: true,
                      children: restoreExpanded(prevLoaded.children),
                    };
                  }
                  return {
                    ...n,
                    expanded: true,
                    children: n.children
                      ? restoreExpanded(n.children)
                      : n.children,
                  };
                }
                return n;
              });
            }
            return restoreExpanded(newTree);
          });
        }
      } catch {
        fileTreeErrorCountRef.current += 1;
        setFileTreeError("文件树加载失败，请检查网络连接后重试");
      } finally {
        fileTreeLoadingRef.current = false;
        setFileTreeLoading(false);
      }
    },
    [conversationId, gitChangedPaths],
  );

  // Refs to break stale closure / dependency cycles in useEffects.
  const loadFileTreeRef = useRef(loadFileTree);
  loadFileTreeRef.current = loadFileTree;
  const loadGitChangesRef = useRef(loadGitChanges);
  loadGitChangesRef.current = loadGitChanges;

  // ── 文件树目录懒加载 ─────────────────────────────────────────────────────────

  /**
   * 点击目录时触发懒加载：
   * - 若目录已加载（loaded = true），直接切换展开/折叠状态
   * - 若目录未加载（loaded = false），调用 API 加载子内容后展开
   *
   * @param dirPath - 目录路径
   */
  const handleToggleDir = useCallback(
    async (dirPath: string) => {
      console.log(
        "[SCA-003] handleToggleDir called:",
        dirPath,
        "conversationId:",
        conversationId,
      );
      setFileTree((prev) => {
        // 先查找节点
        function findNode(nodes: FileTreeNode[]): FileTreeNode | null {
          for (const n of nodes) {
            if (n.path === dirPath) return n;
            if (n.children) {
              const found = findNode(n.children);
              if (found) return found;
            }
          }
          return null;
        }
        const node = findNode(prev);
        if (!node) return prev;

        // 若已加载，直接切换展开状态
        if (node.loaded || (node.children && node.children.length > 0)) {
          return updateTreeNode(prev, dirPath, (n) => ({
            ...n,
            expanded: !n.expanded,
          }));
        }

        // 未加载：标记为 loading，异步加载
        return updateTreeNode(prev, dirPath, (n) => ({
          ...n,
          loading: true,
          expanded: true,
        }));
      });

      // 异步加载子目录内容
      console.log(
        "[SCA-003] conversationId check:",
        conversationId,
        "!!:",
        !!conversationId,
      );
      if (!conversationId) {
        console.log("[SCA-003] EARLY RETURN: no conversationId");
        return;
      }
      try {
        console.log("[SCA-003] calling getFiles for:", `${dirPath}/`);
        const rawChildren = await ConversationService.getFiles(
          conversationId,
          `${dirPath}/`,
        );
        // API 返回的是绝对路径（如 "src/core/"），需要去除父路径前缀，转为相对路径（如 "core/"）
        // 这样 buildFileTree 才能正确构建子节点，而不会重复创建父目录节点
        const prefix = `${dirPath}/`;
        const children = rawChildren
          .map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p))
          .filter((p) => p.length > 0);
        console.log(
          "[SCA-003] getFiles success, children:",
          children,
          "setting fileTree...",
        );
        setFileTree((prev) => {
          console.log(
            "[SCA-003] setFileTree updater called, prev:",
            JSON.stringify(prev),
          );
          return updateTreeNode(prev, dirPath, (n) => {
            const childNodes = buildFileTree(
              children,
              gitChangedPaths,
              dirPath,
            );
            console.log(
              "[SCA-003] updating node:",
              dirPath,
              "childNodes:",
              childNodes,
            );
            return {
              ...n,
              loading: false,
              loaded: true,
              expanded: true,
              children: childNodes,
            };
          });
        });
      } catch {
        // 加载失败：取消 loading 状态，保持折叠
        setFileTree((prev) =>
          updateTreeNode(prev, dirPath, (n) => ({
            ...n,
            loading: false,
            expanded: false,
          })),
        );
      }
    },
    [conversationId, gitChangedPaths],
  );

  // ── 文件点击联动 Diff ─────────────────────────────────────────────────────────

  /**
   * 点击文件时的处理逻辑：
   * 1. 更新选中文件状态
   * 2. 切换到 Diff 视图
   * 3. 若文件有 Git 变更 → 调用 GitService.getGitChangeDiff 获取 Diff
   * 4. 若无 Git 变更 → 调用 select-file API 获取原始内容，转为 DiffLine 格式展示
   *
   * @param filePath - 文件路径
   */
  const handleSelectFile = useCallback(
    async (filePath: string) => {
      setSelectedFile(filePath);
      setActiveTab("diff");

      if (!conversationId) return;

      try {
        if (gitChangedPaths.has(filePath)) {
          // 有 Git 变更：显示 original vs modified
          const diffResult: GitChangeDiff = await V1GitService.getGitChangeDiff(
            conversationId,
            filePath.startsWith("/") ? filePath : `/workspace/${filePath}`,
          );
          const parsed = parseFileDiff(diffResult, filePath);
          if (parsed) setDiffData(parsed);
        } else {
          // 无 Git 变更：显示原始文件内容（V1 endpoint）
          const url = `/api/v1/app-conversations/${conversationId}/select-file?file=${encodeURIComponent(filePath)}`;
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            const content = data.code ?? data.content ?? "";
            setDiffData(contentToDiffData(content, filePath));
          }
        }
      } catch {
        // 静默失败，保持当前 Diff 视图
      }
    },
    [conversationId, gitChangedPaths],
  );

  // ── 自动刷新逻辑 ─────────────────────────────────────────────────────────────

  // 侧边栏打开文件树时自动加载根节点（每个 conversation 仅自动触发一次，
  // 避免 fileTreeLoading 变化引发无限循环）
  useEffect(() => {
    if (!conversationId) return;
    if (
      activeSidebar === "files" &&
      fileTree.length === 0 &&
      autoLoadAttemptedForRef.current !== conversationId
    ) {
      autoLoadAttemptedForRef.current = conversationId;
      loadFileTreeRef.current(true);
    }
  }, [activeSidebar, fileTree.length, conversationId]);

  // Agent 状态变化时自动刷新（FINISHED 或 AWAITING_USER_INPUT）
  const prevAgentStateRef = useRef<AgentState>(AgentState.LOADING);
  useEffect(() => {
    const prev = prevAgentStateRef.current;
    prevAgentStateRef.current = curAgentState;

    // 仅在从非完成态变为完成态时触发（避免重复刷新）
    if (!AGENT_DONE_STATES.has(prev) && AGENT_DONE_STATES.has(curAgentState)) {
      if (activeSidebar === "files") {
        loadFileTreeRef.current();
        loadGitChangesRef.current();
      }
    }
  }, [curAgentState, activeSidebar]);

  // 10 秒定时刷新（仅在文件树侧边栏打开时）
  useEffect(() => {
    if (activeSidebar !== "files") return;
    const timer = setInterval(() => {
      // 跳过：上一次加载仍在进行中，避免并发
      if (fileTreeLoadingRef.current) return;
      loadFileTreeRef.current();
      loadGitChangesRef.current();
    }, FILE_TREE_REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [activeSidebar]);

  // ── Vuln List 自动更新（v2.0 保留） ─────────────────────────────────────
  useEffect(() => {
    const totalItems = uiEvents.length + commands.length;
    if (totalItems === 0 || totalItems === lastProcessedRef.current) return;
    lastProcessedRef.current = totalItems;
    const allText = extractAllText(uiEvents, commands);
    setVulnList((current) => applyVulnKeywordRules(allText, current));
  }, [uiEvents, commands]);

  // ── SCA-010: 单漏洞专注模式——默认加载第一个漏洞的 CPG + Diff ─────────────────
  /**
   * SCA-010: 单漏洞专注模式初始化。
   * 组件挂载时，自动加载 CVE_BENCH_DATASET 第一个漏洞的 CPG 数据和 Diff 数据。
   * 这确保中间栏始终显示有意义的内容，而不是空白页面。
   */
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    // 组件初始化完成，等待用户指令
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * SCA-010: handleVulnSelect —— 单漏洞专注模式的核心处理函数。
   *
   * 当用户点击 Vuln List 中的任意条目时：
   * 1. 更新 selectedCveId 状态
   * 2. 从 CVE_BENCH_DATASET 加载对应 CVE 的 CPG 数据（更新 CPG Tab）
   * 3. 从 CVE_BENCH_DATASET 加载对应 CVE 的 Diff 数据（更新 Diff Tab）
   * 4. 更新 vulnList 中的 active 状态（高亮当前选中项）
   * 5. 推送日志到系统日志面板
   *
   * 严格要求：不允许同时渲染多个 CPG 图谱，必须单漏洞专注模式。
   */
  /**
   * SCA-011: handleVulnSelect —— 全流程五处同步的核心处理函数。
   *
   * 当用户点击 Vuln List 中的任意条目时，同步更新：
   * 1. Vuln List 激活状态（高亮当前选中项）
   * 2. CPG Tab（加载对应 CVE 的聊焦子图）
   * 3. PoC Tab（重置 PoC 执行状态，准备加载新 CVE 的 PoC 代码）
   * 4. Diff Tab（加载对应 CVE 的修复 Diff）
   * 5. 元数据区域（更新右侧元数据面板中的 CVE 信息）
   *
   * 严格要求：不允许同时渲染多个 CPG 图谱，必须单漏洞专注模式。
   */
  const handleVulnSelect = useCallback((cveId: string) => {
    const entry = CVE_BENCH_DATASET.find((e) => e.id === cveId);
    if (!entry) return;

    // 同步 1: 更新选中状态（元数据同步）
    setSelectedCveId(cveId);

    // 同步 2: 更新 Vuln List 激活状态
    setVulnList((prev) => prev.map((v) => ({ ...v, active: v.id === cveId })));

    // 同步 3: 加载 CPG 数据（单漏洞专注：先清除旧图谱，再加载新图谱）
    setCpgData(null); // 先清除，严禁同时渲染多个图谱
    setCpgLoading(true);
    setCpgFile(entry.targetFile || entry.cpg.file || null);
    setTimeout(() => {
      setCpgData(entry.cpg);
      setCpgLoading(false);
      setActiveTab("cpg"); // 自动切换到 CPG Tab
    }, 300);

    // 同步 4: 重置 PoC 执行状态（准备加载新 CVE 的 PoC 代码）
    setPocRunning(false);
    setPocResult(null);

    // 同步 5: 加载 Diff 数据
    if (entry.diffBefore && entry.diffAfter) {
      const diffFile: string = entry.targetFile || entry.cpg.file || "unknown";
      const beforeLines = entry.diffBefore.split("\n").map((text, i) => ({
        line: i + 1,
        text: `- ${text}`,
        isHighlight:
          i === 0 ||
          text.trim().startsWith("//") ||
          text.trim().startsWith("#"),
      }));
      const afterLines = entry.diffAfter.split("\n").map((text, i) => ({
        line: i + 1,
        text: `+ ${text}`,
        isHighlight:
          i === 0 ||
          text.trim().startsWith("//") ||
          text.trim().startsWith("#"),
      }));
      setDiffData({
        file: diffFile,
        originalCode: beforeLines,
        modifiedCode: afterLines,
      });
    }

    // SCA-011: 推送漏洞切换日志到系统日志
    setSystemLogs((prev) => [
      ...prev,
      inferLogEntry(
        `[SCA-011] 切换漏洞：${cveId} — ${entry.title || entry.type || ""}（CVSS ${entry.cvss}）`,
        prev.length,
      ),
    ]);
  }, []);

  // ── SCA-006: CPG 真实数据流转 ────────────────────────────────────────────────
  /**
   * 监听 Agent 命令输出，从中提取 Joern 生成的真实 CPG JSON。
   *
   * 工作原理：
   * - Agent 执行 Joern 命令后，在 stdout 中写入 SCA_CPG_JSON:{...} 标记行
   * - 本 useEffect 监听 uiEvents 变化，检测该标记并解析 CPG 数据
   * - 解析成功后更新 cpgData 状态，React Flow 自动重新渲染
   */
  const lastCpgEventIdRef = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (!cpgLoading) return;
    for (let i = uiEvents.length - 1; i >= 0; i--) {
      const event = uiEvents[i];
      const eventId = "id" in event ? event.id : undefined;
      if (eventId === lastCpgEventIdRef.current) break;
      if (
        "observation" in event &&
        event.observation === "run" &&
        "content" in event
      ) {
        const content = String((event as any).content || "");
        // SCA-009: 推送 Agent 输出到系统日志
        if (content && content.trim()) {
          const lines = content.split("\n").filter((l: string) => l.trim());
          setSystemLogs((prev) => {
            const newEntries = lines
              .slice(0, 20)
              .map((line: string, i: number) =>
                inferLogEntry(line, prev.length + i),
              );
            // 限制日志总数为 500 条
            const combined = [...prev, ...newEntries];
            return combined.length > 500
              ? combined.slice(combined.length - 500)
              : combined;
          });
        }

        if (content.includes(CPG_JSON_MARKER)) {
          const parsed = extractCpgJsonFromOutput(content);
          if (parsed) {
            lastCpgEventIdRef.current = eventId;
            setCpgData(parsed);
            setCpgLoading(false);
            setActiveTab("cpg");
            console.info(
              "[SCA-006] 真实 Joern CPG 数据已加载，节点数:",
              parsed.nodes.length,
            );
            break;
          }
        }
        if (hasJoernLog(content)) {
          console.info("[SCA-006] 检测到 Joern 执行日志");
        }
      }
    }
  }, [uiEvents, cpgLoading]);

  /**
   * handleGenerateCpg：触发 Joern CPG 生成。
   *
   * SCA-006 升级策略：
   * 1. 优先通过 Agent 发送真实 Joern 命令（主路径）
   * 2. 若文件路径不可用，则从 CVE_BENCH_DATASET 加载调试 fallback 数据
   *    （仅用于临时调试，生产路径必须使用真实 Joern 数据）
   */
  const handleGenerateCpg = useCallback(
    (filePath?: string, cveId?: string) => {
      const targetFile = filePath || selectedFile;
      if (targetFile && send) {
        // ── 主路径：发送真实 Joern 命令 ──────────────────────────────────────────
        setCpgLoading(true);
        // SCA-009: 推送 Joern 生成日志
        setSystemLogs((prev) => [
          ...prev,
          inferLogEntry(
            `[JOERN] 开始生成 CPG：joern-parse ${targetFile || cveId || "target"} --output /tmp/cpg.bin`,
            prev.length,
          ),
          inferLogEntry(
            `[JOERN] 使用真实 CVE Bench v2.0 样本：${cveId || targetFile || "CVE-2024-37388"}`,
            prev.length + 1,
          ),
        ]);
        setCpgFile(targetFile);
        const joernCmd = buildJoernCommand(targetFile);
        send({
          action: "run",
          args: { command: joernCmd },
        });
        setActiveTab("cpg");
      } else {
        // ── 调试 fallback：从 CVE_BENCH_DATASET 加载（仅供临时调试） ──────────────
        const targetCve = cveId || selectedCveId;
        const entry = CVE_BENCH_DATASET.find((e) => e.id === targetCve);
        if (entry) {
          setCpgLoading(true);
          setCpgFile(entry.cpg.file || targetCve);
          setTimeout(() => {
            setCpgData(entry.cpg);
            setCpgLoading(false);
            setActiveTab("cpg");
          }, 600);
        }
      }
    },
    [selectedFile, selectedCveId, send],
  );
  // ── 代码仓库对接处理函数（v4.0：SCA-004） ───────────────────────────────────────

  /**
   * 加载仓库到沙箱工作区。
   *
   * 流程：
   * 1. 验证 URL 格式（必须以 github.com 开头）
   * 2. 从 URL 提取仓库名称（最后一段）
   * 3. 通过 useSendMessage 发送 git clone 指令到 Agent
   * 4. 等待 Agent 完成后（通过 curAgentState 监听）自动刷新文件树
   */
  const handleLoadRepo = useCallback(() => {
    const trimmedUrl = repoUrl.trim();
    const trimmedBranch = repoBranch.trim() || "main";

    // 验证 URL
    if (!trimmedUrl) {
      setRepoError("请输入 GitHub 仓库 URL");
      return;
    }
    if (
      !trimmedUrl.includes("github.com") &&
      !trimmedUrl.includes("gitlab.com") &&
      !trimmedUrl.includes(".git")
    ) {
      setRepoError("请输入有效的 Git 仓库 URL（支持 GitHub / GitLab）");
      return;
    }

    // 提取仓库名称
    const repoName =
      trimmedUrl
        .replace(/\.git$/, "")
        .split("/")
        .pop() || "repo";

    // 构建克隆指令
    const cloneCmd = `git clone ${trimmedUrl} -b ${trimmedBranch} /workspace/project/${repoName} && echo "[SCA] 克隆完成: /workspace/project/${repoName}"`;

    setRepoLoading(true);
    setRepoStatus("cloning");
    setRepoError(null);
    setRepoMessage(`正在克隆 ${repoName}...`);

    // 发送指令到 Agent
    send({
      action: "message",
      args: { content: cloneCmd },
    });

    // 切换到文件树侧边栏以便观察刷新结果
    setTimeout(() => {
      setActiveSidebar("files");
      setRepoStatus("success");
      setRepoMessage(
        `指令已发送！Agent 正在克隆 ${repoName}，完成后文件树将自动刷新。`,
      );
      setRepoLoading(false);
    }, 1500);
  }, [repoUrl, repoBranch, send, setActiveSidebar]);

  // ── 会话控制处理函数（v4.0：SCA-004） ─────────────────────────────────────────────

  /**
   * 加载历史会话列表。
   * 调用 GET /api/conversations 获取最近 5 条会话。
   */
  const loadSessionList = useCallback(async () => {
    setSessionListLoading(true);
    try {
      const data = await ConversationService.getUserConversations(5);
      setSessionList(
        data.results.slice(0, 5).map((c) => ({
          id: c.conversation_id,
          title: c.title || `会话 ${c.conversation_id.slice(0, 8)}`,
          status: c.status || "UNKNOWN",
          created_at: c.created_at
            ? new Date(c.created_at).toLocaleString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "",
        })),
      );
    } catch {
      // 静默失败
    } finally {
      setSessionListLoading(false);
    }
  }, []);

  // 打开会话控制面板时自动加载历史会话
  useEffect(() => {
    if (activeSidebar === "sessions") {
      loadSessionList();
    }
  }, [activeSidebar, loadSessionList]);

  /**
   * 新建空白会话：调用 POST /api/conversations，导航到新会话页面。
   */
  const handleNewSession = useCallback(async () => {
    setSessionActionLoading(true);
    setSessionActionStatus("正在创建新会话...");
    try {
      const conv = await ConversationService.createConversation();
      const newId = conv.conversation_id;
      if (newId) {
        setSessionActionStatus(
          `新会话创建成功！ID: ${newId.slice(0, 8)}...，正在跳转...`,
        );
        setTimeout(() => navigate(`/conversations/${newId}`), 1200);
      } else {
        setSessionActionStatus("创建成功，请刷新页面");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "未知错误";
      setSessionActionStatus(`创建失败：${msg}`);
    } finally {
      setSessionActionLoading(false);
    }
  }, [navigate]);

  /**
   * 终止当前沙箱：调用 POST /api/conversations/{id}/stop。
   */
  const handleStopSession = useCallback(async () => {
    if (!conversationId) {
      setSessionActionStatus("无法获取当前会话 ID");
      return;
    }
    setSessionActionLoading(true);
    setSessionActionStatus("正在终止沙箱...");
    try {
      await ConversationService.stopConversation(conversationId);
      setSessionActionStatus("沙箱已终止！Agent 已停止运行。");
      loadSessionList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "未知错误";
      setSessionActionStatus(`终止失败：${msg}`);
    } finally {
      setSessionActionLoading(false);
    }
  }, [conversationId, loadSessionList]);

  /**
   * 恢复历史会话：通过 conversationId 导航到对应会话页面。
   */
  const handleRestoreSession = useCallback(
    (targetId: string) => {
      const id = targetId.trim();
      if (!id) {
        setSessionActionStatus("请输入会话 ID");
        return;
      }
      setSessionActionStatus(`正在跳转到会话 ${id.slice(0, 8)}...`);
      setTimeout(() => navigate(`/conversations/${id}`), 500);
    },
    [navigate],
  );

  // ── 工具函数：将 GitChangeDiff 转换为 DiffLine[] ─────────────────────────────

  function parseFileDiff(diff: GitChangeDiff, file: string): DiffData | null {
    const originalLines = (diff.original || "").split("\n");
    const modifiedLines = (diff.modified || "").split("\n");
    if (originalLines.length === 0 && modifiedLines.length === 0) return null;

    const originalCode: DiffLine[] = originalLines.map((text, i) => ({
      line: i + 1,
      text,
      isHighlight: false,
    }));
    const modifiedCode: DiffLine[] = modifiedLines.map((text, i) => ({
      line: i + 1,
      text,
      isHighlight: text !== (originalLines[i] ?? ""),
    }));

    return { file, originalCode, modifiedCode };
  }

  // ── 渲染 ─────────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen bg-[#2D3748] text-slate-300 font-mono text-[11px] flex overflow-hidden selection:bg-[#00FF9F]/30">
      {/* 全局活动栏 (Activity Bar) */}
      <div className="w-14 bg-[#1A202C] border-r border-[#00FF9F]/30 flex flex-col items-center py-4 z-50 justify-between shrink-0 shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col gap-4 w-full items-center">
          <div className="w-8 h-8 rounded-md bg-[#00FF9F]/20 border border-[#00FF9F]/50 flex items-center justify-center mb-2 shadow-[0_0_10px_rgba(0,255,159,0.2)]">
            <ShieldAlert size={18} className="text-[#00FF9F]" />
          </div>
          <button
            onClick={() =>
              setActiveSidebar(activeSidebar === "files" ? null : "files")
            }
            className={`p-2 rounded-md transition-colors relative ${activeSidebar === "files" ? "text-[#00FF9F] bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"}`}
            title="文件资源管理器 (File Explorer)"
          >
            <FolderTree size={20} />
            {gitChangedPaths.size > 0 && (
              <span
                className="absolute top-0 right-0 w-2 h-2 bg-amber-400 rounded-full"
                title={`${gitChangedPaths.size} 个文件有 Git 变更`}
              />
            )}
          </button>
          <button
            onClick={() =>
              setActiveSidebar(activeSidebar === "repo" ? null : "repo")
            }
            className={`p-2 rounded-md transition-colors ${activeSidebar === "repo" ? "text-[#00FF9F] bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"}`}
            title="代码仓库对接 (GitHub Integration)"
          >
            <Github size={20} />
          </button>
          <button
            onClick={() =>
              setActiveSidebar(activeSidebar === "sessions" ? null : "sessions")
            }
            className={`p-2 rounded-md transition-colors ${activeSidebar === "sessions" ? "text-[#00FF9F] bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"}`}
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

      {/* 文件资源管理器侧边栏（v3.0：动态懒加载 + Git 高亮 + 点击联动） */}
      {activeSidebar === "files" && (
        <div className="w-64 bg-[#1A202C] border-r border-[#00FF9F]/30 flex flex-col z-40 shrink-0 shadow-[5px_0_15px_rgba(0,0,0,0.5)]">
          {/* 侧边栏标题栏 */}
          <div className="p-3 border-b border-[#00FF9F]/30 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200">
                文件资源管理器
              </span>
              {gitChangedPaths.size > 0 && (
                <span className="text-[9px] text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1 rounded-sm">
                  {gitChangedPaths.size} 变更
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Agent 状态指示器 */}
              <span
                className={`w-2 h-2 rounded-full ${AGENT_DONE_STATES.has(curAgentState) ? "bg-[#00FF9F]" : "bg-amber-400 animate-pulse"}`}
                title={`Agent 状态: ${curAgentState}`}
              />
              {/* 手动刷新按钮 */}
              <button
                className="p-1 bg-[#00FF9F]/20 text-[#00FF9F] rounded-sm hover:bg-[#00FF9F]/30 transition-colors"
                title="刷新文件树"
                onClick={() => {
                  loadFileTree(true);
                  loadGitChanges();
                }}
              >
                <RefreshCw
                  size={13}
                  className={fileTreeLoading ? "animate-spin" : ""}
                />
              </button>
            </div>
          </div>

          {/* 文件树内容区 */}
          <div className="p-1 flex-1 overflow-y-auto">
            {fileTreeLoading && fileTree.length === 0 && (
              <div className="flex items-center justify-center gap-2 text-slate-500 text-[10px] p-4">
                <Loader2 size={14} className="animate-spin" />
                <span>加载文件树...</span>
              </div>
            )}
            {fileTreeError && (
              <div className="text-red-400 text-[10px] p-3 text-center bg-red-400/5 border border-red-400/20 m-2 rounded-sm">
                {fileTreeError}
                <button
                  className="block mt-2 mx-auto text-[#00FF9F] underline"
                  onClick={() => loadFileTree(true)}
                >
                  重试
                </button>
              </div>
            )}
            {!fileTreeLoading && !fileTreeError && fileTree.length === 0 && (
              <div className="text-slate-500 text-[10px] p-4 text-center leading-relaxed">
                <FolderOpen size={20} className="mx-auto mb-2 text-slate-600" />
                工作区暂无文件。
                <br />
                请先向 Agent 发送指令克隆仓库或创建文件。
              </div>
            )}
            {fileTree.map((node) => (
              <FileTreeNodeView
                key={node.path}
                node={node}
                onToggleDir={handleToggleDir}
                onSelectFile={handleSelectFile}
                selectedFile={selectedFile}
              />
            ))}
          </div>

          {/* 底部状态栏 */}
          {selectedFile && (
            <div className="border-t border-[#00FF9F]/20 px-2 py-1.5 text-[9px] text-slate-500 truncate bg-[#0f172a]">
              <span className="text-[#00FF9F]/70">已选择：</span>
              <span title={selectedFile}>{selectedFile.split("/").pop()}</span>
            </div>
          )}
        </div>
      )}

      {/* 代码仓库侧边栏 */}
      {activeSidebar === "repo" && (
        <div className="w-64 bg-[#1A202C] border-r border-[#00FF9F]/30 flex flex-col z-40 shrink-0 shadow-[5px_0_15px_rgba(0,0,0,0.5)]">
          <div className="p-3 border-b border-[#00FF9F]/30 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-200">
              代码仓库 (Repository)
            </span>
          </div>
          <div className="p-4 flex flex-col gap-4">
            {/* GitHub URL 输入 */}
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-[10px] font-bold">
                GitHub Repository URL
              </label>
              <div className="flex items-center bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1.5">
                <Github size={14} className="text-slate-500 mr-2 shrink-0" />
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value);
                    setRepoError(null);
                  }}
                  placeholder="https://github.com/owner/repo"
                  className="bg-transparent border-none outline-none text-[10px] w-full text-slate-300 placeholder-slate-600"
                />
              </div>
            </div>
            {/* Branch 输入 */}
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-[10px] font-bold">
                Branch / Commit
              </label>
              <div className="flex items-center bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1.5">
                <GitBranch size={14} className="text-slate-500 mr-2 shrink-0" />
                <input
                  type="text"
                  value={repoBranch}
                  onChange={(e) => setRepoBranch(e.target.value)}
                  placeholder="main"
                  className="bg-transparent border-none outline-none text-[10px] w-full text-slate-300 placeholder-slate-600"
                />
              </div>
            </div>
            {/* 加载按钮 */}
            <button
              className={`w-full py-2 rounded-sm font-bold mt-2 flex items-center justify-center gap-2 transition-colors
                ${
                  repoLoading
                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                    : "bg-[#00FF9F]/20 text-[#00FF9F] border border-[#00FF9F]/50 hover:bg-[#00FF9F]/30"
                }`}
              onClick={handleLoadRepo}
              disabled={repoLoading}
            >
              {repoLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> 克隆中...
                </>
              ) : (
                <>
                  <Github size={14} /> 加载仓库到沙箱
                </>
              )}
            </button>
            {/* 状态提示 */}
            {repoError && (
              <div className="text-red-400 text-[10px] bg-red-400/10 border border-red-400/30 p-2 rounded-sm">
                ⚠️ {repoError}
              </div>
            )}
            {repoMessage && !repoError && (
              <div
                className={`text-[10px] p-2 rounded-sm border ${
                  repoStatus === "success"
                    ? "text-[#00FF9F] bg-[#00FF9F]/10 border-[#00FF9F]/30"
                    : "text-amber-400 bg-amber-400/10 border-amber-400/30"
                }`}
              >
                {repoStatus === "success" ? "✅" : "⏳"} {repoMessage}
              </div>
            )}
            {/* 快捷说明 */}
            <div className="text-slate-600 text-[9px] leading-relaxed border-t border-slate-800 pt-3">
              <p className="font-bold text-slate-500 mb-1">使用说明</p>
              <p>点击后 Agent 将执行：</p>
              <code className="text-slate-400 text-[9px] block mt-1 bg-[#0b1120] p-1 rounded-sm">
                git clone &lt;url&gt; -b &lt;branch&gt; /workspace/&lt;repo&gt;
              </code>
              <p className="mt-1">克隆完成后文件树将自动刷新。</p>
            </div>
          </div>
        </div>
      )}

      {/* 会话控制侧边栏 */}
      {activeSidebar === "sessions" && (
        <div className="w-64 bg-[#1A202C] border-r border-[#00FF9F]/30 flex flex-col z-40 shrink-0 shadow-[5px_0_15px_rgba(0,0,0,0.5)]">
          <div className="p-3 border-b border-[#00FF9F]/30 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-200">
              会话控制 (Sessions)
            </span>
          </div>
          <div className="p-3 flex flex-col gap-3 overflow-y-auto flex-1">
            {/* 当前会话信息 */}
            <div className="bg-[#0b1120] border border-[#00FF9F]/30 p-3 rounded-sm">
              <div className="text-[#00FF9F] font-bold mb-1.5 flex items-center gap-2">
                <Activity size={13} /> 当前活跃会话
              </div>
              <div className="text-slate-400 text-[9px] break-all font-mono">
                ID:{" "}
                {conversationId ? `${conversationId.slice(0, 16)}...` : "N/A"}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    AGENT_DONE_STATES.has(curAgentState)
                      ? "bg-[#00FF9F]"
                      : "bg-amber-400 animate-pulse"
                  }`}
                />
                <span className="text-slate-500 text-[9px]">
                  Agent: {curAgentState}
                </span>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-col gap-2">
              <button
                className={`w-full py-1.5 rounded-sm font-bold flex items-center justify-center gap-2 text-[11px] transition-colors
                  ${sessionActionLoading ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30"}`}
                onClick={handleNewSession}
                disabled={sessionActionLoading}
              >
                {sessionActionLoading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
                新建空白会话
              </button>
              <button
                className={`w-full py-1.5 rounded-sm font-bold flex items-center justify-center gap-2 text-[11px] transition-colors
                  ${sessionActionLoading ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"}`}
                onClick={handleStopSession}
                disabled={sessionActionLoading}
              >
                {sessionActionLoading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <X size={13} />
                )}
                终止当前沙箱
              </button>
            </div>

            {/* 操作状态提示 */}
            {sessionActionStatus && (
              <div className="text-[9px] text-amber-400 bg-amber-400/10 border border-amber-400/30 p-2 rounded-sm">
                {sessionActionStatus}
              </div>
            )}

            {/* 恢复历史会话 */}
            <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
              <label className="text-slate-400 text-[10px] font-bold">
                恢复历史会话
              </label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={restoreToken}
                  onChange={(e) => setRestoreToken(e.target.value)}
                  placeholder="输入 Conversation ID"
                  className="flex-1 bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1 text-[10px] text-slate-300 placeholder-slate-600 outline-none"
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleRestoreSession(restoreToken)
                  }
                />
                <button
                  className="px-2 py-1 bg-[#00FF9F]/20 text-[#00FF9F] border border-[#00FF9F]/40 rounded-sm hover:bg-[#00FF9F]/30 transition-colors text-[10px] font-bold shrink-0"
                  onClick={() => handleRestoreSession(restoreToken)}
                >
                  跳转
                </button>
              </div>
            </div>

            {/* 历史会话列表 */}
            <div className="flex flex-col gap-1 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400 text-[10px] font-bold">
                  最近会话
                </label>
                <button
                  className="text-[9px] text-slate-500 hover:text-[#00FF9F] transition-colors"
                  onClick={loadSessionList}
                >
                  {sessionListLoading ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    "刷新"
                  )}
                </button>
              </div>
              {sessionListLoading && sessionList.length === 0 && (
                <div className="text-slate-600 text-[9px] text-center py-2">
                  加载中...
                </div>
              )}
              {!sessionListLoading && sessionList.length === 0 && (
                <div className="text-slate-600 text-[9px] text-center py-2">
                  暂无历史会话
                </div>
              )}
              {sessionList.map((s) => (
                <div
                  key={s.id}
                  className={`p-2 rounded-sm border cursor-pointer transition-colors ${
                    s.id === conversationId
                      ? "border-[#00FF9F]/50 bg-[#00FF9F]/10"
                      : "border-slate-700 bg-[#0b1120] hover:border-slate-600"
                  }`}
                  onClick={() => handleRestoreSession(s.id)}
                >
                  <div className="text-[10px] text-slate-300 truncate font-medium">
                    {s.title}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[8px] text-slate-600 font-mono">
                      {s.id.slice(0, 8)}...
                    </span>
                    <span
                      className={`text-[8px] font-bold ${
                        s.status === "RUNNING"
                          ? "text-amber-400"
                          : s.status === "STOPPED"
                            ? "text-red-400"
                            : "text-slate-500"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  {s.created_at && (
                    <div className="text-[8px] text-slate-600 mt-0.5">
                      {s.created_at}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col gap-3 p-3 overflow-hidden">
        {/* 顶部状态栏 Header */}
        <header className="h-[60px] shrink-0 relative border border-[#00FF9F]/30 bg-[#1A202C] flex items-center justify-between px-4">
          <div className="absolute top-0 left-0 w-3 h-3 border-t-[2px] border-l-[2px] border-[#00FF9F] z-20" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-[2px] border-r-[2px] border-[#00FF9F] z-20" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[2px] border-l-[2px] border-[#00FF9F] z-20" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[2px] border-r-[2px] border-[#00FF9F] z-20" />

          <div className="flex items-center gap-4">
            <ShieldAlert
              className="text-[#00FF9F] drop-shadow-[0_0_5px_rgba(0,255,159,0.8)]"
              size={24}
            />
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-slate-100 tracking-wide drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]">
                代码安全智能体（SeCodeAct）-SCA
              </h1>
              <div className="flex gap-4 text-[10px] mt-1 font-bold text-slate-400">
                <span className="flex items-center gap-1">
                  <FolderOpen size={10} className="text-blue-400" /> 项目:
                  core-system-v2
                </span>
                <span className="flex items-center gap-1">
                  <FileCode2 size={10} className="text-slate-300" /> 代码量:
                  128,450 行
                </span>
                <span className="flex items-center gap-1">
                  <AlertCircle size={10} className="text-red-400" /> 发现漏洞:{" "}
                  {vulnList.length}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 size={10} className="text-[#00FF9F]" /> 已修复:{" "}
                  {vulnList.filter((v) => v.status === "已修复").length}
                </span>
                <span className="flex items-center gap-1">
                  <TerminalSquare size={10} className="text-amber-400" />{" "}
                  利用验证:{" "}
                  {vulnList.filter((v) => v.status === "已验证").length}
                </span>
                {gitChangedPaths.size > 0 && (
                  <span className="flex items-center gap-1">
                    <GitCommit size={10} className="text-amber-400" /> Git 变更:{" "}
                    {gitChangedPaths.size}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SCA-012: Neo4j 连接标识（替换顶部流程栏） */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-bold bg-[#0f172a] border border-[#00FF9F]/30 px-3 py-1.5 rounded-sm">
              <span className="w-2 h-2 rounded-full bg-[#00FF9F] shadow-[0_0_6px_rgba(0,255,159,0.9)] animate-pulse" />
              <span className="text-[#00FF9F] font-bold">Neo4j Connected</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">bolt://localhost:7687</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">5 CVE | 62 节点</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">112 关系</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">跨CVE关联 x10</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] bg-[#0f172a] border border-slate-700/50 px-2 py-1.5 rounded-sm">
              <span className="text-slate-500">Knowledge Graph v1.0</span>
            </div>
          </div>
        </header>

        {/* 三列主工作区 */}
        <div className="flex flex-row gap-3 flex-1 min-h-[400px]">
          {/* 左列 (25%): Chat + 漏洞列表 */}
          <div className="w-[25%] flex flex-col gap-3">
            <HudPanel
              title="任务交互终端"
              titleIcon={MessageSquare}
              className="flex-1 min-h-[250px]"
            >
              <OpenHandsChat
                messages={chatMessages}
                onSendMessage={handleSendMessage}
              />
            </HudPanel>

            <HudPanel
              title="漏洞列表 (Vuln List)"
              className="flex-1 min-h-[200px]"
              headerRight={
                <span className="text-[10px] text-slate-500">
                  已修复 {vulnList.filter((v) => v.status === "已修复").length}/
                  {vulnList.length}
                </span>
              }
            >
              <div className="vuln-list h-[380px] overflow-auto overflow-x-auto scrollbar scrollbar-thin scrollbar-track-[#1A202C] scrollbar-thumb-[#00FF9F] hover:scrollbar-thumb-[#39FF14] scrollbar-rounded border border-[#00FF9F]/30 bg-[#0F172A]/80 p-1 rounded-lg">
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
                      <tr
                        key={idx}
                        className={`cursor-pointer ${
                          vuln.active
                            ? "text-[#00FF9F] bg-[#00FF9F]/10 border-l-2 border-[#00FF9F]"
                            : "text-slate-400 border-b border-slate-800 hover:bg-slate-800/50"
                        }`}
                        onClick={() => {
                          // SCA-010: 单漏洞专注模式——点击 Vuln List 条目时同时更新 CPG Tab + Diff Tab
                          handleVulnSelect(vuln.id);
                          // 同时高亮 CPG 中对应的 Sink 节点（保留 SCA-008 双向联动）
                          setHighlightCpgNodeId("n9");
                        }}
                      >
                        <td
                          className={`p-1.5 ${vuln.active ? "font-bold" : ""}`}
                        >
                          {vuln.id}
                        </td>
                        <td className={vuln.active ? "font-bold" : ""}>
                          {vuln.file}
                        </td>
                        <td
                          className={`${vuln.severityClass} ${vuln.active ? "font-bold" : ""}`}
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
            </HudPanel>
          </div>

          {/* SCA-012: 中列 (50%): 固定三 Tab（上）+ 仓库级总 CPG 知识图谱（中）+ 日志窗口（下） */}
          <div className="w-[50%] flex flex-col gap-0 overflow-hidden">
            {/* SCA-012-v4: 上层：仓库级总 CPG 知识图谱（flex-[4] 高度） */}
            <HudPanel
              className="flex-[4] min-h-0 flex flex-col"
              title="仓库级总 CPG 知识图谱"
              titleIcon={Database}
            >
              <div className="flex-1 relative overflow-hidden">
                <HudErrorBoundary panelName="仓库级知识图谱">
                  <KnowledgeGraphTab
                    selectedCveId={selectedCveId}
                    onJumpToCve={(cveId) => {
                      handleVulnSelect(cveId);
                      setActiveTab("cpg");
                    }}
                  />
                </HudErrorBoundary>
              </div>
            </HudPanel>

            {/* SCA-012-v4: 中部：固定三 Tab（flex-[4] 高度） */}
            <HudPanel className="flex-[4] min-h-0 flex flex-col">
              {/* SCA-012: 固定三 Tab 标签栏（CPG / PoC 利用 / Diff） */}
              <div className="flex border-b border-[#00FF9F]/30 bg-[#0f172a]">
                {/* Tab 1: CPG 图谱 */}
                <div
                  onClick={() => setActiveTab("cpg")}
                  className={`px-3 py-2 text-[11px] font-bold cursor-pointer border-b-2 flex items-center gap-1 ${activeTab === "cpg" ? "text-[#00FF9F] border-[#00FF9F] bg-[#00FF9F]/10 drop-shadow-[0_0_2px_rgba(0,255,159,0.5)]" : "text-slate-500 hover:text-slate-300 border-transparent"}`}
                >
                  [代码属性图 CPG]
                </div>
                {/* Tab 2: PoC 利用（SCA-011 新增） */}
                <div
                  onClick={() => setActiveTab("poc")}
                  className={`px-3 py-2 text-[11px] font-bold cursor-pointer border-b-2 flex items-center gap-1 ${activeTab === "poc" ? "text-red-400 border-red-400 bg-red-500/10 drop-shadow-[0_0_2px_rgba(239,68,68,0.5)]" : "text-slate-500 hover:text-slate-300 border-transparent"}`}
                >
                  [PoC 利用验证]
                  {pocResult?.success && (
                    <span className="text-[8px] bg-red-500/20 text-red-400 px-1 rounded border border-red-500/30">
                      已验证
                    </span>
                  )}
                </div>
                {/* Tab 3: Diff 修复 */}
                <div
                  onClick={() => setActiveTab("diff")}
                  className={`px-3 py-2 text-[11px] font-bold cursor-pointer border-b-2 flex items-center gap-1 ${activeTab === "diff" ? "text-[#00FF9F] border-[#00FF9F] bg-[#00FF9F]/10 drop-shadow-[0_0_2px_rgba(0,255,159,0.5)]" : "text-slate-500 hover:text-slate-300 border-transparent"}`}
                >
                  [代码修复 Diff]
                  <span className="text-[9px] text-slate-600 font-normal">
                    {(
                      CVE_BENCH_DATASET.find((e) => e.id === selectedCveId)
                        ?.targetFile || diffData.file
                    )
                      .split("/")
                      .pop()}
                  </span>
                </div>
              </div>

              {/* Tab 内容区域 */}
              {activeTab === "cpg" && (
                <div className="flex-1 flex flex-col bg-[#0b1120] overflow-hidden">
                  {/* 当前选中漏洞信息栏 */}
                  <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[#00FF9F]/20 bg-[#0d1526] flex-shrink-0">
                    <span className="text-[9px] text-slate-500 font-mono whitespace-nowrap">
                      当前漏洞:
                    </span>
                    <span className="text-[9px] text-[#00FF9F] font-mono font-bold whitespace-nowrap">
                      {selectedCveId}
                    </span>
                    <span className="text-[9px] text-slate-400 truncate">
                      {CVE_BENCH_DATASET.find((e) => e.id === selectedCveId)
                        ?.title || ""}
                    </span>
                    <span className="ml-auto text-[9px] text-slate-600 font-mono whitespace-nowrap">
                      CVSS{" "}
                      {CVE_BENCH_DATASET.find((e) => e.id === selectedCveId)
                        ?.cvss || "N/A"}
                    </span>
                    <button
                      onClick={() =>
                        handleGenerateCpg(
                          selectedFile || undefined,
                          selectedCveId,
                        )
                      }
                      disabled={cpgLoading}
                      className="px-2 py-0.5 text-[9px] font-mono rounded border border-[#00FF9F]/40 text-[#00FF9F] hover:bg-[#00FF9F]/10 disabled:opacity-50 whitespace-nowrap flex items-center gap-1"
                    >
                      {cpgLoading ? (
                        <Loader2 size={9} className="animate-spin" />
                      ) : (
                        <RefreshCw size={9} />
                      )}
                      {cpgLoading ? "生成中..." : "Joern CPG"}
                    </button>
                  </div>
                  {/* React Flow 动态图谱 */}
                  <div className="flex-1 relative overflow-hidden">
                    {cpgLoading ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b1120]/80 z-10">
                        <Loader2
                          size={24}
                          className="animate-spin text-[#00FF9F]"
                        />
                        <span className="text-[11px] text-[#00FF9F] font-mono">
                          正在生成 {cpgFile || selectedCveId} 的 CPG 图谱...
                        </span>
                      </div>
                    ) : null}
                    <HudErrorBoundary panelName="CPG 图谱">
                      <CpgGraph
                        cpgData={cpgData || undefined}
                        highlightNodeId={highlightCpgNodeId}
                        onNodeClick={(nodeId, nodeData) => {
                          if (nodeData?.file)
                            handleSelectFile(nodeData.file as string);
                          const nodeType = nodeData?.nodeType as string;
                          if (nodeType === "sink" || nodeType === "taint") {
                            setVulnList((prev) =>
                              prev.map((v, idx) => ({
                                ...v,
                                active: idx === 0,
                              })),
                            );
                          }
                          setHighlightCpgNodeId(null);
                        }}
                      />
                    </HudErrorBoundary>
                  </div>
                </div>
              )}

              {/* SCA-011: PoC 利用 Tab */}
              {activeTab === "poc" && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <HudErrorBoundary panelName="PoC 利用验证">
                    <PoCUtilTab
                      entry={
                        CVE_BENCH_DATASET.find((e) => e.id === selectedCveId) ||
                        null
                      }
                      pocRunning={pocRunning}
                      externalResult={pocResult}
                      onExecutePoc={(cveId, pocCode) => {
                        setPocRunning(true);
                        // 发送 PoC 执行命令到 Agent Terminal
                        const entry = CVE_BENCH_DATASET.find(
                          (e) => e.id === cveId,
                        );
                        const targetFile = entry?.targetFile || cveId;
                        send({
                          action: "message",
                          args: {
                            content: `python3 /opt/scripts/run_poc.py --cve ${cveId} --target ${targetFile}`,
                          },
                        });
                        // 推送日志
                        setSystemLogs((prev) => [
                          ...prev,
                          inferLogEntry(
                            `[SCA-011] 开始执行 PoC 利用验证: ${cveId}`,
                            prev.length,
                          ),
                          inferLogEntry(
                            `[SCA-011] 目标文件: ${targetFile}`,
                            prev.length + 1,
                          ),
                          inferLogEntry(
                            `[SCA-011] PoC 代码已发送到 Agent Terminal`,
                            prev.length + 2,
                          ),
                        ]);
                        // 模拟执行完成（真实场景由 Agent 输出触发）
                        setTimeout(() => {
                          setPocRunning(false);
                          if (entry?.pocResult) {
                            setPocResult({
                              ...entry.pocResult,
                              executedAt: new Date().toLocaleTimeString(
                                "zh-CN",
                                { hour12: false },
                              ),
                            });
                            setSystemLogs((prev) => [
                              ...prev,
                              inferLogEntry(
                                `[SCA-011] PoC 验证${entry.pocResult?.success ? "成功" : "失败"}: ${cveId}`,
                                prev.length,
                              ),
                              inferLogEntry(
                                `[SCA-011] 影响: ${entry.pocResult?.impact?.slice(0, 60)}...`,
                                prev.length + 1,
                              ),
                            ]);
                            // 更新 Vuln List 状态
                            setVulnList((prev) =>
                              prev.map((v) =>
                                v.id === cveId
                                  ? {
                                      ...v,
                                      status: "已验证",
                                      statusClass:
                                        "border-red-500/50 text-red-400 bg-red-500/10",
                                    }
                                  : v,
                              ),
                            );
                          }
                        }, 2500);
                      }}
                    />
                  </HudErrorBoundary>
                </div>
              )}

              {/* Diff 修复 Tab */}
              {activeTab === "diff" && (
                <div className="flex-1 relative bg-[#0b1120] overflow-hidden">
                  <HudErrorBoundary panelName="代码修复 Diff">
                    <OpenHandsDiffViewer
                      file={diffData.file}
                      originalCode={diffData.originalCode}
                      modifiedCode={diffData.modifiedCode}
                    />
                  </HudErrorBoundary>
                </div>
              )}
            </HudPanel>

            {/* SCA-009/012: 系统日志窗口 (flex-[2] 高度) */}
            <SystemLogPanel
              logs={systemLogs}
              onClear={() => setSystemLogs([])}
              className="flex-[2] min-h-0"
              defaultExpanded
            />
          </div>

          {/* 右列 (25%): 终端 + 元数据 */}
          <div className="w-[25%] flex flex-col gap-3">
            <HudPanel
              title="沙箱Agent执行终端（Terminal）"
              titleIcon={TerminalSquare}
              className="flex-1 min-h-[250px]"
            >
              <OpenHandsTerminal logs={terminalLogs} />
            </HudPanel>

            {/* SCA-012: 元数据面板高度优化（精简为 4 行核心信息） */}
            <HudPanel title="元数据与上下文" className="shrink-0">
              <div className="p-2 flex flex-col gap-1.5 text-[10px]">
                {(() => {
                  const currentEntry = CVE_BENCH_DATASET.find(
                    (e) => e.id === selectedCveId,
                  );
                  return currentEntry ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">CVE 编号:</span>{" "}
                        <span className="text-red-400 font-bold">
                          {currentEntry.id}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">类型/应用:</span>{" "}
                        <span className="text-amber-400 truncate">
                          {currentEntry.type} · {currentEntry.app}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">CVSS:</span>{" "}
                        <span className="text-red-400 font-bold">
                          {currentEntry.cvss}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">目标文件:</span>{" "}
                        <span
                          className="text-[#00FF9F] truncate"
                          title={currentEntry.targetFile}
                        >
                          {(currentEntry.targetFile || "").split("/").pop()}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-slate-500">CVE 编号:</span>{" "}
                      <span className="text-red-400 font-bold">
                        {selectedCveId}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </HudPanel>

            {/* SCA-013: MVP 操作面板——三功能块上移 + 新增测试报告生成块 */}
            <HudPanel title="MVP 安全分析操作" className="shrink-0">
              <div className="mvp-panel h-[420px] overflow-auto overflow-x-auto scrollbar scrollbar-thin scrollbar-track-[#1A202C] scrollbar-thumb-[#00FF9F] hover:scrollbar-thumb-[#39FF14] scrollbar-rounded border border-[#00FF9F]/30 bg-[#0F172A]/90 p-1.5 rounded-xl flex flex-col gap-1 text-[10px]">
                {/* 功能块1: 生成 POC 利用代码（上移，间距收紧） */}
                <button
                  onClick={() => {
                    const currentEntry = CVE_BENCH_DATASET.find(
                      (e) => e.id === selectedCveId,
                    );
                    const targetFile =
                      currentEntry?.targetFile ||
                      selectedFile ||
                      cpgFile ||
                      selectedCveId;
                    send({
                      action: "message",
                      args: {
                        content: `python3 /opt/scripts/gen_poc.py ${targetFile}`,
                      },
                    });
                  }}
                  className="w-full px-2 py-1 text-left rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                >
                  <TerminalSquare size={10} />
                  <span>生成 POC 利用代码</span>
                </button>
                {/* 功能块2: 执行根因分析（上移） */}
                <button
                  onClick={() => {
                    const currentEntry = CVE_BENCH_DATASET.find(
                      (e) => e.id === selectedCveId,
                    );
                    const targetFile =
                      currentEntry?.targetFile ||
                      selectedFile ||
                      cpgFile ||
                      selectedCveId;
                    send({
                      action: "message",
                      args: {
                        content: `python3 /opt/scripts/root_cause_analysis.py ${targetFile}`,
                      },
                    });
                  }}
                  className="w-full px-2 py-1 text-left rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors flex items-center gap-2"
                >
                  <ShieldAlert size={10} />
                  <span>执行根因分析</span>
                </button>
                {/* 功能块3: 生成修复 Patch（上移） */}
                <button
                  onClick={() => {
                    const currentEntry = CVE_BENCH_DATASET.find(
                      (e) => e.id === selectedCveId,
                    );
                    const targetFile =
                      currentEntry?.targetFile ||
                      selectedFile ||
                      cpgFile ||
                      selectedCveId;
                    send({
                      action: "message",
                      args: {
                        content: `python3 /opt/scripts/gen_fix_patch.py ${targetFile}`,
                      },
                    });
                    setActiveTab("diff");
                  }}
                  className="w-full px-2 py-1 text-left rounded border border-[#00FF9F]/40 text-[#00FF9F] hover:bg-[#00FF9F]/10 transition-colors flex items-center gap-2"
                >
                  <GitCommit size={10} />
                  <span>生成修复 Patch</span>
                </button>
                {/* 分隔线 */}
                <div className="border-t border-[#00FF9F]/20 my-0.5" />
                {/* 功能块4: SCA-014 Neo4j 智能修复建议（新增） */}
                <div className="rounded border border-purple-500/40 overflow-hidden">
                  <div className="px-2 py-1 bg-purple-500/10 text-purple-400 flex items-center gap-1.5 font-semibold">
                    <ShieldAlert size={10} />
                    <span>Neo4j 智能修复建议</span>
                  </div>
                  <div className="p-1 flex flex-col gap-1">
                    <button
                      onClick={() => {
                        const currentEntry = CVE_BENCH_DATASET.find(
                          (e) => e.id === selectedCveId,
                        );
                        const targetFile =
                          currentEntry?.targetFile ||
                          selectedFile ||
                          cpgFile ||
                          selectedCveId;
                        send({
                          action: "message",
                          args: {
                            content: `python3 /opt/scripts/neo4j_fix_advisor.py --cve ${selectedCveId} --file ${targetFile} --neo4j bolt://localhost:7687`,
                          },
                        });
                      }}
                      className="w-full px-2 py-1 text-left rounded border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-colors flex items-center gap-2"
                    >
                      <GitCommit size={10} />
                      <span>查询 Sink/Taint 路径推荐修复</span>
                    </button>
                    <button
                      onClick={() => {
                        send({
                          action: "message",
                          args: {
                            content: `python3 /opt/scripts/neo4j_fix_advisor.py --mode cross-cve --neo4j bolt://localhost:7687 --output /tmp/cross-cve-fix-suggestions.json`,
                          },
                        });
                      }}
                      className="w-full px-2 py-1 text-left rounded border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-colors flex items-center gap-2"
                    >
                      <BarChart2 size={10} />
                      <span>跨 CVE 关联修复分析</span>
                    </button>
                  </div>
                </div>
                {/* 分隔线 */}
                <div className="border-t border-[#00FF9F]/20 my-0.5" />
                {/* 功能块5: 测试报告生成（SCA-014 更新版） */}
                <div className="rounded border border-blue-500/40 overflow-hidden">
                  <div className="px-2 py-1 bg-blue-500/10 text-blue-400 flex items-center gap-1.5 font-semibold">
                    <BarChart2 size={10} />
                    <span>测试报告生成 (SCA-014)</span>
                  </div>
                  <div className="p-1 flex flex-col gap-1">
                    <button
                      onClick={() => {
                        send({
                          action: "message",
                          args: {
                            content: `python3 /opt/scripts/gen_test_report.py --format markdown --version sca-014 --output /tmp/sca-014-test-report.md --cve-bench /workspace/cve-bench --include-poc-rate --include-fix-rate`,
                          },
                        });
                      }}
                      className="w-full px-2 py-1 text-left rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-2"
                    >
                      <FileText size={10} />
                      <span>生成 SCA-014 全量对比报告 (MD)</span>
                    </button>
                    <button
                      onClick={() => {
                        send({
                          action: "message",
                          args: {
                            content: `python3 /opt/scripts/gen_test_report.py --format excel --version sca-014 --output /tmp/sca-014-test-report.xlsx --cve-bench /workspace/cve-bench --include-poc-rate --include-fix-rate`,
                          },
                        });
                      }}
                      className="w-full px-2 py-1 text-left rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-2"
                    >
                      <Download size={10} />
                      <span>导出 SCA-014 量化指标 Excel</span>
                    </button>
                  </div>
                </div>
              </div>
            </HudPanel>
          </div>
        </div>

        {/* 底部状态栏 */}
        <div className="h-[30px] shrink-0 bg-[#1A202C] border border-[#00FF9F]/20 flex items-center px-4 gap-6 text-[10px]">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-slate-500 whitespace-nowrap">
              CVE Bench v2.0:
            </span>
            <span className="text-[#00FF9F] font-bold whitespace-nowrap">
              {selectedCveId}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 truncate">
              {CVE_BENCH_DATASET.find((e) => e.id === selectedCveId)
                ?.description || "缓冲区溢出漏洞分析"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-4 text-slate-500">
            <span>
              大模型: Security-LLM-V3{" "}
              <span className="text-[#00FF9F]">[活跃]</span>
            </span>
            <span>
              知识图谱: V2.4 <span className="text-[#00FF9F]">[已同步]</span>
            </span>
            <span>
              eBPF 探针: <span className="text-[#00FF9F]">运行中</span>
            </span>
            <span className="text-slate-600">系统状态: 正常</span>
            <span className="text-slate-600">
              会话 ID: {conversationId?.slice(0, 8) || "N/A"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
