import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import type { UserLibraryPaper } from '@/shared/api/types';
import type { ConfirmLink, SearchHit } from './upload-resolve';

/**
 * 文献集 · 已收藏论文的后期关联
 *
 *   POST /user/library/papers/:id/relink-search { title? }
 *     → { used_title, hits }   //  hits 内会标记 already_saved
 *
 *   POST /user/library/papers/:id/relink { link }
 *     → { paper, merged }
 *
 * 行为:
 *   - 已存在另一行命中 (uid, source, source_paper_id) → 合并(PDF + ai_* 转移到 existing,删除 current,返回 existing,merged=true)
 *   - 否则原地把 current 的 source / 字段切到上游,link_state='linked',merged=false
 */

// ============================================================================
// Search
// ============================================================================

export interface RelinkSearchResponse {
  used_title: string;
  hits: SearchHit[];
}

/**
 * 自动用 row.og_title (free) 或 row.title (linked) 兜底查三源 —— title 为空时
 * (例如某行 og_title 也空)后端返 400,前端需弹一个输入框让用户补,但 v1 简化:
 * 仅当 paperId 提供且 row 有可用标题时启用。
 */
export function useRelinkSearch(paperId: number | null, titleOverride?: string) {
  return useQuery({
    queryKey: ['library', 'relink-search', paperId, titleOverride] as const,
    enabled: paperId != null,
    staleTime: 60_000,
    queryFn: async (): Promise<RelinkSearchResponse> => {
      try {
        const { data } = await http.post<{ data: RelinkSearchResponse }>(
          `/user/library/papers/${paperId}/relink-search`,
          titleOverride ? { title: titleOverride } : {}
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ============================================================================
// Relink
// ============================================================================

export interface RelinkVars {
  paperId: number;
  link: ConfirmLink;
}

export interface RelinkResult {
  paper: UserLibraryPaper;
  merged: boolean;
}

export function useRelinkPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paperId, link }: RelinkVars): Promise<RelinkResult> => {
      try {
        const { data } = await http.post<{ data: RelinkResult }>(
          `/user/library/papers/${paperId}/relink`,
          { link }
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
 * 取消关联 —— 把一条 origin='upload' 的 linked 行退回 free 状态。
 * 后端 DELETE /user/library/papers/:id/unlink:
 *   - 仅允许 origin='upload' 的行(search 来源的论文没有"取消关联",只能整条删)
 *   - source → 'local',link_state → 'free',title/abstract/... 清空(保留 ai_* + pdf_*)
 *
 * 成功后 invalidate ['library'],列表刷新 → 行的展示自动切回 free 模式。
 */
export function useUnlinkPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paperId: number): Promise<UserLibraryPaper> => {
      try {
        const { data } = await http.delete<{ data: UserLibraryPaper }>(
          `/user/library/papers/${paperId}/unlink`
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
