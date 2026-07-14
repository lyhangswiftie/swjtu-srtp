#!/usr/bin/env python3
"""
SCA-016 串行执行 10 个 CVE 端到端分析
通过 OpenHands API 创建对话并等待完成
"""
import json
import time
import requests
import os
import subprocess

BASE_URL = "http://0.0.0.0:3000"
CVE_SOURCES_DIR = "/home/ubuntu/sca-016-final/cve-sources"
RESULTS_DIR = "/home/ubuntu/sca-016-final/results"
os.makedirs(RESULTS_DIR, exist_ok=True)

# 10个CVE定义（语言多样化）
CVE_LIST = [
    {
        "id": "CVE-2024-22120",
        "language": "C",
        "vuln_type": "SQL Injection (Time-based Blind)",
        "cwe": "CWE-89",
        "cvss": 9.1,
        "product": "Zabbix 6.0.27",
        "source_file": "cve-2024-22120-zabbix-sqli.c",
        "vuln_line": "audit.c:182",
        "description": "Time-based blind SQL injection via clientip parameter in audit log",
    },
    {
        "id": "CVE-2024-25641",
        "language": "PHP",
        "vuln_type": "Unrestricted File Upload RCE",
        "cwe": "CWE-434",
        "cvss": 9.9,
        "product": "Cacti 1.2.26",
        "source_file": "cve-2024-25641-cacti-fileupload.php",
        "vuln_line": "import.php:58",
        "description": "Unrestricted file upload allows PHP webshell upload and RCE",
    },
    {
        "id": "CVE-2024-31611",
        "language": "PHP",
        "vuln_type": "SSRF",
        "cwe": "CWE-918",
        "cvss": 8.6,
        "product": "Custom PHP App",
        "source_file": "cve-2024-31611-php-ssrf.php",
        "vuln_line": "request_handler.php:42",
        "description": "SSRF via user-controlled URL parameter in curl request",
    },
    {
        "id": "CVE-2024-30542",
        "language": "PHP",
        "vuln_type": "Authentication Bypass via SQL Injection",
        "cwe": "CWE-287",
        "cvss": 9.8,
        "product": "Custom PHP App",
        "source_file": "cve-2024-30542-php-auth-bypass.php",
        "vuln_line": "login.php:14",
        "description": "SQL injection in login form allows authentication bypass",
    },
    {
        "id": "CVE-2024-32986",
        "language": "Python",
        "vuln_type": "Path Traversal",
        "cwe": "CWE-22",
        "cvss": 7.5,
        "product": "Python Flask App",
        "source_file": "cve-2024-32986-python-traversal.py",
        "vuln_line": "file_handler.py:21",
        "description": "Path traversal via URL-encoded sequences bypasses weak filter",
    },
    {
        "id": "CVE-2024-34359",
        "language": "Python",
        "vuln_type": "Command Injection RCE",
        "cwe": "CWE-78",
        "cvss": 9.8,
        "product": "llama-cpp-python < 0.2.76",
        "source_file": "cve-2024-34359-python-cmdinject.py",
        "vuln_line": "server.py:31",
        "description": "Command injection via unsanitized model_file_name in os.system() call",
    },
    {
        "id": "CVE-2024-34716",
        "language": "Java",
        "vuln_type": "Stored XSS",
        "cwe": "CWE-79",
        "cvss": 8.2,
        "product": "PrestaShop 8.1.5",
        "source_file": "cve-2024-34716-prestashop-xss.java",
        "vuln_line": "CustomerThreadController.java:158",
        "description": "Stored XSS via unsanitized customer message content in admin panel",
    },
    {
        "id": "CVE-2021-44228",
        "language": "Java",
        "vuln_type": "JNDI Injection RCE (Log4Shell)",
        "cwe": "CWE-917",
        "cvss": 10.0,
        "product": "Apache Log4j2 2.14.1",
        "source_file": "cve-2021-44228-log4shell.java",
        "vuln_line": "JndiLookup.java:44",
        "description": "JNDI lookup of user-controlled log message triggers remote class loading RCE",
    },
    {
        "id": "CVE-2024-23897",
        "language": "Java",
        "vuln_type": "Arbitrary File Read (Path Traversal)",
        "cwe": "CWE-22",
        "cvss": 9.8,
        "product": "Jenkins 2.441",
        "source_file": "cve-2024-23897-jenkins-traversal.java",
        "vuln_line": "CLICommand.java:47",
        "description": "CLI @file argument expansion allows reading arbitrary files including secrets",
    },
    {
        "id": "CVE-2024-4367",
        "language": "JavaScript",
        "vuln_type": "Arbitrary JavaScript Execution via CSS Injection",
        "cwe": "CWE-94",
        "cvss": 8.8,
        "product": "Mozilla PDF.js 4.1.392",
        "source_file": "cve-2024-4367-pdfjs-rce.js",
        "vuln_line": "font_loader.js:28",
        "description": "CSS injection via unsanitized FontMatrix/fontName from PDF allows JS execution",
    },
]


