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
  useBoltslidesContext,
  useBoltslidesHistory,
  useBoltslidesSessions,
  useCreateBoltslidesSession,
} from '../api/boltslides-session';
import { buildReferenceBlock } from '@/shared/lib/agent-references';
import type { TurnReference } from '@/shared/types/chat';
import { useBoltslidesSocket } from '../api/socket';
import type { AttachmentDTO, ClientMessage, ReferenceItemDTO } from '../api/types';
import { useBoltslidesArtifacts } from '../api/artifacts';
import {
  foldMessagesIntoTurns,
  replayHistoryAsTurns,
  type Turn,
} from '../components/chat/fold';

/**
 * 智能助手会话状态机 —— 从 ClawPage 原样抽出,桌面(ClawPage)与移动端
 * (MobileClawPage)共用。所有踩坑注释保留在原位,**别在两端各自复制这套逻辑**:
 * 历史快照不可 invalidate、断线续流对账、懒新建 pendingSend flush 等
 * 全是修过线上 bug 的浮点,改这里 = 双端同时生效。
 */

const BOLTSLIDES_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/** 拼后端取图代理 URL; path 取 basename(上传文件落在会话 cwd 根目录, agent 侧再校验越界)。 */
export function boltslidesSessionFileUrl(sessionId: string, absPath: string): string {
  const base = absPath.split('/').pop() || absPath;
  const qs = new URLSearchParams({ session_id: sessionId, path: base });
  return `${BOLTSLIDES_API_BASE}/user/boltslides/session/file?${qs.toString()}`;
}

/**
 * 历史回放: 给图片附件补 previewUrl —— transcript 里图片只剩 @path(无字节),
 * 这里指向后端代理 `/claw/session/file`, <img src> 走 scholay_token cookie 鉴权回取原图,
 * 让刷新后历史里的图片也有缩略图 + 点击放大。只处理 type=image 且有 path、还没 previewUrl 的。
 */
function withHistoryImagePreviews(turns: Turn[], sessionId: string | null): Turn[] {
  if (!sessionId) return turns;
  return turns.map((turn) => {
    if (!turn.userAttachments?.length) return turn;
    const next = turn.userAttachments.map((a) =>
      a.type === 'image' && a.path && !a.previewUrl
        ? { ...a, previewUrl: boltslidesSessionFileUrl(sessionId, a.path) }
        : a,
    );
    return { ...turn, userAttachments: next };
  });
}

/** 长会话渲染窗口: 默认只渲染最近 RENDER_WINDOW 轮, "加载更早"每次再多放 RENDER_STEP 轮。
 *  防上万轮一次性进 DOM (窗口化, 与 use-stick-to-bottom 零冲突)。 */
