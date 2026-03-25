import { useQuery } from '@tanstack/react-query';
import { paperDetailApi } from './paperDetailApi';

export const paperKeys = {
  detail: (id: string) => ['paper', 'detail', id] as const,
  citations: (id: string, params?: Record<string, any>) =>
    ['paper', 'citations', id, params] as const,
  references: (id: string, params?: Record<string, any>) =>
    ['paper', 'references', id, params] as const,
  recommendations: (id: string) =>
    ['paper', 'recommendations', id] as const,
  author: (id: string) => ['author', id] as const,
  authorPapers: (id: string, offset?: number, limit?: number) =>
    ['author', 'papers', id, offset, limit] as const,
};

export const usePaperDetail = (paperId: string) =>
  useQuery({
    queryKey: paperKeys.detail(paperId),
    queryFn: () => paperDetailApi.getPaper(paperId).then((r) => r.data),
    enabled: !!paperId,
    staleTime: 10 * 60 * 1000,
  });

export const usePaperCitations = (
  paperId: string,
  params?: { offset?: number; limit?: number; fields?: string }
) =>
  useQuery({
    queryKey: paperKeys.citations(paperId, params),
    queryFn: () =>
      paperDetailApi.getCitations(paperId, params).then((r) => r.data),
    enabled: !!paperId,
    staleTime: 5 * 60 * 1000,
  });

export const usePaperReferences = (
  paperId: string,
  params?: { offset?: number; limit?: number; fields?: string }
) =>
  useQuery({
    queryKey: paperKeys.references(paperId, params),
    queryFn: () =>
      paperDetailApi.getReferences(paperId, params).then((r) => r.data),
    enabled: !!paperId,
    staleTime: 5 * 60 * 1000,
  });

export const usePaperRecommendations = (paperId: string, limit?: number) =>
  useQuery({
    queryKey: paperKeys.recommendations(paperId),
    queryFn: () =>
      paperDetailApi.getRecommendations(paperId, limit).then((r) => r.data),
    enabled: !!paperId,
    staleTime: 10 * 60 * 1000,
  });

export const useAuthor = (authorId: string) =>
  useQuery({
    queryKey: paperKeys.author(authorId),
    queryFn: () => paperDetailApi.getAuthor(authorId).then((r) => r.data),
    enabled: !!authorId,
    staleTime: 10 * 60 * 1000,
  });

export const useAuthorPapers = (
  authorId: string,
  offset: number = 0,
  limit: number = 100
) =>
  useQuery({
    queryKey: paperKeys.authorPapers(authorId, offset, limit),
    queryFn: () =>
      paperDetailApi
        .getAuthorPapers(authorId, offset, limit)
        .then((r) => r.data),
    enabled: !!authorId,
    staleTime: 5 * 60 * 1000,
  });
