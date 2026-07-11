/**
 * 智能助手 — session / history / context / upload 的 react-query hooks。
 * WS 连接见 [[useClawSocket]] (./socket.ts)。
 *
 * 多会话 API (P5+) 在文件末尾, 包括 useClawSessions / useCreateClawSession 等。
 * 单会话路径 (useClawSession / useResetClawSession 等) 保留兼容已有 UI 流程,
 * 行为含义已升级为 "取当前活跃 session" / "删当前 + 建新" (历史行不删)。
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';
import type {
  AttachmentDTO,
  ClawContextSnapshot,
  ClawHistoryEntry,
  ReferenceItemDTO,
  ReferenceResultDTO,
} from './types';
// TODO: 30s 没对应 STALE_* preset, 保留硬编码 (claw context 水位 + sessions list)。

interface SessionEnvelope {
  sessionId: string;
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

// ─── 附件上传 ───────────────────────────────────────────────────────────

/**
 * POST multipart /claw/upload, 返回 AttachmentDTO (方案 B)。
 *
 * 用法:
 *   const upload = useUploadClawAttachment();
 *   upload.mutateAsync({ file, sessionId }).then(att => { adopt(att.sessionId); add(att); });
 *
 * backend 把原始文件推到 agent 会话隔离 cwd, 返回落盘 path + sessionId:
 *   - sessionId 非空时透传 → 文件落到用户当前正在看的那个会话 (claw 多会话);
 *   - sessionId 为空 (新对话首次上传) → backend 新建会话并回传, 前端必须 adopt 它。
 * 图片额外在本地造一个 object URL 作预览 (后端不回 base64)。
 */
