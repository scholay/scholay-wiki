/**
 * useTranslateStream — 流式翻译 hook
 *
 * 封装 publicScholarAPI.translateStream / translatePaperStream 的消费逻辑。
 */

import { useCallback, useRef, useState } from 'react';
import { publicScholarApi } from '../api/scholarApi';

interface TranslateStreamResult {
  translate: (text: string) => Promise<string>;
  translatePaper: (title: string, abstract: string, tldr: string) => Promise<void>;
  abort: () => void;
  isTranslating: boolean;
}

export function useTranslateStream(
  onChunk?: (field: string, text: string) => void,
  onDone?: () => void,
  onError?: (error: Error) => void
): TranslateStreamResult {
  const [isTranslating, setIsTranslating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const consumeSSE = useCallback(
    async (response: Response, fieldName: string = 'text'): Promise<string> => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

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
            const content = parsed.content || parsed.text || '';
            const field = parsed.field || fieldName;
            if (content) {
              fullText += content;
              onChunk?.(field, content);
            }
          } catch {
            if (data.trim()) {
              fullText += data;
              onChunk?.(fieldName, data);
            }
          }
        }
      }
      return fullText;
    },
    [onChunk]
  );

  const translate = useCallback(
    async (text: string): Promise<string> => {
      setIsTranslating(true);
      try {
        const response = await publicScholarApi.translateStream(text);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await consumeSSE(response);
        onDone?.();
        return result;
      } catch (err: any) {
        if (err.name !== 'AbortError') onError?.(err);
        return '';
      } finally {
        setIsTranslating(false);
      }
    },
    [consumeSSE, onDone, onError]
  );

  const translatePaper = useCallback(
    async (title: string, abstract: string, tldr: string) => {
      setIsTranslating(true);
      try {
        const response = await publicScholarApi.translatePaperStream(title, abstract, tldr);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await consumeSSE(response, 'paper');
        onDone?.();
      } catch (err: any) {
        if (err.name !== 'AbortError') onError?.(err);
      } finally {
        setIsTranslating(false);
      }
    },
    [consumeSSE, onDone, onError]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { translate, translatePaper, abort, isTranslating };
}
