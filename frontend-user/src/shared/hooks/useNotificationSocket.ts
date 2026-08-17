import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { http } from '@/shared/lib/http';
import {
  dispatchPrismCompileStatus,
  type PrismCompileStatusDetail,
} from '@/shared/lib/compile-events';
import { useAfterPageLoad } from './useAfterPageLoad';

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
  type: 'notification' | 'unread_count' | 'toast' | 'compile_status' | 'pong' | 'error';
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
  const backgroundReady = useAfterPageLoad();
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const closedByUserRef = useRef(false);
  // 退避预算耗尽后挂的一次性 visibilitychange 监听的卸载器(null = 未挂)。
  const visibilityReviveRef = useRef<(() => void) | null>(null);
  // 代际计数:每次 effect 重跑(token 变化)自增。旧连接的异步事件(onopen/onmessage/onclose)
  // 带着自己那一代的 myGen,与当前代不符即作废 —— 否则 token 直接换值(old→new,跨 tab 换号)时,
  // 旧连接 A 的 onclose 在新连接 B 建立后才异步到达,此刻 closedByUserRef 已被新 effect 重置为 false,
  // A.onclose 会拉起第三条连接并把共享的 wsRef/pingTimerRef 覆写/清空(通知双弹 + 心跳泄漏,对抗审查确认)。
  const genRef = useRef(0);

  useEffect(() => {
    const myGen = ++genRef.current;
    const isCurrent = () => genRef.current === myGen;
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
      if (visibilityReviveRef.current) {
        visibilityReviveRef.current();
        visibilityReviveRef.current = null;
      }
    }

    if (!token || !backgroundReady) {
      cleanup();
      return;
    }

    // 预算耗尽后的自愈路径:不再定时重试(死会话/长时间宕机不无限握手),但也**不永久失联**——
    // 用户回到 tab 时(visibilitychange→visible)重置预算、拉起新一轮退避。
    // 此前 onclose 注释声称的「聚焦重建」路径实际不存在:长挂 tab 经历一次约 4 分钟以上的
    // 断连(后端部署/网络切换)后通知 WS 就永久哑掉,直到刷新(2026-08-12 审计)。
    function armVisibilityRevive() {
      if (visibilityReviveRef.current) return; // 已挂,幂等
      // 三个唤醒源,谁先到谁触发(用户全程停在可见 tab 时 visibilitychange 永不发生,
      // 靠 online 事件与 5min 慢计时器兜底 —— 频率低到不构成风暴,但保证最终自愈):
      const revive = () => {
        disarm();
        if (closedByUserRef.current) return;
        reconnectAttemptsRef.current = 0;
        connect();
      };
      const onVisible = () => {
        if (document.visibilityState !== 'visible') return;
        revive();
      };
      const slowTimer = setTimeout(revive, 5 * 60_000);
      const disarm = () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', revive);
        clearTimeout(slowTimer);
        visibilityReviveRef.current = null;
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', revive);
      visibilityReviveRef.current = disarm;
    }

    // scheduleReconnect 指数退避 + 抖动 + 次数上限重连(ticket 取失败 / WS 异常断开共用)。
    function scheduleReconnect() {
      if (closedByUserRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        armVisibilityRevive();
        return;
      }
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
      if (closedByUserRef.current || !isCurrent()) return; // await 期间登出/换号 → 放弃本次连接
      const ws = new WebSocket(buildWsUrl(wsToken));
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isCurrent()) {
          ws.close(); // 已是上一代连接,别启心跳,直接收摊
          return;
        }
        reconnectAttemptsRef.current = 0; // 连上即重置退避计数
        // 启动心跳
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (e) => {
        if (!isCurrent()) return; // 上一代连接的迟到消息不再驱动 UI(否则通知双弹)
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
              // 先杀在途 refetch 再写,否则一个在途的 unread-count GET 过期 resolve 会把
              // 推送的新值覆盖回旧值(与 prism compile 推送同款竞态,对齐其 cancelQueries 姿势)。
              const key = ['notifications', 'unread-count'];
              void qc.cancelQueries({ queryKey: key }).then(() => {
                qc.setQueryData(key, d.count);
              });
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
          case 'compile_status': {
            // prism 编译状态推送 → 经 window 事件桥转给 prism 的 useCompile(setQueryData)。
            // shared 层不认识 feature 的缓存键形状,只负责搬运(见 shared/lib/compile-events.ts)。
            const d = msg.data as PrismCompileStatusDetail | undefined;
            if (d && typeof d.id === 'number' && typeof d.project_id === 'number') {
              dispatchPrismCompileStatus(d);
            }
            break;
          }
          default:
            // pong / error / 未知 type 一律忽略,后端日志已记录
            break;
        }
      };

      ws.onclose = () => {
        // 代际守卫必须在触碰任何共享 ref 之前:上一代连接的 close 迟到时,若无条件清
        // pingTimerRef/wsRef 会拆掉当前代连接的心跳、并触发多余重连(见 genRef 注释)。
        if (!isCurrent()) return;
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        wsRef.current = null;
        // 异常断开 → 指数退避 + 抖动后重连;超过上限停表,由 armVisibilityRevive
        // 在用户回到 tab 时重置预算再来一轮(或下次 token 变化重建)。
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
  }, [token, qc, backgroundReady]);
}
