/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

/**
 * 功能代码常量 - 15个功能追踪点
 * 与数据库 feature_configs 表中的定义保持一致
 */
export const FeatureCode = {
  // 用户类
  USER_CHECKIN: 'user_checkin',                     // 每日签到
  
  // 检索类
  DIRECT_SEARCH: 'direct_search',                   // 直接检索（/papers/search）
  SMART_SEARCH: 'smart_search',                     // 智能检索（AI搜索模式）
  SEARCH_SUGGESTION: 'search_suggestion',           // 检索联想（/search/suggestions）
  
  // 翻译类
  ABSTRACT_TRANSLATE: 'abstract_translate',         // 摘要翻译（/translate/stream）
  
  // 分析类
  MATRIX_ANALYSIS: 'matrix_analysis',               // 智能矩阵分析（/analysis/paper）
  MATRIX_ADD_DIMENSION: 'matrix_add_dimension',     // 智能矩阵新增维度
  
  // 工具类
  PDF_PREVIEW: 'pdf_preview',                       // PDF预览
  PDF_SELECTION_TRANSLATE: 'pdf_selection_translate', // PDF划词翻译
  
  // 对话类
  AI_ASSISTANT_CHAT: 'ai_assistant_chat',           // 智能助手对话（AssistantPage + ChatPage）
  AI_PEER_REVIEW: 'ai_peer_review',                 // 智能审稿（PeerReviewPage）
  
  // 落地页类（/paper/{id}）
  LANDING_PAGE_VIEW: 'landing_page_view',           // 落地页详情
  LANDING_PAGE_SEARCH: 'landing_page_search',       // 落地页搜索
  LANDING_PAGE_SIMILAR: 'landing_page_similar',     // 落地页相似论文
  
  // 详情页类（/search-results?paperId=xxx）
  DETAIL_PAGE_VIEW: 'detail_page_view',             // 论文详情页
  DETAIL_PAGE_SIMILAR: 'detail_page_similar',       // 详情页相似论文
};

// 功能名称映射
const FeatureNames = {
  [FeatureCode.USER_CHECKIN]: '每日签到',
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
  [FeatureCode.LANDING_PAGE_VIEW]: '落地页详情',
  [FeatureCode.LANDING_PAGE_SEARCH]: '落地页搜索',
  [FeatureCode.LANDING_PAGE_SIMILAR]: '落地页相似论文',
  [FeatureCode.DETAIL_PAGE_VIEW]: '论文详情页',
  [FeatureCode.DETAIL_PAGE_SIMILAR]: '详情页相似论文',
};

// 操作类型常量
export const Action = {
  VIEW: 'view',           // 查看
  SEARCH: 'search',       // 搜索
  CLICK: 'click',         // 点击
  SUBMIT: 'submit',       // 提交
  CHECKIN: 'checkin',     // 签到
  TRANSLATE: 'translate', // 翻译
  ANALYZE: 'analyze',     // 分析
  CHAT: 'chat',           // 对话
};

// 入口位置常量
export const EntryPoint = {
  // 页面入口
  HOME_PAGE: 'home_page',
  SEARCH_RESULTS_PAGE: 'search_results_page',
  LANDING_PAGE: 'landing_page',                     // /paper/{id}
  DETAIL_PAGE: 'detail_page',                       // /search-results?paperId=xxx
  CHAT_PAGE: 'chat_page',
  ASSISTANT_PAGE: 'assistant_page',
  PEER_REVIEW_PAGE: 'peer_review_page',
  
  // 组件入口
  SEARCH_BOX: 'search_box',
  SIMILAR_SECTION: 'similar_section',
  CHECKIN_FLOAT: 'checkin_float',
};

// 生成或获取会话ID
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('usage_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('usage_session_id', sessionId);
  }
  return sessionId;
};

/**
 * 记录功能使用日志（核心方法）
 * @param {string} featureCode - 功能代码
 * @param {string} action - 操作类型
 * @param {string} entryPoint - 入口位置
 * @param {object} extraData - 额外数据
 */
