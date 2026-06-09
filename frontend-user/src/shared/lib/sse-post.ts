/**
 * POST + SSE stream 工具 —— 走原生 fetch + ReadableStream(`shared/lib` 唯一
 * 允许的 fetch 出口,集中收口而不是散落到各 feature)。
 *
 * 为什么不用 EventSource:
 *   EventSource 只支持 GET 且不能带 body / 自定义 header。我们的 SSE 接口
 *   (translate / upload-resolve)都是 POST 带 body,只能 fetch + ReadableStream。
 *
 * 为什么不用 axios:
 *   axios 浏览器侧不暴露 response.body 为 ReadableStream(只有 Node),
 *   读不到流式增量,达不到"边收边渲染"的体验。
 *
 * 用法:
 *   await streamSsePost({
 *     url: '/public/translate/paper/stream',
 *     body: { title, abstract },
 *     signal: ctrl.signal,
 *     onEvent: ({ event, data }) => { ... },
 *   });
 */

import { getAuthToken, notifyAuthLost } from '@/shared/lib/auth-token';
import { notifyQuotaExceeded } from '@/shared/lib/quota-events';

export interface ParsedSseEvent {
  /** SSE `event:` 行的值;无 `event:` 行时为空串(标准 SSE 行为) */
  event: string;
  /** SSE `data:` 行的拼接(多行 data: 用 \n 连接,与浏览器原生 EventSource 一致) */
  data: string;
}

export interface StreamSsePostOptions {
  /**
   * URL —— 支持 3 种写法:
   *   - 绝对 URL: `https://...`
   *   - `/api/...`(绝对路径,绕过 baseURL 前缀)
   *   - `/path/...`(自动拼接 VITE_API_BASE_URL 或 `/api/v1`)
   */
  url: string;
  /** 请求 body:JSON 对象自动 stringify;FormData 直接透传 */
  body: FormData | object;
  signal?: AbortSignal;
  /** 收到一个 SSE event 触发一次 */
  onEvent: (e: ParsedSseEvent) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export async function streamSsePost({
  url,
  body,
  signal,
  onEvent,
}: StreamSsePostOptions): Promise<void> {
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  if (!isForm) headers['Content-Type'] = 'application/json';
  // Authorization 走 getAuthToken() —— 与 axios / 其它 SSE 同一真源(localStorage.auth_token)
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const fullUrl =
    url.startsWith('http') || url.startsWith('/api/')
      ? url
      : API_BASE + url;

  const res = await fetch(fullUrl, {
    method: 'POST',
    headers,
    body: isForm ? (body as FormData) : JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    // SSE 绕过 axios 拦截器 —— 认证失效 / 额度耗尽 要手动汇入统一出口。
    if (res.status === 401) notifyAuthLost();
    // 非 SSE 错误 —— 后端走 utils.Error 返回 JSON,尽量取 message + code
    let msg = `请求失败 (${res.status})`;
    try {
      const j = await res.json();
      if (j && typeof j === 'object' && 'message' in j && j.message) {
        msg = String(j.message);
      }
      if (j && typeof j === 'object' && (j as { code?: number }).code === 6010) {
        notifyQuotaExceeded({ message: msg });
      }
    } catch {
      /* ignore parse failure */
    }
    throw new Error(msg);
  }
  if (!res.body) throw new Error('SSE 响应没有 body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE: 每个 event 由 "\n\n" 分隔,内部按 "event:" / "data:" 行解析
    let nl: number;
    while ((nl = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, nl);
      buf = buf.slice(nl + 2);

      let event = '';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      onEvent({ event, data: dataLines.join('\n') });
    }
  }
}
