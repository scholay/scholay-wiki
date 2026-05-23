/**
 * UI 状态管理 Hook
 * 从 useAISearch.js 拆分
 */
import { useState, useRef } from 'react';

export const useUIState = () => {
  // QA 展开索引
  const [expandedQAIndex, setExpandedQAIndex] = useState(0);

  // Tab 切换
  const [manualTabSwitch, setManualTabSwitch] = useState(false);

  // 滚动控制
  const [autoScroll, setAutoScroll] = useState(true);
  const [disableSnapTemporarily, setDisableSnapTemporarily] = useState(false);

  // 加载状态
  const [isLoadingSuggestedQuestions, setIsLoadingSuggestedQuestions] = useState(false);

  // 输入法状态
  const [isComposing, setIsComposing] = useState(false);

  // 来源标记（从学术搜索跳转）
  const [fromAcademicSearch] = useState(() => {
    const stored = sessionStorage.getItem('ai_search_from_academic');
    sessionStorage.removeItem('ai_search_from_academic');
    return stored === 'true';
  });

  // Refs
  const qaSnapContainerRef = useRef(null);
  const lastScrollTimeRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
  const isLoadingHistoryRef = useRef(false);
  const prevIsLoadingSuggestedRef = useRef(false);
  const hasLoadedConversationsRef = useRef(false);
  const hasInitializedFromURLRef = useRef(false);
  const prevMessageCountRef = useRef(0);

  return {
    // 状态
    expandedQAIndex,
    manualTabSwitch,
    autoScroll,
    disableSnapTemporarily,
    isLoadingSuggestedQuestions,
    isComposing,
    fromAcademicSearch,

    // Setter
    setExpandedQAIndex,
    setManualTabSwitch,
    setAutoScroll,
    setDisableSnapTemporarily,
    setIsLoadingSuggestedQuestions,
    setIsComposing,

    // Refs
    qaSnapContainerRef,
    lastScrollTimeRef,
    prevScrollHeightRef,
    isLoadingHistoryRef,
    prevIsLoadingSuggestedRef,
    hasLoadedConversationsRef,
    hasInitializedFromURLRef,
    prevMessageCountRef,
  };
};

export default useUIState;
