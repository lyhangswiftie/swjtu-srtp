#!/usr/bin/env python3
"""
cpg_to_json.py — Joern DOT CPG 转换为 SeCodeAct HUD JSON 格式（SCA-009 双层架构版）

双层 CPG 架构：
  - 完整模式（默认）：输出所有节点，适合后端存储和深度分析
  - 聚焦子图模式（--focused）：仅输出漏洞关键路径节点（Source/Sink/Taint），
    节点数量控制在 50 个以内，确保前端 React Flow 高性能渲染

使用方式：
  python3 cpg_to_json.py <dot_dir> [--focused] [--cve CVE-ID] [--output output.json] [--marker]
"""

import os, sys, re, json, argparse
from pathlib import Path


# Joern 节点类型 → SeCodeAct 语义分类
# 基于 Joern CPG 规范：https://cpg.joern.io/
JOERN_TYPE_TO_SEMANTIC = {
    # Source 类：外部输入入口
    'PARAM': 'source',
    'METHOD_PARAMETER_IN': 'source',
    'METHOD_PARAMETER_OUT': 'source',
    # Sink 类：危险操作出口
    'CALL': 'call',           # 函数调用（需进一步判断是否为危险函数）
    # CFG 类：控制流
    'CONTROL_STRUCTURE': 'cfg',
    'JUMP_TARGET': 'cfg',
    'METHOD_RETURN': 'cfg',
    'RETURN': 'cfg',
    # AST 类：语法结构
    'METHOD': 'ast',
    'BLOCK': 'ast',
    'IDENTIFIER': 'ast',
    'LITERAL': 'ast',
    'TYPE_REF': 'ast',
    'FIELD_IDENTIFIER': 'ast',
    'UNKNOWN': 'ast',
    'LOCAL': 'ast',
    'MEMBER': 'ast',
    'NAMESPACE': 'ast',
    'NAMESPACE_BLOCK': 'ast',
    'FILE': 'ast',
    'TYPE': 'ast',
    'TYPE_DECL': 'ast',
    'MODIFIER': 'ast',
    'ANNOTATION': 'ast',
    'ANNOTATION_PARAMETER': 'ast',
    'ANNOTATION_PARAMETER_ASSIGN': 'ast',
}

# 危险函数名关键词 → sink
DANGEROUS_CALL_PATTERNS = [
    # C/C++ 危险函数
    'strcpy', 'strcat', 'sprintf', 'gets', 'scanf', 'system', 'exec', 'popen',
    'memcpy', 'memmove', 'strncpy', 'snprintf',
    # Python 危险函数
    'subprocess', 'os.system', 'eval', 'exec', 'compile', 'open',
    'pickle.loads', 'yaml.load', 'marshal.loads',
    # Flask/Web 危险函数
    'ebookmeta.get_metadata', 'get_metadata', 'send_file', 'render_template_string',
    'redirect', 'make_response',
    # SQL 注入
    'cursor.execute', 'execute', 'query', 'raw', 'extra',
    # 文件操作
    'os.path.join', 'os.remove', 'shutil.copy', 'shutil.move',
    # 网络
    'requests.get', 'requests.post', 'urllib.request',
]

# 外部输入来源关键词 → source
SOURCE_PATTERNS = [
    'request.files', 'request.form', 'request.args', 'request.json',
    'request.data', 'request.get_json', 'request.values',
    'argv', 'stdin', 'input(', 'raw_input',
    'os.environ', 'getenv',
    'sys.argv',
]

# 污点传播关键词 → taint
TAINT_PATTERNS = [
    'temp_path', 'user_input', 'user_data', 'payload', 'data',
    'filename', 'file.filename', 'url', 'path', 'query',
    'username', 'password', 'token', 'key', 'secret',
]


