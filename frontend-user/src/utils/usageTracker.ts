/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

/**
 * 功能代码常量 - 17个功能追踪点
 */
export const FeatureCode = {
  DIRECT_SEARCH: 'direct_search',
  SMART_SEARCH: 'smart_search',
  SEARCH_SUGGESTION: 'search_suggestion',
  ABSTRACT_TRANSLATE: 'abstract_translate',
  MATRIX_ANALYSIS: 'matrix_analysis',
  MATRIX_ADD_DIMENSION: 'matrix_add_dimension',
  PDF_PREVIEW: 'pdf_preview',
  PDF_SELECTION_TRANSLATE: 'pdf_selection_translate',
  AI_ASSISTANT_CHAT: 'ai_assistant_chat',
  AI_PEER_REVIEW: 'ai_peer_review',
  SCHOLAY_PRISM: 'scholay_prism',
  LANDING_PAGE_VIEW: 'landing_page_view',
  LANDING_PAGE_SEARCH: 'landing_page_search',
  LANDING_PAGE_SIMILAR: 'landing_page_similar',
  LANDING_PAGE_TRANSLATE: 'landing_page_translate',
  DETAIL_PAGE_VIEW: 'detail_page_view',
  DETAIL_PAGE_SIMILAR: 'detail_page_similar',
} as const;

export type FeatureCodeValue = typeof FeatureCode[keyof typeof FeatureCode];

const FeatureNames: Record<string, string> = {
  [FeatureCode.DIRECT_SEARCH]: '直接检索',
  [FeatureCode.SMART_SEARCH]: '智能检索',
  [FeatureCode.SEARCH_SUGGESTION]: '检索联想',
  [FeatureCode.ABSTRACT_TRANSLATE]: '摘要翻译',
  [FeatureCode.MATRIX_ANALYSIS]: '智能矩阵分析',
  [FeatureCode.MATRIX_ADD_DIMENSION]: '智能矩阵新增维度',
  [FeatureCode.PDF_PREVIEW]: 'PDF预览',
  [FeatureCode.PDF_SELECTION_TRANSLATE]: 'PDF划词翻译',
  [FeatureCode.AI_ASSISTANT_CHAT]: '智能助手对话',
  [FeatureCode.AI_PEER_REVIEW]: '智能审稿',
  [FeatureCode.SCHOLAY_PRISM]: 'ScholayPrism对话',
  [FeatureCode.LANDING_PAGE_VIEW]: '落地页详情',
  [FeatureCode.LANDING_PAGE_SEARCH]: '落地页搜索',
  [FeatureCode.LANDING_PAGE_SIMILAR]: '落地页相似论文',
  [FeatureCode.LANDING_PAGE_TRANSLATE]: '落地页翻译',
  [FeatureCode.DETAIL_PAGE_VIEW]: '论文详情页',
  [FeatureCode.DETAIL_PAGE_SIMILAR]: '详情页相似论文',
};

export const Action = {
  VIEW: 'view',
  SEARCH: 'search',
  CLICK: 'click',
  SUBMIT: 'submit',
  TRANSLATE: 'translate',
  ANALYZE: 'analyze',
  CHAT: 'chat',
} as const;

export type ActionValue = typeof Action[keyof typeof Action];

export const EntryPoint = {
  HOME_PAGE: 'home_page',
  SEARCH_RESULTS_PAGE: 'search_results_page',
  LANDING_PAGE: 'landing_page',
  DETAIL_PAGE: 'detail_page',
  CHAT_PAGE: 'chat_page',
  ASSISTANT_PAGE: 'assistant_page',
  PEER_REVIEW_PAGE: 'peer_review_page',
  LATEX_WRITER_PAGE: 'latex_writer_page',
  SEARCH_BOX: 'search_box',
  SIMILAR_SECTION: 'similar_section',
} as const;

export type EntryPointValue = typeof EntryPoint[keyof typeof EntryPoint];

// `extra_data` is intentionally a permissive map: callers send heterogeneous
// per-feature payloads (paper IDs, queries, dimensions, etc.) — typing each
// shape would explode without value.
export type ExtraData = Record<string, unknown> | null;

interface PaperLikeAuthor {
  name?: string;
}
// `paperData` shapes vary across pages; we use a loose interface to extract
// only the fields we care about.
interface PaperLikeData {
  doi?: string;
  title?: string;
  abstract?: string;
  authors?: Array<PaperLikeAuthor | string> | string;
  year?: number | string;
  venue?: string;
}

const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('usage_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('usage_session_id', sessionId);
  }
  return sessionId;
};

/**
 * 记录功能使用日志（核心方法）
 */
