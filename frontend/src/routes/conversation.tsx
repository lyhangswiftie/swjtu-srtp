import React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { useConversationId } from "#/hooks/use-conversation-id";
import { useCommandStore } from "#/stores/command-store";
import { useConversationStore } from "#/stores/conversation-store";
import { useAgentStore } from "#/stores/agent-store";
import { AgentState } from "#/types/agent-state";

import { useBatchFeedback } from "#/hooks/query/use-batch-feedback";
import { EventHandler } from "../wrapper/event-handler";
import { useConversationConfig } from "#/hooks/query/use-conversation-config";

import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useTaskPolling } from "#/hooks/query/use-task-polling";

import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useIsAuthed } from "#/hooks/query/use-is-authed";
import { ConversationSubscriptionsProvider } from "#/context/conversation-subscriptions-provider";

import { ConversationMain } from "#/components/features/conversation/conversation-main/conversation-main";
import { ConversationNameWithStatus } from "#/components/features/conversation/conversation-name-with-status";

import { ConversationTabs } from "#/components/features/conversation/conversation-tabs/conversation-tabs";
import { WebSocketProviderWrapper } from "#/contexts/websocket-provider-wrapper";
import { useErrorMessageStore } from "#/stores/error-message-store";
import { I18nKey } from "#/i18n/declaration";
import { useEventStore } from "#/stores/use-event-store";
// ✅ SeCodeAct HUD — 集成版（真实 Zustand/WebSocket 数据源）
import DashboardConnected from "#/components/sca-hud/DashboardConnected";

function AppContent() {
  useConversationConfig();
  const { t } = useTranslation();
  const { conversationId } = useConversationId();
  const clearEvents = useEventStore((state) => state.clearEvents);
  const [searchParams] = useSearchParams();
  // 通过 ?view=original 切换回原生界面（调试用）
  const useOriginalView = searchParams.get("view") === "original";

  // Handle both task IDs (task-{uuid}) and regular conversation IDs
  const { isTask, taskStatus, taskDetail } = useTaskPolling();

  const { data: conversation, isFetched } = useActiveConversation();
  const { data: isAuthed } = useIsAuthed();
  const { resetConversationState } = useConversationStore();
  const navigate = useNavigate();
  const clearTerminal = useCommandStore((state) => state.clearTerminal);
  const setCurrentAgentState = useAgentStore(
    (state) => state.setCurrentAgentState,
  );
  const removeErrorMessage = useErrorMessageStore(
    (state) => state.removeErrorMessage,
  );

  // Fetch batch feedback data when conversation is loaded
  useBatchFeedback();

  // 1. Cleanup Effect - runs when navigating to a different conversation
  React.useEffect(() => {
    clearTerminal();
    resetConversationState();
    setCurrentAgentState(AgentState.LOADING);
    removeErrorMessage();
    clearEvents();
  }, [
    conversationId,
    clearTerminal,
    resetConversationState,
    setCurrentAgentState,
    removeErrorMessage,
    clearEvents,
  ]);

  // 2. Task Error Display Effect
  React.useEffect(() => {
    if (isTask && taskStatus === "ERROR") {
      displayErrorToast(
        taskDetail || t(I18nKey.CONVERSATION$FAILED_TO_START_FROM_TASK),
      );
    }
  }, [isTask, taskStatus, taskDetail, t]);

  // 3. Handle conversation not found
  // NOTE: Resuming STOPPED conversations is handled by useSandboxRecovery in WebSocketProviderWrapper
  React.useEffect(() => {
    // Wait for data to be fetched
    if (!isFetched || !isAuthed) return;

    // Handle conversation not found
    if (!conversation) {
      displayErrorToast(t(I18nKey.CONVERSATION$NOT_EXIST_OR_NO_PERMISSION));
      navigate("/");
    }
  }, [conversation, isFetched, isAuthed, navigate, t]);

  const isV0Conversation = conversation?.conversation_version === "V0";

  // ✅ SeCodeAct HUD 内容（默认视图）
  const scaContent = (
    <ConversationSubscriptionsProvider>
      <EventHandler>
        <div
          data-testid="sca-hud-route"
          className="flex flex-col h-full overflow-hidden"
          style={{ background: "#0D1117" }}
        >
          <DashboardConnected />
        </div>
      </EventHandler>
    </ConversationSubscriptionsProvider>
  );

  // 原生 OpenHands 界面（通过 ?view=original 切换）
  const originalContent = (
    <ConversationSubscriptionsProvider>
      <EventHandler>
        <div
          data-testid="app-route"
          className="p-3 md:p-0 flex flex-col h-full gap-3"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4.5 pt-2 lg:pt-0">
            <ConversationNameWithStatus />
            <ConversationTabs />
          </div>
          <ConversationMain />
        </div>
      </EventHandler>
    </ConversationSubscriptionsProvider>
  );

  return (
    <WebSocketProviderWrapper
      version={isV0Conversation ? 0 : 1}
      conversationId={conversationId}
    >
      {useOriginalView ? originalContent : scaContent}
    </WebSocketProviderWrapper>
  );
}

function App() {
  return <AppContent />;
}

export default App;
