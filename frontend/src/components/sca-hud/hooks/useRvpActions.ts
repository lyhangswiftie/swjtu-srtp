/**
 * useRvpActions.ts
 *
 * RVP（Root-cause Verification & Patch）操作状态 Hook（TC-SCA-020 拆分）
 *
 * 职责：
 * - 管理 PoC 执行状态（pocRunning / pocResult）
 * - 管理 Tab 切换状态（activeTab: cpg | poc | diff）
 * - 提供 RVP 操作回调（handleRunPoC / handleSwitchTab）
 */
import { useState, useCallback } from "react";
import type { PoCExecutionResult } from "../PoCUtilTab";

export type ActiveTab = "cpg" | "poc" | "diff";

export interface UseRvpActionsReturn {
  activeTab: ActiveTab;
  pocRunning: boolean;
  pocResult: PoCExecutionResult | null;
  setActiveTab: React.Dispatch<React.SetStateAction<ActiveTab>>;
  setPocRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setPocResult: React.Dispatch<React.SetStateAction<PoCExecutionResult | null>>;
}

export function useRvpActions(): UseRvpActionsReturn {
  const [activeTab, setActiveTab] = useState<ActiveTab>("cpg");
  const [pocRunning, setPocRunning] = useState<boolean>(false);
  const [pocResult, setPocResult] = useState<PoCExecutionResult | null>(null);

  return {
    activeTab,
    pocRunning,
    pocResult,
    setActiveTab,
    setPocRunning,
    setPocResult,
  };
}
