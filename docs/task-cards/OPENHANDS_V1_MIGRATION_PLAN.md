# OpenHands V1 架构迁移计划

本文档评估了 SecureCodeAct 从当前依赖的 OpenHands 1.6.0 (Legacy V0 架构) 迁移到最新 V1 架构的可行性与实施计划。

## 1. 架构差异与痛点分析

### 1.1 当前状态 (基于 1.6.0)

SecureCodeAct v3.2 深度依赖 OpenHands 1.6.0 版本的内部实现细节。在最近的 TC-SCA-RECENT-ISSUES-001 修复中，我们发现了一些关键问题：

- **路由注册机制脆弱**：GitHub 导入路由 (`git_api_router`) 依赖 `APP_MODE=oss` 的严格匹配，稍有不慎即导致接口 404。
- **凭证存储机制复杂**：Provider Token 的存储和读取涉及 `SecretsStoreImpl`、`FileSecretsStore` 和 `DefaultUserAuth` 之间的复杂交互，且受到 `file_store_path` 全局配置的影响。
- **沙箱生命周期管理**：`STARTUP_GRACE_SECONDS` 需要通过硬编码补丁（Volume Mount）进行干预，以适配不同性能的主机环境。

### 1.2 V1 架构的演进

OpenHands 最新的 V1 架构在底层进行了大幅重构：

- **App Server 与 Agent Server 分离**：V1 引入了更加清晰的微服务架构，前端直接与 App Server 通信，而核心的 Agent 逻辑和沙箱管理被剥离到独立的 Agent Server 中。
- **全新的 API 路由结构**：旧版的 `git_api_router` 和 `settings` 接口在 V1 中已被重构或废弃，API 路径和数据结构均发生了变化。
- **配置管理重构**：环境变量的加载优先级和默认值处理机制更加标准化，摒弃了部分冗余的 `AppMode` 枚举判断。

## 2. 迁移挑战评估

直接将基础镜像升级到 V1 版本将导致 SecureCodeAct 出现严重的兼容性断裂：

| 模块 | 影响评估 | 适配工作量 |
|------|----------|------------|
| **SCA-HUD 前端** | 高。WebSocket 连接端点、事件结构（AgentState）和后端 REST API 路径均需重构。 | 大（需重写 API Client 层） |
| **流水线脚本** | 中。`sca_pipeline.py` 依赖的某些内部接口或返回结构可能变化。 | 中（需进行全面的端到端回归测试） |
| **补丁与硬化** | 高。现有的 `docker_sandbox_service.py` 补丁在 V1 目录结构中可能不再适用。 | 大（需重新定位核心类并编写新补丁） |
| **一键安装脚本** | 中。容器启动参数、健康检查端点和初始化 API（如 `/api/settings`）需调整。 | 中 |

## 3. 迁移实施路径

为确保系统的稳定性，我们计划采用渐进式的迁移策略：

### 阶段一：技术预研与分支隔离 (M1)
- 创建 `feature/v1-migration` 实验分支。
- 梳理 V1 架构下前后端通信的 API 契约（API Contract）。
- 评估 V1 架构对 CPG 图谱生成和 Neo4j 集成的潜在影响。

### 阶段二：后端适配与前端重构 (M2)
- 废弃针对 1.6.0 的硬编码补丁，寻找 V1 架构下更优雅的配置覆盖方式。
- 重构 SCA-HUD 前端的网络请求层，适配新的 App Server 接口。
- 调整 `install.sh` 中的启动命令和环境变量。

### 阶段三：集成测试与灰度发布 (M3)
- 在实验分支上运行完整的 TC-SCA-025 端到端流水线测试。
- 修复发现的回归缺陷。
- 提供 V1 架构的 Beta 版本镜像供社区测试，收集反馈后正式合并到 `main` 分支。
