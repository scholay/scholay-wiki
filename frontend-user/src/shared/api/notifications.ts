import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 站内信(通知)REST 封装 —— 对应后端 `internal/message` 的 user 端接口
 * (见 backend `routes_user.go` 中 `userProtected.../messages*` 一段)。
 *
 * WebSocket 推送在 `shared/hooks/useNotificationSocket` 处理,会按需 invalidate
 * 本文件的 query,达到"WS 通知 + REST 列表"双源一致。
 */

export type MessageCategory =
  | 'system'
  | 'promotion'
  | 'transaction'
  | string;

export interface UserMessage {
  id: number;
  message_id: number;
  title: string;
  content: string;
  category: MessageCategory;
  link_url?: string;
  link_text?: string;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface UserMessageListResponse {
  list: UserMessage[];
  total: number;
  page: number;
  page_size: number;
}

export interface UnreadCountResponse {
  count: number;
}

const PAGE_SIZE = 20;

// ===========================================================================
// 未读数
// ===========================================================================

export function useUnreadCount() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    enabled: !!token,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      try {
        const { data } = await http.get<{ data: UnreadCountResponse }>(
          '/user/messages/unread-count'
        );
        return data.data?.count ?? 0;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ===========================================================================
// 通知列表 —— 用 useInfiniteQuery 支持"加载更多"
// ===========================================================================

interface ListParams {
  is_read?: boolean;
  category?: MessageCategory;
}

export function useNotificationList(filter: ListParams = {}) {
  const token = useAuthStore((s) => s.token);
  return useInfiniteQuery({
    queryKey: ['notifications', 'list', filter] as const,
    enabled: !!token,
    initialPageParam: 1,
    staleTime: 15_000,
    queryFn: async ({ pageParam }) => {
      try {
        const params: Record<string, string | number> = {
          page: pageParam,
          page_size: PAGE_SIZE,
        };
        if (filter.is_read !== undefined) params.is_read = String(filter.is_read);
        if (filter.category) params.category = filter.category;
        const { data } = await http.get<{ data: UserMessageListResponse }>(
          '/user/messages',
          { params }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.page_size;
      if (loaded >= lastPage.total) return undefined;
      return lastPage.page + 1;
    },
  });
}

// ===========================================================================
// 标记已读 / 全部已读 / 删除
// ===========================================================================

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await http.put(`/user/messages/${id}/read`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await http.put('/user/messages/read-all');
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await http.delete(`/user/messages/${id}`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
