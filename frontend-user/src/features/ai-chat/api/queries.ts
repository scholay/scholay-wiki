import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationApi } from './conversationApi';

export const chatKeys = {
  all: ['conversations'] as const,
  list: (page?: number, pageSize?: number, type?: string) =>
    ['conversations', 'list', page, pageSize, type] as const,
  detail: (id: string, page?: number, pageSize?: number) =>
    ['conversations', 'detail', id, page, pageSize] as const,
  siblings: (messageId: string | number) =>
    ['conversations', 'siblings', messageId] as const,
  branch: (messageId: string | number) =>
    ['conversations', 'branch', messageId] as const,
  followUp: (convId: string, msgId: string) =>
    ['conversations', 'followUp', convId, msgId] as const,
};

export const useConversations = (
  page: number = 1,
  pageSize: number = 20,
  conversationType?: string
) =>
  useQuery({
    queryKey: chatKeys.list(page, pageSize, conversationType),
    queryFn: () =>
      conversationApi
        .getConversations(page, pageSize, conversationType)
        .then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useConversation = (
  id: string,
  page?: number,
  pageSize?: number
) =>
  useQuery({
    queryKey: chatKeys.detail(id, page, pageSize),
    queryFn: () =>
      conversationApi.getConversation(id, page, pageSize).then((r) => r.data),
    enabled: !!id,
    staleTime: 30 * 1000,
  });

export const useCreateConversation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, type }: { title: string; type?: string }) =>
      conversationApi.createConversation(title, type).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.all }),
  });
};

export const useDeleteConversation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversationApi.deleteConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.all }),
  });
};

export const useAddMessage = () =>
  useMutation({
    mutationFn: (params: {
      conversationId: string | number;
      content: string;
      searchQuery?: string;
      searchPapers?: boolean;
    }) =>
      conversationApi.addMessage(
        params.conversationId,
        params.content,
        params.searchQuery,
        params.searchPapers
      ),
  });

export const useContinueConversation = () =>
  useMutation({
    mutationFn: (params: {
      conversationId: string | number;
      content: string;
      mode?: string;
    }) =>
      conversationApi.continueConversation(
        params.conversationId,
        params.content,
        params.mode
      ),
  });

export const useUpdateTitle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      conversationId: string | number;
      title: string;
    }) =>
      conversationApi.updateTitle(params.conversationId, params.title),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.all }),
  });
};

export const useSiblingMessages = (messageId: string | number) =>
  useQuery({
    queryKey: chatKeys.siblings(messageId),
    queryFn: () =>
      conversationApi.getSiblingMessages(messageId).then((r) => r.data),
    enabled: !!messageId,
  });

export const useBranchChain = (messageId: string | number) =>
  useQuery({
    queryKey: chatKeys.branch(messageId),
    queryFn: () =>
      conversationApi.getBranchChain(messageId).then((r) => r.data),
    enabled: !!messageId,
  });

export const useFollowUpQuestions = (
  conversationId: string,
  messageId: string
) =>
  useQuery({
    queryKey: chatKeys.followUp(conversationId, messageId),
    queryFn: () =>
      conversationApi
        .getFollowUpQuestions(conversationId, messageId)
        .then((r) => r.data),
    enabled: !!conversationId && !!messageId,
    staleTime: 5 * 60 * 1000,
  });
