/**
 * 通用 agent WS 订阅 hook —— 智能搜索 / 智能助手 / 智能写作三个 feature 原本各维护一份
 * 近乎逐行相同的 WS hook(ws-ticket + 指数退避重连 + rAF 流式批处理 + 25s 心跳 +
 * 断线续流 resync + 多窗口接管 displaced + isCurrent 过期连接守卫)。收口到这里一份,
 * 各 feature 退化为薄封装(只填 ticket 端点 + WS URL + 可选 onOpen)。
 *
 * 统一基线取自 claw/prism(较新):重连 8 次 / 封顶 60s + 25s 应用层心跳;智能搜索原本
 * 落后(5 次 / 16s 且无心跳),收口后一并对齐(纯增强,无回归)。
 *
 * 放 shared/hooks 与既有 useNotificationSocket 同层(后者也读 useAuthStore);WS 用原生
 * WebSocket(项目铁律,不引 socket.io)。
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import {
  appendStreamMessage,
  truncateToLastComplete,
  asAgentErrorFrame,
  asAgentDisplacedFrame,
  asAgentResyncUserFrame,
  asAgentUserEchoFrame,
  type AgentStreamMessage,
} from '@/shared/lib/agent-stream';
import { notifyQuotaExceeded, notifyBillingChanged, isQuotaSignal } from '@/shared/lib/quota-events';

/** 后端 ws-ticket 端点响应:sessionId 一并返回方便兜底,wsToken 是 30s 一次性 ticket。 */
export interface AgentWSTicket {
  sessionId: string;
  wsToken: string;
  expiresInSeconds: number;
}

export type AgentWSState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'error'
  | 'displaced';

export interface UseAgentSocketOptions {
  /** 连接键:null/0/'' → idle 不连;值变化时重连(通常是 sessionId 或 projectId)。 */
  connectionKey: string | number | null;
  /** 取一次性 ws ticket(闭包绑定当前 connectionKey;每次 connect/reconnect 都重新申请)。 */
  fetchTicket: () => Promise<AgentWSTicket>;
  /** 由 ticket 的 sessionId + wsToken 构造 WS URL。 */
  buildWsUrl: (sessionId: string, wsToken: string) => string;
  /** WS 打开后的额外动作(如 claw push set_runtime_config 模型偏好)。可选。 */
  onOpen?: (ws: WebSocket) => void;
  /** displaced 帧无 message 时的兜底提示文。 */
  displacedDefaultText?: string;
}

