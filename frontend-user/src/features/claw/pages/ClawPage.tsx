import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { Cpu, History, Loader2, MessageSquarePlus, Sparkles } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { StickToBottom } from 'use-stick-to-bottom';
import { Button } from '@/shared/ui/button';
import { AgentDisplacedBanner } from '@/shared/components/AgentDisplacedBanner';
import { SidebarLayout } from '@/shared/components/sidebar';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/shared/ui/resizable';
import { Sheet, SheetContent } from '@/shared/ui/sheet';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { useHeightVar, useMediaQuery } from '@/shared/hooks';
import { ChatComposer, type ChatComposerHandle } from '../components/chat/ChatComposer';
import { MessageTurn } from '../components/chat/MessageTurn';
import { type ClawArtifact } from '../api/artifacts';
import { ClawArtifactPreview } from '../components/preview/ClawArtifactPreview';
import { ClawSidebar } from '../components/sidebar/ClawSidebar';
import { ScrollController } from '../components/chat/ScrollController';
import { ConnectionBadge } from '../components/chat/ConnectionBadge';
import { ClawHero } from '../components/chat/ClawHero';
import { useClawConversation } from '../hooks/useClawConversation';

/** 居中 hero ↔ 底部停靠 共用的 layoutId:发首条消息后 framer 据此把对话框从居中平滑滑到底部。 */
const CLAW_COMPOSER_LAYOUT_ID = 'claw-composer';
/** 停靠过渡(与智能搜索同款 spring);reduced-motion 下瞬切(去位移,避免前庭不适)。 */
const composerDock = (reduce: boolean | null) =>
  reduce ? { duration: 0 } : ({ type: 'spring', bounce: 0.18, duration: 0.55 } as const);

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

  const reduce = useReducedMotion();

  // composer 在「空态 hero(居中)」与「对话中底部停靠」两处复用同一套 props。hero 传 ref 以支持
  // 点示例提问 prefill;停靠位不需要 ref。两处各是一份实例 + 同一个 layoutId → 发首条消息时
  // framer 把框从居中平滑滑到底部(切换发生在 submit 后,内部文本已清空,无内容丢失)。
  const composerRef = useRef<ChatComposerHandle>(null);
  const renderComposer = (ref?: Ref<ChatComposerHandle>) => (
    <ChatComposer
      ref={ref}
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
  );

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
      {/* hero(居中)与对话视图是两层叠层,互不挤压;对话框借同一 layoutId 在两层间平滑停靠。 */}
      <LayoutGroup>
      <div className="relative h-full min-h-0">
        {/* 对话视图(底层)—— 仅有对话时渲染;输入框悬浮停靠在底部中央(参考智能搜索)。 */}
        {turns.length > 0 && (
          // 量高 div: useHeightVar 把"对话框可视区"像素高写进 --chat-area-h, 供留白按比例算。
          <div ref={chatAreaRef} className="absolute inset-0">
            <StickToBottom className="h-full" resize="smooth" initial="smooth">
              {/* 底部留白 = 滚动内容的 padding-bottom(算进 scrollHeight,贴底时稳定露在视口底)。
                  对话框现在"悬浮"在底部 → 留白要 ≥ 框高, 内容才不被它盖住:max(三成框高, 140px)。 */}
              <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 pt-6 pb-[max(calc(var(--chat-area-h,100dvh)*0.3),140px)]">
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

            {/* 底部渐隐:让悬浮对话框"浮"在对话之上,文字不顶到框边。 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background via-background/85 to-transparent" />

            {/* 悬浮 / 停靠的对话框 —— 与 hero 同一个 layoutId, 发首条消息后从居中滑到这里(同尺寸=纯位移)。
                外层 pointer-events-none 让框两侧空白不挡滚动,框本体 pointer-events-auto 可交互。 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-6 pb-4">
              <motion.div
                layoutId={CLAW_COMPOSER_LAYOUT_ID}
                transition={composerDock(reduce)}
                className="pointer-events-auto mx-auto w-full max-w-2xl"
              >
                {renderComposer()}
              </motion.div>
            </div>
          </div>
        )}

        {/* 加载历史(覆盖层) */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-faint" />
          </div>
        )}

        {/* 新对话 hero(顶层):发首条消息后整体淡出(图标 + 标题 + chip),
            对话框则借 layoutId 从居中平滑滑到底部停靠。 */}
        <AnimatePresence initial={false}>
          {!loading && turns.length === 0 && (
            <motion.div
              key="claw-hero"
              className="absolute inset-0 z-30 flex"
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
            >
              <ClawHero
                composer={
                  <motion.div
                    layoutId={CLAW_COMPOSER_LAYOUT_ID}
                    transition={composerDock(reduce)}
                    className="w-full"
                  >
                    {renderComposer(composerRef)}
                  </motion.div>
                }
                onPickSuggestion={(t) => composerRef.current?.prefill(t)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </LayoutGroup>
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
