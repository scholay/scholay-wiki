/**
 * useTranslation Hook
 * 管理文本翻译状态，支持SSE流式翻译
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import { publicScholarAPI } from '../services/scholar.api';
import { trackAbstractTranslate } from '../utils/usageTracker';
import logger from '../utils/logger';

export type TranslationStatus = 'idle' | 'translating' | 'completed' | 'error';
export type DisplayMode = 'original' | 'translated';

export interface TranslationState {
  status: TranslationStatus;
  text: string;
  error: string;
}

export interface PaperTranslationState {
  title_zh: string;
  abstract_zh: string;
  tldr_zh: string;
  status: TranslationStatus;
  error: string;
}

// SSE chunk shape from upstream LLM providers — varies by provider; loosely typed.
interface SSEChunk {
  error?: string;
  content?: string;
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string };
  }>;
}

export const containsChinese = (text: string | null | undefined): boolean => {
  if (!text) return false;
  const chineseRegex = /[\u4e00-\u9fa5]/;
  return chineseRegex.test(text);
};

export const isPrimarilyChinese = (text: string | null | undefined): boolean => {
  if (!text) return false;
  const chineseRegex = /[\u4e00-\u9fa5]/g;
  const matches = text.match(chineseRegex);
  const chineseCount = matches ? matches.length : 0;
  const totalChars = text.replace(/[\s\p{P}]/gu, '').length;
  if (totalChars === 0) return false;
  return chineseCount / totalChars > 0.3;
};

export interface UseTranslationResult {
  translations: Record<string, TranslationState>;
  displayModes: Record<string, DisplayMode>;
  getTranslationState: (key: string) => TranslationState;
  getDisplayMode: (key: string) => DisplayMode;
  toggleDisplayMode: (key: string) => void;
  translate: (key: string, text: string) => Promise<void>;
  cancelTranslation: (key: string) => void;
  resetTranslation: (key: string) => void;
  shouldShowTranslateButton: (text: string | null | undefined) => boolean;
  containsChinese: (text: string | null | undefined) => boolean;
  isPrimarilyChinese: (text: string | null | undefined) => boolean;
  paperTranslations: Record<string, PaperTranslationState>;
  paperDisplayModes: Record<string, DisplayMode>;
  getPaperTranslationState: (paperId: string) => PaperTranslationState;
  getPaperDisplayMode: (paperId: string) => DisplayMode;
  togglePaperDisplayMode: (paperId: string) => void;
  shouldDisablePaperTranslate: (
    title: string | null | undefined,
    abstract: string | null | undefined,
    tldr: string | null | undefined,
  ) => boolean;
  translatePaper: (
    paperId: string,
    title: string | null | undefined,
    abstract: string | null | undefined,
    tldr: string | null | undefined,
  ) => Promise<void>;
  cancelPaperTranslation: (paperId: string) => void;
}

export const useTranslation = (): UseTranslationResult => {
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});
  const [displayModes, setDisplayModes] = useState<Record<string, DisplayMode>>({});
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const [paperTranslations, setPaperTranslations] = useState<Record<string, PaperTranslationState>>({});
  const [paperDisplayModes, setPaperDisplayModes] = useState<Record<string, DisplayMode>>({});

  const getTranslationState = useCallback(
    (key: string): TranslationState => {
      return translations[key] || { status: 'idle', text: '', error: '' };
    },
    [translations],
  );

  const getDisplayMode = useCallback(
    (key: string): DisplayMode => {
      return displayModes[key] || 'original';
    },
    [displayModes],
  );

  const toggleDisplayMode = useCallback((key: string): void => {
    setDisplayModes((prev) => ({
      ...prev,
      [key]: prev[key] === 'translated' ? 'original' : 'translated',
    }));
  }, []);

  const translate = useCallback(
    async (key: string, text: string): Promise<void> => {
      const existing = translations[key];
      if (existing && existing.status === 'completed' && existing.text) {
        setDisplayModes((prev) => ({ ...prev, [key]: 'translated' }));
        return;
      }

      if (existing && existing.status === 'translating') {
        return;
      }

      if (abortControllersRef.current[key]) {
        abortControllersRef.current[key].abort();
      }

      const abortController = new AbortController();
      abortControllersRef.current[key] = abortController;

      setTranslations((prev) => ({
        ...prev,
        [key]: { status: 'translating', text: '', error: '' },
      }));
      setDisplayModes((prev) => ({ ...prev, [key]: 'translated' }));

      try {
        const response = await publicScholarAPI.translateStream(text);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let translatedText = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (abortController.signal.aborted) {
            reader.cancel();
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                continue;
              }

              try {
                const parsed = JSON.parse(data) as SSEChunk;

                if (parsed.error) {
                  throw new Error(parsed.error);
                }

                const content =
                  parsed.choices?.[0]?.delta?.content ||
                  parsed.choices?.[0]?.message?.content ||
                  parsed.content ||
                  '';

                if (content) {
                  translatedText += content;

                  setTranslations((prev) => ({
                    ...prev,
                    [key]: { status: 'translating', text: translatedText, error: '' },
                  }));
                }
              } catch (parseError) {
                logger.warn('Parse error:', parseError);
              }
            }
          }
        }

        setTranslations((prev) => ({
          ...prev,
          [key]: { status: 'completed', text: translatedText, error: '' },
        }));

        const paperId = key.split('_')[0];
        if (paperId) {
          trackAbstractTranslate(paperId);
        }
      } catch (error: unknown) {
        const e = error as Error;
        if (e.name === 'AbortError') {
          return;
        }

        console.error('Translation error:', error);
        setTranslations((prev) => ({
          ...prev,
          [key]: { status: 'error', text: '', error: e.message || '翻译失败' },
        }));
        setDisplayModes((prev) => ({ ...prev, [key]: 'original' }));
      } finally {
        delete abortControllersRef.current[key];
      }
    },
    [translations],
  );

  const cancelTranslation = useCallback((key: string): void => {
    if (abortControllersRef.current[key]) {
      abortControllersRef.current[key].abort();
      delete abortControllersRef.current[key];
    }
    setTranslations((prev) => ({
      ...prev,
      [key]: { status: 'idle', text: '', error: '' },
    }));
    setDisplayModes((prev) => ({ ...prev, [key]: 'original' }));
  }, []);

  const resetTranslation = useCallback((key: string): void => {
    setTranslations((prev) => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
    setDisplayModes((prev) => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
  }, []);

  const shouldShowTranslateButton = useCallback((text: string | null | undefined): boolean => {
    if (!text) return false;
    return !isPrimarilyChinese(text);
  }, []);

  // ========== 论文整体翻译相关函数 ==========

  const getPaperTranslationState = useCallback(
    (paperId: string): PaperTranslationState => {
      return (
        paperTranslations[paperId] || {
          title_zh: '',
          abstract_zh: '',
          tldr_zh: '',
          status: 'idle',
          error: '',
        }
      );
    },
    [paperTranslations],
  );

  const getPaperDisplayMode = useCallback(
    (paperId: string): DisplayMode => {
      return paperDisplayModes[paperId] || 'original';
    },
    [paperDisplayModes],
  );

  const togglePaperDisplayMode = useCallback((paperId: string): void => {
    setPaperDisplayModes((prev) => ({
      ...prev,
      [paperId]: prev[paperId] === 'translated' ? 'original' : 'translated',
    }));
  }, []);

  const shouldDisablePaperTranslate = useCallback(
    (
      title: string | null | undefined,
      abstract: string | null | undefined,
      tldr: string | null | undefined,
    ): boolean => {
      const titleIsChinese = !title || isPrimarilyChinese(title);
      const abstractIsChinese = !abstract || isPrimarilyChinese(abstract);
      const tldrIsChinese = !tldr || isPrimarilyChinese(tldr);
      return titleIsChinese && abstractIsChinese && tldrIsChinese;
    },
    [],
  );

  const parsePaperTranslationResponse = useCallback(
    (text: string): { title_zh: string; abstract_zh: string; tldr_zh: string } => {
      const result = { title_zh: '', abstract_zh: '', tldr_zh: '' };

      const titleMatch = text.match(/<title_zh>([\s\S]*?)<\/title_zh>/);
      if (titleMatch) {
        result.title_zh = titleMatch[1].trim();
      }

      const abstractMatch = text.match(/<abstract_zh>([\s\S]*?)<\/abstract_zh>/);
      if (abstractMatch) {
        result.abstract_zh = abstractMatch[1].trim();
      }

      const tldrMatch = text.match(/<tldr_zh>([\s\S]*?)<\/tldr_zh>/);
      if (tldrMatch) {
        result.tldr_zh = tldrMatch[1].trim();
      }

      return result;
    },
    [],
  );

  const translatePaper = useCallback(
    async (
      paperId: string,
      title: string | null | undefined,
      abstract: string | null | undefined,
      tldr: string | null | undefined,
    ): Promise<void> => {
      const existing = paperTranslations[paperId];
      if (existing && existing.status === 'completed') {
        setPaperDisplayModes((prev) => ({ ...prev, [paperId]: 'translated' }));
        return;
      }

      if (existing && existing.status === 'translating') {
        return;
      }

      const abortKey = `paper_${paperId}`;
      if (abortControllersRef.current[abortKey]) {
        abortControllersRef.current[abortKey].abort();
      }

      const abortController = new AbortController();
      abortControllersRef.current[abortKey] = abortController;

      setPaperTranslations((prev) => ({
        ...prev,
        [paperId]: { title_zh: '', abstract_zh: '', tldr_zh: '', status: 'translating', error: '' },
      }));
      setPaperDisplayModes((prev) => ({ ...prev, [paperId]: 'translated' }));

      try {
        const response = await publicScholarAPI.translatePaperStream(title || '', abstract || '', tldr || '');

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (abortController.signal.aborted) {
            reader.cancel();
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                continue;
              }

              try {
                const parsed = JSON.parse(data) as SSEChunk;

                if (parsed.error) {
                  throw new Error(parsed.error);
                }

                const content =
                  parsed.choices?.[0]?.delta?.content ||
                  parsed.choices?.[0]?.message?.content ||
                  parsed.content ||
                  '';

                if (content) {
                  fullText += content;

                  const parsedResult = parsePaperTranslationResponse(fullText);
                  setPaperTranslations((prev) => ({
                    ...prev,
                    [paperId]: {
                      ...parsedResult,
                      status: 'translating',
                      error: '',
                    },
                  }));
                }
              } catch (parseError) {
                logger.warn('Parse error:', parseError);
              }
            }
          }
        }

        const finalResult = parsePaperTranslationResponse(fullText);
        setPaperTranslations((prev) => ({
          ...prev,
          [paperId]: {
            ...finalResult,
            status: 'completed',
            error: '',
          },
        }));

        trackAbstractTranslate(paperId);
      } catch (error: unknown) {
        const e = error as Error;
        if (e.name === 'AbortError') {
          return;
        }

        console.error('Paper translation error:', error);
        setPaperTranslations((prev) => ({
          ...prev,
          [paperId]: {
            title_zh: '',
            abstract_zh: '',
            tldr_zh: '',
            status: 'error',
            error: e.message || '翻译失败',
          },
        }));
        setPaperDisplayModes((prev) => ({ ...prev, [paperId]: 'original' }));
      } finally {
        delete abortControllersRef.current[abortKey];
      }
    },
    [paperTranslations, parsePaperTranslationResponse],
  );

  const cancelPaperTranslation = useCallback((paperId: string): void => {
    const abortKey = `paper_${paperId}`;
    if (abortControllersRef.current[abortKey]) {
      abortControllersRef.current[abortKey].abort();
      delete abortControllersRef.current[abortKey];
    }
    setPaperTranslations((prev) => ({
      ...prev,
      [paperId]: { title_zh: '', abstract_zh: '', tldr_zh: '', status: 'idle', error: '' },
    }));
    setPaperDisplayModes((prev) => ({ ...prev, [paperId]: 'original' }));
  }, []);

  return useMemo(
    () => ({
      translations,
      displayModes,
      getTranslationState,
      getDisplayMode,
      toggleDisplayMode,
      translate,
      cancelTranslation,
      resetTranslation,
      shouldShowTranslateButton,
      containsChinese,
      isPrimarilyChinese,
      paperTranslations,
      paperDisplayModes,
      getPaperTranslationState,
      getPaperDisplayMode,
      togglePaperDisplayMode,
      shouldDisablePaperTranslate,
      translatePaper,
      cancelPaperTranslation,
    }),
    [
      translations,
      displayModes,
      getTranslationState,
      getDisplayMode,
      toggleDisplayMode,
      translate,
      cancelTranslation,
      resetTranslation,
      shouldShowTranslateButton,
      paperTranslations,
      paperDisplayModes,
      getPaperTranslationState,
      getPaperDisplayMode,
      togglePaperDisplayMode,
      shouldDisablePaperTranslate,
      translatePaper,
      cancelPaperTranslation,
    ],
  );
};

export default useTranslation;
