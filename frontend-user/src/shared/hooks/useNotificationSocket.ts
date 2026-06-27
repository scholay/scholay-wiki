import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { http } from '@/shared/lib/http';

/**
 * 通知 WebSocket —— 对接后端 `internal/websocket` (路由 `/api/v1/ws?ws_token=...`)。
 *
 * 鉴权:升级 WS 前先 POST `/user/ws-ticket` 拿一张 30s 一次性 ticket,再用 `?ws_token=` 升级。
 * 不再把裸 JWT 放进 URL query(长 TTL token 会落进 nginx access log 被重放)。每次(重)连都取新 ticket。
 *
 * 服务端推送 4 种 message(见 backend `internal/websocket/message.go`):
 *   - `notification` : 新站内信 → invalidate 列表 + 未读数 + toast 标题
 *   - `unread_count` : 未读数变更 → 直接 setQueryData 不发请求
 *   - `toast`        : 纯 toast(无站内信记录),仅展示
 *   - `pong`/`error` : 心跳/错误,忽略业务影响
 *
 * 连接策略:
 *   - 仅在 token 非空时连;token 变化(登录/登出/换号)关闭后重连
 *   - 25s ping 心跳防 idle timeout
 *   - 异常断开后用指数退避 + 抖动重连, 超过上限放弃(不再无限握手)
 *
 * 用法:在 AppShell 顶层调一次 useNotificationSocket() 即可。
 */
const PING_INTERVAL = 25_000;
// 重连用指数退避 + 抖动 + 次数上限, 而非固定 5s 线性重连。否则后端重启/部署/nginx 502 时,
// 每个登录用户都按对齐的 5s 节拍无限重连 → 自制惊群, 拖慢本就不健康的后端恢复(性能审计 fe-data)。
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 60_000;
const MAX_RECONNECT_ATTEMPTS = 10;

function reconnectDelay(attempt: number): number {
  const expo = Math.min(RECONNECT_BASE_DELAY * 2 ** Math.min(attempt, 6), RECONNECT_MAX_DELAY);
  // 抖动: 让并发客户端错峰, 避免对齐的重连波同时砸向后端
  return expo + Math.floor(Math.random() * 1_000);
}

interface ServerMessage<T = unknown> {
  type: 'notification' | 'unread_count' | 'toast' | 'pong' | 'error';
  data?: T;
}

interface NotificationData {
  id: number;
  title: string;
  content: string;
  category?: string;
  link_url?: string;
  link_text?: string;
}

interface UnreadCountData {
  count: number;
}

interface ToastData {
  title: string;
  content: string;
  category?: string;
}

function buildWsUrl(wsToken: string): string {
  // 走与 axios 同源 —— Nginx 已经把 /api/v1/* 转发到 backend
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${proto}//${host}/api/v1/ws?ws_token=${encodeURIComponent(wsToken)}`;
}

// fetchWsTicket 取一张 30s 一次性 ws ticket(后端响应壳 { data: { wsToken } })。
async function fetchWsTicket(): Promise<string> {
  const { data } = await http.post<{ data?: { wsToken?: string }; wsToken?: string }>(
    '/user/ws-ticket',
    {},
  );
  const wsToken = data?.data?.wsToken ?? data?.wsToken;
  if (!wsToken) throw new Error('未拿到 wsToken');
  return wsToken;
}

export function useNotificationSocket() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const closedByUserRef = useRef(false);

  useEffect(() => {
    closedByUserRef.current = false;
    reconnectAttemptsRef.current = 0;

    function cleanup() {
      // 无条件置位:in-flight 的 ticket 取还没建 WS 时也要让 connect 在 await 后自行放弃。
      closedByUserRef.current = true;
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }

    if (!token) {
      cleanup();
      return;
    }

    // scheduleReconnect 指数退避 + 抖动 + 次数上限重连(ticket 取失败 / WS 异常断开共用)。
    function scheduleReconnect() {
      if (closedByUserRef.current || reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;
      const delay = reconnectDelay(reconnectAttemptsRef.current);
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    async function connect() {
      if (closedByUserRef.current) return;
      // 每次(重)连先取一张新的一次性 ticket;取失败按退避重试。
      let wsToken: string;
      try {
        wsToken = await fetchWsTicket();
      } catch {
        scheduleReconnect();
        return;
      }
      if (closedByUserRef.current) return; // await 期间登出/换号 → 放弃本次连接
      const ws = new WebSocket(buildWsUrl(wsToken));
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0; // 连上即重置退避计数
        // 启动心跳
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (e) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case 'notification': {
            const d = msg.data as NotificationData | undefined;
            if (d?.title) {
              toast.message(d.title, { description: d.content });
            }
            // 列表 + 未读数都需要刷新
            qc.invalidateQueries({ queryKey: ['notifications'] });
            break;
          }
          case 'unread_count': {
            const d = msg.data as UnreadCountData | undefined;
            if (typeof d?.count === 'number') {
              qc.setQueryData(['notifications', 'unread-count'], d.count);
            }
            break;
          }
          case 'toast': {
            const d = msg.data as ToastData | undefined;
            if (d?.title) {
              toast.message(d.title, { description: d.content });
            }
            break;
          }
          default:
            // pong / error / 未知 type 一律忽略,后端日志已记录
            break;
        }
      };

      ws.onclose = () => {
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        wsRef.current = null;
        // 异常断开 → 指数退避 + 抖动后重连; 超过上限放弃, 不再无限握手(死会话/长时间宕机)。
        // 用户重新聚焦页面 / 下次 token 变化(登录态刷新)会重建连接。
        if (!closedByUserRef.current) {
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // 静默 —— onclose 会接着触发,统一在那里走重连
      };
    }

    connect();
    return cleanup;
  }, [token, qc]);
}
