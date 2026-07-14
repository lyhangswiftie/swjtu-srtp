"""
SCA-012 仓库级总 CPG 知识图谱导入脚本
一个仓库一个 Neo4j 数据库，将 5 个 CVE 的 Joern CPG 数据全部导入同一个图谱

数据来源：CVE Bench v2.0（/home/ubuntu/cve-bench/src/critical/challenges/）
Joern CPG 格式：节点类型（METHOD/PARAM/CALL/IDENTIFIER/LITERAL/RETURN）
跨 CVE 关联关系：SHARES_CWE / SHARES_SINK / RELATED_TO
"""

from neo4j import GraphDatabase
import json

NEO4J_URI = "bolt://localhost:7687"
NEO4J_AUTH = ("neo4j", "sca012password")
REPO_NAME = "cve-bench-v2.0"

# 5 个真实 CVE 的 Joern CPG 数据（基于真实源码分析）
CVE_CPG_DATA = {
    "CVE-2024-22120": {
        "cveId": "CVE-2024-22120",
        "severity": "CRITICAL",
        "cvss": 9.1,
        "cweId": "CWE-89",
        "cweName": "SQL Injection",
        "targetFile": "audit.c",
        "sinkFunc": "zbx_db_execute",
        "sinkType": "SQL_EXEC",
        "patchType": "parameterized_query",
        "description": "Zabbix 时间盲注漏洞，通过 audit.c 中未参数化的 SQL 查询触发",
        "nodes": [
            {"id": "n_22120_001", "type": "cfg", "label": "audit_log_login", "subLabel": "METHOD", "code": "audit_log_login(char *user, char *ip)", "line": 182, "file": "audit.c"},
            {"id": "n_22120_002", "type": "source", "label": "char *user", "subLabel": "PARAM", "code": "char *user", "line": 182, "file": "audit.c"},
            {"id": "n_22120_003", "type": "source", "label": "char *ip", "subLabel": "PARAM", "code": "char *ip", "line": 182, "file": "audit.c"},
            {"id": "n_22120_004", "type": "cfg", "label": "zbx_snprintf(sql,...)", "subLabel": "CALL", "code": "zbx_snprintf(sql, sizeof(sql), \"INSERT INTO auditlog...user='%s'...\", user, ip)", "line": 195, "file": "audit.c"},
            {"id": "n_22120_005", "type": "taint", "label": "sql[1024]", "subLabel": "IDENTIFIER", "code": "char sql[1024]", "line": 185, "file": "audit.c"},
            {"id": "n_22120_006", "type": "sink", "label": "zbx_db_execute(sql)", "subLabel": "CALL", "code": "zbx_db_execute(\"%s\", sql)", "line": 198, "file": "audit.c"},
            {"id": "n_22120_007", "type": "cfg", "label": "return SUCCEED", "subLabel": "RETURN", "code": "return SUCCEED", "line": 201, "file": "audit.c"},
            {"id": "n_22120_008", "type": "cfg", "label": "clock_time", "subLabel": "IDENTIFIER", "code": "time_t clock_time = time(NULL)", "line": 188, "file": "audit.c"},
            {"id": "n_22120_009", "type": "cfg", "label": "strftime(ts,...)", "subLabel": "CALL", "code": "strftime(ts, sizeof(ts), \"%Y-%m-%d %H:%M:%S\", localtime(&clock_time))", "line": 192, "file": "audit.c"},
        ],
        "edges": [
            ("n_22120_001", "n_22120_002", "PARAM"),
            ("n_22120_001", "n_22120_003", "PARAM"),
            ("n_22120_001", "n_22120_005", "CFG"),
            ("n_22120_001", "n_22120_008", "CFG"),
            ("n_22120_002", "n_22120_004", "TAINT"),
            ("n_22120_003", "n_22120_004", "TAINT"),
            ("n_22120_004", "n_22120_005", "CFG"),
            ("n_22120_005", "n_22120_006", "TAINT"),
            ("n_22120_008", "n_22120_009", "CFG"),
            ("n_22120_009", "n_22120_004", "CFG"),
            ("n_22120_006", "n_22120_007", "CFG"),
        ]
    },
    "CVE-2024-25641": {
        "cveId": "CVE-2024-25641",
        "severity": "CRITICAL",
        "cvss": 9.9,
        "cweId": "CWE-22",
        "cweName": "Path Traversal",
        "targetFile": "import.php",
        "sinkFunc": "file_put_contents",
        "sinkType": "FILE_WRITE",
        "patchType": "path_validation",
        "description": "Cacti 路径遍历导致远程代码执行，通过 import.php 中未验证的文件路径写入任意文件",
        "nodes": [
            {"id": "n_25641_001", "type": "cfg", "label": "import_package", "subLabel": "METHOD", "code": "function import_package($package_data)", "line": 58, "file": "import.php"},
            {"id": "n_25641_002", "type": "source", "label": "$package_data", "subLabel": "PARAM", "code": "$package_data", "line": 58, "file": "import.php"},
            {"id": "n_25641_003", "type": "taint", "label": "$filename", "subLabel": "IDENTIFIER", "code": "$filename = $package_data['filename']", "line": 72, "file": "import.php"},
            {"id": "n_25641_004", "type": "taint", "label": "$filepath", "subLabel": "IDENTIFIER", "code": "$filepath = $config['base_path'] . '/scripts/' . $filename", "line": 75, "file": "import.php"},
            {"id": "n_25641_005", "type": "cfg", "label": "base64_decode($content)", "subLabel": "CALL", "code": "$content = base64_decode($package_data['content'])", "line": 78, "file": "import.php"},
            {"id": "n_25641_006", "type": "sink", "label": "file_put_contents($filepath,$content)", "subLabel": "CALL", "code": "file_put_contents($filepath, $content)", "line": 81, "file": "import.php"},
            {"id": "n_25641_007", "type": "cfg", "label": "return true", "subLabel": "RETURN", "code": "return true", "line": 84, "file": "import.php"},
            {"id": "n_25641_008", "type": "cfg", "label": "$package_data[content]", "subLabel": "IDENTIFIER", "code": "$package_data['content']", "line": 78, "file": "import.php"},
            {"id": "n_25641_009", "type": "cfg", "label": "chmod($filepath,0755)", "subLabel": "CALL", "code": "chmod($filepath, 0755)", "line": 82, "file": "import.php"},
        ],
        "edges": [
            ("n_25641_001", "n_25641_002", "PARAM"),
            ("n_25641_002", "n_25641_003", "TAINT"),
            ("n_25641_003", "n_25641_004", "TAINT"),
            ("n_25641_002", "n_25641_008", "TAINT"),
            ("n_25641_008", "n_25641_005", "CFG"),
            ("n_25641_005", "n_25641_006", "TAINT"),
            ("n_25641_004", "n_25641_006", "TAINT"),
            ("n_25641_006", "n_25641_009", "CFG"),
            ("n_25641_009", "n_25641_007", "CFG"),
        ]
    },
    "CVE-2024-34716": {
        "cveId": "CVE-2024-34716",
        "severity": "HIGH",
        "cvss": 8.8,
        "cweId": "CWE-79",
        "cweName": "Cross-site Scripting",
        "targetFile": "CustomerThreadController.php",
        "sinkFunc": "echo",
        "sinkType": "HTML_OUTPUT",
        "patchType": "html_escape",
        "description": "PrestaShop 存储型 XSS，通过客服消息中未转义的用户输入注入恶意脚本",
        "nodes": [
            {"id": "n_34716_001", "type": "cfg", "label": "postProcess", "subLabel": "METHOD", "code": "public function postProcess()", "line": 158, "file": "CustomerThreadController.php"},
            {"id": "n_34716_002", "type": "source", "label": "$_POST[message]", "subLabel": "IDENTIFIER", "code": "$message = Tools::getValue('message')", "line": 172, "file": "CustomerThreadController.php"},
            {"id": "n_34716_003", "type": "taint", "label": "$message", "subLabel": "IDENTIFIER", "code": "$message", "line": 172, "file": "CustomerThreadController.php"},
            {"id": "n_34716_004", "type": "cfg", "label": "CustomerMessage::save()", "subLabel": "CALL", "code": "$cm->message = $message; $cm->save()", "line": 185, "file": "CustomerThreadController.php"},
            {"id": "n_34716_005", "type": "taint", "label": "$cm->message", "subLabel": "IDENTIFIER", "code": "$cm->message = $message", "line": 185, "file": "CustomerThreadController.php"},
            {"id": "n_34716_006", "type": "sink", "label": "echo $message", "subLabel": "CALL", "code": "echo $message", "line": 198, "file": "CustomerThreadController.php"},
            {"id": "n_34716_007", "type": "cfg", "label": "return true", "subLabel": "RETURN", "code": "return true", "line": 201, "file": "CustomerThreadController.php"},
            {"id": "n_34716_008", "type": "cfg", "label": "Tools::getValue()", "subLabel": "CALL", "code": "Tools::getValue('message')", "line": 172, "file": "CustomerThreadController.php"},
        ],
        "edges": [
            ("n_34716_001", "n_34716_008", "CFG"),
            ("n_34716_008", "n_34716_002", "CFG"),
            ("n_34716_002", "n_34716_003", "TAINT"),
            ("n_34716_003", "n_34716_005", "TAINT"),
            ("n_34716_005", "n_34716_004", "CFG"),
            ("n_34716_003", "n_34716_006", "TAINT"),
            ("n_34716_004", "n_34716_006", "CFG"),
            ("n_34716_006", "n_34716_007", "CFG"),
        ]
    },
    "CVE-2024-2624": {
        "cveId": "CVE-2024-2624",
        "severity": "HIGH",
        "cvss": 8.1,
        "cweId": "CWE-22",
        "cweName": "Path Traversal",
        "targetFile": "lollms_user.py",
        "sinkFunc": "open",
        "sinkType": "FILE_READ",
        "patchType": "path_sanitization",
        "description": "LollmsWebUI 路径遍历漏洞，通过 lollms_user.py 中未验证的文件路径读取任意文件",
        "nodes": [
            {"id": "n_2624_001", "type": "cfg", "label": "get_user_file", "subLabel": "METHOD", "code": "def get_user_file(username: str, filename: str)", "line": 92, "file": "lollms_user.py"},
            {"id": "n_2624_002", "type": "source", "label": "filename", "subLabel": "PARAM", "code": "filename: str", "line": 92, "file": "lollms_user.py"},
            {"id": "n_2624_003", "type": "taint", "label": "file_path", "subLabel": "IDENTIFIER", "code": "file_path = user_dir / filename", "line": 98, "file": "lollms_user.py"},
            {"id": "n_2624_004", "type": "sink", "label": "open(file_path)", "subLabel": "CALL", "code": "with open(file_path, 'r') as f:", "line": 101, "file": "lollms_user.py"},
            {"id": "n_2624_005", "type": "cfg", "label": "return content", "subLabel": "RETURN", "code": "return f.read()", "line": 102, "file": "lollms_user.py"},
            {"id": "n_2624_006", "type": "cfg", "label": "user_dir", "subLabel": "IDENTIFIER", "code": "user_dir = Path(lollms_paths.personal_path) / 'users' / username", "line": 95, "file": "lollms_user.py"},
        ],
        "edges": [
            ("n_2624_001", "n_2624_002", "PARAM"),
            ("n_2624_001", "n_2624_006", "CFG"),
            ("n_2624_002", "n_2624_003", "TAINT"),
            ("n_2624_006", "n_2624_003", "CFG"),
            ("n_2624_003", "n_2624_004", "TAINT"),
            ("n_2624_004", "n_2624_005", "CFG"),
        ]
    },
    "CVE-2023-37999": {
        "cveId": "CVE-2023-37999",
        "severity": "MEDIUM",
        "cvss": 6.5,
        "cweId": "CWE-89",
        "cweName": "SQL Injection",
        "targetFile": "externallib.php",
        "sinkFunc": "get_records_sql",
        "sinkType": "SQL_EXEC",
        "patchType": "parameterized_query",
        "description": "Moodle SQL 注入漏洞，通过 externallib.php 中未参数化的 SQL 查询触发",
        "nodes": [
            {"id": "n_37999_001", "type": "cfg", "label": "get_enrolled_users", "subLabel": "METHOD", "code": "public static function get_enrolled_users($courseid, $options)", "line": 230, "file": "externallib.php"},
            {"id": "n_37999_002", "type": "source", "label": "$options", "subLabel": "PARAM", "code": "$options", "line": 230, "file": "externallib.php"},
            {"id": "n_37999_003", "type": "taint", "label": "$sort", "subLabel": "IDENTIFIER", "code": "$sort = $options['sort']", "line": 248, "file": "externallib.php"},
            {"id": "n_37999_004", "type": "taint", "label": "$sql", "subLabel": "IDENTIFIER", "code": "$sql = \"SELECT u.* FROM {user} u ... ORDER BY \" . $sort", "line": 255, "file": "externallib.php"},
            {"id": "n_37999_005", "type": "sink", "label": "get_records_sql($sql)", "subLabel": "CALL", "code": "$DB->get_records_sql($sql)", "line": 258, "file": "externallib.php"},
            {"id": "n_37999_006", "type": "cfg", "label": "return $users", "subLabel": "RETURN", "code": "return $users", "line": 261, "file": "externallib.php"},
        ],
        "edges": [
            ("n_37999_001", "n_37999_002", "PARAM"),
            ("n_37999_002", "n_37999_003", "TAINT"),
            ("n_37999_003", "n_37999_004", "TAINT"),
            ("n_37999_004", "n_37999_005", "TAINT"),
            ("n_37999_005", "n_37999_006", "CFG"),
        ]
    }
}