const RENDER_WINDOW = 60;
const RENDER_STEP = 60;
/** 历史分页: 初始只从后端拉最近 HISTORY_WINDOW 个用户轮, "加载更早"每次再多拉 HISTORY_STEP。
 *  避免上万轮 transcript 一次性 JSON.parse + 折叠 (后端 sliceRecentTurns 按 ?limit= 切)。 */
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
export function useBoltslidesConversation(opts?: {
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

  // 多会话模型 + 懒新建:
  //   - 用 useBoltslidesSessions 拉用户全部会话作为初始种子 (不再调 useClawSession 触发隐式创建,
  //     否则首次进入页面就会留一个空壳 session)
  //   - 列表为空 → activeSessionId 保持 null, UI 显示空状态 + 可输入 composer
  //   - 用户首次 send → handleSubmit 走 lazy create 路径, 真创建后再发 user_message
  //   - "+新对话" → 只是 setActiveSessionId(null), 不创建任何东西
  const sessionsQuery = useBoltslidesSessions();
  // 页层给了显式初始会话(string=激活该会话 / null=空白新对话)则以它落地;否则 null 等自动选最近。
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSeed !== undefined ? initialSeed : null,
  );

  // 初始活跃会话完全由 seed(=URL)决定:string→该会话、null/undefined→空白新对话。
  // 老的「首次拿到 sessions 后自动选最近一条」已随会话路由化**下线** —— 进入 /claw 即新对话,
  // 切具体会话走 /claw/:sessionId(见 ClawPage)。故此处不再有自动选最近的 effect。

  const sessionId = activeSessionId;
  // historyLimit = 从后端拉取的"最近 N 轮"分页窗口; "加载更早"增大它。切 session 复位。
  const [historyLimit, setHistoryLimit] = useState(HISTORY_WINDOW);
  useEffect(() => {
    setHistoryLimit(HISTORY_WINDOW);
  }, [sessionId]);
  const historyQuery = useBoltslidesHistory(sessionId, historyLimit);
  const historyHasMore = historyQuery.data?.hasMore ?? false;
  const contextQuery = useBoltslidesContext(sessionId);
  // 当前会话 ./out 产物列表(给每轮回答认领其产出的可下载文件);每轮 message_complete 后由下方 effect 刷新。
  const sessionArtifacts = useBoltslidesArtifacts(sessionId).data;
  const createSession = useCreateBoltslidesSession();

  const [pendingTurns, setPendingTurns] = useState<
    Pick<Turn, 'id' | 'userText' | 'userAttachments' | 'paused' | 'blocked'>[]
  >([]);

  // activeSessionId 的最新镜像 —— 给只依赖 [socket.quotaExceeded] 的 effect / resend 回调读,
  // 避免把 activeSessionId 放进那些 effect 的依赖里(否则切 session 会误触发 blocked 逻辑)。
  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  // 最近一次提交的原始 payload(text + 含 path 的 attachments)—— 命中额度时据此持久化「未发送」消息。
  const lastSubmitRef = useRef<{
    text: string;
    attachments: AttachmentDTO[];
    references: ReferenceItemDTO[];
  } | null>(null);

  // 懒新建: 第一次 send 时 activeSessionId 还是 null, 先 await createSession 拿新 id,
  // setActiveSessionId 触发 socket 重连; WS 没 open 之前 user_message 发不出去,
  // 暂存到这里, useEffect 看到 socket.state 翻 'open' 就把它打出去。
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

  // 跨 tab: 另一个 tab reset/创建/删除后这里 invalidate ['claw'], sessions list 重拉,
  // 但本地 activeSessionId 我们故意不动 — 用户的本地选择不被远端 reset 蹚平。
  useSessionBroadcast('boltslides');

  const socket = useBoltslidesSocket(sessionId);
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

  // WS 一旦 open 且有 pendingSend → 立刻发出去清掉。
  // 单独 useEffect 跑这个: handleSubmit 里直接 send 在 lazy create 场景下 WS 还没 open。
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

  // WS 事件副作用 — 看末尾一帧, 触发对应 invalidate:
  //   - message_complete / error → **只刷 context (token 水位) + sessions (sidebar 标题/计数)**。
  //     **绝不能 invalidate history!** —— history 是本次 mount 的快照, 流式产出的 turn 由
  //     liveTurns (socket.messages + pendingTurns) 渲染。如果这里刷 history:
  //       1) agent jsonl 可能还没 flush 完 assistant 回复 → history 拿到只有 user 的半截 turn
  //       2) 一旦 historyTurns 接管 + 清 live, 刚流出来的内容就凭空消失 (用户报的 "只剩思考过程")
  //       3) 即使 flush 完了, history + live 同一条 turn 会 double。
  //     smart-search 同款策略: 一个 session 期间不刷 history, live 累积即真相;
  //     换 session / 刷新页面时 history 才整体重载。
  //   - session_title_updated → sessions list 刷新 (拿 agent 自动生成的 title)
  useEffect(() => {
    const lastIdx = socket.messages.length - 1;
    if (lastIdx < 0) return;
    const last = socket.messages[lastIdx];
    if (last.type === 'message_complete' || last.type === 'error') {
      qc.invalidateQueries({ queryKey: ['boltslides', 'context'] });
      qc.invalidateQueries({ queryKey: ['boltslides', 'sessions'] });
      // 本轮可能往 ./out 产出了新交付物 → 刷新产物面板。
      qc.invalidateQueries({ queryKey: ['boltslides', 'artifacts'] });
    } else if (last.type === 'session_title_updated') {
      qc.invalidateQueries({ queryKey: ['boltslides', 'sessions'] });
    }
  }, [socket.messages, qc]);

  // keepPreviousData 会在 queryKey 切换、新 query 未 resolve 前继续回退「上一条 query 的数据」。
  // 两个串台场景都得挡掉,判据统一为「历史数据自带的 sessionId 必须 === 当前 sessionId 才采用」:
  //   1) sessionId=null 新对话准备态(query 被 disable,回退上一会话 history)→ 点"新对话"仍停留旧对话;
  //   2) 懒新建 null→newId 的瞬间:newId 的 history 还在 fetch,回退的还是上一会话 history
  //      → 发完第一条消息「一闪而过上一个对话」(本次用户报的 bug)。
  // "加载更早"(同 session 只换 limitTurns)data.sessionId 仍等于当前 session → 不误伤、照常保留。
  const historyData = historyQuery.data;
  const historyTurns = useMemo(
    () =>
      sessionId && historyData?.sessionId === sessionId
        ? withHistoryImagePreviews(replayHistoryAsTurns(historyData.messages), sessionId)
        : [],
    [historyData, sessionId],
  );

  // 断线续流: 重连命中 in-flight 轮时, agent 回放本轮事件并下发 resync_user(本轮用户文本)。
  // 若本地 pendingTurns 已空(= 页面被卸载过, 重挂载丢了局部 turns), 补一条 pending turn, 让
  // 回放/续流的 assistant 事件配上用户气泡, 且后续新一轮能与 messages 正确对齐。
  // seededResync 记下"确实补过", 用来判定 history 末尾那条是否就是这同一轮:
  //   - 重挂载: refetchOnMount 拉到的 history **含** in-flight 轮 → 必须去掉, 否则与 live 回放双份
  //     (用户报的"回答中切回来重复");
  //   - 同 mount 重连: history 是挂载时旧快照, **不含** in-flight 轮 → 不能去, 否则误删旧轮。
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

  // 多端实时同步:别的端在同一会话发了一句话(user_echo)→ 本端追加一条用户气泡,随后的回答
  // 经 socket.messages 自然 fold 进这一轮。content 是原文(后端回声不含注入前缀)。
  const lastPeerSeqRef = useRef(0);
  useEffect(() => {
    const pm = socket.peerMessage;
    if (!pm || pm.seq === lastPeerSeqRef.current) return;
    lastPeerSeqRef.current = pm.seq;
    setPendingTurns((prev) => [...prev, { id: `peer-${pm.seq}`, userText: pm.text }]);
  }, [socket.peerMessage]);

  // 回答中锁住竞态兜底:本端发送被 Hub 以 busy 拒(正常输入框已置灰,极少触发)→ 回滚刚乐观
  // 追加的那条 + 提示。
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

  // 续流对账: 仅当我们为续流补过 in-flight 轮(seededResync)时, 去掉 history 末尾那条(= 同一轮)。
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

  // 渲染窗口: 只把最近 renderLimit 轮渲染进 DOM (其余仍在内存, 仅不进 DOM), 防上万轮 DOM 爆炸。
  // "加载更早"增大窗口; 切 session 复位。in-flight 轮永远是最新一轮 → 必在窗口内, 不影响流式/贴底/续流。
  const [renderLimit, setRenderLimit] = useState(RENDER_WINDOW);
  useEffect(() => {
    setRenderLimit(RENDER_WINDOW);
  }, [sessionId]);
  const hiddenCount = Math.max(0, turns.length - renderLimit);
  const visibleTurns = useMemo<Turn[]>(
    () => (hiddenCount > 0 ? turns.slice(hiddenCount) : turns),
    [turns, hiddenCount],
  );

  /** "加载更早" 两段式: 先渲染已拉到但没进 DOM 的轮 (不发请求); 都渲染完还有更早的 → 向后端多要一页。 */
  const loadEarlier = useCallback(() => {
    if (hiddenCount > 0) {
      setRenderLimit((n) => n + RENDER_STEP);
    } else {
      setHistoryLimit((n) => n + HISTORY_STEP);
      setRenderLimit((n) => n + HISTORY_STEP);
    }
  }, [hiddenCount]);

  /** "正在等 AI 回答" — 看最后一条 turn 是否还没 complete (跟 SmartSearchPanel 完全同款)。
      不能再用 pendingTurns.length —— 去掉 handoff 后 pendingTurns 整个 session 都累积着,
      用它判断 busy 会让 composer 永久 disable。turn.complete 由 fold 在 message_complete 时翻 true。 */
  const lastTurn = turns[turns.length - 1];
  // blocked 轮(命中额度未发送)不算 busy —— 它停在末尾 complete=false, 不排除会把 composer 永久禁用。
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

  /** 用户已经按过 stop 但 agent 还没 emit terminal (message_complete/error) 前的过渡态。
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

  // 命中每日额度: backend 在转发给 agent **之前**就拒了这条 user_message(回 quota_exceeded 帧,
  // 该帧不进 socket.messages), agent 永不对这轮发 message_complete → 这条 pendingTurn 的
  // turn.complete 永远 false → busy 卡死、composer 永久禁用、stop 也救不了。
  // socket.quotaExceeded 是单调自增信号(从 0 起), >0 即「刚发生一次额度拦截」。
  // 处理: ① 把卡住的本轮标成 blocked(不是丢弃)→ busy 排除 blocked, composer 解锁;
  //       ② 把这条消息持久化到 localStorage(按 session)→ 用户开完会员/重置后能一键重发, 不必重打,
  //          且跳支付宝整页离开 / 换设备回来也不丢(见 restore effect)。
  // 用户已由全局额度弹窗(notifyQuotaExceeded → QuotaNotifier)知道原因并选择如何解额度。
  useEffect(() => {
    if (socket.quotaExceeded === 0) return; // 初次挂载(无拦截)跳过, 仅在自增时处理
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

  // 恢复「未发送」消息: 进入(或切回)某 session 时, 若 localStorage 里存着该会话的额度未发送消息,
  // 补一条 blocked 轮渲染出来(带一键重发)。覆盖三条路径: 跳支付宝充会员整页返回 / 换设备回来 /
  // 切到别的会话再切回来。已有 blocked 轮(live 刚标记 / 已恢复过)则不重复补。
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
          // 重建引用 chip:重发时 handleSubmit 会用 blocked.references 重附引用块,这里让恢复的
          // blocked 轮也把绿 chip 显示回来(与实时提交的气泡一致)。
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
              a.type === 'image' && a.path ? boltslidesSessionFileUrl(sessionId, a.path) : undefined,
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
    // 当前这轮标"已暂停" —— agent 不回放此信号, 本地记在最后一条 pendingTurn 上,
    // fold 透传到 Turn, terminal 事件到达后末尾渲染「已暂停」。
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

  // 方案 B: 新对话下首次"添加文件"会让后端新建会话 (文件必须落到某个会话 cwd),
  // ChatComposer 通过这个回调把新 sessionId 交回来 → adopt 它 ("添加文件 = 开始会话")。
  // 已有会话上传时 ensured === 当前 sessionId, ChatComposer 侧已做幂等, 不会触发到这里。
  const adoptSession = useCallback(
    (ensuredId: string) => {
      if (ensuredId === activeSessionId) return;
      // 新对话偏好 → 登记一次性初始模型,socket open 后发一帧交给服务端 pin(P2)。
      markPendingInitialModel(ensuredId);
      setActiveSessionId(ensuredId);
      notifySessionChanged('boltslides', ensuredId);
      onSessionCreatedRef.current?.(ensuredId); // 页层回填 URL → /claw/:ensuredId
    },
    [activeSessionId],
  );

  const handleSubmit = useCallback(
    async (text: string, attachments: AttachmentDTO[], references: ReferenceItemDTO[] = []) => {
      // 记下本次提交的原始 payload —— 命中额度时据此持久化「未发送」消息供重发(含引用)。
      lastSubmitRef.current = { text, attachments, references };
      // 引用文献:资料已由后端物化进会话 cwd 的 references/;这里把「引用块」追加到发送内容末尾
      // (agent 看见 + 历史回放可解析回 chip),展示用的 userText 仍只显示用户真正打的字。
      const turnRefs: TurnReference[] = references.map((r) => ({
        kind: r.kind,
        title: r.title,
        paperCount: r.paperCount,
        hasPdf: r.hasPdf,
      }));
      // 方案 B: content 文本 + 引用块; 文件已由 backend 推到会话隔离 cwd, 这里只透传 path。
      // 图片和文件走同一条 path 通道, agent 用 Read 工具原生分析 (vision / 文档理解 / 文本)。
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

      // 懒新建: 当前没有 active session 时, 先创建一个再 send。
      // 创建是同步 await (~100ms), 之后 setActiveSessionId 触发 socket 重连。
      // socket 没 open 之前 user_message 发不出, 暂存到 pendingSendRef, 上面的
      // useEffect 看到 socket.state='open' 会自动 flush(flush 成功后挂未送达看门狗)。
      if (!sessionId) {
        const pendingId = `pending-${crypto.randomUUID()}`;
        pendingSendTurnIdRef.current = pendingId;
        // 用户气泡先本地显示 (与已有 session 一致体验; 真发送在 WS open 后)
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
              // 已发送气泡里图片缩略图/放大 —— 用后端代理 URL(与历史回放一致), 文件刚 push 到
              // 会话 cwd, 代理立即可取; 不依赖会泄漏的本地 object URL。
              previewUrl:
                a.type === 'image' ? boltslidesSessionFileUrl(a.sessionId, a.path) : undefined,
            })),
          },
        ]);
        pendingSendRef.current = msg;
        try {
          const created = await createSession.mutateAsync();
          if (!mountedRef.current) return; // 已卸载(用户切走)→ 丢弃这条迟到落地,别 hijack URL/状态
          // 新对话偏好 → 登记一次性初始模型,socket open 后发一帧交给服务端 pin(P2)。
          markPendingInitialModel(created.sessionId);
          setActiveSessionId(created.sessionId);
          // 通知同源其它 tab 列表刷新 (但不切它们的 activeSessionId)
          notifySessionChanged('boltslides', created.sessionId);
          onSessionCreatedRef.current?.(created.sessionId); // 页层回填 URL → /claw/:newId(replace,不 remount)
        } catch (err) {
          toast.error((err as Error).message || '创建会话失败');
          // 失败回滚 pendingTurn + pendingSend
          setPendingTurns((prev) => prev.slice(0, -1));
          pendingSendRef.current = null;
        }
        return;
      }

      // 已有 session 但 WS 没就绪: 给用户提示 (不像懒新建那样自动 queue, 因为
      // 这是 reconnect 中状态, 用户不应感受成 "正在创建")。
      // send 返回 false = ws 已死但 state 还没翻(陈旧窗口)—— 同样按未就绪处理,**不追加**乐观
      // 气泡(旧版静默丢弃 + 照常追加 = 永无终帧的幽灵轮,busy 永久卡死)。
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
            // 已发送气泡里图片显示缩略图 + 点击放大(与 lazy 新建 / blocked 恢复 / 历史回放一致)。
            // 此前已有 session 的正常发送路径漏了 path/previewUrl → 图片掉成文件名胶囊(用户反馈)。
            previewUrl: a.type === 'image' && a.path ? boltslidesSessionFileUrl(a.sessionId, a.path) : undefined,
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

  // "新对话" 按钮 — 懒新建语义: 不调 API, 不创建任何 DB 行,
  // 只把本地状态重置成 "空白会话准备态"。真创建发生在用户提交第一条 message 时。
  // 这样避免点了按钮但没说话留下的 "空壳 session" 出现在 sidebar 列表里。
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

  // 用户点已有会话 → 切换 activeSessionId, 让下游 hook 重 key + WS 重连。
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

  // 一键重发「未发送」消息(命中额度被拦的那条): 清持久化 + 移除 blocked 轮 → 走正常发送。
  // 若额度仍未解(没开会员/没重置), 会再次被拦成 blocked(行为一致, 不会卡死)。
  const resendBlocked = useCallback(() => {
    const sid = activeSessionIdRef.current;
    const payload = getBlockedMessage(sid);
    if (sid) clearBlockedMessage(sid);
    setPendingTurns((prev) => prev.filter((t) => !t.blocked));
    if (payload) void handleSubmit(payload.text, payload.attachments, payload.references ?? []);
  }, [handleSubmit]);

  // 忽略「未发送」消息: 清持久化 + 移除 blocked 轮(用户决定不再发这条)。
  const dismissBlocked = useCallback(() => {
    clearBlockedMessage(activeSessionIdRef.current);
    setPendingTurns((prev) => prev.filter((t) => !t.blocked));
  }, []);

  // 全屏 loader 只在"真的没东西可渲染"时显示。
  // 关键: lazy create 第一条消息时, setActiveSessionId(newId) 会让 historyQuery 短暂 loading,
  // 但此时已有 pendingTurns (用户气泡 + 流式回答) → turns.length>0, 不能用 spinner 盖掉它。
  //
  // refetchOnMount:'always' 下, 重入页面时 history 走后台 refetch (isLoading=false 但
  // isFetching=true), 此时若还没 turns, 用 isFetching 一并兜住, 避免空态闪一下再冒出对话。
  // 只有「确有 sessionId 且历史还没到」才算 loading。新对话(sessionId=null)立刻显示 hero/输入框。
  const loading =
    !!sessionId && (historyQuery.isLoading || historyQuery.isFetching) && turns.length === 0;

  // 历史读失败的错误态 —— 让页面显示「加载失败 + 重试」而非静默退化成空白 hero。
  // 背景: 后端读 agent 历史的往返超时只有 10s, 会话大 / agent 忙时超时 → 502;
  // 之前 ClawPage 只有 loading 和「turns 空 → 空 hero」两个分支, 不读 isError →
  // 一次瞬时失败就被伪装成「这个会话没有内容」。这里把错误态透出, 由页面给可重试出口。
  // (注: 只在确有 sessionId 且没东西可渲染时算错误态; 重试中 isFetching=true → loading 接管。)
  const historyError = !!sessionId && historyQuery.isError && turns.length === 0;
  const retryHistory = useCallback(() => {
    void historyQuery.refetch();
  }, [historyQuery]);

  // 三种 disable 场景:
  //   1) busy: AI 正在回答, 不允许插队
  //   2) 创建中: 懒新建路径的 await createSession 期间
  //   3) 已有 session 但 WS 没就绪: 切换/重连中
  // 注意: sessionId=null + 非创建中 不该 disable —— 这是"新对话准备态"。
  // 未登录:不按 WS/会话态禁用 (那是登录后才有的概念) —— 否则残留的 activeSessionId
  // 会让 socket.state!=='open' 把输入框 + 发送按钮禁用、发送按钮永久转圈。
  // 未登录的交互一律走 requireAuth 弹登录。
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
