/**
 * CpgGraph.tsx — SeCodeAct 代码属性图（CPG）动态可视化组件
 *
 * 基于 @xyflow/react 实现，支持：
 * - 节点类型：Source / AST / CFG / Taint / Call / Sink
 * - 边类型：数据流 / 控制流 / 污点传播 / 调用关系
 * - 交互：拖拽、缩放、节点点击高亮路径、Legend 图例
 * - 数据接入：接受 Joern 生成的 CPG JSON（nodes + edges）
 *
 * SCA-008 增强：
 * - NodeDetailPanel 增强：污点链路径、CVSS 评分、CVE ID 关联、完整代码片段
 * - highlightNodeId prop：支持外部（Vuln List）触发节点高亮（双向联动）
 * - 根因分析面板：显示漏洞根因摘要和修复建议
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export type CpgNodeType = 'source' | 'ast' | 'cfg' | 'taint' | 'call' | 'sink';
export type CpgEdgeType = 'dataflow' | 'controlflow' | 'taintprop' | 'callrel';

export interface CpgNodeData extends Record<string, unknown> {
  label: string;
  nodeType: CpgNodeType;
  subLabel?: string;
  file?: string;
  line?: number;
  code?: string;
  highlighted?: boolean;
  /** CVE ID 关联（用于属性面板展示） */
  cveId?: string;
  /** CVSS 评分（用于属性面板展示） */
  cvss?: number;
  /** 污点传播路径描述 */
  taintPath?: string;
  /** 根因分析摘要 */
  rootCause?: string;
  /** 修复建议 */
  fixSuggestion?: string;
}

export interface CpgEdgeData extends Record<string, unknown> {
  edgeType: CpgEdgeType;
  label?: string;
  highlighted?: boolean;
}

export interface CpgGraphData {
  cveId?: string;
  nodes: Array<{
    id: string;
    type: CpgNodeType;
    label: string;
    subLabel?: string;
    file?: string;
    line?: number;
    code?: string;
    x?: number;
    y?: number;
    cveId?: string;
    cvss?: number;
    taintPath?: string;
    rootCause?: string;
    fixSuggestion?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: CpgEdgeType;
    label?: string;
  }>;
  file?: string;
  generatedAt?: string;
  /** 图谱级别的 CVSS 评分 */
  cvss?: number;
  /** 图谱级别的根因摘要 */
  rootCause?: string;
  /** 图谱级别的修复建议 */
  fixSuggestion?: string;
}

// ─── 节点颜色配置 ─────────────────────────────────────────────────────────────

const NODE_STYLES: Record<CpgNodeType, { border: string; bg: string; text: string; icon: string }> = {
  source:  { border: '#00FF9F', bg: '#0a2a1a', text: '#00FF9F', icon: '⬡' },
  ast:     { border: '#f59e0b', bg: '#1c1200', text: '#fbbf24', icon: '◇' },
  cfg:     { border: '#475569', bg: '#0f172a', text: '#94a3b8', icon: '□' },
  taint:   { border: '#f59e0b', bg: '#1c1200', text: '#fbbf24', icon: '⚠' },
  call:    { border: '#ef4444', bg: '#2d0a0a', text: '#fca5a5', icon: '⬤' },
  sink:    { border: '#ef4444', bg: '#451a03', text: '#fca5a5', icon: '▼' },
};

const EDGE_STYLES: Record<CpgEdgeType, { stroke: string; strokeDash?: string; label: string }> = {
  dataflow:    { stroke: '#00FF9F', label: '数据流' },
  controlflow: { stroke: '#475569', strokeDash: '5,3', label: '控制流' },
  taintprop:   { stroke: '#f59e0b', label: '污点传播' },
  callrel:     { stroke: '#ef4444', strokeDash: '3,2', label: '调用关系' },
};

// ─── 自定义节点组件 ────────────────────────────────────────────────────────────

