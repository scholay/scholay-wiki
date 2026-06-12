import { useCallback, useEffect, useRef, useState } from 'react';
import { History, Loader2, MessageSquarePlus, Sparkles } from 'lucide-react';
import { StickToBottom } from 'use-stick-to-bottom';
import { AgentDisplacedBanner } from '@/shared/components/AgentDisplacedBanner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useHeightVar } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { MessageTurn } from '../../components/chat/MessageTurn';
import { type ClawArtifact } from '../../api/artifacts';
import { ClawArtifactPreview } from '../../components/preview/ClawArtifactPreview';
import { ScrollController } from '../../components/chat/ScrollController';
import { ConnectionBadge } from '../../components/chat/ConnectionBadge';
import { ClawEmptyState } from '../../components/chat/ClawEmptyState';
import { useClawConversation } from '../../hooks/useClawConversation';

/**
 * 智能助手移动版(/m/claw) —— 与桌面 ClawPage 共用 useClawConversation 状态机
 * 和全部聊天组件(MessageTurn/ChatComposer/StickToBottom),只重做布局:
 * 侧边栏 → 左侧会话抽屉;可拖拽预览分栏 → 底部 Sheet;顶栏收窄。
 */
export function MobileClawPage() {
  const openAuth = useAuthDialog((s) => s.openDialog);
  const conv = useClawConversation();
  const {
    token,
    sessionsQuery,
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
    composerDisabled,
  } = conv;

  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<ClawArtifact | null>(null);

  const chatAreaRef = useHeightVar<HTMLDivElement>('chat-area-h');
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const prevPendingLenRef = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount > prevPendingLenRef.current) {
      scrollToBottomRef.current?.();
    }
    prevPendingLenRef.current = pendingCount;
  }, [pendingCount]);

  const activateAndClose = useCallback(
    (sid: string) => {
      conv.handleActivateSession(sid);
      setSessionsOpen(false);
    },
    [conv]
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <button
          type="button"
          aria-label="会话历史"
          onClick={() => setSessionsOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-pill active:bg-surface-2"
        >
          <History className="size-5 text-foreground" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground">
            <Sparkles className="h-3 w-3 text-background" />
          </div>
          <span className="truncate text-md font-semibold text-foreground">
            智能助手
          </span>
          <ConnectionBadge
            state={socket.state}
            reconnectAttempt={socket.reconnectAttempt}
          />
        </div>
        <button
          type="button"
          aria-label="新对话"
          onClick={conv.handleNewConversation}
          disabled={busy || sessionId === null}
          className="flex h-9 w-9 items-center justify-center rounded-pill text-foreground active:bg-surface-2 disabled:opacity-40"
        >
          <MessageSquarePlus className="size-5" />
        </button>
      </header>

      {socket.state === 'displaced' && (
        <AgentDisplacedBanner
          reason={socket.displacedReason}
          onTakeOver={socket.takeOver}
          className="px-4"
        />
      )}

      <div ref={chatAreaRef} className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-faint" />
          </div>
        ) : turns.length === 0 ? (
          <ClawEmptyState />
        ) : (
          <StickToBottom className="h-full" resize="smooth" initial="smooth">
            {/* 底部留白同桌面:padding-bottom 进 scrollHeight(见 ClawPage 注释/记忆 chat-bottom-gap-padding) */}
            <StickToBottom.Content className="flex w-full flex-col gap-4 px-3.5 pt-4 pb-[calc(var(--chat-area-h,100dvh)*0.3)]">
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
                  onPreview={setPreviewArtifact}
                />
              ))}
            </StickToBottom.Content>
            <ScrollController scrollRef={scrollToBottomRef} />
          </StickToBottom>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background px-3 py-2">
        <ChatComposer
          disabled={composerDisabled}
          busy={busy}
          stopping={stopping}
          context={contextQuery.data}
          onStop={conv.handleStop}
          onSubmit={conv.handleSubmit}
          sessionId={sessionId}
          onSessionEnsured={conv.adoptSession}
          requireAuth={!token}
          onRequireAuth={() => openAuth('login')}
        />
      </div>

      {/* 会话历史抽屉(桌面侧边栏的移动版;项目 Sheet 固定右滑) */}
      <Sheet open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <SheetContent className="w-80 gap-0 p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-md">会话历史</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sessionsQuery.isLoading && (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-faint" />
              </div>
            )}
            {(sessionsQuery.data ?? []).map((s) => (
              <button
                key={s.sessionId}
                type="button"
                onClick={() => activateAndClose(s.sessionId)}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-md px-3 py-2.5 text-left active:bg-surface-2',
                  s.sessionId === activeSessionId && 'bg-surface-2'
                )}
              >
                <span className="truncate text-md text-foreground">
                  {s.title || '未命名会话'}
                </span>
                <span className="text-xs text-faint">
                  {s.messageCount} 条消息
                </span>
              </button>
            ))}
            {sessionsQuery.data?.length === 0 && (
              <p className="py-10 text-center text-sm text-faint">
                还没有会话,发出第一条消息试试
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