def classify_node_type(joern_type: str, code_snippet: str) -> str:
    """基于 Joern 节点类型和代码片段进行语义分类"""
    jt = joern_type.upper().strip()
    cs = code_snippet.lower().strip()

    # 1. 基于代码片段检测 Source（优先级最高）
    for pat in SOURCE_PATTERNS:
        if pat.lower() in cs:
            return 'source'

    # 2. 基于代码片段检测 Sink
    for pat in DANGEROUS_CALL_PATTERNS:
        if pat.lower() in cs:
            return 'sink'

    # 3. 参数节点 → source
    if jt in ('PARAM', 'METHOD_PARAMETER_IN', 'METHOD_PARAMETER_OUT'):
        return 'source'

    # 4. 控制流节点
    if jt in ('CONTROL_STRUCTURE', 'JUMP_TARGET', 'METHOD_RETURN', 'RETURN'):
        return 'cfg'

    # 5. 函数调用节点
    if jt == 'CALL':
        return 'call'

    # 6. 污点传播节点（基于代码片段）
    for pat in TAINT_PATTERNS:
        if pat.lower() in cs:
            return 'taint'

    # 7. 使用 Joern 类型映射
    if jt in JOERN_TYPE_TO_SEMANTIC:
        return JOERN_TYPE_TO_SEMANTIC[jt]

    # 8. 操作符节点
    if 'operator' in jt.lower() or 'assignment' in jt.lower():
        return 'ast'

    return 'ast'


def decode_html_entities(text: str) -> str:
    """解码 DOT 文件中的 HTML 实体"""
    return (text
            .replace('&lt;', '<')
            .replace('&gt;', '>')
            .replace('&amp;', '&')
            .replace('&quot;', '"')
            .replace('&#39;', "'")
            .replace('<BR/>', '\n')
            .replace('<br/>', '\n')
            .replace('<BR>', '\n'))


def extract_node_info(raw_label: str):
    """
    从 Joern DOT 标签中提取节点类型、行号和代码片段
    
    DOT 标签格式：<NODE_TYPE, LINE_NO<BR/>CODE_SNIPPET<BR/>CONTEXT>
    例如：<IDENTIFIER, 2<BR/>request<BR/>from flask import Flask, request, jsonify>
    """
    # 解码 HTML 实体
    decoded = decode_html_entities(raw_label)
    
    # 按换行符分割
    parts = decoded.split('\n')
    first_line = parts[0].strip() if parts else ''
    
    # 提取节点类型和行号（格式：NODE_TYPE, LINE_NO）
    joern_type = ''
    line_num = None
    code_snippet = ''
    
    comma_idx = first_line.find(',')
    if comma_idx > 0:
        joern_type = first_line[:comma_idx].strip()
        rest = first_line[comma_idx+1:].strip()
        # 尝试提取行号
        try:
            line_num = int(rest.split()[0]) if rest else None
        except (ValueError, IndexError):
            pass
    else:
        joern_type = first_line.strip()
    
    # 代码片段：第二行（如果存在）
    if len(parts) > 1:
        code_snippet = parts[1].strip()
    elif first_line:
        code_snippet = first_line
    
    # 上下文：第三行（如果存在）
    context = parts[2].strip() if len(parts) > 2 else ''
    
    # 构建显示标签（优先使用代码片段，回退到节点类型）
    if code_snippet and code_snippet != joern_type:
        display_label = code_snippet
    elif context:
        display_label = context
    else:
        display_label = joern_type
    
    if len(display_label) > 60:
        display_label = display_label[:57] + '...'
    
    return joern_type, line_num, display_label, code_snippet


def parse_dot_dir(dot_dir):
    """解析 Joern DOT 导出目录，提取节点和边"""
    nodes, edges = {}, []
    dot_files = sorted(
        Path(dot_dir).glob('*.dot'),
        key=lambda p: int(p.stem) if p.stem.isdigit() else 999
    )
    
    for dot_file in dot_files:
        try:
            content = dot_file.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue
        
        # 解析节点（支持多行标签）
        # 格式："NODE_ID" [label = <...> ]
        for m in re.finditer(
            r'"(\d+)"\s*\[label\s*=\s*<(.*?)>\s*\]',
            content,
            re.DOTALL
        ):
            nid, raw = m.group(1), m.group(2)
            if nid not in nodes:
                joern_type, line, display_label, code_snippet = extract_node_info(raw)
                semantic_type = classify_node_type(joern_type, code_snippet)
                nodes[nid] = {
                    'id': nid,
                    'label': display_label,
                    'nodeType': semantic_type,
                    'joernType': joern_type,
                    'line': line,
                    'file': None,
                    'code': code_snippet,
                }
        
        # 解析边
        for m in re.finditer(
            r'"(\d+)"\s*->\s*"(\d+)"\s*\[\s*label\s*=\s*"([^"]*)"\s*\]',
            content
        ):
            edges.append({
                'source': m.group(1),
                'target': m.group(2),
                'label': m.group(3)
            })
    
    return nodes, edges


