import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import type { MySkill } from '@/shared/api/skills';

/**
 * 管理端 Skills 审核 —— 对接 /api/v1/admin/skills*。
 * mirrors backend/internal/skillmarket/{model.go,handler.go} 的 admin 接口。
 * queryKey:['admin','skills',status] 审核队列;['admin','skills','reports',status] 举报。
 */

export interface AdminSkillReport {
  id: number;
  skillId: number;
  versionId?: number | null;
  reporterUserId: number;
  reason: string;
  detail: string;
  status: string;
  handledBy?: number | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export function useAdminSkills(status: string) {
  return useQuery({
    queryKey: ['admin', 'skills', status],
    queryFn: async (): Promise<MySkill[]> => {
      const { data } = await http.get<{ data: { list: MySkill[] } }>(
        '/admin/skills',
        { params: status ? { status } : {} }
      );
      return data.data.list ?? [];
    },
  });
}

export function useAdminSkillReports(status: string) {
  return useQuery({
    queryKey: ['admin', 'skills', 'reports', status],
    queryFn: async (): Promise<AdminSkillReport[]> => {
      const { data } = await http.get<{ data: { list: AdminSkillReport[] } }>(
        '/admin/skills/reports',
        { params: status ? { status } : {} }
      );
      return data.data.list ?? [];
    },
  });
}

function useSkillAction(
  path: (id: number) => string,
  body?: (arg: { id: number; note?: string }) => unknown
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arg: { id: number; note?: string }) => {
      try {
        await http.post(path(arg.id), body ? body(arg) : undefined);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'skills'] }),
  });
}

export function useApproveSkill() {
  return useSkillAction((id) => `/admin/skills/${id}/approve`);
}
export function useRejectSkill() {
  return useSkillAction(
    (id) => `/admin/skills/${id}/reject`,
    (a) => ({ note: a.note ?? '' })
  );
}
export function useTakedownSkill() {
  return useSkillAction(
    (id) => `/admin/skills/${id}/takedown`,
    (a) => ({ note: a.note ?? '' })
  );
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arg: { id: number; action: 'actioned' | 'dismissed' }) => {
      try {
        await http.post(`/admin/skills/reports/${arg.id}/resolve`, undefined, {
          params: { action: arg.action },
        });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin', 'skills', 'reports'] }),
  });
}
