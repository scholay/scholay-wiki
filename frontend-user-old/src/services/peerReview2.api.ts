/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 智能审稿 V2 — 对接 peer.scholay.com 的客户端层。
 *
 * 与老 peerReviewAPI 完全独立。匿名用户的访问凭证 anon_token 通过 localStorage
 * 在客户端持久化(后端表里也有,但前端是源)。所有读接口都自动附带它。
 */

import api, { API_URL, tokenCache } from './client';

const ANON_TOKEN_STORAGE_KEY = 'pr2_anon_token';

export const pr2AnonToken = {
  get(): string {
    try {
      return localStorage.getItem(ANON_TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  },
  set(token: string): void {
    if (!token) return;
    try {
      localStorage.setItem(ANON_TOKEN_STORAGE_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(ANON_TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

// 已登录用户跳过 anon_token (后端按 user_id 关联)
const anonParam = (): Record<string, string> => {
  if (tokenCache.get()) return {};
  const t = pr2AnonToken.get();
  return t ? { anon_token: t } : {};
};

// ============================================================================
// 类型
// ============================================================================

export type PR2Status =
  | 'pending'
  | 'running'
  | 'idle'
  | 'paused'
  | 'failed'
  | 'archived';

export type PR2Recommendation = 'Accept' | 'Minor' | 'Major' | 'Reject' | '';

export interface PR2ConversationSummary {
  id: number;
  title?: string;
  paper_filename?: string;
  status: PR2Status;
  final_recommendation?: PR2Recommendation;
  final_chars?: number;
  created_at: string;
  updated_at: string;
}

export interface PR2ConversationDetail extends PR2ConversationSummary {
  remote_conversation_id: string;
  remote_thread_id?: string;
}

export interface PR2CreateResponse {
  id: number;
  remote_conversation_id: string;
  title?: string;
  paper_filename?: string;
  status: PR2Status;
  anon_token?: string;
  is_idempotent: boolean;
  created_at: string;
}

export interface PR2Turn {
  id: string;
  conversation_id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'timeout';
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface PR2Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  seq: number;
  created_at: string;
}

export interface PR2TrialStatus {
  can_trial: boolean;
  trial_day?: string;
  consumed_at?: string;
  reason?: string;
}

// ============================================================================
// REST 端点
// ============================================================================

export const peerReview2API = {
  trialStatus(): Promise<PR2TrialStatus> {
    return api.get('/user/peer-review2/trial-status').then((r) => r.data.data);
  },

  /**
   * 上传 PDF 创建审稿会话。命中本地幂等(同设备同 PDF) → is_idempotent=true。
   * 匿名首次会下发 anon_token,自动写入 localStorage。
   */
  async createConversation(
    file: File,
    title = '',
  ): Promise<PR2CreateResponse> {
    const fd = new FormData();
    fd.append('file', file);
    if (title) fd.append('title', title);
    if (!tokenCache.get()) {
      const t = pr2AnonToken.get();
      if (t) fd.append('anon_token', t);
    }
    const resp = await api.post('/user/peer-review2/conversations', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const data: PR2CreateResponse = resp.data.data;
    if (data.anon_token && !tokenCache.get()) {
      pr2AnonToken.set(data.anon_token);
    }
    return data;
  },

  listConversations(page = 1, pageSize = 20) {
    return api
      .get('/user/peer-review2/conversations', {
        params: { page, page_size: pageSize, ...anonParam() },
      })
      .then((r) => r.data.data as {
        items: PR2ConversationSummary[];
        total: number;
        page: number;
        page_size: number;
        total_pages: number;
      });
  },

  getConversation(id: number): Promise<PR2ConversationDetail> {
    return api
      .get(`/user/peer-review2/conversations/${id}`, {
        params: anonParam(),
      })
      .then((r) => r.data.data);
  },

  deleteConversation(id: number) {
    return api.delete(`/user/peer-review2/conversations/${id}`, {
      params: anonParam(),
    });
  },

  listTurns(id: number): Promise<PR2Turn[]> {
    return api
      .get(`/user/peer-review2/conversations/${id}/turns`, {
        params: anonParam(),
      })
      .then((r) => r.data.data);
  },

  listMessages(id: number): Promise<PR2Message[]> {
    return api
      .get(`/user/peer-review2/conversations/${id}/messages`, {
        params: anonParam(),
      })
      .then((r) => r.data.data);
  },

  sendFollowUp(
    id: number,
    content: string,
    clientMsgID = '',
  ): Promise<PR2Turn> {
    return api
      .post(
        `/user/peer-review2/conversations/${id}/messages`,
        { content, client_msg_id: clientMsgID },
        { params: anonParam() },
      )
      .then((r) => r.data.data);
  },

  pause(id: number) {
    return api.post(
      `/user/peer-review2/conversations/${id}/pause`,
      undefined,
      { params: anonParam() },
    );
  },

  resume(id: number) {
    return api.post(
      `/user/peer-review2/conversations/${id}/resume`,
      undefined,
      { params: anonParam() },
    );
  },

  /** 登录后认领该匿名 token 下的所有会话 */
  claimAll(anonToken: string) {
    return api.post('/user/peer-review2/claim-all', { anon_token: anonToken });
  },
};

// ============================================================================
// SSE 流式 — fetch + ReadableStream + 行解析器
// ============================================================================

export interface PR2StreamEvent {
  /** SSE event 类型;无 event 行时为 'message' */
  event: string;
  /** SSE id 行(可选) */
  id?: string;
  /** 解析后的 JSON;无法解析时为 raw 字符串 */
  data: any;
  /** 原始 data 字符串(便于 debug) */
  raw: string;
}

export interface PR2StreamHandlers {
  onEvent: (e: PR2StreamEvent) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

/**
 * 订阅 turn 的 SSE 流。返回一个 cancel 函数。
 *
 * 通过 fetch + ReadableStream 解析,因为:
 *   - EventSource 不支持自定义 header(Bearer 没法带)
 *   - 需要在网络层支持 cancel(用户切换会话/退出页面)
 */
export function streamTurn(
  conversationID: number,
  turnID: string,
  handlers: PR2StreamHandlers,
): () => void {
  const ctrl = new AbortController();
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  const token = tokenCache.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const params = new URLSearchParams();
  if (!token) {
    const t = pr2AnonToken.get();
    if (t) params.set('anon_token', t);
  }
  const qs = params.toString();
  const url =
    `${API_URL}/api/v1/user/peer-review2/conversations/${conversationID}/turns/${turnID}/stream` +
    (qs ? `?${qs}` : '');

  (async () => {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const txt = await resp.text().catch(() => '');
        throw new Error(
          `SSE open failed: ${resp.status} ${txt.slice(0, 200)}`,
        );
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE 事件由空行分隔(\n\n 或 \r\n\r\n)
        let sep: number;
        while ((sep = buf.indexOf('\n\n')) >= 0 || (sep = buf.indexOf('\r\n\r\n')) >= 0) {
          const isCRLF = buf[sep] === '\r';
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + (isCRLF ? 4 : 2));
          const ev = parseSSEBlock(block);
          if (ev) handlers.onEvent(ev);
        }
      }
      // flush 残余
      if (buf.trim()) {
        const ev = parseSSEBlock(buf);
        if (ev) handlers.onEvent(ev);
      }
      handlers.onClose?.();
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        handlers.onClose?.();
        return;
      }
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => ctrl.abort();
}

function parseSSEBlock(block: string): PR2StreamEvent | null {
  if (!block) return null;
  let event = 'message';
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of block.split('\n')) {
    // 防御性裁掉行尾 \r (CRLF 网络帧 or 代理重写)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(':')) continue; // 注释行
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon);
    let value = line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    // 部分代理偶尔会留一个尾随 \r
    if (value.endsWith('\r')) value = value.slice(0, -1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
    else if (field === 'id') id = value;
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join('\n');
  let data: any = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* keep raw string */
  }
  return { event, id, data, raw };
}