def build_focused_subgraph(nodes, edges, max_nodes=50):
    """构建漏洞聚焦子图（双层 CPG 架构的前端层）"""
    source_ids = {nid for nid, n in nodes.items() if n['nodeType'] == 'source'}
    sink_ids   = {nid for nid, n in nodes.items() if n['nodeType'] == 'sink'}
    taint_ids  = {nid for nid, n in nodes.items() if n['nodeType'] == 'taint'}
    call_ids   = {nid for nid, n in nodes.items() if n['nodeType'] == 'call'}
    
    # 如果没有 source/sink，按优先级取前 max_nodes 个节点
    if not source_ids and not sink_ids:
        prio = ['sink', 'source', 'taint', 'cfg', 'call', 'ast']
        srt = sorted(
            nodes.values(),
            key=lambda n: prio.index(n['nodeType']) if n['nodeType'] in prio else 99
        )
        ids = {n['id'] for n in srt[:max_nodes]}
        return (
            {nid: nodes[nid] for nid in ids},
            [e for e in edges if e['source'] in ids and e['target'] in ids]
        )
    
    # 构建邻接表（DDG/CFG/Taint 边）
    adj = {}
    for e in edges:
        edge_lbl = e['label'].split(':')[0].strip().upper()
        if edge_lbl in ('DDG', 'CFG', 'TAINT', 'REACHING_DEF', 'CDG', 'DOMINATE'):
            adj.setdefault(e['source'], []).append(e['target'])
    
    # 从 source 节点 BFS 到 sink 节点
    path_ids = set(source_ids) | set(sink_ids) | set(taint_ids)
    # 加入部分 call 节点
    path_ids |= set(list(call_ids)[:min(10, len(call_ids))])
    
    visited = set(source_ids)
    queue = list(source_ids)
    while queue and len(path_ids) < max_nodes - 10:
        curr = queue.pop(0)
        for nxt in adj.get(curr, []):
            if nxt not in visited:
                visited.add(nxt)
                path_ids.add(nxt)
                queue.append(nxt)
                if nxt in sink_ids:
                    break
    
    # 如果超出限制，按优先级裁剪
    if len(path_ids) > max_nodes:
        prio = ['sink', 'source', 'taint', 'cfg', 'call', 'ast']
        srt = sorted(
            path_ids,
            key=lambda nid: prio.index(nodes.get(nid, {}).get('nodeType', 'ast'))
                if nodes.get(nid, {}).get('nodeType', 'ast') in prio else 99
        )
        path_ids = set(srt[:max_nodes])
    
    # 补充少量上下文节点（AST/CFG）
    ctx = 0
    for e in edges:
        if ctx >= 10:
            break
        if (e['source'] in path_ids
                and e['target'] not in path_ids
                and nodes.get(e['target'], {}).get('nodeType') in ('ast', 'cfg')):
            path_ids.add(e['target'])
            ctx += 1
    
    fn = {nid: nodes[nid] for nid in path_ids if nid in nodes}
    fe = [e for e in edges if e['source'] in path_ids and e['target'] in path_ids]
    return fn, fe


