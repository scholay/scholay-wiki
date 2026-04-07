import api, { API_URL, publicApi } from './client';
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
  searchPapers: (params: SearchParams) => publicApi.post('/papers/search', params),

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
    const token = localStorage.getItem('user_token');
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
    const token = localStorage.getItem('user_token');
    return fetch(`${API_URL}/api/v1/public/translate/paper/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ title, abstract, tldr }),
    });
  },
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
};

export { publicApi };
