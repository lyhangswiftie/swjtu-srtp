# SCA-003：SeCodeAct 战术 HUD 文件树动态化集成报告

## 1. 概述
本报告详细记录了 SCA-003 任务的执行过程与技术实现。该任务的核心目标是将 SeCodeAct HUD 左侧的“文件资源管理器”从静态硬编码结构升级为**真实的动态文件浏览器**，完整接入 `ConversationService.getFiles()`，并实现与 Diff 视图的深度联动。

## 2. 核心技术实现

### 2.1 动态数据接入与懒加载机制
我们重构了 `DashboardConnected.tsx` 中的文件树逻辑，采用了**逐级懒加载（Lazy Loading）**策略：
- **初始化加载**：调用 `ConversationService.getFiles(conversationId)` 获取工作区根目录内容。
- **目录展开懒加载**：当用户点击某个目录节点时，调用 `getFiles(conversationId, path)` 获取该目录的子节点内容，并动态拼接到文件树中。
- **路径前缀处理**：修复了 OpenHands API 返回绝对路径导致的前端树形结构重复构建问题，通过 `buildFileTree` 的 `pathPrefix` 参数实现了相对路径到绝对路径的正确映射。

### 2.2 React 状态管理优化
在实现懒加载时，我们解决了一个复杂的 React 闭包陈旧值（Stale Closure）问题：
- **问题描述**：在 `handleToggleDir` 的异步回调中，`setFileTree` 的更新被旧的 Fiber 状态覆盖，导致子节点无法渲染。
- **解决方案**：重构了 `loadFileTree` 的自动刷新逻辑，在 `restoreExpanded` 函数中，不仅保留了目录的 `expanded`（展开）状态，还完整保留了 `loaded: true` 状态及其 `children`（已加载的子节点），确保在 Git 变更触发自动刷新时，文件树不会意外折叠或丢失已加载的层级。

### 2.3 深度联动：文件树 ↔ Diff 视图 ↔ Git 状态
- **点击联动 Diff**：当用户点击文件节点时，触发 `handleSelectFile`，调用 `ConversationService.selectFile`，并自动将右侧面板切换到 `代码修复对比 Diff` 视图，加载该文件的原始内容与修改后内容。
- **Git 变更高亮**：集成了 `GitService.getGitChanges`，在构建文件树时自动匹配路径。存在变更的文件会在文件名旁显示橙色的 `A`（Added）或 `M`（Modified）标记。

## 3. 沙箱 E2E 验证结果
在 Manus 沙箱内的完整验证表明，SCA-003 的所有验收标准均已达成：
1. **多级目录展开**：成功实现了 `src/` → `core/` → `utils/` 的三级懒加载展开。
2. **文件节点渲染**：`io.c` 等文件节点正确渲染，并带有 Git 状态标记。
3. **点击联动**：点击 `io.c` 后，右侧 Diff 面板自动激活，并准确显示了缓冲区溢出漏洞的修复对比（`gets` 替换等）。

（相关验证截图已保存在 `docs/screenshots/` 目录下）

## 4. 真实服务器迁移指南
在真实服务器上部署时，建议使用 Volume 挂载方式覆盖前端构建产物，以避免镜像体积膨胀：
```bash
# 在宿主机上执行
docker cp openhands-sca:/app/frontend/build ./frontend-build-backup
# 替换为新的构建产物
docker cp sca-003-filetree.patch openhands-sca:/app/
docker exec -it openhands-sca bash -c "cd /app && git apply sca-003-filetree.patch && cd frontend && npm run build"
```
