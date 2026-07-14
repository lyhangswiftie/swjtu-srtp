# SecureCodeAct 环境基线（ENV_BASELINE）

**版本**：v3.1 | **更新日期**：2026-05-18 | **对应 Issue**：TC-SCA-017

---

## 1. 运行时依赖版本基线

| 组件 | 最低版本 | 推荐版本 | 说明 |
|------|----------|----------|------|
| Docker | 24.0+ | 29.x | 用于运行 OpenHands 容器和沙箱 |
| Node.js | **22.12.0+** | 22.x LTS | 用于构建 SCA-HUD 前端（`frontend/package.json` engines 字段要求）|
| Python | **3.11+** | 3.12 | 前端基线不强制 3.12；后端 Poetry 安装推荐 3.12 |
| OpenHands | 1.6.0 | 1.6.0 | 镜像 `ghcr.io/openhands/openhands:1.6.0` |
| OpenHands Runtime | 1.6.0-nikolaik | 1.6.0-nikolaik | 沙箱镜像 |

---

## 2. Python 版本说明（TC-SCA-017-FU1 修正）

> **重要说明**：`pyproject.toml` 中 `requires-python = ">=3.12,<3.14"` 是后端 Poetry 安装的严格要求。
> 前端基线（`npm install && npm run build`）不依赖 Python 版本，Python 3.11 可满足前端构建需求。

| 场景 | Python 版本要求 |
|------|----------------|
| 仅构建前端（`npm install && npm run build`）| >=3.11 |
| 后端 Poetry 安装（`poetry install`）| >=3.12,<3.14 |
| 完整开发环境 | 推荐 3.12.x |

`scripts/doctor.sh` 中的 Python 版本检查已对齐上述规则：前端基线判定为 >=3.11 PASS。

---

## 3. 前端依赖版本基线

| 包 | 版本 | 说明 |
|----|------|------|
| `@heroui/react` | ^2.8.10 | UI 组件库 |
| `@heroui/theme` | ^2.2.14 | HeroUI 主题（需显式安装）|
| `@heroui/system` | ^2.2.6 | HeroUI 系统（需显式安装）|
| `framer-motion` | ^12.38.0 | 动画库（@heroui/react peer dep）|
| `react` | ^19.2.5 | React 主版本 |
| `vite` | ^7.3.1 | 构建工具 |

> **注意**：`npm install` 需要使用 `--legacy-peer-deps` 标志以解决 peer dependency 冲突。

---

## 4. 关键环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `OPENAI_API_KEY` | 是 | — | LLM API 密钥 |
| `OPENAI_BASE_URL` | 否 | `https://api.openai.com/v1` | LLM Base URL |
| `LLM_MODEL` | 否 | `gpt-4.1-mini` | LLM 模型名称 |
| `SANDBOX_LOCAL_RUNTIME_URL` | 内部 | `http://localhost:8000` | 沙箱运行时 URL（**必须包含 :8000 端口**）|

---

## 5. 已知问题与修复记录

| Issue | 问题描述 | 修复版本 | 修复方式 |
|-------|----------|----------|----------|
| #17 | WSL2 沙箱 500 启动失败 | v3.0 | 添加 NET_ADMIN/NET_RAW 权限 |
| #21 | 依赖冲突导致容器建立失败 | v3.1 | 补充 @heroui/theme 依赖 |
| #46 | 沙箱 120s 超时 | v3.1 | SANDBOX_LOCAL_RUNTIME_URL 增加 :8000 端口 |
| TC-SCA-017-FU1 | Python 版本表述不一致 | v3.1 | ENV_BASELINE.md 修正为前端 >=3.11，后端 >=3.12 |
