import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { useFavoriteBurst } from '@/stores/favorite-burst.store';
import { trackFavorite } from './usage-stat';
import type {
  Paper,
  UpstreamSource,
  UserLibraryPaper,
} from '@/shared/api/types';

/**
 * 收藏 / 收藏检查 —— 共享 hook,跨 feature(search / library / journals / home)复用。
 *
 * 之前位于 `features/search/api/library.ts`,被 library 等其他 feature 跨 import,
 * 违反"features 之间不互 import"约束。移到 `shared/api/` 是唯一干净路径。
 *
 * queryKey 统一以 `['library', ...]` 前缀,与文献集页的列表 cache 共享,
 * useFavoritePaper.onSuccess 后 invalidate 一次能刷掉所有相关视图。
 */

interface AddPaperPayload {
  source: UpstreamSource;
  source_paper_id: string;
  folder_id?: number | null;
  title?: string;
  /** 作者数组 —— 后端 authors_json,JSON 列存储 */
  authors?: unknown;
  abstract?: string;
  year?: number;
  venue?: string;
  doi?: string;
  pdf_url?: string;
  publication_types?: unknown;
  citation_count?: number;
  /** 完整原始数据备份 —— 后端 raw_json 列存储,字段缺失时可回查 */
  raw?: unknown;
}

/**
 * 从上游 externalIds 抽 DOI —— 不同源大小写不一,兜底几种命名。
 * (Semantic Scholar: "DOI",OpenAlex: "doi" 等)
 */
function extractDOI(externalIds?: Record<string, unknown>): string | undefined {
  if (!externalIds) return undefined;
  const candidates = ['DOI', 'doi', 'Doi'];
  for (const k of candidates) {
    const v = externalIds[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/**
 * 批量查"这一页论文是否已经在我的文献集" —— 后端 `POST /user/library/check` 一次拿全。
 *
 * queryKey 包含 source + paper_ids 数组(react-query 深比对,内容不变就命中缓存)。
 * useFavoritePaper.onSuccess 会 invalidate ['library'] 前缀,自动同步本 check 缓存。
 */
export function useFavoriteCheck(source: UpstreamSource, paperIds: string[]) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['library', 'check', source, paperIds] as const,
    enabled: !!token && paperIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      try {
        const { data } = await http.post<{
          data: { saved: Record<string, boolean> };
        }>('/user/library/check', { source, paper_ids: paperIds });
        const saved = data.data?.saved ?? {};
        const set = new Set<string>();
        for (const [id, isSaved] of Object.entries(saved)) {
          if (isSaved) set.add(id);
        }
        return set;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * 收藏论文 —— mutate({ paper, folderId? })
 *   - 不传 folderId / 传 undefined → 落到用户默认文件夹(后端 fallback)
 *   - 传 number → 指定文件夹
 *   - 传 null → 显式落到根目录(目前后端模型也按默认处理)
 *
 * 入参刻意用对象形 —— 后续要加 silent / overwrite 等扩展时只补字段、不破坏调用方。
 */
export interface FavoritePaperVariables {
  paper: Paper;
  folderId?: number | null;
  /**
   * 跳过默认的成功反馈(burst / toast fallback),由调用方自行 onSuccess。
   * 用于需要自定义提示文案的场景(例:登录后自动重放收藏)。
   */
  silentSuccess?: boolean;
}

/**
 * 取消收藏 —— DELETE /user/library/:source/:paperId(后端按 user+source+source_paper_id 删)
 *
 * 失败/成功都不在 hook 里弹 toast —— 调用方(FavoritePaperButton)用 ConfirmPopover
 * 已经做了"操作中"反馈,成功后只 invalidate 触发 UI 刷新,文案由调用方掌控。
 */
export interface UnfavoritePaperVariables {
  source: UpstreamSource;
  paperId: string;
}

export function useUnfavoritePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, paperId }: UnfavoritePaperVariables) => {
      try {
        await http.delete(
          `/user/library/${source}/${encodeURIComponent(paperId)}`
        );
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useFavoritePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paper, folderId }: FavoritePaperVariables) => {
      // 一次性把 Paper 里能落库的字段全发到后端 —— 上游接口不稳定时本地仍有
      // 完整快照。raw 字段把整个 paper 对象塞进去,后续字段需求扩展只改读取
      // 端,不用回头补救数据缺失的历史收藏。
      const doi = extractDOI(paper.externalIds);
      const pdfUrl =
        paper.openAccessPdf?.url ||
        (paper.isOpenAccess ? paper.url : undefined);
      const payload: AddPaperPayload = {
        source: (paper.source ?? 'stc') as UpstreamSource,
        source_paper_id: paper.paperId,
        folder_id: folderId,
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract,
        year: paper.year,
        venue: paper.venue,
        doi,
        pdf_url: pdfUrl,
        citation_count: paper.citationCount,
        raw: paper,
      };
      try {
        const { data } = await http.post<{ data: UserLibraryPaper }>(
          '/user/library',
          payload
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['library'] });
      trackFavorite(); // 功能使用统计: 收藏一次(传统/智能搜索等所有入口都走此 mutation)
      // 默认反馈:burst store 内部决定 → 有可见 sink 飞 "+1",无可见 sink toast。
      // 调用方传 silentSuccess=true 时跳过,完全自定义提示。
      if (!variables.silentSuccess) {
        useFavoriteBurst.getState().pushBurst();
      }
    },
  });
}
