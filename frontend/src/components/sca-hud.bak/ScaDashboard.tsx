/**
 * SeCodeAct HUD - 主 Dashboard 组件
 * 集成 OpenHands 真实 WebSocket 事件流 + REST API
 *
 * 架构说明：
 * - 聊天：通过 useSendMessage hook 发送，通过 useEventStore 接收 V1 MessageEvent
 * - 终端：通过 useCommandStore 读取 Agent 执行的命令和输出
 * - 文件树：通过 ConversationService.getFiles() REST API 获取
 * - Diff 视图：通过 GitService.getGitChangeDiff() REST API 获取
 * - Agent 状态：通过 useAgentState hook 读取
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen,
  Terminal,
  GitCompare,
  MessageSquare,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  AlertTriangle,
  Shield,
  Activity,
  Cpu,
  Zap,
  GitBranch,
  Lock,
  Loader2,
} from "lucide-react";
import { useCommandStore } from "#/stores/command-store";
import { useEventStore } from "#/stores/use-event-store";
import { useSendMessage } from "#/hooks/use-send-message";
import { useAgentState } from "#/hooks/use-agent-state";
import { useConversationId } from "#/hooks/use-conversation-id";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import GitService from "#/api/git-service/git-service.api";
import { createChatMessage } from "#/services/chat-service";
import { isMessageEvent, isV1Event } from "#/types/v1/type-guards";
import { AgentState } from "#/types/agent-state";
import {
  ScaChat,
  ScaTerminal,
  ScaDiffViewer,
  HudPanel,
  ScaChatMessage,
  ScaDiffLine,
} from "./ScaComponents";

// ============================================================
// 辅助函数：将 Git Diff 字符串解析为行数组
// ============================================================
function parseDiffToLines(
  diffText: string,
  isOriginal: boolean,
): ScaDiffLine[] {
  if (!diffText) return [];
  const lines = diffText.split("\n");
  const result: ScaDiffLine[] = [];
  let lineNum = 1;

  for (const line of lines) {
    if (isOriginal) {
      // 原始代码：跳过以 + 开头的行（新增行）
      if (line.startsWith("+") && !line.startsWith("+++")) continue;
      const isHighlight = line.startsWith("-") && !line.startsWith("---");
      result.push({
        line: lineNum++,
        text: isHighlight ? line.slice(1) : line.replace(/^[-+ ]/, ""),
        isHighlight,
      });
    } else {
      // 修改后代码：跳过以 - 开头的行（删除行）
      if (line.startsWith("-") && !line.startsWith("---")) continue;
      const isHighlight = line.startsWith("+") && !line.startsWith("+++");
      result.push({
        line: lineNum++,
        text: isHighlight ? line.slice(1) : line.replace(/^[-+ ]/, ""),
        isHighlight,
      });
    }
  }
  return result;
}

// ============================================================
// 文件树节点组件
// ============================================================
interface FileTreeNodeProps {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeNodeProps[];
  level: number;
  onSelectFile: (path: string) => void;
  selectedFile?: string;
}

function FileTreeNode({
  name,
  path,
  isDir,
  children,
  level,
  onSelectFile,
  selectedFile,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(level < 2);

  if (isDir) {
    return (
      <div>
        <div
          className="flex items-center gap-1 cursor-pointer hover:bg-[#00FF9F]/5 px-1 py-0.5 rounded-sm"
          style={{ paddingLeft: `${level * 12 + 4}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown size={10} className="text-slate-500" />
          ) : (
            <ChevronRight size={10} className="text-slate-500" />
          )}
          <Folder size={12} className="text-blue-400" />
          <span className="text-slate-300 text-[10px]">{name}</span>
        </div>
        {expanded && children && (
          <div>
            {children.map((child) => (
              <FileTreeNode
                key={child.path}
                {...child}
                level={level + 1}
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedFile === path;
  return (
    <div
      className={`flex items-center gap-1 cursor-pointer px-1 py-0.5 rounded-sm ${
        isSelected
          ? "bg-[#00FF9F]/20 border-l-2 border-[#00FF9F]"
          : "hover:bg-slate-800/50"
      }`}
      style={{ paddingLeft: `${level * 12 + 4}px` }}
      onClick={() => onSelectFile(path)}
    >
      <File size={10} className="text-slate-500" />
      <span
        className={`text-[10px] ${isSelected ? "text-[#00FF9F]" : "text-slate-400"}`}
      >
        {name}
      </span>
    </div>
  );
}

// ============================================================
// 将扁平文件路径列表转换为树形结构
// ============================================================
function buildFileTree(
  paths: string[],
  basePath: string = "/workspace",
): FileTreeNodeProps[] {
  const root: Record<string, FileTreeNodeProps> = {};

  for (const fullPath of paths) {
    // 去掉 basePath 前缀
    const relativePath = fullPath.startsWith(basePath)
      ? fullPath.slice(basePath.length).replace(/^\//, "")
      : fullPath.replace(/^\//, "");

    const parts = relativePath.split("/").filter(Boolean);
    let current = root;
    let currentPath = basePath;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = `${currentPath}/${part}`;
      const isLast = i === parts.length - 1;

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          isDir: !isLast,
          children: isLast ? undefined : [],
          level: i,
        };
      }

      if (!isLast) {
        current = current[part].children as unknown as Record<
          string,
          FileTreeNodeProps
        >;
        if (!current) {
          current = {};
        }
      }
    }
  }

  const toArray = (
    obj: Record<string, FileTreeNodeProps>,
  ): FileTreeNodeProps[] =>
    Object.values(obj).sort((a, b) => {
      // 目录排在文件前面
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

  return toArray(root);
}

// ============================================================
// 顶部状态栏组件
// ============================================================
interface ScaStatusBarProps {
  agentState: AgentState;
  conversationId: string;
  messageCount: number;
  commandCount: number;
}

function ScaStatusBar({
  agentState,
  conversationId,
  messageCount,
  commandCount,
}: ScaStatusBarProps) {
  const isRunning =
    agentState === AgentState.RUNNING || agentState === AgentState.LOADING;
  const isError = agentState === AgentState.ERROR;
  const isFinished = agentState === AgentState.FINISHED;

  return (
    <div className="flex items-center justify-between bg-[#0D1117] border-b border-[#00FF9F]/20 px-4 py-1.5 text-[10px] font-mono">
      {/* 左侧：品牌标识 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Shield size={14} className="text-[#00FF9F]" />
          <span className="text-[#00FF9F] font-bold tracking-widest drop-shadow-[0_0_4px_rgba(0,255,159,0.8)]">
            SeCodeAct
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">安全代码智能体</span>
        </div>
        <div className="text-slate-600">
          Session:{" "}
          <span className="text-slate-400">
            {conversationId.slice(0, 8)}...
          </span>
        </div>
      </div>

      {/* 中间：Agent 状态 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isRunning
                ? "bg-amber-400 animate-pulse"
                : isError
                  ? "bg-red-500"
                  : isFinished
                    ? "bg-[#00FF9F]"
                    : "bg-slate-500"
            }`}
          />
          <span
            className={
              isRunning
                ? "text-amber-400"
                : isError
                  ? "text-red-400"
                  : isFinished
                    ? "text-[#00FF9F]"
                    : "text-slate-500"
            }
          >
            {agentState === AgentState.RUNNING
              ? "RUNNING"
              : agentState === AgentState.LOADING
                ? "INITIALIZING"
                : agentState === AgentState.AWAITING_USER_INPUT
                  ? "AWAITING INPUT"
                  : agentState === AgentState.FINISHED
                    ? "FINISHED"
                    : agentState === AgentState.ERROR
                      ? "ERROR"
                      : agentState === AgentState.PAUSED
                        ? "PAUSED"
                        : agentState.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <MessageSquare size={10} />
          <span>{messageCount} msgs</span>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <Terminal size={10} />
          <span>{commandCount} cmds</span>
        </div>
      </div>

      {/* 右侧：系统信息 */}
      <div className="flex items-center gap-3 text-slate-600">
        <div className="flex items-center gap-1">
          <Cpu size={10} />
          <span>CodeActAgent</span>
        </div>
        <div className="flex items-center gap-1">
          <GitBranch size={10} />
          <span>main</span>
        </div>
        <div className="flex items-center gap-1">
          <Lock size={10} className="text-[#00FF9F]/50" />
          <span className="text-[#00FF9F]/50">SECURE</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主 Dashboard 组件
