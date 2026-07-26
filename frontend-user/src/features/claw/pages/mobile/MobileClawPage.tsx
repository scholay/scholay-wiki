import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, PanelLeft, SquarePen } from 'lucide-react';
import { StickToBottom } from 'use-stick-to-bottom';
import { AgentDisplacedBanner } from '@/shared/components/AgentDisplacedBanner';
import { ResourceError } from '@/shared/components/ResourceError';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent } from '@/shared/ui/sheet';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useHeightVar } from '@/shared/hooks';
import { useUserModels, modelSupportsVision } from '@/shared/api/models';
import { ModelSelector } from '@/shared/components/chat/ModelSelector';
import { QuestionPrompt, StallNotice, findPendingQuestionBlock } from '@/shared/components/chat';
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

interface MobileWorkspaceProps {
  /** 初始会话意图(来自 URL /m/claw/:sessionId):null=新对话 | string=激活该会话。 */
  seed: string | null;
  /** 懒新建落地真 sessionId 时回调 → 外壳回填 URL(/m/claw/:newId)。 */
  onSessionCreated: (sessionId: string) => void;
  /** 抽屉点某会话 → 导航到它的会话路由。 */
  onSelectSession: (sessionId: string) => void;
  /** 新对话(回到 /m/claw)。 */
  onNewConversation: () => void;
  /** 深链到不存在 / 不属于我的会话(history 404)→ 回新对话。 */
  onNotFound: () => void;
}

/**
 * 智能助手移动版外壳(/m/claw、/m/claw/:sessionId)—— 会话路由化 2026-07:
 *   - 进入 /m/claw(无 id)= **永远全新对话**(不再自动续接上次);
 *   - 切某会话 = navigate('/m/claw/:sid');首条消息落地新 id 后回填 URL(不 remount,不打断流式);
 *   - 深链到不存在/不属于我的会话 → 回新对话(goal 4)。
 * claw-only:移动端不承载 boltslides/sci_draw,故无需 feature 解析,直接以 seed 挂 claw workspace。
 * `ownRef` 认「自己刚建的 id」:URL 回填成 /m/claw/:newId 时是 echo → 不 remount。
 */
export function MobileClawPage() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const ownRef = useRef<string | null>(urlSessionId ?? null);
  const [remountKey, setRemountKey] = useState(0);

  // URL sessionId 变化 → 若不是「自己刚建的 id」(echo)也不是初次挂载,则 remount 内层(换会话/新对话)。
  useEffect(() => {
    const target = urlSessionId ?? null;
    if (target === ownRef.current) return; // echo / 未变 / 初次挂载 → 不 remount
    ownRef.current = target;
    setRemountKey((k) => k + 1);
  }, [urlSessionId]);

  const handleSessionCreated = useCallback(
    (id: string) => {
      ownRef.current = id; // 认领:随后 URL 变 /m/claw/:id 时 effect 认出是 echo,不 remount
      navigate(`/m/claw/${id}`, { replace: true });
    },
    [navigate],
  );
  const selectSession = useCallback((sid: string) => navigate(`/m/claw/${sid}`), [navigate]);
  const gotoNew = useCallback(() => navigate('/m/claw'), [navigate]);
  const handleNotFound = useCallback(() => navigate('/m/claw', { replace: true }), [navigate]);

  return (
    <MobileClawWorkspace
      key={remountKey}
      seed={urlSessionId ?? null}
      onSessionCreated={handleSessionCreated}
      onSelectSession={selectSession}
      onNewConversation={gotoNew}
      onNotFound={handleNotFound}
    />
  );
}

/**
 * 会话工作区内层 —— 与桌面 ClawPage 共用 useClawConversation 状态机和全部聊天组件。
 *
 * 交互对齐主流聊天助手(ChatGPT / DeepSeek / Claude):**不设独立顶栏**,改成对话区上方两枚
 * 悬浮按钮 —— 左「历史对话」(开左侧抽屉:新对话 + 按日期分组的历史 + 重命名/删除)、右「新对话」;
 * 连接状态做成中间的自隐小徽章。成果预览仍走底部整屏 Sheet。
 */
