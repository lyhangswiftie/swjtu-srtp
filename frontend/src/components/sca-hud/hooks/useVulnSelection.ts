/**
 * useVulnSelection.ts
 *
 * CVE 漏洞选择与联动状态 Hook（TC-SCA-020 拆分）
 *
 * 职责：
 * - 管理当前选中的 CVE ID
 * - 管理漏洞列表（VulnItem[]）及其状态更新
 * - 管理 CPG 节点高亮联动（双向联动：VulnList ↔ CpgGraph）
 * - 提供 handleVulnSelect 回调，触发 CVE 切换时的联动更新
 */
import { useState, useCallback } from "react";
import { CVE_BENCH_DATASET } from "../CveBenchData";

/** 漏洞条目类型 */
export interface VulnItem {
  id: string;
  file: string;
  severity: string;
  severityClass: string;
  status: string;
  statusClass: string;
  active: boolean;
}

/** DiffLine 类型（供 DiffPanel 使用） */
export interface DiffLine {
  line: number;
  text: string;
  isHighlight: boolean;
}

/** DiffData 类型（供 DiffPanel 使用） */
export interface DiffData {
  file: string;
  originalCode: DiffLine[];
  modifiedCode: DiffLine[];
}

/** 初始漏洞列表（与原 DashboardConnected 中 INITIAL_VULN_LIST 保持一致） */
const INITIAL_VULN_LIST: VulnItem[] = CVE_BENCH_DATASET.slice(0, 8).map(
  (entry, idx) => ({
    id: entry.id,
    file: entry.targetFile,
    severity: entry.cvss >= 9 ? "严重" : entry.cvss >= 7 ? "高危" : "中危",
    severityClass:
      entry.cvss >= 9
        ? "text-red-400 bg-red-500/10 border-red-500/30"
        : entry.cvss >= 7
          ? "text-orange-400 bg-orange-500/10 border-orange-500/30"
          : "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
    status: idx === 0 ? "分析中" : idx < 3 ? "待分析" : "已修复",
    statusClass:
      idx === 0
        ? "text-amber-400 animate-pulse"
        : idx < 3
          ? "text-slate-400"
          : "text-[#00FF9F]",
    active: idx === 0,
  }),
);

/** CVE 关键词匹配规则（简化版，用于 VulnList 自动状态更新） */
const VULN_KEYWORD_RULES: Record<
  string,
  { keywords: string[]; status: string; statusClass: string }
> = {
  "CVE-2024-22120": {
    keywords: ["audit.c", "zbx_db_execute", "sql injection", "time-based"],
    status: "分析中",
    statusClass: "text-amber-400 animate-pulse",
  },
  "CVE-2021-3156": {
    keywords: ["sudoedit", "heap overflow", "sudo"],
    status: "待分析",
    statusClass: "text-slate-400",
  },
};

export interface UseVulnSelectionReturn {
  selectedCveId: string;
  vulnList: VulnItem[];
  highlightCpgNodeId: string | null;
  handleVulnSelect: (cveId: string) => void;
  setVulnList: React.Dispatch<React.SetStateAction<VulnItem[]>>;
  setHighlightCpgNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  applyKeywordRules: (text: string) => void;
}

export function useVulnSelection(): UseVulnSelectionReturn {
  const [selectedCveId, setSelectedCveId] = useState<string>("CVE-2024-22120");
  const [vulnList, setVulnList] = useState<VulnItem[]>(INITIAL_VULN_LIST);
  const [highlightCpgNodeId, setHighlightCpgNodeId] = useState<string | null>(
    null,
  );

  /**
   * 选择 CVE 时的联动处理：
   * 1. 更新 selectedCveId
   * 2. 更新 vulnList 中各条目的 active 状态
   * 3. 根据 CVE 对应的 Sink 节点 ID 触发 CPG 高亮
   */
  const handleVulnSelect = useCallback((cveId: string) => {
    setSelectedCveId(cveId);
    setVulnList((prev) =>
      prev.map((v) => ({
        ...v,
        active: v.id === cveId,
        status: v.id === cveId ? "分析中" : v.status,
        statusClass:
          v.id === cveId ? "text-amber-400 animate-pulse" : v.statusClass,
      })),
    );
    // 根据 CVE 数据集找到对应的 sink 节点 ID 并触发高亮
    const entry = CVE_BENCH_DATASET.find((e) => e.id === cveId);
    if (entry) {
      // 使用 targetFile 的文件名作为高亮节点 ID 的前缀
      const sinkNodeId = `sink-${cveId.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      setHighlightCpgNodeId(sinkNodeId);
    }
  }, []);

  /**
   * 根据 Agent 输出文本自动更新漏洞状态（关键词匹配）
   */
  const applyKeywordRules = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    setVulnList((prev) =>
      prev.map((v) => {
        const rule = VULN_KEYWORD_RULES[v.id];
        if (!rule) return v;
        const matched = rule.keywords.some((kw) =>
          lowerText.includes(kw.toLowerCase()),
        );
        if (matched && v.status !== "分析中") {
          return { ...v, status: rule.status, statusClass: rule.statusClass };
        }
        return v;
      }),
    );
  }, []);

  return {
    selectedCveId,
    vulnList,
    highlightCpgNodeId,
    handleVulnSelect,
    setVulnList,
    setHighlightCpgNodeId,
    applyKeywordRules,
  };
}
