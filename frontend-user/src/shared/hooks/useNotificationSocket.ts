import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 通知 WebSocket —— 对接后端 `internal/websocket` (路由 `/api/v1/ws?token=...`)。
 *
 * 服务端推送 4 种 message(见 backend `internal/websocket/message.go`):
 *   - `notification` : 新站内信 → invalidate 列表 + 未读数 + toast 标题
 *   - `unread_count` : 未读数变更 → 直接 setQueryData 不发请求
 *   - `toast`        : 纯 toast(无站内信记录),仅展示
 *   - `pong`/`error` : 心跳/错误,忽略业务影响
 *
 * 连接策略:
 *   - 仅在 token 非空时连;token 变化(登录/登出/换号)关闭后重连
 *   - 5s ping 心跳防 idle timeout
 *   - 异常断开 5s 后自动重连(简单线性退避)
 *
 * 用法:在 AppShell 顶层调一次 useNotificationSocket() 即可。
 */
const PING_INTERVAL = 25_000;
const RECONNECT_DELAY = 5_000;

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

function buildWsUrl(token: string): string {
  // 走与 axios 同源 —— Nginx 已经把 /api/v1/* 转发到 backend
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${proto}//${host}/api/v1/ws?token=${encodeURIComponent(token)}`;
}

export function useNotificationSocket() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUserRef = useRef(false);

  useEffect(() => {
    closedByUserRef.current = false;

    function cleanup() {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        closedByUserRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
    }

    if (!token) {
      cleanup();
      return;
    }

    function connect() {
      if (closedByUserRef.current) return;
      const ws = new WebSocket(buildWsUrl(token!));
      wsRef.current = ws;

      ws.onopen = () => {
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
        if (!closedByUserRef.current) {
          // 异常断开 → 延迟重连
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
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
