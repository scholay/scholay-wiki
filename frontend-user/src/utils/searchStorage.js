/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * searchStorage - 搜索状态管理工具
 * 使用 sessionStorage 存储搜索查询和筛选条件，避免 URL 长度限制
 */

const STORAGE_KEYS = {
  QUERY: 'search_query',
  FILTERS: 'search_filters',
  MODE: 'search_mode', // 'normal' | 'ai'
  AI_MODEL_LEVEL: 'ai_model_level', // 'low' | 'mid' | 'high'
  AI_CONVERSATION_ID: 'ai_conversation_id',
  SOURCE: 'search_source', // 'stc' | 'olx'
};

/**
 * 设置搜索查询
 */
export const setSearchQuery = (query) => {
  if (query !== undefined && query !== null) {
    sessionStorage.setItem(STORAGE_KEYS.QUERY, query);
  }
};

/**
 * 获取搜索查询
 */
export const getSearchQuery = () => {
  return sessionStorage.getItem(STORAGE_KEYS.QUERY) || '';
};

/**
 * 设置搜索筛选条件
 */
export const setSearchFilters = (filters) => {
  if (filters) {
    sessionStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(filters));
  }
};

/**
 * 获取搜索筛选条件
 */
export const getSearchFilters = () => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEYS.FILTERS);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to parse search filters:', e);
  }
  return {
    yearFrom: '',
    yearTo: '',
    publicationTypes: [],
    fieldsOfStudy: [],
    openAccessPdf: '',
    venue: '',
    minCitationCount: '',
  };
};

/**
 * 设置搜索模式
 */
export const setSearchMode = (mode) => {
  if (mode === 'normal' || mode === 'ai') {
    sessionStorage.setItem(STORAGE_KEYS.MODE, mode);
  }
};

/**
 * 获取搜索模式
 */
export const getSearchMode = () => {
  return sessionStorage.getItem(STORAGE_KEYS.MODE) || 'normal';
};

/**
 * 设置 AI 模型级别
 */
export const setAIModelLevel = (level) => {
  if (level === 'low' || level === 'mid' || level === 'high') {
    sessionStorage.setItem(STORAGE_KEYS.AI_MODEL_LEVEL, level);
  }
};

/**
 * 获取 AI 模型级别
 */
export const getAIModelLevel = () => {
  return sessionStorage.getItem(STORAGE_KEYS.AI_MODEL_LEVEL) || 'low';
};

/**
 * 设置 AI 聊天 ID
 */
export const setAIConversationId = (id) => {
  if (id) {
    sessionStorage.setItem(STORAGE_KEYS.AI_CONVERSATION_ID, id);
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.AI_CONVERSATION_ID);
  }
};

/**
 * 获取 AI 聊天 ID
 */
export const getAIConversationId = () => {
  return sessionStorage.getItem(STORAGE_KEYS.AI_CONVERSATION_ID) || null;
};

/**
 * 清除所有搜索状态
 */
export const clearSearchStorage = () => {
  Object.values(STORAGE_KEYS).forEach(key => {
    sessionStorage.removeItem(key);
  });
};

/**
 * 清除搜索查询（保留模式和筛选）
 */
export const clearSearchQuery = () => {
  sessionStorage.removeItem(STORAGE_KEYS.QUERY);
};

/**
 * 准备跳转到搜索结果页（设置所有必要的存储）
 * @param {Object} options - 搜索选项
 * @param {string} options.query - 搜索查询
 * @param {Object} options.filters - 筛选条件
 * @param {string} options.mode - 搜索模式 ('normal' | 'ai')
 * @param {string} options.modelLevel - AI 模型级别
 * @returns {string} - 目标 URL
 */
export const prepareSearchNavigation = ({ query, filters, mode = 'normal', modelLevel = 'low' }) => {
  // 存储查询内容
  setSearchQuery(query || '');
  
  // 存储筛选条件
  if (filters) {
    setSearchFilters(filters);
  }
  
  // 存储模式
  setSearchMode(mode);
  
  // 如果是 AI 模式，存储模型级别并清除旧的对话ID（因为是新搜索）
  if (mode === 'ai') {
    setAIModelLevel(modelLevel);
    // 清除旧的对话ID，确保新搜索会创建新对话
    setAIConversationId(null);
  }
  
  // 返回目标 URL（不包含 query 参数）
  return mode === 'ai' ? '/search-results?mode=ai' : '/search-results';
};

/**
 * 准备跳转到论文详情页
 * @param {string} paperId - 论文 ID
 * @param {string} query - 可选的搜索查询（用于返回时恢复）
 * @returns {string} - 目标 URL
 */
export const preparePaperNavigation = (paperId, query = '') => {
  if (query) {
    setSearchQuery(query);
  }
  return `/search-results?paperId=${paperId}`;
};

/**
 * 准备跳转到作者详情页
 * @param {string} authorId - 作者 ID
 * @param {string} query - 可选的搜索查询（用于返回时恢复）
 * @returns {string} - 目标 URL
 */
export const prepareAuthorNavigation = (authorId, query = '') => {
  if (query) {
    setSearchQuery(query);
  }
  return `/search-results?authorId=${authorId}`;
};

/**
 * 设置搜索数据源
 * @param {string} source - 'stc' | 'olx'
 */
export const setSearchSource = (source) => {
  if (source) {
    localStorage.setItem(STORAGE_KEYS.SOURCE, source);
  }
};

/**
 * 获取搜索数据源（持久化到 localStorage，跨会话保留偏好）
 * @returns {string} - 'stc' | 'olx'
 */
export const getSearchSource = () => {
  return localStorage.getItem(STORAGE_KEYS.SOURCE) || 'olx';
};

const searchStorage = {
  setSearchQuery,
  getSearchQuery,
  setSearchFilters,
  getSearchFilters,
  setSearchMode,
  getSearchMode,
  setAIModelLevel,
  getAIModelLevel,
  setAIConversationId,
  getAIConversationId,
  setSearchSource,
  getSearchSource,
  clearSearchStorage,
  clearSearchQuery,
  prepareSearchNavigation,
  preparePaperNavigation,
  prepareAuthorNavigation,
};

export default searchStorage;


