/**
 * DiffPanel.tsx
 *
 * SCA-HUD 代码修复 Diff 视图子组件（TC-SCA-020 拆分）
 *
 * 职责：
 * - 渲染代码修复前后对比（OpenHandsDiffViewer）
 * - 接收 diffData 作为 props
 */
import React from "react";
import { OpenHandsDiffViewer } from "./OpenHandsMocks";
import HudErrorBoundary from "./HudErrorBoundary";

export interface DiffLine {
  line: number;
  text: string;
  isHighlight: boolean;
}

export interface DiffData {
  file: string;
  originalCode: DiffLine[];
  modifiedCode: DiffLine[];
}

interface DiffPanelProps {
  diffData: DiffData;
  className?: string;
}

export default function DiffPanel({ diffData, className = "" }: DiffPanelProps) {
  return (
    <div className={`flex-1 relative bg-[#0b1120] overflow-hidden ${className}`}>
      <HudErrorBoundary panelName="代码修复 Diff">
        <OpenHandsDiffViewer
          file={diffData.file}
          originalCode={diffData.originalCode}
          modifiedCode={diffData.modifiedCode}
        />
      </HudErrorBoundary>
    </div>
  );
}
