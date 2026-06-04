import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
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
 *   5. 升级 WebSocket: `/api/v1/user/smart-search/ws/:sessionId?token=<jwt>`
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

interface UseSmartSearchSocket {
  state: SmartSearchWSState;
  messages: ServerMessage[];
  send: (m: ClientMessage) => void;
  close: () => void;
  /** 当前重连尝试序号(0 表示首次连接或最近一次连接成功后归零),UI 可用作诊断 */
  reconnectAttempt: number;
  /**
   * 被另一窗口接管时的提示文案 (来自后端 displaced 帧的 message 字段)。
   * 为空表示本窗口当前没有被接管; 非空时 state 必然是 'displaced'。
   */
  displacedReason: string | null;
  /**
   * 用户点 "切回这里" 按钮 → 把活跃权抢回到本窗口。
   * 内部清 displaced 状态 + 重置重连计数 + 重新发起 connect, 进而把其他窗口
   * 顶下去 (后端 displacement 是对称的: 谁后到谁是活跃)。
   */
  takeOver: () => void;
  /**
   * 断线续流: 重连命中"上一连接的生成仍在进行"时, agent 通过 resync_user 下发本轮的
   * 用户消息文本。UI 用它兜出一个 in-flight pending turn (重连后局部 pendingTurns 已丢失),
   * 让回放的 assistant 事件能配上用户气泡。无续流时为 null。
   */
  resyncUserText: string | null;
}

/** 最多自动重连次数(不含首次连接);超过后 state → 'error'。 */
const MAX_RECONNECT_ATTEMPTS = 5;

/** 指数退避基准 1s,封顶 16s。1s → 2s → 4s → 8s → 16s。 */
function reconnectDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 16000);
}

// 合并连续的文本 content_delta —— 流式逐 token 推送会把 messages[] 撑到 O(token 数),
// 而 UI 每帧对整个数组全量重折叠 ⇒ O(N²)(外加每帧 [...prev, p] 的 O(N) 拷贝)。
// 文本块的 delta 本就被 fold 拼成一段, 提前合并完全等价, 却让数组长度退回 O(块数)。
// 只合并都带 string text 的相邻 delta:带 toolInput 的 delta(工具入参流)fold 不消费, 不参与合并。
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

// 断线续流: 收到 resync_start 时, 把本地"当前未完成轮"的残留事件截掉 —— 截到最后一条
// 轮终结事件 (message_complete / error) 之后。之后服务端回放的事件会从头重建这一轮,
// 不截会和回放重复。没有任何完成轮时返回空数组。
function truncateToLastComplete(prev: ServerMessage[]): ServerMessage[] {
  for (let i = prev.length - 1; i >= 0; i--) {
    const t = prev[i].type;
    if (t === 'message_complete' || t === 'error') return prev.slice(0, i + 1);
  }
  return [];
}

/**
 * 订阅一个 sessionId 的 WebSocket 流。
 *
 * - sessionId 由 null 变为非空时打开 WS;sessionId 变化 / 卸载时关闭并不再重连。
 * - messages 累积全部 server 事件,UI 自行扫描归并。
 *   message_complete 不清空 —— 它是用户聊天历史的一部分。
 *   **重连时也不清空 messages** —— 之前的事件全部保留,UI 体验是无缝的。
 * - send 在 WS 未打开时**静默丢弃**(UI 自己判断 state 来 disable 输入)。
 *
 * ─── 自动重连 ─────────────────────────────────────────────────────────────
 * close 不是用户主动触发时(unmount / sessionId 改变),按指数退避自动重连:
 *   1s → 2s → 4s → 8s → 16s,最多 5 次,期间 state='reconnecting'。
 * 5 次都失败 → state='error',UI 提示用户刷新。
 *
 * 重连复用同一个 sessionId —— agent 端会话状态持久化(jsonl on disk),
 * backend 桥接重新 dial 即可。已经流过的事件不会重发,但 message_complete
 * 之前的剩余事件应当能继续推。
 */
