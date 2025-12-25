/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

// 功能代码常量
export const FeatureCode = {
  // 检索类
  ACADEMIC_SEARCH: 'academic_search',
  PAPER_DETAIL: 'paper_detail',
  SIMILAR_PAPERS: 'similar_papers',
  
  // 分析类
  SMART_ANALYSIS: 'smart_analysis',
  PAPER_DIMENSION: 'paper_dimension',
  
  // AI类
  AI_CHAT: 'ai_chat',
  AI_PEER_REVIEW: 'ai_peer_review',
  AI_ASSISTANT: 'ai_assistant',
  
  // 用户类
  USER_LOGIN: 'user_login',
  USER_REGISTER: 'user_register',
  USER_CHECKIN: 'user_checkin',
  
  // 工具类
  PDF_PREVIEW: 'pdf_preview',
};

// 功能名称映射
const FeatureNames = {
  [FeatureCode.ACADEMIC_SEARCH]: '学术检索',
  [FeatureCode.PAPER_DETAIL]: '论文详情',
  [FeatureCode.SIMILAR_PAPERS]: '相似论文',
  [FeatureCode.SMART_ANALYSIS]: '智能分析',
  [FeatureCode.PAPER_DIMENSION]: '论文多维分析',
  [FeatureCode.AI_CHAT]: 'AI聊天',
  [FeatureCode.AI_PEER_REVIEW]: '智能审稿',
  [FeatureCode.AI_ASSISTANT]: '精品AI工具',
  [FeatureCode.USER_LOGIN]: '用户登录',
  [FeatureCode.USER_REGISTER]: '用户注册',
  [FeatureCode.USER_CHECKIN]: '每日签到',
  [FeatureCode.PDF_PREVIEW]: 'PDF预览',
};

// 操作类型常量
export const Action = {
  SEARCH: 'search',
  SUBMIT: 'submit',
  VIEW: 'view',
  CLICK: 'click',
  LOGIN: 'login',
  REGISTER: 'register',
  CHECKIN: 'checkin',
};

// 入口位置常量
export const EntryPoint = {
  HOME_PAGE: 'home_page',
  SEARCH_PAGE: 'search_page',
  RESULT_PAGE: 'result_page',
  PAPER_DETAIL_PAGE: 'paper_detail_page',
  ADVANCED_SEARCH_PAGE: 'advanced_search_page',
  CHAT_PAGE: 'chat_page',
  PEER_REVIEW_PAGE: 'peer_review_page',
  ASSISTANT_PAGE: 'assistant_page',
  SETTINGS_PAGE: 'settings_page',
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
 * 记录功能使用日志
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
      request_path: window.location.pathname,
      referer_path: document.referrer ? new URL(document.referrer).pathname : '',
      session_id: getSessionId(),
      extra_data: extraData,
    };

    // 使用 sendBeacon 或 fetch 发送，不阻塞用户操作
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/v1/public/usage-log', blob);
    } else {
      // 降级到 fetch
      fetch('/api/v1/public/usage-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        // 忽略错误，不影响用户体验
      });
    }
  } catch (error) {
    // 忽略错误，不影响用户体验
    console.debug('[UsageTracker] Failed to track:', error);
  }
};

/**
 * 便捷方法：记录学术检索
 */
export const trackAcademicSearch = (entryPoint, query = '') => {
  trackUsage(FeatureCode.ACADEMIC_SEARCH, Action.SEARCH, entryPoint, query ? { query } : null);
};

/**
 * 便捷方法：记录论文详情查看
 */
export const trackPaperDetail = (paperId) => {
  trackUsage(FeatureCode.PAPER_DETAIL, Action.VIEW, EntryPoint.PAPER_DETAIL_PAGE, { paper_id: paperId });
};

/**
 * 便捷方法：记录相似论文获取
 */
export const trackSimilarPapers = (paperId) => {
  trackUsage(FeatureCode.SIMILAR_PAPERS, Action.VIEW, EntryPoint.PAPER_DETAIL_PAGE, { paper_id: paperId });
};

/**
 * 便捷方法：记录智能分析
 */
export const trackSmartAnalysis = (entryPoint, query = '') => {
  trackUsage(FeatureCode.SMART_ANALYSIS, Action.SUBMIT, entryPoint, query ? { query } : null);
};

/**
 * 便捷方法：记录论文多维分析
 */
export const trackPaperDimension = (paperId) => {
  trackUsage(FeatureCode.PAPER_DIMENSION, Action.SUBMIT, EntryPoint.PAPER_DETAIL_PAGE, { paper_id: paperId });
};

/**
 * 便捷方法：记录AI聊天
 */
export const trackAIChat = (entryPoint) => {
  trackUsage(FeatureCode.AI_CHAT, Action.SUBMIT, entryPoint);
};

/**
 * 便捷方法：记录智能审稿
 */
export const trackAIPeerReview = () => {
  trackUsage(FeatureCode.AI_PEER_REVIEW, Action.SUBMIT, EntryPoint.PEER_REVIEW_PAGE);
};

/**
 * 便捷方法：记录精品AI工具
 */
export const trackAIAssistant = () => {
  trackUsage(FeatureCode.AI_ASSISTANT, Action.SUBMIT, EntryPoint.ASSISTANT_PAGE);
};

/**
 * 便捷方法：记录用户登录
 */
export const trackUserLogin = () => {
  trackUsage(FeatureCode.USER_LOGIN, Action.LOGIN, '');
};

/**
 * 便捷方法：记录用户注册
 */
export const trackUserRegister = () => {
  trackUsage(FeatureCode.USER_REGISTER, Action.REGISTER, '');
};

/**
 * 便捷方法：记录用户签到
 */
export const trackUserCheckin = () => {
  trackUsage(FeatureCode.USER_CHECKIN, Action.CHECKIN, EntryPoint.SETTINGS_PAGE);
};

/**
 * 便捷方法：记录PDF预览
 */
export const trackPDFPreview = (pdfUrl, entryPoint = '') => {
  trackUsage(FeatureCode.PDF_PREVIEW, Action.VIEW, entryPoint, { pdf_url: pdfUrl });
};

const usageTracker = {
  FeatureCode,
  Action,
  EntryPoint,
  trackUsage,
  trackAcademicSearch,
  trackPaperDetail,
  trackSimilarPapers,
  trackSmartAnalysis,
  trackPaperDimension,
  trackAIChat,
  trackAIPeerReview,
  trackAIAssistant,
  trackUserLogin,
  trackUserRegister,
  trackUserCheckin,
  trackPDFPreview,
};

export default usageTracker;

