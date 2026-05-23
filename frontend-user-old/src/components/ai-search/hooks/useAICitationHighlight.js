/**
 * AI引文高亮 Hook
 * 处理论文引用的高亮逻辑
 */
import { useCallback, useEffect } from 'react';

/**
 * 引文高亮 Hook
 */
export const useAICitationHighlight = ({
  messages,
  paperSets,
  activeTab,
  highlightedPaperIndex,
  setHighlightedPaperIndex,
  setActiveTab,
  setManualTabSwitch,
  setScrollToPaperIndex,
}) => {
  // 处理引文hover
  const handleCitationHover = useCallback((paperIndex, messageId) => {
    if (paperSets && paperSets.length > 0) {
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      const assistantIndex = assistantMessages.findIndex(m => m.id === messageId);

      if (assistantIndex !== -1) {
        const tabIndex = paperSets.length - 1 - assistantIndex;

        if (tabIndex === activeTab) {
          setHighlightedPaperIndex(paperIndex);
        } else {
          setHighlightedPaperIndex(null);
        }
        return;
      }
    }

    setHighlightedPaperIndex(paperIndex);
  }, [messages, paperSets, activeTab, setHighlightedPaperIndex]);

  // 处理引文离开
  const handleCitationLeave = useCallback(() => {
    requestAnimationFrame(() => {
      const citationElements = document.querySelectorAll('.paper-citation-text');
      let isHoveringAnyCitation = false;

      citationElements.forEach(element => {
        if (element.matches(':hover')) {
          isHoveringAnyCitation = true;
        }
      });

      if (!isHoveringAnyCitation) {
        setHighlightedPaperIndex(null);
      }
    });
  }, [setHighlightedPaperIndex]);

  // 处理引文点击
  const handleCitationClick = useCallback((paperIndex, qaIndex) => {
    const tabIndex = paperSets.length - 1 - qaIndex;
    if (tabIndex >= 0 && tabIndex < paperSets.length) {
      setActiveTab(tabIndex);
      setManualTabSwitch(true);
    }
    setScrollToPaperIndex(paperIndex);
  }, [paperSets, setActiveTab, setManualTabSwitch, setScrollToPaperIndex]);

  // 清理全局鼠标移动监听
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      const target = e.target;
      const isCitation = target.closest('.paper-citation-text');

      if (!isCitation && highlightedPaperIndex !== null) {
        setHighlightedPaperIndex(null);
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [highlightedPaperIndex, setHighlightedPaperIndex]);

  return {
    handleCitationHover,
    handleCitationLeave,
    handleCitationClick,
  };
};

export default useAICitationHighlight;
