/**
 * 智能助手 WS 订阅 hook —— 复用 smart-search 的设计模式 (ws-ticket + 指数退避重连)。
 *
 * 不同点:
 *   - URL 前缀: /user/claw/ws/:sessionId
 *   - ticket 端点: /user/claw/session/ws-ticket
 *   - ClientMessage 多了 attachments (image base64) 字段, 透传到 agent
 */

import { useEffect, useRef, useState } from 'react';
import { http } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { getClawSessionModel } from './session';
import type { ClawWSState, ClientMessage, ServerMessage } from './types';

interface WSTicket {
  sessionId: string;
  wsToken: string;
  expiresInSeconds: number;
}

// fetchWSTicket — 多会话场景下 sessionId 是必填: 前端已经从 useClawSession 拿到
// activeSessionId, 显式带给后端, 让后端把 ticket 签给指定 session (而不是 latest active)。
// 不传时退化为 "给 latest active session 签", 跟旧行为兼容。
async function fetchWSTicket(sessionId?: string | null): Promise<WSTicket> {
  const url = sessionId
    ? `/user/claw/session/ws-ticket?session_id=${encodeURIComponent(sessionId)}`
    : '/user/claw/session/ws-ticket';
  const { data } = await http.post<{ data?: WSTicket } & Partial<WSTicket>>(url, {});
  const payload = (data.data as WSTicket | undefined) ?? (data as unknown as WSTicket);
  if (!payload?.wsToken || !payload?.sessionId) throw new Error('未拿到 wsToken');
  return payload;
}

function buildWsUrl(sessionId: string, wsToken: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  return `${proto}//${host}${base}/user/claw/ws/${sessionId}?ws_token=${encodeURIComponent(wsToken)}`;
}

// 合并连续的文本 content_delta —— 流式逐 token 推送会把 messages[] 撑到 O(token 数),
// 而上层每帧都对整个数组全量重折叠 ⇒ O(N²)(外加每帧 [...prev, evt] 的 O(N) 拷贝)。
// 文本块的 delta 本就会被 fold 拼成一段, 这里提前合并完全等价, 却让数组长度退回 O(块数),
// 折叠与拷贝都降一个数量级。只合并都带 string text 的相邻 delta:带 toolInput 的 delta
// (工具入参流) fold 不消费, 不参与合并以免误并入文本块。
function appendServerMessage(prev: ServerMessage[], evt: ServerMessage): ServerMessage[] {
  if (evt.type === 'content_delta' && typeof evt.text === 'string') {
    const last = prev[prev.length - 1];
    if (last && last.type === 'content_delta' && typeof last.text === 'string') {
      const merged: ServerMessage = { ...last, text: last.text + evt.text };
      return [...prev.slice(0, -1), merged];
    }
  }
  return [...prev, evt];
}

// 弱网友好的指数退避: 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s ...
// 上限 8 次 ≈ 大约 3-4 分钟内自动重连, 之后停止; 用户主动 takeOver / 切回 tab 触发 visibilitychange 时 reset。
// 比起旧的 (cap 16s, 5 次共 1 分钟) 对地铁 / 网格抖 / 设备休眠场景更友好。
const MAX_RECONNECT_ATTEMPTS = 8;
function reconnectDelayMs(attempt: number) {
  return Math.min(1000 * 2 ** Math.min(attempt, 6), 60000);
}

export interface UseClawSocket {
  state: ClawWSState;
  /** 累积全部 server 事件; UI 自己扫描归并 */
  messages: ServerMessage[];
  send: (m: ClientMessage) => void;
  /** 主动关闭, 不再触发自动重连 */
  close: () => void;
  /** 重连尝试序号; 0 = 首次或刚连上 */
  reconnectAttempt: number;
  /** 清空累积 messages — 「新对话」按钮调一次, 拿到新 sessionId 后老事件不再展示 */
  clearMessages: () => void;
  /** 被另一窗口/tab 接管时后端下发 displaced 帧的提示文; null = 当前未被接管 */
  displacedReason: string | null;
  /** "切回这里" → 抢回活跃权 (本端重连, 把其他窗口顶下去) */
  takeOver: () => void;
}

