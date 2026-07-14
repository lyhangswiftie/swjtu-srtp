# SecureCodeAct (SCA) 二次开发报告 (Developer Guide)

## 1 绪论

### 1.1 研究背景与项目目标
随着软件供应链的复杂化，已知漏洞（CVE）的修复成本急剧上升。SecureCodeAct（SCA）项目旨在基于大语言模型（LLM）与静态分析技术（Static Analysis），构建一个自动化的代码安全智能体平台。本平台不仅能够检测漏洞，还能在沙箱中动态验证（Dynamic Validation）漏洞的可利用性，并自动生成修复补丁（Patch Generation）。

### 1.2 架构概览
SCA 系统采用前后端分离架构，核心组件包括：
- **SCA-HUD（前端）**：基于 React 和 Vite 构建的实时仪表盘，采用三列布局，实时展示智能体的分析过程、图谱和沙箱终端。
- **OpenHands Backend（后端）**：基于 Python FastAPI 的智能体调度引擎，负责与 LLM 交互、解析自然语言指令，并生成对应的 Bash/Python 执行脚本。
- **Docker Sandbox（沙箱）**：提供安全的隔离环境，智能体在其中执行漏洞扫描（如 Joern）、PoC 利用代码及补丁应用。

---

## 2 技术方案正文

### 2.1 核心模块解析

#### 2.1.1 前端：RepositoryImportState 状态机
在 v4.0 版本中，我们引入了标准化的仓库导入状态机，以解决大仓库导入时的异步状态同步问题。

**核心代码解析 (`frontend/src/components/sca-hud/RepositoryImportPanel.tsx`)：**
```typescript
// 定义仓库导入的生命周期状态
export type RepositoryImportState = 
  | 'IDLE'        // 初始状态
  | 'VALIDATING'  // 验证仓库 URL
  | 'CLONING'     // 正在克隆到沙箱
  | 'INDEXING'    // 生成代码属性图索引
  | 'READY'       // 导入完成，可进行分析
  | 'FAILED';     // 导入失败

// 状态流转处理逻辑
const handleImport = async () => {
  setImportState('VALIDATING');
  try {
    const isValid = await validateRepoUrl(url);
    if (!isValid) throw new Error('Invalid URL');
    
    setImportState('CLONING');
    await sendAgentCommand(`git clone ${url} /workspace`);
    
    setImportState('INDEXING');
    await sendAgentCommand(`joern-parse /workspace`);
    
    setImportState('READY');
  } catch (error) {
    setImportState('FAILED');
    setErrorMessage(error.message);
  }
};
```
该模块通过严格的状态控制，确保了用户界面的反馈与沙箱内长时间运行的命令保持一致。

#### 2.1.2 后端：GitService API 与降级保护
为提升系统的健壮性，我们对与 GitHub API 交互的 `GitService` 进行了重构，增加了细粒度的错误分类。

**核心代码解析 (`frontend/src/api/git-service/git-service-errors.ts`)：**
```typescript
export enum GitServiceErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',             // 401 Unauthorized
  PERMISSION_DENIED = 'PERMISSION_DENIED', // 403 Rate Limit or Forbidden
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',     // 404 Not Found
  NETWORK_ERROR = 'NETWORK_ERROR'          // 网络连接失败
}

export class GitServiceError extends Error {
  constructor(
    public code: GitServiceErrorCode,
    public message: string,
    public endpoint?: string
  ) {
    super(message);
    this.name = 'GitServiceError';
  }
}
```
结合 `VITE_ENABLE_DEMO_FALLBACK` 环境变量，当 API 调用失败（如未配置 Token）时，系统可优雅降级，渲染 Mock 数据，保证演示环境的可用性。

#### 2.1.3 脚本：沙箱生命周期管理
`install.sh` 和 `docker_sandbox_service.py` 负责智能体运行环境的初始化与监控。

**核心代码解析 (`install.sh` v4.0 安全模式片段)：**
```bash
# SCA_FORCE_RECREATE 模式：强制清理旧容器
if [ "${SCA_FORCE_RECREATE:-0}" = "1" ]; then
    echo "SCA_FORCE_RECREATE=1, removing existing container openhands-sca..."
    docker rm -f openhands-sca 2>/dev/null || true
fi

# SCA_UI_ONLY 模式：跳过容器启动，仅注入前端
if [ "${SCA_UI_ONLY:-0}" = "1" ]; then
    echo "SCA_UI_ONLY=1, skipping container startup..."
    # 仅执行前端构建产物的 docker cp
    docker cp frontend/build/. openhands-sca:/app/frontend/build/
    exit 0
fi
```
通过引入 `STARTUP_GRACE_SECONDS` 机制，解决了复杂镜像在资源受限环境下的启动超时误判问题。

### 2.2 扩展接口说明

#### 2.2.1 增加新的静态分析工具
当前系统默认使用 Joern 提取 CPG。若需集成其他工具（如 CodeQL）：
(1) 在 `docker/Dockerfile` 中添加工具的安装脚本。
(2) 在 `frontend/src/components/sca-hud/DashboardConnected.tsx` 中，扩展 `MVP 操作面板` 的命令模板，将新工具的执行指令发送给 Agent。
(3) 解析新工具的输出格式（如 SARIF），并转换为前端图谱组件可识别的 JSON 结构。

#### 2.2.2 扩展诊断工具
`scripts/sca_doctor.sh` 提供了环境检查框架。开发者可通过添加新的检查项来增强诊断能力：
```bash
# 示例：增加对特定端口的检查
check_port() {
    local port=$1
    if netstat -tuln | grep -q ":$port "; then
        echo -e "${GREEN}[PASS] Port $port is in use${NC}"
    else
        echo -e "${RED}[FAIL] Port $port is not listening${NC}"
    fi
}
```

---

## 3 项目研究结论及展望

### 3.1 研究结论
SecureCodeAct 项目成功验证了"大语言模型 + 隔离沙箱 + 静态图谱分析"在代码安全领域的有效性。通过引入端到端的自动化闭环，显著降低了人工复现漏洞的成本。特别是 v4.0 引入的生命周期管理和状态机机制，极大提升了系统的稳定性（Stability）和可用性（Usability）。

### 3.2 下一步研究展望
未来，项目可从以下方向进一步深化：
(1) **确定性仓库导入 API (Deterministic Repository Import API)**：将当前由 Agent 执行的自然语言 `git clone` 替换为后端的确定性流水线，提供更可靠的数据源。
(2) **多智能体协同 (Multi-Agent Collaboration)**：引入"攻击者 Agent"和"防御者 Agent"进行对抗博弈，提高漏洞验证的深度和补丁的鲁棒性。
(3) **大模型微调 (LLM Fine-tuning)**：基于历史漏洞修复数据微调本地模型，减少对外部商业 API 的依赖，满足更高保密级别环境的需求。
