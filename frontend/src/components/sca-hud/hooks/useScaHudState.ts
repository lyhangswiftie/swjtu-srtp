/**
 * useScaHudState.ts
 *
 * SCA-HUD 全局状态协调 Hook（TC-SCA-020 拆分）
 *
 * 职责：
 * - 聚合 useVulnSelection / useCpgRuntime / useTerminalLogs / useRvpActions
 * - 管理 UI 全局状态（activeSidebar / showSettings）
 * - 管理系统日志（SystemLogEntry[]）
 * - 对外暴露统一的 HUD 状态接口，供 DashboardConnected 使用
 *
 * 设计原则：
 * - DashboardConnected 只负责组合各子组件和 hooks，不再直接持有业务状态
 * - 各子 hook 各司其职，状态边界清晰
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useVulnSelection } from "./useVulnSelection";
import { useCpgRuntime } from "./useCpgRuntime";
import { useTerminalLogs } from "./useTerminalLogs";
import { useRvpActions } from "./useRvpActions";
import type { SystemLogEntry } from "../SystemLogPanel";
import { inferLogEntry } from "../SystemLogPanel";
import { useEventStore } from "#/stores/use-event-store";

export function useScaHudState() {
  // ── 子 Hooks ──────────────────────────────────────────────────────────────
  const vulnSelection = useVulnSelection();
  const cpgRuntime = useCpgRuntime();
  const terminalLogs = useTerminalLogs();
  const rvpActions = useRvpActions();

  // ── UI 全局状态 ───────────────────────────────────────────────────────────
  const [activeSidebar, setActiveSidebar] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // ── 系统日志状态 ──────────────────────────────────────────────────────────
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([
    {
      id: "init-0",
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      level: "info",
      source: "SYSTEM",
      message:
        "[SCA-020] SeCodeAct HUD v5.0 已启动（状态治理重构版），等待 CVE Bench 样本分析...",
    },
    {
      id: "init-1",
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      level: "success",
      source: "SYSTEM",
      message:
        "[SCA-019] 真实 Joern CPG 链路已就绪：audit.c → c2cpg → joern-export → cpg_to_json.py",
    },
    {
      id: "init-2",
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      level: "joern",
      source: "JOERN",
      message: "[SCA-019] CPG 数据：124 节点 / 124 边（CVE-2024-22120 Zabbix SQL 时间盲注）",
    },
  ]);

  // ── 监听 uiEvents 自动更新系统日志 ────────────────────────────────────────
  const uiEvents = useEventStore((state) => state.uiEvents);
  const lastLogEventRef = useRef<number>(0);

  useEffect(() => {
    if (uiEvents.length <= lastLogEventRef.current) return;
    const newEvents = uiEvents.slice(lastLogEventRef.current);
    lastLogEventRef.current = uiEvents.length;

    const newLogs: SystemLogEntry[] = [];
    for (const ev of newEvents) {
      const content =
        (ev as any).message ??
        (ev as any).content ??
        (ev as any).args?.content ??
        "";
      if (!content || typeof content !== "string") continue;

      // 截取前 200 字符作为日志条目
      const snippet = content.slice(0, 200).replace(/\n/g, " ");
      if (snippet.trim()) {
        newLogs.push(inferLogEntry(snippet));
      }

      // 同时触发漏洞关键词规则
      vulnSelection.applyKeywordRules(content);
    }

    if (newLogs.length > 0) {
      setSystemLogs((prev) => [...prev, ...newLogs].slice(-200));
    }
  }, [uiEvents, vulnSelection]);

  return {
    // 子 hooks 状态
    vulnSelection,
    cpgRuntime,
    terminalLogs,
    rvpActions,
    // UI 全局状态
    activeSidebar,
    setActiveSidebar,
    showSettings,
    setShowSettings,
    // 系统日志
    systemLogs,
    setSystemLogs,
  };
}
