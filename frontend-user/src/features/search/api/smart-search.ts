import { keepPreviousData, useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAgentSocket, type UseAgentSocket } from '@/shared/hooks/useAgentSocket';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';
// TODO: 30s 没对应 STALE_* preset, 保留硬编码 (smart-search context 水位)。

/**
 * 智能搜索 —— 通过后端桥接到 scholar_agent 容器的对话式论文检索。
 *
 * 协议 (v2, 用户唯一会话):
 *   1. `GET    /user/smart-search/session`           → `{ sessionId }`  (get-or-create)
 *   2. `POST   /user/smart-search/session/reset`     → `{ sessionId }`  (删旧+新建)
 *   3. `GET    /user/smart-search/session/messages`  → `{ sessionId, messages: HistoryEntry[] }`
 *   4. `GET    /user/smart-search/session/context`   → `{ sessionId, totalTokens, maxTokens, percentage, model }`
 *   5. 先 POST /user/smart-search/session/ws-ticket 拿 30s 一次性 wsToken,
 *      再升级 WebSocket: `/api/v1/user/smart-search/ws/:sessionId?ws_token=<wsToken>`
 *      之后 client/server 互发 JSON 消息(见 ClientMessage / ServerMessage)。
 *
 * v1 → v2 变更:
 *   - 旧: 每次进页面都 POST /sessions 新建一个 → 大量孤儿 jsonl + 失去历史。
 *   - 新: 每用户 1 行 1 会话; reset 是显式动作。会话历史在 DB 里持久, 用户可
 *     在任何时间回到智能搜索页接着上次的对话往下问。
 *
 * 这一层只管"会话生命周期 + 原始 WS 消息流",不做 UI 语义解释 ——
 * 把消息列表当事件日志暴露给 UI,UI 自己做归并(把 content_delta 拼成 assistant 文本、
 * 把 tool_use_complete + tool_result 配对成论文卡)。
 */

// ─── 本 feature 用到的 agent WS 消息类型 (本地维护) ─────────────────────────
//
// 跟 cc-haha (scholar_agent) 的 WS server message 协议对齐, 在本项目本地维护一份,
// 不从外部项目 import, 避免跨项目构建耦合。

export type ClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'stop_generation' }
  | { type: 'ping' };

/**
 * Agent 端实际发的事件类型来源:agent/src/server/ws/events.ts。
 * 本前端只消费"对话回放"所必需的子集,其他事件(team_update/task_update/
 * computer_use_permission_request/permission_request)都不属于智能搜索场景,
 * 不在 union 里声明,fold 时也不需要处理。
 */
export type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | {
      type: 'content_start';
      blockType: 'text' | 'tool_use';
      toolName?: string;
      toolUseId?: string;
    }
  | { type: 'content_delta'; text?: string; toolInput?: string }
  | {
      type: 'tool_use_complete';
      toolName: string;
      toolUseId: string;
      input: unknown;
    }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: unknown;
      isError: boolean;
    }
  | { type: 'message_complete' }
  | { type: 'error'; message: string }
  // ─── 中间态事件 ─────────────────────────────────────────────────────────
  // agent 在思考/调用工具前后会持续 emit 这些事件,用来驱动占位文案,避免
  // "提交 → 思考中 → 白屏 → 突然出结果" 的体验断层。
  | { type: 'thinking'; text: string }
  | {
      type: 'status';
      state:
        | 'idle'
        | 'thinking'
        | 'tool_executing'
        | 'streaming'
        | 'permission_pending';
      verb?: string;
      elapsed?: number;
      tokens?: number;
    }
  | {
      type: 'system_notification';
      subtype: string;
      message?: string;
      data?: unknown;
    }
  | { type: 'session_title_updated'; sessionId: string; title: string }
  | { type: 'pong' }
  // ── 多窗口接管: 后端 displacement 路径下发, 表示当前 WS 被另一个 tab 顶掉了。
  // 收到这帧时, useSmartSearchSocket 不应重连; 应 set displaced=true 让 UI 弹 banner。
  | { type: 'displaced'; message: string }
  // ── 断线续流: 重连后 agent 整段回放当前 in-flight 轮 (见 agent ws/events.ts)。
  //    resync_start → (可选)resync_user → 缓冲事件 → resync_end。
  | { type: 'resync_start' }
  | { type: 'resync_user'; content: string }
  | { type: 'resync_end' };

export type SmartSearchWSState =
  | 'idle'
  | 'connecting'
  | 'open'
  /**
   * 连接断开但 sessionId 仍存在,正在按指数退避自动重试中。
   * UI 可据此显示"正在重连…"而不是立即报错。
   */
  | 'reconnecting'
  | 'closed'
  /** 重试次数耗尽 或 sessionId 失效。UI 应提示用户刷新或重新提问。 */
  | 'error'
  /**
   * 被另一个窗口/tab 接管 (后端 displacement 机制) → 不会自动重连, 等用户点
   * "切回这里" 按钮 (takeOver) 才会重新建 WS, 把活跃权抢回。
   */
  | 'displaced';

