/**
 * React Query hooks for Scholar / Paper data.
 * Centralizes caching, deduplication, and retry logic.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scholarAPI, publicScholarAPI } from '../../services/scholar.api';
import type { SearchParams } from '../../types/paper';

// ---------------------------------------------------------------------------
// Query key factories — keeps keys consistent and easy to invalidate.
// ---------------------------------------------------------------------------
export const scholarKeys = {
  all: ['scholar'] as const,
  papers: () => [...scholarKeys.all, 'papers'] as const,
  paper: (id: string) => [...scholarKeys.papers(), id] as const,
  search: (params: SearchParams) => [...scholarKeys.papers(), 'search', params] as const,
  citations: (paperId: string, params?: Record<string, any>) =>
    [...scholarKeys.paper(paperId), 'citations', params] as const,
  references: (paperId: string, params?: Record<string, any>) =>
    [...scholarKeys.paper(paperId), 'references', params] as const,
  recommendations: (paperId: string) =>
    [...scholarKeys.paper(paperId), 'recommendations'] as const,
  authors: () => [...scholarKeys.all, 'authors'] as const,
  author: (id: string) => [...scholarKeys.authors(), id] as const,
  authorPapers: (id: string, offset?: number) =>
    [...scholarKeys.author(id), 'papers', offset] as const,
  suggestions: (query: string) => [...scholarKeys.all, 'suggestions', query] as const,
};

// ---------------------------------------------------------------------------
// Paper queries
// ---------------------------------------------------------------------------
export function usePaper(paperId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scholarKeys.paper(paperId!),
    queryFn: () => publicScholarAPI.getPaper(paperId!).then((r) => r.data),
    enabled: !!paperId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000, // papers rarely change
  });
}

export function useCitations(
  paperId: string | undefined,
  params?: Record<string, any>,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: scholarKeys.citations(paperId!, params),
    queryFn: () => publicScholarAPI.getCitations(paperId!, params).then((r) => r.data),
    enabled: !!paperId && (options?.enabled !== false),
  });
}

export function useReferences(
  paperId: string | undefined,
  params?: Record<string, any>,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: scholarKeys.references(paperId!, params),
    queryFn: () => publicScholarAPI.getReferences(paperId!, params).then((r) => r.data),
    enabled: !!paperId && (options?.enabled !== false),
  });
}

export function useRecommendations(
  paperId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: scholarKeys.recommendations(paperId!),
    queryFn: () => publicScholarAPI.getRecommendations(paperId!).then((r) => r.data),
    enabled: !!paperId && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Search mutation (POST-based, so we use mutation but cache the result)
// ---------------------------------------------------------------------------
export function useSearchPapers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: SearchParams) =>
      publicScholarAPI.searchPapers(params).then((r) => r.data),
    onSuccess: (data, params) => {
      queryClient.setQueryData(scholarKeys.search(params), data);
    },
  });
}

// ---------------------------------------------------------------------------
// Author queries
// ---------------------------------------------------------------------------
export function useAuthor(authorId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scholarKeys.author(authorId!),
    queryFn: () => publicScholarAPI.getAuthor(authorId!).then((r) => r.data),
    enabled: !!authorId && (options?.enabled !== false),
    staleTime: 10 * 60 * 1000,
  });
}

export function useAuthorPapers(
  authorId: string | undefined,
  offset = 0,
  limit = 100,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: scholarKeys.authorPapers(authorId!, offset),
    queryFn: () =>
      publicScholarAPI.getAuthorPapers(authorId!, offset, limit).then((r) => r.data),
    enabled: !!authorId && (options?.enabled !== false),
  });
}

// ---------------------------------------------------------------------------
// Suggestions (debounced at call-site via useDebouncedCallback)
// ---------------------------------------------------------------------------
export function useSearchSuggestions(query: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scholarKeys.suggestions(query),
    queryFn: () => publicScholarAPI.getSearchSuggestions(query).then((r) => r.data),
    enabled: query.length >= 2 && (options?.enabled !== false),
    staleTime: 2 * 60 * 1000,
  });
}
