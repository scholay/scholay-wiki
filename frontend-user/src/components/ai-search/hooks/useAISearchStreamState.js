/**
 * AI 搜索流式状态管理 Hook
 * 从 useAISearch.js 拆分，管理搜索查询、流式响应、思考步骤等状态
 */
import { useState, useRef, useCallback } from 'react';

export const useAISearchStreamState = () => {
  // 搜索输入
  const [searchQuery, setSearchQuery] = useState('');

  // 加载状态
  const [loading, setLoading] = useState(false);

  // 流式响应状态
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showAIThinking, setShowAIThinking] = useState(false);

  // 思考/处理步骤状态
  const [thinkingSteps, setThinkingSteps] = useState([]);

  // 模型级别
  const [modelLevel, setModelLevel] = useState('low');

  // Refs
  const eventSourceRef = useRef(null);
  const streamingContentRef = useRef('');
  const textareaRef = useRef(null);

  // 添加思考步骤
  const addThinkingStep = useCallback((step, message, detail = '', completed = false) => {
    setThinkingSteps(prev => {
      const existingIndex = prev.findIndex(s => s.step === step);
      if (existingIndex >= 0) {
        const newSteps = [...prev];
        newSteps[existingIndex] = { ...newSteps[existingIndex], message, detail, completed };
        return newSteps;
      }
      return [...prev, { step, message, detail, completed, timestamp: Date.now() }];
    });
  }, []);

  // 清空思考步骤
  const clearThinkingSteps = useCallback(() => {
    setThinkingSteps([]);
  }, []);

  return {
    // 状态
    searchQuery,
    loading,
    isStreaming,
    streamingContent,
    showAIThinking,
    thinkingSteps,
    modelLevel,

    // Setter
    setSearchQuery,
    setLoading,
    setIsStreaming,
    setStreamingContent,
    setShowAIThinking,
    setThinkingSteps,
    setModelLevel,

    // 方法
    addThinkingStep,
    clearThinkingSteps,

    // Refs
    eventSourceRef,
    streamingContentRef,
    textareaRef,
  };
};

export default useAISearchStreamState;
