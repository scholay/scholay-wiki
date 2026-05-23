import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import type { UserLibraryFolderItem } from '@/shared/api/types';

/**
 * 文献集文件夹 —— 与后端 /api/v1/user/library/folders 对接。
 *
 * queryKey 三段式:
 *   ['library', 'folders']      —— 列表(自带 paper_count、total_count、root_count)
 *
 * 任何 mutation 都失效 ['library'] 前缀(folders + papers 都跟着刷):
 *   - 新建/重命名/删除 folder
 *   - 新建/移动/删除 paper 也会(在 papers.ts 里调)
 */

interface FoldersResponse {
  folders: UserLibraryFolderItem[];
  total_count: number;
  root_count: number;
}

const foldersKey = ['library', 'folders'] as const;

export function useLibraryFolders() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: foldersKey,
    enabled: !!token,
    staleTime: 30_000,
    queryFn: async (): Promise<FoldersResponse> => {
      try {
        const { data } = await http.get<{ data: FoldersResponse }>(
          '/user/library/folders'
        );
        return (
          data.data ?? { folders: [], total_count: 0, root_count: 0 }
        );
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

function invalidateLibrary(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['library'] });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name?: string) => {
      try {
        const { data } = await http.post<{ data: UserLibraryFolderItem }>(
          '/user/library/folders',
          { name }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateLibrary(qc),
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; name: string }) => {
      try {
        const { data } = await http.patch<{ data: UserLibraryFolderItem }>(
          `/user/library/folders/${vars.id}`,
          { name: vars.name }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateLibrary(qc),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await http.delete(`/user/library/folders/${id}`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateLibrary(qc),
  });
}
