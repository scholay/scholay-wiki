import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import {
  notifySessionChanged,
  useSessionBroadcast,
} from '@/shared/lib/agent-session-broadcast';
import { stripAgentBridgePrefix } from '@/shared/lib/agent-prefix';
import {
  clearBlockedMessage,
  getBlockedMessage,
  setBlockedMessage,
  markPendingInitialModel,
  useSciDrawContext,
  useSciDrawHistory,
  useSciDrawSessions,
  useCreateSciDrawSession,
} from '../api/sci-draw-session';
import { buildReferenceBlock } from '@/shared/lib/agent-references';
import type { TurnReference } from '@/shared/types/chat';
import { useSciDrawSocket } from '../api/socket';
import type { AttachmentDTO, ClientMessage, ReferenceItemDTO } from '../api/types';
import { useSciDrawArtifacts } from '../api/artifacts';
import {
  foldMessagesIntoTurns,
  replayHistoryAsTurns,
  type Turn,
} from '../components/chat/fold';

/**
 * 科研绘图会话状态机 —— 从 useBoltslidesConversation 机械克隆(boltslides→sci_draw)。
 * 与 claw/boltslides 同一套踩坑注释:历史快照不可 invalidate、断线续流对账、懒新建 pendingSend
 * flush 等全是修过线上 bug 的浮点。改这里只影响科研绘图 mode。
 */

const SCI_DRAW_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/** 拼后端取图代理 URL(P0 无附件,dead code,保持与 claw/boltslides 同型结构备后续开附件用)。 */
export function sciDrawSessionFileUrl(sessionId: string, absPath: string): string {
  const base = absPath.split('/').pop() || absPath;
  const qs = new URLSearchParams({ session_id: sessionId, path: base });
  return `${SCI_DRAW_API_BASE}/user/sci_draw/session/file?${qs.toString()}`;
}

/** 历史回放: 给图片附件补 previewUrl(P0 无附件,不触发)。 */
function withHistoryImagePreviews(turns: Turn[], sessionId: string | null): Turn[] {
  if (!sessionId) return turns;
  return turns.map((turn) => {
    if (!turn.userAttachments?.length) return turn;
    const next = turn.userAttachments.map((a) =>
      a.type === 'image' && a.path && !a.previewUrl
        ? { ...a, previewUrl: sciDrawSessionFileUrl(sessionId, a.path) }
        : a,
    );
    return { ...turn, userAttachments: next };
  });
}

/** 长会话渲染窗口 / 历史分页(同 claw/boltslides)。 */
const RENDER_WINDOW = 60;
const RENDER_STEP = 60;
const HISTORY_WINDOW = 100;
const HISTORY_STEP = 100;
/** 未送达看门狗:send 后这么久既无 user_ack 也无任何流帧 → 判定未送达,转「未发送·一键重发」。 */
const ACK_TIMEOUT_MS = 10_000;
/** 停止兜底:发出 stop_generation 后这么久没等到真实终帧 → 本地合成完成帧收口本轮(渲染「已暂停」)。
 *  取远大于正常 abort 收尾时长;死连接场景重连后 hub 只回放在途轮,不存在「合成后真终帧才迟到」的错配。 */
const STOP_FALLBACK_MS = 20_000;
/** 轮内无进展看门狗(W5 P0-C1,与 useClawConversation 同款):busy 且这么久没有任何内容帧 →
 *  stalled 软提示(StallNotice)。只认内容帧 —— 控制帧不进 socket.messages,不会被心跳喂活。 */
const STALL_WARN_MS = 90_000;

/**
 * @param opts.initialSessionId 页层(会话路由 URL)驱动的初始会话意图:
 *   - `null` → 空白新对话态(进入 /claw 无 sessionId,或选模板卡 / 换回对话),**不自动续接**历史会话
 *   - `string` → 以该会话为初始活跃会话(/claw/:sessionId 深链 / 点历史某条)
 *   - `undefined` → 兜底同 `null`(老的「自动续接最近会话」已随会话路由化下线,进入即新对话)
 *   仅在 mount 时读一次;页层通过 remount(key)让新意图生效。
 * @param opts.onSessionCreated 懒新建把会话落地成真 sessionId 时回调一次(首条消息 / 添加文件)。
 *   页层据此把 URL 回填成 /claw/:newId(replace、不 remount,避免打断正在流式的回答)。
 */
