/**
 * HudErrorBoundary.tsx — SeCodeAct HUD 错误边界组件
 *
 * 用途：包裹 CpgGraph、VulnList、DiffViewer 等关键面板，
 * 防止单个组件崩溃导致整个 HUD 无响应。
 * 崩溃时显示友好错误信息 + 重试按钮。
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface HudErrorBoundaryProps {
  /** 被保护的子组件 */
  children: ReactNode;
  /** 面板名称，用于错误信息展示 */
  panelName?: string;
  /** 自定义 fallback UI */
  fallback?: ReactNode;
}

interface HudErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * HudErrorBoundary — 通用 React 错误边界
 *
 * 捕获子组件树中的 JavaScript 错误，记录错误日志，
 * 并渲染备用 UI，防止整个 HUD 崩溃。
 */
class HudErrorBoundary extends Component<HudErrorBoundaryProps, HudErrorBoundaryState> {
  constructor(props: HudErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<HudErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[HudErrorBoundary] ${this.props.panelName || 'Panel'} 崩溃:`, error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, panelName, fallback } = this.props;

    if (!hasError) return children;

    if (fallback) return fallback;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 120,
          padding: '16px',
          background: '#0b1120',
          border: '1px solid #ef444444',
          borderRadius: 6,
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="#ef4444" />
          <span style={{ color: '#ef4444', fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>
            {panelName || '面板'} 渲染错误
          </span>
        </div>
        <div
          style={{
            color: '#94a3b8',
            fontSize: 10,
            fontFamily: 'monospace',
            textAlign: 'center',
            maxWidth: 320,
            wordBreak: 'break-all',
          }}
        >
          {error?.message || '未知错误，请点击重试'}
        </div>
        <button
          onClick={this.handleRetry}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            background: 'transparent',
            border: '1px solid #00FF9F44',
            borderRadius: 4,
            color: '#00FF9F',
            fontSize: 10,
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={10} />
          重试
        </button>
      </div>
    );
  }
}

export default HudErrorBoundary;
