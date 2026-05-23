import api, { API_URL, publicApi, tokenCache } from './client';
import type { SearchParams } from '../types/paper';

export const scholarAPI = {
  searchPapers: (params: SearchParams) => api.post('/scholar/papers/search', params),
  getPaper: (paperId: string) => api.get(`/scholar/papers/${paperId}`),
  getCitations: (paperId: string, params?: Record<string, any>) =>
    api.get(`/scholar/papers/${paperId}/citations`, { params }),
  getReferences: (paperId: string, params?: Record<string, any>) =>
    api.get(`/scholar/papers/${paperId}/references`, { params }),
  getPaperBatch: (paperIds: string[], fields?: string) =>
    api.post('/scholar/papers/batch', { paperIds, fields }),
  getRecommendations: (paperId: string, limit = 100) =>
    api.get(`/scholar/recommendations/papers/${paperId}`, { params: { limit } }),
};

export const publicScholarAPI = {
  searchPapers: (params: SearchParams, config?: { signal?: AbortSignal }) =>
    publicApi.post('/papers/search', params, config),

  getPaper: (paperId: string, fields?: string) =>
    publicApi.get(`/papers/${paperId}`, {
      params: {
        fields:
          fields ||
          'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,fieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,tldr,journal',
      },
    }),

  getCitations: (paperId: string, params?: Record<string, any>) =>
    publicApi.get(`/papers/${paperId}/citations`, { params }),

  getReferences: (paperId: string, params?: Record<string, any>) =>
    publicApi.get(`/papers/${paperId}/references`, { params }),

  getSearchSuggestions: (query: string, paperLimit = 5, authorLimit = 5, source?: string) =>
    publicApi.get('/search/suggestions', { params: { query, paperLimit, authorLimit, ...(source && { source }) } }),

  getSystemDimensions: () => publicApi.get('/analysis/dimensions'),

  getPaperAutocomplete: (query: string, source?: string) =>
    publicApi.get('/papers/autocomplete', { params: { query, ...(source && { source }) } }),

  getPaperBatch: (paperIds: string[], fields?: string) =>
    publicApi.post('/papers/batch', { paperIds, fields }),

  getRecommendations: (paperId: string, limit = 50) =>
    publicApi.get(`/recommendations/papers/${paperId}`, { params: { limit } }),

  getAuthor: (authorId: string, fields?: string) =>
    publicApi.get(`/author-detail/${authorId}`, {
      params: {
        fields:
          fields ||
          'authorId,name,affiliations,paperCount,citationCount,hIndex,homepage,externalIds',
      },
    }),

  getAuthorPapers: (authorId: string, offset = 0, limit = 100, fields?: string) =>
    publicApi.get(`/author-detail/${authorId}/papers`, {
      params: {
        offset,
        limit,
        fields:
          fields ||
          'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,journal',
      },
    }),

  translateStream: (text: string) => {
    const token = tokenCache.get();
    return fetch(`${API_URL}/api/v1/public/translate/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ text }),
    });
  },

  translatePaperStream: (title: string, abstract: string, tldr: string) => {
    const token = tokenCache.get();
    return fetch(`${API_URL}/api/v1/public/translate/paper/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ title, abstract, tldr }),
    });
  },

  // SEO 收录：把搜索结果曝光 / 详情页 slug 喂给 sitemap。
  // expose 用 sendBeacon（fire-and-forget）避免阻塞主流程；离页时依然能送达。
  // 一次请求同时上报 papers + 去重后的 authors,后端各自走 tier=2 的 upsert。
  reportSEOExposure: (
    papers: Array<{
      paper_id: string;
      title: string;
      abstract?: string;
      year?: number;
      venue?: string;
      doi?: string;
      authors?: Array<{ name: string; authorId?: string }>;
      fields_of_study?: string[];
      source?: string;
    }>,
    authors?: Array<{
      author_id: string;
      name: string;
      affiliations?: string[];
      homepage?: string;
      paper_count?: number;
      citation_count?: number;
      h_index?: number;
      source?: string;
    }>,
  ) => {
    if (!papers?.length && !authors?.length) return;
    const url = `${API_URL}/api/v1/public/seo/expose`;
    const body = JSON.stringify({ papers: papers || [], authors: authors || [] });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      } catch (_) {
        // fall through to fetch
      }
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* best-effort */ });
  },

  resolveSEOSlug: (slug: string) => publicApi.get(`/seo/paper/${encodeURIComponent(slug)}`),
  resolveSEOAuthorSlug: (slug: string) => publicApi.get(`/seo/author/${encodeURIComponent(slug)}`),
};

// Journal API (JNL endpoints)
export const journalAPI = {
  search: (params: Record<string, any>) => publicApi.post('/journals/search', params),
  list: (params?: Record<string, any>) => publicApi.post('/journals/list', params || {}),
  get: (id: number, full?: string) => publicApi.post('/journals/get', { id, full: full || '1' }),
  getFilters: () => publicApi.post('/journals/filters', {}),
  getStats: () => publicApi.post('/journals/stats', {}),
  getByISSN: (issn: string, full?: string) => publicApi.post('/journals/byIssn', { issn, full }),
  compare: (ids: string) => publicApi.post('/journals/compare', { ids }),
  /** 前缀联想，返回轻量字段（id / canonical_name / issn_l / source_count / openalex_works_count） */
  suggest: (q: string, limit = 10) => publicApi.post('/journals/suggest', { q, limit }),
  /** 批量按 canonical_name 查（CSV，最多 ~100 个） */
  byNames: (names: string, fields?: string) =>
    publicApi.post('/journals/byNames', { names, fields }),
  /** 批量按 ISSN 查（CSV，最多 100） */
  byIssns: (issns: string, fields?: string) =>
    publicApi.post('/journals/batch', { issns, fields }),
};

export { publicApi };
