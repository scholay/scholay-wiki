import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationAPI } from '../../services/conversation.api';

export const conversationKeys = {
  all: ['conversations'] as const,
  list: (page: number, type?: string | null) =>
    [...conversationKeys.all, 'list', { page, type }] as const,
  detail: (id: string | number) =>
    [...conversationKeys.all, 'detail', id] as const,
};

export function useConversations(
  page = 1,
  pageSize = 20,
  conversationType: string | null = null,
) {
  return useQuery({
    queryKey: conversationKeys.list(page, conversationType),
    queryFn: async () => {
      const res = await conversationAPI.getConversations(page, pageSize, conversationType);
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.message);
    },
    staleTime: 30 * 1000,
  });
}

export function useConversation(id: string | number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: conversationKeys.detail(id),
    queryFn: async () => {
      const res = await conversationAPI.getConversation(id);
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.message);
    },
    enabled: !!id && (options?.enabled !== false),
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, type }: { title: string; type?: string }) =>
      conversationAPI.createConversation(title, type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => conversationAPI.deleteConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}