export function useUploadClawAttachment() {
  return useMutation<AttachmentDTO, Error, { file: File; sessionId?: string | null }>({
    mutationFn: async ({ file, sessionId }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (sessionId) fd.append('session_id', sessionId);
      try {
        const { data } = await http.post<
          { data?: AttachmentDTO } & Partial<AttachmentDTO>
        >('/user/claw/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const payload = unwrap<AttachmentDTO>(data);
        if (!payload?.type || !payload?.path) throw new Error('后端未返回附件');
        return payload.type === 'image'
          ? { ...payload, previewUrl: URL.createObjectURL(file) }
          : payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * 引用文献集论文 / 文件夹 → 后端把资料物化进会话隔离 cwd 的 references/,返回 chip 元数据。
 * 同上传:sessionId 为空(新对话首次引用)→ 后端新建会话并回传,前端必须 adopt(onSessionEnsured)。
 */
export function useReferenceClawLibrary() {
  return useMutation<
    ReferenceResultDTO,
    Error,
    { sessionId?: string | null; paperIds?: number[]; folderIds?: number[] }
  >({
    mutationFn: async ({ sessionId, paperIds, folderIds }) => {
      try {
        const { data } = await http.post<
          { data?: ReferenceResultDTO } & Partial<ReferenceResultDTO>
        >('/user/claw/reference', {
          session_id: sessionId ?? '',
          paper_ids: paperIds ?? [],
          folder_ids: folderIds ?? [],
        });
        const payload = unwrap<ReferenceResultDTO>(data);
        if (!payload?.items) throw new Error('后端未返回引用结果');
        return payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ─── 多会话 API (P5+: 侧边栏会话列表) ────────────────────────────────────

/**
 * 单条 session 元数据 — 跟 backend agentbridge.SessionListItem 对齐。
 *
 * 字段意义:
 *   - sessionId: agent 端 UUID, 跟 WS path /claw/ws/:sessionId 对应
 *   - title: agent 端自管的标题 (首条消息后自动生成, 或 admin/用户改名)
 *   - messageCount: 该会话总消息数 (含 user/assistant/tool_use/tool_result, 给列表展示)
 *   - lastAccessedAt: backend DB 的 last_accessed_at, 列表按此 DESC 排
 */
export interface ClawSessionItem {
  sessionId: string;
  title: string;
  messageCount: number;
  lastAccessedAt: string;
  createdAt: string;
  agentCreatedAt?: string;
  agentModifiedAt?: string;
}

interface ListSessionsResponse {
  items: ClawSessionItem[];
  total: number;
}

/**
 * 列出当前用户的所有 claw 会话, 给侧边栏 ChatGPT 式会话列表用。
 *
 * 排序: 后端按 last_accessed_at DESC 排 (最近用过的在前)。
 * staleTime: 30s — 用户切会话 / 收到新消息后会主动 invalidate, 这里只保 30s
 * 兜底防止短时间内重复 fetch。
 */
export function useClawSessions(): UseQueryResult<ClawSessionItem[]> {
  const token = useAuthStore((s) => s.token);
  return useQuery<ClawSessionItem[]>({
    queryKey: ['claw', 'sessions'],
    enabled: !!token,
    staleTime: 30 * 1000,
    // 每次重挂载无条件重拉(对齐 useClawHistory 的 refetchOnMount:'always')。
    // 修「最新会话从侧边栏列表消失、要退出重登才出现」: 列表缓存可能被定格成
    // 「创建该会话之前的旧快照」并在 30s staleTime 窗内标记为 fresh —— 此时
    // 仅靠 staleTime 的重挂载不会重拉(refetchOnMount 默认只在 stale 时刷),
    // 站内来回切页 / 切 tab / 移动端重开抽屉全部无法自愈, 唯一出口是退登 qc.clear()。
    // 触发器: 进页面首屏 sessions 请求 in-flight 时懒新建会话, create 的 invalidate
    // 被并进那条更早发出、只带回旧列表的 in-flight 请求(query-core 在 data===undefined
    // 时复用 in-flight 而非取消重发), 旧响应无版本守卫地覆盖成 fresh-but-stale;
    // 命中额度那一轮又因 quota_exceeded 帧不进 socket.messages、丢了 message_complete
    // 的兜底刷新(见 useClawConversation WS effect)。加这一行让任意重挂载强制核对, 根除「卡到退登才好」。
    refetchOnMount: 'always',
    queryFn: async () => {
      try {
        const { data } = await http.get<{
          data?: ListSessionsResponse;
        } & Partial<ListSessionsResponse>>('/user/claw/sessions');
        const payload = unwrap<ListSessionsResponse>(data);
        return payload?.items ?? [];
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * "新对话" — POST /claw/sessions. 不删任何已有会话, 只是新建一条。
 * 跟 useResetClawSession 的"删旧+建新"语义对比, 这是多会话语义下的正确做法。
 *
 * 成功后调用方应当:
 *   1. 把当前活跃 sessionId 切到新返回的 id (前端 state)
 *   2. invalidate ['claw'] 让 session list + history + context 全部刷新
 */
export function useCreateClawSession() {
  const qc = useQueryClient();
  return useMutation<SessionEnvelope>({
    mutationFn: async () => {
      try {
        const { data } = await http.post<{
          data?: SessionEnvelope;
        } & Partial<SessionEnvelope>>('/user/claw/sessions', {});
        const payload = unwrap<SessionEnvelope>(data);
        if (!payload?.sessionId) throw new Error('后端未返回 sessionId');
        return payload;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['claw'] });
    },
  });
}

/**
 * 重命名某 session — PATCH /claw/sessions/:id with { title }.
 * 后端透传给 agent, 同时 touch last_accessed_at 让此条上浮到列表顶端。
 */
export function useRenameClawSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, { sessionId: string; title: string }>({
    mutationFn: async ({ sessionId, title }) => {
      try {
        await http.patch(`/user/claw/sessions/${sessionId}`, { title });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['claw', 'sessions'] });
    },
  });
}

/**
 * 删除某 session — DELETE /claw/sessions/:id.
 * 删的是当前活跃 session 时, 调用方应当把活跃 sessionId 切到 list[0] (或新建)。
 */
export function useDeleteClawSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (sessionId) => {
      try {
        await http.delete(`/user/claw/sessions/${sessionId}`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['claw'] });
    },
  });
}

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

/**
 * 用户的"每会话首选模型"记忆 — 写在 localStorage,跨刷新保留, 不跨设备。
 *
 * 为什么不放 backend: agent 端 set_runtime_config 本身是 WS 连接级别 (不写盘),
 * 我们也只在前端"重连时 auto-send" 即可, 没必要在 backend 加 schema 字段。
 * 选择的持久性 = "我这台浏览器记得这个 sessionId 用过 gpt-5"。
 */
const MODEL_STORAGE_KEY = 'scholay:claw:session-model';

interface SessionModelMap {
  [sessionId: string]: string;
}

function readModelMap(): SessionModelMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MODEL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionModelMap) : {};
  } catch {
    return {};
  }
}

function writeModelMap(map: SessionModelMap) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage 满了 / 隐私模式禁用 → silently skip
  }
}

/** 读某 session 的首选模型; 没记过返回 undefined 表示用 agent 默认。 */
export function getClawSessionModel(sessionId: string | null): string | undefined {
  if (!sessionId) return undefined;
  return readModelMap()[sessionId];
}

/** 写某 session 的首选模型; modelId 为空字符串 / null 表示清掉用户偏好。 */
export function setClawSessionModel(sessionId: string, modelId: string | null) {
  const map = readModelMap();
  if (!modelId) {
    delete map[sessionId];
  } else {
    map[sessionId] = modelId;
  }
  writeModelMap(map);
}

// ─── 新对话的模型偏好 (独立于 per-session) ──────────────────────────────
//
// 语义区分 (按产品要求):
//   - **新对话** (还没有 sessionId): 用户选的模型记在这里, 跨刷新保留。下次开新对话默认带上。
//   - **历史对话**: 各自用 per-session 记忆 (getClawSessionModel), 不受新对话偏好影响 ——
//     即"历史对话默认还是它会话里用的模型"。
// 新对话首条消息真正创建 session 时, ClawPage 会把这个偏好 transferNewConversationModel 到
// 新 sessionId 的 per-session 记忆, 这样 socket open 的 auto-apply 能拿到。
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

/** 新对话真正建成 session 后, 把"新对话模型偏好"转写到该 session 的 per-session 记忆。
 *  这样 socket open 的 auto-apply (读 getClawSessionModel) 能把模型 push 给 agent。 */
export function transferNewConversationModel(newSessionId: string) {
  const pref = getNewConversationModel();
  if (pref) setClawSessionModel(newSessionId, pref);
}

/**
 * "切换到这个会话" — POST /claw/sessions/:id/activate.
 *
 * 后端做的事是把 last_accessed_at 设成 NOW(), 这样 GetOrCreateSession 取最近活跃时
 * 命中这条。前端调完后:
 *   - 把本地选中 sessionId state 切过去
 *   - invalidate ['claw'] 让 session/history/context 重新 fetch
 *   - useClawSocket 因 sessionId 变化自动重连
 */
export function useActivateClawSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (sessionId) => {
      try {
        await http.post(`/user/claw/sessions/${sessionId}/activate`, {});
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['claw'] });
    },
  });
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
