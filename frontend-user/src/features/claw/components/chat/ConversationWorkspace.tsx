import {
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
import { History, Loader2, MessageSquarePlus, PanelRight, PanelRightDashed } from 'lucide-react';
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
import { QuestionPrompt, StallNotice, findPendingQuestionBlock } from '@/shared/components/chat';
import { useUserSkillsByGuide } from '@/shared/api/skills';
import { ChatComposer, type ChatComposerHandle } from './ChatComposer';
import { MessageTurn } from './MessageTurn';
import { ClawHero, type HeroSuggestion } from './ClawHero';
import { ScrollController } from './ScrollController';
import { type ClawArtifact, type ArtifactBasePath } from '../../api/artifacts';
import { ClawArtifactPanel } from '../preview/ClawArtifactPanel';
import { artifactToggleAvailable, resolveArtifactSurface } from '../../lib/artifact-surface';
import type { useClawConversation } from '../../hooks/useClawConversation';

/** claw / boltslides 两个对话 hook 返回同构;用 claw 的作为公共类型。 */
export type ConversationApi = ReturnType<typeof useClawConversation>;

/** 一个模式(对话 / 制作PPT)的展示装配。feature-specific 的都收在这里。 */
export interface WorkspaceConfig {
  /** header 标题 + 图标。 */
  title: string;
  titleIcon: ComponentType<{ className?: string }>;
  /** 模型能力绑定 key(useUserModels)+「新对话默认模型」偏好(各 feature 独立)。 */
  modelFeature: 'claw' | 'boltslides' | 'sci_draw' | 'stat_lab';
  newConvModel: { get: () => string | undefined; set: (id: string | null) => void };
  /** 产物下载/预览端点前缀。 */
  artifactBasePath: ArtifactBasePath;
  /** 空态 hero 文案。 */
  hero: { title: string; subtitle: string; suggestions: HeroSuggestion[] };
  /** 右侧扩展区空态提示。 */
  emptyArtifactsHint?: string;
  /** 科研绘图:图片类产物**内联展示**在对话流里(不占用右侧文档扩展区、不出文件卡)。 */
  figuresInline?: boolean;
  /** 产物即成果的 feature(如制作PPT):新产出后**自动打开**右侧预览面板 + 生成中轮询产物。 */
  autoOpenLatestArtifact?: boolean;
  /** composer 附件/引用/技能入口开关(默认 true;制作PPT 纯文本 → false)+ 占位文案。 */
  enableAttachments?: boolean;
  /** 「引用文献」入口(默认 true)。与上传分开:数据分析收数据但不引论文,且无 /reference 端点。 */
  enableLibraryReference?: boolean;
  composerPlaceholder?: string;
  /** ResizablePanelGroup 布局持久化 key(避免两模式互相污染栏宽)。 */
  layoutKey: string;
  /** sidebar rail(收起态顶栏 chip)段落 id/文案。 */
  railSectionId: string;
  railLabel: string;
}

/**
 * 会话工作区(桌面)—— 智能助手 / 制作PPT 共用的整页装配:侧边栏 + 顶栏(含模式选项卡)+
 * 对话/预览可拖拽分栏 + composer。会话状态机(conv)由外层按模式各自的 hook 提供并注入。
 * 从原 ClawPage 抽出、参数化,claw 行为保持不变(默认 cfg = claw)。
 */
export function ConversationWorkspace({
  conv,
  cfg,
  sidebar,
  heroExtra,
  onNewConversation,
  onExportArtifactDeck,
  exportingFormat = null,
}: {
  conv: ConversationApi;
  cfg: WorkspaceConfig;
  /** 由外层用当前模式的 hook 装配好的侧边栏(统一会话历史)。 */
  sidebar: ReactNode;
  /** 空态 hero 里 composer 下方的附加内容(模板卡扑克牌扇 / 换回对话)。 */
  heroExtra?: ReactNode;
  /** 顶栏「新对话」+ 错误态「开始新对话」的动作 —— **回到默认聊天空态**(claw,露出模板卡可重选);
   *  由 ClawPage 传入(= 切回 claw feature 的空白新对话)。缺省回落 conv.handleNewConversation(当前 feature 内清空)。 */
  onNewConversation?: () => void;
  /** 制作PPT:把 html 演示稿产物导出为 PDF/PPTX(外层 PptModeWorkspace 用 boltslides 导出 mutation 提供)。 */
  onExportArtifactDeck?: (a: ClawArtifact, format: 'pptx' | 'pptx-native' | 'pdf') => void;
  exportingFormat?: 'pptx' | 'pptx-native' | 'pdf' | null;
}) {
  const openAuth = useAuthDialog((s) => s.openDialog);

  // 侧边栏收起态的冗余入口(顶栏 rail chip)。
  useRegisterSidebarRail([
    { id: cfg.railSectionId, label: cfg.railLabel, icon: History, sectionId: cfg.railSectionId },
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

  // 交互提问(AskUserQuestion,方案 B):待作答问题浮到输入框上方由 QuestionPrompt 分步承接,
  // 答案作为**普通 user 消息**回传(复用 handleSubmit,无附件/引用)。答完自然生成新一轮 →
  // pendingQuestionBlock 翻 null,面板自动消失。
  const pendingQuestionBlock = findPendingQuestionBlock(turns);
  const handleAnswerQuestion = useCallback(
    (text: string) => {
      void conv.handleSubmit(text, [], []);
    },
    [conv.handleSubmit],
  );

  const TitleIcon = cfg.titleIcon;
  // 「新对话」= 回到默认聊天空态(可重选模板)。缺省回落到当前 feature 内清空。
  const startNew = onNewConversation ?? conv.handleNewConversation;
  // 只有「已经在默认 claw 空白态」才禁用「新对话」(此时点它无意义);在制作PPT 里(或有活跃会话)都可点 → 回默认。
  const atDefaultBlank = cfg.modelFeature === 'claw' && sessionId === null;

  const [previewArtifact, setPreviewArtifact] = useState<ClawArtifact | null>(null);
  const isNarrow = useMediaQuery('(max-width: 1024px)');
  /**
   * 右侧扩展区的开合 —— **三态偏好**,不是布尔。
   *   null        = 用户还没表态 → 跟随默认策略「有产物就展开」
   *   true/false  = 用户显式点过按钮 → 尊重用户,不再被数据翻转
   *
   * 为什么不能简单用 boolean(2026-07-27 改造时的坑):
   *   旧实现是【数据驱动】—— 面板只在 hasArtifacts 时存在,rightCollapsed 只负责「藏起来」。
   *   现在顶栏加了手动开关、且空态也要能打开,面板变成【用户意图驱动】;
   *   若直接把默认值设成 false,就会丢掉「claw 生成文件时面板自动露出」这个既有行为。
   *   三态把「没表态」和「明确关掉」区分开,两个行为才能同时成立。
   */
  const [rightOpenPref, setRightOpenPref] = useState<boolean | null>(null);
  // 换会话 → 清空表态,回到默认策略。
  // ⚠️ 但「懒新建落地」(sessionId: null → 真 id,首条消息发出时)**不是换会话** —— 页层用 ownRef
  //    刻意不 remount,这里若也当成换会话重置,用户刚在空态点开的扩展区会在发第一条消息的瞬间自己关掉
  //    (正是本次改动要支持的「空态也能打开」场景)。故只在两个**真实会话之间**切换时重置。
  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;
    if (prev === sessionId || prev === null) return;
    setRightOpenPref(null);
  }, [sessionId]);

  // 科研绘图:图片类产物**内联展示**在对话流里(TurnFigures),不占用右侧文档扩展区、不出文件卡。
  const inlineFigures = !!cfg.figuresInline;
  // 制作PPT:产物就是这次的成果,产出后**自动打开**右侧预览面板(与科研绘图内联出图对等的"即时露出")。
  const autoOpenLatest = !!cfg.autoOpenLatestArtifact && !inlineFigures;
  // 产物即成果的 feature(科研绘图内联 / 制作PPT 面板)生成中轮询产物,尽快露出;普通对话(claw)不轮询。
  const revealWhileBusy = inlineFigures || autoOpenLatest;

  // 减小"等整轮回答完才出产物"的延迟:每 2.5s 轮询一次产物 → agent 写完文件后几秒内就被收割 + 露出
  // (而非等 message_complete 整轮结束)。轮询只在 busy 期间,回答完即停。
  // (Write 工具调用中、文件写完前看不到内容,是 Write 的固有行为,砍不掉;真·逐节点流式是更大改造。)
  const qc = useQueryClient();
  useEffect(() => {
    if (!revealWhileBusy || !busy) return;
    const iv = setInterval(() => {
      qc.invalidateQueries({ queryKey: [cfg.modelFeature, 'artifacts'] });
    }, 2500);
    return () => clearInterval(iv);
  }, [busy, revealWhileBusy, cfg.modelFeature, qc]);

  // 制作PPT:新产出的 deck → 右侧自动打开预览(跳过进老会话时已有的,只自动开本次会话新产出的)。
  const autoOpenSeenRef = useRef<number | null>(null);
  const autoOpenInitRef = useRef(false);
  useEffect(() => { autoOpenInitRef.current = false; }, [sessionId]);
  useEffect(() => {
    if (!autoOpenLatest) return;
    const withId = (sessionArtifacts ?? []).filter((a) => !!a.id);
    const latest = withId[withId.length - 1]; // ListBySession 按 created_at 升序 → 末尾最新
    if (!autoOpenInitRef.current) {
      autoOpenInitRef.current = true;
      autoOpenSeenRef.current = latest?.id ?? null; // 记住初始最新,不自动开(避免进老会话就弹面板)
      return;
    }
    if (latest?.id && latest.id !== autoOpenSeenRef.current) {
      autoOpenSeenRef.current = latest.id;
      setRightOpenPref(true);
      setPreviewArtifact(latest);
    }
  }, [sessionArtifacts, autoOpenLatest]);
  const closePreview = useCallback(() => setPreviewArtifact(null), []);
  const collapseRight = useCallback(() => { setRightOpenPref(false); setPreviewArtifact(null); }, []);
  /**
   * 点某个产物的「预览」—— 必须同时把扩展区**强制打开**。
   * 否则:用户先手动收起扩展区(rightOpenPref=false),再点对话流里的文件卡预览,
   * 桌面端 showRightPanel 恒 false、窄屏 Sheet 又要求 isNarrow → previewArtifact 设了但没人渲染,
   * 表现为「点了预览什么都没发生」的死点击。
   */
  const openPreview = useCallback((a: ClawArtifact) => {
    setPreviewArtifact(a);
    setRightOpenPref(true);
  }, []);
  const userSkillsByGuide = useUserSkillsByGuide();

  const artifactCount = sessionArtifacts?.length ?? 0;
  const hasArtifacts = artifactCount > 0 || !!previewArtifact;
  // 内联出图(科研绘图):图在对话流里,永不启用扩展区 —— 连顶栏开关也不给。
  // ⚠️ 这里**不再**把 isNarrow 算进来(2026-08-07):窄屏没有的是「分栏」,不是「扩展区」。
  //    旧写法 `!inlineFigures && !isNarrow` 让 ≤1024 连开关都不渲染 ⇒ 窄屏用户完全看不到产物。
  const rightPanelAvailable = artifactToggleAvailable({ inlineFigures });
  // 用户没表态时,沿用旧的「有产物就展开」;表过态就听用户的(空态也能手动打开)。
  //
  // 🔴 窄屏的默认值刻意与桌面不同:桌面 `hasArtifacts` 默认展开是「分栏自动让出 34% 宽度」,
  //    窄屏同样的默认值会变成「一进有产物的会话就被整屏 Sheet 糊脸、还挡住输入框」。
  //    所以窄屏未表态 = 关,靠顶栏那颗带计数的按钮主动打开。
  const rightOpen = rightOpenPref ?? (isNarrow ? false : hasArtifacts);
  const surface = resolveArtifactSurface({
    inlineFigures,
    isNarrow,
    open: rightOpen,
    hasPreview: !!previewArtifact,
  });
  const showRightPanel = surface === 'panel';
  const showRightSheet = surface === 'sheet';
  // 直接对当前生效值取反 —— 用 setState(prev => …) 反而要把默认策略再算一遍(prev 可能是 null)。
  // 关闭方向走 collapseRight —— 它同时清掉 previewArtifact。
  // 只翻开合而留着 previewArtifact 会有两个后果:重新展开时直接落在预览页而非列表页;
  // 以及窗口缩到 ≤1024 时,Sheet 会突然弹出一个用户已经关掉的产物。
  const toggleRight = useCallback(() => {
    if (rightOpen) collapseRight();
    else setRightOpenPref(true);
  }, [rightOpen, collapseRight]);

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
            // 切模型即刷新水位分母:异构窗口下不同模型 context_window 不同,否则百分比停在旧窗口(审计 P2-4)。
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
  // disabled 占位按真实原因区分:busy 才是「正在等待 AI 回答」;连接没就绪时如实说连接状态,
  // 不再把连接故障伪装成"AI 还在回答"(线上用户误判「对话完成后卡住」的成因之一)。
  const disabledPlaceholder = busy
    ? undefined
    : sessionId !== null && socket.state !== 'open'
      ? '连接中断,正在重连…'
      : undefined;
  // 额度耗尽被拦的未发送轮 → 输入框上方耗尽条(自动重发);会话流里只保留用户气泡。
  const hasBlocked = turns.some((t) => t.blocked);
  const renderComposer = (ref?: Ref<ChatComposerHandle>) => (
    <ChatComposer
      ref={ref}
      disabled={composerDisabled}
      disabledPlaceholder={disabledPlaceholder}
      busy={busy}
      stopping={stopping}
      context={contextQuery.data}
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
      // 上传端点随 feature 走(artifactBasePath 同前缀)—— 写死 claw 会把文件传到别的 feature 的会话里。
      uploadBasePath={cfg.artifactBasePath ?? '/user/claw'}
      enableLibraryReference={cfg.enableLibraryReference ?? true}
      placeholder={cfg.composerPlaceholder}
      quotaBlocked={hasBlocked ? { onResend: conv.resendBlocked, onDismiss: conv.dismissBlocked } : null}
      quotaWarn={turns.length > 0}
    />
  );

  return (
    <SidebarLayout
      /* 智能助手(含制作PPT模式)隐藏左下的浮动展开按钮(2026-08-02 设计走查拍板,
         与文献搜索同一先例):对话页左下是输入区/工具链上下文,悬浮胶囊在这里打架。
         侧栏仍可从顶栏 rail chip 展开,不是死路。 */
      hideExpandButton
      sidebar={sidebar}
    >
      <div className="flex h-full flex-col bg-background">
        <header className="flex h-14 items-center gap-3 border-b border-border px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-8 bg-foreground">
              <TitleIcon className="h-3.5 w-3.5 text-on-dark" />
            </div>
            <h1 className="font-serif text-16 font-medium text-foreground">{cfg.title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* 两颗按钮都【只用原子的 size 档、不写 className 覆写】——
                之前是 size="sm"(h-7 px-2.5) + className="h-8" 的混搭:高度被覆写成 32、
                内边距却还是 sm 档的 10px,而隔壁扩展区按钮没有那个覆写 → 两颗差 4px 高。
                用 size="default"(h-8 px-3)让原子自己说了算,两颗自然一致。 */}
            <Button
              variant="outline"
              onClick={startNew}
              disabled={atDefaultBlank}
              title={atDefaultBlank ? '已是新对话准备态' : '开始新对话(当前回答会在后台继续)'}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              新对话
            </Button>
            {/* 扩展区开关 —— 顶栏常驻入口。
                替代了原先「收起后才出现、贴在对话区右缘中部」的竖条按钮:那个按钮
                ① 只在已有产物且已收起时才存在(空态根本没有打开的路),
                ② 位置在页面中部、不在任何工具栏里,不容易被发现。
                放在「新对话」右侧后,开合两个方向都从同一处操作,空态也能主动打开。 */}
            {rightPanelAvailable && (
              <Button
                variant="outline"
                onClick={toggleRight}
                aria-pressed={rightOpen}
                title={rightOpen ? '收起扩展区' : '展开扩展区'}
              >
                {/* 实线=已展开 / 虚线=未展开 —— 线型本身就表达开关态,不必再加箭头。
                    为什么不用 PanelRightOpen/Close:那两个带箭头,读起来像「翻页」而不像侧边栏。
                    为什么关闭态不用纯 PanelRight:它是左侧栏展开按钮 PanelLeft 的镜像,
                    两颗控件图形会雷同;虚线版在方向与线型上都拉开了距离。 */}
                {rightOpen ? (
                  <PanelRight className="h-3.5 w-3.5" />
                ) : (
                  <PanelRightDashed className="h-3.5 w-3.5" />
                )}
                扩展区
                {artifactCount > 0 && (
                  <span className="text-faint tabular-nums">{artifactCount}</span>
                )}
              </Button>
            )}
          </div>
        </header>

        {socket.state === 'displaced' && (
          <AgentDisplacedBanner
            reason={socket.displacedReason}
            onTakeOver={socket.takeOver}
            className="px-6"
          />
        )}

        {/* 重连预算耗尽(error 终态):此前是「静默灰输入框、页面内零出口」的死路 —— 现在给可见
            横幅 + 手动立即重连(useAgentSocket 同时在后台每 ~20s 自动重试,连上即消失)。 */}
        {socket.state === 'error' && (
          <div className="flex items-center gap-3 border-b border-border bg-warning-soft px-6 py-2">
            <span className="text-12 text-subtle">与服务器的连接已断开,正在自动重连…</span>
            <Button variant="outline" size="sm" className="h-7" onClick={socket.takeOver}>
              立即重连
            </Button>
          </div>
        )}

        {/* 轮内无进展软提示(W5 P0-C):busy 且 90s 无新内容帧 —— 给「停止本轮 / 继续等待」逃生口。
            与上方连接横幅同一区域;不自动杀轮(那是 backend 轮级硬超时的职责)。 */}
        {stalled && busy && (
          <div className="border-b border-border px-6 py-2">
            <StallNotice onStop={conv.handleStop} onDismiss={conv.dismissStall} />
          </div>
        )}

        <ResizablePanelGroup direction="horizontal" autoSaveId={`${cfg.layoutKey}-preview-h`} className="flex min-h-0 flex-1">
          <ResizablePanel id={`${cfg.layoutKey}-chat`} order={1} minSize={36} className="min-w-0">
            <div className="relative h-full min-h-0">
              {turns.length > 0 && (
                <div ref={chatAreaRef} className="absolute inset-0">
                  <StickToBottom className="h-full" resize="smooth" initial="smooth">
                    <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 pt-6 pb-[max(calc(var(--chat-area-h,100dvh)*0.3),140px)]">
                      {(hiddenCount > 0 || historyHasMore) && (
                        <div className="flex justify-center">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={conv.loadEarlier}
                            className="px-3.5 font-normal text-muted-foreground hover:text-foreground"
                          >
                            {hiddenCount > 0 ? `加载更早的 ${hiddenCount} 轮对话` : '加载更早的对话'}
                          </Button>
                        </div>
                      )}
                      {visibleTurns.map((t, i) => (
                        <MessageTurn
                          key={t.id}
                          turn={t}
                          artifacts={sessionArtifacts}
                          sessionId={sessionId}
                          userSkillsByGuide={userSkillsByGuide}
                          onPreview={openPreview}
                          // 失败轮「重试」只对**最后一轮**成立(hook 内还守卫 !busy;
                          // 可重试 errorCode 白名单由 MessageTurn 判)。
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

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-raised h-28 bg-gradient-to-t from-background via-background/85 to-transparent" />

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-sticky px-6 pb-4">
                    <div className="pointer-events-auto mx-auto w-full max-w-2xl">
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

              {/* 无 z-index:下面两层(错误态 / hero)都与对话区(turns.length>0)互斥渲染,不需要压过任何东西。
                  原先写的 z-nav(30)会整片盖住侧栏展开按钮,导致智能助手页 hover/点击全失效 ——
                  按钮现已抬到 z-chrome(35) 从根上解决,这里顺手把多余的层级也清掉,少一处将来打架的地方。 */}
              {!loading && turns.length === 0 && historyError && (
                <div className="absolute inset-0 flex items-center justify-center p-6">
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
                    // 无 z-index,理由同上:hero 只在 turns.length===0 时渲染,与对话区互斥
                    className="absolute inset-0 flex"
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
                    transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
                  >
                    <ClawHero
                      composer={<div className="w-full">{renderComposer(composerRef)}</div>}
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
          </ResizablePanel>
          {showRightPanel && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id={`${cfg.layoutKey}-artifacts`} order={2} defaultSize={34} minSize={24} className="min-w-0">
                <ClawArtifactPanel
                  sessionId={sessionId ?? ''}
                  artifacts={sessionArtifacts ?? []}
                  previewArtifact={previewArtifact}
                  onPreview={openPreview}
                  onClosePreview={closePreview}
                  basePath={cfg.artifactBasePath}
                  onExportDeck={onExportArtifactDeck}
                  exportingFormat={exportingFormat}
                  emptyHint={cfg.emptyArtifactsHint}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>

        {/* 窄屏(≤1024)的扩展区 —— 桌面分栏放不下,改成整屏 Sheet。
            🔴 内容是**同一个 `ClawArtifactPanel`**,不是另造的预览壳:
            旧实现这里只挂 `ClawArtifactPreview`,于是窄屏只有「点某个文件卡 → 看这一个文件」,
            没有列表、没有入口 —— 用户看不到会话里其它产物。复用面板后列表态/预览态/
            「← 返回列表」/ 空态全部与桌面同构,加第五个 feature 时也不会漏改这一份。 */}
        <Sheet
          open={showRightSheet}
          onOpenChange={(o) => {
            if (!o) collapseRight(); // 同时清 previewArtifact,否则关掉后 surface 仍算 sheet → 关不掉
          }}
        >
          <SheetContent className="w-full p-0 sm:max-w-xl">
            <ClawArtifactPanel
              sessionId={sessionId ?? ''}
              artifacts={sessionArtifacts ?? []}
              previewArtifact={previewArtifact}
              onPreview={openPreview}
              onClosePreview={closePreview}
              basePath={cfg.artifactBasePath}
              onExportDeck={onExportArtifactDeck}
              exportingFormat={exportingFormat}
              emptyHint={cfg.emptyArtifactsHint}
            />
          </SheetContent>
        </Sheet>
      </div>
    </SidebarLayout>
  );
}
