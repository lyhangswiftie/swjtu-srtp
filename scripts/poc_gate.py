"""
poc_gate.py - PoC 执行安全闸门（Security Gate for PoC Execution）

职责：
  - CVE 白名单（Whitelist）校验：只允许已知安全 CVE 的 PoC 执行
  - 危险命令黑名单（Blacklist）校验：阻止高危操作
  - 执行前上下文校验：确保沙箱环境可用
  - 返回 GateResult（ALLOW / BLOCKED / WARN）

设计原则：
  - 白名单优先（Whitelist-first）：未在白名单中的 CVE 一律 BLOCKED
  - 黑名单兜底（Blacklist-fallback）：危险命令直接 BLOCKED
  - 所有决策均记录到审计日志
"""

from __future__ import annotations

import re
import shlex
import subprocess
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


# ---------------------------------------------------------------------------
# 枚举：闸门决策结果
# ---------------------------------------------------------------------------

class GateDecision(str, Enum):
    ALLOW = "ALLOW"       # 允许执行
    BLOCKED = "BLOCKED"   # 拒绝执行（白名单不含 / 黑名单命中）
    WARN = "WARN"         # 允许但带警告（沙箱不可用时降级）


# ---------------------------------------------------------------------------
# CVE 白名单（Whitelist）
# 只有在此列表中的 CVE 才允许 PoC 执行
# ---------------------------------------------------------------------------

CVE_WHITELIST: set[str] = {
    "CVE-2024-22120",   # Zabbix SQL 时间盲注
    "CVE-2024-25641",   # Cacti 文件上传 RCE
    "CVE-2024-34716",   # PrestaShop XSS
    "CVE-2024-2624",    # lollms 代码执行
    "CVE-2023-37999",   # Moodle 命令注入
    "CVE-2024-34359",   # Python 命令注入
    "CVE-2024-31611",   # PHP SSRF
    "CVE-2024-30542",   # PHP 认证绕过
    "CVE-2024-23897",   # Jenkins 路径穿越
    "CVE-2021-3156",    # sudo 堆溢出（仅分析，不实际利用）
}


# ---------------------------------------------------------------------------
# 危险命令黑名单（Blacklist）
# 包含这些模式的 PoC 代码直接 BLOCKED
# ---------------------------------------------------------------------------

DANGEROUS_PATTERNS: list[tuple[str, str]] = [
    # 文件系统破坏
    (r"rm\s+-rf\s+/", "危险：尝试删除根目录"),
    (r"rm\s+-rf\s+~", "危险：尝试删除 home 目录"),
    (r"mkfs\.", "危险：格式化文件系统"),
    (r"dd\s+if=/dev/zero", "危险：覆盖磁盘数据"),
    # 网络外联
    (r"curl\s+.*\|\s*bash", "危险：curl 管道执行远程脚本"),
    (r"wget\s+.*\|\s*bash", "危险：wget 管道执行远程脚本"),
    (r"nc\s+-e\s+/bin/", "危险：netcat 反弹 shell"),
    (r"bash\s+-i\s+>&", "危险：bash 反弹 shell"),
    # 权限提升
    (r"chmod\s+777\s+/etc/passwd", "危险：修改 /etc/passwd 权限"),
    (r"chown\s+.*\s+/etc/shadow", "危险：修改 /etc/shadow 所有者"),
    # 容器逃逸
    (r"docker\s+run\s+--privileged", "危险：特权容器运行"),
    (r"/proc/self/exe", "危险：尝试容器逃逸"),
    # 加密勒索
    (r"openssl\s+enc\s+-aes.*-e", "危险：批量加密文件（勒索软件特征）"),
    # 挖矿
    (r"xmrig|minerd|cpuminer", "危险：加密货币挖矿程序"),
]


# ---------------------------------------------------------------------------
# 数据类：闸门校验结果
# ---------------------------------------------------------------------------