export const trackUsage = async (featureCode, action, entryPoint = '', extraData = null) => {
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

    // 使用 sendBeacon 或 fetch 发送，不阻塞用户操作
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

/**
 * 记录每日签到
 */
export const trackCheckin = () => {
  trackUsage(FeatureCode.USER_CHECKIN, Action.CHECKIN, EntryPoint.CHECKIN_FLOAT);
};

/**
 * 记录直接检索（调用 /papers/search 接口时）
 * @param {string} query - 搜索关键词
 * @param {string} entryPoint - 入口位置
 */
export const trackDirectSearch = (query, entryPoint = EntryPoint.SEARCH_BOX) => {
  trackUsage(FeatureCode.DIRECT_SEARCH, Action.SEARCH, entryPoint, { query });
};

/**
 * 记录智能检索（AI搜索模式）
 * @param {string} query - 搜索关键词
 * @param {string} entryPoint - 入口位置
 */
export const trackSmartSearch = (query, entryPoint = EntryPoint.HOME_PAGE) => {
  trackUsage(FeatureCode.SMART_SEARCH, Action.SEARCH, entryPoint, { query });
};

/**
 * 记录检索联想（调用 /search/suggestions 接口时）
 * @param {string} query - 搜索关键词
 */
export const trackSearchSuggestion = (query) => {
  trackUsage(FeatureCode.SEARCH_SUGGESTION, Action.SEARCH, EntryPoint.SEARCH_BOX, { query });
};

/**
 * 记录摘要翻译（调用 /translate/stream 接口时）
 * @param {string} paperId - 论文ID
 */
export const trackAbstractTranslate = (paperId) => {
  trackUsage(FeatureCode.ABSTRACT_TRANSLATE, Action.TRANSLATE, '', { paper_id: paperId });
};

/**
 * 记录智能矩阵分析（调用 /analysis/paper 接口时）
 * @param {string} paperId - 论文ID
 */
export const trackMatrixAnalysis = (paperId) => {
  trackUsage(FeatureCode.MATRIX_ANALYSIS, Action.ANALYZE, EntryPoint.SEARCH_RESULTS_PAGE, { paper_id: paperId });
};

/**
 * 记录智能矩阵新增维度
 * @param {string} dimensionName - 维度名称
 */
export const trackMatrixAddDimension = (dimensionName) => {
  trackUsage(FeatureCode.MATRIX_ADD_DIMENSION, Action.SUBMIT, EntryPoint.SEARCH_RESULTS_PAGE, { dimension_name: dimensionName });
};

/**
 * 记录PDF预览
 * @param {string} pdfUrl - PDF URL
 * @param {string} entryPoint - 入口位置
 */
export const trackPDFPreview = (pdfUrl, entryPoint = '') => {
  trackUsage(FeatureCode.PDF_PREVIEW, Action.VIEW, entryPoint, { pdf_url: pdfUrl });
};

/**
 * 记录PDF划词翻译
 * @param {string} selectedText - 选中的文本（截取前50字符）
 * @param {boolean} isFullscreen - 是否全屏模式
 */
export const trackPDFSelectionTranslate = (selectedText, isFullscreen = false) => {
  trackUsage(
    FeatureCode.PDF_SELECTION_TRANSLATE, 
    Action.TRANSLATE, 
    isFullscreen ? 'pdf_fullscreen' : 'pdf_preview',
    { text_length: selectedText?.length || 0, text_preview: selectedText?.slice(0, 50) || '' }
  );
};

/**
 * 记录智能助手对话（AssistantPage + ChatPage）
 * @param {string} context - 上下文信息（工具名称或对话场景）
 */
export const trackAIAssistantChat = (context = '') => {
  trackUsage(FeatureCode.AI_ASSISTANT_CHAT, Action.CHAT, EntryPoint.ASSISTANT_PAGE, 
    context ? { context } : null);
};

/**
 * 记录智能审稿（提交审稿时）
 */
export const trackAIPeerReview = () => {
  trackUsage(FeatureCode.AI_PEER_REVIEW, Action.SUBMIT, EntryPoint.PEER_REVIEW_PAGE);
};

/**
 * 记录落地页详情查看（打开 /paper/{id} 时）
 * @param {string} paperId - 论文ID
 */
export const trackLandingPageView = (paperId) => {
  trackUsage(FeatureCode.LANDING_PAGE_VIEW, Action.VIEW, EntryPoint.LANDING_PAGE, { paper_id: paperId });
};

/**
 * 记录落地页搜索（在落地页顶部搜索框搜索时）
 * @param {string} query - 搜索关键词
 */
export const trackLandingPageSearch = (query) => {
  trackUsage(FeatureCode.LANDING_PAGE_SEARCH, Action.SEARCH, EntryPoint.LANDING_PAGE, { query });
};

/**
 * 记录落地页相似论文点击
 * @param {string} paperId - 点击的论文ID
 * @param {string} sourcePaperId - 来源论文ID
 */
export const trackLandingPageSimilar = (paperId, sourcePaperId) => {
  trackUsage(FeatureCode.LANDING_PAGE_SIMILAR, Action.CLICK, EntryPoint.SIMILAR_SECTION, 
    { paper_id: paperId, source_paper_id: sourcePaperId });
};

/**
 * 记录论文详情页查看（打开 /search-results?paperId=xxx 时）
 * @param {string} paperId - 论文ID
 */
export const trackDetailPageView = (paperId) => {
  trackUsage(FeatureCode.DETAIL_PAGE_VIEW, Action.VIEW, EntryPoint.DETAIL_PAGE, { paper_id: paperId });
};

/**
 * 记录详情页相似论文 Tab 点击
 * @param {string} paperId - 当前论文ID（查看谁的相似论文）
 */
export const trackDetailPageSimilar = (paperId) => {
  trackUsage(FeatureCode.DETAIL_PAGE_SIMILAR, Action.CLICK, EntryPoint.SIMILAR_SECTION, 
    { paper_id: paperId });
};

// 默认导出
const usageTracker = {
  FeatureCode,
  Action,
  EntryPoint,
  trackUsage,
  // 便捷方法
  trackCheckin,
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
  trackLandingPageView,
  trackLandingPageSearch,
  trackLandingPageSimilar,
  trackDetailPageView,
  trackDetailPageSimilar,
};

export default usageTracker;
