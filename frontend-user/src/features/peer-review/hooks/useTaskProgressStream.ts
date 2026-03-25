/**
 * useTaskProgressStream — SSE 任务进度监听 hook
 *
 * 封装 peerReviewAPI.watchTaskProgress 的 EventSource 逻辑。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { peerReviewApi } from '../api/peerReviewApi';

interface TaskProgressEvent {
  type: string;
  data: any;
}

interface UseTaskProgressStreamOptions {
  taskId: string;
  enabled?: boolean;
  onProgress?: (event: TaskProgressEvent) => void;
  onComplete?: () => void;
  onError?: (error: Event) => void;
}

export function useTaskProgressStream({
  taskId,
  enabled = true,
  onProgress,
  onComplete,
  onError,
}: UseTaskProgressStreamOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbackRefs = useRef({ onProgress, onComplete, onError });
  callbackRefs.current = { onProgress, onComplete, onError };

  const connect = useCallback(() => {
    if (!taskId || eventSourceRef.current) return;

    const es = peerReviewApi.watchTaskProgress(taskId);
    eventSourceRef.current = es;

    es.onopen = () => setIsConnected(true);

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        callbackRefs.current.onProgress?.({ type: 'message', data: parsed });

        if (parsed.status === 'completed' || parsed.status === 'failed') {
          callbackRefs.current.onComplete?.();
          es.close();
          eventSourceRef.current = null;
          setIsConnected(false);
        }
      } catch {
        // 非 JSON 消息忽略
      }
    };

    es.onerror = (event) => {
      callbackRefs.current.onError?.(event);
      setIsConnected(false);
    };
  }, [taskId]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (enabled && taskId) {
      connect();
    }
    return () => disconnect();
  }, [enabled, taskId, connect, disconnect]);

  return { isConnected, connect, disconnect };
}