const CpgNodeComponent: React.FC<NodeProps<Node<CpgNodeData>>> = ({ data, selected }) => {
  const style = NODE_STYLES[data.nodeType] || NODE_STYLES.cfg;
  const isHighlighted = data.highlighted || selected;

  return (
    <div
      style={{
        border: `${isHighlighted ? '2px' : '1.5px'} solid ${style.border}`,
        background: style.bg,
        borderRadius: data.nodeType === 'sink' ? '4px' : '50%',
        width: data.nodeType === 'sink' ? 64 : 52,
        height: data.nodeType === 'sink' ? 52 : 52,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isHighlighted ? `0 0 12px ${style.border}88` : `0 0 4px ${style.border}33`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: style.border, width: 6, height: 6 }} />
      <div style={{ color: style.text, fontSize: 10, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2, textAlign: 'center' }}>
        {data.label}
      </div>
      {data.subLabel && (
        <div style={{ color: '#64748b', fontSize: 8, fontFamily: 'monospace', marginTop: 2, textAlign: 'center', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.subLabel}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: style.border, width: 6, height: 6 }} />
    </div>
  );
};

const nodeTypes: NodeTypes = {
  cpgNode: CpgNodeComponent,
};

// ─── 默认 CPG 数据（CVE-2024-22120 Zabbix SQL 注入示例） ─────────────────────────

const DEFAULT_CPG_DATA: CpgGraphData = {
  cveId: 'CVE-2024-22120',
  file: 'src/zabbix/audit.c',
  generatedAt: new Date().toISOString(),
  cvss: 9.1,
  rootCause: 'clientip 参数未经充分转义直接拼入 SQL 语句，导致时间盲注（CWE-89）',
  fixSuggestion: '使用 zbx_db_dyn_escape_string_len() 替换 zbx_db_dyn_escape_string()，并对 zbx_db_execute() 改用参数化查询',
  nodes: [
    { id: 'n1', type: 'source', label: 'clientip',      subLabel: 'METHOD_PARAMETER_IN', x: 280, y: 30,  code: 'const char *clientip', taintPath: 'HTTP → clientip → sql → zbx_db_execute', rootCause: '外部可控输入点（客户端 IP）' },
    { id: 'n2', type: 'cfg',    label: 'zbx_audit_log', subLabel: 'METHOD',               x: 100, y: 120, code: 'void zbx_audit_log_clientip(const char *clientip)' },
    { id: 'n3', type: 'taint',  label: 'value_esc',     subLabel: 'IDENTIFIER',           x: 280, y: 120, code: 'value_esc = zbx_db_dyn_escape_string(clientip)', taintPath: 'clientip → value_esc（转义不完整）' },
    { id: 'n4', type: 'call',   label: 'escape_string', subLabel: 'CALL',                 x: 460, y: 120, code: 'zbx_db_dyn_escape_string(clientip)' },
    { id: 'n5', type: 'taint',  label: 'sql[1024]',     subLabel: 'IDENTIFIER',           x: 280, y: 210, code: 'char sql[1024]', taintPath: 'value_esc → sql（snprintf 拼接）' },
    { id: 'n6', type: 'sink',   label: 'snprintf',      subLabel: 'CALL',                 x: 460, y: 210, code: 'snprintf(sql, sizeof(sql), "INSERT INTO auditlog(clientip) VALUES(\'%s\')", clientip)', rootCause: 'clientip 直接拼入 SQL 字符串，未使用参数化查询', fixSuggestion: '改用 zbx_db_dyn_escape_string_len() 并验证转义结果' },
    { id: 'n7', type: 'sink',   label: 'zbx_db_execute',subLabel: 'CALL',                 x: 640, y: 210, code: 'zbx_db_execute("%s", sql)', rootCause: '执行含污点数据的 SQL 语句（时间盲注入口）', fixSuggestion: '使用参数化查询替代字符串拼接' },
    { id: 'n8', type: 'ast',    label: 'free',          subLabel: 'CALL',                 x: 460, y: 300, code: 'free(value_esc)' },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n4', type: 'dataflow',    label: 'REACHING_DEF' },
    { id: 'e2', source: 'n4', target: 'n3', type: 'dataflow',    label: 'REACHING_DEF' },
    { id: 'e3', source: 'n1', target: 'n6', type: 'taintprop',   label: 'TAINT' },
    { id: 'e4', source: 'n3', target: 'n5', type: 'dataflow',    label: 'REACHING_DEF' },
    { id: 'e5', source: 'n5', target: 'n7', type: 'dataflow',    label: 'REACHING_DEF' },
    { id: 'e6', source: 'n2', target: 'n1', type: 'controlflow', label: 'CFG' },
    { id: 'e7', source: 'n2', target: 'n7', type: 'controlflow', label: 'CFG' },
    { id: 'e8', source: 'n3', target: 'n8', type: 'dataflow',    label: 'REACHING_DEF' },
  ],
};

// ─── CPG 数据转换函数 ──────────────────────────────────────────────────────────

function cpgDataToFlow(data: CpgGraphData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = data.nodes.map((n, idx) => ({
    id: n.id,
    type: 'cpgNode',
    position: { x: n.x ?? (idx % 4) * 160 + 60, y: n.y ?? Math.floor(idx / 4) * 120 + 40 },
    data: {
      label: n.label,
      nodeType: n.type,
      subLabel: n.subLabel,
      file: n.file,
      line: n.line,
      code: n.code,
      highlighted: false,
      cveId: n.cveId ?? data.cveId,
      cvss: n.cvss ?? data.cvss,
      taintPath: n.taintPath,
      rootCause: n.rootCause ?? (n.type === 'sink' ? data.rootCause : undefined),
      fixSuggestion: n.fixSuggestion ?? (n.type === 'sink' ? data.fixSuggestion : undefined),
    } as CpgNodeData,
  }));

  const edges: Edge[] = data.edges.map((e) => {
    const edgeStyle = EDGE_STYLES[e.type] || EDGE_STYLES.dataflow;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: e.type === 'taintprop' || e.type === 'dataflow',
      style: {
        stroke: edgeStyle.stroke,
        strokeWidth: 1.5,
        strokeDasharray: edgeStyle.strokeDash,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeStyle.stroke,
        width: 12,
        height: 12,
      },
      data: { edgeType: e.type, highlighted: false } as CpgEdgeData,
    };
  });

  return { nodes, edges };
}

