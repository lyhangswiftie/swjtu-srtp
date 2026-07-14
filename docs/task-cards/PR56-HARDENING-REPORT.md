# TC-SCA-PR56-HARDENING-002 工程硬化报告（最终版）

**任务卡**：TC-SCA-PR56-HARDENING-002  
**分支**：`fix/recent-git-import-agent-startup`  
**PR**：#56  
**完成日期**：2026-06-01  
**验收状态**：**7/7 修复点 PASS | 10/10 单元测试 PASS | E1/E2/E3-FULL PASS**

---

## 修复点汇总（最终状态）

| 编号 | 文件 | 修复内容 | 状态 |
|------|------|---------|------|
| 修复点1 | `install.sh` | `APP_MODE:-oss`（对齐 `AppMode.OPENHANDS.value='oss'`） | **PASS** |
| 修复点2 | `install.sh` | `PATCHED_SANDBOX_FILE` 文件不存在时 `exit 1`（强失败，不跳过） | **PASS** |
| 修复点3 | `docker_sandbox_service.py` | `_get_startup_grace_seconds()` fail-fast 策略（见下方策略说明） | **PASS** |
| 修复点4 | `install.sh` | `mktemp` + `chmod 600` + `--data-binary @file` 安全注入 GitHub Token；安装日志中不打印 Token 任何片段 | **PASS** |
| 修复点5 | `install.sh` | pip 包名加引号 `"PyYAML>=6.0.2"` `"requests>=2.32.3"` | **PASS** |
| 修复点6 | `OpenHandsMocks.tsx` | 黄色 Banner 文案：去掉"自动投递"歧义；修复"沙筎"→"沙箱"错字 | **PASS** |
| 修复点7 | `install.sh` | `chmod 700 ~/.openhands` | **PASS** |

---

## STARTUP_GRACE_SECONDS 策略说明（方案 B：fail-fast）

本轮采用 **fail-fast 策略**，与任务卡原建议（fallback 90 + clamp 15-600）不同，选择理由如下：

- 安装脚本面向开发者，配置错误应快速暴露而非静默回退
- 零值/负值表示配置错误，不应被静默接受
- 最小合法值为 10 秒（`_MIN_STARTUP_GRACE_SECONDS`），低于此值使用最小值并打印警告

**具体行为**：

| 输入值 | 行为 |
|--------|------|
| 未设置 | 使用默认值 90 秒 |
| 合法正整数（≥10） | 直接使用 |
| 正整数但 <10 | 使用最小值 10 秒（打印警告） |
| 0 或负数 | 抛出 `ValueError`（快速失败） |
| 非整数字符串（如 `abc`） | 抛出 `ValueError`（快速失败） |

**无最大值上限**（与任务卡原建议 600 秒上限不同，本轮不设上限）。

---

## 修复点4 详细说明（GitHub Token 安全注入）

**修复前**：Token 前4位出现在安装日志中：
```bash
echo "[*] 检测到 GitHub Token（前4位: ${GIT_PROVIDER_TOKEN_VALUE:0:4}****）"
```

**修复后**：安装日志中不出现 Token 任何片段：
```bash
echo "[*] 检测到 GitHub Token，将在安装后自动注入"
```

**mktemp 安全注入结构**（已落地，第 261-276 行）：
```bash
_GIT_PAYLOAD_FILE=$(mktemp /tmp/sca_git_payload.XXXXXX.json)
chmod 600 "${_GIT_PAYLOAD_FILE}"
cat > "${_GIT_PAYLOAD_FILE}" <<EOF
{
    "provider_tokens": {
        "github": {
            "token": "${GIT_PROVIDER_TOKEN_VALUE}",
            "host": "github.com"
        }
    }
}
EOF
curl -s -X POST http://localhost:3000/api/add-git-providers \
    -H "Content-Type: application/json" \
    --data-binary "@${_GIT_PAYLOAD_FILE}" 2>/dev/null
rm -f "${_GIT_PAYLOAD_FILE}"
```

---

