/**
 * AI论文分析 Hook
 * 处理论文的维度分析逻辑
 */
import { useCallback, useEffect } from 'react';
import { analysisDimensionAPI } from '../../../services/payment.api';
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
  totalDeducted,
  analysisAbortedRef,
  isAuthenticated,
  setAnalysisResults,
  setAnalyzingPapers,
  setTotalDeducted,
}) => {
  // 为单个论文分析所有维度
  const analyzePaper = useCallback(async (paper) => {
    const abstractText = paper.abstract || paper.tldr?.text;
    if (!abstractText) return { success: false, aborted: false, deducted: 0 };

    if (!isAuthenticated) {
      logger.warn('User not authenticated, skipping paper analysis');
      return { success: false, aborted: false, deducted: 0 };
    }

    if (analysisAbortedRef.current) return { success: false, aborted: true, deducted: 0 };

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

        // 记录智能矩阵分析使用统计
        trackMatrixAnalysis(paper.paperId);

        return { success: true, aborted: false, deducted: 0 };
      } else {
        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: { _error: true, _message: response.data.message || '分析失败' }
        }));
        return { success: false, aborted: false, deducted: 0 };
      }
    } catch (error) {
      logger.error('Failed to analyze paper:', paper.paperId, error);

      setAnalysisResults(prev => ({
        ...prev,
        [paper.paperId]: { _error: true, _message: error.response?.data?.message || '分析失败' }
      }));
      return { success: false, aborted: false, deducted: 0 };
    } finally {
      setAnalyzingPapers(prev => ({
        ...prev,
        [paper.paperId]: false
      }));
    }
  }, [
    isAuthenticated,
    totalDeducted,
    analysisAbortedRef,
    setAnalysisResults,
    setAnalyzingPapers,
    setTotalDeducted,
  ]);

  // 并发控制分析
  const analyzeWithConcurrency = useCallback(async (papersToAnalyze, maxConcurrent = 5) => {
    analysisAbortedRef.current = false;
    setTotalDeducted(0);

    const queue = [...papersToAnalyze];
    const inProgress = new Set();
    let aborted = false;
    let totalDeductedInBatch = 0;

    const processNext = async () => {
      if (queue.length === 0 || analysisAbortedRef.current) return;

      const paper = queue.shift();
      inProgress.add(paper.paperId);

      try {
        const result = await analyzePaper(paper);
        if (result.aborted) {
          aborted = true;
          return;
        }
        totalDeductedInBatch += result.deducted || 0;
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

    setTotalDeducted(0);
  }, [analyzePaper, analysisAbortedRef, setTotalDeducted]);

  // 当选中维度变化时，为当前论文执行分析
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
