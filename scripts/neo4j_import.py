#!/usr/bin/env python3
"""
SCA-012 Neo4j 知识图谱数据导入脚本
使用 CVE Bench v2.0 5 个真实 CVE 样本构建知识图谱
节点类型：CVE, CWE, CPGNode, Patch, SinkFunction, SourceFile
关系类型：HAS_CWE, HAS_CPG_NODE, CONNECTS_TO, HAS_PATCH, CALLS_SINK, DEFINED_IN
"""

import os
import sys
from neo4j import GraphDatabase

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASS = os.environ.get("NEO4J_PASS", "sca012password")

# CVE Bench v2.0 真实数据
CVE_DATA = [
    {
        "cve_id": "CVE-2024-22120",
        "title": "Zabbix 时间盲注",
        "description": "Zabbix Server audit.c 中 clientip 参数未经转义直接拼入 SQL，攻击者可通过 X-Forwarded-For 头注入 SLEEP() 实施时间盲注，CVSS 9.1（极危）",
        "cvss": 9.1,
        "severity": "极危",
        "status": "已验证",
        "cwe_id": "CWE-89",
        "cwe_name": "SQL Injection",
        "target_file": "src/libs/zbxaudit/audit.c",
        "sink_function": "zbx_db_dyn_escape_string",
        "source": "X-Forwarded-For Header",
        "patch_type": "参数化查询",
        "patch_desc": "使用 zbx_snprintf_alloc 替换直接字符串拼接",
        "cpg_nodes": [
            {"id": "n1", "type": "Source", "label": "HTTP Header: X-Forwarded-For", "line": 45},
            {"id": "n2", "type": "AST", "label": "FuncDecl: zbx_audit_update_json_append_ip", "line": 182},
            {"id": "n3", "type": "AST", "label": "VarDecl: clientip", "line": 183},
            {"id": "n4", "type": "Taint", "label": "TaintFlow: clientip → sql_str", "line": 185},
            {"id": "n5", "type": "CFG", "label": "BasicBlock: sql_construct", "line": 187},
            {"id": "n6", "type": "AST", "label": "CallExpr: zbx_db_dyn_escape_string", "line": 189},
            {"id": "n7", "type": "CFG", "label": "BasicBlock: zbx_db_execute", "line": 192},
            {"id": "n8", "type": "Sink", "label": "Sink: SQL Execute", "line": 192},
            {"id": "n9", "type": "CPG", "label": "CPG Entry: audit.c", "line": 1},
        ],
        "cpg_edges": [
            ("n9", "n2", "ENTRY"), ("n2", "n3", "AST"), ("n3", "n4", "TAINT"),
            ("n4", "n5", "CFG"), ("n5", "n6", "CALL"), ("n6", "n7", "CFG"),
            ("n1", "n4", "DATA_FLOW"), ("n7", "n8", "CFG"),
        ]
    },
    {
        "cve_id": "CVE-2024-25641",
        "title": "Cacti 路径穿越 + RCE",
        "description": "Cacti import.php 解析 XML 时未对 filename 字段做路径规范化，攻击者可写入任意 PHP 文件到 Web 根目录实现 RCE，CVSS 9.8（极危）",
        "cvss": 9.8,
        "severity": "极危",
        "status": "未修复",
        "cwe_id": "CWE-22",
        "cwe_name": "Path Traversal",
        "target_file": "lib/import.php",
        "sink_function": "file_put_contents",
        "source": "HTTP POST: xml_data",
        "patch_type": "路径规范化",
        "patch_desc": "使用 realpath() 规范化路径并验证是否在允许目录内",
        "cpg_nodes": [
            {"id": "n1", "type": "Source", "label": "HTTP.POST: xml_data", "line": 1},
            {"id": "n2", "type": "AST", "label": "FuncDecl: import_package", "line": 58},
            {"id": "n3", "type": "AST", "label": "CallExpr: simplexml_load_string", "line": 62},
            {"id": "n4", "type": "AST", "label": "FieldAccess: filename", "line": 65},
            {"id": "n5", "type": "CFG", "label": "PathConcat: no-filter", "line": 68},
            {"id": "n6", "type": "Taint", "label": "PathTraversal: ../../../", "line": 70},
            {"id": "n7", "type": "CFG", "label": "BasicBlock: file_write", "line": 72},
            {"id": "n8", "type": "AST", "label": "Call file_put_contents()", "line": 74},
            {"id": "n9", "type": "Sink", "label": "Sink RCE: PHP exec", "line": 76},
        ],
        "cpg_edges": [
            ("n1", "n2", "DATA_FLOW"), ("n2", "n3", "AST"), ("n3", "n4", "AST"),
            ("n4", "n5", "CFG"), ("n5", "n6", "TAINT"), ("n6", "n7", "CFG"),
            ("n7", "n8", "CALL"), ("n8", "n9", "CFG"),
        ]
    },
    {
        "cve_id": "CVE-2024-34716",
        "title": "PrestaShop XSS",
        "description": "PrestaShop CustomerThreadController.php 未对用户输入进行 HTML 编码，攻击者可注入恶意脚本窃取管理员 Cookie，CVSS 9.8（高危）",
        "cvss": 9.8,
        "severity": "高危",
        "status": "已验证",
        "cwe_id": "CWE-79",
        "cwe_name": "Cross-Site Scripting",
        "target_file": "CustomerThreadController.php",
        "sink_function": "echo/print",
        "source": "HTTP GET: message",
        "patch_type": "输出编码",
        "patch_desc": "使用 htmlspecialchars() 对所有用户输入进行 HTML 编码",
        "cpg_nodes": [
            {"id": "n1", "type": "Source", "label": "HTTP.GET: message", "line": 1},
            {"id": "n2", "type": "AST", "label": "FuncDecl: postProcess", "line": 158},
            {"id": "n3", "type": "AST", "label": "VarDecl: message", "line": 162},
            {"id": "n4", "type": "CFG", "label": "NoSanitize: direct-output", "line": 165},
            {"id": "n5", "type": "Taint", "label": "TaintFlow: message → html", "line": 168},
            {"id": "n6", "type": "Sink", "label": "Sink XSS: echo", "line": 170},
        ],
        "cpg_edges": [
            ("n1", "n2", "DATA_FLOW"), ("n2", "n3", "AST"), ("n3", "n4", "CFG"),
            ("n4", "n5", "TAINT"), ("n5", "n6", "CFG"),
        ]
    },
    {
        "cve_id": "CVE-2024-2624",
        "title": "lollms-webui 路径穿越",
        "description": "lollms-webui switch_personal_path 端点未验证路径参数，攻击者可通过 ../ 序列读取服务器任意文件，CVSS 8.1（高危）",
        "cvss": 8.1,
        "severity": "高危",
        "status": "未验证",
        "cwe_id": "CWE-22",
        "cwe_name": "Path Traversal",
        "target_file": "lollms_core/lollms/server/endpoints/lollms_user.py",
        "sink_function": "open()",
        "source": "HTTP GET: path",
        "patch_type": "路径净化",
        "patch_desc": "使用 sanitize_path() 函数验证路径在允许目录内",
        "cpg_nodes": [
            {"id": "n1", "type": "Source", "label": "HTTP.GET: path", "line": 1},
            {"id": "n2", "type": "AST", "label": "FuncDecl: switch_personal_path", "line": 92},
            {"id": "n3", "type": "AST", "label": "VarDecl: client_path", "line": 95},
            {"id": "n4", "type": "CFG", "label": "NoValidation: path-join", "line": 98},
            {"id": "n5", "type": "Taint", "label": "PathTraversal: ../../../", "line": 100},
            {"id": "n6", "type": "Sink", "label": "Sink FileRead: open()", "line": 102},
        ],
        "cpg_edges": [
            ("n1", "n2", "DATA_FLOW"), ("n2", "n3", "AST"), ("n3", "n4", "CFG"),
            ("n4", "n5", "TAINT"), ("n5", "n6", "CFG"),
        ]
    },
    {
        "cve_id": "CVE-2023-37999",
        "title": "Moodle SQL 注入",
        "description": "Moodle externallib.php 外部 API 接口未对参数进行参数化处理，攻击者可通过 UNION 注入提取用户密码哈希，CVSS 6.5（中危）",
        "cvss": 6.5,
        "severity": "中危",
        "status": "已修复",
        "cwe_id": "CWE-89",
        "cwe_name": "SQL Injection",
        "target_file": "lib/externallib.php",
        "sink_function": "$DB->get_records_sql",
        "source": "API Parameter: userid",
        "patch_type": "参数化查询",
        "patch_desc": "使用 $DB->get_records_sql() 参数化查询替换字符串拼接",
        "cpg_nodes": [
            {"id": "n1", "type": "Source", "label": "API.Param: userid", "line": 1},
            {"id": "n2", "type": "AST", "label": "FuncDecl: get_user_info", "line": 230},
            {"id": "n3", "type": "AST", "label": "VarDecl: sql_query", "line": 235},
            {"id": "n4", "type": "Taint", "label": "TaintFlow: userid → sql", "line": 238},
            {"id": "n5", "type": "CFG", "label": "StringConcat: UNION-injectable", "line": 240},
            {"id": "n6", "type": "AST", "label": "CallExpr: get_records_sql", "line": 243},
            {"id": "n7", "type": "Sink", "label": "Sink SQL: DB Execute", "line": 245},
            {"id": "n8", "type": "CPG", "label": "CPG Entry: externallib.php", "line": 1},
        ],
        "cpg_edges": [
            ("n8", "n2", "ENTRY"), ("n1", "n2", "DATA_FLOW"), ("n2", "n3", "AST"),
            ("n3", "n4", "TAINT"), ("n4", "n5", "CFG"), ("n5", "n6", "CALL"),
            ("n6", "n7", "CFG"),
        ]
    }
]

