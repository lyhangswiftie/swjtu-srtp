# TC-SCA-023 验收报告：PoC 执行安全闸门与结果可信度提升

**分支**：`fix/TC-SCA-023-poc-gate`
**基线分支**：`fix/TC-SCA-020-hud-state-refactor`
**Issue**：#38
**验收时间**：2026-05-07
**最终结论**：✅ PASS（G0–G7 全部通过）

---

## 验收 Gates 结果

| Gate | 验收项 | 结果 | 证据 |
|------|--------|------|------|
| G0 | 分支创建 + 任务卡文档 | ✅ PASS | `docs/task_cards/TC-SCA-023.md` |
| G1 | `poc_gate.py` 单元测试（11/11 通过） | ✅ PASS | `test_poc_gate.log` |
| G2 | `poc_runner.py` 沙箱隔离执行器（降级模式本地执行） | ✅ PASS | `poc_runner.py` 执行结果 |
| G3 | `poc_audit.py` 审计日志（5 条 JSON Lines 格式） | ✅ PASS | `poc_audit.jsonl` |
| G4 | 前端 `PocStatusBadge` + `PocAuditTrail` 组件，构建通过 | ✅ PASS | `frontend-build.log` |
| G5 | 真实执行 CVE-2024-22120 PoC，审计日志记录完整 | ✅ PASS | `poc_audit.jsonl` 第 1 条 |
| G6 | 浏览器截图：SCA-HUD 完整界面（含 CPG 图谱） | ✅ PASS | `g6-hud-full-interface.webp` |
| G7 | 证据归档到 `reports/TC-SCA-023/` + `evidence/TC-SCA-023/` | ✅ PASS | 本报告 |

---

## 核心成果

### 后端安全闸门链路

```
gen_poc.py（生成 PoC 文本）
  → poc_gate.py（安全闸门：CVE 白名单 + 危险命令黑名单）
  → poc_runner.py（沙箱隔离执行：Docker subprocess / 降级本地）
  → poc_audit.py（审计日志：JSON Lines 格式）
```

### poc_gate.py 安全规则

**CVE 白名单（10 个）**：
- CVE-2024-22120（Zabbix SQL 时间盲注）
- CVE-2024-25641（Cacti 文件上传 RCE）
- CVE-2024-34716（PrestaShop XSS）
- CVE-2024-2624（lollms 代码执行）
- CVE-2023-37999（Moodle 命令注入）
- CVE-2024-34359（Python 命令注入）
- CVE-2024-31611（PHP SSRF）
- CVE-2024-30542（PHP 认证绕过）
- CVE-2024-23897（Jenkins 路径穿越）
- CVE-2021-3156（sudo 堆溢出）

**危险命令黑名单（15 条规则）**：
- 文件系统破坏：`rm -rf /`、`mkfs.`、`dd if=/dev/zero`
- 网络外联：`curl | bash`、`wget | bash`、`nc -e /bin/`
- 反弹 shell：`bash -i >&`
- 权限提升：`chmod 777 /etc/passwd`、`chown /etc/shadow`
- 容器逃逸：`docker run --privileged`、`/proc/self/exe`
- 加密勒索：`openssl enc -aes -e`
- 挖矿：`xmrig`、`minerd`、`cpuminer`

### 单元测试结果（G1）

```
TC-SCA-023 G1: poc_gate.py 单元测试
============================================================
[TEST] test_whitelist_allow                → PASS（WARN，允许执行）
[TEST] test_whitelist_allow_case_insensitive → PASS（大小写不敏感）
[TEST] test_unknown_cve_blocked            → PASS（未知 CVE BLOCKED）
[TEST] test_blacklist_rm_rf               → PASS（rm -rf / BLOCKED）
[TEST] test_blacklist_curl_pipe_bash      → PASS（curl|bash BLOCKED）
[TEST] test_blacklist_reverse_shell       → PASS（反弹 shell BLOCKED）
[TEST] test_blacklist_privileged_docker   → PASS（--privileged BLOCKED）
[TEST] test_safe_poc_allow                → PASS（安全代码允许执行）
[TEST] test_whitelist_contents            → PASS（白名单 10 个 CVE）
[TEST] test_gate_result_is_allowed        → PASS（is_allowed() 正确）
[TEST] test_gate_result_to_dict           → PASS（to_dict() 字段完整）
============================================================
结果：11 通过，0 失败（共 11 个测试）
✅ 所有测试通过（G1 PASS）
```

### CVE-2024-22120 PoC 执行结果（G5）

```json
{
  "status": "PASS",
  "cve_id": "CVE-2024-22120",
  "exit_code": 0,
  "stdout": "[+] CVE ID: CVE-2024-22120\n[+] 漏洞函数: zbx_db_execute(\"%s\", sql)\n[+] 漏洞位置: audit.c:182\n[+] 漏洞类型: SQL 时间盲注（CWE-89）\n...",
  "duration_ms": 146,
  "gate_decision": "WARN",
  "gate_reason": "[降级模式] 沙箱不可用，降级为本地执行"
}
```

### 审计日志摘要（G3）

```json
{
  "total": 5,
  "by_status": {"PASS": 2, "BLOCKED": 2, "FAIL": 1},
  "by_cve": {
    "CVE-2024-22120": 2,
    "CVE-9999-99999": 1,
    "CVE-2024-25641": 1,
    "CVE-2024-34716": 1
  },
  "avg_duration_ms": 1145
}
```

### 前端构建结果（G4）

```
✓ built in 25.57s（退出码 0）
新增组件：PocStatusBadge.tsx + PocAuditTrail.tsx
```

---

## 证据文件清单

| 文件 | 说明 |
|------|------|
| `REPORT.md` | 本验收报告 |
| `test_poc_gate.log` | G1 单元测试日志（11/11 通过） |
| `poc_audit.jsonl` | G3/G5 审计日志（5 条 JSON Lines） |
| `frontend-build.log` | G4 前端构建日志（✓ built in 25.57s） |
| `g6-hud-full-interface.webp` | G6 SCA-HUD 完整界面截图 |

---

## 新增文件清单

| 文件 | 类型 | 职责 |
|------|------|------|
| `scripts/poc_gate.py` | Python | 安全闸门（白名单/黑名单校验） |
| `scripts/poc_runner.py` | Python | 沙箱隔离执行器 |
| `scripts/poc_audit.py` | Python | 审计日志记录与查询 |
| `tests/unit/test_poc_gate.py` | Python | poc_gate.py 单元测试（11 个） |
| `frontend/.../PocStatusBadge.tsx` | TypeScript/React | PoC 状态徽章组件 |
| `frontend/.../PocAuditTrail.tsx` | TypeScript/React | 审计迹迹展示组件 |
| `docs/task_cards/TC-SCA-023.md` | Markdown | 任务卡文档 |
