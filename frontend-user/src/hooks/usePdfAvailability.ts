/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * PDF 获取 Hook
 */

import { useState, useCallback } from 'react';

export const SCIHUB_BASE_URL = 'https://sci-hub.box';

export const getSciHubUrl = (doi?: string | null): string => {
  if (!doi) return '';
  return `${SCIHUB_BASE_URL}/${doi}`;
};

interface PdfRequestEntry {
  doi: string;
  shouldOpenPdf: boolean;
}

type PdfRequestsState = Record<string, PdfRequestEntry>;

export interface UsePdfAvailabilityResult {
  pdfRequests: PdfRequestsState;
  markPdfRequest: (paperId: string, doi: string) => void;
  shouldOpenPdfTab: (paperId: string) => boolean;
  getPdfDoi: (paperId: string) => string | null;
  clearPdfRequest: (paperId: string) => void;
}

export const usePdfAvailability = (): UsePdfAvailabilityResult => {
  const [pdfRequests, setPdfRequests] = useState<PdfRequestsState>({});

  const markPdfRequest = useCallback((paperId: string, doi: string) => {
    if (!doi) return;
    setPdfRequests(prev => ({
      ...prev,
      [paperId]: { doi, shouldOpenPdf: true },
    }));
  }, []);

  const shouldOpenPdfTab = useCallback(
    (paperId: string): boolean => {
      const request = pdfRequests[paperId];
      return request?.shouldOpenPdf === true;
    },
    [pdfRequests]
  );

  const getPdfDoi = useCallback(
    (paperId: string): string | null => {
      return pdfRequests[paperId]?.doi || null;
    },
    [pdfRequests]
  );

  const clearPdfRequest = useCallback((paperId: string) => {
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