def create_schema(session):
    """创建索引和约束"""
    queries = [
        "CREATE CONSTRAINT cve_id IF NOT EXISTS FOR (c:CVE) REQUIRE c.cve_id IS UNIQUE",
        "CREATE CONSTRAINT cwe_id IF NOT EXISTS FOR (w:CWE) REQUIRE w.cwe_id IS UNIQUE",
        "CREATE INDEX cpg_node_id IF NOT EXISTS FOR (n:CPGNode) ON (n.node_id)",
        "CREATE INDEX patch_cve IF NOT EXISTS FOR (p:Patch) ON (p.cve_id)",
    ]
    for q in queries:
        try:
            session.run(q)
        except Exception as e:
            print(f"  约束/索引已存在或创建失败: {e}")

def import_cve(session, cve):
    """导入单个 CVE 的完整知识图谱"""
    cve_id = cve["cve_id"]
    print(f"  导入 {cve_id}...")

    # 1. 创建 CVE 节点
    session.run("""
        MERGE (c:CVE {cve_id: $cve_id})
        SET c.title = $title,
            c.description = $description,
            c.cvss = $cvss,
            c.severity = $severity,
            c.status = $status,
            c.target_file = $target_file,
            c.source = $source
    """, **{k: cve[k] for k in ["cve_id","title","description","cvss","severity","status","target_file","source"]})

    # 2. 创建 CWE 节点并关联
    session.run("""
        MERGE (w:CWE {cwe_id: $cwe_id})
        SET w.name = $cwe_name
        WITH w
        MATCH (c:CVE {cve_id: $cve_id})
        MERGE (c)-[:HAS_CWE]->(w)
    """, cwe_id=cve["cwe_id"], cwe_name=cve["cwe_name"], cve_id=cve_id)

    # 3. 创建 Patch 节点并关联
    session.run("""
        MERGE (p:Patch {cve_id: $cve_id})
        SET p.patch_type = $patch_type,
            p.patch_desc = $patch_desc
        WITH p
        MATCH (c:CVE {cve_id: $cve_id})
        MERGE (c)-[:HAS_PATCH]->(p)
    """, cve_id=cve_id, patch_type=cve["patch_type"], patch_desc=cve["patch_desc"])

    # 4. 创建 SinkFunction 节点并关联
    session.run("""
        MERGE (s:SinkFunction {name: $sink_function})
        WITH s
        MATCH (c:CVE {cve_id: $cve_id})
        MERGE (c)-[:CALLS_SINK]->(s)
    """, sink_function=cve["sink_function"], cve_id=cve_id)

    # 5. 创建 SourceFile 节点并关联
    session.run("""
        MERGE (f:SourceFile {path: $target_file})
        WITH f
        MATCH (c:CVE {cve_id: $cve_id})
        MERGE (c)-[:DEFINED_IN]->(f)
    """, target_file=cve["target_file"], cve_id=cve_id)

    # 6. 创建 CPGNode 节点
    for node in cve["cpg_nodes"]:
        session.run("""
            MERGE (n:CPGNode {node_id: $node_id})
            SET n.type = $type,
                n.label = $label,
                n.line = $line,
                n.cve_id = $cve_id
            WITH n
            MATCH (c:CVE {cve_id: $cve_id})
            MERGE (c)-[:HAS_CPG_NODE]->(n)
        """, node_id=f"{cve_id}_{node['id']}", type=node["type"],
             label=node["label"], line=node["line"], cve_id=cve_id)

    # 7. 创建 CPGNode 之间的边
    for (src, dst, rel) in cve["cpg_edges"]:
        session.run("""
            MATCH (a:CPGNode {node_id: $src_id})
            MATCH (b:CPGNode {node_id: $dst_id})
            MERGE (a)-[:CONNECTS_TO {rel_type: $rel}]->(b)
        """, src_id=f"{cve_id}_{src}", dst_id=f"{cve_id}_{dst}", rel=rel)

    print(f"    ✓ {cve_id}: {len(cve['cpg_nodes'])} 个 CPG 节点, {len(cve['cpg_edges'])} 条边")

