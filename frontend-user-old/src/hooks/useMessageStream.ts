/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * useMessageStream —— SSE 流式消息处理 Hook
 *
 * 封装 AbortController、fetch 发起、ReadableStream 读取、SSE 分块解析、
 * 增量 token 拼接，并通过回调通知调用方。
 *
 * 对外接口:
 *   const { startStream, abort, isStreaming, streamedContent, error } =
 *     useMessageStream({
 *       onConversationCreated,
 *       onUserMessageCreated,
 *       onMessageStart,
 *       onChunk,
 *       onComplete,
 *       onError,
 *     });
 *
 * startStream(url, { method, body, headers }) 发起一次流式请求。
 */

import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import logger from '../utils/logger';

export interface ConversationCreatedPayload {
  conversationId: string;
  title?: string;
}

export interface MessageStartPayload {
  messageId: string;
  parentMessageId: string | null;
}

export interface CompletePayload {
  messageId: string | null;
  parentMessageId: string | null;
  content: string;
  metadata: Record<string, any>;
}

export interface UseMessageStreamOptions {
  onConversationCreated?: (payload: ConversationCreatedPayload) => void;
  onUserMessageCreated?: (userMessageId: string) => void;
  onMessageStart?: (payload: MessageStartPayload) => void;
  onFirstChunk?: () => void;
  onChunk?: (delta: string, full: string) => void;
  onComplete?: (payload: CompletePayload) => void;
  onError?: (err: Error) => void;
}

export interface StartStreamInit {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

export interface UseMessageStreamReturn {
  startStream: (url: string, init?: StartStreamInit) => Promise<void>;
  abort: () => void;
  isStreaming: boolean;
  streamedContent: string;
  error: Error | null;
}

export default function useMessageStream(options: UseMessageStreamOptions = {}): UseMessageStreamReturn {
  const {
    onConversationCreated,
    onUserMessageCreated,
    onMessageStart,
    onFirstChunk,
    onChunk,
    onComplete,
    onError,
  } = options;

  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamedContent, setStreamedContent] = useState<string>('');
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsStreaming(false);
    setStreamedContent('');
  }, []);

  const startStream = useCallback(async (url: string, { method = 'POST', body, headers }: StartStreamInit = {}) => {
    setIsStreaming(true);
    setStreamedContent('');
    setError(null);

    abortControllerRef.current = new AbortController();

    const reqHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('user_token')}`,
      ...(headers || {}),
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: reqHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: abortControllerRef.current.signal,
      });
    } catch (err: any) {
      setIsStreaming(false);
      if (err?.name !== 'AbortError') {
        setError(err as Error);
        onError && onError(err as Error);
      }
      return;
    }

    if (!response.body) {
      setIsStreaming(false);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMessageId: string | null = null;
    let parentMessageId: string | null = null;
    let fullContent = '';
    let userMessageId: string | null = null;
    let messageEndReceived = false;

    // 平滑流式优化: 通过 requestAnimationFrame 批量更新
    let pendingContent = '';

    const flushStreamedContent = () => {
      if (pendingContent !== fullContent) {
        setStreamedContent(fullContent);
        pendingContent = fullContent;
      }
      animationFrameRef.current = null;
    };

    const scheduleUpdate = () => {
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(flushStreamedContent);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          logger.log('[AI Chat] Stream done');
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          flushStreamedContent();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        logger.log('[AI Chat] Received chunk, length:', chunk.length);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const jsonStr = line.slice(6);
            logger.log('[AI Chat] Received SSE line:', jsonStr.substring(0, 100));
            const data = JSON.parse(jsonStr);

            if (data.type === 'conversation_created') {
              onConversationCreated && onConversationCreated({
                conversationId: data.metadata.conversation_id,
                title: data.metadata.title,
              });
            } else if (data.type === 'user_message_created') {
              userMessageId = data.message_id;
              parentMessageId = userMessageId;
              onUserMessageCreated && onUserMessageCreated(userMessageId);
            } else if (data.type === 'message_start') {
              assistantMessageId = data.message_id;
              parentMessageId = data.metadata?.parent_message_id || parentMessageId;
              onMessageStart && onMessageStart({
                messageId: assistantMessageId,
                parentMessageId,
              });
            } else if (data.type === 'content_delta') {
              const isFirstContent = fullContent === '';
              fullContent += data.content;

              if (isFirstContent) {
                // 首个 chunk 使用 flushSync 保证状态原子更新
                // eslint-disable-next-line no-loop-func
                flushSync(() => {
                  setStreamedContent(fullContent);
                  onFirstChunk && onFirstChunk();
                });
                pendingContent = fullContent;
              } else {
                scheduleUpdate();
              }
              onChunk && onChunk(data.content, fullContent);
            } else if (data.type === 'message_end') {
              messageEndReceived = true;
              onComplete && onComplete({
                messageId: assistantMessageId,
                parentMessageId,
                content: fullContent,
                metadata: data.metadata || {},
              });
              fullContent = '';
              parentMessageId = null;
            } else if (data.type === 'error') {
              logger.error('Stream error:', data.error);
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        logger.error('Stream error:', err);
        setError(err as Error);
        onError && onError(err as Error);
      }
    } finally {
      // 流结束但未收到 message_end —— 兜底回调
      if (fullContent && !messageEndReceived && assistantMessageId) {
        onComplete && onComplete({
          messageId: assistantMessageId,
          parentMessageId,
          content: fullContent,
          metadata: {},
        });
      }
      setIsStreaming(false);
      setStreamedContent('');
    }

    if (messageEndReceived) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }, [onConversationCreated, onUserMessageCreated, onMessageStart, onFirstChunk, onChunk, onComplete, onError]);

  return {
    startStream,
    abort,
    isStreaming,
    streamedContent,
    error,
  };
}
