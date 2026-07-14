"""
SCA-012-v3 Neo4j 查询服务
提供 HTTP API 接口，供前端获取真实 Neo4j 知识图谱数据
端口: 7475 (避免与 Neo4j Browser 7474 冲突)
修复：全量查询所有节点和关系，修复 node_id_map 映射
"""
import math
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from neo4j import GraphDatabase

app = Flask(__name__)
CORS(app)

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASS = os.environ.get("NEO4J_PASS", "sca012password")
driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))


def run_query(cypher, params=None):
    with driver.session() as session:
        result = session.run(cypher, params or {})
        return [dict(record) for record in result]


@app.route('/api/neo4j/health', methods=['GET'])
def health():
    try:
        with driver.session() as session:
            result = session.run("RETURN 1 AS ok")
            result.single()
        return jsonify({"status": "connected", "uri": NEO4J_URI})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/neo4j/graph', methods=['GET'])
def get_graph():
    """
    获取仓库级总 CPG 知识图谱数据（用于 React Flow 渲染）
    全量查询所有节点和关系，返回格式: { nodes: [...], edges: [...], stats: {...} }
    """
    try:
        # ── 1. 全量查询所有节点 ──────────────────────────────────────────────
        all_nodes_raw = run_query("""
            MATCH (n)
            RETURN
                id(n) AS neo4j_id,
                labels(n)[0] AS label_type,
                properties(n) AS props
        """)

        # ── 2. 全量查询所有关系 ──────────────────────────────────────────────
        all_rels_raw = run_query("""
            MATCH (a)-[r]->(b)
            RETURN
                id(a) AS src_neo4j_id,
                id(b) AS tgt_neo4j_id,
                type(r) AS rel_type
        """)

        # ── 3. 统计信息 ──────────────────────────────────────────────────────
        stats_raw = run_query("""
            MATCH (n) WITH count(n) AS nodeCount
            MATCH ()-[r]->() WITH nodeCount, count(r) AS edgeCount
            MATCH ()-[r:SHARES_CWE|SHARES_SINK|RELATED_TO]->()
            RETURN nodeCount, edgeCount, count(r) AS crossCveCount
        """)
        stats = stats_raw[0] if stats_raw else {"nodeCount": 0, "edgeCount": 0, "crossCveCount": 0}

        # ── 4. 构建 neo4j_id -> react_flow_id 映射 ──────────────────────────
        # 使用 neo4j 内部 id 作为映射 key，确保唯一性
        neo4j_id_to_rf_id = {}
        rf_nodes = []

        # 颜色配置
        severity_colors = {
            'CRITICAL': '#ef4444',
            'HIGH': '#f97316',
            'MEDIUM': '#eab308',
            'LOW': '#22c55e',
        }
        cwe_colors = {'CWE-89': '#3b82f6', 'CWE-22': '#f97316', 'CWE-79': '#a855f7'}
        node_type_colors = {
            'sink': '#ef4444',
            'taint': '#f97316',
            'source': '#22c55e',
            'cfg': '#64748b',
        }

        # 按类型分组节点，用于布局计算
        cve_nodes = []
        cwe_nodes = []
        cpg_nodes = []
        sink_nodes = []
        other_nodes = []

        for n in all_nodes_raw:
            lt = n['label_type']
            props = n['props']
            if lt == 'CVE':
                cve_nodes.append(n)
            elif lt == 'CWE':
                cwe_nodes.append(n)
            elif lt == 'CPGNode':
                cpg_nodes.append(n)
            elif lt == 'SinkFunction':
                sink_nodes.append(n)
            else:
                other_nodes.append(n)

        # ── 5. 布局计算 ──────────────────────────────────────────────────────
        # CVE 节点：圆形布局，居中，半径 260（扩大间距避免重叠）
        cx, cy, r = 520, 340, 260
        for i, n in enumerate(cve_nodes):
            props = n['props']
            angle = (i / max(len(cve_nodes), 1)) * 2 * math.pi - math.pi / 2
            x = cx + r * math.cos(angle)
            y = cy + r * math.sin(angle)
            rf_id = f"cve-{props.get('id', str(n['neo4j_id']))}"
            neo4j_id_to_rf_id[n['neo4j_id']] = rf_id
            severity = props.get('severity', 'MEDIUM')
            color = severity_colors.get(severity, '#64748b')
            rf_nodes.append({
                "id": rf_id,
                "type": "default",
                "position": {"x": round(x, 1), "y": round(y, 1)},
                "data": {
                    "label": props.get('id', rf_id),
                    "nodeType": "cve",
                    "cvss": props.get('cvss', 'N/A'),
                    "severity": severity,
                    "title": props.get('title', ''),
                    "cweId": props.get('cweId', ''),
                    "targetFile": props.get('targetFile', ''),
                },
                "style": {
                    "background": color,
                    "color": "#fff",
                    "border": "2px solid rgba(255,255,255,0.3)",
                    "borderRadius": "50%",
                    "width": 80,
                    "height": 80,
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "center",
                    "fontSize": "8px",
                    "fontWeight": "bold",
                    "textAlign": "center",
                    "padding": "4px",
                    "boxShadow": f"0 0 14px {color}99",
                }
            })

        # CWE 节点：右侧纵向排列（x 坐标随画布扩大）
        for i, n in enumerate(cwe_nodes):
            props = n['props']
            rf_id = f"cwe-{props.get('id', str(n['neo4j_id']))}"
            neo4j_id_to_rf_id[n['neo4j_id']] = rf_id
            cwe_id = props.get('id', '')
            color = cwe_colors.get(cwe_id, '#64748b')
            rf_nodes.append({
                "id": rf_id,
                "type": "default",
                "position": {"x": 920, "y": 140 + i * 160},
                "data": {
                    "label": f"{cwe_id}\n{props.get('name', '')}",
                    "nodeType": "cwe",
                    "name": props.get('name', ''),
                },
                "style": {
                    "background": color,
                    "color": "#fff",
                    "border": "2px solid rgba(255,255,255,0.2)",
                    "borderRadius": "6px",
                    "width": 100,
                    "height": 52,
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "center",
                    "fontSize": "8px",
                    "fontWeight": "bold",
                    "textAlign": "center",
                    "padding": "4px",
                    "boxShadow": f"0 0 8px {color}66",
                }
            })

        # CPGNode：围绕对应 CVE 节点的小圆布局
        # 先按 cveId 分组
        cpg_by_cve = {}
        for n in cpg_nodes:
            cve_id = n['props'].get('cveId', 'unknown')
            cpg_by_cve.setdefault(cve_id, []).append(n)

        for cve_n in cve_nodes:
            cve_id = cve_n['props'].get('id', '')
            cve_rf_id = f"cve-{cve_id}"
            # 找到 CVE 节点的位置
            cve_pos = next((nd['position'] for nd in rf_nodes if nd['id'] == cve_rf_id), {"x": 400, "y": 280})
            cpg_list = cpg_by_cve.get(cve_id, [])
            cpg_r = 110  # CPGNode 围绕 CVE 的半径（扩大避免重叠）
            for j, cpg_n in enumerate(cpg_list):
                props = cpg_n['props']
                angle = (j / max(len(cpg_list), 1)) * 2 * math.pi
                x = cve_pos['x'] + cpg_r * math.cos(angle)
                y = cve_pos['y'] + cpg_r * math.sin(angle)
                rf_id = f"cpg-{props.get('id', str(cpg_n['neo4j_id']))}"
                neo4j_id_to_rf_id[cpg_n['neo4j_id']] = rf_id
                node_type = props.get('type', 'cfg')
                color = node_type_colors.get(node_type, '#334155')
                rf_nodes.append({
                    "id": rf_id,
                    "type": "default",
                    "position": {"x": round(x, 1), "y": round(y, 1)},
                    "data": {
                        "label": (props.get('label', props.get('id', '')) or '')[:18],
                        "nodeType": node_type,
                        "file": props.get('file', ''),
                        "cveId": cve_id,
                    },
                    "style": {
                        "background": "#1e293b",
                        "color": color,
                        "border": f"1px solid {color}88",
                        "borderRadius": "3px",
                        "width": 72,
                        "height": 32,
                        "display": "flex",
                        "alignItems": "center",
                        "justifyContent": "center",
                        "fontSize": "7px",
                        "padding": "2px",
                        "textAlign": "center",
                    }
                })

        # SinkFunction 节点：左侧纵向排列
        for i, n in enumerate(sink_nodes):
            props = n['props']
            rf_id = f"sink-{props.get('id', str(n['neo4j_id']))}"
            neo4j_id_to_rf_id[n['neo4j_id']] = rf_id
            rf_nodes.append({
                "id": rf_id,
                "type": "default",
                "position": {"x": 30, "y": 60 + i * 90},
                "data": {
                    "label": (props.get('name', props.get('id', '')) or '')[:20],
                    "nodeType": "sink",
                    "sinkType": props.get('type', ''),
                },
                "style": {
                    "background": "#1c0a0a",
                    "color": "#ef4444",
                    "border": "1px solid #ef444466",
                    "borderRadius": "3px",
                    "width": 80,
                    "height": 36,
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "center",
                    "fontSize": "7px",
                    "padding": "2px",
                    "textAlign": "center",
                }
            })

        # Repository 节点：顶部居中
        for n in other_nodes:
            props = n['props']
            lt = n['label_type']
            if lt == 'Repository':
                rf_id = f"repo-{props.get('name', str(n['neo4j_id']))}"
                neo4j_id_to_rf_id[n['neo4j_id']] = rf_id
                rf_nodes.append({
                    "id": rf_id,
                    "type": "default",
                    "position": {"x": 360, "y": 20},
                    "data": {
                        "label": f"Repo: {props.get('name', 'core-system')}",
                        "nodeType": "repository",
                    },
                    "style": {
                        "background": "#0f172a",
                        "color": "#00FF9F",
                        "border": "2px solid #00FF9F",
                        "borderRadius": "4px",
                        "width": 140,
                        "height": 36,
                        "display": "flex",
                        "alignItems": "center",
                        "justifyContent": "center",
                        "fontSize": "9px",
                        "fontWeight": "bold",
                        "padding": "4px",
                        "boxShadow": "0 0 10px rgba(0,255,159,0.4)",
                    }
                })
            elif lt in ('Patch', 'SourceFile'):
                # Patch 和 SourceFile 节点：底部排列
                idx = other_nodes.index(n)
                rf_id = f"{lt.lower()}-{props.get('id', str(n['neo4j_id']))}"
                neo4j_id_to_rf_id[n['neo4j_id']] = rf_id
                rf_nodes.append({
                    "id": rf_id,
                    "type": "default",
                    "position": {"x": 60 + (idx % 5) * 160, "y": 520},
                    "data": {
                        "label": (props.get('id', props.get('name', lt)) or '')[:20],
                        "nodeType": lt.lower(),
                    },
                    "style": {
                        "background": "#0f1a2e",
                        "color": "#64748b",
                        "border": "1px solid #334155",
                        "borderRadius": "3px",
                        "width": 90,
                        "height": 30,
                        "display": "flex",
                        "alignItems": "center",
                        "justifyContent": "center",
                        "fontSize": "7px",
                        "padding": "2px",
                        "textAlign": "center",
                    }
                })

        # ── 6. 构建 React Flow 边 ─────────────────────────────────────────────
        # 跨 CVE 关联边标记（用于 animated 判断）
        cross_cve_rel_types = {'SHARES_CWE', 'SHARES_SINK', 'RELATED_TO'}
        edge_styles = {
            'HAS_CWE':       {'stroke': '#3b82f6', 'strokeWidth': 2.5},
            'SHARES_CWE':    {'stroke': '#f97316', 'strokeWidth': 4, 'strokeDasharray': '8,4'},
            'SHARES_SINK':   {'stroke': '#ef4444', 'strokeWidth': 4.5, 'strokeDasharray': '5,3'},
            'RELATED_TO':    {'stroke': '#a855f7', 'strokeWidth': 3, 'strokeDasharray': '6,4'},
            'HAS_CPG_NODE':  {'stroke': '#22c55e', 'strokeWidth': 1, 'opacity': 0.5},
            'CALLS_SINK':    {'stroke': '#eab308', 'strokeWidth': 2, 'opacity': 0.8},
            'DEFINED_IN':    {'stroke': '#64748b', 'strokeWidth': 1, 'opacity': 0.4},
            'CONTAINS_CVE':  {'stroke': '#00FF9F', 'strokeWidth': 1.5, 'opacity': 0.6},
            'HAS_PATCH':     {'stroke': '#22c55e', 'strokeWidth': 1, 'opacity': 0.3},
            'CONNECTS_TO':   {'stroke': '#475569', 'strokeWidth': 1, 'opacity': 0.4},
        }

        rf_edges = []
        edge_id_set = set()
        for rel in all_rels_raw:
            src_rf = neo4j_id_to_rf_id.get(rel['src_neo4j_id'])
            tgt_rf = neo4j_id_to_rf_id.get(rel['tgt_neo4j_id'])
            if not src_rf or not tgt_rf:
                continue
            edge_key = f"{src_rf}-{tgt_rf}-{rel['rel_type']}"
            if edge_key in edge_id_set:
                continue
            edge_id_set.add(edge_key)
            style = edge_styles.get(rel['rel_type'], {'stroke': '#64748b', 'strokeWidth': 1})
            rel_type = rel['rel_type']
            is_cross_cve = rel_type in cross_cve_rel_types
            # 跨 CVE 关系加标签，其他关系不加（减少视觉噪音）
            show_label = rel_type in ('SHARES_CWE', 'SHARES_SINK', 'RELATED_TO', 'HAS_CWE', 'CALLS_SINK')
            # 跨 CVE 关联边使用动画效果和更大标签字体
            label_style = {
                "fontSize": "9px" if is_cross_cve else "7px",
                "fill": style.get('stroke', '#64748b') if is_cross_cve else "#64748b",
                "fontWeight": "bold" if is_cross_cve else "normal",
            }
            edge_obj = {
                "id": edge_key,
                "source": src_rf,
                "target": tgt_rf,
                "label": rel_type.replace('_', ' ') if show_label else '',
                "type": "straight",
                "style": style,
                "animated": is_cross_cve,
                "labelStyle": label_style,
                "labelBgStyle": {"fill": "#0f172a", "fillOpacity": 0.85},
                "markerEnd": {
                    "type": "arrowclosed",
                    "color": style.get('stroke', '#64748b'),
                    "width": 12 if is_cross_cve else 8,
                    "height": 12 if is_cross_cve else 8,
                } if is_cross_cve else None,
            }
            # 移除 None 值
            edge_obj = {k: v for k, v in edge_obj.items() if v is not None}
            rf_edges.append(edge_obj)

        # ── 7. 统计 ──────────────────────────────────────────────────────────
        cve_count = len(cve_nodes)
        cwe_count = len(cwe_nodes)
        cpg_count = len(cpg_nodes)
        cross_cve = stats.get('crossCveCount', 0)

        return jsonify({
            "nodes": rf_nodes,
            "edges": rf_edges,
            "stats": {
                "nodeCount": stats.get('nodeCount', len(rf_nodes)),
                "edgeCount": stats.get('edgeCount', len(rf_edges)),
                "cveCount": cve_count,
                "cweCount": cwe_count,
                "cpgNodeCount": cpg_count,
                "crossCveCount": cross_cve,
            }
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route('/api/neo4j/cve/<cve_id>', methods=['GET'])
def get_cve_subgraph(cve_id):
    """获取单个 CVE 的子图（用于上层 CPG Tab 专注模式）"""
    try:
        nodes_raw = run_query("""
            MATCH (c:CVE {id: $cve_id})-[:HAS_CPG_NODE]->(n:CPGNode)
            RETURN n.id AS id, n.label AS label, n.type AS nodeType, n.file AS file
        """, {"cve_id": cve_id})
        rels_raw = run_query("""
            MATCH (c:CVE {id: $cve_id})-[:HAS_CPG_NODE]->(n:CPGNode)
            OPTIONAL MATCH (n)-[r:CONNECTS_TO]->(m:CPGNode)
            RETURN n.id AS src, m.id AS tgt, type(r) AS rel_type
        """, {"cve_id": cve_id})
        return jsonify({"nodes": nodes_raw, "edges": rels_raw})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7475, debug=False)
