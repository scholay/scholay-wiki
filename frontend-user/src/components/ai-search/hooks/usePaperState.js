/**
 * 论文相关状态管理 Hook
 * 从 useAISearch.js 拆分
 */
import { useState, useRef, useCallback } from 'react';

export const usePaperState = () => {
  // 论文列表
  const [papers, setPapers] = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);

  // 论文集合（多批次搜索结果）
  const [paperSets, setPaperSets] = useState([]);
  const [activeTab, setActiveTab] = useState(0);

  // 高亮和滚动
  const [highlightedPaperIndex, setHighlightedPaperIndex] = useState(null);
  const [scrollToPaperIndex, setScrollToPaperIndex] = useState(null);

  // Refs
  const papersContainerRef = useRef(null);

  // 清空论文数据
  const clearPapers = useCallback(() => {
    setPapers([]);
    setPapersTotal(0);
    setPaperSets([]);
    setActiveTab(0);
    setHighlightedPaperIndex(null);
    setScrollToPaperIndex(null);
  }, []);

  return {
    // 状态
    papers,
    papersTotal,
    paperSets,
    activeTab,
    highlightedPaperIndex,
    scrollToPaperIndex,

    // Setter
    setPapers,
    setPapersTotal,
    setPaperSets,
    setActiveTab,
    setHighlightedPaperIndex,
    setScrollToPaperIndex,

    // Refs
    papersContainerRef,

    // 方法
    clearPapers,
  };
};

export default usePaperState;