def to_cpg_json(nodes, edges, cve_id='', focused=False):
    """将节点和边转换为 SeCodeAct HUD JSON 格式"""
    # 去重边
    seen, uedges = set(), []
    for e in edges:
        k = (e['source'], e['target'], e['label'])
        if k not in seen:
            seen.add(k)
            uedges.append(e)
    
    def edge_type(lbl):
        u = lbl.upper()
        if any(k in u for k in ('DDG', 'TAINT', 'REACHING_DEF')): return 'taint'
        if any(k in u for k in ('CFG', 'CDG', 'DOMINATE')): return 'control'
        if any(k in u for k in ('CALL', 'INVOKE', 'DISPATCH')): return 'call'
        return 'data'
    
    cpg_nodes = [
        {
            'id': nid,
            'label': n['label'],
            'nodeType': n['nodeType'],
            'file': n.get('file') or '',
            'line': n.get('line') or 0,
            'properties': {
                'nodeType': n['nodeType'],
                'joernType': n.get('joernType', ''),
                'file': n.get('file') or '',
                'line': n.get('line') or 0,
                'code': n.get('code', ''),
                'cve': cve_id,
                'focused': focused,
            }
        }
        for nid, n in nodes.items()
    ]
    
    cpg_edges = [
        {
            'id': f"e-{e['source']}-{e['target']}",
            'source': e['source'],
            'target': e['target'],
            'edgeType': edge_type(e['label']),
            'label': e['label'],
        }
        for e in uedges
        if e['source'] in nodes and e['target'] in nodes
    ]
    
    td = {}
    for n in cpg_nodes:
        td[n['nodeType']] = td.get(n['nodeType'], 0) + 1
    
    return {
        'nodes': cpg_nodes,
        'edges': cpg_edges,
        'metadata': {
            'cve': cve_id,
            'focused': focused,
            'nodeCount': len(cpg_nodes),
            'edgeCount': len(cpg_edges),
            'typeDistribution': td,
            'generator': 'Joern v4.0.516 + cpg_to_json.py (SCA-009)',
        }
    }


def main():
    parser = argparse.ArgumentParser(description='Joern DOT CPG → SeCodeAct HUD JSON (SCA-009)')
    parser.add_argument('dot_dir', nargs='?', help='Joern DOT 导出目录')
    parser.add_argument('--dot', help='Joern DOT 导出目录（备用参数）')
    parser.add_argument('--input', help='旧版：Joern JSON 输入文件')
    parser.add_argument('--focused', action='store_true', help='聚焦子图模式')
    parser.add_argument('--cve', default='', help='CVE 编号')
    parser.add_argument('--output', '-o', default='-', help='输出路径（默认 stdout）')
    parser.add_argument('--max-nodes', type=int, default=None)
    parser.add_argument('--marker', action='store_true', help='输出前添加 SCA_CPG_JSON: 标记')
    parser.add_argument('--file', default='', help='源文件路径（旧版兼容）')
    args = parser.parse_args()

    dot_dir = args.dot_dir or args.dot
    if not dot_dir and not args.input:
        parser.print_help()
        sys.exit(1)

    if args.input and not dot_dir:
        with open(args.input) as f:
            data = json.load(f)
        if args.output != '-':
            with open(args.output, 'w') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"[cpg_to_json] 旧版兼容模式，已写入: {args.output}", file=sys.stderr)
        else:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        return

    if not os.path.isdir(dot_dir):
        print(f"错误：目录不存在: {dot_dir}", file=sys.stderr)
        sys.exit(1)

    nodes, edges = parse_dot_dir(dot_dir)
    if not nodes:
        print(f"错误：未找到有效节点", file=sys.stderr)
        sys.exit(1)
    print(f"[cpg_to_json] 解析完成：{len(nodes)} 节点，{len(edges)} 边", file=sys.stderr)

    if args.focused:
        max_n = args.max_nodes or 50
        print(f"[cpg_to_json] 聚焦子图模式（最多 {max_n} 节点）", file=sys.stderr)
        nodes, edges = build_focused_subgraph(nodes, edges, max_n)
        print(f"[cpg_to_json] 聚焦子图：{len(nodes)} 节点，{len(edges)} 边", file=sys.stderr)
    else:
        max_n = args.max_nodes or 200
        prio = ['sink', 'source', 'taint', 'cfg', 'call', 'ast']
        srt = sorted(
            nodes.keys(),
            key=lambda nid: prio.index(nodes[nid]['nodeType'])
                if nodes[nid]['nodeType'] in prio else 99
        )
        sel = set(srt[:max_n])
        nodes = {nid: nodes[nid] for nid in sel}
        edges = [e for e in edges if e['source'] in sel and e['target'] in sel]

    result = to_cpg_json(nodes, edges, args.cve, args.focused)
    json_str = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output == '-':
        if args.marker:
            print(f"SCA_CPG_JSON:{json_str}")
        else:
            print(json_str)
    else:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(json_str)
        print(f"[cpg_to_json] 已写入: {args.output}", file=sys.stderr)
        if args.marker:
            print(f"SCA_CPG_JSON:{json_str}")