interface SessionEnvelope {
  sessionId: string;
}

/** 后端响应统一包了一层 `{ code, data }`,但有些接口可能直接裸出。两个都兼容。 */
function unwrap<T>(raw: { data?: T } & Partial<T>): T {
  // axios 拿到的 response.data 就是这个;后端 utils.Response 包 `{code,data}`;
  // 若上游真的裸出 sessionId 等字段,fallback 到 raw 本身。
  return (raw.data as T) ?? (raw as unknown as T);
}

/**
 * Get-or-create 当前用户的智能搜索 sessionId。
 * 进入页面立即调,拿到 sessionId 后 (1) 用来建 WS,(2) 用来拉历史回放。
 *
 * staleTime: 5 分钟 —— sessionId 在 reset 之前是稳定的,完全不用频繁 refetch。
 * 注意: reset 流程会显式调用 refetch + invalidate,不依赖 staleness 失效。
 */
export function useSmartSearchSession(): UseQueryResult<SessionEnvelope> {
  const token = useAuthStore((s) => s.token);
  return useQuery<SessionEnvelope>({
    queryKey: ['smart-search', 'session'],
    enabled: !!token,
    staleTime: STALE_FRESH,
    queryFn: async () => {
      try {
        const { data } = await http.get<
          { data?: SessionEnvelope } & Partial<SessionEnvelope>
        >('/user/smart-search/session');
        const payload = unwrap<SessionEnvelope>(data);
        if (!payload?.sessionId) {
          throw new Error('后端未返回 sessionId');
        }
        return payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * 重置当前用户的会话: 删旧 + 新建。响应里的 sessionId 是新的。
 * 后续应该 invalidate session/history/context 三个 query 让 UI 自动刷新。
 */
export function useResetSmartSearchSession() {
  return useMutation<SessionEnvelope>({
    mutationFn: async () => {
      try {
        const { data } = await http.post<
          { data?: SessionEnvelope } & Partial<SessionEnvelope>
        >('/user/smart-search/session/reset', {});
        const payload = unwrap<SessionEnvelope>(data);
        if (!payload?.sessionId) {
          throw new Error('后端未返回 sessionId');
        }
        return payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * agent transcript 中的单条 entry。其形态是 Anthropic 协议:
 *   - type=user:      content 可能是 string,或 `[{type:'text',text:...}|{type:'tool_result',...}]`
 *   - type=assistant: content 是 `[{type:'text',text:...}|{type:'thinking',...}|{type:'tool_use',id,name,input}]`
 *
 * 我们不在这里做强类型 —— UI 层 (replayHistoryAsTurns) 用 narrow 函数处理各种形态。
 */
export interface SmartSearchHistoryEntry {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result';
  content: unknown;
  timestamp: string;
  model?: string;
  isSidechain?: boolean;
  /**
   * 这条消息所在的轮被用户暂停打断 —— 服务端把被隐藏的「[Request interrupted by user]」
   * 标记折算成此 flag (见 agent sessionService.shouldHideTranscriptEntry)。回放据此显示「已暂停」。
   */
  interrupted?: boolean;
}

interface HistoryResponse {
  sessionId: string;
  messages: SmartSearchHistoryEntry[] | null;
  /** 全部用户轮数 (后端统计, 分页时用) */
  totalTurns?: number;
  /** 是否还有更早的轮没返回 → 前端显示"加载更早" */
  hasMore?: boolean;
}

/** 拉历史会话。limitTurns>0 时只取**最近 N 个用户轮**(超长会话分页, 后端 sliceRecentTurns)。 */
export function useSmartSearchHistory(
  sessionId: string | null | undefined,
  limitTurns?: number
): UseQueryResult<HistoryResponse> {
  const token = useAuthStore((s) => s.token);
  return useQuery<HistoryResponse>({
    queryKey: ['smart-search', 'history', sessionId, limitTurns ?? 0],
    enabled: !!token && !!sessionId,
    // 历史是只追加的, 同一 mount 生命周期内不需要反复刷 (staleTime: Infinity);
    // 但**每次 panel 重新挂载都必须重拉一次** —— 这是修复"切走再回来对话凭空消失"的关键。
    //
    // 背景: 实时对话的 turns 只存在于 useSmartSearchSocket 的 messages + panel 的
    //   pendingTurns (组件局部 state), 并不会写回这个 history cache; 后端 transcript
    //   才是真源。用户跨页面导航离开 /search 时, 整个 SearchPage 路由 unmount, 局部
    //   state 全丢; 回来时 panel 重新 mount, 若仅靠 staleTime:Infinity 的旧缓存,
    //   react-query 会原样返回**首次挂载时拉到的空快照**, 于是对话整段消失, 必须 F5
    //   清掉 RQ 缓存才出来。
    //   refetchOnMount:'always' 让每次重挂都从 transcript 重放完整对话, 与"刷新页面"
    //   行为一致, 但不需要真刷新。reset 时仍走 invalidate 强制刷。
    staleTime: Infinity,
    refetchOnMount: 'always',
    // "加载更早"增大 limitTurns 换 queryKey 重取时, 保留旧列表直到新的到, 避免列表塌成空。
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const url =
          limitTurns && limitTurns > 0
            ? `/user/smart-search/session/messages?limit=${limitTurns}`
            : '/user/smart-search/session/messages';
        const { data } = await http.get<
          { data?: HistoryResponse } & Partial<HistoryResponse>
        >(url);
        const payload = unwrap<HistoryResponse>(data);
        return {
          sessionId: payload?.sessionId ?? sessionId ?? '',
          messages: payload?.messages ?? [],
          totalTurns: payload?.totalTurns ?? 0,
          hasMore: payload?.hasMore ?? false,
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

export interface SmartSearchContextSnapshot {
  sessionId: string;
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  model: string;
}

/**
 * 拉当前会话的上下文水位 (基于 transcript 中最新一条 assistant 的 usage 计算)。
 * 不要在每次 message_complete 都拉一次 —— agent 端 transcriptContextEstimate
 * 每次都遍历 jsonl,对长会话有 IO 成本。UI 在 panel mount 拉一次, reset 后 refetch。
 *
 * 后续可以改成 WS 推送增量水位 (agent 已经在每条 assistant 里带 usage), 但目前
 * 这种 polling 风格够用,实施成本最低。
 */
export function useSmartSearchContext(
  sessionId: string | null | undefined
): UseQueryResult<SmartSearchContextSnapshot> {
  const token = useAuthStore((s) => s.token);
  return useQuery<SmartSearchContextSnapshot>({
    queryKey: ['smart-search', 'context', sessionId],
    enabled: !!token && !!sessionId,
    staleTime: 30 * 1000, // 30s 内不重复请求
    queryFn: async () => {
      try {
        const { data } = await http.get<
          { data?: SmartSearchContextSnapshot } & Partial<SmartSearchContextSnapshot>
        >('/user/smart-search/session/context');
        const payload = unwrap<SmartSearchContextSnapshot>(data);
        return {
          sessionId: payload?.sessionId ?? sessionId ?? '',
          totalTokens: payload?.totalTokens ?? 0,
          maxTokens: payload?.maxTokens ?? 0,
          percentage: payload?.percentage ?? 0,
          model: payload?.model ?? '',
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * WS 连接 URL —— 取 `import.meta.env.VITE_API_BASE_URL` 推导 ws 协议地址,
 * 默认走同源相对路径(生产 nginx 反代,开发 vite proxy)。
 *
 * wsToken 是后端 /smart-search/session/ws-ticket 返回的 30s 一次性 ticket,
 * 替代直接把 JWT 暴露在 URL (JWT 长 TTL, 会被 nginx access log 落盘长期保留)。
 */
function buildWsUrl(sessionId: string, wsToken: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  return `${proto}//${host}${base}/user/smart-search/ws/${sessionId}?ws_token=${encodeURIComponent(wsToken)}`;
}

/**
 * 后端 /smart-search/session/ws-ticket 响应。
 * sessionId 一并返回方便前端兜底渲染 (即便 ticket 拿不到也能拿默认 session)。
 */
interface WSTicket {
  sessionId: string;
  wsToken: string;
  expiresInSeconds: number;
}

/**
 * 取一张一次性 ws ticket。每次 connect/reconnect 都要重新申请 —— ticket 30s TTL,
 * 且 backend GETDEL 一次消费就失效, 重连必须拿新的。
 *
 * 不做成 react-query mutation: 这里是 imperative 的鉴权交换, 不参与 cache 失效图。
 * 调用方 (useSmartSearchSocket connect 闭包) 直接 await 就够了。
 */
async function fetchWSTicket(): Promise<WSTicket> {
  const { data } = await http.post<{ data?: WSTicket } & Partial<WSTicket>>(
    '/user/smart-search/session/ws-ticket',
    {}
  );
  const payload = unwrap<WSTicket>(data);
  if (!payload?.wsToken || !payload?.sessionId) {
    throw new Error('后端未返回 wsToken');
  }
  return payload;
}

type UseSmartSearchSocket = UseAgentSocket<ServerMessage, ClientMessage>;
/**
 * 订阅当前用户智能搜索会话的 WS 流 —— 薄封装,连接状态机收口在 shared/hooks/useAgentSocket
 * (ws-ticket + 指数退避重连 + rAF 流式批处理 + 25s 心跳 + 断线续流 resync + 多窗口接管)。
 * 智能搜索是用户级单会话,connectionKey 即 sessionId;sessionId 变化 / 卸载即重连或断开。
 */
export function useSmartSearchSocket(sessionId: string | null): UseSmartSearchSocket {
  return useAgentSocket<ServerMessage, ClientMessage>({
    connectionKey: sessionId,
    fetchTicket: fetchWSTicket,
    buildWsUrl,
    displacedDefaultText: '此会话已在其他窗口打开',
  });
}
