// mirrors backend/internal/peerreview/admin.go
//   AdminPRListRow / AdminPRSubmission / AdminPRAsset / AdminPRReport / AdminPRDetail
// 改字段时两侧一起改。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { retryDetailQuery } from '@/shared/lib/query-config';

export interface PRSubmissionRow {
  id: number;
  userId: number;
  userEmail: string;
  username: string;
  mode: string;
  status: string;
  title: string;
  journalName: string;
  schoolName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PRListResponse {
  list: PRSubmissionRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PRSubmissionFull {
  id: number;
  userId: number;
  mode: string;
  status: string;
  step: number;
  title: string;
  abstract: string;
  journalName: string;
  journalMeta?: unknown;
  schoolName: string;
  degreeType: string;
  disciplineField: string;
  advisorName: string;
  letterBody: string;
  extraMeta?: unknown;
  computeState: string;
  computeError: string;
  failedReason: string;
  agentSessionId: string;
  agreedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PRAsset {
  id: number;
  role: string;
  category: string;
  filename: string;
  size: number;
  mime: string;
  textChars: number | null;
  textExcerpt: string;
  createdAt: string;
}

export interface PRReport {
  id: number;
  role: string;
  decision: string;
  scores?: unknown;
  contentMd: string;
  score: number | null;
  recommendation: string;
  expertise: string;
  reviewerSkillId: number | null;
  dimensions?: unknown;
  lineComments?: unknown;
  macroComments?: unknown;
  finalSummaryMd: string;
  rulingSummaryMd: string;
  rulingParagraphMd: string;
  reviewerResponses?: unknown;
  mustFix?: unknown;
  suggestions?: unknown;
  deadlineDays: number | null;
  summaryForAuthor: string;
  agentDurationSec: number | null;
  agentTokensIn: number | null;
  agentTokensOut: number | null;
  createdAt: string;
}

export interface PRSubmissionDetail {
  submission: PRSubmissionFull;
  assets: PRAsset[];
  reports: PRReport[];
}

export interface PRListParams {
  keyword?: string;
  userId?: number;
  page?: number;
  pageSize?: number;
}

/** 列投稿(管理端审稿监控)。 */
export function usePRSubmissions(params: PRListParams) {
  return useQuery({
    queryKey: ['admin', 'pr-monitor', 'list', params],
    queryFn: async () => {
      // 线上分页参数统一 page_size(与其余 ~16 个列表端点一致,架构报告 M3)。本地 TS 字段保留
      // pageSize 不动组件,只在出网这一处映射。后端已同时认 page_size / pageSize,过渡零中断。
      const { pageSize, ...rest } = params;
      const wire = { ...rest, ...(pageSize !== undefined ? { page_size: pageSize } : {}) };
      return (await http.get<{ data: PRListResponse }>('/admin/peer-review/submissions', { params: wire }))
        .data.data;
    },
  });
}

/**
 * 一份投稿的完整数据(草稿过程 + 审稿报告 + 附件)。
 *
 * `retry: retryDetailQuery` —— 4xx 不重试,失败态秒出。详情弹窗的三分支渲染依赖它:
 * 默认重试会让「加载中…」多挂一个来回,而这里的失败恰恰长得像"慢"(见 PeerReviewMonitor)。
 */
export function usePRSubmissionDetail(id: number | null) {
  return useQuery({
    queryKey: ['admin', 'pr-monitor', 'detail', id],
    enabled: !!id,
    retry: retryDetailQuery,
    queryFn: async () =>
      (await http.get<{ data: PRSubmissionDetail }>(`/admin/peer-review/submissions/${id}`)).data.data,
  });
}
