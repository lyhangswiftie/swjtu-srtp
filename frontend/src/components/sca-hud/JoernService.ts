/**
 * JoernService.ts
 *
 * SeCodeAct Joern 工具链集成服务层（SCA-006）
 *
 * 职责：
 * 1. 解析 Agent 命令输出中的 SCA_CPG_JSON 标记，提取真实 Joern CPG 数据
 * 2. 将 Joern DOT/JSON 格式转换为 CpgGraphData 格式
 * 3. 提供 Joern 命令生成工具函数
 */

import type { CpgGraphData } from './CpgGraph';

// 内联类型别名（与 CpgGraphData 内联类型对齐）
type CpgNode = CpgGraphData['nodes'][number];
type CpgEdge = CpgGraphData['edges'][number];

// ── 常量定义 ────────────────────────────────────────────────────────────────

/** Agent 输出中嵌入 CPG JSON 的标记前缀 */
export const CPG_JSON_MARKER = 'SCA_CPG_JSON:';

/** Joern 执行日志标记前缀 */
export const JOERN_LOG_MARKER = '[SCA-006]';

/** Joern 工具链路径（容器内） */
export const JOERN_CLI_PATH = '/opt/joern/joern-cli';

// ── 类型定义 ────────────────────────────────────────────────────────────────

/** Joern DOT 节点原始数据 */
interface JoernDotNode {
  id: string;
  joernType: string;
  label: string;
  line: number;
  code: string;
}

/** Joern DOT 边原始数据 */
interface JoernDotEdge {
  source: string;
  target: string;
  label: string;
}

// ── 核心解析函数 ────────────────────────────────────────────────────────────

/**
 * 从 Agent 命令输出中提取嵌入的 CPG JSON 数据。
 *
 * Agent 在执行 Joern 脚本后，会在输出中写入：
 *   SCA_CPG_JSON:{"nodes":[...],"edges":[...]}
 *
 * @param commandOutput - Agent 命令执行的完整输出文本
 * @returns 解析后的 CpgGraphData，若未找到标记则返回 null
 */
export function extractCpgJsonFromOutput(commandOutput: string): CpgGraphData | null {
  const lines = commandOutput.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(CPG_JSON_MARKER)) {
      const jsonStr = trimmed.slice(CPG_JSON_MARKER.length).trim();
      try {
        const raw = JSON.parse(jsonStr);
        return normalizeCpgData(raw);
      } catch (e) {
        console.error('[JoernService] CPG JSON 解析失败:', e);
        return null;
      }
    }
  }
  return null;
}

/**
 * 将原始 Joern CPG 数据规范化为 CpgGraphData 格式。
 * 支持多种输入格式：
 * - 已是 CpgGraphData 格式（直接返回）
 * - Joern DOT 解析后的格式
 * - Joern GraphML/GraphSON 格式
 */
export function normalizeCpgData(raw: Record<string, unknown>): CpgGraphData {
  // 已是标准格式
  if (Array.isArray(raw.nodes) && Array.isArray(raw.edges)) {
    return {
      cveId: (raw.cveId as string) || 'REAL-CPG',
      file: (raw.file as string) || '',
      nodes: (raw.nodes as CpgNode[]).map(normalizeNode),
      edges: (raw.edges as CpgEdge[]).map(normalizeEdge),
    };
  }

  // Joern 的 vertices/edges 格式（GraphSON）
  if (Array.isArray(raw.vertices)) {
    const nodes = (raw.vertices as Record<string, unknown>[]).map(convertVertexToNode);
    const edges = (raw.edges as Record<string, unknown>[]).map(convertEdgeToEdge);
    return {
      cveId: 'REAL-CPG',
      file: (raw.file as string) || '',
      nodes,
      edges,
    };
  }

  console.warn('[JoernService] 未知 CPG 数据格式，返回空图');
  return { cveId: 'REAL-CPG', file: '', nodes: [], edges: [] };
}

