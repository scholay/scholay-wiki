/**
 * useTranslation Hook
 * 管理文本翻译状态，支持SSE流式翻译
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import { publicScholarAPI } from '../services/api';
import { trackAbstractTranslate } from '../utils/usageTracker';

/**
 * 检测文本是否包含中文字符
 * @param {string} text - 要检测的文本
 * @returns {boolean} - 是否包含中文
 */
export const containsChinese = (text) => {
  if (!text) return false;
  // 匹配中文字符范围
  const chineseRegex = /[\u4e00-\u9fa5]/;
  return chineseRegex.test(text);
};

/**
 * 检测文本是否主要由中文组成（中文字符占比超过30%）
 * @param {string} text - 要检测的文本
 * @returns {boolean} - 是否主要为中文
 */
export const isPrimarilyChinese = (text) => {
  if (!text) return false;
  const chineseRegex = /[\u4e00-\u9fa5]/g;
  const matches = text.match(chineseRegex);
  const chineseCount = matches ? matches.length : 0;
  // 去除空格和标点后的字符总数
  const totalChars = text.replace(/[\s\p{P}]/gu, '').length;
  if (totalChars === 0) return false;
  return chineseCount / totalChars > 0.3;
};

/**
 * useTranslation Hook
 * 管理翻译状态，支持流式翻译和缓存
 */
export const useTranslation = () => {
  // 翻译状态: { [key]: { status: 'idle' | 'translating' | 'completed' | 'error', text: string, error: string } }
  const [translations, setTranslations] = useState({});
  // 显示模式: { [key]: 'original' | 'translated' }
  const [displayModes, setDisplayModes] = useState({});
  // 用于取消正在进行的翻译请求
  const abortControllersRef = useRef({});

  /**
   * 获取翻译状态
   * @param {string} key - 唯一标识符（如 paperId_tldr 或 paperId_abstract）
   */
  const getTranslationState = useCallback((key) => {
    return translations[key] || { status: 'idle', text: '', error: '' };
  }, [translations]);

  /**
   * 获取显示模式
   * @param {string} key - 唯一标识符
   */
  const getDisplayMode = useCallback((key) => {
    return displayModes[key] || 'original';
  }, [displayModes]);

  /**
   * 切换显示模式（原文/译文）
   * @param {string} key - 唯一标识符
   */
  const toggleDisplayMode = useCallback((key) => {
    setDisplayModes(prev => ({
      ...prev,
      [key]: prev[key] === 'translated' ? 'original' : 'translated'
    }));
  }, []);

  /**
   * 执行流式翻译
   * @param {string} key - 唯一标识符
   * @param {string} text - 要翻译的文本
   */
  const translate = useCallback(async (key, text) => {
    // 如果已经翻译过，直接切换显示模式
    const existing = translations[key];
    if (existing && existing.status === 'completed' && existing.text) {
      setDisplayModes(prev => ({ ...prev, [key]: 'translated' }));
      return;
    }

    // 如果正在翻译中，忽略
    if (existing && existing.status === 'translating') {
      return;
    }

    // 取消之前的请求（如果有）
    if (abortControllersRef.current[key]) {
      abortControllersRef.current[key].abort();
    }

    // 创建新的 AbortController
    const abortController = new AbortController();
    abortControllersRef.current[key] = abortController;

    // 设置翻译中状态
    setTranslations(prev => ({
      ...prev,
      [key]: { status: 'translating', text: '', error: '' }
    }));
    setDisplayModes(prev => ({ ...prev, [key]: 'translated' }));

    try {
      const response = await publicScholarAPI.translateStream(text);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let translatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        // 检查是否已取消
        if (abortController.signal.aborted) {
          reader.cancel();
          return;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            // 检查结束标记
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              // 检查错误
              if (parsed.error) {
                throw new Error(parsed.error);
              }

              // 提取内容（兼容不同的响应格式）
              const content = parsed.choices?.[0]?.delta?.content || 
                             parsed.choices?.[0]?.message?.content ||
                             parsed.content || '';
              
              if (content) {
                translatedText += content;
                
                // 更新翻译文本（流式显示）
                setTranslations(prev => ({
                  ...prev,
                  [key]: { status: 'translating', text: translatedText, error: '' }
                }));
              }
            } catch (parseError) {
              // JSON解析错误可能是因为收到了非JSON数据，忽略
              console.warn('Parse error:', parseError);
            }
          }
        }
      }

      // 翻译完成
      setTranslations(prev => ({
        ...prev,
        [key]: { status: 'completed', text: translatedText, error: '' }
      }));
      
      // 记录摘要翻译使用统计（从 key 中提取 paperId，格式如 paperId_abstract 或 paperId_tldr）
      const paperId = key.split('_')[0];
      if (paperId) {
        trackAbstractTranslate(paperId);
      }

    } catch (error) {
      // 如果是取消请求，不设置错误状态
      if (error.name === 'AbortError') {
        return;
      }

      console.error('Translation error:', error);
      setTranslations(prev => ({
        ...prev,
        [key]: { status: 'error', text: '', error: error.message || '翻译失败' }
      }));
      // 错误时切回原文显示
      setDisplayModes(prev => ({ ...prev, [key]: 'original' }));
    } finally {
      // 清理 AbortController
      delete abortControllersRef.current[key];
    }
  }, [translations]);

  /**
   * 取消翻译
   * @param {string} key - 唯一标识符
   */
  const cancelTranslation = useCallback((key) => {
    if (abortControllersRef.current[key]) {
      abortControllersRef.current[key].abort();
      delete abortControllersRef.current[key];
    }
    setTranslations(prev => ({
      ...prev,
      [key]: { status: 'idle', text: '', error: '' }
    }));
    setDisplayModes(prev => ({ ...prev, [key]: 'original' }));
  }, []);

  /**
   * 重置翻译状态
   * @param {string} key - 唯一标识符
   */
  const resetTranslation = useCallback((key) => {
    setTranslations(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
    setDisplayModes(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
  }, []);

  /**
   * 判断是否需要显示翻译按钮
   * @param {string} text - 文本内容
   * @returns {boolean}
   */
  const shouldShowTranslateButton = useCallback((text) => {
    if (!text) return false;
    // 如果文本主要是中文，不显示翻译按钮
    return !isPrimarilyChinese(text);
  }, []);

  // 使用 useMemo 稳定返回值，避免不必要的重渲染
  return useMemo(() => ({
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
  }), [
    translations,
    displayModes,
    getTranslationState,
    getDisplayMode,
    toggleDisplayMode,
    translate,
    cancelTranslation,
    resetTranslation,
    shouldShowTranslateButton,
  ]);
};

export default useTranslation;
