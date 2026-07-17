import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, PanelLeft, SquarePen } from 'lucide-react';
import { StickToBottom } from 'use-stick-to-bottom';
import { AgentDisplacedBanner } from '@/shared/components/AgentDisplacedBanner';
import { ResourceError } from '@/shared/components/ResourceError';
import { Sheet, SheetContent } from '@/shared/ui/sheet';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useHeightVar } from '@/shared/hooks';
import { useUserModels } from '@/shared/api/models';
import { ModelSelector } from '@/shared/components/chat/ModelSelector';
import { getNewConversationModel, setNewConversationModel } from '../../api/session';
import { ChatComposer, type ChatComposerHandle } from '../../components/chat/ChatComposer';
import { useUserSkillsByGuide } from '@/shared/api/skills';
import { MessageTurn } from '../../components/chat/MessageTurn';
import { type ClawArtifact } from '../../api/artifacts';
import { ClawArtifactPreview } from '../../components/preview/ClawArtifactPreview';
import { ScrollController } from '../../components/chat/ScrollController';
import { ClawEmptyState } from '../../components/chat/ClawEmptyState';
import { MobileClawDrawer } from '../../components/chat/MobileClawDrawer';
import { useClawConversation } from '../../hooks/useClawConversation';

/**
 * 智能助手移动版(/m/claw) —— 与桌面 ClawPage 共用 useClawConversation 状态机和全部聊天组件。
 *
 * 交互对齐主流聊天助手(ChatGPT / DeepSeek / Claude):**不设独立顶栏**,改成对话区上方两枚
 * 悬浮按钮 —— 左「历史对话」(开左侧抽屉:新对话 + 按日期分组的历史 + 重命名/删除)、右「新对话」;
 * 连接状态做成中间的自隐小徽章。成果预览仍走底部整屏 Sheet。
 */