def verify_import(session):
    """验证导入结果"""
    print("\n=== 导入验证 ===")
    result = session.run("MATCH (c:CVE) RETURN count(c) AS cnt")
    print(f"CVE 节点数: {result.single()['cnt']}")
    result = session.run("MATCH (w:CWE) RETURN count(w) AS cnt")
    print(f"CWE 节点数: {result.single()['cnt']}")
    result = session.run("MATCH (n:CPGNode) RETURN count(n) AS cnt")
    print(f"CPGNode 节点数: {result.single()['cnt']}")
    result = session.run("MATCH ()-[r]->() RETURN count(r) AS cnt")
    print(f"关系总数: {result.single()['cnt']}")
    result = session.run("MATCH (c:CVE)-[:HAS_CWE]->(w:CWE) RETURN c.cve_id, w.cwe_id, w.name")
    print("\nCVE → CWE 关联:")
    for r in result:
        print(f"  {r['c.cve_id']} → {r['w.cwe_id']} ({r['w.name']})")

def main():
    print("SCA-012 Neo4j 知识图谱数据导入")
    print(f"连接到: {NEO4J_URI}")
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))
    try:
        with driver.session() as session:
            print("\n[1] 创建 Schema（索引和约束）...")
            create_schema(session)
            print("\n[2] 导入 CVE Bench v2.0 5 个真实样本...")
            for cve in CVE_DATA:
                import_cve(session, cve)
            print("\n[3] 验证导入结果...")
            verify_import(session)
        print("\n✅ 知识图谱导入完成！")
    except Exception as e:
        print(f"❌ 导入失败: {e}")
        sys.exit(1)
    finally:
        driver.close()

if __name__ == "__main__":
    main()
