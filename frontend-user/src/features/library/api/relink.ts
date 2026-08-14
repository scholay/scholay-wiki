import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { invalidateLibrary } from '@/shared/lib/library-invalidation';
import { STALE_WARM } from '@/shared/lib/query-config';
import type { UserLibraryPaper } from '@/shared/api/types';
import type { ConfirmLink, SearchHit } from './upload-resolve';

/**
 * 文件夹 · 已收藏论文的后期关联
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
    // 顶级独立 key(不挂 ['library'] 前缀):relink-search 是一次昂贵的三源
    // fan-out 检索,若挂在 library 前缀下,任何库写操作(收藏/删除等)的
    // invalidateLibrary 都会连带重拉它。它的结果不随库内容变,无需被库写失效。
    queryKey: ['relink-search', paperId, titleOverride] as const,
    enabled: paperId != null,
    staleTime: STALE_WARM,
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
      invalidateLibrary(qc);
    },
  });
}

/**
 * 取消关联 —— 把一条 linked 行退回 free 状态(快照式)。
 * 后端 DELETE /user/library/papers/:id/unlink:
 *   - 任何 linked 行均可取消(不再要求行已有 og_*,不再 400)
 *   - og_* 的空字段先自动固化当前生效展示值(og 优先 → 上游元数据),再清上游快照
 *   - source → 'local',link_state → 'free',title/abstract/... 清空(展示内容不变,
 *     保留 og_* + pdf_*)
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
      invalidateLibrary(qc);
    },
  });
}