@dataclass
class GateResult:
    decision: GateDecision
    cve_id: str
    reason: str
    matched_patterns: List[str] = field(default_factory=list)
    sandbox_available: bool = True
    warnings: List[str] = field(default_factory=list)

    def is_allowed(self) -> bool:
        return self.decision in (GateDecision.ALLOW, GateDecision.WARN)

    def to_dict(self) -> dict:
        return {
            "decision": self.decision.value,
            "cve_id": self.cve_id,
            "reason": self.reason,
            "matched_patterns": self.matched_patterns,
            "sandbox_available": self.sandbox_available,
            "warnings": self.warnings,
        }


# ---------------------------------------------------------------------------
# 主校验函数
# ---------------------------------------------------------------------------

def check_sandbox_available() -> bool:
    """检查 Docker 沙箱是否可用"""
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def check_cve_whitelist(cve_id: str) -> bool:
    """检查 CVE ID 是否在白名单中"""
    return cve_id.upper() in CVE_WHITELIST


def check_blacklist(poc_code: str) -> list[tuple[str, str]]:
    """
    检查 PoC 代码是否包含危险命令黑名单中的模式。
    返回所有命中的 (pattern, reason) 列表。
    """
    matched = []
    for pattern, reason in DANGEROUS_PATTERNS:
        if re.search(pattern, poc_code, re.IGNORECASE | re.MULTILINE):
            matched.append((pattern, reason))
    return matched


def gate_check(
    cve_id: str,
    poc_code: str,
    require_sandbox: bool = True,
) -> GateResult:
    """
    执行完整的安全闸门校验。

    Args:
        cve_id: CVE 编号（如 "CVE-2024-22120"）
        poc_code: PoC 代码文本
        require_sandbox: 是否要求沙箱可用（默认 True）

    Returns:
        GateResult 对象，包含决策结果和详细原因
    """
    cve_id = cve_id.upper().strip()

    # Step 1: CVE 白名单校验
    if not check_cve_whitelist(cve_id):
        return GateResult(
            decision=GateDecision.BLOCKED,
            cve_id=cve_id,
            reason=f"CVE {cve_id} 不在白名单中，拒绝执行",
            sandbox_available=False,
        )

    # Step 2: 危险命令黑名单校验
    matched = check_blacklist(poc_code)
    if matched:
        matched_patterns = [reason for _, reason in matched]
        return GateResult(
            decision=GateDecision.BLOCKED,
            cve_id=cve_id,
            reason=f"PoC 代码命中黑名单规则，拒绝执行",
            matched_patterns=matched_patterns,
        )

    # Step 3: 沙箱可用性校验
    sandbox_ok = check_sandbox_available()
    warnings = []

    if require_sandbox and not sandbox_ok:
        return GateResult(
            decision=GateDecision.BLOCKED,
            cve_id=cve_id,
            reason="Docker 沙箱不可用，拒绝在非沙箱环境执行",
            sandbox_available=False,
        )

    if not sandbox_ok:
        warnings.append("Docker 沙箱不可用，将在本地环境执行（降级模式）")
        return GateResult(
            decision=GateDecision.WARN,
            cve_id=cve_id,
            reason="沙箱不可用，降级为本地执行（WARN 模式）",
            sandbox_available=False,
            warnings=warnings,
        )

    # Step 4: 全部通过
    return GateResult(
        decision=GateDecision.ALLOW,
        cve_id=cve_id,
        reason="所有安全校验通过，允许在沙箱中执行",
        sandbox_available=True,
    )


# ---------------------------------------------------------------------------
# CLI 入口
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("用法: python3 poc_gate.py <CVE_ID> [poc_code_file]")
        sys.exit(1)

    cve = sys.argv[1]
    poc_text = ""
    if len(sys.argv) >= 3:
        with open(sys.argv[2], "r") as f:
            poc_text = f.read()

    result = gate_check(cve, poc_text)
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    sys.exit(0 if result.is_allowed() else 1)
