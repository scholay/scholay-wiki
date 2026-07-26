import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { AgentDisplacedBanner } from '@/shared/components/AgentDisplacedBanner';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePendingAction } from '@/stores/pending-action.store';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';
import {
  notifySessionChanged,
  useSessionBroadcast,
} from '@/shared/lib/agent-session-broadcast';
import { stripAgentBridgePrefix } from '@/shared/lib/agent-prefix';
import { trackEvent } from '@/shared/lib/track';
import { useHeightVar } from '@/shared/hooks';
import { modelSupportsVision, useUserModels } from '@/shared/api/models';
import { ModelSelector } from '@/shared/components/chat/ModelSelector';
import { Upload } from 'lucide-react';
import {
  AttachmentChipList,
  ComposerAttachmentRow,
  ComposerPlusMenu,
  LibraryReferencePicker,
  QuestionPrompt,
  ReferenceChipList,
  findPendingQuestionBlock,
  type ReferenceSelection,
} from '@/shared/components/chat';
import { AttachmentLightbox } from '@/shared/components/chat/AttachmentLightbox';
import { useComposerAttachments, ATTACHMENT_ACCEPT } from '@/shared/hooks/useComposerAttachments';
import { useUploadAgentAttachment, useReferenceAgentLibrary } from '@/shared/api/agent-attach';
import { buildReferenceBlock } from '@/shared/lib/agent-references';
import type { ReferenceItemDTO, TurnAttachment, TurnReference } from '@/shared/types/chat';
import {
  useCreateSmartSearchSession,
  useSmartSearchContext,
  useSmartSearchHistory,
  useSmartSearchSessions,
  useSmartSearchSocket,
  smartSearchSessionFileUrl,
  getSmartSearchNewConvModel,
  setSmartSearchNewConvModel,
  markSmartSearchPendingModel,
} from '../../api/smart-search';
import { AssistantTurn } from './AssistantTurn';
import { SmartComposer } from './SmartComposer';
import { SmartSearchHero } from './SmartSearchHero';
import {
  foldMessagesIntoTurns,
  replayHistoryAsTurns,
  type Turn,
} from './types';

/**
 * 智能搜索面板 —— 用户切到 smart tab 时进入,自管 WS 生命周期。
 *
 * 设计要点 (v3 多会话版, 2026-07):
 *   - 从「单会话 + 重置上下文」改为「多会话」(与智能助手 claw 同型):可新开会话、侧边栏会话列表、
 *     每会话独立上下文。activeSessionId 收在 useSmartSearchSessionStore(跨子树:侧边栏在 SearchSidebar、
 *     聊天在本组件、新对话按钮在 SearcherColumn header)。
 *   - 进页面 didInitialSelect 采用 sessions[0](最近活跃);列表空 = 空白新对话态(不预建会话)。
 *   - 「新对话」= setActiveSessionId(null);首条消息时懒建后端会话(createSession)再 adopt。
 *   - 切会话 / 新对话 → activeSessionId 变 → 本组件 effect 清本地 turns + clearMessages,socket 按新 id 重连,
 *     history/context 按新 id 重取(全部带 ?session_id= 防 race)。
 *   - foldMessagesIntoTurns 把 WS 事件流归并成 turns;historyTurns(transcript 回放)拼在前, liveTurns 接后。
 *   - 上下文水位 chip + 自动总结上下文均为 agent 侧 feature 无关能力,沿用。
 *   - 未登录直接显示登录提示。
 */
/** 长会话渲染窗口: 默认只把最近 RENDER_WINDOW 轮渲染进 DOM, "加载更早"每次再多放 RENDER_STEP 轮。
 *  防上万轮一次性进 DOM 把浏览器拖垮(虚拟化的"窗口化"形态, 与 use-stick-to-bottom 零冲突)。 */
const RENDER_WINDOW = 60;
const RENDER_STEP = 60;
/** 历史分页: 初始只从后端拉最近 HISTORY_WINDOW 个用户轮, "加载更早"每次再多拉 HISTORY_STEP。
 *  避免上万轮 transcript 一次性 JSON.parse + 折叠。后端 sliceRecentTurns 按 ?limit= 切。 */
const HISTORY_WINDOW = 100;
const HISTORY_STEP = 100;
/** 未送达看门狗:send 后这么久既无 user_ack 也无任何流帧 → 判定未送达,转「未发送」+ 原文回填输入框。 */
const ACK_TIMEOUT_MS = 10_000;
/** 停止兜底:发出 stop_generation 后这么久没等到真实终帧 → 本地合成完成帧收口本轮(渲染「已暂停」)。
 *  取远大于正常 abort 收尾时长;死连接场景重连后 hub 只回放在途轮,不存在「合成后真终帧才迟到」的错配。 */
const STOP_FALLBACK_MS = 20_000;

/** 历史回放:给图片附件补 previewUrl(指向 /smart-search/session/file 取图代理,cookie 鉴权)。
 *  transcript 里图片只剩 @path,刷新后靠这个显示缩略图 + 点击放大。只处理 type=image 且有 path 未补的。 */
function withHistoryImagePreviews(turns: Turn[], sessionId: string | null): Turn[] {
  if (!sessionId) return turns;
  return turns.map((turn) => {
    if (!turn.userAttachments?.length) return turn;
    return {
      ...turn,
      userAttachments: turn.userAttachments.map((a) =>
        a.type === 'image' && a.path && !a.previewUrl
          ? { ...a, previewUrl: smartSearchSessionFileUrl(sessionId, a.path) }
          : a,
      ),
    };
  });
}

