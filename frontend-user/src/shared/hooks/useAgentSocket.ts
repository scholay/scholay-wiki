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
import { useAuthStore } from '@/stores/auth.store';
import {
  appendStreamMessage,
  truncateToLastComplete,
  type AgentStreamMessage,
} from '@/shared/lib/agent-stream';
import { notifyQuotaExceeded, notifyBillingChanged } from '@/shared/lib/quota-events';

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
  send: (m: TClient) => void;
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
        // 控制帧即时按序处理:先 flushNow 把已缓冲内容打出去,保证 resync_start 的 truncate /
        // displaced 不被高频内容帧错位或盖过。控制帧不进 messages 列表(fold 不消费)。
        if (
          evt.type === 'displaced' ||
          evt.type === 'resync_start' ||
          evt.type === 'resync_user' ||
          evt.type === 'resync_end'
        ) {
          flushNow();
          if (evt.type === 'displaced') {
            displacedRef.current = true;
            setDisplacedReason(
              (evt as { message?: string }).message ??
                optsRef.current.displacedDefaultText ??
                '此会话已在其他窗口打开',
            );
            setState('displaced');
          } else if (evt.type === 'resync_start') {
            setMessages((prev) => truncateToLastComplete(prev));
          } else if (evt.type === 'resync_user') {
            setResyncUserText((evt as { content?: string }).content ?? '');
          }
          // resync_end: 无操作
          return;
        }
        // 额度耗尽帧:agent 桥接以 error/quota_exceeded 下发 → 弹全局重置弹窗(不进 messages)。
        if (
          evt.type === 'error' &&
          (evt as { code?: string }).code === 'quota_exceeded'
        ) {
          notifyQuotaExceeded({ message: (evt as { message?: string }).message });
          return;
        }
        // 一轮 AI 结束 → 用量已落账,广播刷新额度(触发过半/将尽阈值 toastr)。
        if (evt.type === 'message_complete') notifyBillingChanged();
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
      if (!ws || ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify(m));
    },
    close: () => {
      cancelledRef.current = true;
      wsRef.current?.close();
    },
    clearMessages: () => setMessages([]),
    takeOver: () => reconnectNowRef.current?.(),
    resyncUserText,
  };
}
