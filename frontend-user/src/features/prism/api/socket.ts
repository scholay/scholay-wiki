/**
 * Prism agent-native 用户 WS 订阅 hook —— 移植 claw 的 useClawSocket(ws-ticket + 指数退避重连
 * + rAF 流式批处理 + 断线续流 resync + 多窗口接管)。差异:
 *   - 按 projectId 取 ticket(POST /user/prism/projects/:id/ws-ticket),ticket 回带该项目的 sessionId
 *   - WS URL: /user/prism/ws/:sessionId
 *   - 不带附件 / 不做 per-session 模型切换
 */

import { useEffect, useRef, useState } from 'react';
import { http } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import type { PrismClientMessage, PrismServerMessage, PrismWSState } from './ws-types';

interface WSTicket {
  sessionId: string;
  wsToken: string;
  expiresInSeconds: number;
}

async function fetchWSTicket(projectId: number): Promise<WSTicket> {
  const { data } = await http.post<{ data?: WSTicket } & Partial<WSTicket>>(
    `/user/prism/projects/${projectId}/ws-ticket`,
    {},
  );
  const payload = (data.data as WSTicket | undefined) ?? (data as unknown as WSTicket);
  if (!payload?.wsToken || !payload?.sessionId) throw new Error('未拿到 wsToken');
  return payload;
}

function buildWsUrl(sessionId: string, wsToken: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  return `${proto}//${host}${base}/user/prism/ws/${sessionId}?ws_token=${encodeURIComponent(wsToken)}`;
}

// 合并相邻文本 content_delta —— 见 claw socket 注释(O(N²)→O(块数))。
function appendServerMessage(prev: PrismServerMessage[], evt: PrismServerMessage): PrismServerMessage[] {
  if (evt.type === 'content_delta' && typeof evt.text === 'string') {
    const last = prev[prev.length - 1];
    if (last && last.type === 'content_delta' && typeof last.text === 'string') {
      return [...prev.slice(0, -1), { ...last, text: last.text + evt.text }];
    }
  }
  return [...prev, evt];
}

// resync_start 时截掉本地未完成轮残留(截到最后一条 message_complete/error 之后)。
function truncateToLastComplete(prev: PrismServerMessage[]): PrismServerMessage[] {
  for (let i = prev.length - 1; i >= 0; i--) {
    const t = prev[i].type;
    if (t === 'message_complete' || t === 'error') return prev.slice(0, i + 1);
  }
  return [];
}

const MAX_RECONNECT_ATTEMPTS = 8;
function reconnectDelayMs(attempt: number) {
  return Math.min(1000 * 2 ** Math.min(attempt, 6), 60000);
}

export interface UsePrismSocket {
  state: PrismWSState;
  messages: PrismServerMessage[];
  send: (m: PrismClientMessage) => void;
  close: () => void;
  reconnectAttempt: number;
  clearMessages: () => void;
  displacedReason: string | null;
  takeOver: () => void;
  resyncUserText: string | null;
}

export function usePrismSocket(projectId: number | null): UsePrismSocket {
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<PrismWSState>('idle');
  const [messages, setMessages] = useState<PrismServerMessage[]>([]);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [displacedReason, setDisplacedReason] = useState<string | null>(null);
  const [resyncUserText, setResyncUserText] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cancelledRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const pingTimerRef = useRef<number | null>(null);
  const displacedRef = useRef(false);
  const reconnectNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!projectId || !token) {
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

    const pendingEvents: PrismServerMessage[] = [];
    let rafId: number | null = null;
    const flushPending = () => {
      rafId = null;
      if (pendingEvents.length === 0) return;
      const batch = pendingEvents.splice(0, pendingEvents.length);
      setMessages((prev) => batch.reduce(appendServerMessage, prev));
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
      let ticket: WSTicket;
      try {
        ticket = await fetchWSTicket(projectId);
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
      const isCurrent = () => wsRef.current === ws;
      ws.onopen = () => {
        if (cancelledRef.current || !isCurrent()) {
          ws.close();
          return;
        }
        attemptsRef.current = 0;
        setReconnectAttempt(0);
        setState('open');
        pingTimerRef.current = window.setInterval(() => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25000);
      };
      ws.onmessage = (ev) => {
        if (!isCurrent()) return;
        try {
          const evt = JSON.parse(ev.data) as PrismServerMessage;
          if (
            evt.type === 'displaced' ||
            evt.type === 'resync_start' ||
            evt.type === 'resync_user' ||
            evt.type === 'resync_end'
          ) {
            flushNow();
            if (evt.type === 'displaced') {
              displacedRef.current = true;
              setDisplacedReason(evt.message ?? '此项目已在其他窗口打开');
              setState('displaced');
            } else if (evt.type === 'resync_start') {
              setMessages((prev) => truncateToLastComplete(prev));
            } else if (evt.type === 'resync_user') {
              setResyncUserText(evt.content ?? '');
            }
            return;
          }
          pendingEvents.push(evt);
          scheduleFlush();
        } catch {
          // 忽略非 JSON 帧
        }
      };
      ws.onerror = () => {
        // 等 onclose 决定重连/错误
      };
      ws.onclose = () => {
        if (pingTimerRef.current) {
          window.clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
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
      wsRef.current?.close();
      wsRef.current = null;
      setState('closed');
    };
  }, [projectId, token]);

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
