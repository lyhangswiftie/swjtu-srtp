"""
SCA-012 知识图谱增强脚本：建立跨 CVE 关联关系
一个仓库一个 Neo4j 数据库，5 个 CVE 导入同一图谱，建立跨漏洞关联

关系类型：
- SHARES_CWE: 两个 CVE 共享同一 CWE 类型（如 CVE-2024-22120 和 CVE-2023-37999 都是 CWE-89）
- SHARES_SINK: 两个 CVE 的 CPG 路径经过同一类型的 Sink 函数
- RELATED_TO: 基于相似度评分建立的通用关联关系
"""

import os
from neo4j import GraphDatabase

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_AUTH = (
    os.environ.get("NEO4J_USER", "neo4j"),
    os.environ.get("NEO4J_PASS", "sca012password"),
)

def build_cross_cve_relations():
    driver = GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)

    with driver.session() as session:
        # 清除旧的跨 CVE 关系（避免重复）
        session.run("MATCH ()-[r:SHARES_CWE|SHARES_SINK|RELATED_TO]->() DELETE r")
        print("已清除旧的跨 CVE 关系")

        # 1. 建立 SHARES_CWE 关系：共享同一 CWE 的 CVE 之间
        result = session.run("""
            MATCH (c1:CVE)-[:HAS_CWE]->(cwe:CWE)<-[:HAS_CWE]-(c2:CVE)
            WHERE c1.id < c2.id
            MERGE (c1)-[r:SHARES_CWE {cweId: cwe.id, cweName: cwe.name}]->(c2)
            RETURN c1.id, c2.id, cwe.id
        """)
        shares_cwe_count = 0
        for rec in result:
            print(f"  SHARES_CWE: {rec['c1.id']} <-> {rec['c2.id']} (via {rec['cwe.id']})")
            shares_cwe_count += 1
        print(f"建立 SHARES_CWE 关系: {shares_cwe_count} 条")

        # 2. 建立 SHARES_SINK 关系：共享同类型 Sink 函数的 CVE 之间
        result = session.run("""
            MATCH (c1:CVE)-[:HAS_CPG_NODE]->(n1:CPGNode)-[:CALLS_SINK]->(s:SinkFunction)
            MATCH (c2:CVE)-[:HAS_CPG_NODE]->(n2:CPGNode)-[:CALLS_SINK]->(s2:SinkFunction)
            WHERE c1.id < c2.id AND s.type = s2.type
            MERGE (c1)-[r:SHARES_SINK {sinkType: s.type}]->(c2)
            RETURN c1.id, c2.id, s.type
        """)
        shares_sink_count = 0
        seen = set()
        for rec in result:
            key = (rec['c1.id'], rec['c2.id'])
            if key not in seen:
                print(f"  SHARES_SINK: {rec['c1.id']} <-> {rec['c2.id']} (via {rec['s.type']})")
                seen.add(key)
                shares_sink_count += 1
        print(f"建立 SHARES_SINK 关系: {shares_sink_count} 条")

        # 3. 建立 RELATED_TO 关系：基于 CVSS 评分相似度（差值 < 2.0）
        cve_data = [
            ("CVE-2024-22120", 9.1, "CWE-89"),
            ("CVE-2024-25641", 9.9, "CWE-22"),
            ("CVE-2024-34716", 8.8, "CWE-79"),
            ("CVE-2024-2624",  8.1, "CWE-22"),
            ("CVE-2023-37999", 6.5, "CWE-89"),
        ]

        related_count = 0
        for i in range(len(cve_data)):
            for j in range(i + 1, len(cve_data)):
                c1_id, c1_cvss, c1_cwe = cve_data[i]
                c2_id, c2_cvss, c2_cwe = cve_data[j]
                cvss_diff = abs(c1_cvss - c2_cvss)
                similarity = round(1.0 - cvss_diff / 10.0, 2)
                if cvss_diff < 2.0:
                    session.run("""
                        MATCH (c1:CVE {id: $c1}), (c2:CVE {id: $c2})
                        MERGE (c1)-[r:RELATED_TO {
                            similarity: $sim,
                            reason: $reason
                        }]->(c2)
                    """, c1=c1_id, c2=c2_id, sim=similarity,
                        reason=f"CVSS 评分相近 ({c1_cvss} vs {c2_cvss})")
                    print(f"  RELATED_TO: {c1_id} <-> {c2_id} (similarity={similarity})")
                    related_count += 1
        print(f"建立 RELATED_TO 关系: {related_count} 条")

        # 4. 验证最终图谱统计
        print("\n=== 最终图谱统计 ===")
        result = session.run("MATCH (n) RETURN labels(n)[0] as label, count(n) as cnt ORDER BY cnt DESC")
        total_nodes = 0
        for rec in result:
            print(f"  节点 {rec['label']}: {rec['cnt']}")
            total_nodes += rec['cnt']
        print(f"  总节点数: {total_nodes}")

        result = session.run("MATCH ()-[r]->() RETURN type(r) as rel, count(r) as cnt ORDER BY cnt DESC")
        total_rels = 0
        for rec in result:
            print(f"  关系 {rec['rel']}: {rec['cnt']}")
            total_rels += rec['cnt']
        print(f"  总关系数: {total_rels}")

        # 5. 验证跨 CVE 关联
        print("\n=== 跨 CVE 关联验证 ===")
        result = session.run("""
            MATCH (c1:CVE)-[r:SHARES_CWE|SHARES_SINK|RELATED_TO]->(c2:CVE)
            RETURN c1.id, type(r) as rel_type, c2.id
            ORDER BY rel_type, c1.id
        """)
        for rec in result:
            print(f"  {rec['c1.id']} --[{rec['rel_type']}]--> {rec['c2.id']}")

    driver.close()
    print("\n跨 CVE 关联关系构建完成！")

if __name__ == "__main__":
    build_cross_cve_relations()
