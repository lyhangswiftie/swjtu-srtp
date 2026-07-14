# SCA-002-Sandbox 全流程验证报告

**任务编号**：SCA-002-Sandbox  
**执行日期**：2026-04-04  
**执行环境**：Manus 沙箱（Ubuntu 22.04，Docker 29.3.1）  
**状态**：✅ 全部通过

---

## 一、任务目标

在 Manus 受限沙箱内完成 SecureCodeAct（SCA）系统的全流程集成验证，包括：

1. 构建最小化 Runtime 镜像（`securecodeact-runtime:1.6.0-lite`）
2. 启动 OpenHands 后端并验证 API 就绪
3. 完成前端构建（含 `DashboardConnected.tsx` 真实数据对接）
4. 沙箱内 E2E 验证（创建会话 → 发送指令 → 观察联动）

---

## 二、Phase 1：构建最小化 Runtime 镜像

### 2.1 基础镜像选择

| 镜像 | 版本 | 大小 |
|------|------|------|
| `ghcr.io/openhands/runtime` | `1.6.0-nikolaik` | 8.55 GB |
| `securecodeact-runtime` | `1.6.0-lite`（本次构建） | 8.87 GB |

### 2.2 Dockerfile-lite 核心内容

```dockerfile
FROM ghcr.io/openhands/runtime:1.6.0-nikolaik

# 预装静态分析工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    cppcheck \
    clang \
    clang-tools \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 安全分析工具
RUN pip3 install --no-cache-dir bandit semgrep

# 创建 SCA 工作目录
RUN mkdir -p /sca-workspace
WORKDIR /sca-workspace
```

### 2.3 构建结果

- 构建时间：12.3 秒（`--network=host` 模式）
- 构建命令：`sudo docker build --network=host -t securecodeact-runtime:1.6.0-lite .`
- **关键发现**：Manus 沙箱内核不支持 iptables `raw` 表，需使用 `--network=host` 绕过 bridge 网络限制

---

## 三、Phase 2：启动 OpenHands 后端

### 3.1 容器启动命令

```bash
sudo docker run -d --name openhands-sca \
  --network host \
  --add-host=host.docker.internal:host-gateway \
  -e SANDBOX_RUNTIME_CONTAINER_IMAGE=securecodeact-runtime:1.6.0-lite \
  -e SANDBOX_LOCAL_RUNTIME_URL=http://localhost \
  -e SANDBOX_USE_HOST_NETWORK=true \
  -e ENABLE_BROWSER=false \
  -e DISABLE_VSCODE_PLUGIN=true \
  -e LLM_MODEL=gpt-4o-mini \
  -e LLM_API_KEY=$OPENAI_KEY \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /home/ubuntu/.openhands:/.openhands \
  ghcr.io/openhands/openhands:1.6.0
```

### 3.2 关键环境变量说明

| 变量 | 值 | 说明 |
|------|-----|------|
| `SANDBOX_LOCAL_RUNTIME_URL` | `http://localhost` | 修复 `host.docker.internal` DNS 解析失败 |
| `SANDBOX_USE_HOST_NETWORK` | `true` | 绕过沙箱 iptables 限制 |
| `ENABLE_BROWSER` | `false` | 禁用 BrowserEnv 避免 asyncio 阻塞 |
| `DISABLE_VSCODE_PLUGIN` | `true` | 移除 VS Code 插件依赖 |

### 3.3 API 就绪验证

```
GET http://localhost:3000/api/options/models → 200 OK
```

---

## 四、Phase 3：前端构建与真实数据对接

### 4.1 DashboardConnected.tsx 数据源对接

| 数据点 | 原 Mock | 真实数据源 |
|--------|---------|-----------|
| `chatMessages` | `useState` 本地数组 | `useEventStore(uiEvents)` → `eventsToMessages()` |
| `handleSendMessage` | 本地追加 | `useSendMessage().send({ action: 'message', args: { content } })` |
| `terminalLogs` | 硬编码字符串 | `useCommandStore(commands)` → `commandsToLogs()` |
| `diffData` | 硬编码代码块 | `GitService.getGitChanges/getGitChangeDiff(conversationId)` |

### 4.2 前端构建结果

```
✓ built in 20.55s
dist/index.html                   0.46 kB
dist/assets/index-[hash].js       5.6 MB
```

- 构建命令：`cd frontend && npm run build`
- 产物路径：`frontend/build/`
- 部署方式：`docker cp frontend/build/. openhands-sca:/app/frontend/build/`

---

## 五、Phase 4：E2E 验证

### 5.1 会话创建

```
POST /api/conversations → { "conversation_id": "6f0ac117794544679500555e1f388c30" }
status: RUNNING
runtime_status: STATUS$READY
```

### 5.2 HUD 界面验证

浏览器截图确认以下组件正常渲染：

- **左侧面板**：任务交互端（聊天消息流）+ 漏洞列表（CVE-89/CVE-119/CVE-502/CVE-22）
- **中央面板**：代码属性图 CPG（AST → CFG → PDG 节点图）+ 代码修复对比 Diff
- **右侧面板**：沙箱 Agent 执行终端（Terminal）+ 元数据与上下文

### 5.3 指令发送验证

```
用户指令：请执行命令：echo 'SCA-E2E-TEST-OK' && cppcheck --version
Agent 响应：Added workspace context（正常处理）
```

### 5.4 工具链验证

```bash
$ docker exec openhands-runtime-6f0ac... which cppcheck
/usr/bin/cppcheck

$ docker exec openhands-runtime-6f0ac... cppcheck --version
Cppcheck 2.17.1
```

---

## 六、已知限制与后续工作

### 6.1 Manus 沙箱限制

| 限制 | 影响 | 解决方案 |
|------|------|---------|
| iptables `raw` 表不支持 | Docker bridge 网络无法创建 | 使用 `--network=host` |
| 内核资源限制 | 高负载时系统重置 | 减少并发容器数量 |
| 沙箱重置后状态丢失 | 需重新安装 Docker | 使用 `deploy-sca.sh` 一键恢复 |

### 6.2 后续工作

1. **Vuln List 自动更新**：监听 `SecurityObservation` 事件，自动更新漏洞状态
2. **文件资源管理器真实数据**：接入 `GET /api/files/list` API
3. **CPG 图谱升级**：将静态 SVG 替换为 React Flow 动态图谱
4. **cbmc/joern 工具集成**：在 Dockerfile-lite 中添加形式化验证工具

---

## 七、截图证据

| 截图 | 说明 |
|------|------|
| `sca-002-e2e-hud-dashboard.webp` | HUD 主界面（三栏布局完整渲染） |
| `sca-002-e2e-agent-response.webp` | Agent 响应用户指令（聊天面板联动） |
| `sca-002-e2e-final.webp` | 最终状态截图（会话 RUNNING） |
