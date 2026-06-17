import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';
import type {
  Paper,
  PaperSource,
  UpstreamSource,
  UserLibraryPaper,
} from '@/shared/api/types';
import { pickEffectiveFields } from '../lib/pick-field';

/**
 * 我的文献集论文 —— 按文件夹分类查询。
 *
 * filter 含义(没有"全部"概念 —— 用户口径:根目录就是文献集本身,
 * 文件夹是子分类,不存在跨文件夹的聚合视图):
 *   - 'root'          根目录 = 默认入口(folder_id IS NULL)
 *   - number(>0)     某个文件夹内
 *
 * 任何 mutation 都失效 ['library'] 前缀,确保 folders 计数 + papers 列表都刷。
 */

export type LibraryFolderFilter = 'root' | number;

interface ListResponse {
  items: UserLibraryPaper[];
  total: number;
}

function folderQueryValue(filter: LibraryFolderFilter): string {
  if (filter === 'root') return 'root';
  return String(filter);
}

export type LibrarySortOrder = 'asc' | 'desc';

export interface UseLibraryPapersOptions {
  page?: number;
  pageSize?: number;
  /** 关键词模糊搜索:命中 title / abstract / venue / doi(去前后空格,后端有 64 字上限) */
  q?: string;
  /** 按加入时间排序方向 —— 当前后端仅 created_at 维度,asc=最早在前 / desc=最新在前 */
  order?: LibrarySortOrder;
}

