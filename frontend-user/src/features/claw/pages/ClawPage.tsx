import { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, History, Loader2, MessageSquarePlus, Sparkles } from 'lucide-react';
import { StickToBottom } from 'use-stick-to-bottom';
import { Button } from '@/shared/ui/button';
import { AgentDisplacedBanner } from '@/shared/components/AgentDisplacedBanner';
import { SidebarLayout } from '@/shared/components/sidebar';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/shared/ui/resizable';
import { Sheet, SheetContent } from '@/shared/ui/sheet';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { useHeightVar, useMediaQuery } from '@/shared/hooks';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageTurn } from '../components/chat/MessageTurn';
import { type ClawArtifact } from '../api/artifacts';
import { ClawArtifactPreview } from '../components/preview/ClawArtifactPreview';
import { ClawSidebar } from '../components/sidebar/ClawSidebar';
import { ScrollController } from '../components/chat/ScrollController';
import { ConnectionBadge } from '../components/chat/ConnectionBadge';
import { ClawEmptyState } from '../components/chat/ClawEmptyState';
import { useClawConversation } from '../hooks/useClawConversation';

/**
 * 智能助手主页(桌面) —— standalone 路由 `/claw`。
 *
 * 会话状态机(多会话/懒新建/WS 流式/断线续流/渲染窗口)全部在
 * useClawConversation(与移动端 MobileClawPage 共用);本页只管桌面布局:
 * 侧边栏 + 顶栏 + 对话/预览可拖拽分栏 + composer。
 */
