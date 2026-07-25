import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAgentSocket, type UseAgentSocket } from '@/shared/hooks/useAgentSocket';
import type { AgentClaimAudit, AgentErrorFrame, AgentDisplacedFrame } from '@/shared/lib/agent-stream';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import {
  makeAgentSessionApi,
  type AgentSessionItem,
} from '@/shared/api/agent-sessions';
// TODO: 30s 没对应 STALE_* preset, 保留硬编码 (smart-search context 水位)。

// ─── 多会话 API (2026-07: 与 claw 同型) ──────────────────────────────────
// 会话 CRUD(list/create/rename/delete/activate)走 shared 工厂,只差端点前缀 + queryKey 根;
// history/context/ws-ticket 各带 feature 专属类型与 ?session_id= 拼装,仍在本文件下方维护。
const smartSearchSessionApi = makeAgentSessionApi({
  feature: 'smart-search',
  basePath: '/user/smart-search',
});

export type SmartSearchSessionItem = AgentSessionItem;
/** 供 SearchSidebar / SmartSearchPanel 组装 shared AgentSessionList 用。 */
export const smartSearchSessions = smartSearchSessionApi;
export const useSmartSearchSessions = smartSearchSessionApi.useSessions;
export const useCreateSmartSearchSession = smartSearchSessionApi.useCreateSession;

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
  | {
      type: 'user_message';
      content: string;
      /** 方案 B 附件:文件已由 backend 推进会话 cwd,这里只透传 path(backend hub 折成 @"path" 标记)。 */
      attachments?: { type: 'image' | 'file'; name?: string; mimeType?: string; path: string }[];
      /** 幂等键 + 投递确认配对:面板预 mint,后端 hub 写入上游成功后回 user_ack{clientTurnId}。 */
      clientTurnId?: string;
    }
  | { type: 'stop_generation' }
  | { type: 'ping' }
  // 切换会话模型(P2 模型目录化:backend hub 权威校验 → pinned_model → 重组转发)。
  | { type: 'set_runtime_config'; providerId: string | null; modelId: string; useDefault?: boolean };

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
      /** 面向用户的失败摘要(仅 isError 时;agent 双轨制 W5 P0-A)。旧 agent 不发 → 可选。 */
      userMessage?: string;
    }
  // claim_audit:诚实性核验元数据(W2 P1-b,agent 纠偏轮触发时附带)。旧 agent 不发 → 可选。
  | { type: 'message_complete'; claim_audit?: AgentClaimAudit }
  | AgentErrorFrame
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
  // ── 多窗口接管: 后端 displacement 路径下发, 当前 WS 被另一个 tab 顶掉。收到这帧时不重连,
  // set displaced=true 让 UI 弹 banner。形态见共享 AgentDisplacedFrame(含 reason 结构化原因)。
  | AgentDisplacedFrame
  // ── 断线续流: (重)建连后 backend hub 整段回放当前 in-flight 轮 (mirrors backend hub.go resync*Frame)。
  //    resync_start → (可选)resync_user → 缓冲事件 → resync_end{inFlight}。
  //    inFlight=false = 服务端当前无在途轮的权威对账信号(useAgentSocket 转成 resyncIdle 单调计数)。
  | { type: 'resync_start' }
  | { type: 'resync_user'; content: string }
  | { type: 'resync_end'; inFlight?: boolean }
  // 投递确认(mirrors backend hub.go userAckFrame):user_message 已写入上游 agent。
  | { type: 'user_ack'; clientTurnId?: string };

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

