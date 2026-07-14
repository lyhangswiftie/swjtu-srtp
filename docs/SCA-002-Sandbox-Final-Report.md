# SCA-002-Sandbox 最终验收测试报告

## 1. 绪论

### 1.1 研究背景与内容
本项目旨在为 OpenHands 引入专业的代码安全分析 (Security Code Analysis, SCA) 能力。SCA-002-Sandbox 阶段的核心目标是替换原有的 OpenHands 前端，集成自定义的三面板 HUD（Heads-Up Display），包括实时漏洞追踪 (Vuln List)、终端监控和代码差异视图。

### 1.2 验收目标 (P0 级)
*   **P0-1**: Vuln List 自动更新逻辑实现（关键词监控："RCE", "已验证", "已修复", "CWE-XXX"）。
*   **P0-2**: 验证运行时容器网络配置（`NetworkMode: "host"`）。
*   **P0-3**: E2E 交互演示（发送安全扫描指令，触发 Chat + Terminal + Vuln List 三方联动更新）。

---

## 2. 技术方案与验证正文

### 2.1 P0-1: Vuln List 自动更新机制
在前端 `DashboardConnected.tsx` (v2.0) 中，通过 `useEffect` 监听 `uiEvents` 和 `commands` 的变化，提取文本内容并匹配预定义的正则表达式和关键词，从而自动更新漏洞状态。

**核心代码片段 (`DashboardConnected.tsx`)：**
```typescript
  // 6. Vuln List 自动更新（v2.0 新增）：监听 uiEvents + commands 变化
  useEffect(() => {
    const totalItems = uiEvents.length + commands.length;
    // 仅在有新数据时处理
    if (totalItems === 0 || totalItems === lastProcessedRef.current) return;
    lastProcessedRef.current = totalItems;
    const allText = extractAllText(uiEvents, commands);
    setVulnList((current) => applyVulnKeywordRules(allText, current));
  }, [uiEvents, commands]);
```

### 2.2 P0-2: 运行时容器网络配置验证
为了解决 Manus 沙箱环境中 `iptables` raw table 的限制，我们采用了 `--network=host` 模式。

**验证结果 (`docker inspect`)：**
```json
{
  "HostConfig.NetworkMode": "host",
  "NetworkSettings.Networks": {"host": {"Gateway": "", "IPAddress": ""}},
  "NetworkSettings.SandboxKey": "/var/run/docker/netns/default"
}
```
**结论：** 运行时容器成功使用了 `host` 网络模式，能够与运行在同一宿主机网络命名空间中的 OpenHands 后端 (端口 3000) 进行无缝通信。

### 2.3 P0-3: E2E 交互与联动演示
在测试过程中，我们向 Agent 发送了针对 `io.c` 的缓冲区溢出漏洞扫描指令。

1.  **指令发送：** 通过 Chat 面板发送指令：“验证 CWE-119：请执行 cppcheck --enable=all /workspace/src/core/utils/io.c 扫描缓冲区溢出漏洞，完成后输出包含 CWE-119 已修复 的总结”。
2.  **Terminal 响应：** Agent 在沙箱终端中执行了 `cppcheck` 扫描，输出结果被实时捕获并展示在 Terminal 面板中。
3.  **Vuln List 更新：** 监控逻辑捕获到包含 "CWE-119" 和 "已修复" 的关键词，成功将 Vuln List 中 CWE-119 的状态从“未修复”或“已验证”自动更新为“已修复”。

**联动效果截图：**
*   ![Chat Response](./screenshots/sca-002-e2e-chat-response.webp)
*   ![Vuln List Updated](./screenshots/sca-002-vuln-list-updated.webp)

---

## 3. 项目研究结论及展望

### 3.1 研究结论
SCA-002-Sandbox 阶段的 P0 级验收项已全部通过。自定义 HUD 成功集成，实现了预期的三方联动和自动化状态追踪。容器网络配置符合沙箱环境要求，E2E 流程跑通。

### 3.2 下一步研究展望
*   进一步优化 CPG (代码属性图) 的渲染和交互。
*   完善文件资源管理器与实际容器文件系统的深度集成。
*   增加更多种类的安全扫描工具支持。

### SCA-003 补充更新（2026-04-04）
作为 SCA-002 的后续 P1 建议项，**SCA-003 文件树动态化集成** 已在沙箱内完成。
- **文件资源管理器接入真实 API**：已通过 `ConversationService.getFiles(conversationId)` 实现了左侧边栏真实工作区文件树的懒加载展开。
- **点击联动 Diff 视图**：实现了文件树节点与右侧 Diff 视图的完整联动，支持显示 Git 变更高亮（`A`/`M`）。
- **自动刷新与状态保持**：修复了 React 闭包陈旧值问题，在 Git 变更触发自动刷新时，能够保留已懒加载子目录的展开状态。
