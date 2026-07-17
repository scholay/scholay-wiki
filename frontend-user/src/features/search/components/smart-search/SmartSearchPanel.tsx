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
  ReferenceChipList,
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
      避免重复触发。terminal 事件到达 → busy 自动翻 false → 这里下面 useEffect 重置回 false。 */
  const [stopping, setStopping] = useState(false);
  /** 最近一次成功提交的问题原文 —— 命中额度被拦时用于回填输入框, 便于一键重发。 */
  const lastSubmitTextRef = useRef<string>('');

  const {
    state, messages, send, clearMessages, reconnectAttempt, displacedReason, takeOver, resyncUserText,
    peerMessage, busyRejected, quotaExceeded, sessionModel,
  } = useSmartSearchSocket(sessionId);

  // P2 模型目录:目录数据前置声明(附件块的图片入口按当前模型 vision 启停要用)。
  const { data: userModels } = useUserModels('smart_search');

  // adoptSession:「空白新对话直接上传文件 / 引用文献」时,后端建/取会话并回传 → 采用它,
  // 让随后的消息落到同一会话。记下具体 id 让 change effect 跳过清理(附件/引用已在该会话 cwd)。
  const adoptSession = useCallback(
    (ensuredId: string) => {
      if (ensuredId === activeSessionId) return;
      adoptingSessionIdRef.current = ensuredId;
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
    acceptImages: modelSupportsVision(userModels, sessionModel),
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
  const modelSlot =
    userModels && userModels.length > 0 && sessionId ? (
      <ModelSelector
        models={userModels}
        current={sessionModel}
        onUpgrade={() => { window.location.href = '/pricing'; }}
        onSelect={(id) =>
          send({ type: 'set_runtime_config', providerId: null, modelId: id ?? '', useDefault: id === null })
        }
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
              <span className="inline-flex items-center gap-1 text-2xs text-faint">
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
      <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-green bg-background/90 text-sm font-medium text-brand-green">
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
  useEffect(() => {
    setSeededResync(false);
  }, [sessionId]);
  useEffect(() => {
    if (resyncUserText && pendingTurns.length === 0 && !seededResync) {
      setPendingTurns([
        { id: 'resync-inflight', userText: stripAgentBridgePrefix(resyncUserText) },
      ]);
      setSeededResync(true);
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

  // 本次 mount 起的 sessionId 一旦确认, pendingSendRef 里如果还有未发的 user_message
  // 就在 WS open 后立刻发出去。
  const pendingSendRef = useRef<
    { content: string; attachments?: { type: 'image' | 'file'; name?: string; mimeType?: string; path: string }[] } | null
  >(null);
  useEffect(() => {
    if (state === 'open' && pendingSendRef.current) {
      send({ type: 'user_message', ...pendingSendRef.current });
      pendingSendRef.current = null;
    }
  }, [state, send]);

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
    clearMessages();
  }, [sessionId, clearMessages]);

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
    setInput('');
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
    setPendingTurns((prev) => [
      // 重发时先清掉上一条「命中额度未发送」的 blocked 轮, 避免它和新一轮并存显得杂乱。
      ...prev.filter((t) => !t.blocked),
      {
        id: turnId,
        userText: text,
        userAttachments: turnAtts.length > 0 ? turnAtts : undefined,
        userReferences: turnRefs.length > 0 ? turnRefs : undefined,
      },
    ]);
    const payload = {
      content,
      ...(wsAttachments.length > 0 ? { attachments: wsAttachments } : {}),
    };
    att.clearAttachments();
    setReferences([]);

    if (!sessionId) {
      // 空白新对话:先懒建会话,再切过去。payload 存 pendingSendRef,WS open 后自动发。
      // 关键:adoptingSessionIdRef 在**拿到 newId 之后**才置为该具体 id(不能 await 前置 bool)——
      // 否则 await 期间用户切到别的会话 B,那次 null→B 切换会误跳过清理、把 payload 串进 B(评审 #1)。
      pendingSendRef.current = payload;
      try {
        const { sessionId: newId } = await createSession.mutateAsync();
        adoptingSessionIdRef.current = newId; // 只让 null→newId 这次切换跳过清理
        setActiveSessionId(newId);
        notifySessionChanged('smart-search', newId);
      } catch (err) {
        // 建会话失败:回滚乐观 turn + 待发消息 + 恢复输入,便于重试。
        adoptingSessionIdRef.current = null;
        pendingSendRef.current = null;
        setPendingTurns((prev) => prev.filter((t) => t.id !== turnId));
        setInput((cur) => (cur.trim() ? cur : text));
        toast.error((err as Error).message || '新建会话失败,请重试');
      }
      return;
    }

    if (state === 'open') {
      send({ type: 'user_message', ...payload });
    } else {
      pendingSendRef.current = payload;
    }
  }, [input, state, send, att, references, sessionId, createSession, setActiveSessionId]);

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

  // 停止当前生成 —— 把 {type:'stop_generation'} 直接 push 到 WS:
  //   agent 收到后会 (1) 立即 emit {status:'idle'}, (2) 向 SDK 发 interrupt,
  //   (3) 3s 未退则强杀 subprocess, 最终 emit message_complete 让 fold 标 complete。
  //   backend agentbridge 是透明 pipe (不消耗配额, 见 ws.go:239), 不需要改后端。
  // setStopping(true) 锁住按钮防重复点, busy 翻 false 时(下个 useEffect) 自动 unlock。
  const handleStop = useCallback(() => {
    if (stopping || state !== 'open') return;
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
    send({ type: 'stop_generation' });
  }, [stopping, state, send]);

  // busy 从 true → false 时, terminal 事件已到达 → 解除 stop 锁,
  // 让下一轮回答(若用户立刻又问)能正常 stop。
  useEffect(() => {
    if (!busy && stopping) setStopping(false);
  }, [busy, stopping]);

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
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-surface-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2/70 transition-colors"
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
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    连接断开,正在重连
                    {reconnectAttempt > 0 && (
                      <span className="text-faint">({reconnectAttempt}/5)</span>
                    )}
                  </div>
                )}
                {state === 'error' && (
                  <div className="inline-flex items-center gap-1.5 text-xs text-brand-red">
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
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-surface-1 via-surface-1/85 to-transparent" />

            {/* 悬浮对话框 —— 普通 div。原「与 hero 共用 layoutId 从居中滑到底部」的共享 layout 动画已移除:
                那个 framer 共享 layout 会用 scaleY morph 高度,返回页面时被路由过渡打断即卡住 → 输入框拉高变形。
                改为 hero 淡出 + 底栏 composer 直接就位。外层 pointer-events-none 不挡滚动,框本体可交互。 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-4">
              <div className="pointer-events-auto mx-auto w-full max-w-2xl">
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
            <div className="text-sm text-muted-foreground">正在加载历史会话…</div>
          </div>
        )}

        {/* 起始态 hero(顶层):发送首条消息后整体淡出(大标题 + 流动背景);底栏 composer 同时就位。 */}
        <AnimatePresence initial={false}>
          {turns.length === 0 && !loadingHistory && (
            <motion.div
              key="smart-hero"
              className="absolute inset-0 z-30 flex"
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
      className="sticky bottom-28 ml-auto mr-1 flex size-8 items-center justify-center rounded-pill bg-foreground text-background shadow-elevation-2 hover:opacity-90 transition-opacity"
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
        <div className="max-w-[80%] inline-flex items-center py-2.5 px-3.5 rounded-xl bg-foreground text-background text-sm leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}