export function useSmartSearchSocket(
  sessionId: string | null
): UseSmartSearchSocket {
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<SmartSearchWSState>('idle');
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [displacedReason, setDisplacedReason] = useState<string | null>(null);
  const [resyncUserText, setResyncUserText] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  /** 标记本轮订阅是否已被卸载/换 session,以阻止过期 timer 触发 connect */
  const cancelledRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  /** displaced 标记 — 由 onmessage 设置, onclose 据此跳过重连。
      用 ref 而不是 state 是因为 onclose 闭包不感知 state 变化。 */
  const displacedRef = useRef(false);
  /** 暴露给 takeOver: 触发重新建联 (清 displaced + 复位重连计数 + 调 connect)。 */
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
    setResyncUserText(null);
    // 只在 sessionId 真正变化(useEffect 重新执行)时重置 messages;
    // 重连过程中不清空,保留对话历史。
    setMessages([]);

    // ── 流式批处理 (rAF coalesce) ──────────────────────────────────────────
    // 把高频内容帧 (content_delta 等) 在同一动画帧内合并成一次 setMessages, 避免每个 token
    // 都触发一次"全量重折叠 + 重渲染"—— 这是长会话单 mount 一路聊下去 O(N²) 卡顿的来源。
    // 控制帧 (displaced / resync_*) 仍即时按序处理 (handle 前先 flushNow 保证顺序)。
    const pendingEvents: ServerMessage[] = [];
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

    /** 共享的 close 处理: 决策是不是要重连。任一失败路径 (ticket / 网络) 都走这里。
        被另一窗口接管 (displacedRef=true) 时跳过自动重连; 等用户点 takeOver。 */
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
      const isReconnect = attemptsRef.current > 0;
      setState(isReconnect ? 'reconnecting' : 'connecting');

      // 先拿一张 30s 一次性 ws ticket; 失败 (网络 / 401 / Redis 挂) 视为本次连接失败,
      // 走重连退避而不是 hard error, 给后端短时抖动以容错。
      let ticket: WSTicket;
      try {
        ticket = await fetchWSTicket();
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

      const url = buildWsUrl(ticket.sessionId, ticket.wsToken);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      // isCurrent — 所有 WS event handler 都用这个把关, 跳过"过期连接"的事件。
      // 场景: 用户切 session 时, useEffect cleanup close 旧 WS, 但旧 WS 的网络事件
      // (backend 异步发的 displaced 帧 / close 等) 可能在 cleanup 后才异步抵达。
      // 这些事件若直接调 setState 会污染新 WS 的状态 (经典 bug: 切 mode 时误显示
      // displaced banner)。用 wsRef.current === ws 区分 "我是不是当前那条"。
      const isCurrent = () => wsRef.current === ws;

      ws.onopen = () => {
        if (cancelledRef.current || !isCurrent()) {
          ws.close();
          return;
        }
        attemptsRef.current = 0;
        setReconnectAttempt(0);
        setState('open');
      };

      // onerror 通常会紧跟 onclose,这里不动 state,统一在 onclose 决策。
      ws.onerror = () => {};

      ws.onclose = () => {
        // 过期 ws 的 close 不应当改 state / 触发重连, 否则会污染新 ws 的状态机。
        if (!isCurrent()) return;
        wsRef.current = null;
        scheduleReconnectOrError();
      };

      ws.onmessage = (ev) => {
        if (!isCurrent()) return; // 过期 ws 的消息不消费, 防 displaced 误触发等
        try {
          const parsed = JSON.parse(ev.data) as ServerMessage;
          // 控制帧 (displaced / resync_*) 即时按序处理: 先 flushNow 把已缓冲的内容帧打出去,
          // 否则 resync_start 的 truncate 会错位到回放内容之后, displaced 也可能被内容帧盖过。
          if (
            parsed.type === 'displaced' ||
            parsed.type === 'resync_start' ||
            parsed.type === 'resync_user' ||
            parsed.type === 'resync_end'
          ) {
            flushNow();
            if (parsed.type === 'displaced') {
              displacedRef.current = true;
              setDisplacedReason(parsed.message ?? '此会话已在其他窗口打开');
              setState('displaced');
            } else if (parsed.type === 'resync_start') {
              // 截掉本地当前未完成轮的残留, 等回放从头重建 (避免与回放重复)。
              setMessages((prev) => truncateToLastComplete(prev));
            } else if (parsed.type === 'resync_user') {
              setResyncUserText(parsed.content ?? '');
            }
            // resync_end: 无操作
            return;
          }
          // 内容帧: 入缓冲, 下一动画帧合并成一次 setMessages。
          pendingEvents.push(parsed);
          scheduleFlush();
        } catch {
          // 非 JSON 直接忽略 —— 服务端协议保证全是 JSON,这里是防御性。
        }
      };
    };

    // 暴露给 takeOver: 清 displaced + 复位重连计数 + 重新 connect。
    // 通过 ref 暴露而不是闭包直接绑, 是因为 takeOver 是 hook 暴露的稳定回调,
    // 不应该因为 useEffect 重跑而失效。
    reconnectNowRef.current = () => {
      if (cancelledRef.current) return;
      // 已有活跃 WS 时不重复发起 (例如用户重复点 takeOver)。
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
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const ws = wsRef.current;
      wsRef.current = null;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        ws.close();
      }
    };
  }, [sessionId, token]);

  const send = (m: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(m));
  };

  const close = () => {
    cancelledRef.current = true;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
  };

  const takeOver = () => {
    reconnectNowRef.current?.();
  };

  return { state, messages, send, close, reconnectAttempt, displacedReason, takeOver, resyncUserText };
}
