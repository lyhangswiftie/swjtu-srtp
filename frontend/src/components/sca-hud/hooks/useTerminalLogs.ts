/**
 * useTerminalLogs.ts
 *
 * 终端日志状态 Hook（TC-SCA-020 拆分）
 *
 * 职责：
 * - 从 useCommandStore 读取命令流并转换为终端日志字符串
 * - 提供 terminalLogs 给 TerminalPanel 组件
 */
import { useCommandStore } from "#/stores/command-store";

/** 将 useCommandStore 的 Command[] 转换为终端日志字符串数组 */
function commandsToLogs(
  commands: ReturnType<typeof useCommandStore.getState>["commands"],
): string[] {
  return commands.map((cmd) =>
    cmd.type === "input" ? `$ ${cmd.content}` : cmd.content,
  );
}

/** 终端日志的 Mock 数据（Agent 未连接时的默认显示） */
const MOCK_TERMINAL_LOGS = [
  "$ joern-parse samples/cve-2024-22120/audit.c",
  "[INFO] c2cpg: parsing audit.c ...",
  "[INFO] CPG construction complete: 124 nodes, 124 edges",
  "$ python3 scripts/cpg_to_json.py --dot /tmp/cpg-export --output joern-cpg.json",
  "[SCA-019] SCA_CPG_JSON: {\"nodes\": [...], \"edges\": [...], \"meta\": {\"nodeCount\": 124}}",
  "$ echo 'CVE-2024-22120 analysis complete'",
  "CVE-2024-22120 analysis complete",
];

export interface UseTerminalLogsReturn {
  terminalLogs: string[];
}

export function useTerminalLogs(): UseTerminalLogsReturn {
  const commands = useCommandStore((state) => state.commands);
  const liveLogs = commandsToLogs(commands);
  const terminalLogs = liveLogs.length > 0 ? liveLogs : MOCK_TERMINAL_LOGS;

  return { terminalLogs };
}
