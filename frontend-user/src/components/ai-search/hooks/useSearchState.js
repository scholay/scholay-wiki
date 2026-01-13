/**
 * 搜索相关状态管理 Hook
 * 从 useAISearch.js 拆分
 */
import { useState, useRef } from 'react';

export const useSearchState = () => {
  // 搜索输入
  const [searchQuery, setSearchQuery] = useState('');

  // 加载状态
  const [loading, setLoading] = useState(false);

  // 流式响应状态
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showAIThinking, setShowAIThinking] = useState(false);

  // 模型级别
  const [modelLevel, setModelLevel] = useState('low');

  // Refs
  const eventSourceRef = useRef(null);
  const streamingContentRef = useRef('');
  const textareaRef = useRef(null);

  return {
    // 状态
    searchQuery,
    loading,
    isStreaming,
    streamingContent,
    showAIThinking,
    modelLevel,

    // Setter
    setSearchQuery,
    setLoading,
    setIsStreaming,
    setStreamingContent,
    setShowAIThinking,
    setModelLevel,

    // Refs
    eventSourceRef,
    streamingContentRef,
    textareaRef,
  };
};

export default useSearchState;
