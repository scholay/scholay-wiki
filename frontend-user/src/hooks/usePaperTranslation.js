/**
 * usePaperTranslation Hook
 * 管理论文文本翻译状态，支持SSE流式翻译
 * (重命名自 useTranslation，避免与 i18n 库混淆)
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
 * usePaperTranslation Hook
 * 管理翻译状态，支持流式翻译和缓存
 */
export const usePaperTranslation = () => {
  // 翻译状态: { [key]: { status: 'idle' | 'translating' | 'completed' | 'error', text: string, error: string } }
  const [translations, setTranslations] = useState({});
  // 显示模式: { [key]: 'original' | 'translated' }
  const [displayModes, setDisplayModes] = useState({});
  // 用于取消正在进行的翻译请求
  const abortControllersRef = useRef({});

  // 论文整体翻译状态: { [paperId]: { title_zh, abstract_zh, tldr_zh, status, error } }
  const [paperTranslations, setPaperTranslations] = useState({});
  // 论文显示模式: { [paperId]: 'original' | 'translated' }
  const [paperDisplayModes, setPaperDisplayModes] = useState({});

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
                
                const currentText = translatedText;
                setTranslations(prev => ({
                  ...prev,
                  [key]: { status: 'translating', text: currentText, error: '' }
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

  // ========== 论文整体翻译相关函数 ==========

  /**
   * 获取论文翻译状态
   * @param {string} paperId - 论文ID
   */
  const getPaperTranslationState = useCallback((paperId) => {
    return paperTranslations[paperId] || { 
      title_zh: '', 
      abstract_zh: '', 
      tldr_zh: '', 
      status: 'idle', 
      error: '' 
    };
  }, [paperTranslations]);

  /**
   * 获取论文显示模式
   * @param {string} paperId - 论文ID
   */
  const getPaperDisplayMode = useCallback((paperId) => {
    return paperDisplayModes[paperId] || 'original';
  }, [paperDisplayModes]);

  /**
   * 切换论文显示模式（原文/译文）
   * @param {string} paperId - 论文ID
   */
  const togglePaperDisplayMode = useCallback((paperId) => {
    setPaperDisplayModes(prev => ({
      ...prev,
      [paperId]: prev[paperId] === 'translated' ? 'original' : 'translated'
    }));
  }, []);

  /**
   * 判断论文翻译按钮是否应该置灰（全为中文时置灰）
   * @param {string} title - 标题
   * @param {string} abstract - 摘要
   * @param {string} tldr - TLDR
   * @returns {boolean} - 是否应该置灰
   */
  const shouldDisablePaperTranslate = useCallback((title, abstract, tldr) => {
    // 如果三个字段都为空或都主要是中文，则置灰
    const titleIsChinese = !title || isPrimarilyChinese(title);
    const abstractIsChinese = !abstract || isPrimarilyChinese(abstract);
    const tldrIsChinese = !tldr || isPrimarilyChinese(tldr);
    return titleIsChinese && abstractIsChinese && tldrIsChinese;
  }, []);

  /**
   * 解析论文翻译响应中的XML标签
   * @param {string} text - 响应文本
   * @returns {object} - { title_zh, abstract_zh, tldr_zh }
   */
  const parsePaperTranslationResponse = useCallback((text) => {
    const result = { title_zh: '', abstract_zh: '', tldr_zh: '' };
    
    // 提取 <title_zh>...</title_zh>
    const titleMatch = text.match(/<title_zh>([\s\S]*?)<\/title_zh>/);
    if (titleMatch) {
      result.title_zh = titleMatch[1].trim();
    }
    
    // 提取 <abstract_zh>...</abstract_zh>
    const abstractMatch = text.match(/<abstract_zh>([\s\S]*?)<\/abstract_zh>/);
    if (abstractMatch) {
      result.abstract_zh = abstractMatch[1].trim();
    }
    
    // 提取 <tldr_zh>...</tldr_zh>
    const tldrMatch = text.match(/<tldr_zh>([\s\S]*?)<\/tldr_zh>/);
    if (tldrMatch) {
      result.tldr_zh = tldrMatch[1].trim();
    }
    
    return result;
  }, []);

  /**
   * 执行论文整体翻译（标题+摘要+TLDR）
   * @param {string} paperId - 论文ID
   * @param {string} title - 标题
   * @param {string} abstract - 摘要
   * @param {string} tldr - TLDR
   */
  const translatePaper = useCallback(async (paperId, title, abstract, tldr) => {
    // 如果已经翻译过，直接切换显示模式
    const existing = paperTranslations[paperId];
    if (existing && existing.status === 'completed') {
      setPaperDisplayModes(prev => ({ ...prev, [paperId]: 'translated' }));
      return;
    }

    // 如果正在翻译中，忽略
    if (existing && existing.status === 'translating') {
      return;
    }

    // 取消之前的请求（如果有）
    const abortKey = `paper_${paperId}`;
    if (abortControllersRef.current[abortKey]) {
      abortControllersRef.current[abortKey].abort();
    }

    // 创建新的 AbortController
    const abortController = new AbortController();
    abortControllersRef.current[abortKey] = abortController;

    // 设置翻译中状态
    setPaperTranslations(prev => ({
      ...prev,
      [paperId]: { title_zh: '', abstract_zh: '', tldr_zh: '', status: 'translating', error: '' }
    }));
    setPaperDisplayModes(prev => ({ ...prev, [paperId]: 'translated' }));

    try {
      const response = await publicScholarAPI.translatePaperStream(title || '', abstract || '', tldr || '');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

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

              // 提取内容
              const content = parsed.choices?.[0]?.delta?.content || 
                             parsed.choices?.[0]?.message?.content ||
                             parsed.content || '';
              
              if (content) {
                fullText += content;
                
                // 实时解析并更新翻译文本
                const parsedResult = parsePaperTranslationResponse(fullText);
                setPaperTranslations(prev => ({
                  ...prev,
                  [paperId]: { 
                    ...parsedResult,
                    status: 'translating', 
                    error: '' 
                  }
                }));
              }
            } catch (parseError) {
              // JSON解析错误可能是因为收到了非JSON数据，忽略
              console.warn('Parse error:', parseError);
            }
          }
        }
      }

      // 翻译完成，最终解析一次
      const finalResult = parsePaperTranslationResponse(fullText);
      setPaperTranslations(prev => ({
        ...prev,
        [paperId]: { 
          ...finalResult,
          status: 'completed', 
          error: '' 
        }
      }));
      
      // 记录使用统计
      trackAbstractTranslate(paperId);

    } catch (error) {
      // 如果是取消请求，不设置错误状态
      if (error.name === 'AbortError') {
        return;
      }

      console.error('Paper translation error:', error);
      setPaperTranslations(prev => ({
        ...prev,
        [paperId]: { 
          title_zh: '', 
          abstract_zh: '', 
          tldr_zh: '', 
          status: 'error', 
          error: error.message || '翻译失败' 
        }
      }));
      // 错误时切回原文显示
      setPaperDisplayModes(prev => ({ ...prev, [paperId]: 'original' }));
    } finally {
      // 清理 AbortController
      delete abortControllersRef.current[abortKey];
    }
  }, [paperTranslations, parsePaperTranslationResponse]);

  /**
   * 取消论文翻译
   * @param {string} paperId - 论文ID
   */
  const cancelPaperTranslation = useCallback((paperId) => {
    const abortKey = `paper_${paperId}`;
    if (abortControllersRef.current[abortKey]) {
      abortControllersRef.current[abortKey].abort();
      delete abortControllersRef.current[abortKey];
    }
    setPaperTranslations(prev => ({
      ...prev,
      [paperId]: { title_zh: '', abstract_zh: '', tldr_zh: '', status: 'idle', error: '' }
    }));
    setPaperDisplayModes(prev => ({ ...prev, [paperId]: 'original' }));
  }, []);

  // 使用 useMemo 稳定返回值，避免不必要的重渲染
  return useMemo(() => ({
    // 原有的单字段翻译功能
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
    // 论文整体翻译功能
    paperTranslations,
    paperDisplayModes,
    getPaperTranslationState,
    getPaperDisplayMode,
    togglePaperDisplayMode,
    shouldDisablePaperTranslate,
    translatePaper,
    cancelPaperTranslation,
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
    paperTranslations,
    paperDisplayModes,
    getPaperTranslationState,
    getPaperDisplayMode,
    togglePaperDisplayMode,
    shouldDisablePaperTranslate,
    translatePaper,
    cancelPaperTranslation,
  ]);
};

export default usePaperTranslation;
