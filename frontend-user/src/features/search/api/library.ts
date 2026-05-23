import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import type {
  UpstreamSource,
  UserLibraryFolderItem,
  UserLibraryPaper,
} from '@/shared/api/types';

export type { UserLibraryPaper } from '@/shared/api/types';

// useFavoritePaper / useFavoriteCheck 已迁到 shared/api/user-library-mutations.ts —— 跨 feature 复用
// re-export 保兼容,避免一次性把所有 import path 都改
export {
  useFavoriteCheck,
  useFavoritePaper,
  type FavoritePaperVariables,
} from '@/shared/api/user-library-mutations';

/**
 * 用户文献集(默认收藏夹)—— 与后端 `/user/library` (GET, protected) 对接。
 * 响应:
 *   { code:0, message:'success', data: { items: UserLibraryPaper[], total } }
 *
 * 仅在已登录时启用,未登录时 hook 直接 disabled,返回空。
 * SearchSidebar 据此渲染:有 token → 实数据列表;无 → 登录引导。
 */

interface LibraryListResponse {
  items: UserLibraryPaper[];
  total: number;
}

interface UseLibraryOptions {
  source?: UpstreamSource;
  pageSize?: number;
}

export function useLibrary({ source, pageSize = 8 }: UseLibraryOptions = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['library', 'list', source ?? 'all', pageSize],
    enabled: !!token,
    staleTime: 30_000,
    queryFn: async (): Promise<LibraryListResponse> => {
      try {
        const params = new URLSearchParams({
          page: '1',
          page_size: String(pageSize),
        });
        if (source) params.set('source', source);
        const { data } = await http.get<{ data: LibraryListResponse }>(
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
 * 文件夹列表 —— SearchSidebar 用来展示用户的文献集结构(只读)。
 *
 * 用与 features/library 同款 queryKey `['library', 'folders']` —— **共享缓存**。
 */
interface FoldersResponse {
  folders: UserLibraryFolderItem[];
  total_count: number;
  root_count: number;
}

export function useLibraryFoldersSummary() {
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