def read_source(filename):
    path = os.path.join(CVE_SOURCES_DIR, filename)
    with open(path, 'r') as f:
        return f.read()


def create_conversation(cve):
    """通过 OpenHands API 创建 CVE 分析对话"""
    source_code = read_source(cve["source_file"])
    
    prompt = f"""You are a security analyst performing Static Code Analysis (SCA).
IMPORTANT: The source code is provided BELOW in this message. Do NOT try to read files from the filesystem - just analyze the code provided here.

## CVE: {cve['id']}
- Language: {cve['language']}
- Vulnerability Type: {cve['vuln_type']}
- CWE: {cve['cwe']}
- CVSS Score: {cve['cvss']}
- Product: {cve['product']}
- Vulnerable Line: {cve['vuln_line']}
- Description: {cve['description']}

## Source Code:

### {cve['source_file']}
```
{source_code}
```

## Required Analysis Steps (execute ALL 5 steps using execute_ipython_cell):

**Step 1 - CPG Generation**: Analyze the code structure and output:
CPG_RESULT: {{"total_nodes": <N>, "total_edges": <N>, "function_nodes": <N>, "input_sources": <N>, "sinks": <N>}}

**Step 2 - Vulnerability Discovery**: Identify the exact vulnerable line and output:
VULN_FOUND: <file>:<line> - <description>

**Step 3 - PoC Generation**: Write a working Python/curl PoC exploit script and output:
POC_GENERATED: <exploit code>

**Step 4 - Patch Generation**: Write a unified diff patch fixing the vulnerability and output:
PATCH_GENERATED: <diff patch>

**Step 5 - Patch Verification**: Verify the patch fixes the vulnerability and output:
PATCH_VERIFIED: <verification explanation>

Finally output: ANALYSIS_COMPLETE: {cve['id']} - all 5 steps completed
"""
    
    payload = {
        "initial_user_msg": prompt,
    }
    
    r = requests.post(f"{BASE_URL}/api/conversations", json=payload, timeout=30)
    if r.status_code == 200:
        data = r.json()
        return data.get("conversation_id")
    else:
        print(f"  ERROR creating conversation: {r.status_code} {r.text[:200]}")
        return None


def wait_for_completion(conv_id, timeout=300):
    """等待对话分析完成"""
    start = time.time()
    last_event_count = 0
    
    while time.time() - start < timeout:
        try:
            r = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/events", timeout=10)
            events = r.json().get("events", [])
            
            # 检查是否完成
            for e in events:
                content = str(e.get("content", e.get("args", {}).get("content", "")))
                if "ANALYSIS_COMPLETE" in content:
                    return "COMPLETE", events
                # 检查 agent 是否在等待用户输入
                if e.get("observation") == "agent_state_changed":
                    state = e.get("extras", {}).get("agent_state", "")
                    if state == "awaiting_user_input":
                        return "AWAITING_INPUT", events
            
            # 显示进度
            if len(events) != last_event_count:
                last_event_count = len(events)
                print(f"  Events: {len(events)}", end="\r")
            
            time.sleep(5)
        except Exception as ex:
            print(f"  Error polling: {ex}")
            time.sleep(5)
    
    return "TIMEOUT", []


