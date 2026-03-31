/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Utils 统一导出
 */

// 常量
export * from './constants';

// 日志工具
export { default as logger } from './logger';

// 格式化工具
export * from './formatters';

// 验证工具
export * from './validators';

// 性能工具
export {
  createTimer,
  measureTime,
  debounce,
  throttle,
  requestIdleCallback,
  cancelIdleCallback,
  batchDOMUpdates,
  isInViewport,
  createIntersectionObserver,
  getMemoryUsage,
  getPerformanceMetrics,
  logPerformanceReport,
} from './performance';

// 性能优化 HOC
export {
  withPerformance,
  withMemo,
  withRenderCount,
  withRenderTime,
  logPropsChanges,
} from './withPerformance';

// 消息工具
export { organizeMessagesByParentId, messagesToQAList } from './messageUtils';

// SEO 工具
export { generateSearchResultsSchema, generateBreadcrumbSchema, truncateText } from './seoHelpers';

// 使用追踪
export {
  trackUsage,
  // 检索类
  trackDirectSearch,
  trackSearchSuggestion,
  // 翻译类
  trackAbstractTranslate,
  // 分析类
  trackMatrixAnalysis,
  trackMatrixAddDimension,
  // 工具类
  trackPDFPreview,
  // 对话类
  trackAIAssistantChat,
  trackAIPeerReview,
  // 落地页类
  trackLandingPageView,
  trackLandingPageSearch,
  trackLandingPageSimilar,
  // 详情页类
  trackDetailPageView,
  trackDetailPageSimilar,
  // 常量
  FeatureCode,
  Action,
  EntryPoint,
} from './usageTracker';

// 搜索存储
export {
  getSearchQuery,
  setSearchQuery,
  getSearchFilters,
  setSearchFilters,
  getSearchMode,
  setSearchMode,
  getAIModelLevel,
  setAIModelLevel,
  getAIConversationId,
  setAIConversationId,
} from './searchStorage';
