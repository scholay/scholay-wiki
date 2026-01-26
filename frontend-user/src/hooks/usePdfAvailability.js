/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * PDF 获取 Hook
 * 用于标记用户点击了"获取PDF"按钮，以便打开推屏时直接显示 PDF tab
 */

import { useState, useCallback } from 'react';

// Sci-Hub 地址前缀
export const SCIHUB_BASE_URL = 'https://sci-hub.box';

/**
 * 生成 Sci-Hub URL
 * @param {string} doi - 论文 DOI
 * @returns {string} Sci-Hub URL
 */
export const getSciHubUrl = (doi) => {
  if (!doi) return '';
  return `${SCIHUB_BASE_URL}/${doi}`;
};

/**
 * PDF 获取 Hook
 * @returns {Object} PDF 获取状态和方法
 */
export const usePdfAvailability = () => {
  // 存储用户已点击"获取PDF"的论文 ID
  // key: paperId, value: { doi: string, shouldOpenPdf: boolean }
  const [pdfRequests, setPdfRequests] = useState({});

  /**
   * 标记用户要获取 PDF（点击按钮时调用）
   * @param {string} paperId - 论文 ID
   * @param {string} doi - 论文 DOI
   */
  const markPdfRequest = useCallback((paperId, doi) => {
    if (!doi) return;
    setPdfRequests(prev => ({
      ...prev,
      [paperId]: { doi, shouldOpenPdf: true }
    }));
  }, []);

  /**
   * 检查论文是否需要打开 PDF tab
   * @param {string} paperId - 论文 ID
   * @returns {boolean} 是否需要打开 PDF tab
   */
  const shouldOpenPdfTab = useCallback((paperId) => {
    const request = pdfRequests[paperId];
    return request?.shouldOpenPdf === true;
  }, [pdfRequests]);

  /**
   * 获取论文的 DOI（用于 PDF 加载）
   * @param {string} paperId - 论文 ID
   * @returns {string|null} DOI
   */
  const getPdfDoi = useCallback((paperId) => {
    return pdfRequests[paperId]?.doi || null;
  }, [pdfRequests]);

  /**
   * 清除论文的 PDF 请求标记（推屏打开后调用）
   * @param {string} paperId - 论文 ID
   */
  const clearPdfRequest = useCallback((paperId) => {
    setPdfRequests(prev => {
      const newState = { ...prev };
      if (newState[paperId]) {
        newState[paperId] = { ...newState[paperId], shouldOpenPdf: false };
      }
      return newState;
    });
  }, []);

  return {
    pdfRequests,
    markPdfRequest,
    shouldOpenPdfTab,
    getPdfDoi,
    clearPdfRequest,
  };
};

export default usePdfAvailability;
