/**
 * React Query hooks for Conversation data.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationAPI } from '../../services/conversation.api';

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------
export const conversationKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  list: (page: number, pageSize: number, type?: string | null) =>
    [...conversationKeys.lists(), { page, pageSize, type }] as const,
  detail: (id: string | number) => [...conversationKeys.all, 'detail', id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function useConversations(
  page = 1,
  pageSize = 20,
  conversationType: string | null = null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: conversationKeys.list(page, pageSize, conversationType),
    queryFn: () =>
      conversationAPI
        .getConversations(page, pageSize, conversationType)
        .then((r) => r.data),
    enabled: options?.enabled !== false,
  });
}

export function useConversation(
  id: string | number | undefined,
  page?: number | null,
  pageSize?: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: conversationKeys.detail(id!),
    queryFn: () => conversationAPI.getConversation(id!, page, pageSize).then((r) => r.data),
    enabled: !!id && (options?.enabled !== false),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, type }: { title: string; type?: string }) =>
      conversationAPI.createConversation(title, type).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) =>
      conversationAPI.deleteConversation(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string | number; title: string }) =>
      conversationAPI.renameConversation(id, title).then((r) => r.data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}
