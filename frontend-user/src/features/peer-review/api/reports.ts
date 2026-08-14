/**
 * 审稿报告读取 hooks。
 *
 * 路由:
 *   GET /user/peer-review/submissions/:id/reports         拉全部 4 份(α/β/γ/chief)
 *   GET /user/peer-review/submissions/:id/reports/:role   按角色拉单份
 */

import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import type { ReviewReport, ReviewerRole } from '@/shared/lib/peer-review/types';
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
// terminal:投稿已进终态(如 failed)= 不会再产出报告 → 停止轮询,别再每 5s 空打后端(性能审计)。
// 正常完成路径仍靠 length>=4 停;terminal 覆盖「审稿失败但没凑齐 4 份」这种永不收敛的情况。
export function useSubmissionReports(id?: number, terminal?: boolean) {
  return useQuery({
    queryKey: KEY(id ?? 0),
    enabled: !!id,
    queryFn: async () => {
      const r = await http.get<{ data?: { items: ReviewReport[] } } & Partial<{ items: ReviewReport[] }>>(
        `/user/peer-review/submissions/${id}/reports`
      );
      return unwrap<{ items: ReviewReport[] }>(r.data).items;
    },
    // 2026-08-12 推送化:每份报告落库后后端广播 report_ready 帧,stream.ts 收帧 invalidate
    // 本查询 → 报告即时可见;5s 轮询降为 30s 兜底(SSE 断连时的收敛保证)。
    refetchInterval: (q) => {
      const items = q.state.data ?? [];
      return items.length < 4 && !terminal ? 30_000 : false;
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
