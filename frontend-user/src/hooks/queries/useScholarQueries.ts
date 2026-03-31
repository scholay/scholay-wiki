import { useQuery } from '@tanstack/react-query';
import { scholarAPI } from '../../services/scholar.api';
import { publicScholarAPI } from '../../services/scholar.api';

export const scholarKeys = {
  all: ['scholar'] as const,
  paper: (id: string) => [...scholarKeys.all, 'paper', id] as const,
  search: (params: any) => [...scholarKeys.all, 'search', params] as const,
  citations: (id: string, params?: any) =>
    [...scholarKeys.all, 'citations', id, params] as const,
  references: (id: string, params?: any) =>
    [...scholarKeys.all, 'references', id, params] as const,
  recommendations: (id: string) =>
    [...scholarKeys.all, 'recommendations', id] as const,
  author: (id: string) => [...scholarKeys.all, 'author', id] as const,
  authorPapers: (id: string, offset: number) =>
    [...scholarKeys.all, 'authorPapers', id, offset] as const,
  suggestions: (query: string) =>
    [...scholarKeys.all, 'suggestions', query] as const,
};

export function usePaper(paperId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scholarKeys.paper(paperId),
    queryFn: async () => {
      const res = await publicScholarAPI.getPaper(paperId);
      return res.data?.data || res.data;
    },
    enabled: !!paperId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000,
  });
}

export function useAuthor(authorId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scholarKeys.author(authorId),
    queryFn: async () => {
      const res = await publicScholarAPI.getAuthor(authorId);
      return res.data?.data || res.data;
    },
    enabled: !!authorId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000,
  });
}

export function useAuthorPapers(
  authorId: string,
  offset = 0,
  limit = 100,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: scholarKeys.authorPapers(authorId, offset),
    queryFn: async () => {
      const res = await publicScholarAPI.getAuthorPapers(authorId, offset, limit);
      return res.data?.data || res.data;
    },
    enabled: !!authorId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000,
  });
}

export function useSearchSuggestions(query: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scholarKeys.suggestions(query),
    queryFn: async () => {
      const res = await publicScholarAPI.getSearchSuggestions(query);
      return res.data?.data || res.data;
    },
    enabled: !!query && query.length >= 2 && (options?.enabled !== false),
    staleTime: 30 * 1000,
  });
}

export function useRecommendations(paperId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scholarKeys.recommendations(paperId),
    queryFn: async () => {
      const res = await publicScholarAPI.getRecommendations(paperId);
      return res.data?.data || res.data;
    },
    enabled: !!paperId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000,
  });
}
