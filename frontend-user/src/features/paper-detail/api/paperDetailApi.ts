import { httpClient, publicHttpClient } from 'shared/api/client';
import type { ApiResponse } from 'shared/types/api';

export const paperDetailApi = {
  getPaper: (paperId: string, fields?: string) =>
    publicHttpClient.get<ApiResponse>(`/papers/${paperId}`, {
      params: {
        fields:
          fields ||
          'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,tldr,journal,citations.paperId,citations.externalIds,citations.url,citations.title,citations.abstract,citations.venue,citations.publicationVenue,citations.year,citations.referenceCount,citations.citationCount,citations.influentialCitationCount,citations.openAccessPdf,citations.s2FieldsOfStudy,citations.publicationTypes,citations.publicationDate,citations.journal,citations.citationStyles,citations.authors,references.paperId,references.externalIds,references.url,references.title,references.abstract,references.venue,references.publicationVenue,references.year,references.referenceCount,references.citationCount,references.influentialCitationCount,references.openAccessPdf,references.s2FieldsOfStudy,references.publicationTypes,references.publicationDate,references.journal,references.citationStyles,references.authors',
      },
    }),

  getCitations: (paperId: string, params?: any) =>
    httpClient.get<ApiResponse>(`/scholar/papers/${paperId}/citations`, { params }),

  getReferences: (paperId: string, params?: any) =>
    httpClient.get<ApiResponse>(`/scholar/papers/${paperId}/references`, { params }),

  getRecommendations: (paperId: string, limit: number = 100) =>
    publicHttpClient.get<ApiResponse>(`/recommendations/papers/${paperId}`, { params: { limit } }),

  analyzePaper: (paperId: string, title: string, abstract: string) =>
    httpClient.post<ApiResponse>('/analysis/paper', { paperId, title, abstract }),

  batchAnalyzePapers: (papers: Array<{ paperId: string; title: string; abstract: string }>) =>
    httpClient.post<ApiResponse>('/analysis/papers/batch', { papers }),

  getAuthor: (authorId: string, fields?: string) =>
    publicHttpClient.get<ApiResponse>(`/author-detail/${authorId}`, {
      params: {
        fields: fields || 'authorId,name,affiliations,paperCount,citationCount,hIndex,homepage,externalIds',
      },
    }),

  getAuthorPapers: (authorId: string, offset: number = 0, limit: number = 100, fields?: string) =>
    publicHttpClient.get<ApiResponse>(`/author-detail/${authorId}/papers`, {
      params: {
        offset,
        limit,
        fields:
          fields ||
          'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,journal',
      },
    }),
};
