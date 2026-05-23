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
  MODE: 'search_mode',
  AI_MODEL_LEVEL: 'ai_model_level',
  AI_CONVERSATION_ID: 'ai_conversation_id',
  SOURCE: 'search_source',
} as const;

export type SearchMode = 'normal' | 'ai';
export type AIModelLevel = 'low' | 'mid' | 'high';
export type SearchSource = 'stc' | 'olx';

export interface SearchFilters {
  yearFrom: string;
  yearTo: string;
  publicationTypes: string[];
  fieldsOfStudy: string[];
  openAccessPdf: string;
  venue: string;
  minCitationCount: string;
}

export interface SearchNavigationOptions {
  query: string;
  filters?: SearchFilters | null;
  mode?: SearchMode;
  modelLevel?: AIModelLevel;
}

export const setSearchQuery = (query: string | null | undefined): void => {
  if (query !== undefined && query !== null) {
    sessionStorage.setItem(STORAGE_KEYS.QUERY, query);
  }
};

export const getSearchQuery = (): string => {
  return sessionStorage.getItem(STORAGE_KEYS.QUERY) || '';
};

export const setSearchFilters = (filters: SearchFilters | null | undefined): void => {
  if (filters) {
    sessionStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(filters));
  }
};

export const getSearchFilters = (): SearchFilters => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEYS.FILTERS);
    if (stored) {
      return JSON.parse(stored) as SearchFilters;
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

export const setSearchMode = (mode: SearchMode | string): void => {
  if (mode === 'normal' || mode === 'ai') {
    sessionStorage.setItem(STORAGE_KEYS.MODE, mode);
  }
};

export const getSearchMode = (): SearchMode => {
  return (sessionStorage.getItem(STORAGE_KEYS.MODE) as SearchMode) || 'normal';
};

export const setAIModelLevel = (level: AIModelLevel | string): void => {
  if (level === 'low' || level === 'mid' || level === 'high') {
    sessionStorage.setItem(STORAGE_KEYS.AI_MODEL_LEVEL, level);
  }
};

export const getAIModelLevel = (): AIModelLevel => {
  return (sessionStorage.getItem(STORAGE_KEYS.AI_MODEL_LEVEL) as AIModelLevel) || 'low';
};

export const setAIConversationId = (id: string | null | undefined): void => {
  if (id) {
    sessionStorage.setItem(STORAGE_KEYS.AI_CONVERSATION_ID, id);
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.AI_CONVERSATION_ID);
  }
};

export const getAIConversationId = (): string | null => {
  return sessionStorage.getItem(STORAGE_KEYS.AI_CONVERSATION_ID) || null;
};

export const clearSearchStorage = (): void => {
  Object.values(STORAGE_KEYS).forEach((key) => {
    sessionStorage.removeItem(key);
  });
};

export const clearSearchQuery = (): void => {
  sessionStorage.removeItem(STORAGE_KEYS.QUERY);
};

export const prepareSearchNavigation = ({
  query,
  filters,
  mode = 'normal',
  modelLevel = 'low',
}: SearchNavigationOptions): string => {
  setSearchQuery(query || '');

  if (filters) {
    setSearchFilters(filters);
  }

  setSearchMode(mode);

  if (mode === 'ai') {
    setAIModelLevel(modelLevel);
    setAIConversationId(null);
  }

  // 搜索词放进 URL slug；空查询时回落到无参形态。
  const trimmed = (query || '').trim();
  const slug = trimmed ? `/${encodeURIComponent(trimmed)}` : '';
  return mode === 'ai' ? `/search-results${slug}?mode=ai` : `/search-results${slug}`;
};

export const preparePaperNavigation = (paperId: string, query: string = ''): string => {
  if (query) {
    setSearchQuery(query);
  }
  // 论文详情已下线 —— 退化为按标题搜索，进入 slug 形式的结果页。
  const trimmed = (query || paperId).trim();
  const slug = trimmed ? `/${encodeURIComponent(trimmed)}` : '';
  return `/search-results${slug}`;
};

export const prepareAuthorNavigation = (authorId: string, query: string = ''): string => {
  if (query) {
    setSearchQuery(query);
  }
  // 作者详情已下线 —— 退化为按作者名搜索。
  const trimmed = (query || authorId).trim();
  const slug = trimmed ? `/${encodeURIComponent(trimmed)}` : '';
  return `/search-results${slug}`;
};

export const setSearchSource = (source: SearchSource | string): void => {
  if (source) {
    localStorage.setItem(STORAGE_KEYS.SOURCE, source);
  }
};

export const getSearchSource = (): SearchSource => {
  return (localStorage.getItem(STORAGE_KEYS.SOURCE) as SearchSource) || 'olx';
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