export interface UseAgentSocket<TServer, TClient> {
  state: AgentWSState;
  /** 累积全部 server 事件;UI 自己扫描归并 */
  messages: TServer[];
  /**
   * 发送一帧。返回是否**真的写出去了**:WS 不在 OPEN(含「close 事件已发生但 React state 还没
   * 翻过来」的陈旧窗口)→ false。调用方据此决定是否乐观追加用户气泡 —— 旧版 void 静默丢弃是
   * 「幽灵轮永久卡 busy」的成因之一。注意 true 只代表已写入本端 socket 缓冲,半死 TCP 下仍可能
   * 未送达 —— 端到端确认靠 user_ack(见 userAck)。
   */
  send: (m: TClient) => boolean;
  /**
   * 本地合成一帧追加进 messages(先冲刷 rAF 缓冲保证顺序)。用于「终帧永久丢失」的对账收口:
   * stop 兜底 / resync-idle 对账把一条永远等不到终帧的轮就地收口(fold 视 error/message_complete
   * 为终帧)。⚠️ 只应在「确认不会再有该轮的真实终帧」时调用(连接死 / 服务端已确认 idle),
   * 否则迟到的真实终帧会被 fold 的按位对齐错配到下一轮。
   */
  appendLocalFrame: (m: TServer) => void;
  /** 主动关闭,不再触发自动重连 */
  close: () => void;
  /** 重连尝试序号;0 = 首次或刚连上 */
  reconnectAttempt: number;
  /** 清空累积 messages —— 「新对话」拿到新 sessionId 后老事件不再展示 */
  clearMessages: () => void;
  /** 被另一窗口/tab 接管时后端下发 displaced 帧的提示文;null = 当前未被接管 */
  displacedReason: string | null;
  /** "切回这里" → 抢回活跃权(本端重连,把其他窗口顶下去) */
  takeOver: () => void;
  /** 断线续流:重连命中"上一连接的生成仍在进行"时 agent 通过 resync_user 下发本轮用户文本。无续流时 null。 */
  resyncUserText: string | null;
  /**
   * 多端实时同步:**别的浏览器/标签**在同一 session 发了一句话时,后端(扇出 Hub)合成 user_echo
   * 帧广播过来(本端自己发的不回声)。该帧不进 `messages`,消费方据 `seq` 自增,往 pendingTurns
   * 追加一条「用户气泡」—— 这样另一端发的消息 + 随后的回答都能在本端实时出现。无则 null。
   */
  peerMessage: { seq: number; text: string } | null;
  /**
   * 「回答中锁住」竞态兜底的单调计数 —— 一轮进行中再发被 Hub 拒(error/code=busy)时自增。
   * 该帧不进 `messages`,消费方据此回滚刚乐观追加的那条 pendingTurn + toast(正常情况下输入框
   * 因 busy 已置灰,极少触发)。
   */
  busyRejected: number;
  /**
   * 命中每日额度的单调计数 —— 每收到一帧 `error/quota_exceeded` 自增(从不归零)。
   * 该帧不进 `messages`(见下方拦截),所以末帧不会是 terminal、本轮 turn 永远 complete=false →
   * 上层 busy 会卡死 composer。消费方据此「自增信号」回滚卡住的本轮(见 claw useClawConversation)。
   */
  quotaExceeded: number;
  /**
   * 会话当前生效模型(P2 模型目录化,服务端权威)。来源 = backend hub 的 runtime_config_updated
   * 广播帧:建连/hub 重建迟到补帧、本端或**其他端**换模型都会更新 —— 多 tab 选择器实时一致。
   * isDefault=true 表示跟随 feature 默认绑定(用户未显式锁定)。null = 尚未收到(目录未配置/旧后端)。
   */
  sessionModel: { modelId: string; isDefault: boolean } | null;
  /**
   * 投递确认:backend hub 把 user_message 成功写入上游 agent 后回 user_ack(seq 单调自增)。
   * 消费方据此撤销「未送达看门狗」;超时等不到 → 该条转「未发送·一键重发」(幽灵轮闭环)。
   */
  userAck: { clientTurnId: string; seq: number } | null;
  /**
   * 对账信号(单调计数):每次(重)建连,hub 在回放段末尾发 resync_end{inFlight};inFlight=false
   * =「服务端当前无在途轮」的权威信号 → 自增一次。消费方若此刻本地还挂着未完成的 live 轮,
   * 说明其终帧永远不会来了(断连期间轮已结束 / agent·backend 中途死过 / 消息未送达),据此收口:
   * 幽灵轮转 blocked、可重发;有内容的中断轮用 appendLocalFrame 合成 error 终帧。
   */
  resyncIdle: number;
}

/** 弱网友好的指数退避:1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s ... 上限 8 次 ≈ 3-4 分钟。 */
const MAX_RECONNECT_ATTEMPTS = 8;
function reconnectDelayMs(attempt: number) {
  return Math.min(1000 * 2 ** Math.min(attempt, 6), 60000);
}
/** 25s 应用层心跳,跟 backend FeatureSpec.PingIntervalOrDefault 对齐(须 < agent idleTimeout 60s)。 */
const PING_INTERVAL_MS = 25000;
/**
 * 无帧看门狗:连接 open 后,超过这么久「一帧都没收到」(连每 25s ping 的 pong 都没回)→
 * 判定为「半死连接」(TCP 还在但 backend→frontend 不再投递,远程/弱网常见),强制 close 触发
 * 重连 + agent 续流(resync),否则前端会永远卡在「修改中/思考中」等一个永不到达的 message_complete。
 * 取 45s(> 25s ping 一个来回 + 余量),正常流式/idle 都有 pong 在 25s 内刷新,不会误杀。
 */
const STALL_TIMEOUT_MS = 45000;
const STALL_CHECK_MS = 10000;