function MobileClawWorkspace({
  seed,
  onSessionCreated,
  onSelectSession,
  onNewConversation,
  onNotFound,
}: MobileWorkspaceProps) {
  const openAuth = useAuthDialog((s) => s.openDialog);
  const conv = useClawConversation({ initialSessionId: seed, onSessionCreated });
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
    stalled,
    stopping,
    loading,
    historyError,
    historyErrorObj,
    retryHistory,
    composerDisabled,
  } = conv;

  // 深链到不存在 / 不属于我的会话 → 后端 history 返回 404(4404「会话不存在或不属于你」)→ 回新对话。
  // 只认 404:5xx / 网络瞬时失败仍走下方 ResourceError 的重试,不误跳(和桌面 resolve 兜底同语义)。
  useEffect(() => {
    if ((historyErrorObj as { status?: number } | null | undefined)?.status === 404) onNotFound();
  }, [historyErrorObj, onNotFound]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // 交互提问(AskUserQuestion,方案 B):待作答问题浮到输入框上方由 QuestionPrompt 分步承接,答案
  // 作为普通 user 消息回传(与桌面同款,复用 handleSubmit)。
  const pendingQuestionBlock = findPendingQuestionBlock(turns);
  const handleAnswerQuestion = useCallback(
    (text: string) => {
      void conv.handleSubmit(text, [], []);
    },
    [conv.handleSubmit],
  );
  // 会话流里认领「本轮用了你的技能 X」用(guideName → 我启用的市场技能);引用稳定不破 MessageTurn memo。
  const userSkillsByGuide = useUserSkillsByGuide();
  // P2 模型目录:移动端选择器(与桌面 ClawPage 同一套服务端权威语义,trigger 在移动端只显图标)。
  const navigate = useNavigate();
  const { data: userModels } = useUserModels('claw');
  const qc = useQueryClient();
  const [newConvPref, setNewConvPref] = useState<string | null>(() => getNewConversationModel() ?? null);
  const selectorCurrent =
    conv.socket.sessionModel ?? (!conv.sessionId && newConvPref ? { modelId: newConvPref, isDefault: false } : null);
  const modelSlot =
    userModels && userModels.length > 0 ? (
      <ModelSelector
        models={userModels}
        current={selectorCurrent}
        currentTokens={conv.contextQuery.data?.totalTokens ?? 0}
        onUpgrade={() => navigate('/pricing')}
        onSelect={(id) => {
          if (conv.sessionId) {
            conv.socket.send({ type: 'set_runtime_config', providerId: null, modelId: id ?? '', useDefault: id === null });
            // 切模型即刷新水位分母(异构窗口;审计 P2-4)。
            qc.invalidateQueries({ queryKey: ['claw', 'context', conv.sessionId] });
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

      {/* 轮内无进展软提示(W5 P0-C,与桌面 ConversationWorkspace 同点位):停止本轮 / 继续等待。 */}
      {stalled && busy && (
        <div className="px-3 pt-2">
          <StallNotice onStop={conv.handleStop} onDismiss={conv.dismissStall} />
        </div>
      )}

      <div ref={chatAreaRef} className="relative min-h-0 flex-1">
        {/* 悬浮控制条(无独立顶栏):左=历史抽屉,中=连接状态(自隐),右=新对话。
            顶部渐隐让图标在滚动内容上也清晰;容器 pointer-events-none、仅按钮可点,不挡滚动。 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-sticky flex items-center justify-between gap-2 bg-gradient-to-b from-background via-background/85 to-transparent px-2 pb-5 pt-2">
          <button
            type="button"
            aria-label="历史对话"
            onClick={() => setDrawerOpen(true)}
            className="pointer-events-auto flex size-9 items-center justify-center rounded-pill text-foreground active:bg-surface-2"
          >
            <PanelLeft className="size-5" />
          </button>
          {/* 连接状态徽章已移除:连接/重连过程对用户无意义,不展示。 */}
          <button
            type="button"
            aria-label="新对话"
            onClick={onNewConversation}
            disabled={sessionId === null}
            className="pointer-events-auto flex size-9 items-center justify-center rounded-pill text-foreground active:bg-surface-2 disabled:opacity-40"
          >
            {/* 摘掉 busy 门控(线上卡死修复):这是移动端唯一的新对话入口,busy 卡死时不能把
                用户唯一逃生口也锁死;回答会在后台(hub grace)继续,开新对话与之零冲突。 */}
            <SquarePen className="size-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-faint" />
          </div>
        ) : historyError ? (
          // 历史读失败(后端读 agent 历史 10s 超时 / 5xx → 502)给「加载失败 + 重试」
          // 而非把瞬时失败伪装成空白态(与桌面 ClawPage 同构)。404 已在上方 effect 自动回新对话。
          <div className="flex h-full items-center justify-center p-6 pt-14">
            <ResourceError
              error={historyErrorObj}
              resourceName="对话"
              onRetry={retryHistory}
              onBack={onNewConversation}
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
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={conv.loadEarlier}
                    className="px-3.5 font-normal text-muted-foreground active:bg-surface-2/70"
                  >
                    {hiddenCount > 0
                      ? `加载更早的 ${hiddenCount} 轮对话`
                      : '加载更早的对话'}
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
                  onPreview={setPreviewArtifact}
                  onResendBlocked={conv.resendBlocked}
                  onDismissBlocked={conv.dismissBlocked}
                  // 失败轮「重试」只对最后一轮成立(与桌面同构;hook 内守卫 !busy)。
                  onRetryTurn={i === visibleTurns.length - 1 ? conv.handleRetryTurn : undefined}
                />
              ))}
            </StickToBottom.Content>
            <ScrollController scrollRef={scrollToBottomRef} />
          </StickToBottom>
        )}
      </div>

      <div className="shrink-0 bg-background px-3 pb-3 pt-1.5">
        {pendingQuestionBlock && (
          <QuestionPrompt
            key={pendingQuestionBlock.toolUseId}
            block={pendingQuestionBlock}
            onSubmit={handleAnswerQuestion}
          />
        )}
        <ChatComposer
          ref={composerRef}
          disabled={composerDisabled}
          // 视觉门控:非视觉模型禁图片上传(对齐桌面 ConversationWorkspace;审计 P2-1 移动端漏传补齐)。
          acceptImages={modelSupportsVision(userModels, selectorCurrent)}
          disabledPlaceholder={
            // 诚实占位:连接没就绪时如实说,别把连接故障伪装成「AI 还在回答」(与桌面同构)。
            !busy && sessionId !== null && socket.state !== 'open' ? '连接中断,正在重连…' : undefined
          }
          busy={busy}
          stopping={stopping}
          context={contextQuery.data}
          onStop={conv.handleStop}
          onSubmit={conv.handleSubmit}
          sessionId={sessionId}
          onSessionEnsured={conv.adoptSession}
          modelSlot={modelSlot}
          onNewConversation={onNewConversation}
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
          onSelectSession(sid);
          setDrawerOpen(false);
        }}
        onNewConversation={() => {
          onNewConversation();
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
