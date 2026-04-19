/**
 * React Query hooks for User data.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI } from '../../services/user.api';
import { useAuthStore } from '../../stores/auth.store';

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------
export const userKeys = {
  all: ['user'] as const,
  profile: () => [...userKeys.all, 'profile'] as const,
  taskHistory: (days?: number) => [...userKeys.all, 'taskHistory', days] as const,
  latexDocuments: () => [...userKeys.all, 'latexDocuments'] as const,
  latexDocument: (id: number | string) =>
    [...userKeys.latexDocuments(), id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function useProfile(options?: { enabled?: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: userKeys.profile(),
    queryFn: () => userAPI.getProfile().then((r: any) => r.data?.data),
    enabled: isAuthenticated && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTaskHistory(days = 3, limitPerDay = 20) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: userKeys.taskHistory(days),
    queryFn: () =>
      userAPI.getTaskHistory(days, limitPerDay).then((r: any) => r.data?.data),
    enabled: isAuthenticated,
  });
}

export function useLatexDocuments(tree = false) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: userKeys.latexDocuments(),
    queryFn: () =>
      userAPI.getLatexDocuments(tree).then((r: any) => r.data?.data),
    enabled: isAuthenticated,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, avatarURL }: { username: string; avatarURL: string }) =>
      userAPI.updateProfile(username, avatarURL).then((r: any) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.profile() });
    },
  });
}
