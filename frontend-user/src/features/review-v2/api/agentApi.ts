/**
 * Agent API — 封装对后端 Agent 代理层的调用
 *
 * 后端代理 agent.scholay.com，前端无需接触 Agent API Token。
 * SSE 通过 fetch + ReadableStream 实现（POST 请求不支持 EventSource）。
 */

import { httpClient, API_URL } from 'shared/api/client';
import type { ApiResponse } from 'shared/types/api';

export type AgentProvider = 'codex' | 'claude';

export interface AgentSession {
  sessionId: string;
  provider: AgentProvider;
}

export interface UploadedFile {
  name: string;
  size: number;
  path: string;
  textPath?: string;
  textSize?: number;
}

export interface SSEEvent {
  event: string;
  data: Record<string, any>;
}

export type SSECallback = (event: SSEEvent) => void;

export const agentApi = {
  createSession: (provider: AgentProvider) =>
    httpClient.post<ApiResponse<AgentSession>>('/user/agent/sessions', {
      provider,
    }),

  deleteSession: (sessionId: string) =>
    httpClient.delete<ApiResponse>(`/user/agent/sessions/${sessionId}`),

  uploadFile: (sessionId: string, file: File) => {
    const formData = new FormData();
    formData.append('files', file);
    return httpClient.post<ApiResponse<{ uploaded: UploadedFile[] }>>(
      `/user/agent/sessions/${sessionId}/upload`,
      formData,
      { headers: { 'Content-Type': null as any } }
    );
  },

  /**
   * SSE chat — 发送消息并流式接收 AI 回复。
   *
   * 返回一个 AbortController，调用 .abort() 可取消请求。
   * onEvent 回调在每次收到 SSE 事件时触发。
   * onError 回调在连接错误时触发。
   * onComplete 在流完全结束后触发（无论正常结束还是错误）。
   */
  chatSSE: (
    sessionId: string,
    message: string,
    options: {
      search?: boolean;
      model?: string;
      onEvent: SSECallback;
      onError?: (error: Error) => void;
      onComplete?: () => void;
    }
  ): AbortController => {
    const controller = new AbortController();

    const token = localStorage.getItem('user_token');
    const baseURL = API_URL || '';

    const body: Record<string, any> = { message };
    if (options.search) body.search = true;
    if (options.model) body.model = options.model;

    fetch(`${baseURL}/api/v1/user/agent/sessions/${sessionId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Agent API error ${response.status}: ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith(':')) continue;

            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));
                options.onEvent({ event: currentEvent, data });
              } catch {
                options.onEvent({
                  event: currentEvent,
                  data: { raw: line.slice(6) },
                });
              }
              currentEvent = null;
            }
          }
        }
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        options.onError?.(err);
      })
      .finally(() => {
        options.onComplete?.();
      });

    return controller;
  },
};
