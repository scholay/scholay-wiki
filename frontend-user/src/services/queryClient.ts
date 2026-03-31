import { QueryClient } from '@tanstack/react-query';
import { useToastStore } from '../stores/toast.store';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error: any) => {
        const message =
          error?.response?.data?.message || error?.message || '操作失败，请重试';
        useToastStore.getState().addToast('error', message);
      },
    },
  },
});