## 修复点2 详细说明（PATCHED_SANDBOX_FILE 强失败）

**修复前**：文件不存在时跳过挂载并继续启动（PARTIAL PASS）：
```bash
if [ ! -f "${PATCHED_SANDBOX_FILE}" ]; then
    echo "[!] 警告: ...将跳过 volume mount，使用镜像内置版本"
    PATCHED_SANDBOX_FILE=""
fi
${PATCHED_SANDBOX_FILE:+-v "..."}  # 条件展开
```

**修复后**：文件不存在时 `exit 1`，docker run 直接使用 `-v`（无条件展开）：
```bash
if [ ! -f "${PATCHED_SANDBOX_FILE}" ]; then
    echo "[✗] 未找到修复版 docker_sandbox_service.py:"
    echo "    ${PATCHED_SANDBOX_FILE}"
    echo "    无法保证 Issue #52 后端修复进入容器，终止启动。"
    exit 1
fi
# docker run 中：
-v "${PATCHED_SANDBOX_FILE}:/app/openhands/app_server/sandbox/docker_sandbox_service.py:ro" \
```

---

## 单元测试结果（10/10 PASS）

```
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_default_startup_grace_is_90_seconds     PASSED
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_env_var_override_startup_grace          PASSED
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_env_var_zero_startup_grace              PASSED  ← T3: 0值期望 ValueError
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_env_var_invalid_value_raises            PASSED
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_health_check_within_grace_period_stays_starting  PASSED
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_health_check_beyond_grace_period_becomes_error   PASSED
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_install_sh_contains_startup_grace_env   PASSED
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_env_var_below_minimum_uses_minimum      PASSED  ← T8: <10 使用最小值
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_install_sh_app_mode_default_is_oss      PASSED  ← T9: APP_MODE=oss
tests/unit/app_server/test_docker_sandbox_startup_grace.py::test_install_sh_volume_mount_has_guard       PASSED  ← T10: PATCHED_SANDBOX_FILE 校验
============================== 10 passed in 1.31s ==============================
```

---

## 验收命令输出

### bash -n 语法检查
```
install.sh 语法检查: PASS
```

### grep 验收
```
grep -n "mktemp\|--data-binary\|GIT_PROVIDER_TOKEN_VALUE:0" install.sh

261:    _GIT_PAYLOAD_FILE=$(mktemp /tmp/sca_git_payload.XXXXXX.json)
275:        --data-binary "@${_GIT_PAYLOAD_FILE}" 2>/dev/null)
# GIT_PROVIDER_TOKEN_VALUE:0 → 不存在（PASS）
```

### 容器内验证

**E1**：
```
ENV AGENT_SERVER_STARTUP_GRACE_SECONDS = 90
m.STARTUP_GRACE_SECONDS = 90
m._DEFAULT_STARTUP_GRACE_SECONDS = 90
m._MIN_STARTUP_GRACE_SECONDS = 10
_get_startup_grace_seconds exists: True
E1 VERDICT: PASS
```

**E2**：
```
app_mode = AppMode.OPENHANDS
AppMode.OPENHANDS.value = oss
git_api_router 注册条件: True
E2 VERDICT: PASS
```

**E3-FULL**：
```
HTTP/1.1 200 OK
[{"full_name":"SWJTU-AI-Lab/SecManus",...}, {"full_name":"swjtu-dev-squad/socitwin",...}, ...]
```

---

## 提交记录

| Commit | 说明 |
|--------|------|
| `063ed31f1d` | `hardening(install.sh)`: APP_MODE=oss + volume mount guard + pip quotes + chmod 700 |
| `59fb2797af` | `hardening(docker_sandbox_service)`: `_get_startup_grace_seconds()` fail-fast 策略 |
| `9ed2291802` | `hardening(OpenHandsMocks)`: 黄色 Banner 文案修正 |
| `cf17e33628` | `hardening(tests)`: T3 改为 ValueError，新增 T8/T9/T10 |
| `(final)` | `hardening(final)`: Token 日志去除前4位、mount guard exit 1、沙箱错字、报告更新 |