export const trackUsage = async (
  featureCode: string,
  action: string,
  entryPoint: string = '',
  extraData: ExtraData = null,
): Promise<void> => {
  try {
    const payload = {
      feature_code: featureCode,
      feature_name: FeatureNames[featureCode] || featureCode,
      action: action,
      entry_point: entryPoint,
      request_path: window.location.pathname + window.location.search,
      referer_path: document.referrer ? new URL(document.referrer).pathname : '',
      session_id: getSessionId(),
      extra_data: extraData,
    };

    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/v1/public/usage-log', blob);
    } else {
      fetch('/api/v1/public/usage-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  } catch (error) {
    console.debug('[UsageTracker] Failed to track:', error);
  }
};

// =====================
// 便捷追踪方法
// =====================

export const trackDirectSearch = (query: string, entryPoint: string = EntryPoint.SEARCH_BOX): void => {
  trackUsage(FeatureCode.DIRECT_SEARCH, Action.SEARCH, entryPoint, { query });
};

export const trackSmartSearch = (query: string, entryPoint: string = EntryPoint.HOME_PAGE): void => {
  trackUsage(FeatureCode.SMART_SEARCH, Action.SEARCH, entryPoint, { query });
};

export const trackSearchSuggestion = (query: string): void => {
  trackUsage(FeatureCode.SEARCH_SUGGESTION, Action.SEARCH, EntryPoint.SEARCH_BOX, { query });
};

export const trackAbstractTranslate = (paperId: string): void => {
  trackUsage(FeatureCode.ABSTRACT_TRANSLATE, Action.TRANSLATE, '', { paper_id: paperId });
};

export const trackMatrixAnalysis = (paperId: string): void => {
  trackUsage(FeatureCode.MATRIX_ANALYSIS, Action.ANALYZE, EntryPoint.SEARCH_RESULTS_PAGE, { paper_id: paperId });
};

export const trackMatrixAddDimension = (dimensionName: string): void => {
  trackUsage(FeatureCode.MATRIX_ADD_DIMENSION, Action.SUBMIT, EntryPoint.SEARCH_RESULTS_PAGE, { dimension_name: dimensionName });
};

export const trackPDFPreview = (pdfUrl: string, entryPoint: string = ''): void => {
  trackUsage(FeatureCode.PDF_PREVIEW, Action.VIEW, entryPoint, { pdf_url: pdfUrl });
};

export const trackPDFSelectionTranslate = (selectedText: string, isFullscreen: boolean = false): void => {
  trackUsage(
    FeatureCode.PDF_SELECTION_TRANSLATE,
    Action.TRANSLATE,
    isFullscreen ? 'pdf_fullscreen' : 'pdf_preview',
    { text_length: selectedText?.length || 0, text_preview: selectedText?.slice(0, 50) || '' },
  );
};

export const trackAIAssistantChat = (context: string = ''): void => {
  trackUsage(
    FeatureCode.AI_ASSISTANT_CHAT,
    Action.CHAT,
    EntryPoint.ASSISTANT_PAGE,
    context ? { context } : null,
  );
};

export const trackAIPeerReview = (): void => {
  trackUsage(FeatureCode.AI_PEER_REVIEW, Action.SUBMIT, EntryPoint.PEER_REVIEW_PAGE);
};

export const trackScholayPrism = (documentId: string = ''): void => {
  trackUsage(
    FeatureCode.SCHOLAY_PRISM,
    Action.CHAT,
    EntryPoint.LATEX_WRITER_PAGE,
    documentId ? { document_id: documentId } : null,
  );
};

const buildPaperExtraData = (paperId: string, paperData: PaperLikeData | null): Record<string, unknown> => {
  const extraData: Record<string, unknown> = { paper_id: paperId };
  if (paperData) {
    if (paperData.doi) extraData.doi = paperData.doi;
    if (paperData.title) extraData.title = paperData.title;
    if (paperData.abstract) extraData.abstract = paperData.abstract.substring(0, 500);
    if (paperData.authors) {
      const authorsData = Array.isArray(paperData.authors)
        ? paperData.authors.slice(0, 5).map((a) => (typeof a === 'string' ? a : a.name || '')).join(', ')
        : paperData.authors;
      extraData.authors = authorsData;
    }
    if (paperData.year) extraData.year = paperData.year;
    if (paperData.venue) extraData.venue = paperData.venue;
  }
  return extraData;
};

export const trackLandingPageView = (paperId: string, paperData: PaperLikeData | null = null): void => {
  trackUsage(FeatureCode.LANDING_PAGE_VIEW, Action.VIEW, EntryPoint.LANDING_PAGE, buildPaperExtraData(paperId, paperData));
};

export const trackLandingPageSearch = (query: string): void => {
  trackUsage(FeatureCode.LANDING_PAGE_SEARCH, Action.SEARCH, EntryPoint.LANDING_PAGE, { query });
};

export const trackLandingPageSimilar = (paperId: string, sourcePaperId: string): void => {
  trackUsage(
    FeatureCode.LANDING_PAGE_SIMILAR,
    Action.CLICK,
    EntryPoint.SIMILAR_SECTION,
    { paper_id: paperId, source_paper_id: sourcePaperId },
  );
};

export const trackLandingPageTranslate = (paperId: string, translateType: string = 'paper'): void => {
  trackUsage(
    FeatureCode.LANDING_PAGE_TRANSLATE,
    Action.TRANSLATE,
    EntryPoint.LANDING_PAGE,
    { paper_id: paperId, translate_type: translateType },
  );
};

export const trackDetailPageView = (paperId: string, paperData: PaperLikeData | null = null): void => {
  trackUsage(FeatureCode.DETAIL_PAGE_VIEW, Action.VIEW, EntryPoint.DETAIL_PAGE, buildPaperExtraData(paperId, paperData));
};

export const trackDetailPageSimilar = (paperId: string): void => {
  trackUsage(
    FeatureCode.DETAIL_PAGE_SIMILAR,
    Action.CLICK,
    EntryPoint.SIMILAR_SECTION,
    { paper_id: paperId },
  );
};

const usageTracker = {
  FeatureCode,
  Action,
  EntryPoint,
  trackUsage,
  trackDirectSearch,
  trackSmartSearch,
  trackSearchSuggestion,
  trackAbstractTranslate,
  trackMatrixAnalysis,
  trackMatrixAddDimension,
  trackPDFPreview,
  trackPDFSelectionTranslate,
  trackAIAssistantChat,
  trackAIPeerReview,
  trackScholayPrism,
  trackLandingPageView,
  trackLandingPageSearch,
  trackLandingPageSimilar,
  trackLandingPageTranslate,
  trackDetailPageView,
  trackDetailPageSimilar,
};

export default usageTracker;
