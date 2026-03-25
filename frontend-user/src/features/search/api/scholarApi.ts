/**
 * 学术搜索 API — 已认证 + 公共
 */

import { httpClient, publicHttpClient, API_URL } from '../../../shared/api';
import type { ApiResponse } from '../../../shared/types/api';
import type {
  Paper,
  SearchParams,
  SearchResult,
  Author,
  AnalysisDimension,
} from '../../../shared/types/paper';

/* ----------------------------------------------------------------
 * 分析维度 API（需要认证）
 * ---------------------------------------------------------------- */

export const analysisDimensionApi = {
  analyzePaper: (paperId: string, title: string, abstract: string) =>
    httpClient.post<ApiResponse>('/analysis/paper', { paperId, title, abstract }),

  batchAnalyzePapers: (papers: Array<{ paperId: string; title: string; abstract: string }>) =>
    httpClient.post<ApiResponse>('/analysis/papers/batch', { papers }),

  getDimensions: () =>
    httpClient.get<ApiResponse<AnalysisDimension[]>>('/analysis/dimensions'),

  createDimension: (dimensionKey: string, name: string, description: string, sortOrder: number = 0) =>
    httpClient.post<ApiResponse>('/analysis/dimensions', { dimensionKey, name, description, sortOrder }),

  updateDimension: (id: number, name: string, description: string, sortOrder: number = 0) =>
    httpClient.put<ApiResponse>(`/analysis/dimensions/${id}`, { name, description, sortOrder }),

  deleteDimension: (id: number) =>
    httpClient.delete<ApiResponse>(`/analysis/dimensions/${id}`),

  resetDimension: (dimensionKey: string) =>
    httpClient.delete<ApiResponse>(`/analysis/dimensions/reset/${dimensionKey}`),

  resetAllDimensions: () =>
    httpClient.delete<ApiResponse>('/analysis/dimensions/reset-all'),

  copyFromSystem: () =>
    httpClient.post<ApiResponse>('/analysis/dimensions/copy-from-system'),
};

/* ----------------------------------------------------------------
 * 需要认证的 API
 * ---------------------------------------------------------------- */

export const scholarApi = {
  searchPapers: (params: SearchParams) =>
    httpClient.post<ApiResponse<SearchResult>>(
      '/scholar/papers/search',
      params
    ),

  getPaper: (paperId: string) =>
    httpClient.get<ApiResponse<Paper>>(`/scholar/papers/${paperId}`),

  getCitations: (
    paperId: string,
    params?: { offset?: number; limit?: number; fields?: string }
  ) =>
    httpClient.get<ApiResponse<{ data: Paper[]; total: number }>>(
      `/scholar/papers/${paperId}/citations`,
      { params }
    ),

  getReferences: (
    paperId: string,
    params?: { offset?: number; limit?: number; fields?: string }
  ) =>
    httpClient.get<ApiResponse<{ data: Paper[]; total: number }>>(
      `/scholar/papers/${paperId}/references`,
      { params }
    ),

  getPaperBatch: (paperIds: string[], fields?: string) =>
    httpClient.post<ApiResponse<Paper[]>>('/scholar/papers/batch', {
      paperIds,
      fields,
    }),

  getRecommendations: (paperId: string, limit: number = 100) =>
    httpClient.get<ApiResponse<Paper[]>>(
      `/scholar/recommendations/papers/${paperId}`,
      { params: { limit } }
    ),
};

/* ----------------------------------------------------------------
 * 公共 API（无需认证）
 * ---------------------------------------------------------------- */

const DEFAULT_PAPER_FIELDS = [
  'paperId', 'title', 'abstract', 'authors', 'year', 'citationCount',
  'referenceCount', 'venue', 'publicationDate', 'publicationTypes',
  'fieldsOfStudy', 's2FieldsOfStudy', 'externalIds', 'url',
  'openAccessPdf', 'influentialCitationCount', 'isOpenAccess', 'tldr',
  'journal',
].join(',');

const DEFAULT_DETAIL_FIELDS = [
  DEFAULT_PAPER_FIELDS,
  'citations.paperId,citations.externalIds,citations.url,citations.title,citations.abstract,citations.venue,citations.publicationVenue,citations.year,citations.referenceCount,citations.citationCount,citations.influentialCitationCount,citations.openAccessPdf,citations.s2FieldsOfStudy,citations.publicationTypes,citations.publicationDate,citations.journal,citations.citationStyles,citations.authors',
  'references.paperId,references.externalIds,references.url,references.title,references.abstract,references.venue,references.publicationVenue,references.year,references.referenceCount,references.citationCount,references.influentialCitationCount,references.openAccessPdf,references.s2FieldsOfStudy,references.publicationTypes,references.publicationDate,references.journal,references.citationStyles,references.authors',
].join(',');

const DEFAULT_AUTHOR_FIELDS =
  'authorId,name,affiliations,paperCount,citationCount,hIndex,homepage,externalIds';

const DEFAULT_AUTHOR_PAPER_FIELDS = [
  'paperId', 'title', 'abstract', 'authors', 'year', 'citationCount',
  'referenceCount', 'venue', 'publicationDate', 'publicationTypes',
  'fieldsOfStudy', 's2FieldsOfStudy', 'externalIds', 'url',
  'openAccessPdf', 'influentialCitationCount', 'isOpenAccess', 'journal',
].join(',');

export const publicScholarApi = {
  searchPapers: (params: SearchParams) =>
    publicHttpClient.post<ApiResponse<SearchResult>>('/papers/search', params),

  getPaper: (paperId: string, fields?: string) =>
    publicHttpClient.get<ApiResponse<Paper>>(`/papers/${paperId}`, {
      params: { fields: fields || DEFAULT_DETAIL_FIELDS },
    }),

  getSearchSuggestions: (
    query: string,
    paperLimit: number = 5,
    authorLimit: number = 5
  ) =>
    publicHttpClient.get<
      ApiResponse<{ papers: Paper[]; authors: Author[] }>
    >('/search/suggestions', {
      params: { query, paperLimit, authorLimit },
    }),

  getSystemDimensions: () =>
    publicHttpClient.get<ApiResponse<AnalysisDimension[]>>(
      '/analysis/dimensions'
    ),

  getPaperAutocomplete: (query: string) =>
    publicHttpClient.get<ApiResponse<string[]>>('/papers/autocomplete', {
      params: { query },
    }),

  getPaperBatch: (paperIds: string[], fields?: string) =>
    publicHttpClient.post<ApiResponse<Paper[]>>('/papers/batch', {
      paperIds,
      fields,
    }),

  getRecommendations: (paperId: string, limit: number = 100) =>
    publicHttpClient.get<ApiResponse<Paper[]>>(
      `/recommendations/papers/${paperId}`,
      { params: { limit } }
    ),

  getAuthor: (authorId: string, fields?: string) =>
    publicHttpClient.get<ApiResponse<Author>>(
      `/author-detail/${authorId}`,
      { params: { fields: fields || DEFAULT_AUTHOR_FIELDS } }
    ),

  getAuthorPapers: (
    authorId: string,
    offset: number = 0,
    limit: number = 100,
    fields?: string
  ) =>
    publicHttpClient.get<ApiResponse<{ data: Paper[]; total: number }>>(
      `/author-detail/${authorId}/papers`,
      {
        params: {
          offset,
          limit,
          fields: fields || DEFAULT_AUTHOR_PAPER_FIELDS,
        },
      }
    ),

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

  translatePaperStream: (
    title: string,
    abstract: string,
    tldr: string
  ) => {
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
