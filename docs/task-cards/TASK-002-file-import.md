# TASK-002：GitHub 仓库文件导入修复

| 字段 | 内容 |
|------|------|
| **任务 ID** | TASK-002 |
| **关联 Issue** | [#53](https://github.com/SWJTU-AI-Lab/securecodeact/issues/53) |
| **优先级** | P0（核心功能阻断） |
| **状态** | Open |
| **类型** | Bug Fix + Configuration |
| **模块** | 后端 Git 路由 / install.sh 配置 |
| **创建日期** | 2026-05-31 |
| **预计工时** | 2 小时 |

---

## 1. 问题描述

在 SCA-HUD 前端尝试导入 GitHub 仓库文件时，仓库列表无法加载（空列表或报错），无法将 GitHub 仓库文件拉取到工作区。

## 2. 根因分析

### 2.1 主要根因 A：`git_api_router` 条件注册

```python
# openhands/server/app.py 第 99-100 行
if server_config.app_mode == AppMode.OPENHANDS:
    app.include_router(git_api_router)
```

`/api/user/repositories` 路由只在 `APP_MODE=openhands` 时注册。`install.sh` 中的 `docker run` 命令**未设置 `APP_MODE` 环境变量**，导致该路由不存在，前端收到 **404 Not Found**。

**验证方法**：
```bash
curl -s http://localhost:3000/api/user/repositories?provider=github
# 返回 {"detail":"Not Found"} → 确认是此问题
```

**代码位置**：
- `openhands/server/app.py`，第 99-100 行
- `install.sh`，`docker run` 命令段

### 2.2 主要根因 B：GitHub Token 未设置

`install.sh` 中的 `POST /api/settings` 只设置了 LLM 配置，**未设置 GitHub provider token**：

```bash
# 当前 install.sh 中缺少的配置
curl -X POST http://localhost:3000/api/settings \
    -d '{"provider_tokens": {"github": "ghp_xxx"}}'
```

即使 `APP_MODE` 正确，`get_provider_tokens()` 也返回 `null`，所有 GitHub API 调用返回 **401 Unauthorized**。

**代码位置**：
- `openhands/server/user_auth/default_user_auth.py`，`get_provider_tokens()` 方法
- `openhands/storage/data_models/secrets.py`，`provider_tokens` 字段
- `install.sh`，LLM 设置步骤

---

## 3. 修复方案

### 3.1 方案 A：修改 install.sh（立即可用）

**Step 1**：在 `docker run` 命令中添加 `APP_MODE`：

```bash
# install.sh 中 docker run 命令添加
-e APP_MODE=openhands \
```

**Step 2**：在 LLM 设置步骤之后添加 GitHub token 设置：

```bash
# ─── 12. 设置 GitHub Token（可选）────────────────────────────
if [ -n "${GITHUB_TOKEN}" ]; then
    echo "[*] 正在设置 GitHub Token..."
    sleep 1
    GITHUB_RESP=$(curl -s -X POST http://localhost:3000/api/settings \
        -H "Content-Type: application/json" \
        -d "{\"provider_tokens\": {\"github\": \"${GITHUB_TOKEN}\"}}" 2>/dev/null)
    if echo "$GITHUB_RESP" | grep -q "Settings stored"; then
        echo "[✓] GitHub Token 设置成功"
    else
        echo "[!] GitHub Token 设置失败，请在 UI Settings 页面手动配置"
        echo "    响应: $GITHUB_RESP"
    fi
else
    echo "[!] 未检测到 GITHUB_TOKEN 环境变量，跳过 GitHub 集成配置"
    echo "    如需使用 GitHub 仓库导入功能，请在 UI Settings 页面手动配置 Token"
fi
```

### 3.2 方案 B：docker-compose.yml 修复

```yaml
# docker-compose.yml 中添加
environment:
  - APP_MODE=openhands
  - GITHUB_TOKEN=${GITHUB_TOKEN}
```

### 3.3 方案 C：UI 手动设置

在 SCA-HUD 界面的 Settings 页面，手动填写 GitHub Personal Access Token（需要 `repo` 和 `read:user` 权限）。

---

## 4. 验收标准

| 验收项 | 验证方法 | 通过标准 |
|--------|----------|---------|
| `/api/user/repositories` 路由存在 | `curl http://localhost:3000/api/user/repositories?provider=github` | 返回 200 或 401（非 404）|
| GitHub token 设置成功 | 查看 install.sh 输出 | 显示 `[✓] GitHub Token 设置成功` |
| 仓库列表可以加载 | 在前端点击"导入 GitHub 仓库" | 显示仓库列表 |
| 仓库可以导入 | 选择仓库并点击导入 | 文件出现在工作区 |

---

## 5. 相关文件

```
install.sh                                              ← 需添加 APP_MODE 和 GitHub token 设置
openhands/server/app.py                                 ← git_api_router 条件注册（第 99-100 行）
openhands/server/routes/git.py                          ← /api/user/repositories 端点
openhands/server/user_auth/default_user_auth.py         ← get_provider_tokens 实现
openhands/storage/data_models/secrets.py                ← provider_tokens 数据模型
frontend/src/api/git-service/git-service.api.ts         ← 前端 API 调用
```

---

## 6. 参考链接

- Issue #53：https://github.com/SWJTU-AI-Lab/securecodeact/issues/53
- 架构分析报告：`docs/arch-analysis/5.31-arch-analysis.md`
