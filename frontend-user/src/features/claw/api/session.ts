/**
 * 智能助手 — session / history / context / upload 的 react-query hooks。
 * WS 连接见 [[useClawSocket]] (./socket.ts)。
 *
 * 多会话 API (P5+) 在文件末尾, 包括 useClawSessions / useCreateClawSession 等。
 * 单会话路径 (useClawSession / useResetClawSession 等) 保留兼容已有 UI 流程,
 * 行为含义已升级为 "取当前活跃 session" / "删当前 + 建新" (历史行不删)。
 */

import { keepPreviousData, useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { stashFirstConnectTicket } from '@/shared/lib/agent-first-ticket';
import { useUploadAgentAttachment, useReferenceAgentLibrary } from '@/shared/api/agent-attach';
import { makeAgentSessionApi, type AgentSessionItem } from '@/shared/api/agent-sessions';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';
import type {
  AttachmentDTO,
  ClawContextSnapshot,
  ClawHistoryEntry,
  ReferenceItemDTO,
} from './types';
// TODO: 30s 没对应 STALE_* preset, 保留硬编码 (claw context 水位 + sessions list)。

interface SessionEnvelope {
  sessionId: string;
  /** 后端顺带附的首连 ws ticket(agentbridge.SessionEnvelopeWithTicket,best-effort 可缺省)。 */
  wsToken?: string;
  expiresInSeconds?: number;
}

function unwrap<T>(raw: { data?: T } & Partial<T>): T {
  return (raw.data as T) ?? (raw as unknown as T);
}

// ─── session lifecycle ──────────────────────────────────────────────────

export function useClawSession(): UseQueryResult<SessionEnvelope> {
  const token = useAuthStore((s) => s.token);
  return useQuery<SessionEnvelope>({
    queryKey: ['claw', 'session'],
    enabled: !!token,
    staleTime: STALE_FRESH,
    queryFn: async () => {
      try {
        const { data } = await http.get<
          { data?: SessionEnvelope } & Partial<SessionEnvelope>
        >('/user/claw/session');
        const payload = unwrap<SessionEnvelope>(data);
        if (!payload?.sessionId) throw new Error('后端未返回 sessionId');
        // 首连 ws ticket 入栈(一次性,socket 的 fetchTicket 出栈即删)→ 首连省一跳 POST。
        stashFirstConnectTicket('/user/claw', payload);
        return payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/** 「新对话」按钮触发: 删旧会话 + 创建新, 拿到新 sessionId 后前端 invalidate 全部 query。 */
export function useResetClawSession() {
  return useMutation<SessionEnvelope>({
    mutationFn: async () => {
      try {
        const { data } = await http.post<
          { data?: SessionEnvelope } & Partial<SessionEnvelope>
        >('/user/claw/session/reset', {});
        const payload = unwrap<SessionEnvelope>(data);
        if (!payload?.sessionId) throw new Error('后端未返回 sessionId');
        return payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ─── history ────────────────────────────────────────────────────────────

interface HistoryResponse {
  sessionId: string;
  messages: ClawHistoryEntry[] | null;
  /** 全部用户轮数 (后端统计, 分页时用) */
  totalTurns?: number;
  /** 是否还有更早的轮没返回 → 前端显示"加载更早" */
  hasMore?: boolean;
}

/**
 * 拉历史会话。limitTurns>0 时只取**最近 N 个用户轮**(超长会话分页, 后端 sliceRecentTurns):
 * 避免上万轮 transcript 一次性推给浏览器 JSON.parse + 折叠 + 渲染。"加载更早"增大 limitTurns。
 */
export function useClawHistory(
  sessionId: string | null | undefined,
  limitTurns?: number,
): UseQueryResult<HistoryResponse> {
  const token = useAuthStore((s) => s.token);
  return useQuery<HistoryResponse>({
    queryKey: ['claw', 'history', sessionId, limitTurns ?? 0],
    enabled: !!token && !!sessionId,
    // 修复"切到别的页面再回来, 刚结束的实时对话凭空消失":
    //   实时 turns 只在 ClawPage 局部 state (socket.messages + pendingTurns), 跨路由导航离开
    //   时整个 ClawPage unmount → 局部丢; 回来要靠重拉 transcript 还原。
    //   ⚠️ 不能用 staleTime:Infinity —— 本 query 在 sessionId 仍为 null 时挂载(disabled),
    //   activeSessionId 要等 sessions 列表解析后才落定→此刻 query 才 enable;但 refetchOnMount
    //   只在"挂载那一刻"判定, disabled 挂载已错过, enable 时 Infinity 又判缓存"新鲜"→ 永不重取,
    //   沿用上次挂载的旧快照 = 那条实时轮永久不见(必须 F5)。
    //   staleTime:0 让 enable / 重挂载都重取; refetchOnWindowFocus:false 避免流式中切窗口回来误刷
    //   (此刻 transcript 还不含在途轮, 刷了无害但没必要)。reset 仍 invalidate。
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    // "加载更早"增大 limitTurns 会换 queryKey 重取; keepPreviousData 让旧(较少)列表先留着,
    // 新(更多)到了再替换, 避免刷新瞬间列表塌成空。
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        // 显式带 ?session_id=xxx 让后端走 GetSessionMessagesByID 而不是 latest active,
        // 否则切会话时会有 race (前端 sessionId 已切到 B 但后端 latest 还是 A,
        // 返回 A 的 messages 但 query 缓存在 [history, B] 下 → 渲染串了)。
        const params = new URLSearchParams();
        if (sessionId) params.set('session_id', sessionId);
        if (limitTurns && limitTurns > 0) params.set('limit', String(limitTurns));
        const qs = params.toString();
        const url = `/user/claw/session/messages${qs ? `?${qs}` : ''}`;
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

// ─── context (token 水位) ───────────────────────────────────────────────

export function useClawContext(
  sessionId: string | null | undefined,
): UseQueryResult<ClawContextSnapshot> {
  const token = useAuthStore((s) => s.token);
  return useQuery<ClawContextSnapshot>({
    queryKey: ['claw', 'context', sessionId],
    enabled: !!token && !!sessionId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      try {
        // 同 useClawHistory: 显式 sessionId 走 by-id 路径, 防 race。
        const url = sessionId
          ? `/user/claw/session/context?session_id=${encodeURIComponent(sessionId)}`
          : '/user/claw/session/context';
        const { data } = await http.get<
          { data?: ClawContextSnapshot } & Partial<ClawContextSnapshot>
        >(url);
        const payload = unwrap<ClawContextSnapshot>(data);
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

// ─── 附件上传 / 引用文献 ────────────────────────────────────────────────
// 2026-07 输入框统一:实现上提 @/shared/api/agent-attach(端点参数化,三 feature 共用),
// 此处保留 claw 命名的薄封装(端点 = /user/claw/*),调用方零改动。

export function useUploadClawAttachment() {
  return useUploadAgentAttachment('/user/claw/upload');
}

export function useReferenceClawLibrary() {
  return useReferenceAgentLibrary('/user/claw/reference');
}

// ─── 多会话 API (P5+: 侧边栏会话列表) ────────────────────────────────────
//
// 会话 CRUD(list/create/rename/delete/activate)已收口到 shared/api/agent-sessions 工厂
// (与 smart-search 共用,只差端点前缀 + queryKey 根)。此处按 claw 命名 re-export,调用方零改动。
// 语义 / 失效范围 / staleTime / refetchOnMount:'always' 全部由工厂保持一致(见工厂内注释)。

/** 单条 session 元数据 — 跟 backend agentbridge.SessionListItem 对齐(shared AgentSessionItem)。 */
export type ClawSessionItem = AgentSessionItem;

const clawSessionApi = makeAgentSessionApi({ feature: 'claw', basePath: '/user/claw' });

/** 供 sidebar / 抽屉组装 shared AgentSessionList 用。 */
export const clawSessions = clawSessionApi;
export const useClawSessions = clawSessionApi.useSessions;
/** "新对话":不删任何已有会话,只新建一条(与 useResetClawSession 的"删旧+建新"对比)。 */
export const useCreateClawSession = clawSessionApi.useCreateSession;
/** 重命名某 session(透传 agent + touch last_accessed_at 上浮)。 */
export const useRenameClawSession = clawSessionApi.useRenameSession;
/** 删除某 session;删的是当前活跃时调用方应切到 list[0](或新建)。 */
export const useDeleteClawSession = clawSessionApi.useDeleteSession;
/** "切换到这个会话":后端把 last_accessed_at 设 NOW();前端切 sessionId → socket 自动重连。 */
export const useActivateClawSession = clawSessionApi.useActivateSession;

// ─── 模型选择 (sidebar ModelSelector) ──────────────────────────────────

/**
 * 单条 model — 跟 backend claw.ListModels 返回项一致。
 *
 * description 是 agent 的 tier 含义 ("Main model" / "Haiku model" 等),
 * 给 UI 直接展示。同 id 在 agent 端是去重的, 这里不会出现重复。
 */
export interface ClawModelInfo {
  id: string;
  name: string;
  description: string;
}

interface ListModelsResponse {
  models: ClawModelInfo[];
  total: number;
}

/**
 * 拿当前 agent 可选的模型 tier 列表, 给 sidebar 下拉用。
 *
 * staleTime 5min — 模型列表在 admin 改 agent_config 之前不会变, 不需要频繁刷。
 * 切到具体 model 走 WS set_runtime_config, 不走 HTTP, 不影响这个 cache。
 */
export function useClawModels(): UseQueryResult<ClawModelInfo[]> {
  const token = useAuthStore((s) => s.token);
  return useQuery<ClawModelInfo[]>({
    queryKey: ['claw', 'models'],
    enabled: !!token,
    staleTime: STALE_FRESH,
    queryFn: async () => {
      try {
        const { data } = await http.get<{
          data?: ListModelsResponse;
        } & Partial<ListModelsResponse>>('/user/claw/models');
        const payload = unwrap<ListModelsResponse>(data);
        return payload?.models ?? [];
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ─── 会话模型(P2 模型目录化)────────────────────────────────────────────
//
// per-session 模型真源已**服务端化**(agent_sessions.pinned_model):选择即发 WS
// set_runtime_config,backend hub 校验后落库;重连/多端由 hub 的 runtime_config_updated
// 迟到补帧恢复(useAgentSocket.sessionModel)。旧的 localStorage per-session map +
// 每次 onOpen 重发的旁路已删除 —— 双真源会脑裂,且服务端要做 entitlement/计费必须权威。
//
// 前端仅存两样:
//   1. NEW_CONV_MODEL_KEY:用户级「新对话默认模型」偏好(产品要求跨刷新粘性);
//   2. pendingInitialModel:新会话建成 → socket open 的**一次性**传递(内存,一发即弃)。

// 新对话真正建成 session 后,登记一次性初始模型;socket onOpen 取走并下发(服务端从此接管)。
const pendingInitialModel = new Map<string, string>();

/** 会话创建/adopt 时调用:若存在「新对话默认模型」偏好,登记为该会话的一次性初始模型。 */
export function markPendingInitialModel(sessionId: string) {
  const pref = getNewConversationModel();
  if (pref) pendingInitialModel.set(sessionId, pref);
}

/** 低层写入(供其它 feature —— 如 boltslides —— 用自己的偏好登记一次性初始模型)。map 按 sessionId 键,
 *  sessionId 全局唯一,claw/boltslides 共用此 map 不撞。 */
export function setPendingInitialModel(sessionId: string, modelId: string) {
  if (modelId) pendingInitialModel.set(sessionId, modelId);
}

/** socket onOpen 取走一次性初始模型(取后即删,服务端 pinned_model 从此是唯一真源)。 */
export function takePendingInitialModel(sessionId: string | null): string | undefined {
  if (!sessionId) return undefined;
  const pref = pendingInitialModel.get(sessionId);
  pendingInitialModel.delete(sessionId);
  return pref;
}

// 用户级「新对话默认模型」偏好:新对话(尚无 sessionId)时选的模型记在这里,下次开新对话默认带上。
// 历史对话不受影响(各自的服务端 pinned_model)。若偏好模型已下架/降档,hub 会静默降级为默认。
const NEW_CONV_MODEL_KEY = 'scholay:claw:new-conversation-model';

export function getNewConversationModel(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    return localStorage.getItem(NEW_CONV_MODEL_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function setNewConversationModel(modelId: string | null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!modelId) localStorage.removeItem(NEW_CONV_MODEL_KEY);
    else localStorage.setItem(NEW_CONV_MODEL_KEY, modelId);
  } catch {
    // 隐私模式 / 满了 → 忽略
  }
}

// ─── 未发送(命中额度被拦)消息的持久化 ─────────────────────────────────────
//
// 命中每日额度时, 那条消息被后端**在转发给 agent 之前**拒绝(根本没发出去)。把它按 session
// 存进 localStorage —— 这样无论用户怎么解额度(就地经费重置 / 跳支付宝充会员后整页返回 /
// 在另一台设备充值后回来),重新进入该会话都能看到这条「未发送」消息并**一键重发**, 不必重打。
// 文件附件已上传在会话隔离 cwd(按 path 引用), 故只持久化元数据即可重发。
const BLOCKED_MSG_KEY = 'scholay:claw:blocked-message';

export interface BlockedMessage {
  text: string;
  /** 含 agent cwd path, 重发时直接复用(文件仍在会话 cwd); previewUrl(本地 blob)不持久化。 */
  attachments: AttachmentDTO[];
  /** 引用文献(资料已物化进会话 cwd 的 references/,重发时只需重附引用块)。 */
  references?: ReferenceItemDTO[];
}

interface BlockedMap {
  [sessionId: string]: BlockedMessage;
}

function readBlockedMap(): BlockedMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BLOCKED_MSG_KEY);
    return raw ? (JSON.parse(raw) as BlockedMap) : {};
  } catch {
    return {};
  }
}

function writeBlockedMap(map: BlockedMap) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BLOCKED_MSG_KEY, JSON.stringify(map));
  } catch {
    // localStorage 满 / 隐私模式 → silently skip(重发能力降级为"要重打", 不报错)
  }
}

/** 读某 session 的「未发送」消息; 没有返回 undefined。 */
export function getBlockedMessage(sessionId: string | null): BlockedMessage | undefined {
  if (!sessionId) return undefined;
  return readBlockedMap()[sessionId];
}

/** 存某 session 的「未发送」消息(命中额度时); 自动剥离 attachments 上不可持久化的本地 previewUrl。 */
export function setBlockedMessage(sessionId: string, msg: BlockedMessage) {
  const map = readBlockedMap();
  map[sessionId] = {
    text: msg.text,
    attachments: msg.attachments.map((a) => ({ ...a, previewUrl: undefined })),
    // 引用文献必须一并持久化:否则重发时引用块为空,agent 不再看 references/、当没引用过一样回答,
    // 绿 chip 也消失(评审 claw-HIGH)。ReferenceItemDTO 是纯元数据、无本地 blob,可直接持久化。
    references: msg.references,
  };
  writeBlockedMap(map);
}

/** 清某 session 的「未发送」消息(成功重发 / 用户忽略后)。 */
export function clearBlockedMessage(sessionId: string | null) {
  if (!sessionId) return;
  const map = readBlockedMap();
  if (map[sessionId]) {
    delete map[sessionId];
    writeBlockedMap(map);
  }
}
