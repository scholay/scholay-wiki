/**
 * 审稿报告读取 hooks。
 *
 * 路由:
 *   GET /user/peer-review/submissions/:id/reports         拉全部 4 份(α/β/γ/chief)
 *   GET /user/peer-review/submissions/:id/reports/:role   按角色拉单份
 */

import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import type { ReviewReport, ReviewerRole } from '../types';
import { unwrap } from './_unwrap';

const KEY = (...rest: (string | number)[]) =>
  ['peer-review', 'reports', ...rest] as const;

/**
 * 拉 4 份报告。后端从 0 跑到 4 大约 3-5 分钟,每轮跑完一份就 INSERT 一行,
 * 所以前端只要在没齐 4 份时 5 秒轮一次就能慢慢看到报告陆续到位。
 *
 * 不依赖 submission.status / computeState 来判停 — 一旦本地拿到 4 份就停,
 * 自然兼容"agent 还在跑 / 已经完成 / 历史回看"三种状态。
 */
export function useSubmissionReports(id?: number) {
  return useQuery({
    queryKey: KEY(id ?? 0),
    enabled: !!id,
    queryFn: async () => {
      const r = await http.get<{ data?: { items: ReviewReport[] } } & Partial<{ items: ReviewReport[] }>>(
        `/user/peer-review/submissions/${id}/reports`
      );
      return unwrap<{ items: ReviewReport[] }>(r.data).items;
    },
    refetchInterval: (q) => {
      const items = q.state.data ?? [];
      return items.length < 4 ? 5000 : false;
    },
  });
}

export function useReportByRole(id?: number, role?: ReviewerRole) {
  return useQuery({
    queryKey: KEY(id ?? 0, role ?? 'none'),
    enabled: !!id && !!role,
    queryFn: async () => {
      const r = await http.get<{ data?: ReviewReport } & Partial<ReviewReport>>(
        `/user/peer-review/submissions/${id}/reports/${role}`
      );
      return unwrap<ReviewReport>(r.data);
    },
  });
}
