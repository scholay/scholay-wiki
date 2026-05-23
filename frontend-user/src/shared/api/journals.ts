import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import type { Journal } from '@/shared/api/types';

/**
 * 单期刊详情 —— 多个 feature 共用(journals 详情页 + library 详情 pane + …)。
 *
 * 放在 `shared/api` 而非任一 feature:
 *   - 不绑定特定 feature 状态,纯查 `/public/journals/get`
 *   - queryKey `['journal', 'detail', id]` 全局唯一,任意调用方共享缓存
 *   - 避免 features 间通过 hook re-export 形成隐式依赖
 */
export function useJournalDetail(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['journal', 'detail', id] as const,
    enabled: enabled && id != null && id > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Journal> => {
      try {
        const { data } = await http.post<{ data: Journal }>(
          '/public/journals/get',
          { id, full: '1' }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}
