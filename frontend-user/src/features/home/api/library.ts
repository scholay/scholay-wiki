import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import type { UserLibraryFolderItem } from '@/shared/api/types';

/**
 * Home Sidebar 用 —— 列出用户的文件夹概要,展示"我的文件夹"快捷入口。
 *
 * **queryKey `['library', 'folders']` 与 features/library 严格一致**,
 * react-query 自动共享缓存:home 拉过的 folders,library 进入也是同份数据;
 * library 的 invalidate('library') 也会让 home 自动刷新。
 * 复制一份在 home/api 是为了切断 home → library 的 cross-feature import。
 */
interface FoldersResponse {
  folders: UserLibraryFolderItem[];
  total_count: number;
  root_count: number;
}

export function useLibraryFoldersForHome() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['library', 'folders'] as const,
    enabled: !!token,
    staleTime: 30_000,
    queryFn: async (): Promise<FoldersResponse> => {
      try {
        const { data } = await http.get<{ data: FoldersResponse }>(
          '/user/library/folders'
        );
        return data.data ?? { folders: [], total_count: 0, root_count: 0 };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}
