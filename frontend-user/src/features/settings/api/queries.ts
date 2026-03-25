import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configApi, messageApi, analysisDimensionApi } from './settingsApi';

export const configKeys = {
  privacy: ['config', 'privacy'] as const,
  terms: ['config', 'terms'] as const,
  system: ['config', 'system'] as const,
  snippets: ['config', 'snippets'] as const,
};

export const messageKeys = {
  all: ['messages'] as const,
  list: (page?: number, pageSize?: number, category?: string) =>
    ['messages', 'list', page, pageSize, category] as const,
  unread: ['messages', 'unread'] as const,
  detail: (id: number) => ['messages', 'detail', id] as const,
};

export const dimensionKeys = {
  all: ['dimensions'] as const,
  list: ['dimensions', 'list'] as const,
};

export const usePrivacyPolicy = () =>
  useQuery({
    queryKey: configKeys.privacy,
    queryFn: () => configApi.getPrivacyPolicy().then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  });

export const useTermsOfService = () =>
  useQuery({
    queryKey: configKeys.terms,
    queryFn: () => configApi.getTermsOfService().then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  });

export const useSystemConfig = () =>
  useQuery({
    queryKey: configKeys.system,
    queryFn: () => configApi.getSystemConfig().then((r) => r.data),
    staleTime: 30 * 60 * 1000,
  });

export const useCodeSnippets = () =>
  useQuery({
    queryKey: configKeys.snippets,
    queryFn: () => configApi.getCodeSnippets().then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  });

export const useUnreadCount = () =>
  useQuery({
    queryKey: messageKeys.unread,
    queryFn: () => messageApi.getUnreadCount().then((r) => r.data),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

export const useMessages = (
  page: number = 1,
  pageSize: number = 20,
  category?: string
) =>
  useQuery({
    queryKey: messageKeys.list(page, pageSize, category),
    queryFn: () =>
      messageApi.getMessages({ page, pageSize, category }).then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useMessage = (id: number) =>
  useQuery({
    queryKey: messageKeys.detail(id),
    queryFn: () => messageApi.getMessage(id).then((r) => r.data),
    enabled: !!id,
  });

export const useMarkAsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => messageApi.markAsRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messageKeys.all });
      qc.invalidateQueries({ queryKey: messageKeys.unread });
    },
  });
};

export const useMarkAllAsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => messageApi.markAllAsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messageKeys.all });
      qc.invalidateQueries({ queryKey: messageKeys.unread });
    },
  });
};

export const useDeleteMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => messageApi.deleteMessage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messageKeys.all });
      qc.invalidateQueries({ queryKey: messageKeys.unread });
    },
  });
};

export const useDimensions = () =>
  useQuery({
    queryKey: dimensionKeys.list,
    queryFn: () => analysisDimensionApi.getDimensions().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