// ============================================================
export function ScaDashboard() {
  const { conversationId } = useConversationId();
  const { curAgentState } = useAgentState();
  const { send } = useSendMessage();

  // 从 Zustand stores 读取数据
  const commands = useCommandStore((state) => state.commands);
  const events = useEventStore((state) => state.events);
  const uiEvents = useEventStore((state) => state.uiEvents);

  // 本地 UI 状态
  const [fileTree, setFileTree] = useState<FileTreeNodeProps[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffOriginal, setDiffOriginal] = useState<ScaDiffLine[]>([]);
  const [diffModified, setDiffModified] = useState<ScaDiffLine[]>([]);
  const [diffFile, setDiffFile] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"diff" | "file">("diff");
  const [gitChanges, setGitChanges] = useState<
    Array<{ status: string; path: string }>
  >([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  const [repoError, setRepoError] = useState<string>("");
  const fileRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================
  // 从 V1 事件流中提取聊天消息
  // ============================================================
  const chatMessages: ScaChatMessage[] = React.useMemo(() => {
    const msgs: ScaChatMessage[] = [];

    // 处理 V1 事件
    for (const event of uiEvents) {
      if (!isV1Event(event)) continue;
      if (!isMessageEvent(event)) continue;

      const msg = event.llm_message;
      if (!msg?.content) continue;

      // 只显示 user 和 assistant 消息
      if (msg.role !== "user" && msg.role !== "assistant") continue;

      let text = "";
      if (Array.isArray(msg.content)) {
        text = msg.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { type: "text"; text: string }).text)
          .join("\n");
      } else if (typeof msg.content === "string") {
        text = msg.content;
      }

      if (!text.trim()) continue;

      msgs.push({
        id: event.id,
        role: msg.role === "user" ? "user" : "agent",
        text,
        timestamp: event.timestamp,
      });
    }

    // 如果没有 V1 事件，处理 V0 事件
    if (msgs.length === 0) {
      for (const event of events) {
        if (isV1Event(event)) continue; // 跳过 V1 事件，已处理
        const v0Event = event as Record<string, unknown>;
        if (!v0Event.action && !v0Event.observation) continue;

        if (v0Event.action === "message") {
          const args = v0Event.args as Record<string, unknown>;
          if (args?.content) {
            msgs.push({
              role:
                (v0Event.source as string) === "user" ? "user" : "agent",
              text: String(args.content),
            });
          }
        }
      }
    }

    return msgs;
  }, [events, uiEvents]);

  // ============================================================
  // 加载文件树
  // ============================================================
  const loadFileTree = useCallback(async () => {
    if (!conversationId) return;
    setIsLoadingFiles(true);
    try {
      const response = await ConversationService.getFiles(conversationId);
      if (response && Array.isArray(response)) {
        const tree = buildFileTree(response as unknown as string[]);
        setFileTree(tree);
      }
    } catch (err) {
      console.warn("[ScaDashboard] 文件树加载失败:", err);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [conversationId]);

  // ============================================================
  // 加载 Git 变更列表
  // ============================================================
  const loadGitChanges = useCallback(async () => {
    if (!conversationId) return;
    try {
      const changes = await GitService.getGitChanges(conversationId);
      setGitChanges(changes || []);
    } catch {
      // Git 变更可能在没有 git 仓库时失败，静默处理
    }
  }, [conversationId]);

  // ============================================================
  // 点击文件：加载 Diff 或文件内容
  // ============================================================
  const handleSelectFile = useCallback(
    async (filePath: string) => {
      setSelectedFile(filePath);

      // 检查是否有 Git 变更
      const hasChange = gitChanges.some((c) => filePath.endsWith(c.path));

      if (hasChange) {
        setActiveTab("diff");
        setIsLoadingDiff(true);
        setDiffFile(filePath);
        try {
          const diff = await GitService.getGitChangeDiff(
            conversationId,
            filePath,
          );
          setDiffOriginal(parseDiffToLines(diff.original, true));
          setDiffModified(parseDiffToLines(diff.modified, false));
        } catch (err) {
          console.warn("[ScaDashboard] Diff 加载失败:", err);
          setDiffOriginal([]);
          setDiffModified([]);
        } finally {
          setIsLoadingDiff(false);
        }
      } else {
        // 加载文件内容（通过 V1 API）
        setActiveTab("file");
        setIsLoadingDiff(true);
        setDiffFile(filePath);
        try {
          const content = await ConversationService.getFiles(
            conversationId,
            filePath,
          );
          // 将文件内容转为 diff 格式展示
          const lines = String(content).split("\n");
          const fileLines: ScaDiffLine[] = lines.map((text, idx) => ({
            line: idx + 1,
            text,
            isHighlight: false,
          }));
          setDiffOriginal(fileLines);
          setDiffModified(fileLines);
        } catch (err) {
          console.warn("[ScaDashboard] 文件内容加载失败:", err);
        } finally {
          setIsLoadingDiff(false);
        }
      }
    },
    [conversationId, gitChanges],
  );

  // ============================================================
  // 发送消息到 Agent
  // ============================================================
  const handleSendMessage = useCallback(
    async (text: string) => {
      const timestamp = new Date().toISOString();
      const message = createChatMessage(text, [], [], timestamp);
      await send(message);
    },
    [send],
  );

  // ============================================================
  // 加载 GitHub 仓库
  // ============================================================
  const handleLoadRepo = useCallback(async () => {
    if (!repoUrl.trim()) return;
    setIsLoadingRepo(true);
    setRepoError("");
    try {
      // 通过 Agent 指令克隆仓库
      const cloneCmd = `请克隆以下 GitHub 仓库到工作区并列出文件结构：${repoUrl}`;
      await handleSendMessage(cloneCmd);
      // 等待 Agent 处理后刷新文件树
      setTimeout(() => {
        loadFileTree();
        loadGitChanges();
      }, 5000);
    } catch (err) {
      setRepoError("仓库加载失败，请检查 URL 格式");
    } finally {
      setIsLoadingRepo(false);
    }
  }, [repoUrl, handleSendMessage, loadFileTree, loadGitChanges]);

  // ============================================================
  // 初始化和定时刷新
  // ============================================================
  useEffect(() => {
    loadFileTree();
    loadGitChanges();

    // 每 10 秒刷新一次文件树和 Git 变更
    fileRefreshTimer.current = setInterval(() => {
      loadFileTree();
      loadGitChanges();
    }, 10000);

    return () => {
      if (fileRefreshTimer.current) {
        clearInterval(fileRefreshTimer.current);
      }
    };
  }, [conversationId]);

  // Agent 完成时刷新文件树
  useEffect(() => {
    if (
      curAgentState === AgentState.FINISHED ||
      curAgentState === AgentState.AWAITING_USER_INPUT
    ) {
      loadFileTree();
      loadGitChanges();
    }
  }, [curAgentState]);

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="flex flex-col h-full bg-[#0D1117] text-white overflow-hidden font-mono">
      {/* 顶部状态栏 */}
      <ScaStatusBar
        agentState={curAgentState}
        conversationId={conversationId}
        messageCount={chatMessages.length}
        commandCount={commands.length}
      />

      {/* 主内容区：三列布局 */}
      <div className="flex flex-1 overflow-hidden gap-1 p-1">
        {/* ===== 左列：文件树 + 仓库对接 ===== */}
        <div className="flex flex-col gap-1 w-[220px] min-w-[180px]">
          {/* 文件资源管理器 */}
          <HudPanel
            title="文件资源管理器"
            titleIcon={FolderOpen}
            className="flex-1 overflow-hidden"
            headerRight={
              <button
                onClick={() => {
                  loadFileTree();
                  loadGitChanges();
                }}
                className="text-slate-500 hover:text-[#00FF9F] transition-colors"
                title="刷新文件树"
              >
                <RefreshCw size={11} />
              </button>
            }
          >
            <div className="flex-1 overflow-y-auto p-1">
              {isLoadingFiles && fileTree.length === 0 ? (
                <div className="flex items-center gap-2 text-slate-600 text-[10px] p-2">
                  <Loader2 size={10} className="animate-spin" />
                  <span>加载文件树...</span>
                </div>
              ) : fileTree.length === 0 ? (
                <div className="text-slate-600 text-[10px] p-2">
                  <div className="text-[#00FF9F]/30 mb-1">◈ 工作区</div>
                  <div>等待 Agent 初始化...</div>
                </div>
              ) : (
                fileTree.map((node) => (
                  <FileTreeNode
                    key={node.path}
                    {...node}
                    level={0}
                    onSelectFile={handleSelectFile}
                    selectedFile={selectedFile}
                  />
                ))
              )}
            </div>

            {/* Git 变更列表 */}
            {gitChanges.length > 0 && (
              <div className="border-t border-slate-800 p-1">
                <div className="text-[9px] text-slate-500 px-1 mb-1 flex items-center gap-1">
                  <Activity size={9} />
                  <span>Git 变更 ({gitChanges.length})</span>
                </div>
                {gitChanges.slice(0, 5).map((change, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 px-1 py-0.5 cursor-pointer hover:bg-slate-800/50 rounded-sm"
                    onClick={() =>
                      handleSelectFile(`/workspace/${change.path}`)
                    }
                  >
                    <span
                      className={`text-[9px] font-bold ${
                        change.status === "M" || change.status === "UPDATED"
                          ? "text-amber-400"
                          : change.status === "A" ||
                              change.status === "ADDED"
                            ? "text-[#00FF9F]"
                            : change.status === "D" ||
                                change.status === "DELETED"
                              ? "text-red-400"
                              : "text-blue-400"
                      }`}
                    >
                      {change.status.charAt(0)}
                    </span>
                    <span className="text-[9px] text-slate-400 truncate">
                      {change.path.split("/").pop()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </HudPanel>

          {/* 代码仓库对接 */}
          <HudPanel
            title="代码仓库对接"
            titleIcon={GitBranch}
            className="shrink-0"
          >
            <div className="p-2 space-y-1.5">
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLoadRepo()}
                placeholder="https://github.com/owner/repo"
                className="w-full bg-[#0b1120] border border-slate-700 rounded-sm px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-[#00FF9F]/50"
              />
              {repoError && (
                <div className="flex items-center gap-1 text-red-400 text-[9px]">
                  <AlertTriangle size={9} />
                  <span>{repoError}</span>
                </div>
              )}
              <button
                onClick={handleLoadRepo}
                disabled={isLoadingRepo || !repoUrl.trim()}
                className="w-full flex items-center justify-center gap-1 bg-blue-500/20 text-blue-400 py-1 rounded-sm border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-40 text-[10px]"
              >
                {isLoadingRepo ? (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    <span>克隆中...</span>
                  </>
                ) : (
                  <>
                    <Zap size={10} />
                    <span>挂载仓库</span>
                  </>
                )}
              </button>
            </div>
          </HudPanel>
        </div>

        {/* ===== 中列：Diff 视图 ===== */}
        <HudPanel
          title={
            activeTab === "diff"
              ? `代码修复对比 ${diffFile ? `- ${diffFile.split("/").pop()}` : ""}`
              : `文件查看器 ${diffFile ? `- ${diffFile.split("/").pop()}` : ""}`
          }
          titleIcon={GitCompare}
          className="flex-1 overflow-hidden"
          headerRight={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("diff")}
                className={`text-[9px] px-1.5 py-0.5 rounded-sm border transition-colors ${
                  activeTab === "diff"
                    ? "bg-[#00FF9F]/20 text-[#00FF9F] border-[#00FF9F]/30"
                    : "text-slate-500 border-slate-700 hover:text-slate-300"
                }`}
              >
                Diff
              </button>
              <button
                onClick={() => setActiveTab("file")}
                className={`text-[9px] px-1.5 py-0.5 rounded-sm border transition-colors ${
                  activeTab === "file"
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    : "text-slate-500 border-slate-700 hover:text-slate-300"
                }`}
              >
                文件
              </button>
            </div>
          }
        >
          <ScaDiffViewer
            file={diffFile}
            originalCode={diffOriginal}
            modifiedCode={diffModified}
            isLoading={isLoadingDiff}
            onApplyPatch={
              diffFile
                ? () => handleSendMessage(`请应用对 ${diffFile} 的修改`)
                : undefined
            }
            onRunTest={
              diffFile
                ? () =>
                    handleSendMessage(
                      `请对 ${diffFile} 运行相关测试并报告结果`,
                    )
                : undefined
            }
          />
        </HudPanel>

        {/* ===== 右列：聊天 + 终端 ===== */}
        <div className="flex flex-col gap-1 w-[300px] min-w-[250px]">
          {/* 任务交互终端（聊天）*/}
          <HudPanel
            title="任务交互终端"
            titleIcon={MessageSquare}
            className="flex-1 overflow-hidden"
          >
            <ScaChat
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              isLoading={
                curAgentState === AgentState.RUNNING ||
                curAgentState === AgentState.LOADING
              }
              agentStatus={curAgentState}
            />
          </HudPanel>

          {/* 沙箱 Agent 执行终端 */}
          <HudPanel
            title="沙箱执行终端"
            titleIcon={Terminal}
            className="h-[280px] shrink-0 overflow-hidden"
          >
            <ScaTerminal commands={commands} />
          </HudPanel>
        </div>
      </div>
    </div>
  );
}