export function SmartSearchPanel() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();

  // 跨 tab 同步: 另一个 tab 新建/切换会话会通过 BroadcastChannel 推一帧, 本 tab 收到
  // 后 invalidate ['smart-search'] 全部 query。
  useSessionBroadcast('smart-search');

  // ── 多会话:activeSessionId 收在 store(跨 SearchSidebar / SearcherColumn / 本组件三处子树)──
  const activeSessionId = useSmartSearchSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSmartSearchSessionStore((s) => s.setActiveSessionId);
  const setStoreBusy = useSmartSearchSessionStore((s) => s.setBusy);
  const resetStore = useSmartSearchSessionStore((s) => s.reset);
  const sessionId = activeSessionId;

  const sessionsQuery = useSmartSearchSessions();
  const createSession = useCreateSmartSearchSession();

  // 首次采用:sessions 列表首次落定且当前无活跃会话 → 采用最近一条(list[0], 后端已按
  // last_accessed_at DESC 排)。只跑一次(didInitialSelectRef),故点「新对话」置 null 后不会被弹回 list[0]。
  const didInitialSelectRef = useRef(false);
  useEffect(() => {
    if (didInitialSelectRef.current) return;
    const list = sessionsQuery.data;
    if (!list) return; // 还没加载完
    didInitialSelectRef.current = true;
    if (activeSessionId === null && list.length > 0) {
      setActiveSessionId(list[0].sessionId);
    }
  }, [sessionsQuery.data, activeSessionId, setActiveSessionId]);

  // 离开 /search(本组件卸载)时复位 store —— 下次进来重新采用最近会话, 不残留陈旧 id。
  useEffect(() => () => resetStore(), [resetStore]);

  // adoptingSessionIdRef: 懒建 / upload-adopt / 引用-adopt 这类「程序化切到刚建好的会话」时,
  // 记下**要采用的那个具体 sessionId**, 让下面的 activeSessionId-change 清理 effect 只在切到
  // **正是这个 id** 时跳过清理(pending turn / 待发消息 / 附件属于它)。
  // 用具体 id 而非单 bool:否则 await 建会话期间用户点了侧边栏别的会话 B, 单 bool 会被那次切换
  // 误消费 → 首条消息丢失或串进 B(评审 #1)。用 id 后, 切到 B(≠ 采用 id)会正常清理丢弃在途消息。
  const adoptingSessionIdRef = useRef<string | null>(null);

  // 历史回放: activeSessionId 落定后拉一次, invalidate 才 refetch。切 session 复位分页窗口。
  const [historyLimit, setHistoryLimit] = useState(HISTORY_WINDOW);
  useEffect(() => {
    setHistoryLimit(HISTORY_WINDOW);
  }, [sessionId]);
  const historyQuery = useSmartSearchHistory(sessionId, historyLimit);
  // 切会话时 keepPreviousData 会短暂返上一个会话的 data(sessionId 不匹配)→ 只在匹配当前会话时才认。
  const historyDataMatches = historyQuery.data?.sessionId === sessionId;
  const historyHasMore = (historyDataMatches && historyQuery.data?.hasMore) ?? false;

  // 上下文水位: panel 底部 chip 用; 每轮结束 invalidate 强制刷。
  const contextQuery = useSmartSearchContext(sessionId);

  // 量出"对话框可视区"像素高 → 写进 --chat-area-h, 供底部留白按比例计算 (见 StickToBottom.Content)。
  const chatAreaRef = useHeightVar<HTMLDivElement>('chat-area-h');

  // 发送新一轮后立刻滚到底: scrollToBottom 由 StickToBottom 内的 <ScrollController> 注入到这个 ref。
  const scrollToBottomRef = useRef<(() => void) | null>(null);

  // 本轮聊天输入状态。
  // 首挂载时用 URL 的 ?q= 预填(首页输入关键词点「智能搜索」→ 登录 → 跳进来时带着它):
  // 只读一次(lazy init),之后用户敲字 / 发送清空都不再被 URL 覆写;无 q 时为空串。
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState(() => searchParams.get('q')?.trim() ?? '');
  /** 按发送顺序排列的用户提问骨架; 长度 = 本会话生命周期内已发起的轮数 */
  const [pendingTurns, setPendingTurns] = useState<
    {
      id: string;
      userText: string;
      paused?: boolean;
      blocked?: boolean;
      userAttachments?: TurnAttachment[];
      userReferences?: TurnReference[];
    }[]
  >([]);
  /** 用户已点过 stop 但 agent 还没 emit terminal 事件 (busy 仍 true) → 锁住 stop 按钮
      避免重复触发。terminal 事件到达 → busy 自动翻 false → 这里下面 useEffect 重置回 false
      (顺带撤销停止兜底计时器)。 */
  const [stopping, setStopping] = useState(false);
  const stopTimerRef = useRef<number | null>(null);
  const clearStopFallback = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);
  /** 最近一次成功提交的问题原文 —— 命中额度 / 投递失败被拦时用于回填输入框, 便于一键重发。 */
  const lastSubmitTextRef = useRef<string>('');

  // 本次 mount 起的 sessionId 一旦确认, pendingSendRef 里如果还有未发的 user_message
  // 就在 WS open 后立刻发出去(flush effect 在下方 socket 解构后)。clientTurnId 与乐观气泡
  // turnId(pendingSendTurnIdRef)配对:flush 成功后据此挂未送达看门狗;WS 落 error 终态时据此转 blocked。
  const pendingSendRef = useRef<{
    content: string;
    clientTurnId: string;
    attachments?: { type: 'image' | 'file'; name?: string; mimeType?: string; path: string }[];
  } | null>(null);
  const pendingSendTurnIdRef = useRef<string | null>(null);

  // ── 未送达看门狗(幽灵轮闭环,镜像 claw useClawConversation)────────────────────
  // send() 返回 true 只保证写进了本端 socket 缓冲;半死 TCP(合盖唤醒 / 手机切网 / NAT 静默断)
  // 下消息永远到不了后端,该轮永无终帧 → busy 永久卡死输入框和「新对话」按钮(线上事故根因之一)。
  // 后端 hub 现在对每条送达的 user_message 回 user_ack:发出后 10s 内既无 ack 也无任何流帧 →
  // 判定未送达,把该轮转 blocked(复用配额拦截同款机制:busy 排除 blocked → composer 解锁),
  // 原文回填输入框便于直接重发(smart-search 无 claw 的 localStorage 持久化,回填即「保留」)。
  const ackWaitRef = useRef<{ clientTurnId: string; turnId: string; timer: number } | null>(null);
  // 已确认送达的轮(user_ack / 自回声隐式 ack)—— 幽灵轮判定的「送达证明」门(审查修复)。
  const deliveredTurnIdRef = useRef<string | null>(null);
  // 看门狗误报后的恢复配对(审查修复):迟到 ack / 该轮流帧到达 → 解除误标的 blocked。
  const firedAckRef = useRef<{ clientTurnId: string; turnId: string } | null>(null);
  // ref-latest:给 setTimeout 类回调读最新连接态(闭包捕获的 state 会过期)。
  const stateRef = useRef<string>('idle');
  const clearAckWait = useCallback(() => {
    if (ackWaitRef.current !== null) {
      window.clearTimeout(ackWaitRef.current.timer);
      ackWaitRef.current = null;
    }
  }, []);
  const armAckWait = useCallback(
    (clientTurnId: string, turnId: string) => {
      clearAckWait();
      firedAckRef.current = null;
      const timer = window.setTimeout(() => {
        ackWaitRef.current = null;
        firedAckRef.current = { clientTurnId, turnId }; // 保留配对供迟到证据解除误标
        setPendingTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, blocked: true } : t)));
        const text = lastSubmitTextRef.current;
        if (text) setInput((cur) => (cur.trim() ? cur : text));
        toast.error('消息未能送达,已为你保留在输入框,可重新发送');
      }, ACK_TIMEOUT_MS);
      ackWaitRef.current = { clientTurnId, turnId, timer };
    },
    [clearAckWait],
  );

  // 卸载时清掉在途计时器(未送达看门狗 / 停止兜底),防迟到回调对已卸载组件 setState。
  useEffect(
    () => () => {
      if (ackWaitRef.current !== null) window.clearTimeout(ackWaitRef.current.timer);
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    },
    [],
  );

  const {
    state, messages, send, clearMessages, reconnectAttempt, displacedReason, takeOver, resyncUserText,
    peerMessage, busyRejected, quotaExceeded, sessionModel, userAck, resyncIdle, appendLocalFrame,
  } = useSmartSearchSocket(sessionId);
  stateRef.current = state; // ref-latest:stop 兜底计时器读最新连接态

  // 送达证据处理(pong/connected 已不进 messages,messages.length 变化 = 真实进展帧):
  //   看门狗仍在等 → 撤销;及 user_ack 命中时记录「已送达」证明(幽灵轮判定的门)。
  //   看门狗已误报(firedAckRef)→ 迟到的 ack / 该轮流帧到达时解除误标的 blocked。
  // ⚠️ 依赖的是上面解构出的值 —— 该 effect 必须放在 useSmartSearchSocket 解构之后。
  const prevMsgLenRef = useRef(0);
  useEffect(() => {
    const grew = messages.length > prevMsgLenRef.current;
    prevMsgLenRef.current = messages.length;
    if (ackWaitRef.current !== null) {
      if (userAck && userAck.clientTurnId === ackWaitRef.current.clientTurnId) {
        deliveredTurnIdRef.current = ackWaitRef.current.turnId;
      }
      clearAckWait();
      return;
    }
    const fired = firedAckRef.current;
    if (fired === null) return;
    const lastLive = liveTurnsRef.current[liveTurnsRef.current.length - 1];
    const ackHit = !!userAck && userAck.clientTurnId === fired.clientTurnId;
    // 流帧恢复只在误标轮仍是末条 live 轮时生效 —— 防多端场景把别端新轮的帧误认成本轮证据。
    if (ackHit || (grew && lastLive?.id === fired.turnId)) {
      firedAckRef.current = null;
      deliveredTurnIdRef.current = fired.turnId;
      setPendingTurns((prev) => prev.map((t) => (t.id === fired.turnId ? { ...t, blocked: false } : t)));
      toast.success('消息其实已送达,已恢复该轮显示');
    }
  }, [userAck, messages.length, quotaExceeded, busyRejected, clearAckWait]);

  // P2 模型目录:目录数据前置声明(附件块的图片入口按当前模型 vision 启停要用)。
  const { data: userModels } = useUserModels('smart_search');
  // 会话生效模型:有会话以服务端 sessionModel 为准;空白新对话(无 sessionId)落到本地「新对话默认模型」偏好。
  const [newConvPref, setNewConvPref] = useState<string | null>(() => getSmartSearchNewConvModel() ?? null);
  const selectorCurrent =
    sessionModel ?? (!sessionId && newConvPref ? { modelId: newConvPref, isDefault: false } : null);

  // adoptSession:「空白新对话直接上传文件 / 引用文献」时,后端建/取会话并回传 → 采用它,
  // 让随后的消息落到同一会话。记下具体 id 让 change effect 跳过清理(附件/引用已在该会话 cwd)。
  const adoptSession = useCallback(
    (ensuredId: string) => {
      if (ensuredId === activeSessionId) return;
      adoptingSessionIdRef.current = ensuredId;
      // 先上传文件 / 引用文献(而非先打字发送)也走这条会话落地 —— 同样把「新对话默认模型」偏好
      // 登记为该会话的一次性初始模型(必须在 setActiveSessionId 之前,让 socket onOpen 能取到)。
      markSmartSearchPendingModel(ensuredId);
      setActiveSessionId(ensuredId);
      notifySessionChanged('smart-search', ensuredId);
    },
    [activeSessionId, setActiveSessionId],
  );

  // ── 附件 / 引用文献(2026-07 输入框统一;shared 装配层 + smart-search 端点)──────────
  const uploadMutation = useUploadAgentAttachment('/user/smart-search/upload');
  const referenceMutation = useReferenceAgentLibrary('/user/smart-search/reference');
  const [references, setReferences] = useState<ReferenceItemDTO[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const att = useComposerAttachments({
    upload: (file, sid) => uploadMutation.mutateAsync({ file, sessionId: sid }),
    sessionId: sessionId ?? null,
    onSessionEnsured: adoptSession,
    // P2 图片通道:图片入口跟随当前会话模型的视觉能力(诚实 UI)。
    acceptImages: modelSupportsVision(userModels, selectorCurrent),
  });
  const handleReferenceConfirm = useCallback(
    async (sel: ReferenceSelection) => {
      try {
        const res = await referenceMutation.mutateAsync({
          sessionId: sessionId ?? null,
          paperIds: sel.paperIds,
          folderIds: sel.folderIds,
        });
        // 空白新对话下引用文献:后端把资料物化进它 get/建 出的会话并回传 res.sessionId → **必须 adopt**,
        // 否则随后的消息会懒建成另一个新会话、看不到这些 references/(评审 #2/#3;同 claw ChatComposer)。
        if (res.sessionId && res.sessionId !== sessionId) adoptSession(res.sessionId);
        setReferences((prev) => {
          const seen = new Set(prev.map((r) => `${r.kind}:${r.refId}`));
          const add = res.items.filter((r) => !seen.has(`${r.kind}:${r.refId}`));
          return [...prev, ...add];
        });
        setPickerOpen(false);
        if (res.items.length === 0) toast.info('所选文献为空或不可用');
      } catch (err) {
        toast.error((err as Error).message || '引用失败');
      }
    },
    [referenceMutation, sessionId, adoptSession],
  );

  // P2 模型目录:composer 左下角选择器(服务端权威;hub 校验落 pinned_model 后广播回显)。
  // **新对话(无 sessionId)也展示** —— 选择记为「新对话默认模型」偏好,首条消息建会话后经 socket
  // onOpen 一次性下发(markSmartSearchPendingModel);不再要求先有会话才出按钮。
  const modelSlot =
    userModels && userModels.length > 0 ? (
      <ModelSelector
        models={userModels}
        current={selectorCurrent}
        currentTokens={contextQuery.data?.totalTokens ?? 0}
        onUpgrade={() => { window.location.href = '/pricing'; }}
        onSelect={(id) => {
          if (sessionId) {
            send({ type: 'set_runtime_config', providerId: null, modelId: id ?? '', useDefault: id === null });
            // 切模型即刷新水位分母(异构窗口;审计 P2-4)。
            void queryClient.invalidateQueries({ queryKey: ['smart-search', 'context', sessionId] });
          } else {
            setSmartSearchNewConvModel(id);
            setNewConvPref(id);
          }
        }}
      />
    ) : null;

  // ── 附件/引用装配插槽(hero 与底栏两个 SmartComposer 共用同一份)────────────────
  const composerExtras = {
    modelSlot,
    plusSlot: (
      <ComposerPlusMenu
        disabled={att.uploading}
        accept={ATTACHMENT_ACCEPT}
        onFiles={(files) => void att.addFiles(files)}
        onPickLibrary={() => setPickerOpen(true)}
      />
    ),
    topExtras: (
      <>
        <ComposerAttachmentRow
          items={att.items}
          onRemove={att.removeItem}
          onRetry={att.retryItem}
          onEnlarge={(src, alt) => att.setLightbox({ src, alt })}
        />
        {(references.length > 0 || referenceMutation.isPending) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <ReferenceChipList
              references={references.map((r) => ({
                kind: r.kind,
                title: r.title,
                paperCount: r.paperCount,
                hasPdf: r.hasPdf,
              }))}
              onRemove={(i) => setReferences((prev) => prev.filter((_, idx) => idx !== i))}
            />
            {referenceMutation.isPending && (
              <span className="inline-flex items-center gap-1 text-12 text-faint">
                <Loader2 className="size-3 animate-spin" />
                引用中…
              </span>
            )}
          </div>
        )}
      </>
    ),
    canSendEmpty: att.attachments.length > 0 || references.length > 0,
    onPaste: att.handlePaste,
    containerProps: att.dragHandlers,
    overlay: att.dragOver ? (
      <div className="absolute inset-0 z-raised flex items-center justify-center gap-2 rounded-16 border-2 border-dashed border-brand-green bg-surface-card/90 text-12 font-medium text-brand-green">
        <Upload className="size-4" />
        松开上传图片 / 文件
      </div>
    ) : undefined,
  };

  // 历史 turns: 只在 history 数据变化时重建一次。切会话时 keepPreviousData 会短暂返上一个会话的
  // data(sessionId 不匹配)→ historyDataMatches 守卫, 不匹配时按空处理, 避免渲染串会话(A 的历史
  // 出现在 B 的窗口)。同 claw useClawConversation 的 historyData.sessionId===sessionId 守卫。
  const historyTurns = useMemo<Turn[]>(
    () =>
      withHistoryImagePreviews(
        replayHistoryAsTurns(historyDataMatches ? historyQuery.data?.messages : null),
        sessionId,
      ),
    [historyDataMatches, historyQuery.data, sessionId],
  );

  // 断线续流: 重连命中 in-flight 轮时, agent 回放本轮事件并下发 resync_user(本轮用户文本)。
  // 若本地 pendingTurns 已空(= 页面被卸载过, 重挂载丢了局部 turns), 就用它补一条 pending turn,
  // 让回放/续流的 assistant 事件配上用户气泡, 且后续新一轮能与 messages 正确对齐。
  // seededResync 记下"确实补过", 用来判定 history 末尾那条是否就是这同一轮:
  //   - 重挂载: refetchOnMount 拉到的 history **含** in-flight 轮(它的 user 是 transcript 最后一条)
  //     → 必须去掉, 否则和 live 回放的同一轮双份(用户报的"回答中切回来重复")。
  //   - 同 mount 重连: history 是挂载时旧快照, **不含** in-flight 轮 → 不能去, 否则误删旧轮。
  const [seededResync, setSeededResync] = useState(false);
  const seededMidRef = useRef(false);
  useEffect(() => {
    setSeededResync(false);
  }, [sessionId]);
  useEffect(() => {
    if (!resyncUserText || seededResync || seededMidRef.current) return;
    if (pendingTurns.length === 0) {
      setPendingTurns([
        { id: 'resync-inflight', userText: stripAgentBridgePrefix(resyncUserText) },
      ]);
      setSeededResync(true);
      return;
    }
    // 多端补种(审查修复):本端错过 live user_echo、重连撞上该轮回放 —— 末条 live 轮已完成/blocked
    // = 本地没有能接住回放帧的在途轮 → 补一条,否则回放帧无宿主被丢、后续轮整体串位。
    // 不置 seededResync(那面旗驱动「history 末尾去重」,本场景会误删真实旧轮)。
    const lastLive = liveTurnsRef.current[liveTurnsRef.current.length - 1];
    if (!lastLive || lastLive.complete || lastLive.blocked) {
      seededMidRef.current = true;
      setPendingTurns((prev) => [
        ...prev,
        { id: `resync-mid-${prev.length}`, userText: stripAgentBridgePrefix(resyncUserText) },
      ]);
    }
  }, [resyncUserText, pendingTurns.length, seededResync]);

  // 多端实时同步:别的端在同一会话发了一句话(user_echo)→ 本端追加一条用户气泡,随后回答经
  // messages 自然 fold 进这一轮。content 是原文(后端回声不含注入前缀)。
  const lastPeerSeqRef = useRef(0);
  useEffect(() => {
    if (!peerMessage || peerMessage.seq === lastPeerSeqRef.current) return;
    lastPeerSeqRef.current = peerMessage.seq;
    setPendingTurns((prev) => [...prev, { id: `peer-${peerMessage.seq}`, userText: peerMessage.text }]);
  }, [peerMessage]);

  // 回答中锁住竞态兜底:本端发送被 Hub 以 busy 拒(正常输入框已置灰,极少触发)→ 回滚 + 提示。
  const lastBusyRef = useRef(0);
  useEffect(() => {
    if (busyRejected === 0 || busyRejected === lastBusyRef.current) return;
    lastBusyRef.current = busyRejected;
    setPendingTurns((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
    toast.error('正在回答中,请稍候再发');
  }, [busyRejected]);

  // 命中每日额度:backend 在转发给 agent **之前**就拒了这条 user_message(quota_exceeded 帧不进
  // messages),agent 永不对这轮 emit message_complete → 这条 pendingTurn 永远 complete=false →
  // busy 永久为 true、composer 永久禁用、连 stop/reset 都救不了(评审 #1;claw/prism 早已修)。
  // quotaExceeded 单调自增 → 把卡住的本轮标 blocked(busy 排除 blocked → composer 解锁),
  // 并把原文回填输入框便于一键重发(不覆盖用户已敲的新内容)。用户已由全局额度弹窗知道原因。
  const lastQuotaRef = useRef(0);
  useEffect(() => {
    if (quotaExceeded === 0 || quotaExceeded === lastQuotaRef.current) return;
    lastQuotaRef.current = quotaExceeded;
    setPendingTurns((prev) =>
      prev.length > 0
        ? prev.map((t, i) => (i === prev.length - 1 ? { ...t, blocked: true } : t))
        : prev,
    );
    setStopping(false);
    const text = lastSubmitTextRef.current;
    if (text) setInput((cur) => (cur.trim() ? cur : text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotaExceeded]);

  // pendingTurns 增多 (用户发了新一轮 / 续流补轮) → 立刻滚到底, 让新一轮进入视野。
  // effect 在 DOM 提交后跑, 新 turn 已在 DOM 里, scrollToBottom 落到真实新底部。
  const prevPendingLenRef = useRef(pendingTurns.length);
  useEffect(() => {
    if (pendingTurns.length > prevPendingLenRef.current) {
      scrollToBottomRef.current?.();
    }
    prevPendingLenRef.current = pendingTurns.length;
  }, [pendingTurns.length]);

  // 实时 turns: 本次 mount 的 pendingTurns(含续流补的那条)。
  const liveTurns = useMemo<Turn[]>(
    () => foldMessagesIntoTurns(messages, pendingTurns),
    [messages, pendingTurns]
  );

  // ── resync-idle 对账(「终帧永久丢失」闭环,镜像 claw;线上 busy 永久卡死事故的核心修复之一)──
  // (重)建连时 hub 在回放段末尾下发 resync_end{inFlight:false} =「服务端当前无在途轮」的权威信号。
  // 若此刻本地末条 live 轮仍未完成且非 blocked,它的终帧永远不会来了(断连期间轮已结束 /
  // agent·backend 中途死过 / 消息未送达),当场收口:
  //   幽灵轮(无任何流帧,即消息没送达)→ 转 blocked(未发送)+ 原文回填输入框,文字不丢;
  //   中断轮(已流出部分内容)→ 本地合成 error 终帧收口(渲染中断提示,已有内容保留)。
  // 正在等 ack / 懒新建 flush 在途时不动 —— 那条消息可能正被服务端处理,归看门狗管
  // (帧序保证:resync_end 在 attach 时入队,必先于本连接 send 之后的 ack 到达,不会误伤刚发的轮)。
  const liveTurnsRef = useRef<Turn[]>([]);
  liveTurnsRef.current = liveTurns;
  const lastResyncIdleRef = useRef(0);
  useEffect(() => {
    if (resyncIdle === 0 || resyncIdle === lastResyncIdleRef.current) return;
    lastResyncIdleRef.current = resyncIdle;
    if (ackWaitRef.current !== null || pendingSendRef.current !== null) return;
    const live = liveTurnsRef.current;
    const last = live[live.length - 1];
    if (!last || last.complete || last.blocked) return;
    // 幽灵轮判据(审查修复加固):任何已收到的帧都算内容(status 只落 placeholder 也算);
    // 已有送达证明的轮绝不判「未发送」,走中断收口而非诱导重发。
    const hasContent = last.blocks.length > 0 || !!last.thinkingText || !!last.placeholder;
    const delivered = deliveredTurnIdRef.current === last.id;
    const text = lastSubmitTextRef.current;
    if (!hasContent && !delivered && text && text === last.userText) {
      setPendingTurns((prev) => prev.map((t) => (t.id === last.id ? { ...t, blocked: true } : t)));
      setInput((cur) => (cur.trim() ? cur : text));
      return;
    }
    appendLocalFrame({
      type: 'error',
      code: 'connection_interrupted',
      message: '连接中断,本轮回答已中断;若内容不完整,刷新页面可查看已生成的部分',
    });
    // stopping / busy 由既有「busy 翻 false」effect 自动复位。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resyncIdle]);

  // 续流对账: 仅当我们为续流补过 in-flight 轮(seededResync)时, 去掉 history 末尾那条(= 同一轮)。
  const reconciledHistoryTurns = useMemo<Turn[]>(
    () =>
      seededResync && historyTurns.length > 0
        ? historyTurns.slice(0, -1)
        : historyTurns,
    [historyTurns, seededResync]
  );

  // 拼接展示: 历史在前, 实时在后。
  const turns = useMemo<Turn[]>(
    () => [...reconciledHistoryTurns, ...liveTurns],
    [reconciledHistoryTurns, liveTurns]
  );

  // 渲染窗口: 只把最近 renderLimit 轮渲染进 DOM (其余仍在内存, 仅不进 DOM)。切 session 复位。
  // in-flight 轮永远是最新一轮 → 必在窗口内, 故 streaming / 贴底 / 续流 / 底部留白都不受影响。
  const [renderLimit, setRenderLimit] = useState(RENDER_WINDOW);
  useEffect(() => {
    setRenderLimit(RENDER_WINDOW);
  }, [sessionId]);
  const hiddenCount = Math.max(0, turns.length - renderLimit);
  const visibleTurns = useMemo<Turn[]>(
    () => (hiddenCount > 0 ? turns.slice(hiddenCount) : turns),
    [turns, hiddenCount]
  );

  const lastTurn = turns[turns.length - 1];
  // blocked 轮(命中额度、未发送)停在末尾 complete=false, 但 agent 永不对它 emit terminal
  // 事件 —— 不排除会把 composer 永久禁用(评审 #1)。故 busy 判定必须排除 blocked 轮。
  const busy = !!lastTurn && !lastTurn.complete && !lastTurn.blocked;

  // ready 门控发送:
  //   - 已有会话:要求 WS open。
  //   - 空白新对话(sessionId=null):允许发送 —— 首条消息触发懒建会话(否则 socket 未连 = 永远发不出第一句)。
  const ready = sessionId ? state === 'open' : true;

  // WS 一旦 open 且有 pendingSend(懒新建路径暂存的首条消息)→ 立刻发出去清掉。
  // send 返回 false(ws 已死但 state 未翻的陈旧窗口)→ 保留 pendingSendRef,state 再翻 open 时重试;
  // 发送成功 → 挂未送达看门狗(半死 TCP 下 flush「成功」但消息永远到不了后端)。
  useEffect(() => {
    if (state === 'open' && pendingSendRef.current) {
      const payload = pendingSendRef.current;
      if (send({ type: 'user_message', ...payload })) {
        pendingSendRef.current = null;
        if (pendingSendTurnIdRef.current) {
          armAckWait(payload.clientTurnId, pendingSendTurnIdRef.current);
          pendingSendTurnIdRef.current = null;
        }
      }
    }
  }, [state, send, armAckWait]);

  // 懒新建死路兜底:createSession 成功但 WS 一直连不上(8 次退避耗尽落 error)→ pendingSendRef
  // 永不 flush、乐观气泡永卡 busy。把这条转 blocked(未发送)+ 原文回填输入框,文字不丢。
  useEffect(() => {
    if (state !== 'error' || !pendingSendRef.current) return;
    pendingSendRef.current = null;
    const turnId = pendingSendTurnIdRef.current;
    pendingSendTurnIdRef.current = null;
    if (turnId) {
      setPendingTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, blocked: true } : t)));
    }
    const text = lastSubmitTextRef.current;
    if (text) setInput((cur) => (cur.trim() ? cur : text));
  }, [state]);

  // 上下文水位实时刷新: 每一轮回答从 busy=true → false (message_complete) 时
  // invalidate 一次, 让 chip 立刻反映本轮消耗。
  //
  // 为什么不在 WS message_complete 事件里直接 invalidate?
  //   - WS 消息流被 useSmartSearchSocket 内化了, panel 这层只看到归并后的 turns;
  //   - 用 busy 的 false→true 转沿做触发, 解耦于具体 WS 事件名, 更稳。
  //
  // staleTime=30s 不挡 invalidate, 每轮都能拿到最新水位。每轮结束还 invalidate sessions 列表 →
  // 侧边栏 messageCount / 标题 / 排序刷新(多会话)。
  const prevBusyRef = useRef(busy);
  useEffect(() => {
    if (prevBusyRef.current && !busy && sessionId) {
      void queryClient.invalidateQueries({ queryKey: ['smart-search', 'context', sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['smart-search', 'sessions'] });
    }
    prevBusyRef.current = busy;
  }, [busy, sessionId, queryClient]);

  // busy 同步进 store —— 供 SearcherColumn header 的「新对话」按钮做 disabled(回答中不给切)。
  useEffect(() => {
    setStoreBusy(busy);
  }, [busy, setStoreBusy]);

  // 切会话 / 新对话 清理:activeSessionId 变化 → 清本地 turns + clearMessages,让新会话从干净态
  // 开始(history 会按新 id 重取,socket 也按新 id 重连)。**仅当切到的正是我们程序化采用的那个
  // 会话**(adoptingSessionIdRef===sessionId,懒建/upload-adopt/引用-adopt)才跳过清理 —— pending
  // turn / 待发消息 / 附件属于它;若期间用户点了侧边栏别的会话 B(≠ 采用 id),照常清理丢弃在途消息,
  // 绝不把它串进 B(评审 #1)。
  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return;
    prevSessionIdRef.current = sessionId;
    if (adoptingSessionIdRef.current === sessionId) {
      adoptingSessionIdRef.current = null;
      return;
    }
    setPendingTurns([]);
    setStopping(false);
    pendingSendRef.current = null;
    pendingSendTurnIdRef.current = null;
    clearAckWait();
    clearStopFallback();
    clearMessages();
  }, [sessionId, clearMessages, clearAckWait, clearStopFallback]);

  // 标题生成:agent 首轮后异步产标题并推 session_title_updated 帧 → invalidate sessions,
  // 让侧边栏「生成标题中…」spinner 换成真标题(该帧晚于 message_complete,故单独盯一手)。
  // 直接看「最后一帧是不是 title」(同 claw):messages 会话内 append-only、切会话 clearMessages 归零,
  // 故 title 帧作为末帧到达即触发一次;不做绝对下标去重(下标会在切会话归零后与陈旧值碰撞漏刷,评审 #5)。
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.type === 'session_title_updated') {
      void queryClient.invalidateQueries({ queryKey: ['smart-search', 'sessions'] });
    }
  }, [messages, queryClient]);

  // 提交一次提问。
  //   - 已有会话:session open 立即推 WS, 没就绪丢进 pendingSendRef 等 open。
  //   - 空白新对话(!sessionId):懒建后端会话 → setActiveSessionId(newId)(socket 随之连) →
  //     pendingSendRef 待 open 后自动发。建会话失败则回滚乐观 turn。同 claw handleSubmit。
  // 2026-07 输入框统一:附件走方案 B(文件已在会话 cwd,只透传 path,backend hub 折 @"path"
  // 标记);引用块追加到 content 末尾(与 claw 同构,历史回放解析回 chip)。
  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text && att.attachments.length === 0 && references.length === 0) return;
    trackEvent('search_submit', { len: text.length, files: att.attachments.length, refs: references.length });
    lastSubmitTextRef.current = text;
    const turnRefs: TurnReference[] = references.map((r) => ({
      kind: r.kind,
      title: r.title,
      paperCount: r.paperCount,
      hasPdf: r.hasPdf,
    }));
    const turnAtts: TurnAttachment[] = att.attachments.map((a) => ({
      type: a.type,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      path: a.path,
      // 已发送气泡里图片缩略图 —— 用后端取图代理 URL(与历史回放一致,刷新后仍有效)。
      previewUrl: a.type === 'image' && a.path ? smartSearchSessionFileUrl(a.sessionId, a.path) : undefined,
    }));
    const wsAttachments = att.attachments.map((a) => ({
      type: a.type,
      name: a.name,
      mimeType: a.mimeType,
      path: a.path,
    }));
    const content = text + buildReferenceBlock(turnRefs);
    const turnId = `turn-${crypto.randomUUID()}`;
    // clientTurnId 在这里预 mint(而非 socket.send 里兜底):与乐观气泡 turnId 配对,
    // 撑起「user_ack 投递确认 ↔ 未送达看门狗」闭环。
    const clientTurnId = crypto.randomUUID();
    const payload = {
      content,
      clientTurnId,
      ...(wsAttachments.length > 0 ? { attachments: wsAttachments } : {}),
    };
    const optimisticTurn = {
      id: turnId,
      userText: text,
      userAttachments: turnAtts.length > 0 ? turnAtts : undefined,
      userReferences: turnRefs.length > 0 ? turnRefs : undefined,
    };

    if (!sessionId) {
      // 空白新对话:先懒建会话,再切过去。payload 存 pendingSendRef,WS open 后由 flush effect
      // 自动发(flush 成功后挂未送达看门狗)。
      // 关键:adoptingSessionIdRef 在**拿到 newId 之后**才置为该具体 id(不能 await 前置 bool)——
      // 否则 await 期间用户切到别的会话 B,那次 null→B 切换会误跳过清理、把 payload 串进 B(评审 #1)。
      setInput('');
      // 重发时先清掉上一条「未发送」的 blocked 轮, 避免它和新一轮并存显得杂乱。
      setPendingTurns((prev) => [...prev.filter((t) => !t.blocked), optimisticTurn]);
      att.clearAttachments();
      setReferences([]);
      pendingSendRef.current = payload;
      pendingSendTurnIdRef.current = turnId;
      try {
        const { sessionId: newId } = await createSession.mutateAsync();
        markSmartSearchPendingModel(newId); // 新对话选过模型 → 登记一次性初始模型,socket open 后下发
        adoptingSessionIdRef.current = newId; // 只让 null→newId 这次切换跳过清理
        setActiveSessionId(newId);
        notifySessionChanged('smart-search', newId);
      } catch (err) {
        // 建会话失败:回滚乐观 turn + 待发消息 + 恢复输入,便于重试。
        adoptingSessionIdRef.current = null;
        pendingSendRef.current = null;
        pendingSendTurnIdRef.current = null;
        setPendingTurns((prev) => prev.filter((t) => t.id !== turnId));
        setInput((cur) => (cur.trim() ? cur : text));
        toast.error((err as Error).message || '新建会话失败,请重试');
      }
      return;
    }

    // 已有会话:send 判真 —— 返回 false(ws 已死但 state 还没翻的陈旧窗口)同样按未就绪处理,
    // **不追加**乐观气泡、不清输入(旧版静默 queue + 照常追加 = 永无终帧的幽灵轮,busy 永久卡死)。
    if (state !== 'open' || !send({ type: 'user_message', ...payload })) {
      toast.error('连接未就绪,请稍后重试');
      return;
    }
    setInput('');
    // 重发时先清掉上一条「未发送」的 blocked 轮, 避免它和新一轮并存显得杂乱。
    setPendingTurns((prev) => [...prev.filter((t) => !t.blocked), optimisticTurn]);
    att.clearAttachments();
    setReferences([]);
    // 端到端投递确认:10s 内无 ack 且无任何流帧 → 该轮转「未发送」+ 回填输入框(半死 TCP 闭环)。
    armAckWait(clientTurnId, turnId);
  }, [input, state, send, att, references, sessionId, createSession, setActiveSessionId, armAckWait]);

  // 未登录态 hero 的提交 —— 不真正发送,而是弹登录;把刚输入的关键词排进
  // pending navigate(/search?mode=smart&q=…),登录成功后由 useReplayPendingAction
  // 跳进来 + q 预填(与首页「智能搜索」按钮同一套,见 HomePage.handleSmartSearch)。
  const openDialog = useAuthDialog((s) => s.openDialog);
  const handleLoggedOutSubmit = useCallback(() => {
    const text = input.trim();
    const params = new URLSearchParams();
    if (text) params.set('q', text);
    params.set('mode', 'smart');
    usePendingAction.getState().set({ type: 'navigate', to: `/search?${params.toString()}` });
    openDialog('login');
  }, [input, openDialog]);

  // 交互提问(AskUserQuestion,方案 B):待作答问题浮到输入框上方由 QuestionPrompt 分步承接,答案作为
  // **普通 user 消息**回传。作答一定发生在已建会话里(问题来自已完成的一轮)→ 跳过懒建路径,直接走
  // handleSubmit 的「已有 session」发送逻辑:send 判真(失败**不追加**乐观气泡)+ 成功后挂未送达看门狗。
  const pendingQuestionBlock = findPendingQuestionBlock(turns);
  const answerQuestion = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      lastSubmitTextRef.current = t; // 投递失败时回填输入框用(与 handleSubmit 同款)
      const clientTurnId = crypto.randomUUID();
      if (state !== 'open' || !send({ type: 'user_message', content: t, clientTurnId })) {
        toast.error('连接未就绪,请稍后重试');
        return;
      }
      const turnId = `turn-${crypto.randomUUID()}`;
      setPendingTurns((prev) => [...prev.filter((x) => !x.blocked), { id: turnId, userText: t }]);
      armAckWait(clientTurnId, turnId);
    },
    [state, send, armAckWait],
  );

  // 停止当前生成 —— 把 {type:'stop_generation'} 直接 push 到 WS:
  //   agent 收到后会 (1) 立即 emit {status:'idle'}, (2) 向 SDK 发 interrupt,
  //   (3) 3s 未退则强杀 subprocess, 最终 emit message_complete 让 fold 标 complete。
  //   backend agentbridge 是透明 pipe (不消耗配额, 见 ws.go:239), 不需要改后端。
  // setStopping(true) 锁住按钮防重复点, busy 翻 false 时(下个 useEffect) 自动 unlock。
  // 加固(镜像 claw 线上卡死修复):不再因 socket 非 open 而静默 return —— 连接死了 agent 反正
  // 收不到,直接靠本地兜底收口;20s 内没等到真实终帧(agent 空转 no-op / 连接死 / 幽灵轮)也本地
  // 合成完成帧收口。停止按钮从此是**永远有效**的逃生口,不会点一次就永久转圈。
  const handleStop = useCallback(() => {
    if (stopping) return;
    setStopping(true);
    // 当前这轮标"已暂停" —— agent 不会在事件流里回放这个信号, 前端本地记在最后一条
    // pendingTurn 上, fold 透传到 Turn, message_complete 到达后末尾渲染「已暂停」。
    setPendingTurns((prev) =>
      prev.length === 0
        ? prev
        : prev.map((t, i) =>
            i === prev.length - 1 ? { ...t, paused: true } : t
          )
    );
    if (state === 'open') send({ type: 'stop_generation' });
    clearStopFallback();
    stopTimerRef.current = window.setTimeout(() => {
      stopTimerRef.current = null;
      // 断连中不合成(审查修复):该轮可能仍在服务端进行,重连回放会与本地合成终帧错配串位 ——
      // 交给重连后的 resync 收口。只在连接健康(= agent 空转 no-op / 幽灵轮)时本地收口。
      if (stateRef.current !== 'open') return;
      appendLocalFrame({ type: 'message_complete' });
    }, STOP_FALLBACK_MS);
  }, [stopping, state, send, appendLocalFrame, clearStopFallback]);

  // busy 从 true → false 时, terminal 事件已到达 → 解除 stop 锁 + 撤销停止兜底计时器,
  // 让下一轮回答(若用户立刻又问)能正常 stop。
  useEffect(() => {
    if (!busy) {
      clearStopFallback();
      if (stopping) setStopping(false);
    }
  }, [busy, stopping, clearStopFallback]);

  if (!token) {
    // 未登录:居中 hero 对话框(同已登录起始态),输入框提示登录,回车/发送弹登录。
    return (
      <div className="flex flex-col h-full min-h-0 bg-background">
        <SmartSearchHero
          loggedOut
          value={input}
          onChange={setInput}
          onSubmit={handleLoggedOutSubmit}
        />
      </div>
    );
  }

  // 加载态:
  //   - sessions 列表还没落定 → 加载(马上会 adopt 最近会话或落到空白新对话)。
  //   - 有活跃会话且其历史在拉(含 refetchOnMount:'always' 重入的 isFetching)→ 加载,避免 hero 闪。
  //   - 无活跃会话(空白新对话 / 新用户空列表)→ 不加载 → 显示 hero。
  const loadingHistory =
    sessionsQuery.isLoading ||
    (!!sessionId && (historyQuery.isLoading || historyQuery.isFetching));

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* 多窗口接管 banner: 后端 displacement 路径下发 {type:displaced} 后,
          这个 banner 占顶部一行, 用户点 "切回这里" 调 takeOver() 抢回活跃权。
          banner 只在 state='displaced' 时出现; takeOver 后 state 变 connecting → open 自动消失。 */}
      {state === 'displaced' && (
        <AgentDisplacedBanner reason={displacedReason} onTakeOver={takeOver} />
      )}

      {/* 内容区:hero(空态)与对话视图是两层 absolute 叠层,互不挤压布局。
          - 对话视图常驻底层;悬浮对话框 + 底部渐隐都在这层。
          - hero 在最上层,发送首条消息后整体淡出(大标题 + 流动背景渐隐),底栏 composer 同时就位。 */}
      <div className="relative flex-1 min-h-0">
        {/* 对话视图(底层) */}
        {turns.length > 0 && (
          // 外层量高 div: useHeightVar 把"对话框可视区"像素高写进 --chat-area-h,供留白按比例算。
          <div ref={chatAreaRef} className="absolute inset-0">
            <StickToBottom
              // ⚠️ 这个 wrapper 绝对不能加任何 overflow-* 工具类。
              //
              // use-stick-to-bottom 的真实 scroll container 是 StickToBottom.Content 内部的
              // scrollRef div (库 useLayoutEffect 自动给它设 overflow: auto)。
              //
              // 踩过的坑: 之前为了"防横滚"给这里加了 overflow-x-hidden, 结果出现两个垂直滚动条。
              //   根因是 CSS 计算规则: 当 overflow-x=hidden 而 overflow-y=visible 时,
              //   overflow-y 会被**计算成 auto** → 这个外层 div 自己也变成了垂直 scroll container,
              //   叠加内层 scrollRef = 双滚动条。
              //
              // 横向溢出的正确防线在内容层: 每个气泡 min-w-0 + max-w-full + overflow-hidden,
              // markdown 表格 overflow-x-auto, 工具 chip max-w-full。外层不需要也不能管 overflow。
              //
              // padding / background / relative 可以放心保留 (不影响 overflow 计算)。
              className="h-full bg-surface-1 px-4 py-4 relative"
              resize="smooth"
              initial="smooth"
            >
              {/* 底部留白 = 滚动内容的 padding-bottom(算进 scrollHeight,贴底时稳定露在视口底)。
                  现在对话框是"悬浮"在底部,所以留白要 ≥ 悬浮框高度,内容才不会被它盖住 —— 用
                  max(三成框高, 132px) 兜底:高屏保留三成呼吸感,矮屏也至少留出悬浮框的高度。 */}
              <StickToBottom.Content
                // scrollClassName 落在库真正的 scroll 元素上(overflow:auto 那层),
                // 给它挂「仅手动滚动时浮现」的滚动条样式;className 落在内容层。
                scrollClassName="chat-scrollbar-autohide"
                className="space-y-3.5 min-w-0 pb-[max(calc(var(--chat-area-h,100dvh)*0.3),132px)]"
              >
                {(hiddenCount > 0 || historyHasMore) && (
                  <div className="flex justify-center pb-1">
                    <button
                      type="button"
                      // 两段式"加载更早": 先把已拉到但没渲染的轮放进 DOM (hiddenCount>0, 不发请求);
                      // 都渲染完了还有更早的 → 向后端多要一页 (historyLimit += STEP) 并同步放开渲染窗口。
                      onClick={() => {
                        if (hiddenCount > 0) {
                          setRenderLimit((n) => n + RENDER_STEP);
                        } else {
                          setHistoryLimit((n) => n + HISTORY_STEP);
                          setRenderLimit((n) => n + HISTORY_STEP);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-surface-2 text-12 text-muted-foreground hover:text-foreground hover:bg-surface-2/70 transition-colors"
                    >
                      {hiddenCount > 0 ? `加载更早的 ${hiddenCount} 轮对话` : '加载更早的对话'}
                    </button>
                  </div>
                )}
                {visibleTurns.map((turn) => (
                  <div key={turn.id} className="space-y-3.5 min-w-0">
                    <UserBubble
                      text={turn.userText}
                      attachments={turn.userAttachments}
                      references={turn.userReferences}
                    />
                    <AssistantTurn turn={turn} />
                  </div>
                ))}
                {state === 'reconnecting' && (
                  <div className="inline-flex items-center gap-2 text-12 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    连接断开,正在重连
                    {reconnectAttempt > 0 && (
                      <span className="text-faint">({reconnectAttempt}/5)</span>
                    )}
                  </div>
                )}
                {state === 'error' && (
                  <div className="inline-flex items-center gap-1.5 text-12 text-brand-red">
                    <AlertCircle className="size-3.5" />
                    连接中断, 请刷新页面重试
                  </div>
                )}
              </StickToBottom.Content>
              <ScrollController scrollRef={scrollToBottomRef} />
              <ScrollbarAutoHide />
              <ScrollToBottomFab />
            </StickToBottom>

            {/* 底部渐隐:内容贴近底部时淡入 surface-1,让悬浮对话框"浮"在对话之上(不被文字顶到边)。 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-raised h-28 bg-gradient-to-t from-surface-1 via-surface-1/85 to-transparent" />

            {/* 悬浮对话框 —— 普通 div。原「与 hero 共用 layoutId 从居中滑到底部」的共享 layout 动画已移除:
                那个 framer 共享 layout 会用 scaleY morph 高度,返回页面时被路由过渡打断即卡住 → 输入框拉高变形。
                改为 hero 淡出 + 底栏 composer 直接就位。外层 pointer-events-none 不挡滚动,框本体可交互。 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-sticky px-4 pb-4">
              <div className="pointer-events-auto mx-auto w-full max-w-2xl">
                {pendingQuestionBlock && (
                  <QuestionPrompt
                    key={pendingQuestionBlock.toolUseId}
                    block={pendingQuestionBlock}
                    onSubmit={answerQuestion}
                  />
                )}
                <SmartComposer
                  prominent
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSubmit}
                  placeholder="继续与智能搜索对话…"
                  ready={ready}
                  busy={busy}
                  onStop={handleStop}
                  stopping={stopping}
                  // 切会话瞬间 context 可能是上个会话的残影(无 keepPreviousData 但 disable→refetch 有窗口)→ 只认当前会话的。
                  contextSnapshot={
                    contextQuery.data?.sessionId === sessionId ? contextQuery.data : undefined
                  }
                  {...composerExtras}
                />
              </div>
            </div>
          </div>
        )}

        {/* 加载历史(覆盖层) */}
        {turns.length === 0 && loadingHistory && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
            <Loader2 className="size-5 text-muted-foreground animate-spin mb-3" />
            <div className="text-12 text-muted-foreground">正在加载历史会话…</div>
          </div>
        )}

        {/* 起始态 hero(顶层):发送首条消息后整体淡出(大标题 + 流动背景);底栏 composer 同时就位。 */}
        <AnimatePresence initial={false}>
          {turns.length === 0 && !loadingHistory && (
            <motion.div
              key="smart-hero"
              className="absolute inset-0 z-nav flex"
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
            >
              <SmartSearchHero
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                ready={ready}
                composerExtras={composerExtras}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 附件放大预览 + 引用文献选择器(2026-07 输入框统一) */}
      <AttachmentLightbox
        src={att.lightbox?.src ?? null}
        alt={att.lightbox?.alt}
        onClose={() => att.setLightbox(null)}
      />
      <LibraryReferencePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={handleReferenceConfirm}
        busy={referenceMutation.isPending}
      />
    </div>
  );
}

/**
 * 当用户向上滚动取消贴底时, 右下角浮出"回到底部"小按钮。
 * 必须放在 <StickToBottom> 内部, 因为依赖 useStickToBottomContext()。
 */
/**
 * 把库的 scrollToBottom 注入到外部传进来的 ref —— 让 panel 的"发送后滚到底"逻辑
 * (在 StickToBottom 外) 能调到只在 StickToBottom 内部可用的 useStickToBottomContext。
 * 自身不渲染任何东西。
 */
function ScrollController({
  scrollRef,
}: {
  scrollRef: { current: (() => void) | null };
}) {
  const { scrollToBottom } = useStickToBottomContext();
  useEffect(() => {
    scrollRef.current = () => {
      void scrollToBottom();
    };
    return () => {
      scrollRef.current = null;
    };
  }, [scrollToBottom, scrollRef]);
  return null;
}

/**
 * 会话滚动条「仅手动滚动时浮现」—— 只听 wheel / touchmove 这类**用户手势**:
 * 手势触发时给真正的 scroll 元素(context.scrollRef)加 .is-scrolling 让滚动条浮现,
 * 停手约 1s 后移除、滚动条再隐藏。配合 .chat-scrollbar-autohide(见 globals.css)。
 *
 * 关键:程序化「自动贴底跟随」改的是 scrollTop,**不会**触发 wheel/touchmove,
 * 所以自动滚动期间这里不动作 → 滚动条保持隐藏(正是需求要的)。自身不渲染任何 DOM。
 */
function ScrollbarAutoHide() {
  const { scrollRef } = useStickToBottomContext();
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      el.classList.add('is-scrolling');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('is-scrolling'), 1000);
    };
    el.addEventListener('wheel', reveal, { passive: true });
    el.addEventListener('touchmove', reveal, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener('wheel', reveal);
      el.removeEventListener('touchmove', reveal);
    };
  }, [scrollRef]);
  return null;
}

function ScrollToBottomFab() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <button
      type="button"
      onClick={() => scrollToBottom()}
      // bottom-28 抬高,让它浮在底部"悬浮对话框"之上,而不是被对话框盖住。
      className="sticky bottom-28 ml-auto mr-1 flex size-8 items-center justify-center rounded-pill bg-foreground text-background shadow-overlay hover:opacity-90 transition-opacity"
      aria-label="回到底部"
    >
      <ArrowDown className="size-4" strokeWidth={2.4} />
    </button>
  );
}

function UserBubble({
  text,
  attachments,
  references,
}: {
  text: string;
  attachments?: TurnAttachment[];
  references?: TurnReference[];
}) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {attachments && attachments.length > 0 && <AttachmentChipList attachments={attachments} />}
      {references && references.length > 0 && <ReferenceChipList references={references} />}
      {text && (
        <div className="max-w-[80%] inline-flex items-center py-2.5 px-3.5 rounded-12 bg-foreground text-background text-12 leading-paragraph">
          {text}
        </div>
      )}
    </div>
  );
}