# ── TC-SCA-019 兼容层 ─────────────────────────────────────────────────────────
# 当使用 --dot + --output + --file 参数时，输出符合 TC-SCA-019 Schema 的 JSON
# Schema: { cveId, file, generatedAt, nodes, edges, meta }

import datetime as _dt

SINK_FUNCTIONS_019 = {
    'zbx_db_execute', 'zbx_db_query', 'strcpy', 'strcat', 'sprintf', 'gets',
    'system', 'popen', 'exec', 'execve', 'eval', 'mysql_query', 'sqlite3_exec',
    'snprintf', 'memcpy',
}

def _classify_node_type_019(joern_type: str, code_str: str) -> str:
    """TC-SCA-019 节点类型分类
    支持真实 Joern 输出：函数调用节点的类型字段是函数名（如 printf）而非 CALL
    """
    jt = joern_type.upper()
    jt_lower = joern_type.lower()
    cs = code_str.lower()
    # source: 参数节点
    if any(t in jt for t in ['METHOD_PARAMETER_IN', 'PARAM']):
        return 'source'
    # sink: 危险函数调用（节点类型字段就是函数名）
    for func in SINK_FUNCTIONS_019:
        if func.lower() == jt_lower or func.lower() in cs:
            return 'sink'
    # call: 其他函数调用
    if 'CALL' in jt:
        return 'call'
    # 如果节点类型字段不是大写关键字，则可能是函数名（真实 Joern 格式）
    known_types = {'METHOD', 'BLOCK', 'IDENTIFIER', 'LOCAL', 'LITERAL', 'PARAM',
                   'METHOD_PARAMETER_IN', 'METHOD_PARAMETER_OUT', 'METHOD_RETURN',
                   'RETURN', 'CONTROL_STRUCTURE', 'JUMP_TARGET', 'UNKNOWN',
                   'TYPE_REF', 'FIELD_IDENTIFIER', 'NAMESPACE', 'NAMESPACE_BLOCK',
                   'FILE', 'TYPE', 'TYPE_DECL', 'MODIFIER', 'ANNOTATION', 'MEMBER'}
    if jt not in known_types and not jt.startswith('<OPERATOR>'):
        # 节点类型字段是函数名（真实 Joern 调用节点）
        return 'call'
    if any(t in jt for t in ['IDENTIFIER', 'LOCAL']):
        return 'taint'
    if any(t in jt for t in ['METHOD', 'BLOCK', 'CONTROL_STRUCTURE']):
        return 'cfg'
    return 'ast'

def _classify_edge_type_019(edge_label: str) -> str:
    """TC-SCA-019 边类型分类"""
    u = edge_label.upper()
    if 'CFG' in u: return 'controlflow'
    if any(t in u for t in ['DDG', 'REACHING_DEF', 'DATAFLOW']): return 'dataflow'
    if 'CALL' in u: return 'callrel'
    return 'taintprop'

