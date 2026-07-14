# SecureCodeAct 二次开发指南

## 目录

1. 绪论
2. 技术方案正文
3. 项目研究结论及展望

---

## 1 绪论

### 1.1 研究背景

代码安全分析（Software Composition Analysis，SCA）是保障软件供应链安全的重要技术手段。本指南旨在为基于 OpenHands 框架的 SecureCodeAct（SCA）项目提供二次开发（Secondary Development）指导。

### 1.2 研究内容

本文档涵盖了 SCA 项目前端（Frontend）、后端智能体（Agent Backend）以及核心分析模块的架构设计、开发流程及接口规范。

### 1.3 技术突破点

- **微前端架构**：采用 React + Vite 构建高性能 SCA-HUD。
- **状态管理同步**：基于 Zustand 实现前端与沙箱状态的毫秒级同步。

---

## 二、 技术方案正文

### 2.1 项目背景

SecureCodeAct 项目基于 OpenHands 1.6.0，主要扩展了面向漏洞分析的定制化能力。二次开发的核心在于保持 OpenHands 核心调度引擎稳定的前提下，扩展前端视图和后端安全工具链。

### 2.2 架构概览

系统架构分为三层：

(1) **前端视图层（SCA-HUD）**：基于 React 18 和 TailwindCSS。
(2) **中间通信层（API & WebSocket）**：OpenHands FastAPI 后端。
(3) **沙箱执行层（CodeActAgent）**：隔离的 Docker 容器环境。

### 2.3 前端二次开发

#### 2.3.1 目录结构

```
frontend/
├── src/
│   ├── components/      # UI 组件
│   │   ├── chat/        # 任务交互端
│   │   ├── vuln-list/   # 漏洞列表
│   │   ├── cpg-graph/   # 代码属性图可视化
│   │   └── mvp-panel/   # 操作面板
│   ├── store/           # Zustand 状态管理
│   └── routes/          # 路由配置
```

#### 2.3.2 状态管理扩展

如需新增状态，请修改 `src/store/index.ts`：

```typescript
import { create } from 'zustand';

interface ScaState {
  cveList: CveItem[];
  setCveList: (list: CveItem[]) => void;
  // 新增状态
  newFeatureData: any;
  setNewFeatureData: (data: any) => void;
}
```

### 2.4 后端与智能体扩展

#### 2.4.1 自定义安全工具集成

所有安全分析脚本（如 PoC 生成、Patch 验证）应放置在沙箱的 `/opt/scripts/` 目录下。

(1) 编写 Python 脚本（例如 `custom_scanner.py`）。
(2) 在 `frontend/src/components/mvp-panel/` 中新增触发按钮。
(3) 通过 WebSocket 发送指令给 Agent 执行。

---

## 三、 项目研究结论及展望

### 3.1 研究结论

本文档明确了 SecureCodeAct 项目的二次开发路径，规范了前后端扩展流程，为后续功能迭代奠定了基础。

### 3.2 创新成果

建立了一套标准化、可扩展的代码安全智能体开发框架。

### 3.3 下一步研究展望

未来将重点研究如何将更多静态分析工具（Static Application Security Testing, SAST）无缝集成到 CodeActAgent 的工具链中。
