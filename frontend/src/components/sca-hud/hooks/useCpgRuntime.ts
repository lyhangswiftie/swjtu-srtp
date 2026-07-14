/**
 * useCpgRuntime.ts
 *
 * CPG 运行时状态 Hook（TC-SCA-020 拆分）
 *
 * 职责：
 * - 管理 CPG 图谱数据（CpgGraphData）
 * - 管理 CPG 加载状态（loading）
 * - 管理 Joern 错误状态（joernError）
 * - 管理当前分析的文件路径（cpgFile）
 * - 提供 handleGenerateCpg 回调，触发 Joern 分析
 * - 监听 uiEvents 中的 SCA_CPG_JSON 标记并解析 CPG 数据
 */
import { useState, useCallback, useEffect, useRef } from "react";
import type { CpgGraphData } from "../CpgGraph";
import {
  extractCpgJsonFromOutput,
  buildJoernCommand,
  hasJoernLog,
  CPG_JSON_MARKER,
} from "../JoernService";
import { useEventStore } from "#/stores/use-event-store";
import { useSendMessage } from "#/hooks/use-send-message";

export interface UseCpgRuntimeReturn {
  cpgData: CpgGraphData | null;
  cpgLoading: boolean;
  joernError: string | null;
  cpgFile: string | null;
  setCpgFile: React.Dispatch<React.SetStateAction<string | null>>;
  handleGenerateCpg: (filePath: string) => void;
}

export function useCpgRuntime(): UseCpgRuntimeReturn {
  const [cpgData, setCpgData] = useState<CpgGraphData | null>(null);
  const [cpgLoading, setCpgLoading] = useState<boolean>(false);
  const [joernError, setJoernError] = useState<string | null>(null);
  const [cpgFile, setCpgFile] = useState<string | null>(null);

  const uiEvents = useEventStore((state) => state.uiEvents);
  const { send } = useSendMessage();
  const lastCpgEventRef = useRef<number>(0);

  /**
   * 监听 uiEvents 中的 SCA_CPG_JSON 标记，解析 CPG 数据
   * 继承自 TC-SCA-019 的真实 Joern CPG 端到端链路
   */
  useEffect(() => {
    if (uiEvents.length <= lastCpgEventRef.current) return;
    lastCpgEventRef.current = uiEvents.length;

    for (const ev of uiEvents.slice(lastCpgEventRef.current - 1)) {
      const content =
        (ev as any).message ??
        (ev as any).content ??
        (ev as any).args?.content ??
        "";
      if (!content || typeof content !== "string") continue;

      // 检测 SCA_CPG_JSON 标记（TC-SCA-019 格式）
      if (content.includes(CPG_JSON_MARKER) || hasJoernLog(content)) {
        try {
          const parsed = extractCpgJsonFromOutput(content);
          if (parsed) {
            setCpgData(parsed);
            setCpgLoading(false);
            setJoernError(null);
          }
        } catch (err) {
          setJoernError(
            `CPG 解析失败: ${err instanceof Error ? err.message : String(err)}`,
          );
          setCpgLoading(false);
        }
      }

      // 检测 Joern 错误输出
      if (
        content.toLowerCase().includes("joern error") ||
        content.toLowerCase().includes("c2cpg failed") ||
        content.toLowerCase().includes("joern-parse failed")
      ) {
        setJoernError(`Joern 工具链错误: ${content.slice(0, 200)}`);
        setCpgLoading(false);
      }
    }
  }, [uiEvents]);

  /**
   * 触发 Joern CPG 分析
   * 向 Agent 发送 joern_cpg_smoke.sh 命令
   */
  const handleGenerateCpg = useCallback(
    (filePath: string) => {
      setCpgLoading(true);
      setJoernError(null);
      setCpgFile(filePath);
      const cmd = buildJoernCommand(filePath);
      send({ content: cmd, imageUrls: [] });
    },
    [send],
  );

  return {
    cpgData,
    cpgLoading,
    joernError,
    cpgFile,
    setCpgFile,
    handleGenerateCpg,
  };
}