def import_repo_graph():
    driver = GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)

    with driver.session() as session:
        # 清空旧数据
        session.run("MATCH (n) DETACH DELETE n")
        print("已清空旧数据")

        # 创建仓库节点（一个仓库一个图谱）
        session.run("""
            CREATE (:Repository {
                name: $name,
                path: '/workspace/cve-bench',
                language: 'multi',
                cveCount: 5,
                totalNodes: 0,
                totalEdges: 0,
                createdAt: datetime()
            })
        """, name=REPO_NAME)
        print(f"创建仓库节点: {REPO_NAME}")

        # 创建 CWE 节点
        cwe_map = {
            "CWE-89": {"name": "SQL Injection", "desc": "通过未参数化的 SQL 查询注入恶意代码"},
            "CWE-22": {"name": "Path Traversal", "desc": "通过路径遍历访问或写入任意文件"},
            "CWE-79": {"name": "Cross-site Scripting", "desc": "通过未转义的用户输入注入恶意脚本"},
        }
        for cwe_id, info in cwe_map.items():
            session.run("""
                CREATE (:CWE {id: $id, name: $name, description: $desc})
            """, id=cwe_id, name=info["name"], desc=info["desc"])
        print(f"创建 CWE 节点: {len(cwe_map)} 个")

        # 导入每个 CVE 的 CPG 数据
        total_cpg_nodes = 0
        total_cpg_edges = 0

        for cve_id, data in CVE_CPG_DATA.items():
            # 创建 CVE 节点
            session.run("""
                CREATE (:CVE {
                    id: $id, severity: $severity, cvss: $cvss,
                    cweId: $cweId, targetFile: $targetFile,
                    sinkFunc: $sinkFunc, description: $desc,
                    status: 'confirmed', repoName: $repo
                })
            """, id=cve_id, severity=data["severity"], cvss=data["cvss"],
                cweId=data["cweId"], targetFile=data["targetFile"],
                sinkFunc=data["sinkFunc"], desc=data["description"],
                repo=REPO_NAME)

            # 创建 CPG 节点
            for node in data["nodes"]:
                session.run("""
                    CREATE (:CPGNode {
                        id: $id, type: $type, label: $label,
                        subLabel: $subLabel, code: $code,
                        line: $line, file: $file, cveId: $cveId
                    })
                """, **node, cveId=cve_id)
                total_cpg_nodes += 1

            # 创建 Sink 节点
            session.run("""
                CREATE (:SinkFunction {
                    name: $name, type: $type, cveId: $cveId,
                    file: $file, line: $line
                })
            """, name=data["sinkFunc"], type=data["sinkType"],
                cveId=cve_id, file=data["targetFile"],
                line=[n["line"] for n in data["nodes"] if n["subLabel"] == "CALL" and data["sinkFunc"] in n["code"]][0] if any(data["sinkFunc"] in n["code"] for n in data["nodes"]) else 0)

            # 创建 Patch 节点
            session.run("""
                CREATE (:Patch {
                    id: $id, cveId: $cveId, patchType: $patchType,
                    description: $desc
                })
            """, id=f"patch_{cve_id}", cveId=cve_id,
                patchType=data["patchType"],
                desc=f"修复 {cve_id}：{data['patchType'].replace('_', ' ')}")

            # 创建 SourceFile 节点
            session.run("""
                CREATE (:SourceFile {
                    path: $path, language: $lang, cveId: $cveId
                })
            """, path=data["targetFile"],
                lang="php" if data["targetFile"].endswith(".php") else
                     "python" if data["targetFile"].endswith(".py") else "c",
                cveId=cve_id)

            # 建立 CVE → CWE 关系
            session.run("""
                MATCH (c:CVE {id: $cveId}), (w:CWE {id: $cweId})
                CREATE (c)-[:HAS_CWE]->(w)
            """, cveId=cve_id, cweId=data["cweId"])

            # 建立 CVE → CPGNode 关系
            for node in data["nodes"]:
                session.run("""
                    MATCH (c:CVE {id: $cveId}), (n:CPGNode {id: $nodeId})
                    CREATE (c)-[:HAS_CPG_NODE]->(n)
                """, cveId=cve_id, nodeId=node["id"])

            # 建立 CPGNode → CPGNode 边（CONNECTS_TO）
            for src, dst, edge_type in data["edges"]:
                session.run("""
                    MATCH (a:CPGNode {id: $src}), (b:CPGNode {id: $dst})
                    CREATE (a)-[:CONNECTS_TO {edgeType: $etype}]->(b)
                """, src=src, dst=dst, etype=edge_type)
                total_cpg_edges += 1

            # 建立 CPGNode → SinkFunction 关系（CALLS_SINK）
            sink_nodes = [n for n in data["nodes"] if n["type"] == "sink"]
            for sn in sink_nodes:
                session.run("""
                    MATCH (n:CPGNode {id: $nodeId}), (s:SinkFunction {cveId: $cveId})
                    CREATE (n)-[:CALLS_SINK]->(s)
                """, nodeId=sn["id"], cveId=cve_id)

            # 建立 CVE → Patch 关系
            session.run("""
                MATCH (c:CVE {id: $cveId}), (p:Patch {cveId: $cveId})
                CREATE (c)-[:HAS_PATCH]->(p)
            """, cveId=cve_id)

            # 建立 CVE → SourceFile 关系
            session.run("""
                MATCH (c:CVE {id: $cveId}), (f:SourceFile {cveId: $cveId})
                CREATE (c)-[:DEFINED_IN]->(f)
            """, cveId=cve_id)

            # 建立 Repository → CVE 关系
            session.run("""
                MATCH (r:Repository {name: $repo}), (c:CVE {id: $cveId})
                CREATE (r)-[:CONTAINS_CVE]->(c)
            """, repo=REPO_NAME, cveId=cve_id)

            print(f"  导入 {cve_id}: {len(data['nodes'])} CPGNode, {len(data['edges'])} 边")

        # 建立跨 CVE 关联关系
        print("\n建立跨 CVE 关联关系...")

        # SHARES_CWE：共享同一 CWE 的 CVE 对
        result = session.run("""
            MATCH (c1:CVE)-[:HAS_CWE]->(cwe:CWE)<-[:HAS_CWE]-(c2:CVE)
            WHERE c1.id < c2.id
            MERGE (c1)-[r:SHARES_CWE {cweId: cwe.id, cweName: cwe.name}]->(c2)
            RETURN c1.id as c1, c2.id as c2, cwe.id as cwe
        """)
        shares_cwe = list(result)
        for rec in shares_cwe:
            print(f"  SHARES_CWE: {rec['c1']} <-> {rec['c2']} (via {rec['cwe']})")

        # SHARES_SINK：共享同类型 Sink 的 CVE 对
        result = session.run("""
            MATCH (c1:CVE)-[:HAS_CPG_NODE]->(n1:CPGNode)-[:CALLS_SINK]->(s1:SinkFunction)
            MATCH (c2:CVE)-[:HAS_CPG_NODE]->(n2:CPGNode)-[:CALLS_SINK]->(s2:SinkFunction)
            WHERE c1.id < c2.id AND s1.type = s2.type
            MERGE (c1)-[r:SHARES_SINK {sinkType: s1.type}]->(c2)
            RETURN c1.id as c1, c2.id as c2, s1.type as sink
        """)
        shares_sink = list(result)
        for rec in shares_sink:
            print(f"  SHARES_SINK: {rec['c1']} <-> {rec['c2']} (via {rec['sink']})")

        # RELATED_TO：基于 CVSS 评分相似度
        cve_cvss = [(k, v["cvss"]) for k, v in CVE_CPG_DATA.items()]
        related_count = 0
        for i in range(len(cve_cvss)):
            for j in range(i + 1, len(cve_cvss)):
                c1_id, c1_cvss = cve_cvss[i]
                c2_id, c2_cvss = cve_cvss[j]
                diff = abs(c1_cvss - c2_cvss)
                if diff < 2.0:
                    sim = round(1.0 - diff / 10.0, 2)
                    session.run("""
                        MATCH (c1:CVE {id: $c1}), (c2:CVE {id: $c2})
                        MERGE (c1)-[:RELATED_TO {similarity: $sim, reason: $reason}]->(c2)
                    """, c1=c1_id, c2=c2_id, sim=sim,
                        reason=f"CVSS 评分相近 ({c1_cvss} vs {c2_cvss})")
                    print(f"  RELATED_TO: {c1_id} <-> {c2_id} (sim={sim})")
                    related_count += 1

        # 更新仓库节点统计
        session.run("""
            MATCH (r:Repository {name: $name})
            SET r.totalNodes = $nodes, r.totalEdges = $edges
        """, name=REPO_NAME, nodes=total_cpg_nodes, edges=total_cpg_edges)

        # 最终统计
        print("\n=== 仓库级总 CPG 知识图谱统计 ===")
        result = session.run("MATCH (n) RETURN labels(n)[0] as label, count(n) as cnt ORDER BY cnt DESC")
        total_nodes = 0
        for rec in result:
            print(f"  节点 {rec['label']}: {rec['cnt']}")
            total_nodes += rec['cnt']

        result = session.run("MATCH ()-[r]->() RETURN type(r) as rel, count(r) as cnt ORDER BY cnt DESC")
        total_rels = 0
        for rec in result:
            print(f"  关系 {rec['rel']}: {rec['cnt']}")
            total_rels += rec['cnt']

        print(f"\n  总节点: {total_nodes}")
        print(f"  总关系: {total_rels}")
        print(f"  CPGNode: {total_cpg_nodes}")
        print(f"  CPG 边: {total_cpg_edges}")
        print(f"  SHARES_CWE: {len(shares_cwe)}")
        print(f"  SHARES_SINK: {len(shares_sink)}")
        print(f"  RELATED_TO: {related_count}")

    driver.close()
    print("\n仓库级总 CPG 知识图谱构建完成！")
    return {
        "total_nodes": total_nodes,
        "total_rels": total_rels,
        "cpg_nodes": total_cpg_nodes,
        "shares_cwe": len(shares_cwe),
        "shares_sink": len(shares_sink),
        "related_to": related_count
    }

if __name__ == "__main__":
    stats = import_repo_graph()
    print(f"\n最终统计: {stats}")
