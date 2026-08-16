import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import type {
  Paper,
  PaperAuthor,
  RemoteStagingArea,
  RemoteStagingPaper,
  UpstreamSource,
} from '@/shared/api/types';

export type { RemoteStagingArea, RemoteStagingPaper } from '@/shared/api/types';

/**
 * 检索工作区 · 暂存区 —— 与后端 /api/v1/user/staging-areas/* 对接。
 *
 * 仅在已登录时启用;未登录走 zustand 持久化。
 * StagingActions facade 统一调度本地/远端,组件不直接消费这里的 hook。
 */

interface ListResponse {
  areas: RemoteStagingArea[];
}

// ============================================================================
// 工具:Paper(前端模型) ↔ AddPaperPayload(后端载荷)
// ============================================================================

export interface AddPaperPayload {
  source: UpstreamSource;
  source_paper_id: string;
  title?: string;
  authors?: PaperAuthor[];
  year?: number;
  venue?: string;
  doi?: string;
  abstract?: string;
  pdf_url?: string;
  citation_count?: number;
  is_open_access?: boolean;
}

export function paperToPayload(p: Paper): AddPaperPayload {
  return {
    source: (p.source ?? 'stc') as UpstreamSource,
    source_paper_id: p.paperId,
    title: p.title,
    authors: p.authors,
    year: p.year,
    venue: p.venue,
    abstract: p.abstract,
    citation_count: p.citationCount,
    is_open_access: p.isOpenAccess,
  };
}

export function remotePaperToPaper(r: RemoteStagingPaper): Paper {
  return {
    paperId: r.source_paper_id,
    title: r.title,
    abstract: r.abstract,
    year: r.year,
    venue: r.venue,
    citationCount: r.citation_count,
    isOpenAccess: r.is_open_access,
    authors: r.authors,
    source: r.source,
  };
}

// ============================================================================
// Queries
// ============================================================================

export const stagingAreasKey = ['staging-areas'] as const;

export function useRemoteStagingAreas() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: stagingAreasKey,
    enabled: !!token,
    staleTime: 10_000,
    queryFn: async (): Promise<RemoteStagingArea[]> => {
      try {
        const { data } = await http.get<{ data: ListResponse }>(
          '/user/staging-areas'
        );
        return data.data?.areas ?? [];
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ============================================================================
// Mutations
// ============================================================================

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: stagingAreasKey });
}

export function useCreateRemoteArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name?: string): Promise<RemoteStagingArea> => {
      try {
        const { data } = await http.post<{ data: RemoteStagingArea }>(
          '/user/staging-areas',
          { name }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRenameRemoteArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; name: string }) => {
      try {
        const { data } = await http.patch<{ data: RemoteStagingArea }>(
          `/user/staging-areas/${vars.id}`,
          { name: vars.name }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteRemoteArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await http.delete(`/user/staging-areas/${id}`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useAddRemotePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { areaId: number; paper: Paper }) => {
      try {
        const { data } = await http.post<{ data: RemoteStagingPaper }>(
          `/user/staging-areas/${vars.areaId}/papers`,
          paperToPayload(vars.paper)
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRemoveRemotePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      areaId: number;
      source: UpstreamSource;
      paperId: string;
    }) => {
      try {
        await http.delete(
          `/user/staging-areas/${vars.areaId}/papers/${vars.source}/${encodeURIComponent(vars.paperId)}`
        );
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

function orderRemotePapers(
  papers: RemoteStagingPaper[],
  orderedIds: string[],
): RemoteStagingPaper[] {
  const byId = new Map(papers.map((p) => [p.source_paper_id, p]));
  const next: RemoteStagingPaper[] = [];
  const seen = new Set<string>();
  for (const [index, id] of orderedIds.entries()) {
    const paper = byId.get(id);
    if (!paper || seen.has(id)) continue;
    next.push({ ...paper, position: index });
    seen.add(id);
  }
  for (const paper of papers) {
    if (!seen.has(paper.source_paper_id)) {
      next.push({ ...paper, position: next.length });
    }
  }
  return next;
}

export function useReorderRemotePapers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { areaId: number; paperIds: string[] }) => {
      try {
        await http.patch(`/user/staging-areas/${vars.areaId}/papers/reorder`, {
          paper_ids: vars.paperIds,
        });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: stagingAreasKey });
      const prev = qc.getQueryData<RemoteStagingArea[]>(stagingAreasKey);
      qc.setQueryData<RemoteStagingArea[]>(stagingAreasKey, (areas) =>
        (areas ?? []).map((area) =>
          area.id === vars.areaId
            ? {
                ...area,
                papers: orderRemotePapers(area.papers ?? [], vars.paperIds),
              }
            : area,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(stagingAreasKey, ctx.prev);
    },
    onSettled: () => invalidate(qc),
  });
}

/**
 * 一次性清空 area 内全部论文(保留 area 本身) —— 走后端 batch endpoint,
 * 避免前端循环 N 个 DELETE。仅在登录态使用。
 */
export function useClearRemotePapers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (areaId: number) => {
      try {
        await http.delete(`/user/staging-areas/${areaId}/papers`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

interface MigrateAreaInput {
  name: string;
  papers: Paper[];
}

interface MigrateResponse {
  areas: RemoteStagingArea[];
  merged: number;
  skipped: number;
}

export function useMigrateStagingAreas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (areas: MigrateAreaInput[]): Promise<MigrateResponse> => {
      try {
        const body = {
          areas: areas.map((a) => ({
            name: a.name,
            papers: a.papers.map(paperToPayload),
          })),
        };
        const { data } = await http.post<{ data: MigrateResponse }>(
          '/user/staging-areas/migrate',
          body
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidate(qc),
  });
}
