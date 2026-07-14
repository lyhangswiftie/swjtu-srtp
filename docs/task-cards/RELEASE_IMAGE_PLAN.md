# SecureCodeAct (SCA) 镜像发布计划

本文档规划了将 SecureCodeAct 的各项修复和前端修改打包为独立 Docker 镜像的实施路径。当前依赖 `ghcr.io/openhands/openhands:1.6.0` 并在启动时通过 `install.sh` 动态注入前端构建产物和后端补丁的方式，虽然灵活，但在生产部署和分发时存在明显弊端。

## 1. 当前架构的局限性

目前的一键安装脚本 (`install.sh`) 采用动态注入模式：

| 注入项 | 机制 | 痛点 |
|--------|------|------|
| **SCA-HUD 前端** | 宿主机编译 Node.js，然后 `docker cp` 注入容器 | 依赖宿主机的 Node.js 环境，且耗时较长（约 1-2 分钟） |
| **后端 Python 补丁** | 使用 `-v` 参数进行 Volume Mount 覆盖容器内文件 | 需要维护宿主机文件与容器内路径的严格映射，容易因路径错误导致静默失败 |
| **初始化配置** | 容器启动后通过 `curl` 调用 `/api/settings` 和 `/api/add-git-providers` | 依赖容器完全就绪，增加了启动流程的脆弱性和时序依赖 |

## 2. 目标架构：独立发版镜像

我们的目标是构建一个开箱即用的独立镜像 `swjtu-ai-lab/securecodeact:latest`，实现“零宿主机依赖，一行命令启动”。

### 2.1 镜像构建策略 (Dockerfile)

采用多阶段构建 (Multi-stage Build) 策略：

**阶段 1：前端构建 (Frontend Builder)**
基于 Node.js 22.x 镜像，复制 `frontend` 目录，执行 `npm install` 和 `npm run build`，生成静态产物。

**阶段 2：后端合并与最终镜像 (Final Image)**
基于 `ghcr.io/openhands/openhands:1.6.0` 作为基础镜像。

1. **合并前端**：将阶段 1 构建的静态产物复制到容器内对应的静态文件服务目录。
2. **合并后端补丁**：将修复后的 Python 文件（如 `docker_sandbox_service.py`）直接复制并覆盖基础镜像内的对应文件，彻底消除 Volume Mount 的需求。
3. **环境预设**：将默认的 `APP_MODE=oss` 等环境变量固化到镜像的 ENV 中。

### 2.2 启动脚本简化

在独立镜像发布后，`install.sh` 将被大幅简化，仅保留：
1. 检查 Docker 环境。
2. 引导用户设置 `OPENAI_API_KEY` 等核心环境变量。
3. 执行一条极简的 `docker run` 命令启动 `swjtu-ai-lab/securecodeact:latest`。

## 3. 实施路径与里程碑

### 阶段一：Dockerfile 编写与本地验证 (W1)
- 编写多阶段构建的 `Dockerfile`。
- 本地执行 `docker build` 并验证前后端功能是否正常。
- 验证环境变量（如 `GITHUB_TOKEN`）是否能被容器内的 Entrypoint 脚本正确读取并初始化，消除对外部 `curl` 调用的依赖。

### 阶段二：CI/CD 自动化构建 (W2)
- 在 GitHub Actions 中配置工作流。
- 监听 `main` 分支的 Tag 推送事件。
- 自动执行构建并将镜像推送到 GitHub Container Registry (GHCR) 或 Docker Hub。

### 阶段三：用户迁移与文档更新 (W3)
- 更新 README，将默认安装方式切换为直接拉取独立镜像。
- 提供旧版本用户的迁移指南。
- 保留 `install-dev.sh` 用于开发环境的动态注入调试模式。