// ─── 增强版属性面板组件（SCA-008）──────────────────────────────────────────────

interface NodeDetailPanelProps {
  node: Node<CpgNodeData> | null;
  onClose: () => void;
  /** 图谱级别的 CVSS 评分（节点未携带时使用） */
  graphCvss?: number;
  /** 图谱级别的根因摘要（节点未携带时使用） */
  graphRootCause?: string;
  /** 图谱级别的修复建议（节点未携带时使用） */
  graphFixSuggestion?: string;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  node,
  onClose,
  graphCvss,
  graphRootCause,
  graphFixSuggestion,
}) => {
  if (!node) return null;
  const style = NODE_STYLES[node.data.nodeType] || NODE_STYLES.cfg;
  const cvss = node.data.cvss ?? graphCvss;
  const rootCause = node.data.rootCause ?? graphRootCause;
  const fixSuggestion = node.data.fixSuggestion ?? graphFixSuggestion;

  // CVSS 颜色
  const cvssColor = cvss == null ? '#64748b'
    : cvss >= 9.0 ? '#ef4444'
    : cvss >= 7.0 ? '#f59e0b'
    : cvss >= 4.0 ? '#fbbf24'
    : '#00FF9F';

  return (
    <div
      style={{
        position: 'absolute',
        top: 36,
        right: 8,
        width: 240,
        background: '#0f172a',
        border: `1px solid ${style.border}`,
        borderRadius: 6,
        padding: '10px 12px',
        zIndex: 100,
        boxShadow: `0 0 20px ${style.border}44`,
        maxHeight: 'calc(100% - 60px)',
        overflowY: 'auto',
      }}
    >
      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: style.text, fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>
          {style.icon} {node.data.label}
        </span>
        <button
          onClick={onClose}
          style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* 基础信息 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748b' }}>类型:</span>
          <span style={{ color: style.text }}>{node.data.nodeType.toUpperCase()}</span>
        </div>
        {node.data.subLabel && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b' }}>标识:</span>
            <span style={{ color: '#e2e8f0', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.data.subLabel}</span>
          </div>
        )}
        {node.data.cveId && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b' }}>CVE:</span>
            <span style={{ color: '#ef4444', fontWeight: 700 }}>{node.data.cveId}</span>
          </div>
        )}
        {cvss != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b' }}>CVSS:</span>
            <span style={{ color: cvssColor, fontWeight: 700 }}>
              {cvss.toFixed(1)}
              <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 4 }}>
                {cvss >= 9.0 ? '(严重)' : cvss >= 7.0 ? '(高危)' : cvss >= 4.0 ? '(中危)' : '(低危)'}
              </span>
            </span>
          </div>
        )}
        {node.data.file && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b' }}>文件:</span>
            <span style={{ color: '#f59e0b', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.data.file}>{node.data.file}</span>
          </div>
        )}
        {node.data.line && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b' }}>行号:</span>
            <span style={{ color: '#e2e8f0' }}>L{node.data.line}</span>
          </div>
        )}
      </div>

      {/* 代码片段 */}
      {node.data.code && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace', marginBottom: 3 }}>代码片段:</div>
          <div style={{
            padding: '5px 7px',
            background: '#1e293b',
            borderRadius: 3,
            color: '#94a3b8',
            fontSize: 9,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            lineHeight: 1.5,
            border: `1px solid ${style.border}22`,
          }}>
            {node.data.code}
          </div>
        </div>
      )}

      {/* 污点传播路径 */}
      {node.data.taintPath && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace', marginBottom: 3 }}>污点传播路径:</div>
          <div style={{
            padding: '4px 7px',
            background: '#1c120033',
            borderRadius: 3,
            color: '#fbbf24',
            fontSize: 9,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            lineHeight: 1.5,
            border: '1px solid #f59e0b33',
          }}>
            {node.data.taintPath}
          </div>
        </div>
      )}

      {/* 根因分析 */}
      {rootCause && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace', marginBottom: 3 }}>根因分析:</div>
          <div style={{
            padding: '4px 7px',
            background: '#2d0a0a33',
            borderRadius: 3,
            color: '#fca5a5',
            fontSize: 9,
            fontFamily: 'monospace',
            wordBreak: 'break-word',
            lineHeight: 1.5,
            border: '1px solid #ef444433',
          }}>
            {rootCause}
          </div>
        </div>
      )}

      {/* 修复建议 */}
      {fixSuggestion && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace', marginBottom: 3 }}>修复建议:</div>
          <div style={{
            padding: '4px 7px',
            background: '#0a2a1a33',
            borderRadius: 3,
            color: '#00FF9F',
            fontSize: 9,
            fontFamily: 'monospace',
            wordBreak: 'break-word',
            lineHeight: 1.5,
            border: '1px solid #00FF9F33',
          }}>
            {fixSuggestion}
          </div>
        </div>
      )}

      {/* 节点 ID */}
      <div style={{ marginTop: 6, padding: '3px 6px', background: `${style.bg}`, border: `1px solid ${style.border}33`, borderRadius: 3 }}>
        <span style={{ color: '#64748b', fontSize: 9 }}>节点 ID: </span>
        <span style={{ color: '#475569', fontSize: 9 }}>{node.id}</span>
      </div>
    </div>
  );
};