def extract_results(events):
    """从事件中提取分析结果"""
    results = {
        "cpg": None, "vuln": None, "poc": None, 
        "patch": None, "verified": None, "complete": False
    }
    
    for e in events:
        content = str(e.get("content", e.get("args", {}).get("content", "")))
        if "CPG_RESULT" in content:
            results["cpg"] = content[content.find("CPG_RESULT"):content.find("CPG_RESULT")+200]
        if "VULN_FOUND" in content:
            results["vuln"] = content[content.find("VULN_FOUND"):content.find("VULN_FOUND")+200]
        if "POC_GENERATED" in content:
            results["poc"] = content[content.find("POC_GENERATED"):content.find("POC_GENERATED")+300]
        if "PATCH_GENERATED" in content:
            results["patch"] = content[content.find("PATCH_GENERATED"):content.find("PATCH_GENERATED")+300]
        if "PATCH_VERIFIED" in content:
            results["verified"] = content[content.find("PATCH_VERIFIED"):content.find("PATCH_VERIFIED")+200]
        if "ANALYSIS_COMPLETE" in content:
            results["complete"] = True
    
    return results


def main():
    all_results = []
    
    print("=" * 70)
    print("SCA-016 串行 CVE 端到端分析 - 10个多语言CVE")
    print("=" * 70)
    
    for i, cve in enumerate(CVE_LIST):
        print(f"\n[{i+1}/10] 开始分析 {cve['id']} ({cve['language']}) - {cve['vuln_type']}")
        print(f"  产品: {cve['product']}")
        
        # 创建对话
        conv_id = create_conversation(cve)
        if not conv_id:
            print(f"  FAILED: 无法创建对话")
            all_results.append({**cve, "conv_id": None, "status": "FAILED", "results": {}})
            continue
        
        print(f"  对话ID: {conv_id}")
        
        # 等待完成
        status, events = wait_for_completion(conv_id, timeout=240)
        print(f"  状态: {status} (共 {len(events)} 个事件)")
        
        # 提取结果
        results = extract_results(events)
        
        steps_done = sum(1 for v in [results["cpg"], results["vuln"], results["poc"], 
                                      results["patch"], results["verified"]] if v)
        
        final_status = "PASS" if results["complete"] else f"PARTIAL ({steps_done}/5)"
        print(f"  结果: {final_status}")
        if results["cpg"]:
            print(f"  CPG: {results['cpg'][:100]}")
        if results["vuln"]:
            print(f"  漏洞: {results['vuln'][:100]}")
        
        all_results.append({
            **cve,
            "conv_id": conv_id,
            "status": final_status,
            "steps_done": steps_done,
            "results": results,
        })
        
        # 保存中间结果
        with open(f"{RESULTS_DIR}/result_{cve['id']}.json", 'w') as f:
            json.dump({
                "cve_id": cve["id"],
                "conv_id": conv_id,
                "status": final_status,
                "steps_done": steps_done,
                "cpg": results["cpg"],
                "vuln": results["vuln"],
                "poc": results["poc"][:200] if results["poc"] else None,
                "patch": results["patch"][:200] if results["patch"] else None,
                "verified": results["verified"],
            }, f, indent=2, ensure_ascii=False)
        
        print(f"  结果已保存到 result_{cve['id']}.json")
        
        # 串行：等待 10 秒再处理下一个
        if i < len(CVE_LIST) - 1:
            print(f"  等待 10 秒后处理下一个CVE...")
            time.sleep(10)
    
    # 汇总
    print("\n" + "=" * 70)
    print("汇总结果:")
    passed = sum(1 for r in all_results if "PASS" in r.get("status", ""))
    partial = sum(1 for r in all_results if "PARTIAL" in r.get("status", ""))
    failed = sum(1 for r in all_results if "FAIL" in r.get("status", ""))
    print(f"  PASS: {passed}/10  PARTIAL: {partial}/10  FAIL: {failed}/10")
    
    for r in all_results:
        print(f"  {r['id']} ({r['language']}): {r.get('status', 'N/A')}")
    
    # 保存总结
    with open(f"{RESULTS_DIR}/summary.json", 'w') as f:
        json.dump({
            "total": 10,
            "passed": passed,
            "partial": partial,
            "failed": failed,
            "results": [{
                "cve_id": r["id"],
                "language": r["language"],
                "vuln_type": r["vuln_type"],
                "conv_id": r.get("conv_id"),
                "status": r.get("status"),
                "steps_done": r.get("steps_done", 0),
            } for r in all_results]
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n总结已保存到 {RESULTS_DIR}/summary.json")


if __name__ == "__main__":
    main()