def _parse_dot_for_019(dot_path: str) -> tuple:
    """解析 DOT 文件为 TC-SCA-019 格式的节点/边列表
    支持真实 Joern 输出格式：
      "ID" [label = <TYPE, LINE<BR/>LABEL<BR/>CODE>]
    和标准格式：
      id [label="TYPE\\nLABEL\\nLINE_NUMBER: N\\nCODE: ..."]
    """
    import re as _re
    nodes_019 = []
    edges_019 = []
    raw_to_idx = {}

    with open(dot_path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # 解析节点：支持两种格式
    # 格式 1（真实 Joern）: "ID" [label = <TYPE, LINE<BR/>LABEL<BR/>CODE>]
    # 格式 2（标准）: id [label="TYPE\\nLABEL\\nLINE_NUMBER: N\\nCODE: ..."]
    node_pat_joern = _re.compile(
        r'^\s*"(\d+)"\s*\[label\s*=\s*<(.*?)>\s*\]',
        _re.MULTILINE | _re.DOTALL
    )
    node_pat_std = _re.compile(
        r'^\s*(\w+)\s*\[.*?label\s*=\s*"(.*?)".*?\]',
        _re.MULTILINE | _re.DOTALL
    )

    i = 0

    def _parse_joern_label(raw_label):
        """\u89e3析 Joern HTML-like 标签: TYPE, LINE<BR/>LABEL<BR/>CODE"""
        # 去除 HTML 标签
        clean = _re.sub(r'<BR/?>', '\n', raw_label, flags=_re.IGNORECASE)
        clean = _re.sub(r'<[^>]+>', '', clean)
        parts = [p.strip() for p in clean.split('\n') if p.strip()]
        if not parts:
            return 'UNKNOWN', 0, raw_label, ''
        # 第一行："TYPE, LINE"
        first = parts[0]
        node_type_raw = 'UNKNOWN'
        line_num = 0
        comma_idx = first.find(',')
        if comma_idx > 0:
            node_type_raw = first[:comma_idx].strip()
            rest = first[comma_idx+1:].strip()
            try:
                line_num = int(rest.split()[0])
            except (ValueError, IndexError):
                pass
        else:
            node_type_raw = first.strip()
        node_label = parts[1].strip() if len(parts) > 1 else node_type_raw
        code_str = parts[2].strip() if len(parts) > 2 else node_label
        if len(node_label) > 80:
            node_label = node_label[:77] + '...'
        return node_type_raw, line_num, node_label, code_str

    # 先尝试 Joern 格式
    joern_matches = list(node_pat_joern.finditer(content))
    if joern_matches:
        for m in joern_matches:
            raw_id = m.group(1)
            raw_label = m.group(2)
            node_type_raw, line_num, node_label, code_str = _parse_joern_label(raw_label)
            node_id = f'node_{i}'
            raw_to_idx[raw_id] = node_id
            nodes_019.append({
                'id': node_id,
                'type': _classify_node_type_019(node_type_raw, code_str or node_label),
                'label': node_label,
                'subLabel': node_type_raw,
                'file': '',
                'line': line_num,
                'code': code_str or node_label,
            })
            i += 1
    else:
        # 回退到标准格式
        for m in node_pat_std.finditer(content):
            raw_id = m.group(1)
            if raw_id in ('digraph', 'graph', 'node', 'edge', 'subgraph'):
                continue
            raw_label = m.group(2).replace('\\n', '\n').replace('\\"', '"')
            parts = [p.strip() for p in raw_label.split('\n') if p.strip()]
            node_type_raw = parts[0] if parts else 'UNKNOWN'
            node_label = parts[1] if len(parts) > 1 else raw_id
            line_num = 0
            code_str = ''
            for p in parts:
                lm = _re.match(r'LINE_NUMBER:\s*(\d+)', p)
                if lm: line_num = int(lm.group(1))
                cm = _re.match(r'CODE:\s*(.+)', p)
                if cm: code_str = cm.group(1)
            node_id = f'node_{i}'
            raw_to_idx[raw_id] = node_id
            nodes_019.append({
                'id': node_id,
                'type': _classify_node_type_019(node_type_raw, code_str or node_label),
                'label': node_label,
                'subLabel': node_type_raw,
                'file': '',
                'line': line_num,
                'code': code_str or node_label,
            })
            i += 1

    # 解析边：支持 "ID" -> "ID" [和 id -> id [
    edge_pat_joern = _re.compile(
        r'^\s*"(\d+)"\s*->\s*"(\d+)"\s*(?:\[\s*label\s*=\s*"([^"]*?)"\s*\])?',
        _re.MULTILINE
    )
    edge_pat_std = _re.compile(
        r'^\s*(\w+)\s*->\s*(\w+)\s*(?:\[.*?label\s*=\s*"(.*?)".*?\])?',
        _re.MULTILINE
    )
    j = 0
    edge_pat = edge_pat_joern if joern_matches else edge_pat_std
    for m in edge_pat.finditer(content):
        src, dst = m.group(1), m.group(2)
        if src not in raw_to_idx or dst not in raw_to_idx:
            continue
        lbl = (m.group(3) or 'dataflow').strip()
        edges_019.append({
            'id': f'edge_{j}',
            'source': raw_to_idx[src],
            'target': raw_to_idx[dst],
            'type': _classify_edge_type_019(lbl),
            'label': lbl,
        })
        j += 1

    return nodes_019, edges_019

def _parse_dot_dir_for_019(dot_dir: str) -> tuple:
    """解析目录中所有 .dot 文件"""
    import re as _re
    from pathlib import Path as _Path
    all_nodes, all_edges = [], []
    dot_files = sorted(_Path(dot_dir).glob('**/*.dot'))
    if not dot_files:
        dot_files = sorted(_Path(dot_dir).glob('**/*.gv'))
    if not dot_files:
        raise FileNotFoundError(f'No .dot files in {dot_dir}')
    node_off, edge_off = 0, 0
    for df in dot_files:
        ns, es = _parse_dot_for_019(str(df))
        id_map = {}
        for n in ns:
            new_id = f'node_{node_off}'
            id_map[n['id']] = new_id
            n['id'] = new_id
            node_off += 1
        for e in es:
            e['id'] = f'edge_{edge_off}'
            e['source'] = id_map.get(e['source'], e['source'])
            e['target'] = id_map.get(e['target'], e['target'])
            edge_off += 1
        all_nodes.extend(ns)
        all_edges.extend(es)
    return all_nodes, all_edges

def _build_019_schema(nodes, edges, source_file, cve_id):
    """构建 TC-SCA-019 CPG JSON Schema"""
    return {
        'cveId': cve_id,
        'file': source_file,
        'generatedAt': _dt.datetime.utcnow().isoformat() + 'Z',
        'nodes': nodes,
        'edges': edges,
        'meta': {
            'tool': 'joern',
            'format': 'dot',
            'nodeCount': len(nodes),
            'edgeCount': len(edges),
            'sourceTypes': list({n['type'] for n in nodes}),
            'edgeTypes': list({e['type'] for e in edges}),
        }
    }

def _validate_019_schema(data):
    required = ['cveId', 'file', 'generatedAt', 'nodes', 'edges']
    for k in required:
        if k not in data:
            return False, f'Missing: {k}'
    if not isinstance(data['nodes'], list): return False, 'nodes must be array'
    if not isinstance(data['edges'], list): return False, 'edges must be array'
    for i, n in enumerate(data['nodes']):
        for f in ('id', 'type', 'label'):
            if f not in n: return False, f'node[{i}] missing {f}'
    for i, e in enumerate(data['edges']):
        for f in ('source', 'target', 'type'):
            if f not in e: return False, f'edge[{i}] missing {f}'
    return True, 'OK'

def main_019():
    """TC-SCA-019 专用入口：python3 cpg_to_json.py --dot <dir> --output <json> --file <src>"""
    import argparse as _ap
    parser = _ap.ArgumentParser(description='TC-SCA-019: DOT → SCA CPG JSON')
    parser.add_argument('--dot', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--file', required=True)
    parser.add_argument('--cve-id', default='REAL-CPG')
    args = parser.parse_args()

    print(f'[SCA-019 CPG] 输入: {args.dot}')
    print(f'[SCA-019 CPG] 源码: {args.file}')
    print(f'[SCA-019 CPG] 输出: {args.output}')

    from pathlib import Path as _Path
    dot_path = _Path(args.dot)
    if dot_path.is_dir():
        nodes, edges = _parse_dot_dir_for_019(str(dot_path))
    elif dot_path.is_file():
        nodes, edges = _parse_dot_for_019(str(dot_path))
    else:
        print(f'[SCA-019 CPG][ERROR] DOT path not found: {args.dot}', file=sys.stderr)
        sys.exit(1)

    # 为节点补充 file 字段
    fname = os.path.basename(args.file)
    for n in nodes:
        if not n.get('file'):
            n['file'] = fname

    cpg_json = _build_019_schema(nodes, edges, args.file, args.cve_id)
    ok, msg = _validate_019_schema(cpg_json)
    if not ok:
        print(f'[SCA-019 CPG][ERROR] Schema validation failed: {msg}', file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(cpg_json, f, indent=2, ensure_ascii=False)

    print(f'[SCA-019 CPG] ✅ 生成完成：{len(nodes)} 节点，{len(edges)} 边')
    print(f'[SCA-019 CPG] 节点类型：{list({n["type"] for n in nodes})}')
    print(f'[SCA-019 CPG] 输出文件：{args.output}')
    print(f'\nSCA_CPG_JSON:{json.dumps(cpg_json, ensure_ascii=False)}')


if __name__ == '__main__':
    import sys as _sys
    # 如果参数中有 --dot + --output + --file，使用 TC-SCA-019 模式
    args_set = set(_sys.argv[1:])
    if '--dot' in _sys.argv and '--output' in _sys.argv and '--file' in _sys.argv:
        main_019()
    else:
        main()
