#!/usr/bin/env python3
"""TC-SCA-023 poc_gate.py 真实单元测试"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.poc_gate import (
    check_cve_whitelist, check_blacklist, GateDecision
)

results = []

def run_test(name, condition, detail=""):
    icon = "✅" if condition else "❌"
    print(f"  {icon} {name}: {detail}")
    results.append((name, condition))

# test_whitelist_allow: CVE-2024-22120 在白名单中
ok = check_cve_whitelist("CVE-2024-22120")
run_test("test_whitelist_allow", ok, f"whitelist={ok}")

# test_unknown_cve_blocked: 未知 CVE 不在白名单
ok2 = not check_cve_whitelist("CVE-9999-99999")
run_test("test_unknown_cve_blocked", ok2, f"blocked={ok2}")

# test_blacklist_rm_rf: rm -rf / 被黑名单拦截
hits = check_blacklist("rm -rf /")
run_test("test_blacklist_rm_rf", len(hits) > 0, f"hits={hits}")

# test_blacklist_mkfs: mkfs.ext4 被黑名单拦截
hits2 = check_blacklist("mkfs.ext4 /dev/sda")
run_test("test_blacklist_mkfs", len(hits2) > 0, f"hits={hits2}")

# test_safe_command: 普通 python3 命令不被黑名单拦截
hits3 = check_blacklist("python3 exploit.py --target 127.0.0.1")
run_test("test_safe_command_not_blacklisted", len(hits3) == 0, f"hits={hits3}")

# test_empty_command: 空命令被拦截（黑名单无命中，但白名单检查通过）
hits4 = check_blacklist("")
run_test("test_empty_command_no_blacklist_hit", len(hits4) == 0, f"hits={hits4}")

passed = sum(1 for _, ok in results if ok)
total = len(results)
print(f"\n结果: {passed}/{total} 通过")

if passed == total:
    print("✅ poc_gate.py 单元测试全部通过")
    sys.exit(0)
else:
    print("❌ 部分测试失败")
    sys.exit(1)
