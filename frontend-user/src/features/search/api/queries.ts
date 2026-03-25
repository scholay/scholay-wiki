import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scholarApi, publicScholarApi, analysisDimensionApi } from './scholarApi';
import type { SearchParams } from '../../../shared/types/paper';

export const searchKeys = {
  all: ['search'] as const,
  papers: (query: string, params?: Partial<SearchParams>) =>
    ['search', 'papers', query, params] as const,
  paper: (id: string) => ['search', 'paper', id] as const,
  citations: (id: string, params?: Record<string, any>) =>
    ['search', 'citations', id, params] as const,
  references: (id: string, params?: Record<string, any>) =>
    ['search', 'references', id, params] as const,
  suggestions: (query: string) => ['search', 'suggestions', query] as const,
  recommendations: (id: string) =>
    ['search', 'recommendations', id] as const,
  author: (id: string) => ['search', 'author', id] as const,
  authorPapers: (id: string, offset?: number, limit?: number) =>
    ['search', 'authorPapers', id, offset, limit] as const,
  dimensions: ['search', 'dimensions'] as const,
};

export const useSearchPapers = (
  query: string,
  params?: Partial<SearchParams>
) =>
  useQuery({
    queryKey: searchKeys.papers(query, params),
    queryFn: () =>
      publicScholarApi
        .searchPapers({ query, ...params } as SearchParams)
        .then((r) => r.data),
    enabled: !!query,
    staleTime: 5 * 60 * 1000,
  });

export const usePaper = (paperId: string) =>
  useQuery({
    queryKey: searchKeys.paper(paperId),
    queryFn: () => publicScholarApi.getPaper(paperId).then((r) => r.data),
    enabled: !!paperId,
    staleTime: 10 * 60 * 1000,
  });

export const useSearchSuggestions = (query: string) =>
  useQuery({
    queryKey: searchKeys.suggestions(query),
    queryFn: () =>
      publicScholarApi.getSearchSuggestions(query).then((r) => r.data),
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  });

export const useCitations = (
  paperId: string,
  params?: { offset?: number; limit?: number; fields?: string }
) =>
  useQuery({
    queryKey: searchKeys.citations(paperId, params),
    queryFn: () =>
      scholarApi.getCitations(paperId, params).then((r) => r.data),
    enabled: !!paperId,
    staleTime: 5 * 60 * 1000,
  });

export const useReferences = (
  paperId: string,
  params?: { offset?: number; limit?: number; fields?: string }
) =>
  useQuery({
    queryKey: searchKeys.references(paperId, params),
    queryFn: () =>
      scholarApi.getReferences(paperId, params).then((r) => r.data),
    enabled: !!paperId,
    staleTime: 5 * 60 * 1000,
  });

export const useRecommendations = (paperId: string, limit?: number) =>
  useQuery({
    queryKey: searchKeys.recommendations(paperId),
    queryFn: () =>
      publicScholarApi.getRecommendations(paperId, limit).then((r) => r.data),
    enabled: !!paperId,
    staleTime: 10 * 60 * 1000,
  });

export const useSystemDimensions = () =>
  useQuery({
    queryKey: searchKeys.dimensions,
    queryFn: () =>
      publicScholarApi.getSystemDimensions().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useAuthor = (authorId: string) =>
  useQuery({
    queryKey: searchKeys.author(authorId),
    queryFn: () =>
      publicScholarApi.getAuthor(authorId).then((r) => r.data),
    enabled: !!authorId,
    staleTime: 10 * 60 * 1000,
  });

export const useAuthorPapers = (
  authorId: string,
  offset: number = 0,
  limit: number = 100
) =>
  useQuery({
    queryKey: searchKeys.authorPapers(authorId, offset, limit),
    queryFn: () =>
      publicScholarApi
        .getAuthorPapers(authorId, offset, limit)
        .then((r) => r.data),
    enabled: !!authorId,
    staleTime: 5 * 60 * 1000,
  });

export const useAuthSearchPapers = (query: string, params?: Partial<SearchParams>) =>
  useQuery({
    queryKey: ['search', 'auth', 'papers', query, params] as const,
    queryFn: () =>
      scholarApi.searchPapers({ query, ...params } as SearchParams).then((r) => r.data),
    enabled: !!query,
    staleTime: 5 * 60 * 1000,
  });

export const usePaperBatch = () =>
  useMutation({
    mutationFn: (params: { paperIds: string[]; fields?: string }) =>
      publicScholarApi.getPaperBatch(params.paperIds, params.fields).then((r) => r.data),
  });

export const usePaperAutocomplete = (query: string) =>
  useQuery({
    queryKey: ['search', 'autocomplete', query] as const,
    queryFn: () => publicScholarApi.getPaperAutocomplete(query).then((r) => r.data),
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  });

export const dimensionKeys = {
  all: ['dimensions'] as const,
  userDimensions: ['dimensions', 'user'] as const,
};

export const useUserDimensions = () =>
  useQuery({
    queryKey: dimensionKeys.userDimensions,
    queryFn: () => analysisDimensionApi.getDimensions().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useAnalyzePaper = () =>
  useMutation({
    mutationFn: (params: { paperId: string; title: string; abstract: string }) =>
      analysisDimensionApi.analyzePaper(params.paperId, params.title, params.abstract).then((r) => r.data),
  });

export const useBatchAnalyzePapers = () =>
  useMutation({
    mutationFn: (papers: Array<{ paperId: string; title: string; abstract: string }>) =>
      analysisDimensionApi.batchAnalyzePapers(papers).then((r) => r.data),
  });

export const useCreateDimension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { dimensionKey: string; name: string; description: string; sortOrder?: number }) =>
      analysisDimensionApi.createDimension(params.dimensionKey, params.name, params.description, params.sortOrder),
    onSuccess: () => qc.invalidateQueries({ queryKey: dimensionKeys.all }),
  });
};

export const useUpdateDimension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: number; name: string; description: string; sortOrder?: number }) =>
      analysisDimensionApi.updateDimension(params.id, params.name, params.description, params.sortOrder),
    onSuccess: () => qc.invalidateQueries({ queryKey: dimensionKeys.all }),
  });
};

export const useDeleteDimension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => analysisDimensionApi.deleteDimension(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: dimensionKeys.all }),
  });
};

export const useResetDimension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dimensionKey: string) => analysisDimensionApi.resetDimension(dimensionKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: dimensionKeys.all }),
  });
};

export const useResetAllDimensions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => analysisDimensionApi.resetAllDimensions(),
    onSuccess: () => qc.invalidateQueries({ queryKey: dimensionKeys.all }),
  });
};

export const useCopyDimensionsFromSystem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => analysisDimensionApi.copyFromSystem(),
    onSuccess: () => qc.invalidateQueries({ queryKey: dimensionKeys.all }),
  });
};
