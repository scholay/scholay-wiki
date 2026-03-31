import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI } from '../../services/user.api';
import type { User } from '../../types/user';

export const userKeys = {
  all: ['user'] as const,
  profile: () => [...userKeys.all, 'profile'] as const,
  taskHistory: (days: number, limit: number) =>
    [...userKeys.all, 'taskHistory', { days, limit }] as const,
};

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: userKeys.profile(),
    queryFn: async (): Promise<User> => {
      const res = await userAPI.getProfile();
      if (res.data.code === 0 && res.data.data) return res.data.data;
      throw new Error(res.data.message || 'Failed to fetch profile');
    },
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, avatarURL }: { username: string; avatarURL: string }) =>
      userAPI.updateProfile(username, avatarURL),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.profile() });
    },
  });
}

export function useTaskHistory(days = 3, limitPerDay = 20) {
  return useQuery({
    queryKey: userKeys.taskHistory(days, limitPerDay),
    queryFn: async () => {
      const res = await userAPI.getTaskHistory(days, limitPerDay);
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.message);
    },
    staleTime: 60 * 1000,
  });
}
