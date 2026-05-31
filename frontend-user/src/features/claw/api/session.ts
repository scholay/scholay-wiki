/**
 * 智能助手 — session / history / context / upload 的 react-query hooks。
 * WS 连接见 [[useClawSocket]] (./socket.ts)。
 *
 * 多会话 API (P5+) 在文件末尾, 包括 useClawSessions / useCreateClawSession 等。
 * 单会话路径 (useClawSession / useResetClawSession 等) 保留兼容已有 UI 流程,
 * 行为含义已升级为 "取当前活跃 session" / "删当前 + 建新" (历史行不删)。
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';
import type {
  AttachmentDTO,
  ClawContextSnapshot,
  ClawHistoryEntry,
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
}

export function useClawHistory(
  sessionId: string | null | undefined,
): UseQueryResult<HistoryResponse> {
  const token = useAuthStore((s) => s.token);
  return useQuery<HistoryResponse>({
    queryKey: ['claw', 'history', sessionId],
    enabled: !!token && !!sessionId,
    staleTime: Infinity, // 只追加, 进入页面拉一次足够; reset 时 invalidate
    queryFn: async () => {
      try {
        // 显式带 ?session_id=xxx 让后端走 GetSessionMessagesByID 而不是 latest active,
        // 否则切会话时会有 race (前端 sessionId 已切到 B 但后端 latest 还是 A,
        // 返回 A 的 messages 但 query 缓存在 [history, B] 下 → 渲染串了)。
        const url = sessionId
          ? `/user/claw/session/messages?session_id=${encodeURIComponent(sessionId)}`
          : '/user/claw/session/messages';
        const { data } = await http.get<
          { data?: HistoryResponse } & Partial<HistoryResponse>
        >(url);
        const payload = unwrap<HistoryResponse>(data);
        return {
          sessionId: payload?.sessionId ?? sessionId ?? '',
          messages: payload?.messages ?? [],
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