export function ClawPage() {
  const openAuth = useAuthDialog((s) => s.openDialog);

  // 侧边栏收起态的冗余入口(顶栏 rail chip):点击 = 展开 sidebar + 对应 section 闪一下定位。
  useRegisterSidebarRail([
    { id: 'claw-model', label: '对话模型', icon: Cpu, sectionId: 'claw-model' },
    { id: 'claw-sessions', label: '会话历史', icon: History, sectionId: 'claw-sessions' },
  ]);

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
    composerDisabled,
  } = conv;

  // 成果预览:点卡片「预览」→ 选中该交付物。桌面(≥1024px)右侧分栏,窄屏走 Sheet 抽屉。
  const [previewArtifact, setPreviewArtifact] = useState<ClawArtifact | null>(null);
  const isNarrow = useMediaQuery('(max-width: 1024px)');
  const showSidePreview = !!previewArtifact && !isNarrow;
  const closePreview = useCallback(() => setPreviewArtifact(null), []);

  // 量出"对话框可视区"像素高 → 写进 --chat-area-h, 供底部留白按比例计算 (见 StickToBottom.Content)。
  const chatAreaRef = useHeightVar<HTMLDivElement>('chat-area-h');

  // 发送新一轮后立刻滚到底: scrollToBottom 由 StickToBottom 内的 <ScrollController> 注入到这个 ref。
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const prevPendingLenRef = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount > prevPendingLenRef.current) {
      scrollToBottomRef.current?.();
    }
    prevPendingLenRef.current = pendingCount;
  }, [pendingCount]);

  return (
    <SidebarLayout
      sidebar={
        <ClawSidebar
          activeSessionId={activeSessionId}
          onActivate={conv.handleActivateSession}
          // "新对话" 走 lazy 语义: 不创建后端 session, 只把本地切到空白态。
          onNewConversation={conv.handleNewConversation}
          // 模型切换: ClawModelSelector 直接通过 socket.send 把 set_runtime_config
          // 推给 agent (per-session, 不写盘); 同时 localStorage 记忆下次重连自动 re-apply。
          onSendToSocket={socket.send}
        />
      }
    >
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 items-center gap-3 border-b border-border px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground">
            <Sparkles className="h-3.5 w-3.5 text-background" />
          </div>
          <h1 className="text-base font-bold text-foreground">智能助手</h1>
        </div>
        <ConnectionBadge state={socket.state} reconnectAttempt={socket.reconnectAttempt} />
        {/* 上下文水位从 header 移到了输入框 footer (ChatComposer), 参考 Claude/Cursor 的位置。 */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={conv.handleNewConversation}
            disabled={busy || sessionId === null}
            title={sessionId === null ? '已是新对话准备态' : busy ? '等当前回答完成' : ''}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            新对话
          </Button>
        </div>
      </header>

      {/* 多窗口接管 banner — 后端 displacement 路径下发 displaced 帧后出现。
          点 "切回这里" → socket.takeOver() 重新建 WS 把活跃权抢回。 */}
      {socket.state === 'displaced' && (
        <AgentDisplacedBanner
          reason={socket.displacedReason}
          onTakeOver={socket.takeOver}
          className="px-6"
        />
      )}

      {/* 对话 | 预览 可拖拽分栏(桌面)。预览未开时只有左栏;窄屏走下方 Sheet 不分栏。
          左栏给稳定 id/order,开关预览时不重挂 → StickToBottom 滚动位置不丢。 */}
      <ResizablePanelGroup direction="horizontal" autoSaveId="claw-preview-h" className="flex min-h-0 flex-1">
      <ResizablePanel id="claw-chat" order={1} minSize={36} className="min-w-0">
      <div className="flex h-full min-h-0 flex-col">
        {/* 量出"对话框可视区"像素高 → 写进 --chat-area-h, 供最后一轮按比例留白 (见下方 turns 渲染)。 */}
        <div ref={chatAreaRef} className="min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-faint" />
            </div>
          ) : turns.length === 0 ? (
            <ClawEmptyState />
          ) : (
            <StickToBottom
              className="h-full"
              resize="smooth"
              initial="smooth"
            >
              {/* 底部留白 = 滚动内容的 padding-bottom (pt-6 保留顶部 24px; py-6 拆成 pt-6 + pb 避免
                  padding-bottom 冲突)。不用 min-height 撑最后一轮: 长回答本身超过半屏时 min-height
                  会被忽略 → 仍紧贴输入框。padding-bottom 进 scrollHeight, 贴底时必然露在视口底部 =
                  稳定留白 (短/长/流式/重入 全有)。--chat-area-h 由 useHeightVar 实时量本对话框高,
                  ×0.3 ≈ 三成; fallback 100dvh 兜底。改 0.3 调留白多少。 */}
              <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 pt-6 pb-[calc(var(--chat-area-h,100dvh)*0.3)]">
                {(hiddenCount > 0 || historyHasMore) && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      // 两段式: 先渲染已拉到但没进 DOM 的轮 (不发请求); 都渲染完还有更早的 → 向后端多要一页。
                      onClick={conv.loadEarlier}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-pill bg-surface-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2/70 transition-colors"
                    >
                      {hiddenCount > 0 ? `加载更早的 ${hiddenCount} 轮对话` : '加载更早的对话'}
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

        <div className="border-t border-border bg-background px-6 py-3">
          <div className="mx-auto max-w-3xl">
            <ChatComposer
              disabled={composerDisabled}
              busy={busy}
              stopping={stopping}
              context={contextQuery.data}
              onStop={conv.handleStop}
              onSubmit={conv.handleSubmit}
              sessionId={sessionId}
              onSessionEnsured={conv.adoptSession}
              // 未登录:发送/上传 → 弹登录注册, 不真的发请求
              requireAuth={!token}
              onRequireAuth={() => openAuth('login')}
            />
          </div>
        </div>
      </div>
      </ResizablePanel>
      {showSidePreview && previewArtifact && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id="claw-preview" order={2} defaultSize={42} minSize={26} className="min-w-0">
            <ClawArtifactPreview artifact={previewArtifact} onClose={closePreview} />
          </ResizablePanel>
        </>
      )}
      </ResizablePanelGroup>

      {/* 窄屏(<1024px):预览走右侧 Sheet 抽屉,不挤压对话。 */}
      <Sheet
        open={!!previewArtifact && isNarrow}
        onOpenChange={(o) => {
          if (!o) closePreview();
        }}
      >
        <SheetContent className="w-full p-0 sm:max-w-xl">
          {previewArtifact && (
            <ClawArtifactPreview artifact={previewArtifact} onClose={closePreview} hideHeaderClose />
          )}
        </SheetContent>
      </Sheet>
    </div>
    </SidebarLayout>
  );
}