// ─── Legend 图例组件 ──────────────────────────────────────────────────────────

const CpgLegend: React.FC = () => (
  <div
    style={{
      background: '#0a0f1a',
      border: '1px solid #1e293b',
      borderRadius: 6,
      padding: '8px 10px',
      minWidth: 160,
    }}
  >
    <div style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace', marginBottom: 6, letterSpacing: 1 }}>
      LEGEND
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(Object.entries(NODE_STYLES) as [CpgNodeType, typeof NODE_STYLES[CpgNodeType]][]).map(([type, s]) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: type === 'sink' ? 2 : '50%', border: `1.5px solid ${s.border}`, background: s.bg, flexShrink: 0 }} />
          <span style={{ color: '#94a3b8', fontSize: 9, fontFamily: 'monospace' }}>{type.toUpperCase()}</span>
        </div>
      ))}
    </div>
    <div style={{ borderTop: '1px solid #1e293b', marginTop: 6, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {(Object.entries(EDGE_STYLES) as [CpgEdgeType, typeof EDGE_STYLES[CpgEdgeType]][]).map(([type, s]) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 20, height: 2, background: s.stroke, flexShrink: 0, borderRadius: 1 }} />
          <span style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace' }}>{s.label}</span>
        </div>
      ))}
    </div>
  </div>
);

// ─── 主组件 CpgGraph ──────────────────────────────────────────────────────────