/** 规范化节点数据，确保所有必填字段存在 */
function normalizeNode(raw: Partial<CpgNode>): CpgNode {
  return {
    id: raw.id || `n${Math.random().toString(36).slice(2)}`,
    type: validateNodeType(raw.type),
    label: raw.label || raw.id || 'unknown',
    subLabel: raw.subLabel || '',
    code: raw.code || '',
    file: raw.file || '',
    line: raw.line ?? -1,
  };
}

/** 规范化边数据 */
function normalizeEdge(raw: Partial<CpgEdge>): CpgEdge {
  return {
    id: raw.id || `e${Math.random().toString(36).slice(2)}`,
    source: raw.source || '',
    target: raw.target || '',
    type: validateEdgeType(raw.type),
    label: raw.label || '',
  };
}

/** 将 GraphSON vertex 转换为 CpgNode */
function convertVertexToNode(v: Record<string, unknown>): CpgNode {
  const props = (v.properties as Record<string, unknown>) || {};
  const name = (props.NAME as string) || String(v.id || '');
  const joernType = String(v.label || 'UNKNOWN');
  return {
    id: String(v.id || Math.random()),
    type: joernTypeToNodeType(joernType, name),
    label: name.slice(0, 60),
    subLabel: joernType,
    code: (props.CODE as string) || '',
    file: (props.FILENAME as string) || '',
    line: (props.LINE_NUMBER as number) ?? -1,
  };
}

/** 将 GraphSON edge 转换为 CpgEdge */
function convertEdgeToEdge(e: Record<string, unknown>): CpgEdge {
  return {
    id: String(e.id || Math.random()),
    source: String(e.outV || e.source || ''),
    target: String(e.inV || e.target || ''),
    type: joernEdgeLabelToType(String(e.label || '')),
    label: String(e.label || ''),
  };
}

// ── 类型映射函数 ────────────────────────────────────────────────────────────

/** 将 Joern 节点类型映射到 SeCodeAct 前端节点类型 */
export function joernTypeToNodeType(
  joernType: string,
  code: string = '',
): CpgNode['type'] {
  const t = joernType.toUpperCase();
  const c = code.toLowerCase();

  if (t === 'PARAM') return 'source';

  const dangerousFuncs = ['strcpy', 'strcat', 'sprintf', 'gets', 'scanf',
    'system', 'exec', 'popen', 'memcpy', 'strncpy', 'printf'];
  if (t === 'CALL' && dangerousFuncs.some((d) => c.includes(d))) return 'sink';

  if (['METHOD', 'METHOD_RETURN', 'BLOCK'].includes(t)) return 'cfg';
  if (t === 'CALL') return 'call';
  if (t === 'IDENTIFIER') return 'taint';

  return 'ast';
}

/** 将 Joern 边标签映射到 SeCodeAct 边类型 */
export function joernEdgeLabelToType(label: string): CpgEdge['type'] {
  const l = label.toLowerCase();
  if (l.includes('cfg') || l.includes('control')) return 'controlflow';
  if (l.includes('ddg') || l.includes('data') || l.includes('reaching')) return 'dataflow';
  if (l.includes('call') || l.includes('invoke')) return 'callrel';
  if (l.includes('taint') || l.includes('flow')) return 'taintprop';
  return 'dataflow';
}

/** 验证节点类型合法性 */
function validateNodeType(type: unknown): CpgNode['type'] {
  const valid: CpgNode['type'][] = ['source', 'sink', 'cfg', 'call', 'taint', 'ast'];
  return valid.includes(type as CpgNode['type']) ? (type as CpgNode['type']) : 'ast';
}

/** 验证边类型合法性 */
function validateEdgeType(type: unknown): CpgEdge['type'] {
  const valid: CpgEdge['type'][] = ['dataflow', 'controlflow', 'taintprop', 'callrel'];
  return valid.includes(type as CpgEdge['type']) ? (type as CpgEdge['type']) : 'dataflow';
}