// ── 被接管(displaced)后的「自动恢复」──────────────────────────────────────
// 被踢的页签在**可见**时定时尝试 takeOver 重连:占用方若已走开,就静默接回来。
// 三道防 ping-pong / 死锁的闸:
//   ① 只有 document 可见的 tab 才尝试 —— 后台 tab 不参与抢,所以"多 tab、只看一个"天然无竞争;
//   ② 间隔 + 随机抖动 —— 错开两个**同时可见**窗口的尝试,不会同一刻对撞;
//   ③ 连续被踢累计到上限 → 放弃自动、退回手动 banner —— 两个都想要时不会无限互抢(livelock);
//   ④ 连上后稳定保持一段时间 → 把"连续被踢"计数清零 —— 恢复下一轮自动能力。
const AUTO_RECOVER_BASE_MS = 4000; // 基础重试间隔
const AUTO_RECOVER_JITTER_MS = 2500; // 随机抖动上限(错开同时可见的两 tab)
const AUTO_RECOVER_MAX_ATTEMPTS = 4; // 连续被踢上限 → 放弃自动恢复
const AUTO_RECOVER_STABLE_MS = 15000; // 连上稳定保持这么久 → 清零计数
// error 终态(8 次重连耗尽)的自愈重试间隔:此前 error 是无自愈死路 —— 一次发版/agent 长挂就把
// 该 mount 永久锁死(composer 因 socket 非 open 恒禁用、页面又无重连入口),用户被迫刷新/开新对话。
// 现在页面可见时每 ~20s 拉起一轮完整重连(内部自带指数退避),服务端恢复后自动接回。
// 与 displaced 不同没有两端互抢的 livelock 风险,故不设次数上限。
const ERROR_RECOVER_BASE_MS = 20000;