interface CpgGraphProps {
  /** 外部传入的 CPG 数据（Joern 生成的 JSON），为空时使用默认示例数据 */
  cpgData?: CpgGraphData | null;
  /** 外部传入的 CPG 数据（别名） */
  data?: CpgGraphData | null;
  /** 当前选中的文件路径，用于高亮相关节点 */
  selectedFile?: string | null;
  /** 是否处于加载状态 */
  loading?: boolean;
  /** 加载提示文字 */
  loadingText?: string;
  /** 节点点击回调 */
  onNodeClick?: (nodeId: string, nodeData: Record<string, unknown>) => void;
  /**
   * 外部触发高亮的节点 ID（SCA-008 双向联动）
   * 当 Vuln List 点击某条漏洞时，传入对应的 Sink 节点 ID，
   * CpgGraph 自动高亮该节点及其连接路径。
   */
  highlightNodeId?: string | null;
  /**
   * TC-SCA-019 G6: Joern 工具链错误或 JSON 解析失败时传入的错误信息。
   * 传入时图谱区域显示错误态 Banner，不崩溃，不白屏。
   */
  joernError?: string | null;
}

const CpgGraph: React.FC<CpgGraphProps> = ({
  cpgData,
  data: dataProp,
  selectedFile,
  loading = false,
  loadingText = '正在生成 CPG 图谱...',
  onNodeClick: onNodeClickProp,
  highlightNodeId,
  joernError,
}) => {
  const data = cpgData || dataProp || DEFAULT_CPG_DATA;
  const { nodes: initNodes, edges: initEdges } = useMemo(() => cpgDataToFlow(data), [data]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const [selectedNode, setSelectedNode] = useState<Node<CpgNodeData> | null>(null);

  // 当 cpgData 变化时重置图谱
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = cpgDataToFlow(data);
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNode(null);
  }, [cpgData, data, setNodes, setEdges]);

  // SCA-008：外部 highlightNodeId 变化时，自动高亮对应节点及路径（双向联动）
  useEffect(() => {
    if (!highlightNodeId) {
      // 取消所有高亮
      setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, highlighted: false } })));
      setEdges((eds) => eds.map((e) => ({
        ...e,
        animated: (e.data as CpgEdgeData)?.edgeType === 'taintprop' || (e.data as CpgEdgeData)?.edgeType === 'dataflow',
        style: { ...e.style, strokeWidth: 1.5, opacity: 1 },
      })));
      setSelectedNode(null);
      return;
    }

    // 找到目标节点
    setNodes((nds) => {
      const targetNode = nds.find((n) => n.id === highlightNodeId);
      if (!targetNode) return nds;

      // 更新 selectedNode
      setSelectedNode(targetNode as Node<CpgNodeData>);

      // 找出所有与该节点相连的边和邻居
      const connectedEdgeIds = new Set<string>();
      const connectedNodeIds = new Set<string>([highlightNodeId]);
      edges.forEach((e) => {
        if (e.source === highlightNodeId || e.target === highlightNodeId) {
          connectedEdgeIds.add(e.id);
          connectedNodeIds.add(e.source);
          connectedNodeIds.add(e.target);
        }
      });

      // 高亮边
      setEdges((eds) => eds.map((e) => ({
        ...e,
        animated: connectedEdgeIds.has(e.id) ? true : (e.data as CpgEdgeData)?.edgeType === 'taintprop' || (e.data as CpgEdgeData)?.edgeType === 'dataflow',
        style: {
          ...e.style,
          strokeWidth: connectedEdgeIds.has(e.id) ? 2.5 : 1.5,
          opacity: connectedEdgeIds.has(e.id) ? 1 : 0.3,
        },
      })));

      return nds.map((n) => ({
        ...n,
        data: { ...n.data, highlighted: connectedNodeIds.has(n.id) },
      }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightNodeId]);

  // 节点点击：高亮该节点及其所有相连边和邻居节点
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const typedNode = node as Node<CpgNodeData>;
      setSelectedNode(typedNode);

      // 找出所有与该节点相连的边
      const connectedEdgeIds = new Set<string>();
      const connectedNodeIds = new Set<string>([node.id]);
      edges.forEach((e) => {
        if (e.source === node.id || e.target === node.id) {
          connectedEdgeIds.add(e.id);
          connectedNodeIds.add(e.source);
          connectedNodeIds.add(e.target);
        }
      });

      // 高亮相关节点
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, highlighted: connectedNodeIds.has(n.id) },
        }))
      );

      // 高亮相关边（加粗 + 动画）
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: connectedEdgeIds.has(e.id) ? true : (e.data as CpgEdgeData)?.edgeType === 'taintprop' || (e.data as CpgEdgeData)?.edgeType === 'dataflow',
          style: {
            ...e.style,
            strokeWidth: connectedEdgeIds.has(e.id) ? 2.5 : 1.5,
            opacity: connectedEdgeIds.has(e.id) ? 1 : 0.3,
          },
        }))
      );
       // 调用外部回调
      if (onNodeClickProp) {
        onNodeClickProp(node.id, typedNode.data as unknown as Record<string, unknown>);
      }
    },
    [edges, setNodes, setEdges, onNodeClickProp]
  );
  // 点击画布空白处：取消高亮
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, highlighted: false } })));
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        animated: (e.data as CpgEdgeData)?.edgeType === 'taintprop' || (e.data as CpgEdgeData)?.edgeType === 'dataflow',
        style: { ...e.style, strokeWidth: 1.5, opacity: 1 },
      }))
    );
  }, [setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#060d1a' }}>
      {/* TC-SCA-019 G6: Joern 错误态 Banner */}
      {joernError && (
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 0,
            right: 0,
            zIndex: 300,
            background: '#2d0a0a',
            border: '1px solid #ef4444',
            borderLeft: '3px solid #ef4444',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: '#ef4444', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>
            ⚠ JOERN ERROR
          </span>
          <span style={{ color: '#fca5a5', fontSize: 9, fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {joernError}
          </span>
          <span style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace' }}>
            [显示默认示例数据]
          </span>
        </div>
      )}
      {/* 文件标题栏 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 28,
          background: '#0a1628',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 12,
          gap: 8,
          zIndex: 10,
        }}
      >
        <span style={{ color: '#00FF9F', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>
          CPG
        </span>
        <span style={{ color: '#1e293b', fontSize: 9 }}>|</span>
        <span style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace' }}>
          {selectedFile || data.file || 'workspace'}
        </span>
        {data.cvss != null && (
          <>
            <span style={{ color: '#1e293b', fontSize: 9 }}>|</span>
            <span style={{
              fontSize: 9,
              fontFamily: 'monospace',
              fontWeight: 700,
              color: data.cvss >= 9.0 ? '#ef4444' : data.cvss >= 7.0 ? '#f59e0b' : '#00FF9F',
            }}>
              CVSS {data.cvss.toFixed(1)}
            </span>
          </>
        )}
        {data.cveId && (
          <>
            <span style={{ color: '#1e293b', fontSize: 9 }}>|</span>
            <span style={{ color: '#ef4444', fontSize: 9, fontFamily: 'monospace', fontWeight: 700 }}>
              {data.cveId}
            </span>
          </>
        )}
        <span style={{ marginLeft: 'auto', color: '#1e293b', fontSize: 9, fontFamily: 'monospace', paddingRight: 12 }}>
          {data.nodes.length}N / {data.edges.length}E
        </span>
      </div>

      {/* React Flow 图谱 */}
      <div style={{ position: 'absolute', top: 28, left: 0, right: 0, bottom: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={3}
          style={{ background: '#060d1a' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#1e293b"
          />
          <Controls
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 6,
            }}
          />
          <MiniMap
            style={{
              background: '#0a0f1a',
              border: '1px solid #1e293b',
            }}
            nodeColor={(n) => {
              const nd = n as Node<CpgNodeData>;
              return NODE_STYLES[nd.data?.nodeType]?.border || '#475569';
            }}
            maskColor="#060d1a88"
          />
          <Panel position="top-left">
            <CpgLegend />
          </Panel>
        </ReactFlow>
      </div>

      {/* 增强版节点属性面板（SCA-008） */}
      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode as Node<CpgNodeData>}
          graphCvss={data.cvss}
          graphRootCause={data.rootCause}
          graphFixSuggestion={data.fixSuggestion}
          onClose={() => {
            setSelectedNode(null);
            onPaneClick();
          }}
        />
      )}

      {/* 加载遮罩 */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#060d1acc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
          }}
        >
          <div style={{ color: '#00FF9F', fontSize: 12, fontFamily: 'monospace', marginBottom: 8 }}>
            {loadingText}
          </div>
          <div
            style={{
              width: 120,
              height: 3,
              background: '#1e293b',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '40%',
                height: '100%',
                background: '#00FF9F',
                borderRadius: 2,
                animation: 'cpg-loading 1.2s ease-in-out infinite',
              }}
            />
          </div>
          <style>{`
            @keyframes cpg-loading {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(350%); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default CpgGraph;
export { DEFAULT_CPG_DATA, cpgDataToFlow, NODE_STYLES, EDGE_STYLES };