export function useLibraryPapers(
  filter: LibraryFolderFilter = 'root',
  options: UseLibraryPapersOptions = {}
) {
  const { page = 1, pageSize = 20, q = '', order = 'desc' } = options;
  const trimmed = q.trim();
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: [
      'library',
      'papers',
      filter,
      page,
      pageSize,
      trimmed,
      order,
    ] as const,
    enabled: !!token,
    staleTime: STALE_FRESH,
    // 翻页 / 切 size 时保留旧数据当 placeholder,避免 list 闪空
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<ListResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        folder: folderQueryValue(filter),
        order,
      });
      if (trimmed) params.set('q', trimmed);
      try {
        const { data } = await http.get<{ data: ListResponse }>(
          `/user/library?${params}`
        );
        return data.data ?? { items: [], total: 0 };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * 文件夹论文「无限滚动」版 —— 移动端文件夹详情用(替代一次性 pageSize:100 拉满)。
 * 每页 pageSize 条,滚到接近末尾再拉下一页;移动端配合虚拟化只挂载视口附近的行。
 */
export function useInfiniteLibraryPapers(
  filter: LibraryFolderFilter = 'root',
  options: { pageSize?: number; q?: string; order?: LibrarySortOrder } = {}
) {
  const { pageSize = 20, q = '', order = 'desc' } = options;
  const trimmed = q.trim();
  const token = useAuthStore((s) => s.token);
  return useInfiniteQuery({
    queryKey: ['library', 'papers-inf', filter, pageSize, trimmed, order] as const,
    enabled: !!token,
    staleTime: STALE_FRESH,
    initialPageParam: 1,
    getNextPageParam: (lastPage: ListResponse, allPages: ListResponse[]) => {
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    queryFn: async ({ pageParam }): Promise<ListResponse> => {
      const params = new URLSearchParams({
        page: String(pageParam),
        page_size: String(pageSize),
        folder: folderQueryValue(filter),
        order,
      });
      if (trimmed) params.set('q', trimmed);
      try {
        const { data } = await http.get<{ data: ListResponse }>(
          `/user/library?${params}`
        );
        return data.data ?? { items: [], total: 0 };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/** 摊平无限分页的所有论文行。 */
export function flattenLibraryPages(
  pages: ListResponse[] | undefined
): UserLibraryPaper[] {
  if (!pages) return [];
  return pages.flatMap((p) => p.items);
}

function invalidateLibrary(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['library'] });
}

/**
 * 按 (source, source_paper_id) 找当前用户的文献集行。
 *
 * 用途:
 *   - 上游 (stc/olx/pmd) 详情页:查"我有没有收藏 + 有没有上传 PDF"
 *   - 自由文件(source='local')详情页:全部内容都来自这一查
 *
 * 404(未收藏) 不算错误,返回 null;真错误仍会 throw。
 * source='local' 时 paperId 是 PDF 内容 SHA-256。
 */
export function useLibraryPaperByUpstream(
  source: PaperSource | undefined,
  paperId: string | undefined
) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['library', 'by-upstream', source, paperId] as const,
    enabled: !!token && !!source && !!paperId,
    staleTime: STALE_FRESH,
    queryFn: async (): Promise<UserLibraryPaper | null> => {
      try {
        const { data } = await http.get<{ data: UserLibraryPaper | null }>(
          `/user/library/by-upstream/${source}/${encodeURIComponent(paperId!)}`
        );
        // 后端语义:未收藏 → 200 + data:null(不是 404)。这里无需再 catch 404。
        return data.data ?? null;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * PATCH /user/library/papers/:id —— 用户在编辑弹窗改 og_* 字段。
 *
 * payload 字段全部可选, 不传 = 不改; 字符串字段传 '' / 数组传 [] / 年份传 0
 * 表示清空 (恢复显示元数据)。后端只更新 og_* 列, 元数据永远不动。
 *
 * 成功后 invalidate library 全树, 列表 / 详情 / by-upstream 都重拉。
 */
export interface UpdatePaperOGPayload {
  og_title?: string;
  og_abstract?: string;
  og_authors?: import('@/shared/api/types').PaperAuthor[] | null;
  og_year?: number;
  og_venue?: string;
  og_doi?: string;
}

export function useUpdatePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { paperId: number; payload: UpdatePaperOGPayload }) => {
      try {
        const { data } = await http.patch<{ data: UserLibraryPaper }>(
          `/user/library/papers/${vars.paperId}`,
          vars.payload
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

/**
 * UserLibraryPaper → Paper(详情页渲染层用的统一形状)。
 * 走 pickEffectiveFields: og 优先 → 元数据 → 空, 与列表卡 / 详情 pane 行为一致。
 */
export function libraryRowToPaper(row: UserLibraryPaper): Paper {
  const eff = pickEffectiveFields(row);
  return {
    paperId: row.source_paper_id,
    title: eff.title,
    abstract: eff.abstract,
    year: eff.year,
    venue: eff.venue,
    authors: eff.authors,
    // 自由文件没有 OA PDF / 上游 URL —— openAccessPdf/url 留空,
    // ActionRow 那些按钮自然 hide
    citationCount: row.citation_count,
    // Paper.source 是 UpstreamSource 类型;'local' 在类型层不允许,但运行时
    // 用 cast 透传,detail pane 用 source==='local' 判断分支。
    source: row.source as UpstreamSource,
  };
}

export function useMovePaperToFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; folderId: number | null }) => {
      try {
        const { data } = await http.patch<{ data: UserLibraryPaper }>(
          `/user/library/papers/${vars.id}/folder`,
          { folder_id: vars.folderId }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateLibrary(qc),
  });
}

// ============================================================================
// 批量操作 —— 文件系统/云盘风格
// ============================================================================

interface BatchResult {
  affected: number;
}

export function useBatchMovePapers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { ids: number[]; folderId: number | null }) => {
      if (vars.ids.length === 0) return { affected: 0 };
      try {
        const { data } = await http.post<{ data: BatchResult }>(
          '/user/library/papers/batch/move',
          { ids: vars.ids, folder_id: vars.folderId }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateLibrary(qc),
  });
}

export function useBatchDeletePapers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      if (ids.length === 0) return { affected: 0 };
      try {
        const { data } = await http.post<{ data: BatchResult }>(
          '/user/library/papers/batch/delete',
          { ids }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateLibrary(qc),
  });
}