// ── Joern 命令生成 ──────────────────────────────────────────────────────────

/**
 * 生成 Joern CPG 分析命令。
 *
 * 该命令在 Agent 容器内执行，完成以下步骤：
 * 1. 调用 joern-parse 生成 CPG 二进制文件
 * 2. 调用 joern-export 导出 DOT 格式
 * 3. 调用 Python 脚本将 DOT 转换为 JSON
 * 4. 输出带 SCA_CPG_JSON: 标记的 JSON 数据供前端解析
 *
 * @param filePath - 要分析的源文件路径（容器内绝对路径）
 * @returns 完整的 shell 命令字符串
 */
export function buildJoernCommand(filePath: string): string {
  const escapedPath = filePath.replace(/'/g, "'\\''");
  const srcDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
  const cpgBin = '/tmp/sca_cpg_$(date +%s).bin';
  const exportDir = '/tmp/sca_cpg_export_$(date +%s)';

  return [
    `echo "[SCA-006] 开始 Joern CPG 分析: ${escapedPath}"`,
    `echo "[SCA-006] Joern 版本: $(${JOERN_CLI_PATH}/joern --version 2>&1 | grep -o 'Version: [0-9.]*' || echo 'unknown')"`,
    `CPG_BIN=${cpgBin}`,
    `EXPORT_DIR=${exportDir}`,
    `echo "[SCA-006] 步骤1: 生成 CPG 二进制..."`,
    `${JOERN_CLI_PATH}/joern-parse '${escapedPath}' -o $CPG_BIN 2>&1`,
    `echo "[SCA-006] 步骤2: 导出 DOT 格式..."`,
    `${JOERN_CLI_PATH}/joern-export --repr cpg14 --format dot $CPG_BIN --out $EXPORT_DIR 2>&1`,
    `echo "[SCA-006] 步骤3: 转换为 JSON..."`,
    `python3 /workspace/scripts/cpg_to_json.py --dot $EXPORT_DIR --output /tmp/sca_cpg_result.json --file '${escapedPath}' 2>&1`,
    `echo "[SCA-006] 步骤4: 输出 CPG JSON..."`,
    `echo -n "${CPG_JSON_MARKER}" && cat /tmp/sca_cpg_result.json`,
    `echo "[SCA-006] CPG 分析完成"`,
  ].join(' && ');
}

/**
 * 生成简化版 Joern 命令（用于快速测试，直接输出内联 JSON）。
 * 适用于 Joern 已安装但 Python 脚本不可用的场景。
 */
export function buildJoernCommandSimple(filePath: string): string {
  const escapedPath = filePath.replace(/'/g, "'\\''");
  return [
    `echo "[SCA-006] Joern CPG 分析: ${escapedPath}"`,
    `${JOERN_CLI_PATH}/joern-parse '${escapedPath}' -o /tmp/sca_cpg.bin 2>&1`,
    `echo "[SCA-006] CPG 生成完成"`,
    // 输出简化版 JSON（包含文件路径信息）
    `echo "${CPG_JSON_MARKER}$(python3 -c "import json; print(json.dumps({'cveId':'REAL-CPG','file':'${escapedPath}','nodes':[],'edges':[],'status':'cpg_generated'}))")"`,
  ].join(' && ');
}

// ── Joern 日志解析 ──────────────────────────────────────────────────────────

/**
 * 检查命令输出是否包含 Joern 执行日志。
 */
export function hasJoernLog(output: string): boolean {
  return output.includes(JOERN_LOG_MARKER) || output.includes('joern-parse') || output.includes('Joern');
}

/**
 * 从命令输出中提取 Joern 执行日志行。
 */
export function extractJoernLogs(output: string): string[] {
  return output
    .split('\n')
    .filter((line) => line.includes(JOERN_LOG_MARKER) || line.includes('[+]') || line.includes('Successfully'))
    .map((line) => line.trim());
}