export function useAgentSocket<TServer extends AgentStreamMessage, TClient>(
  opts: UseAgentSocketOptions,
): UseAgentSocket<TServer, TClient> {
  const { connectionKey } = opts;
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<AgentWSState>('idle');
  const [messages, setMessages] = useState<TServer[]>([]);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [displacedReason, setDisplacedReason] = useState<string | null>(null);
  const [resyncUserText, setResyncUserText] = useState<string | null>(null);
  // 单调递增,不随 connectionKey/token 重连归零 —— 保持单调让消费方的 effect 只在「真发生新一次
  // 额度拦截」时触发(若归零, 1→0 的变化会误触发回滚一个并未超额的会话)。
  const [quotaExceeded, setQuotaExceeded] = useState(0);
  // 多端同步:别的端发的话(user_echo)。seq 单调自增,消费方据 seq 变化追加一条用户气泡。
  const [peerMessage, setPeerMessage] = useState<{ seq: number; text: string } | null>(null);
  const peerSeqRef = useRef(0);
  // 回答中锁住竞态兜底:被 Hub 以 error/busy 拒的单调计数。
  const [busyRejected, setBusyRejected] = useState(0);
  // 会话当前生效模型(runtime_config_updated 帧驱动;换会话清空,重连由 hub 迟到补帧恢复)。
  const [sessionModel, setSessionModel] = useState<{ modelId: string; isDefault: boolean } | null>(null);
  // 投递确认(user_ack 帧驱动;seq 单调,消费方据变化撤销未送达看门狗)。
  const [userAck, setUserAck] = useState<{ clientTurnId: string; seq: number } | null>(null);
  const ackSeqRef = useRef(0);
  // 对账信号:resync_end{inFlight:false} 单调计数(不随重连归零,与 quotaExceeded 同款语义)。
  const [resyncIdle, setResyncIdle] = useState(0);
  // appendLocalFrame 需要 effect 闭包里的 flushNow(先冲刷 rAF 缓冲,保证与流帧顺序)→ ref 桥接。
  const flushNowRef = useRef<(() => void) | null>(null);
  // 本端出站 user_message 的 clientTurnId 有界记录(审查修复):hub 的 echoToOthers 按「订阅者指针」
  // 排除发送者,发送者**重连后的新 socket** 是别的指针 → 自己的回声会被误投回来;若不识别丢弃,
  // 消费方会把它当别端消息追加一条永无终帧的孤儿轮(busy 永久卡死,正是本次事故形态)。
  // 命中自回声同时视作**隐式投递确认**(回声 = hub 已收到该消息),与 user_ack 同路上抛。
  const sentTurnIdsRef = useRef<{ set: Set<string>; order: string[] }>({ set: new Set(), order: [] });
  const rememberSentTurnId = (id: string) => {
    const s = sentTurnIdsRef.current;
    if (s.set.has(id)) return;
    s.set.add(id);
    s.order.push(id);
    if (s.order.length > 50) {
      const old = s.order.shift();
      if (old) s.set.delete(old);
    }
  };
  const wsRef = useRef<WebSocket | null>(null);
  const cancelledRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const pingTimerRef = useRef<number | null>(null);
  /** 无帧看门狗:最近一次收到任意帧的时间戳 + 周期检查 timer。 */
  const lastFrameAtRef = useRef(0);
  const stallTimerRef = useRef<number | null>(null);
  /** displaced 标记 — onmessage 设, onclose 据此跳过重连(ref 而非 state,闭包不感知 state) */
  const displacedRef = useRef(false);
  /** 暴露给 takeOver 用 — useEffect 内才有 connect 闭包,通过 ref 桥到外部 */
  const reconnectNowRef = useRef<(() => void) | null>(null);
  /** 自动恢复:连续被踢计数(防 livelock)+ 重试 timer + 稳定保持 timer。 */
  const displacedAttemptsRef = useRef(0);
  const recoverTimerRef = useRef<number | null>(null);
  const stableTimerRef = useRef<number | null>(null);
  /** 回调放 ref:effect 只依赖 connectionKey + token,connect 内读到的永远是最新闭包(fetchTicket 绑当前 key)。 */
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!connectionKey || !token) {
      setState('idle');
      return;
    }
    cancelledRef.current = false;
    attemptsRef.current = 0;
    setReconnectAttempt(0);
    displacedRef.current = false;
    setDisplacedReason(null);
    setResyncUserText(null);
    setMessages([]);
    setSessionModel(null); // 换会话清空;新连接由 hub 迟到补帧(runtime_config_updated)恢复

    // ── 流式批处理 (rAF coalesce) ──────────────────────────────────────────
    // 高频内容帧在同一动画帧内合并成一次 setMessages,避免每 token 全量重折叠+重渲染
    // (长会话单 mount O(N²) 卡顿来源)。控制帧 (displaced/resync_*) 仍即时按序处理(先 flushNow)。
    const pendingEvents: TServer[] = [];
    let rafId: number | null = null;
    const flushPending = () => {
      rafId = null;
      if (pendingEvents.length === 0) return;
      const batch = pendingEvents.splice(0, pendingEvents.length);
      setMessages((prev) => batch.reduce<TServer[]>((acc, evt) => appendStreamMessage(acc, evt), prev));
    };
    const scheduleFlush = () => {
      if (rafId === null) rafId = window.requestAnimationFrame(flushPending);
    };
    const flushNow = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      flushPending();
    };
    flushNowRef.current = flushNow;

    const scheduleReconnectOrError = () => {
      if (cancelledRef.current) {
        setState('closed');
        return;
      }
      if (displacedRef.current) {
        setState('displaced');
        return;
      }
      if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setState('error');
        return;
      }
      const delay = reconnectDelayMs(attemptsRef.current);
      attemptsRef.current += 1;
      setReconnectAttempt(attemptsRef.current);
      setState('reconnecting');
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    const connect = async () => {
      if (cancelledRef.current) return;
      setState(attemptsRef.current > 0 ? 'reconnecting' : 'connecting');
      let ticket: AgentWSTicket;
      try {
        ticket = await optsRef.current.fetchTicket();
      } catch {
        if (cancelledRef.current) {
          setState('closed');
          return;
        }
        scheduleReconnectOrError();
        return;
      }
      if (cancelledRef.current) {
        setState('closed');
        return;
      }
      const ws = new WebSocket(optsRef.current.buildWsUrl(ticket.sessionId, ticket.wsToken));
      wsRef.current = ws;
      // isCurrent — 所有 WS event handler 都用这个把关,跳过"过期连接"的事件。
      // 场景:用户切 session 时 useEffect cleanup close 旧 WS,但旧 WS 的网络事件
      // (backend 异步发的 displaced 帧 / close)可能在 cleanup 之后异步抵达。
      // 这些 event 若直接 setState 会污染新 WS 的状态(典型 bug:误显示 displaced banner)。
      const isCurrent = () => wsRef.current === ws;
      ws.onopen = () => {
        if (cancelledRef.current || !isCurrent()) {
          ws.close();
          return;
        }
        attemptsRef.current = 0;
        setReconnectAttempt(0);
        setState('open');
        lastFrameAtRef.current = Date.now();
        pingTimerRef.current = window.setInterval(() => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, PING_INTERVAL_MS);
        // 无帧看门狗:open 后周期检查;太久没收到任何帧 → 半死连接 → 主动 close 触发重连+续流。
        stallTimerRef.current = window.setInterval(() => {
          if (ws.readyState === ws.OPEN && Date.now() - lastFrameAtRef.current > STALL_TIMEOUT_MS) {
            ws.close(); // onclose → scheduleReconnectOrError → 重连(agent 回放 resync)
          }
        }, STALL_CHECK_MS);
        optsRef.current.onOpen?.(ws);
      };
      ws.onmessage = (ev) => {
        if (!isCurrent()) return; // 过期 WS 的消息不消费,防 displaced 误触发等
        lastFrameAtRef.current = Date.now(); // 看门狗:任何帧(含 pong)都算「连接还活着」
        let evt: TServer;
        try {
          evt = JSON.parse(ev.data) as TServer;
        } catch {
          return; // 忽略非 JSON 帧(理论上不会发生)
        }
        // 会话模型变更帧(P2):hub 校验通过后广播 / 迟到补帧。不进 messages(fold 不消费)。
        if ((evt as { type?: string }).type === 'runtime_config_updated') {
          const f = evt as unknown as { modelId?: string; isDefault?: boolean };
          if (typeof f.modelId === 'string' && f.modelId) {
            setSessionModel({ modelId: f.modelId, isDefault: f.isDefault === true });
          }
          return;
        }
        // 控制帧即时按序处理:先 flushNow 把已缓冲内容打出去,保证 resync_start 的 truncate /
        // displaced 不被高频内容帧错位或盖过。控制帧不进 messages 列表(fold 不消费)。
        if (
          evt.type === 'displaced' ||
          evt.type === 'resync_start' ||
          evt.type === 'resync_user' ||
          evt.type === 'resync_end' ||
          evt.type === 'user_echo' ||
          evt.type === 'user_ack'
        ) {
          flushNow();
          if (evt.type === 'displaced') {
            // 注:抢占模型已下线(后端扇出 Hub 不再发 displaced),此分支当前为死路,保留兜底。
            displacedRef.current = true;
            setDisplacedReason(
              asAgentDisplacedFrame(evt)?.message ??
                optsRef.current.displacedDefaultText ??
                '此会话已在其他窗口打开',
            );
            setState('displaced');
          } else if (evt.type === 'resync_start') {
            setMessages((prev) => truncateToLastComplete(prev));
          } else if (evt.type === 'resync_user') {
            setResyncUserText(asAgentResyncUserFrame(evt)?.content ?? '');
          } else if (evt.type === 'resync_end') {
            // 对账信号:hub 在每次(重)建连的回放段末尾下发;inFlight=false = 服务端当前无在途轮
            // → 自增单调计数,消费方据此把「终帧永久丢失」的本地卡死轮当场收口(busy 卡死闭环)。
            const f = evt as unknown as { inFlight?: boolean };
            if (f.inFlight === false) setResyncIdle((n) => n + 1);
          } else if (evt.type === 'user_echo') {
            // 多端同步:别的端发的话 → 抛给消费方追加一条用户气泡(不进 messages,本端不渲染成 assistant)。
            // 自回声过滤(审查修复):带着本端刚发过的 clientTurnId 的回声 = hub 把我们自己的消息
            // 误投回来(重连后指针变了)→ 丢弃,不追加孤儿轮;同时它证明消息已送达 → 当隐式 ack 上抛。
            const echoTurnId = (evt as unknown as { clientTurnId?: string }).clientTurnId;
            if (echoTurnId && sentTurnIdsRef.current.set.has(echoTurnId)) {
              ackSeqRef.current += 1;
              setUserAck({ clientTurnId: echoTurnId, seq: ackSeqRef.current });
              return;
            }
            const text = asAgentUserEchoFrame(evt)?.content ?? '';
            peerSeqRef.current += 1;
            setPeerMessage({ seq: peerSeqRef.current, text });
          } else if (evt.type === 'user_ack') {
            // 投递确认:hub 已把 user_message 写入上游。seq 单调自增供消费方撤未送达看门狗。
            const f = evt as unknown as { clientTurnId?: string };
            ackSeqRef.current += 1;
            setUserAck({ clientTurnId: f.clientTurnId ?? '', seq: ackSeqRef.current });
          }
          return;
        }
        // 额度耗尽帧:agent 桥接以 error/quota_exceeded 下发 → 弹全局重置弹窗(不进 messages)。
        // 带类型读 error 帧(asAgentErrorFrame),额度判定走统一谓词 isQuotaSignal(与 http/SSE 同一处)。
        const errFrame = asAgentErrorFrame(evt);
        if (errFrame && isQuotaSignal(errFrame)) {
          notifyQuotaExceeded({ message: errFrame.message });
          // 信号上抛:本轮被 backend 在转发前拒绝, 不会有 message_complete 收尾 →
          // 消费方据此回滚卡住的本轮, 否则 busy 永久 disable composer。
          setQuotaExceeded((n) => n + 1);
          return;
        }
        // 回答中锁住竞态:一轮进行中再发被 Hub 拒(error/code=busy)。不进 messages,抛信号让消费方
        // 回滚刚乐观追加的那条 pendingTurn(正常输入框已因 busy 置灰,极少触发)。
        if (errFrame && errFrame.code === 'busy') {
          setBusyRejected((n) => n + 1);
          return;
        }
        // 系统通知帧(执行器实时警告性质,不进 messages、fold 不消费):按 kind 白名单展示。
        //   - context_compacted:上下文滚动摘要压缩 → 低调提示;
        //   - output_truncated(W3-5c,输出撞长度上限):warning 提示「内容可能不完整,可分段继续」;
        //   - 未识别 kind:静默忽略(冻结契约;降级为无提示,不劣于现状)。
        if (evt.type === 'system_notification') {
          const kind = (evt as { kind?: string }).kind;
          const msg = (evt as { message?: string }).message;
          if (kind === 'context_compacted') {
            if (msg) toast.message(msg, { duration: 6000 });
          } else if (kind === 'output_truncated') {
            if (msg) toast.warning(msg, { duration: 8000 });
          }
          return;
        }
        // 一轮 AI 结束 → 用量已落账,广播刷新额度(触发过半/将尽阈值 toastr)。
        if (evt.type === 'message_complete') notifyBillingChanged();
        // pong/connected 不进 messages(审查修复):fold 本就忽略它们,而它们污染 messages.length
        // 会让消费方把「保活/握手」误当「本轮有真实进展」(未送达看门狗被 pong 误撤 → 幽灵轮失守)。
        // 保活语义已由上面的 lastFrameAtRef 刷新承担。
        if (evt.type === 'pong' || evt.type === 'connected') return;
        // 内容帧:入缓冲,下一动画帧合并 flush。
        pendingEvents.push(evt);
        scheduleFlush();
      };
      ws.onerror = () => {
        // 不立即 setState;等 onclose 决定走重连还是错误终态
      };
      ws.onclose = () => {
        if (pingTimerRef.current) {
          window.clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        if (stallTimerRef.current) {
          window.clearInterval(stallTimerRef.current);
          stallTimerRef.current = null;
        }
        // 只有当 ws 仍是 active 那条时才触发重连决策;过期 ws 的 close(cleanup 主动 close /
        // 被 backend displace)不应改 state / 触发重连,否则污染新 ws 状态机。
        if (!isCurrent()) return;
        wsRef.current = null;
        scheduleReconnectOrError();
      };
    };

    reconnectNowRef.current = () => {
      if (cancelledRef.current) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      displacedRef.current = false;
      setDisplacedReason(null);
      attemptsRef.current = 0;
      setReconnectAttempt(0);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      void connect();
    };

    connect();

    return () => {
      cancelledRef.current = true;
      reconnectNowRef.current = null;
      flushNowRef.current = null;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (stallTimerRef.current) {
        window.clearInterval(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      setState('closed');
    };
    // optsRef 让 fetchTicket/buildWsUrl/onOpen 始终最新,故只需 connectionKey + token 作依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionKey, token]);

  // ── displaced 自动恢复 ────────────────────────────────────────────────────
  // 被接管后:可见的 tab 间隔 + 抖动地尝试 takeOver(占用方走了就静默接回);连续被踢到上限就
  // 放弃自动、退手动 banner(防两 tab 无限互抢);连上稳定保持一段时间则清零计数。
  // 依赖 state:每次进入 displaced / open 各跑一次,timer 在 cleanup 里清干净(无悬挂 → 无死锁)。
  useEffect(() => {
    const clearRecover = () => {
      if (recoverTimerRef.current !== null) {
        window.clearTimeout(recoverTimerRef.current);
        recoverTimerRef.current = null;
      }
    };
    const clearStable = () => {
      if (stableTimerRef.current !== null) {
        window.clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
    };

    if (state === 'open') {
      // 连上了:稳定保持 AUTO_RECOVER_STABLE_MS 后清零"连续被踢"计数(下一轮又能自动恢复)。
      clearRecover();
      clearStable();
      stableTimerRef.current = window.setTimeout(() => {
        displacedAttemptsRef.current = 0;
      }, AUTO_RECOVER_STABLE_MS);
      return clearStable;
    }

    if (state === 'error') {
      // 重连预算耗尽的终态自愈:可见 tab 周期性拉起重连(reconnectNow 归零 attempts → 完整一轮
      // 指数退避)。后台 tab 不试,回到前台立刻补一次 —— 「合盖过夜再打开」秒级恢复。
      clearStable();
      const scheduleErr = () => {
        clearRecover();
        if (document.visibilityState !== 'visible') return;
        recoverTimerRef.current = window.setTimeout(() => {
          recoverTimerRef.current = null;
          if (document.visibilityState === 'visible') reconnectNowRef.current?.();
        }, ERROR_RECOVER_BASE_MS + Math.random() * AUTO_RECOVER_JITTER_MS);
      };
      const onVisibilityErr = () => {
        if (document.visibilityState === 'visible') scheduleErr();
      };
      document.addEventListener('visibilitychange', onVisibilityErr);
      scheduleErr();
      return () => {
        document.removeEventListener('visibilitychange', onVisibilityErr);
        clearRecover();
      };
    }

    if (state !== 'displaced') {
      clearRecover();
      return;
    }

    // state === 'displaced':累计一次;超上限就不再自动(退回手动 banner,断开 livelock)。
    clearStable();
    displacedAttemptsRef.current += 1;
    if (displacedAttemptsRef.current > AUTO_RECOVER_MAX_ATTEMPTS) {
      clearRecover();
      return;
    }

    const schedule = () => {
      clearRecover();
      if (document.visibilityState !== 'visible') return; // 后台 tab 不参与抢
      const delay = AUTO_RECOVER_BASE_MS + Math.random() * AUTO_RECOVER_JITTER_MS;
      recoverTimerRef.current = window.setTimeout(() => {
        recoverTimerRef.current = null;
        if (document.visibilityState === 'visible') {
          reconnectNowRef.current?.(); // takeOver:重连接管;成功则 open,失败/被抢回则再次 displaced
        }
      }, delay);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearRecover();
    };
  }, [state]);

  return {
    state,
    messages,
    reconnectAttempt,
    displacedReason,
    send: (m) => {
      const ws = wsRef.current;
      // 返回 false = 没写出去(WS 不在 OPEN,含 React state 尚未翻转的陈旧窗口)。调用方据此
      // 决定是否乐观追加用户气泡 —— 旧版 void 静默丢弃会留下永无终帧的幽灵轮(busy 永久卡死)。
      if (!ws || ws.readyState !== ws.OPEN) return false;
      // P1(web-native 重构):给 user_message 帧附一个 clientTurnId 幂等键,让后端 turn 日志
      // 对「重发 / 双击」去重(后端缺失会自行 mint UUID,故这是增强而非必需)。
      const probe = m as { type?: string; clientTurnId?: string };
      const payload =
        probe?.type === 'user_message' && !probe.clientTurnId
          ? { ...(m as object), clientTurnId: crypto.randomUUID() }
          : m;
      // 记录出站 user_message 的 clientTurnId(有界)→ 自回声识别 + 隐式 ack(见 sentTurnIdsRef 注释)。
      const finalId = (payload as { type?: string; clientTurnId?: string });
      if (finalId?.type === 'user_message' && finalId.clientTurnId) rememberSentTurnId(finalId.clientTurnId);
      ws.send(JSON.stringify(payload));
      return true;
    },
    appendLocalFrame: (m) => {
      // 先冲刷 rAF 缓冲再追加,保证合成帧与真实流帧的相对顺序(实际调用场景连接已死/服务端已
      // 确认 idle,缓冲几乎必空,这里是 belt-and-suspenders)。
      flushNowRef.current?.();
      setMessages((prev) => [...prev, m]);
    },
    close: () => {
      cancelledRef.current = true;
      wsRef.current?.close();
    },
    clearMessages: () => setMessages([]),
    takeOver: () => reconnectNowRef.current?.(),
    resyncUserText,
    peerMessage,
    busyRejected,
    quotaExceeded,
    sessionModel,
    userAck,
    resyncIdle,
  };
}