export function useClawSocket(sessionId: string | null): UseClawSocket {
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<ClawWSState>('idle');
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [displacedReason, setDisplacedReason] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cancelledRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const pingTimerRef = useRef<number | null>(null);
  /** displaced 标记 — onmessage 设, onclose 据此跳过重连 (ref 而非 state, 因为闭包不感知 state) */
  const displacedRef = useRef(false);
  /** 暴露给 takeOver 用 — useEffect 内才有 connect 闭包, 通过 ref 桥到外部 */
  const reconnectNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!sessionId || !token) {
      setState('idle');
      return;
    }
    cancelledRef.current = false;
    attemptsRef.current = 0;
    setReconnectAttempt(0);
    displacedRef.current = false;
    setDisplacedReason(null);
    setMessages([]);

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
      let ticket: WSTicket;
      try {
        // 多会话: 把当前 sessionId 显式传给后端, 让 ticket 绑到这条 session 而非 latest
        ticket = await fetchWSTicket(sessionId);
      } catch {
        scheduleReconnectOrError();
        return;
      }
      if (cancelledRef.current) {
        setState('closed');
        return;
      }
      const ws = new WebSocket(buildWsUrl(ticket.sessionId, ticket.wsToken));
      wsRef.current = ws;
      // isCurrent — 所有 WS event handler 都用这个把关, 跳过"过期连接"的事件。
      // 场景: 用户切 session 时, useEffect cleanup 会 close 旧 WS, 但旧 WS 的
      // 网络事件 (来自 backend 的 displaced 帧 / close) 可能在 cleanup 之后异步抵达。
      // 这些 event 若直接调 setState 会污染新 WS 的状态 (典型 bug: 误显示 displaced banner)。
      // 用 wsRef.current === ws 判断是不是"仍然是 active 那条"。
      const isCurrent = () => wsRef.current === ws;
      ws.onopen = () => {
        if (cancelledRef.current || !isCurrent()) {
          ws.close();
          return;
        }
        attemptsRef.current = 0;
        setReconnectAttempt(0);
        setState('open');
        // 25s 心跳 — 跟 backend FeatureSpec.PingIntervalOrDefault 对齐
        pingTimerRef.current = window.setInterval(() => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25000);

        // 如果用户为这个 session 选过 model (localStorage), WS 打开后立刻 push 给 agent。
        // 这是必须的: agent 的 set_runtime_config 不写盘, 每次新 WS 都得重发。
        // 重连后用户体感"模型偏好不丢"也靠这一步实现。
        const preferredModel = getClawSessionModel(sessionId);
        if (preferredModel) {
          ws.send(
            JSON.stringify({
              type: 'set_runtime_config',
              providerId: null,
              modelId: preferredModel,
            } satisfies ClientMessage),
          );
        }
      };
      ws.onmessage = (ev) => {
        if (!isCurrent()) return; // 过期 WS 的消息不消费, 防 displaced 误触发等
        try {
          const evt = JSON.parse(ev.data) as ServerMessage;
          // displaced 是控制帧, 不进 messages 列表 (fold 不消费)。
          if (evt.type === 'displaced') {
            displacedRef.current = true;
            setDisplacedReason(evt.message ?? '此会话已在其他窗口打开');
            setState('displaced');
            return;
          }
          setMessages((prev) => appendServerMessage(prev, evt));
        } catch {
          // 忽略非 JSON 帧 (理论上不会发生)
        }
      };
      ws.onerror = () => {
        // 不立即 setState; 等 onclose 决定走重连还是错误终态
      };
      ws.onclose = () => {
        if (pingTimerRef.current) {
          window.clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        // 只有当 ws 仍然是 active 那条时, 才触发重连决策。
        // 过期 ws 的 close (因 cleanup 主动 close 或被 backend displace) 不应当
        // 改 state / 触发重连, 否则会污染新 ws 的状态机。
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
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      setState('closed');
    };
  }, [sessionId, token]);

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
  };
}
