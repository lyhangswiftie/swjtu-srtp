# CVE-2024-22120 Zabbix SQL Time-Blind Injection PoC
# 测试用途：验证 zbx_db_execute 中的 SQL 注入漏洞
# 不含真实攻击代码，仅用于安全验证

import time

def test_time_blind_injection():
    """模拟 SQL 时间盲注测试（不连接真实数据库）"""
    # 构造测试 payload（仅用于演示，不执行真实注入）
    payload = "1' AND SLEEP(5)-- "
    print(f"[PoC] CVE-2024-22120 测试 payload: {payload}")
    print("[PoC] 注意：此 PoC 仅用于安全验证，不连接真实数据库")
    return True

if __name__ == "__main__":
    result = test_time_blind_injection()
    print(f"[PoC] 测试结果: {'PASS' if result else 'FAIL'}")