/** 后端响应统一包了一层 `{ code, data }`,但有些接口可能直接裸出。两个都兼容。 */
function unwrap<T>(raw: { data?: T } & Partial<T>): T {
  // axios 拿到的 response.data 就是这个;后端 utils.Response 包 `{code,data}`;
  // 若上游真的裸出 sessionId 等字段,fallback 到 raw 本身。
  return (raw.data as T) ?? (raw as unknown as T);
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
  // 'error' 是失败轮终态合成 entry(backend FoldToMessages 折 EvError,W3 P1-A 冻结契约:
  // content = {code, message}),shared replayHistoryAsTurns 回放成与实时同构的失败轮收口。
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result' | 'error';
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
    // 修复"切走再回来, 刚结束的实时对话凭空消失":实时 turns 只在 socket.messages + panel
    //   pendingTurns(局部 state), 不写回 history cache; 后端 transcript 才是真源。跨路由离开
    //   /search 时 SearchPage unmount → 局部丢; 回来要靠重拉 transcript 还原。
    //   ⚠️ 不能用 staleTime:Infinity —— sessionId 由 useSmartSearchSession 异步解析, query 常在
    //   sessionId 仍空时挂载(disabled), refetchOnMount 只在挂载那刻判定、已错过; 等 enable 时
    //   Infinity 又判缓存"新鲜"→ 永不重取, 沿用上次挂载旧快照 = 那条实时轮永久不见(必须 F5)。
    //   staleTime:0 让 enable / 重挂载都重取; refetchOnWindowFocus:false 避免流式中切窗口误刷。
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    // "加载更早"增大 limitTurns 换 queryKey 重取时, 保留旧列表直到新的到, 避免列表塌成空。
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        // 显式带 ?session_id=xxx 让后端走 GetSessionMessagesByID 而不是 latest active,
        // 否则多会话切换时会 race(前端已切到 B 但后端 latest 还是 A → 返 A 的 messages 却缓存在
        // [history, B] 下,渲染串了)。同 claw useClawHistory。
        const params = new URLSearchParams();
        if (sessionId) params.set('session_id', sessionId);
        if (limitTurns && limitTurns > 0) params.set('limit', String(limitTurns));
        const qs = params.toString();
        const url = `/user/smart-search/session/messages${qs ? `?${qs}` : ''}`;
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
        // 同 useSmartSearchHistory: 显式 sessionId 走 by-id 路径, 防多会话切换 race。
        const url = sessionId
          ? `/user/smart-search/session/context?session_id=${encodeURIComponent(sessionId)}`
          : '/user/smart-search/session/context';
        const { data } = await http.get<
          { data?: SmartSearchContextSnapshot } & Partial<SmartSearchContextSnapshot>
        >(url);
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
 * 多会话: sessionId 显式带上,让后端把 ticket 签给指定 session(而非 latest active);
 * 不传时退化为给 latest 签(兼容)。
 *
 * 不做成 react-query mutation: 这里是 imperative 的鉴权交换, 不参与 cache 失效图。
 * 调用方 (useSmartSearchSocket connect 闭包) 直接 await 就够了。
 */
async function fetchWSTicket(sessionId?: string | null): Promise<WSTicket> {
  const url = sessionId
    ? `/user/smart-search/session/ws-ticket?session_id=${encodeURIComponent(sessionId)}`
    : '/user/smart-search/session/ws-ticket';
  const { data } = await http.post<{ data?: WSTicket } & Partial<WSTicket>>(url, {});
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
// ── 「新对话默认模型」偏好 + 一次性初始模型下发 ────────────────────────────────────────────
// 与 claw 同型(smart-search 自持一份,跨 feature 不共享)。服务端 pinned_model 是会话模型唯一真源;
// 前端只存两样:①用户级「新对话默认模型」偏好(跨刷新粘性,新对话尚无 sessionId 时选的模型);
// ②新会话建成 → socket open 的一次性传递(内存,一发即弃,之后服务端接管)。
const SS_NEW_CONV_MODEL_KEY = 'scholay:smart_search:new-conversation-model';

export function getSmartSearchNewConvModel(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    return localStorage.getItem(SS_NEW_CONV_MODEL_KEY) || undefined;
  } catch {
    return undefined;
  }
}
export function setSmartSearchNewConvModel(modelId: string | null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!modelId) localStorage.removeItem(SS_NEW_CONV_MODEL_KEY);
    else localStorage.setItem(SS_NEW_CONV_MODEL_KEY, modelId);
  } catch {
    /* ignore */
  }
}

const ssPendingInitialModel = new Map<string, string>();
/** 新会话建成后调用:若有「新对话默认模型」偏好,登记为该会话的一次性初始模型(socket open 下发)。 */
export function markSmartSearchPendingModel(sessionId: string) {
  const pref = getSmartSearchNewConvModel();
  if (pref) ssPendingInitialModel.set(sessionId, pref);
}
function takeSmartSearchPendingModel(sessionId: string | null): string | undefined {
  if (!sessionId) return undefined;
  const pref = ssPendingInitialModel.get(sessionId);
  ssPendingInitialModel.delete(sessionId);
  return pref;
}

export function useSmartSearchSocket(sessionId: string | null): UseSmartSearchSocket {
  return useAgentSocket<ServerMessage, ClientMessage>({
    connectionKey: sessionId,
    // 多会话: ticket 显式绑当前 sessionId(闭包捕获,每次 connect/reconnect 用最新 key)。
    fetchTicket: () => fetchWSTicket(sessionId),
    buildWsUrl,
    displacedDefaultText: '此会话已在其他窗口打开',
    onOpen: (ws) => {
      // per-session 模型真源在服务端(pinned_model);唯一例外 = 新对话偏好的一次性下发(取走即弃)。
      const initialModel = takeSmartSearchPendingModel(sessionId);
      if (initialModel) {
        ws.send(
          JSON.stringify({
            type: 'set_runtime_config',
            providerId: null,
            modelId: initialModel,
          } satisfies ClientMessage),
        );
      }
    },
  });
}

/** 历史回放/已发送气泡里图片取图代理 URL(cookie 鉴权,<img src> 直接用,标签发不了 Bearer)。
 *  path 取 basename(上传文件落会话 cwd 根,agent 侧再校验越界)。同 claw 的 clawSessionFileUrl。 */
export function smartSearchSessionFileUrl(sessionId: string, absPath: string): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  const base = absPath.split('/').pop() || absPath;
  const qs = new URLSearchParams({ session_id: sessionId, path: base });
  return `${apiBase}/user/smart-search/session/file?${qs.toString()}`;
}
