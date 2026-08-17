import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { StickToBottom } from 'use-stick-to-bottom';
import { Button } from '@/shared/ui/button';
import { AgentDisplacedBanner } from '@/shared/components/AgentDisplacedBanner';
import { ResourceError } from '@/shared/components/ResourceError';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { useSearchRightPanelStore } from '@/stores/search-right-panel.store';
import { useArtifactExportBridge } from '@/stores/artifact-export-bridge.store';
import { useHeightVar, useLocalStorage, useMediaQuery } from '@/shared/hooks';
import { modelSupportsVision, useUserModels } from '@/shared/api/models';
import { ModelSelector } from '@/shared/components/chat/ModelSelector';
import { QuestionPrompt, StallNotice, findPendingQuestionBlock } from '@/shared/components/chat';
import { FundsReminderChatNotice } from '@/shared/components/funds-reminder/FundsReminder';
import { useUserSkillsByGuide } from '@/shared/api/skills';
import { cn } from '@/shared/lib/utils';
import { RightPanelFeatureHub } from '@/features/search/components/workspace/RightPanelFeatureHub';
import { FILE_COL_DEFAULT_PX } from '@/features/search/components/workspace/ColumnResizeHandle';
import { ChatComposer, type ChatComposerHandle } from './ChatComposer';
import { MessageTurn } from './MessageTurn';
import { ClawHero, type HeroSuggestion } from './ClawHero';
import { ScrollController } from './ScrollController';
import { type ClawArtifact, type ArtifactBasePath } from '../../api/artifacts';
import type { useClawConversation } from '../../hooks/useClawConversation';

const SearchRightPanel = lazy(() =>
  import('@/features/search/components/SearchRightPanel').then((m) => ({
    default: m.SearchRightPanel,
  })),
);

const CHAT_MIN_PX = 380;
const CHAT_MAX_PX = 900;
const CHAT_DEFAULT_PX = 480;
const RIGHT_MIN_PX = 480;

/** claw / boltslides 两个对话 hook 返回同构;用 claw 的作为公共类型。 */
export type ConversationApi = ReturnType<typeof useClawConversation>;

/** 一个模式(对话 / 制作PPT)的展示装配。feature-specific 的都收在这里。 */
export interface WorkspaceConfig {
  /** header 标题 + 图标(侧栏 / SEO 语义)。 */
  title: string;
  titleIcon: ComponentType<{ className?: string }>;
  /** 模型能力绑定 key(useUserModels)+「新对话默认模型」偏好(各 feature 独立)。 */
  modelFeature: 'claw' | 'boltslides' | 'sci_draw';
  newConvModel: { get: () => string | undefined; set: (id: string | null) => void };
  /** 产物下载/预览端点前缀。 */
  artifactBasePath: ArtifactBasePath;
  /** 空态 hero 文案。 */
  hero: { title: string; subtitle: string; suggestions: HeroSuggestion[] };
  /** 右侧成果栏空态提示(产物改 Sheet 预览后仅作兼容保留)。 */
  emptyArtifactsHint?: string;
  /** 科研绘图:图片类产物**内联展示**在对话流里(不占用右侧文档扩展区、不出文件卡)。 */
  figuresInline?: boolean;
  /** 产物即成果的 feature(如制作PPT):新产出后**自动打开**预览 Sheet + 生成中轮询产物。 */
  autoOpenLatestArtifact?: boolean;
  /** composer 附件/引用/技能入口开关(默认 true;制作PPT 纯文本 → false)+ 占位文案。 */
  enableAttachments?: boolean;
  composerPlaceholder?: string;
  /** ResizablePanelGroup 布局持久化 key(避免两模式互相污染栏宽)。 */
  layoutKey: string;
  /** sidebar rail(收起态顶栏 chip)段落 id/文案。 */
  railSectionId: string;
  railLabel: string;
}

/**
 * 会话工作区(桌面)—— px 锁定对话列 + 右侧工作区 FeatureHub。
 * 历史会话走全站左轨「对话」段,主区不再挂 AgentSessionStrip。
 * 不挂检索模式切换:智能助手是独立入口,去文献检索走菜单 / 其它引导。
 * 会话状态机(conv)由外层按模式各自的 hook 提供并注入。
 */
