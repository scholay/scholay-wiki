import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Loader2, MessageSquarePlus, PanelRightOpen, Sparkles } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { StickToBottom } from 'use-stick-to-bottom';
import { Button } from '@/shared/ui/button';
import { AgentDisplacedBanner } from '@/shared/components/AgentDisplacedBanner';
import { ResourceError } from '@/shared/components/ResourceError';
import { SidebarLayout } from '@/shared/components/sidebar';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/shared/ui/resizable';
import { Sheet, SheetContent } from '@/shared/ui/sheet';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { useHeightVar, useMediaQuery } from '@/shared/hooks';
import { modelSupportsVision, useUserModels } from '@/shared/api/models';
import { ModelSelector } from '@/shared/components/chat/ModelSelector';
import { ChatComposer, type ChatComposerHandle } from '../components/chat/ChatComposer';
import { getNewConversationModel, setNewConversationModel } from '../api/session';
import { useUserSkillsByGuide } from '@/shared/api/skills';
import { MessageTurn } from '../components/chat/MessageTurn';
import { type ClawArtifact } from '../api/artifacts';
import { ClawArtifactPreview } from '../components/preview/ClawArtifactPreview';
import { ClawArtifactPanel } from '../components/preview/ClawArtifactPanel';
import { ClawSidebar } from '../components/sidebar/ClawSidebar';
import { ScrollController } from '../components/chat/ScrollController';
import { ClawHero } from '../components/chat/ClawHero';
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
  // (模型选择器已移到 composer,rail 只剩会话历史。)
  useRegisterSidebarRail([
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
    historyError,
    historyErrorObj,
    retryHistory,
    composerDisabled,
  } = conv;

  // 成果文件:统一在右侧分栏展示(不再挂对话底部)。桌面(≥1024px)右侧分栏,窄屏走 Sheet 抽屉。
  const [previewArtifact, setPreviewArtifact] = useState<ClawArtifact | null>(null);
  const isNarrow = useMediaQuery('(max-width: 1024px)');
  // 右侧成果栏「收起」开关(用户可手动收起,中间对话区随之占满)。切换会话时重置为展开,
  // 让「本会话产出了文件 → 默认展示成果栏」可发现;收起是当前会话视图内的临时操作。
  const [rightCollapsed, setRightCollapsed] = useState(false);
  useEffect(() => { setRightCollapsed(false); }, [sessionId]);
  const closePreview = useCallback(() => setPreviewArtifact(null), []);
  const collapseRight = useCallback(() => { setRightCollapsed(true); setPreviewArtifact(null); }, []);
  // 桌面:本会话一旦有产物(或点了预览)且未收起 → 出右侧成果栏;中间对话区保持居中、可拖拽分隔。
  // 会话流里认领「本轮用了你的技能 X」用(guideName → 我启用的市场技能);引用稳定不破 MessageTurn memo。
  const userSkillsByGuide = useUserSkillsByGuide();
  const hasArtifacts = (sessionArtifacts?.length ?? 0) > 0 || !!previewArtifact;
  const showRightPanel = !isNarrow && !rightCollapsed && hasArtifacts;
  // 收起后若仍有产物 → 在对话区右缘留一个「展开成果」浮标,便于重新展开。
  const showReexpandTab = !isNarrow && rightCollapsed && hasArtifacts;

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
  // P2 模型目录:composer 左下角选择器(服务端权威;新对话时展示用户级偏好)。
  const navigate = useNavigate();
  const { data: userModels } = useUserModels('claw');
  const [newConvPref, setNewConvPref] = useState<string | null>(() => getNewConversationModel() ?? null);
  const selectorCurrent =
    socket.sessionModel ?? (!sessionId && newConvPref ? { modelId: newConvPref, isDefault: false } : null);
  const modelSlot =
    userModels && userModels.length > 0 ? (
      <ModelSelector
        models={userModels}
        current={selectorCurrent}
        onUpgrade={() => navigate('/pricing')}
        onSelect={(id) => {
          if (sessionId) {
            // 已有会话:发帧 → hub 校验落 pinned_model → runtime_config_updated 广播回来更新 UI。
            socket.send({ type: 'set_runtime_config', providerId: null, modelId: id ?? '', useDefault: id === null });
          } else {
            // 新对话(未建会话):记用户级偏好,建会话后一次性下发(useClawConversation)。
            setNewConversationModel(id);
            setNewConvPref(id);
          }
        }}
      />
    ) : null;

  // P2 图片通道:图片入口跟随当前会话模型的视觉能力(诚实 UI:模型看不见就不收)。
  const acceptImages = modelSupportsVision(userModels, selectorCurrent);

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
      modelSlot={modelSlot}
      acceptImages={acceptImages}
      onNewConversation={conv.handleNewConversation}
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
        {/* 连接状态徽章已移除:连接/重连过程对用户无意义,不展示(其余 feature 同)。 */}
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
      {/* hero(居中)与对话视图是两层叠层,互不挤压;对话框在两层各渲一份(hero 淡出 + 底栏就位)。 */}
      <div className="relative h-full min-h-0">
        {/* 成果栏已收起但仍有产物 → 右缘浮标(图标 + 数量),点开重新展开成果栏。 */}
        {showReexpandTab && (
          <button
            type="button"
            onClick={() => setRightCollapsed(false)}
            title="展开成果栏"
            aria-label="展开成果栏"
            className="absolute right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-md border border-r-0 border-border bg-surface-1 px-1.5 py-2.5 text-2xs text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <PanelRightOpen className="h-4 w-4 text-brand-green" />
            {(sessionArtifacts?.length ?? 0) > 0 && <span className="font-semibold">{sessionArtifacts?.length}</span>}
          </button>
        )}
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
                    // 产物卡「就近」挂在每条回答正下方(桌面 + 窄屏一致)—— 帧驱动 turn.artifacts,
                    // 传 DTO 列表按 path 关联拿下载 id/标题/预览。右侧 ClawArtifactPanel 降为「全部产物」汇总。
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

            {/* 底部渐隐:让悬浮对话框"浮"在对话之上,文字不顶到框边。 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background via-background/85 to-transparent" />

            {/* 悬浮 / 停靠的对话框 —— 普通 div(不用 framer layoutId)。
                历史上用 hero↔底栏共用 layoutId 做「从居中滑到底部」的过渡,但那个共享 layout 动画会在
                返回页面时用 scaleY morph 高度、过渡被路由打断即卡住 → 输入框被拉高(反复偶现变形)。
                已彻底移除共享 layout:hero 淡出 + 底栏 composer 直接就位(交叉淡入),输入框永不变形。
                外层 pointer-events-none 让框两侧空白不挡滚动,框本体 pointer-events-auto 可交互。 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-6 pb-4">
              <div className="pointer-events-auto mx-auto w-full max-w-2xl">
                {renderComposer()}
              </div>
            </div>
          </div>
        )}

        {/* 加载历史(覆盖层) */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-faint" />
          </div>
        )}

        {/* 历史加载失败(覆盖层)—— 后端读 agent 历史 10s 超时 / 5xx 会 502;
            给「加载失败 + 重试」出口,而非把瞬时失败伪装成「没有对话内容」的空 hero。 */}
        {!loading && turns.length === 0 && historyError && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
            <ResourceError
              error={historyErrorObj}
              resourceName="对话"
              onRetry={retryHistory}
              onBack={conv.handleNewConversation}
              backLabel="开始新对话"
              autoRedirect={false}
            />
          </div>
        )}

        {/* 新对话 hero(顶层):发首条消息后整体淡出(图标 + 标题 + chip);底栏 composer 同时就位。 */}
        <AnimatePresence initial={false}>
          {!loading && turns.length === 0 && !historyError && (
            <motion.div
              key="claw-hero"
              className="absolute inset-0 z-30 flex"
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
            >
              <ClawHero
                composer={
                  <div className="w-full">
                    {renderComposer(composerRef)}
                  </div>
                }
                onPickSuggestion={(t) => composerRef.current?.prefill(t)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </ResizablePanel>
      {showRightPanel && (
        <>
          <ResizableHandle withHandle />
          {/* 成果文件栏:有产物自动出现;中间对话区保持居中(max-w-3xl mx-auto),分隔可拖拽。
              defaultSize 偏小,尽量少挤压对话列。 */}
          <ResizablePanel id="claw-artifacts" order={2} defaultSize={34} minSize={24} className="min-w-0">
            <ClawArtifactPanel
              sessionId={sessionId ?? ''}
              artifacts={sessionArtifacts ?? []}
              previewArtifact={previewArtifact}
              onPreview={setPreviewArtifact}
              onClosePreview={closePreview}
              onCollapse={collapseRight}
            />
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