export function MobileClawPage() {
  const openAuth = useAuthDialog((s) => s.openDialog);
  const conv = useClawConversation();
  const {
    token,
    activeSessionId,
    sessionId,
    historyHasMore,
    contextQuery,
    sessionArtifacts,
    socket,
    turns,
    visibleTurns,
    hiddenCount,
    pendingCount,
    busy,
    stopping,
    loading,
    historyError,
    historyErrorObj,
    retryHistory,
    composerDisabled,
  } = conv;

  const [drawerOpen, setDrawerOpen] = useState(false);
  // 会话流里认领「本轮用了你的技能 X」用(guideName → 我启用的市场技能);引用稳定不破 MessageTurn memo。
  const userSkillsByGuide = useUserSkillsByGuide();
  // P2 模型目录:移动端选择器(与桌面 ClawPage 同一套服务端权威语义,trigger 在移动端只显图标)。
  const navigate = useNavigate();
  const { data: userModels } = useUserModels('claw');
  const [newConvPref, setNewConvPref] = useState<string | null>(() => getNewConversationModel() ?? null);
  const selectorCurrent =
    conv.socket.sessionModel ?? (!conv.sessionId && newConvPref ? { modelId: newConvPref, isDefault: false } : null);
  const modelSlot =
    userModels && userModels.length > 0 ? (
      <ModelSelector
        models={userModels}
        current={selectorCurrent}
        onUpgrade={() => navigate('/pricing')}
        onSelect={(id) => {
          if (conv.sessionId) {
            conv.socket.send({ type: 'set_runtime_config', providerId: null, modelId: id ?? '', useDefault: id === null });
          } else {
            setNewConversationModel(id);
            setNewConvPref(id);
          }
        }}
      />
    ) : null;
  const [previewArtifact, setPreviewArtifact] = useState<ClawArtifact | null>(null);
  // 空白态点示例卡片 → 调 composer.prefill 把提示词填进底部输入框(可改后再发)。
  const composerRef = useRef<ChatComposerHandle>(null);

  const chatAreaRef = useHeightVar<HTMLDivElement>('chat-area-h');
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const prevPendingLenRef = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount > prevPendingLenRef.current) {
      scrollToBottomRef.current?.();
    }
    prevPendingLenRef.current = pendingCount;
  }, [pendingCount]);

  return (
    <div className="flex h-full flex-col bg-background">
      {socket.state === 'displaced' && (
        <AgentDisplacedBanner
          reason={socket.displacedReason}
          onTakeOver={socket.takeOver}
          className="px-3"
        />
      )}

      <div ref={chatAreaRef} className="relative min-h-0 flex-1">
        {/* 悬浮控制条(无独立顶栏):左=历史抽屉,中=连接状态(自隐),右=新对话。
            顶部渐隐让图标在滚动内容上也清晰;容器 pointer-events-none、仅按钮可点,不挡滚动。 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-background via-background/85 to-transparent px-2 pb-5 pt-2">
          <button
            type="button"
            aria-label="历史对话"
            onClick={() => setDrawerOpen(true)}
            className="pointer-events-auto flex size-9 items-center justify-center rounded-full text-foreground active:bg-surface-2"
          >
            <PanelLeft className="size-5" />
          </button>
          {/* 连接状态徽章已移除:连接/重连过程对用户无意义,不展示。 */}
          <button
            type="button"
            aria-label="新对话"
            onClick={conv.handleNewConversation}
            disabled={busy || sessionId === null}
            className="pointer-events-auto flex size-9 items-center justify-center rounded-full text-foreground active:bg-surface-2 disabled:opacity-40"
          >
            <SquarePen className="size-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-faint" />
          </div>
        ) : historyError ? (
          // 历史读失败(后端读 agent 历史 10s 超时 / 5xx → 502)给「加载失败 + 重试」
          // 而非把瞬时失败伪装成空白态(与桌面 ClawPage 同构)。
          <div className="flex h-full items-center justify-center p-6 pt-14">
            <ResourceError
              error={historyErrorObj}
              resourceName="对话"
              onRetry={retryHistory}
              onBack={conv.handleNewConversation}
              backLabel="开始新对话"
              autoRedirect={false}
            />
          </div>
        ) : turns.length === 0 ? (
          <ClawEmptyState onPickSuggestion={(t) => composerRef.current?.prefill(t)} />
        ) : (
          <StickToBottom className="h-full" resize="smooth" initial="smooth">
            {/* pt-14 让首条消息让开悬浮控制条;底部留白进 scrollHeight(见记忆 chat-bottom-gap-padding) */}
            <StickToBottom.Content className="flex w-full flex-col gap-4 px-3.5 pt-14 pb-[calc(var(--chat-area-h,100dvh)*0.3)]">
              {(hiddenCount > 0 || historyHasMore) && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={conv.loadEarlier}
                    className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-surface-2 px-3.5 text-xs text-muted-foreground transition-colors active:bg-surface-2/70"
                  >
                    {hiddenCount > 0
                      ? `加载更早的 ${hiddenCount} 轮对话`
                      : '加载更早的对话'}
                  </button>
                </div>
              )}
              {visibleTurns.map((t) => (
                <MessageTurn
                  key={t.id}
                  turn={t}
                  artifacts={sessionArtifacts}
                  sessionId={sessionId}
                  userSkillsByGuide={userSkillsByGuide}
                  onPreview={setPreviewArtifact}
                  onResendBlocked={conv.resendBlocked}
                  onDismissBlocked={conv.dismissBlocked}
                />
              ))}
            </StickToBottom.Content>
            <ScrollController scrollRef={scrollToBottomRef} />
          </StickToBottom>
        )}
      </div>

      <div className="shrink-0 bg-background px-3 pb-3 pt-1.5">
        <ChatComposer
          ref={composerRef}
          disabled={composerDisabled}
          busy={busy}
          stopping={stopping}
          context={contextQuery.data}
          onStop={conv.handleStop}
          onSubmit={conv.handleSubmit}
          sessionId={sessionId}
          onSessionEnsured={conv.adoptSession}
          modelSlot={modelSlot}
          onNewConversation={conv.handleNewConversation}
          requireAuth={!token}
          onRequireAuth={() => openAuth('login')}
        />
      </div>

      {/* 历史对话抽屉(左侧滑入):新对话 + 按日期分组历史 + 重命名/删除 —— 形态对齐主流聊天助手 */}
      <MobileClawDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        activeSessionId={activeSessionId}
        onActivate={(sid) => {
          conv.handleActivateSession(sid);
          setDrawerOpen(false);
        }}
        onNewConversation={() => {
          conv.handleNewConversation();
          setDrawerOpen(false);
        }}
      />

      {/* 成果预览(桌面分栏的移动版:整屏 Sheet) */}
      <Sheet
        open={!!previewArtifact}
        onOpenChange={(o) => {
          if (!o) setPreviewArtifact(null);
        }}
      >
        <SheetContent className="w-full p-0 sm:max-w-xl">
          {previewArtifact && (
            <ClawArtifactPreview
              artifact={previewArtifact}
              onClose={() => setPreviewArtifact(null)}
              hideHeaderClose
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
