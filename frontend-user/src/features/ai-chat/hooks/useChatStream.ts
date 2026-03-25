/**
 * useChatStream — 对话流式响应 hook
 *
 * 封装 ChatPage 中 fetch + ReadableStream 的消费逻辑，
 * 提供 sendMessage / abort / streaming 状态。
 */

import { useCallback, useRef, useState } from 'react';
import { API_URL } from '../../../shared/api/client';

interface ChatStreamOptions {
  conversationId: string | number;
  onChunk?: (text: string, meta?: any) => void;
  onDone?: (fullText: string, meta?: any) => void;
  onError?: (error: Error) => void;
}

interface SendMessageParams {
  content: string;
  parentMessageId?: string | number | null;
  modelLevel?: string;
}

export function useChatStream({ conversationId, onChunk, onDone, onError }: ChatStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (params: SendMessageParams) => {
      if (!conversationId) return;

      abortControllerRef.current = new AbortController();
      setIsStreaming(true);

      let fullText = '';
      let meta: any = {};

      try {
        const token = localStorage.getItem('user_token');
        const response = await fetch(
          `${API_URL}/api/v1/user/conversations/${conversationId}/chat/stream`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({
              content: params.content,
              parent_message_id: params.parentMessageId || null,
              model_level: params.modelLevel || 'mid',
            }),
            signal: abortControllerRef.current.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullText += parsed.content;
                onChunk?.(parsed.content, parsed);
              }
              if (parsed.message_id) meta.messageId = parsed.message_id;
              if (parsed.parent_message_id) meta.parentMessageId = parsed.parent_message_id;
            } catch {
              // 非 JSON 行跳过
            }
          }
        }

        onDone?.(fullText, meta);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          onError?.(err);
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [conversationId, onChunk, onDone, onError]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { sendMessage, abort, isStreaming };
}
