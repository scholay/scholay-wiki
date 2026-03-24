/**
 * AI论文分析 Hook
 * 处理论文的维度分析逻辑
 */
import { useCallback, useEffect } from 'react';
import { analysisDimensionAPI } from '../../../services/api';
import { trackMatrixAnalysis } from '../../../utils/usageTracker';
import logger from '../../../utils/logger';

/**
 * 论文分析 Hook
 */
export const useAIPaperAnalysis = ({
  papers,
  selectedDimensions,
  analysisResults,
  analyzingPapers,
  analysisAbortedRef,
  isAuthenticated,
  setAnalysisResults,
  setAnalyzingPapers,
}) => {
  const analyzePaper = useCallback(async (paper) => {
    const abstractText = paper.abstract || paper.tldr?.text;
    if (!abstractText) return { success: false, aborted: false };

    if (!isAuthenticated) {
      logger.warn('User not authenticated, skipping paper analysis');
      return { success: false, aborted: false };
    }

    if (analysisAbortedRef.current) return { success: false, aborted: true };

    setAnalyzingPapers(prev => ({
      ...prev,
      [paper.paperId]: true
    }));

    try {
      const response = await analysisDimensionAPI.analyzePaper(paper.paperId, paper.title, abstractText);

      if (response.data.code === 0 && response.data.data) {
        const responseData = response.data.data;
        const dimensionData = responseData.data || responseData;

        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: dimensionData
        }));

        trackMatrixAnalysis(paper.paperId);

        return { success: true, aborted: false };
      } else {
        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: { _error: true, _message: response.data.message || '分析失败' }
        }));
        return { success: false, aborted: false };
      }
    } catch (error) {
      logger.error('Failed to analyze paper:', paper.paperId, error);

      setAnalysisResults(prev => ({
        ...prev,
        [paper.paperId]: { _error: true, _message: error.response?.data?.message || '分析失败' }
      }));
      return { success: false, aborted: false };
    } finally {
      setAnalyzingPapers(prev => ({
        ...prev,
        [paper.paperId]: false
      }));
    }
  }, [
    isAuthenticated,
    analysisAbortedRef,
    setAnalysisResults,
    setAnalyzingPapers,
  ]);

  const analyzeWithConcurrency = useCallback(async (papersToAnalyze, maxConcurrent = 5) => {
    analysisAbortedRef.current = false;

    const queue = [...papersToAnalyze];
    const inProgress = new Set();

    const processNext = async () => {
      if (queue.length === 0 || analysisAbortedRef.current) return;

      const paper = queue.shift();
      inProgress.add(paper.paperId);

      try {
        const result = await analyzePaper(paper);
        if (result.aborted) {
          return;
        }
      } finally {
        inProgress.delete(paper.paperId);
        if (queue.length > 0 && !analysisAbortedRef.current) {
          await processNext();
        }
      }
    };

    const initialBatch = [];
    for (let i = 0; i < Math.min(maxConcurrent, queue.length); i++) {
      initialBatch.push(processNext());
    }

    await Promise.all(initialBatch);
  }, [analyzePaper, analysisAbortedRef]);

  useEffect(() => {
    if (selectedDimensions.length === 0) return;

    const papersToAnalyze = papers.filter(paper =>
      (paper.abstract || paper.tldr?.text) &&
      !analysisResults[paper.paperId] &&
      !analyzingPapers[paper.paperId]
    );

    if (papersToAnalyze.length > 0) {
      analyzeWithConcurrency(papersToAnalyze);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDimensions.length, papers]);

  return {
    analyzePaper,
    analyzeWithConcurrency,
  };
};

export default useAIPaperAnalysis;