export function ConversationWorkspace({
  conv,
  cfg,
  heroExtra,
  onNewConversation,
  onExportArtifactDeck,
  exportingFormat = null,
  initialPrompt,
  onInitialPromptConsumed,
}: {
  conv: ConversationApi;
  cfg: WorkspaceConfig;
  /** 空态 hero 里 composer 下方的附加内容(模板卡扑克牌扇 / 换回对话)。 */
  heroExtra?: ReactNode;
  /** 「新对话」—— **回到默认聊天空态**(claw,露出模板卡可重选);
   *  由 ClawPage 传入(= 切回 claw feature 的空白新对话)。缺省回落 conv.handleNewConversation。 */
  onNewConversation?: () => void;
  /** 制作PPT:把 html 演示稿产物导出为 PDF/PPTX。 */
  onExportArtifactDeck?: (a: ClawArtifact, format: 'pptx' | 'pptx-native' | 'pdf') => void;
  exportingFormat?: 'pptx' | 'pptx-native' | 'pdf' | null;
  /** 首页等外部入口带过来的首条草稿 —— 仅空态预填,不自动发送。 */
  initialPrompt?: string;
  onInitialPromptConsumed?: () => void;
}) {
  const openAuth = useAuthDialog((s) => s.openDialog);

  useRegisterSidebarRail([
    { id: cfg.railSectionId, label: cfg.railLabel, icon: FolderOpen, sectionId: cfg.railSectionId },
  ]);

  const {
    token,
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
    stalled,
    stopping,
    loading,
    historyError,
    historyErrorObj,
    retryHistory,
    composerDisabled,
  } = conv;

  const pendingQuestionBlock = findPendingQuestionBlock(turns);
  const handleAnswerQuestion = useCallback(
    (text: string) => {
      void conv.handleSubmit(text, [], []);
    },
    [conv.handleSubmit],
  );

  const startNew = onNewConversation ?? conv.handleNewConversation;
  const conversationActive = turns.length > 0 || !!sessionId;

  const isNarrow = useMediaQuery('(max-width: 1024px)');

  const activePanel = useSearchRightPanelStore((s) => s.activePanel);
  const fileAreaOpen = useSearchRightPanelStore((s) => s.fileAreaOpen);
  const openPanel = useSearchRightPanelStore((s) => s.openPanel);
  const openArtifact = useSearchRightPanelStore((s) => s.openArtifact);
  const setEmbedMode = useSearchRightPanelStore((s) => s.setEmbedMode);
  const resetPanel = useSearchRightPanelStore((s) => s.reset);
  const bindArtifactExport = useArtifactExportBridge((s) => s.bind);
  const unbindArtifactExport = useArtifactExportBridge((s) => s.unbind);

  useEffect(() => {
    setEmbedMode(true);
    // 勿把检索页留下的 PDF Chat / 矩阵等功能态带进助手
    const ap = useSearchRightPanelStore.getState().activePanel;
    if (ap?.group === 'function') {
      useSearchRightPanelStore.getState().dismissToHub();
    }
    return () => {
      setEmbedMode(false);
      resetPanel();
    };
  }, [setEmbedMode, resetPanel]);

  // 右栏(含 FeatureHub)始终展开 —— 空态 hero 也保留拓展区。
  useEffect(() => {
    openPanel();
  }, [openPanel]);

  // 制作PPT 导出回调挂到右栏产物 tab 用。
  useEffect(() => {
    bindArtifactExport({
      onExportDeck: onExportArtifactDeck
        ? (artifact, format) => onExportArtifactDeck(artifact as ClawArtifact, format)
        : undefined,
      exportingFormat,
    });
    return () => unbindArtifactExport();
  }, [bindArtifactExport, unbindArtifactExport, onExportArtifactDeck, exportingFormat]);

  const handlePreviewArtifact = useCallback(
    (artifact: ClawArtifact) => {
      openArtifact({
        ...artifact,
        basePath: cfg.artifactBasePath,
      });
    },
    [openArtifact, cfg.artifactBasePath],
  );

  const showRightPanel = !isNarrow;
  const showFeatureHubDock = showRightPanel && !activePanel;
  // 文件区(「当前对话」文献列)与拓展区任一打开都要挂右栏。
  const expansionOpen = showRightPanel && !!activePanel;
  const onlyFileArea = showRightPanel && fileAreaOpen && !activePanel;
  const showExpandedRight = expansionOpen || onlyFileArea;
  const showResizeHandle = expansionOpen;
  // 空态 hero / 未展开拓展区 / 仅文件区(右侧定宽)时主列吃满;拓展展开后按 chatWidth 锁定左列。
  const expandMainColumn = !conversationActive || !expansionOpen;

  const inlineFigures = !!cfg.figuresInline;
  const autoOpenLatest = !!cfg.autoOpenLatestArtifact && !inlineFigures;
  const revealWhileBusy = inlineFigures || autoOpenLatest;

  const qc = useQueryClient();
  useEffect(() => {
    if (!revealWhileBusy || !busy) return;
    const iv = setInterval(() => {
      qc.invalidateQueries({ queryKey: [cfg.modelFeature, 'artifacts'] });
    }, 2500);
    return () => clearInterval(iv);
  }, [busy, revealWhileBusy, cfg.modelFeature, qc]);

  const autoOpenSeenRef = useRef<number | null>(null);
  const autoOpenInitRef = useRef(false);
  useEffect(() => {
    autoOpenInitRef.current = false;
  }, [sessionId]);
  useEffect(() => {
    if (!autoOpenLatest) return;
    const withId = (sessionArtifacts ?? []).filter((a) => !!a.id);
    const latest = withId[withId.length - 1];
    if (!autoOpenInitRef.current) {
      autoOpenInitRef.current = true;
      autoOpenSeenRef.current = latest?.id ?? null;
      return;
    }
    if (latest?.id && latest.id !== autoOpenSeenRef.current) {
      autoOpenSeenRef.current = latest.id;
      handlePreviewArtifact(latest);
    }
  }, [sessionArtifacts, autoOpenLatest, handlePreviewArtifact]);
  const userSkillsByGuide = useUserSkillsByGuide();

  const chatAreaRef = useHeightVar<HTMLDivElement>('chat-area-h');

  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const prevPendingLenRef = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount > prevPendingLenRef.current) {
      scrollToBottomRef.current?.();
    }
    prevPendingLenRef.current = pendingCount;
  }, [pendingCount]);

  const reduce = useReducedMotion();

  const navigate = useNavigate();

  const [chatWidth, setChatWidth] = useLocalStorage<number>(
    'search.searcher-width',
    CHAT_DEFAULT_PX,
  );
  const [fileColWidth, setFileColWidth] = useLocalStorage<number>(
    'claw.file-col-width',
    FILE_COL_DEFAULT_PX,
  );
  const draggingRef = useRef(false);
  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startChat = chatWidth;
      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const dx = ev.clientX - startX;
        const next = Math.max(CHAT_MIN_PX, Math.min(CHAT_MAX_PX, startChat + dx));
        setChatWidth(next);
      };
      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
      };
      document.body.style.cursor = 'col-resize';
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [chatWidth, setChatWidth],
  );

  const { data: userModels } = useUserModels(cfg.modelFeature);
  const [newConvPref, setNewConvPref] = useState<string | null>(() => cfg.newConvModel.get() ?? null);
  const selectorCurrent =
    socket.sessionModel ?? (!sessionId && newConvPref ? { modelId: newConvPref, isDefault: false } : null);
  const modelSlot =
    userModels && userModels.length > 0 ? (
      <ModelSelector
        models={userModels}
        current={selectorCurrent}
        currentTokens={contextQuery.data?.totalTokens ?? 0}
        onUpgrade={() => navigate('/pricing')}
        onSelect={(id) => {
          if (sessionId) {
            socket.send({ type: 'set_runtime_config', providerId: null, modelId: id ?? '', useDefault: id === null });
            qc.invalidateQueries({ queryKey: [cfg.modelFeature, 'context', sessionId] });
          } else {
            cfg.newConvModel.set(id);
            setNewConvPref(id);
          }
        }}
      />
    ) : null;

  const acceptImages = modelSupportsVision(userModels, selectorCurrent);

  const composerRef = useRef<ChatComposerHandle>(null);

  useEffect(() => {
    const prompt = initialPrompt?.trim();
    if (!prompt || turns.length > 0 || loading) return;
    const raf = requestAnimationFrame(() => {
      if (!composerRef.current) return;
      composerRef.current.prefill(prompt);
      onInitialPromptConsumed?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [initialPrompt, turns.length, loading, onInitialPromptConsumed]);

  const disabledPlaceholder = busy
    ? undefined
    : sessionId !== null && socket.state !== 'open'
      ? '连接中断,正在重连…'
      : undefined;
  const renderComposer = (ref?: Ref<ChatComposerHandle>) => (
    <ChatComposer
      ref={ref}
      disabled={composerDisabled}
      disabledPlaceholder={disabledPlaceholder}
      busy={busy}
      stopping={stopping}
      onStop={conv.handleStop}
      onSubmit={conv.handleSubmit}
      sessionId={sessionId}
      onSessionEnsured={conv.adoptSession}
      modelSlot={modelSlot}
      acceptImages={acceptImages}
      onNewConversation={startNew}
      requireAuth={!token}
      onRequireAuth={() => openAuth('login')}
      enableAttachments={cfg.enableAttachments ?? true}
      placeholder={cfg.composerPlaceholder}
    />
  );

  return (
      <div className="relative flex h-full min-h-0 bg-background">
        <div
          style={expandMainColumn ? undefined : { width: chatWidth }}
          className={cn(
            'h-full min-h-0 shrink-0',
            expandMainColumn ? 'min-w-0 flex-1' : 'border-r border-border',
          )}
        >
          <div className="relative flex h-full min-h-0 flex-col bg-background">
            {socket.state === 'displaced' && (
              <AgentDisplacedBanner
                reason={socket.displacedReason}
                onTakeOver={socket.takeOver}
                className="px-4"
              />
            )}

            {socket.state === 'error' && (
              <div className="flex items-center gap-3 border-b border-border bg-warning-soft px-4 py-2">
                <span className="text-sm text-subtle">与服务器的连接已断开,正在自动重连…</span>
                <Button variant="outline" size="sm" className="h-7" onClick={socket.takeOver}>
                  立即重连
                </Button>
              </div>
            )}

            {stalled && busy && (
              <div className="border-b border-border px-4 py-2">
                <StallNotice onStop={conv.handleStop} onDismiss={conv.dismissStall} />
              </div>
            )}

            <div className="relative min-h-0 flex-1">
              {turns.length > 0 && (
                <div ref={chatAreaRef} className="absolute inset-0">
                  <StickToBottom
                    className="relative h-full bg-background px-4 py-4"
                    resize="smooth"
                    initial="smooth"
                  >
                    <StickToBottom.Content className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5 pb-[max(calc(var(--chat-area-h,100dvh)*0.3),220px)]">
                      {(hiddenCount > 0 || historyHasMore) && (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={conv.loadEarlier}
                            className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-surface-2 px-3.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2/70 hover:text-foreground"
                          >
                            {hiddenCount > 0 ? `加载更早的 ${hiddenCount} 轮对话` : '加载更早的对话'}
                          </button>
                        </div>
                      )}
                      {visibleTurns.map((t, i) => (
                        <MessageTurn
                          key={t.id}
                          turn={t}
                          artifacts={sessionArtifacts}
                          sessionId={sessionId}
                          userSkillsByGuide={userSkillsByGuide}
                          onPreview={handlePreviewArtifact}
                          onResendBlocked={conv.resendBlocked}
                          onDismissBlocked={conv.dismissBlocked}
                          onRetryTurn={
                            i === visibleTurns.length - 1 ? conv.handleRetryTurn : undefined
                          }
                          artifactBasePath={cfg.artifactBasePath}
                          figuresInline={inlineFigures}
                        />
                      ))}
                    </StickToBottom.Content>
                    <ScrollController scrollRef={scrollToBottomRef} />
                  </StickToBottom>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background via-background/85 to-transparent" />

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-4">
                    <div className="pointer-events-auto mx-auto flex w-full max-w-2xl flex-col gap-2.5">
                      <FundsReminderChatNotice />
                      {pendingQuestionBlock && (
                        <QuestionPrompt
                          key={pendingQuestionBlock.toolUseId}
                          block={pendingQuestionBlock}
                          onSubmit={handleAnswerQuestion}
                        />
                      )}
                      {renderComposer()}
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-faint" />
                </div>
              )}

              {!loading && turns.length === 0 && historyError && (
                <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
                  <ResourceError
                    error={historyErrorObj}
                    resourceName="对话"
                    onRetry={retryHistory}
                    onBack={startNew}
                    backLabel="开始新对话"
                    autoRedirect={false}
                  />
                </div>
              )}

              <AnimatePresence initial={false}>
                {!loading && turns.length === 0 && !historyError && (
                  <motion.div
                    key="workspace-hero"
                    className="absolute inset-0 z-30 flex"
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
                    transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
                  >
                    <ClawHero
                      composer={renderComposer(composerRef)}
                      onPickSuggestion={(t) => composerRef.current?.prefill(t)}
                      title={cfg.hero.title}
                      subtitle={cfg.hero.subtitle}
                      suggestions={cfg.hero.suggestions}
                      extra={heroExtra}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {showFeatureHubDock && <RightPanelFeatureHub variant="assistant" />}

        {showExpandedRight && (
          <>
            {showResizeHandle && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="拖动调整对话列宽度"
                onPointerDown={startDrag}
                className="relative w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-foreground/30"
              >
                <span className="absolute inset-y-0 -left-1 -right-1" />
              </div>
            )}

            <div
              style={onlyFileArea ? { width: fileColWidth } : undefined}
              className={cn(
                'h-full min-h-0',
                onlyFileArea
                  ? 'shrink-0 border-l border-border'
                  : 'flex-1 overflow-x-auto',
              )}
            >
              <div
                style={onlyFileArea ? undefined : { minWidth: RIGHT_MIN_PX }}
                className="h-full"
              >
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-faint">
                      <Loader2 className="size-5 animate-spin" />
                    </div>
                  }
                >
                  <SearchRightPanel
                    variant="assistant"
                    fileColWidth={fileColWidth}
                    onFileColWidthChange={setFileColWidth}
                  />
                </Suspense>
              </div>
            </div>
          </>
        )}
      </div>
  );
}
