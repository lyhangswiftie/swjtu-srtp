# TASK-001：指令被吞没修复

| 字段 | 内容 |
|------|------|
| **任务 ID** | TASK-001 |
| **关联 Issue** | [#52](https://github.com/SWJTU-AI-Lab/securecodeact/issues/52) |
| **优先级** | P0（核心功能阻断） |
| **状态** | Open |
| **类型** | Bug Fix |
| **模块** | 后端沙箱服务 / 前端消息发送 |
| **创建日期** | 2026-05-31 |
| **预计工时** | 4 小时 |

---

## 1. 问题描述

用户在前端输入指令后，Agent 无任何执行响应。会话记录可以正常创建，但指令被静默丢弃，无法到达 Agent 执行层。

## 2. 根因分析

### 2.1 主要根因：agent-server 容器启动超时

`docker_sandbox_service.py` 中 `STARTUP_GRACE_SECONDS = 15`（默认 15 秒）。在性能较低的机器或 WSL2 环境中，`openhands-agent-server` 容器往往需要 30-60 秒才能通过 `/alive` 健康检查。

**影响链路**：

```
容器启动 > 15s
  → exposed_urls = null
  → conversation_url = null
  → buildWebSocketUrl() 返回 null
  → WebSocket 连接永远不建立
  → 所有消息走 PendingMessageService.queueMessage()
  → _process_pending_messages() 因 conversation_url=null 无法投递
  → 指令被永久丢弃
```

**代码位置**：
- `openhands/app_server/sandbox/docker_sandbox_service.py`，第 41 行：`STARTUP_GRACE_SECONDS = 15`
- `openhands/app_server/config.py`，第 254 行：`SANDBOX_STARTUP_GRACE_SECONDS` 环境变量读取

### 2.2 次要根因：前端无连接状态反馈

WebSocket 未连接时，前端没有任何提示，用户无法判断消息是否已排队或丢失。

**代码位置**：
- `frontend/src/hooks/use-send-message.ts`

### 2.3 潜在根因：V0/V1 判断时序问题

`isV1Conversation` 在 `conversation` 数据 refetch 期间可能为 `undefined`，导致错误走 V0 路径。

**代码位置**：
- `frontend/src/context/conversation-context.tsx`

---

## 3. 修复方案

### 3.1 方案 A：扩展启动超时（立即可用，5 分钟）

在 `install.sh` 的 `docker run` 命令中添加：

```bash
-e SANDBOX_STARTUP_GRACE_SECONDS=60 \
```

**验收标准**：重启后，在 60 秒内 agent-server 容器通过健康检查，`conversation_url` 正确设置，指令可以正常传达。

### 3.2 方案 B：增加启动失败日志（根本修复）

修改 `docker_sandbox_service.py`，在健康检查超时时记录详细错误日志：

```python
# openhands/app_server/sandbox/docker_sandbox_service.py
async def _container_to_checked_sandbox_info(self, container) -> SandboxInfo | None:
    sandbox_info = await self._container_to_sandbox_info(container)
    if sandbox_info and sandbox_info.status == SandboxStatus.ERROR:
        logger.error(
            f"[TASK-001] Agent server container '{container.name}' failed to start "
            f"within {self.startup_grace_seconds}s. "
            f"Set SANDBOX_STARTUP_GRACE_SECONDS env var to increase timeout. "
            f"Container logs: {container.logs(tail=20).decode()}"
        )
    return sandbox_info
```

### 3.3 方案 C：前端连接状态提示

修改 `frontend/src/hooks/use-send-message.ts`：

```typescript
// 发送前检查 WebSocket 连接状态
const { connectionState } = useConversationWebSocket();
if (isV1Conversation && connectionState !== "OPEN") {
  toast.warning("Agent 正在初始化，消息已排队，连接建立后将自动发送");
}
```

---

## 4. 验收标准

| 验收项 | 验收方法 | 通过标准 |
|--------|----------|---------|
| 指令可以正常传达 | 在前端输入指令，观察 Terminal | Agent 在 60 秒内开始执行 |
| 启动超时有日志 | 查看 Docker 日志 | 超时时有明确错误日志 |
| 前端有状态提示 | 观察前端 Toast | 连接建立前显示"排队中"提示 |

---

## 5. 相关文件

```
openhands/app_server/sandbox/docker_sandbox_service.py  ← STARTUP_GRACE_SECONDS
openhands/app_server/config.py                          ← 环境变量读取
frontend/src/hooks/use-send-message.ts                  ← 消息发送逻辑
frontend/src/utils/websocket-url.ts                     ← WebSocket URL 构建
frontend/src/services/pending-message-service.ts        ← 消息排队
install.sh                                              ← 需添加环境变量
```

---

## 6. 参考链接

- Issue #52：https://github.com/SWJTU-AI-Lab/securecodeact/issues/52
- 架构分析报告：`docs/arch-analysis/5.31-arch-analysis.md`