export function useSciDrawConversation(opts?: {
  initialSessionId?: string | null;
  onSessionCreated?: (sessionId: string) => void;
}) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const initialSeed = opts?.initialSessionId; // string | null | undefined
  // 懒新建落地真 id 时回调页层回填 URL。ref-latest:opts 每渲染换引用,用 ref 存最新回调。
  const onSessionCreatedRef = useRef(opts?.onSessionCreated);
  onSessionCreatedRef.current = opts?.onSessionCreated;
  // 组件卸载后丢弃在途的懒新建落地(用户在 createSession 往返期间切走了)—— 否则迟到的 created 会
  // 回填 URL / hijack 页层 ownRef,把页面卡死在 resolving(桌面)或 URL↔内容错位(移动)。
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
      // 卸载时清掉在途计时器(未送达看门狗 / 停止兜底),防迟到回调对已卸载组件 setState。
      if (ackWaitRef.current !== null) window.clearTimeout(ackWaitRef.current.timer);
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    },
    [],
  );

  const sessionsQuery = useSciDrawSessions();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSeed !== undefined ? initialSeed : null,
  );

  // 初始活跃会话完全由 seed(=URL)决定:string→该会话、null/undefined→空白新对话。
  // 老的「首次拿到 sessions 后自动选最近一条」已随会话路由化**下线** —— 进入 /claw 即新对话,
  // 切具体会话走 /claw/:sessionId(见 ClawPage)。故此处不再有自动选最近的 effect。

  const sessionId = activeSessionId;
  const [historyLimit, setHistoryLimit] = useState(HISTORY_WINDOW);
  useEffect(() => {
    setHistoryLimit(HISTORY_WINDOW);
  }, [sessionId]);
  const historyQuery = useSciDrawHistory(sessionId, historyLimit);
  const historyHasMore = historyQuery.data?.hasMore ?? false;
  const contextQuery = useSciDrawContext(sessionId);
  const sessionArtifacts = useSciDrawArtifacts(sessionId).data;
  const createSession = useCreateSciDrawSession();

  const [pendingTurns, setPendingTurns] = useState<
    Pick<Turn, 'id' | 'userText' | 'userAttachments' | 'paused' | 'blocked'>[]
  >([]);

  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const lastSubmitRef = useRef<{
    text: string;
    attachments: AttachmentDTO[];
    references: ReferenceItemDTO[];
  } | null>(null);

  const pendingSendRef = useRef<ClientMessage | null>(null);
  // 懒新建乐观气泡的 turn id —— flush 成功后据此挂未送达看门狗;WS 落 error 终态时据此转 blocked。
  const pendingSendTurnIdRef = useRef<string | null>(null);

  // ── 未送达看门狗(幽灵轮闭环)──────────────────────────────────────────────
  // send() 返回 true 只保证写进了本端 socket 缓冲;半死 TCP(合盖唤醒 / 手机切网 / NAT 静默断)
  // 下消息永远到不了后端,该轮永无终帧 → busy 永久卡死输入框和「新对话」按钮(线上事故根因之一)。
  // 后端 hub 现在对每条送达的 user_message 回 user_ack:发出后 10s 内既无 ack 也无任何流帧 →
  // 判定未送达,把该轮转 blocked(「未发送·一键重发」,复用配额拦截同款机制),文字不丢、busy 解锁
  // (busy 排除 blocked;stopping 由下方 busy 翻 false 的 effect 自动复位)。
  const ackWaitRef = useRef<{ clientTurnId: string; turnId: string; timer: number } | null>(null);
  // 已确认送达的轮(user_ack / 自回声隐式 ack 命中)—— 幽灵轮判定的「送达证明」门:送达过的轮
  // 绝不再被判成「未发送」诱导重复发送(审查修复)。
  const deliveredTurnIdRef = useRef<string | null>(null);
  // 看门狗误报后的恢复配对(审查修复):超时标 blocked 后保留配对,迟到的 ack / 该轮流帧到达
  // → 解除误标(真实回答帧只是被 fold 的 blocked 跳过,仍在 messages 里,解除后重折叠即恢复)。
  const firedAckRef = useRef<{ clientTurnId: string; turnId: string } | null>(null);
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
        const sid = activeSessionIdRef.current;
        const payload = lastSubmitRef.current;
        if (sid && payload) {
          setBlockedMessage(sid, {
            text: payload.text,
            attachments: payload.attachments,
            references: payload.references,
          });
        }
        setPendingTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, blocked: true } : t)));
        toast.error('消息未能送达,已为你保留,可点击重新发送');
      }, ACK_TIMEOUT_MS);
      ackWaitRef.current = { clientTurnId, turnId, timer };
    },
    [clearAckWait],
  );

  useSessionBroadcast('sci_draw');

  const socket = useSciDrawSocket(sessionId);
  // ref-latest:给 setTimeout 类回调读最新 socket(state / appendLocalFrame),闭包捕获的旧对象会过期。
  const socketRef = useRef(socket);
  socketRef.current = socket;

  // 送达证据处理(pong/connected 已不进 messages,messages.length 变化 = 真实进展帧):
  //   看门狗仍在等 → 撤销;及 user_ack 命中时记录「已送达」证明(幽灵轮判定的门)。
  //   看门狗已误报(firedAckRef)→ 迟到的 ack / 该轮流帧到达时解除误标的 blocked + 清持久化。
  const prevMsgLenRef = useRef(0);
  useEffect(() => {
    const grew = socket.messages.length > prevMsgLenRef.current;
    prevMsgLenRef.current = socket.messages.length;
    const ack = socket.userAck;
    if (ackWaitRef.current !== null) {
      if (ack && ack.clientTurnId === ackWaitRef.current.clientTurnId) {
        deliveredTurnIdRef.current = ackWaitRef.current.turnId;
      }
      clearAckWait();
      return;
    }
    const fired = firedAckRef.current;
    if (fired === null) return;
    const lastLive = liveTurnsRef.current[liveTurnsRef.current.length - 1];
    const ackHit = !!ack && ack.clientTurnId === fired.clientTurnId;
    // 流帧恢复只在误标轮仍是末条 live 轮时生效 —— 防多端场景把别端新轮的帧误认成本轮证据。
    if (ackHit || (grew && lastLive?.id === fired.turnId)) {
      firedAckRef.current = null;
      deliveredTurnIdRef.current = fired.turnId;
      clearBlockedMessage(activeSessionIdRef.current);
      setPendingTurns((prev) => prev.map((t) => (t.id === fired.turnId ? { ...t, blocked: false } : t)));
      toast.success('消息其实已送达,已恢复该轮显示');
    }
  }, [socket.userAck, socket.messages.length, socket.quotaExceeded, socket.busyRejected, clearAckWait]);

  // WS 一旦 open 且有 pendingSend → 立刻发出去清掉(lazy create 场景 handleSubmit 时 WS 还没 open)。
  // send 返回 false(ws 已死但 state 未翻的陈旧窗口)→ 保留 pendingSendRef,state 再翻 open 时重试;
  // 发送成功 → 挂未送达看门狗(半死 TCP 下 flush「成功」但消息永远到不了后端)。
  useEffect(() => {
    if (socket.state === 'open' && pendingSendRef.current) {
      const msg = pendingSendRef.current;
      if (socket.send(msg)) {
        pendingSendRef.current = null;
        if (msg.type === 'user_message' && msg.clientTurnId && pendingSendTurnIdRef.current) {
          armAckWait(msg.clientTurnId, pendingSendTurnIdRef.current);
          pendingSendTurnIdRef.current = null;
        }
      }
    }
  }, [socket, armAckWait]);

  // 懒新建死路兜底:createSession 成功但 WS 一直连不上(8 次退避耗尽落 error)→ pendingSendRef
  // 永不 flush、乐观气泡永卡 busy。把这条转 blocked(未发送·一键重发)+ 持久化,文字不丢。
  useEffect(() => {
    if (socket.state !== 'error' || !pendingSendRef.current) return;
    pendingSendRef.current = null;
    const sid = activeSessionIdRef.current;
    const payload = lastSubmitRef.current;
    if (sid && payload) {
      setBlockedMessage(sid, {
        text: payload.text,
        attachments: payload.attachments,
        references: payload.references,
      });
    }
    const turnId = pendingSendTurnIdRef.current;
    pendingSendTurnIdRef.current = null;
    if (turnId) {
      setPendingTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, blocked: true } : t)));
    }
  }, [socket.state]);

  // WS 事件副作用: message_complete/error → 只刷 context + sessions + artifacts,**绝不刷 history**
  // (history 是本次 mount 快照,流式产出由 liveTurns 渲染;刷 history 会丢刚流出的内容 / 双份)。
  useEffect(() => {
    const lastIdx = socket.messages.length - 1;
    if (lastIdx < 0) return;
    const last = socket.messages[lastIdx];
    if (last.type === 'message_complete' || last.type === 'error') {
      qc.invalidateQueries({ queryKey: ['sci_draw', 'context'] });
      qc.invalidateQueries({ queryKey: ['sci_draw', 'sessions'] });
      qc.invalidateQueries({ queryKey: ['sci_draw', 'artifacts'] });
    } else if (last.type === 'session_title_updated') {
      qc.invalidateQueries({ queryKey: ['sci_draw', 'sessions'] });
    }
  }, [socket.messages, qc]);

  const historyData = historyQuery.data;
  const historyTurns = useMemo(
    () =>
      sessionId && historyData?.sessionId === sessionId
        ? withHistoryImagePreviews(replayHistoryAsTurns(historyData.messages), sessionId)
        : [],
    [historyData, sessionId],
  );

  const [seededResync, setSeededResync] = useState(false);
  const seededMidRef = useRef(false);
  useEffect(() => {
    setSeededResync(false);
  }, [sessionId]);
  useEffect(() => {
    if (!socket.resyncUserText || seededResync || seededMidRef.current) return;
    if (pendingTurns.length === 0) {
      setPendingTurns([
        { id: 'resync-inflight', userText: stripAgentBridgePrefix(socket.resyncUserText) },
      ]);
      setSeededResync(true);
      return;
    }
    // 多端补种(审查修复):本端断连时**别端**发了话(错过了 live user_echo),重连撞上该轮回放 ——
    // pendingTurns 非空但末条 live 轮已完成/blocked = 本地没有能接住回放帧的在途轮 → 补一条。
    // 否则回放帧无宿主被 fold 丢弃、该轮隐身,且下一轮 echo 到来后所有后续帧整体串位。
    // 刻意**不置 seededResync**:那面旗还驱动「history 末尾去重」,本场景 history 快照早于该轮,
    // 误置会错删一条真实旧轮。自己在途轮的回放(末条未完成)不补 —— 帧直接折回原轮。
    const lastLive = liveTurnsRef.current[liveTurnsRef.current.length - 1];
    if (!lastLive || lastLive.complete || lastLive.blocked) {
      seededMidRef.current = true;
      setPendingTurns((prev) => [
        ...prev,
        { id: `resync-mid-${prev.length}`, userText: stripAgentBridgePrefix(socket.resyncUserText!) },
      ]);
    }
  }, [socket.resyncUserText, pendingTurns.length, seededResync]);

  const lastPeerSeqRef = useRef(0);
  useEffect(() => {
    const pm = socket.peerMessage;
    if (!pm || pm.seq === lastPeerSeqRef.current) return;
    lastPeerSeqRef.current = pm.seq;
    setPendingTurns((prev) => [...prev, { id: `peer-${pm.seq}`, userText: pm.text }]);
  }, [socket.peerMessage]);

  const lastBusyRef = useRef(0);
  useEffect(() => {
    if (socket.busyRejected === 0 || socket.busyRejected === lastBusyRef.current) return;
    lastBusyRef.current = socket.busyRejected;
    setPendingTurns((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
    pendingSendRef.current = null;
    toast.error('正在回答中,请稍候再发');
  }, [socket.busyRejected]);

  const liveTurns = useMemo(
    () => foldMessagesIntoTurns(socket.messages, pendingTurns),
    [socket.messages, pendingTurns],
  );

  // ── resync-idle 对账(「终帧永久丢失」闭环,线上 busy 永久卡死事故的核心修复之一)────────
  // (重)建连时 hub 在回放段末尾下发 resync_end{inFlight:false} =「服务端当前无在途轮」的权威信号。
  // 若此刻本地末条 live 轮仍未完成且非 blocked,它的终帧永远不会来了(断连期间轮已结束 /
  // agent·backend 中途死过 / 消息未送达),当场收口:
  //   幽灵轮(无任何流帧,即消息没送达)→ 转 blocked(「未发送·一键重发」,文字不丢);
  //   中断轮(已流出部分内容)→ 本地合成 error 终帧收口(渲染中断提示,已有内容保留)。
  // 正在等 ack / 懒新建 flush 在途时不动 —— 那条消息可能正被服务端处理,归看门狗管
  // (帧序保证:resync_end 在 attach 时入队,必先于本连接 send 之后的 ack 到达,不会误伤刚发的轮)。
  const liveTurnsRef = useRef<Turn[]>([]);
  liveTurnsRef.current = liveTurns;
  const lastResyncIdleRef = useRef(0);
  useEffect(() => {
    if (socket.resyncIdle === 0 || socket.resyncIdle === lastResyncIdleRef.current) return;
    lastResyncIdleRef.current = socket.resyncIdle;
    if (ackWaitRef.current !== null || pendingSendRef.current !== null) return;
    const live = liveTurnsRef.current;
    const last = live[live.length - 1];
    if (!last || last.complete || last.blocked) return;
    // 幽灵轮判据(审查修复加固):任何已收到的帧都算内容(status 只落 placeholder 也算 —— 说明
    // 消息已送达);已有送达证明(user_ack / 自回声)的轮绝不判「未发送」,走中断收口而非诱导重发。
    const hasContent = last.blocks.length > 0 || !!last.thinkingText || !!last.placeholder;
    const delivered = deliveredTurnIdRef.current === last.id;
    const sid = activeSessionIdRef.current;
    const payload = lastSubmitRef.current;
    if (!hasContent && !delivered && sid && payload && payload.text === last.userText) {
      setBlockedMessage(sid, {
        text: payload.text,
        attachments: payload.attachments,
        references: payload.references,
      });
      setPendingTurns((prev) => prev.map((t) => (t.id === last.id ? { ...t, blocked: true } : t)));
      return;
    }
    socket.appendLocalFrame({
      type: 'error',
      code: 'connection_interrupted',
      message: '连接中断,本轮回答已中断;若内容不完整,刷新页面可查看已生成的部分',
    });
    // stopping / busy 由既有「busy 翻 false」effect 自动复位。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.resyncIdle]);

  const reconciledHistoryTurns = useMemo<Turn[]>(
    () =>
      seededResync && historyTurns.length > 0
        ? historyTurns.slice(0, -1)
        : historyTurns,
    [historyTurns, seededResync],
  );

  const turns: Turn[] = useMemo(
    () => [...reconciledHistoryTurns, ...liveTurns],
    [reconciledHistoryTurns, liveTurns],
  );

  const [renderLimit, setRenderLimit] = useState(RENDER_WINDOW);
  useEffect(() => {
    setRenderLimit(RENDER_WINDOW);
  }, [sessionId]);
  const hiddenCount = Math.max(0, turns.length - renderLimit);
  const visibleTurns = useMemo<Turn[]>(
    () => (hiddenCount > 0 ? turns.slice(hiddenCount) : turns),
    [turns, hiddenCount],
  );

  const loadEarlier = useCallback(() => {
    if (hiddenCount > 0) {
      setRenderLimit((n) => n + RENDER_STEP);
    } else {
      setHistoryLimit((n) => n + HISTORY_STEP);
      setRenderLimit((n) => n + HISTORY_STEP);
    }
  }, [hiddenCount]);

  const lastTurn = turns[turns.length - 1];
  const busy = !!lastTurn && !lastTurn.complete && !lastTurn.blocked;

  // 轮内无进展看门狗(W5 P0-C1,与 useClawConversation 同款注释详见彼处)。
  const [stalled, setStalled] = useState(false);
  const [stallEpoch, setStallEpoch] = useState(0);
  useEffect(() => {
    setStalled(false);
    if (!busy) return;
    const t = window.setTimeout(() => setStalled(true), STALL_WARN_MS);
    return () => window.clearTimeout(t);
  }, [busy, socket.messages.length, stallEpoch]);
  const dismissStall = useCallback(() => {
    setStalled(false);
    setStallEpoch((e) => e + 1); // 重挂 90s 计时:继续无进展会再次提示
  }, []);

  /** 用户已经按过 stop 但 agent 还没 emit terminal 前的过渡态。
      busy → false 时下面 useEffect 自动重置(顺带撤销停止兜底计时器)。 */
  const [stopping, setStopping] = useState(false);
  const stopTimerRef = useRef<number | null>(null);
  const clearStopFallback = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (!busy) {
      clearStopFallback();
      if (stopping) setStopping(false);
    }
  }, [busy, stopping, clearStopFallback]);

  // 命中每日额度:backend 转发前就拒了这条 user_message → 本轮 turn.complete 永远 false 会卡死。
  // ① 把卡住的本轮标 blocked(busy 排除 blocked → composer 解锁)② 持久化到 localStorage 供一键重发。
  useEffect(() => {
    if (socket.quotaExceeded === 0) return;
    const sid = activeSessionIdRef.current;
    const payload = lastSubmitRef.current;
    if (sid && payload) {
      setBlockedMessage(sid, {
        text: payload.text,
        attachments: payload.attachments,
        references: payload.references,
      });
    }
    setPendingTurns((prev) =>
      prev.length > 0
        ? prev.map((t, i) => (i === prev.length - 1 ? { ...t, blocked: true } : t))
        : prev,
    );
    pendingSendRef.current = null;
    setStopping(false);
  }, [socket.quotaExceeded]);

  useEffect(() => {
    if (!sessionId) return;
    const blocked = getBlockedMessage(sessionId);
    if (!blocked) return;
    setPendingTurns((prev) => {
      if (prev.some((t) => t.blocked)) return prev;
      return [
        ...prev,
        {
          id: `blocked-${sessionId}`,
          userText: blocked.text,
          userReferences: (blocked.references ?? []).map((r) => ({
            kind: r.kind,
            title: r.title,
            paperCount: r.paperCount,
            hasPdf: r.hasPdf,
          })),
          userAttachments: blocked.attachments.map((a) => ({
            type: a.type,
            name: a.name,
            mimeType: a.mimeType,
            size: a.size,
            path: a.path,
            previewUrl:
              a.type === 'image' && a.path ? sciDrawSessionFileUrl(sessionId, a.path) : undefined,
          })),
          blocked: true,
        },
      ];
    });
  }, [sessionId]);

  /** 停止生成 — 走 stop_generation 协议; 正常路径 agent emit message_complete → fold 标 turn 完成
      → busy 翻 false → useEffect 自动清 stopping + 撤兜底。
      加固(线上卡死修复):不再因 socket 非 open 而静默 return —— 连接死了 agent 反正收不到,
      直接靠本地兜底收口;20s 内没等到真实终帧(agent 空转 no-op / 连接死 / 幽灵轮)也本地合成
      完成帧收口。停止按钮从此是**永远有效**的逃生口,不会点一次就永久转圈。 */
  const handleStop = useCallback(() => {
    if (stopping) return;
    setStopping(true);
    setPendingTurns((prev) =>
      prev.length === 0
        ? prev
        : prev.map((t, i) =>
            i === prev.length - 1 ? { ...t, paused: true } : t
          )
    );
    if (socket.state === 'open') socket.send({ type: 'stop_generation' });
    clearStopFallback();
    stopTimerRef.current = window.setTimeout(() => {
      stopTimerRef.current = null;
      // 断连中不合成(审查修复):该轮可能仍在服务端进行,重连回放会与本地合成终帧错配串位 ——
      // 交给重连后的 resync 收口(在途 → 续流恢复;已结束 → resync-idle 对账)。只在连接
      // 健康(= agent 空转 no-op / 幽灵轮)时本地收口。
      if (socketRef.current.state === 'open') {
        socketRef.current.appendLocalFrame({ type: 'message_complete' });
      }
    }, STOP_FALLBACK_MS);
  }, [stopping, socket, clearStopFallback]);

  const adoptSession = useCallback(
    (ensuredId: string) => {
      if (ensuredId === activeSessionId) return;
      markPendingInitialModel(ensuredId);
      setActiveSessionId(ensuredId);
      notifySessionChanged('sci_draw', ensuredId);
      onSessionCreatedRef.current?.(ensuredId); // 页层回填 URL → /claw/:ensuredId
    },
    [activeSessionId],
  );

  const handleSubmit = useCallback(
    async (text: string, attachments: AttachmentDTO[], references: ReferenceItemDTO[] = []) => {
      lastSubmitRef.current = { text, attachments, references };
      const turnRefs: TurnReference[] = references.map((r) => ({
        kind: r.kind,
        title: r.title,
        paperCount: r.paperCount,
        hasPdf: r.hasPdf,
      }));
      const content = text + buildReferenceBlock(turnRefs);
      const wsAttachments = attachments.map((a) => ({
        type: a.type,
        name: a.name,
        mimeType: a.mimeType,
        path: a.path,
      }));

      // clientTurnId 在这里预 mint(而非 socket.send 里兜底):与乐观气泡 turnId 配对,
      // 撑起「user_ack 投递确认 ↔ 未送达看门狗」闭环。
      const clientTurnId = crypto.randomUUID();
      const msg: ClientMessage = {
        type: 'user_message',
        content,
        clientTurnId,
        ...(wsAttachments.length > 0 ? { attachments: wsAttachments } : {}),
      };

      if (!sessionId) {
        const pendingId = `pending-${crypto.randomUUID()}`;
        pendingSendTurnIdRef.current = pendingId;
        setPendingTurns((prev) => [
          ...prev,
          {
            id: pendingId,
            userText: text,
            userReferences: turnRefs,
            userAttachments: attachments.map((a) => ({
              type: a.type,
              name: a.name,
              mimeType: a.mimeType,
              size: a.size,
              previewUrl:
                a.type === 'image' ? sciDrawSessionFileUrl(a.sessionId, a.path) : undefined,
            })),
          },
        ]);
        pendingSendRef.current = msg;
        try {
          const created = await createSession.mutateAsync();
          if (!mountedRef.current) return; // 已卸载(用户切走)→ 丢弃这条迟到落地,别 hijack URL/状态
          markPendingInitialModel(created.sessionId);
          setActiveSessionId(created.sessionId);
          notifySessionChanged('sci_draw', created.sessionId);
          onSessionCreatedRef.current?.(created.sessionId); // 页层回填 URL → /claw/:newId(replace,不 remount)
        } catch (err) {
          toast.error((err as Error).message || '创建会话失败');
          setPendingTurns((prev) => prev.slice(0, -1));
          pendingSendRef.current = null;
        }
        return;
      }

      // 已有 session 但 WS 没就绪 → 提示重试。send 返回 false = ws 已死但 state 还没翻(陈旧窗口)
      // —— 同样按未就绪处理,**不追加**乐观气泡(旧版静默丢弃 + 照常追加 = 永无终帧的幽灵轮,
      // busy 永久卡死)。
      if (socket.state !== 'open' || !socket.send(msg)) {
        toast.error('连接未就绪, 请稍后重试');
        return;
      }

      const pendingId = `pending-${crypto.randomUUID()}`;
      setPendingTurns((prev) => [
        ...prev,
        {
          id: pendingId,
          userText: text,
          userReferences: turnRefs,
          userAttachments: attachments.map((a) => ({
            type: a.type,
            name: a.name,
            mimeType: a.mimeType,
            size: a.size,
            path: a.path,
            previewUrl: a.type === 'image' && a.path ? sciDrawSessionFileUrl(a.sessionId, a.path) : undefined,
          })),
        },
      ]);
      // 端到端投递确认:10s 内无 ack 且无任何流帧 → 该轮转「未发送·一键重发」(半死 TCP 闭环)。
      armAckWait(clientTurnId, pendingId);
    },
    [sessionId, socket, createSession, armAckWait],
  );

  // 失败轮「重试」(W5 P0-C3,与 useClawConversation 同款):复用 handleSubmit 全链路;守卫 !busy;
  // 只对最后一轮成立(渲染层只给末轮传 onRetryTurn)。
  const busyRef = useRef(false);
  busyRef.current = busy;
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;
  const handleRetryTurn = useCallback(() => {
    if (busyRef.current) return;
    const all = turnsRef.current;
    const last = all[all.length - 1];
    if (!last || !last.errorMessage) return;
    const payload = lastSubmitRef.current;
    if (payload && payload.text === last.userText) {
      void handleSubmit(payload.text, payload.attachments, payload.references ?? []);
    } else if (last.userText) {
      void handleSubmit(last.userText, [], []);
    }
  }, [handleSubmit]);

  const handleNewConversation = useCallback(() => {
    setActiveSessionId(null);
    setPendingTurns([]);
    setStopping(false);
    pendingSendRef.current = null;
    pendingSendTurnIdRef.current = null;
    clearAckWait();
    clearStopFallback();
    firedAckRef.current = null;
    deliveredTurnIdRef.current = null;
    seededMidRef.current = false;
    socket.clearMessages();
  }, [socket, clearAckWait, clearStopFallback]);

  const handleActivateSession = useCallback((sid: string) => {
    setActiveSessionId(sid);
    setPendingTurns([]);
    setStopping(false);
    pendingSendRef.current = null;
    pendingSendTurnIdRef.current = null;
    clearAckWait();
    clearStopFallback();
    firedAckRef.current = null;
    deliveredTurnIdRef.current = null;
    seededMidRef.current = false;
    socket.clearMessages();
  }, [socket, clearAckWait, clearStopFallback]);

  const resendBlocked = useCallback(() => {
    const sid = activeSessionIdRef.current;
    const payload = getBlockedMessage(sid);
    if (sid) clearBlockedMessage(sid);
    setPendingTurns((prev) => prev.filter((t) => !t.blocked));
    if (payload) void handleSubmit(payload.text, payload.attachments, payload.references ?? []);
  }, [handleSubmit]);

  const dismissBlocked = useCallback(() => {
    clearBlockedMessage(activeSessionIdRef.current);
    setPendingTurns((prev) => prev.filter((t) => !t.blocked));
  }, []);

  // 只有「确有 sessionId 且历史还没到」才算 loading。新对话(sessionId=null)立刻显示 hero/输入框。
  const loading =
    !!sessionId && (historyQuery.isLoading || historyQuery.isFetching) && turns.length === 0;

  const historyError = !!sessionId && historyQuery.isError && turns.length === 0;
  const retryHistory = useCallback(() => {
    void historyQuery.refetch();
  }, [historyQuery]);

  const composerDisabled =
    !!token &&
    (busy ||
      createSession.isPending ||
      (sessionId !== null && socket.state !== 'open'));

  return {
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
    pendingCount: pendingTurns.length,
    busy,
    stalled,
    dismissStall,
    stopping,
    loading,
    historyError,
    historyErrorObj: historyQuery.error,
    retryHistory,
    composerDisabled,
    loadEarlier,
    handleSubmit,
    handleStop,
    handleRetryTurn,
    handleNewConversation,
    handleActivateSession,
    adoptSession,
    resendBlocked,
    dismissBlocked,
  };
}
