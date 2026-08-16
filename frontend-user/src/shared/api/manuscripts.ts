import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 稿件 / 稿件集共享资源层 —— 智能写作(Prism)与智能审稿(Peer Review)之上的
 * 统一身份与编排层,支撑「写 → 审 → 改」循环:
 *
 *   - Manuscript(稿件):跨 feature 统一身份。origin=prism 时 1:1 挂一个写作项目
 *     (可写可审可循环);origin=upload 是审稿页直接上传的稿,只有审的路(非对称能力)。
 *   - ManuscriptVersion(版本快照):送审的铆点,每一轮审稿钉死在一个版本上。
 *   - ReviewRound(审稿轮):把某个版本与一个审稿工单(Submission)1:1 绑定;
 *     status/decision 由服务端从工单实时推导,前端不需要自己对齐两边状态。
 *
 * queryKey 约定:['manuscripts', ...]。
 */

export type ManuscriptOrigin = 'prism' | 'upload';
export type ManuscriptStage = 'writing' | 'in_review' | 'decided';
export type ReviewRoundStatus = 'draft' | 'in_review' | 'completed' | 'failed';

export interface ManuscriptCollection {
  id: string;
  name: string;
  description?: string;
  kind: 'writing' | 'review' | 'custom';
  isDefault?: boolean;
  itemCount: number;
}

export interface Manuscript {
  id: number;
  collectionId: string;
  title: string;
  origin: ManuscriptOrigin;
  /** origin=prism 时 1:1 指向写作项目 */
  prismProjectId?: number;
  stage: ManuscriptStage;
  /** 最近一个已完成审稿轮的决议(小修 / 大修 / 拒稿) */
  latestDecision?: string;
  versionCount: number;
  roundCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ManuscriptVersion {
  id: number;
  versionNo: number;
  source: 'prism-snapshot' | 'upload';
  label: string;
  summary?: string;
  createdAt: string;
}

export interface ReviewRound {
  id: number;
  roundNo: number;
  versionNo: number;
  submissionId: number;
  submissionMode: 'journal' | 'thesis';
  status: ReviewRoundStatus;
  decision?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ManuscriptDetail {
  manuscript: Manuscript;
  versions: ManuscriptVersion[];
  rounds: ReviewRound[];
}

const KEY = (...rest: (string | number)[]) => ['manuscripts', ...rest] as const;

// ─── 查询 ──────────────────────────────────────────────────────────────────

export function useManuscriptCollections(enabled = true) {
  return useQuery({
    queryKey: KEY('collections'),
    enabled,
    queryFn: async () =>
      (
        await http.get<{ data: { items: ManuscriptCollection[] } }>(
          '/user/manuscript-collections',
        )
      ).data.data.items,
  });
}

export function useManuscripts(collectionId?: string) {
  return useQuery({
    queryKey: KEY('list', collectionId ?? ''),
    enabled: !!collectionId,
    queryFn: async () =>
      (
        await http.get<{ data: { items: Manuscript[] } }>('/user/manuscripts', {
          params: { collection: collectionId },
        })
      ).data.data.items,
  });
}

export function useManuscript(id?: number) {
  return useQuery({
    queryKey: KEY('detail', id ?? 0),
    enabled: !!id,
    queryFn: async () =>
      (
        await http.get<{ data: ManuscriptDetail }>(`/user/manuscripts/${id}`)
      ).data.data,
  });
}

/** Prism 工作区反查:该写作项目对应的稿件身份(无 → null,老项目可能没登记)。 */
export function useManuscriptByProject(projectId?: number) {
  return useQuery({
    queryKey: KEY('by-project', projectId ?? 0),
    enabled: !!projectId,
    queryFn: async () => {
      const items = (
        await http.get<{ data: { items: Manuscript[] } }>('/user/manuscripts', {
          params: { project: projectId },
        })
      ).data.data.items;
      return items[0] ?? null;
    },
  });
}

/** 审稿报告页反查:该审稿工单绑定的稿件身份(prism 源稿才有「回到写作修改」)。 */
export function useManuscriptBySubmission(submissionId?: number) {
  return useQuery({
    queryKey: KEY('by-submission', submissionId ?? 0),
    enabled: !!submissionId,
    queryFn: async () => {
      const items = (
        await http.get<{ data: { items: Manuscript[] } }>('/user/manuscripts', {
          params: { submission: submissionId },
        })
      ).data.data.items;
      return items[0] ?? null;
    },
  });
}

// ─── 变更 ──────────────────────────────────────────────────────────────────

/** 落版本快照(送审铆点)。prism 稿 = 快照当前 struct;upload 稿 = 记一版上传稿。 */
export function useCreateManuscriptVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      manuscriptId: number;
      label?: string;
      summary?: string;
    }) =>
      (
        await http.post<{ data: { version: ManuscriptVersion } }>(
          `/user/manuscripts/${vars.manuscriptId}/versions`,
          { label: vars.label, summary: vars.summary },
        )
      ).data.data.version,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY() }),
  });
}

/**
 * 建审稿轮:把某个版本送进智能审稿。服务端自动建一条 draft 审稿工单
 * (稿件资产已附带,wizard 直落 step 2 跳过上传步),返回 submissionId 供跳转。
 */
export function useCreateReviewRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { manuscriptId: number; versionNo?: number }) =>
      (
        await http.post<{
          data: { round: ReviewRound; submissionId: number };
        }>(`/user/manuscripts/${vars.manuscriptId}/review-rounds`, {
          versionNo: vars.versionNo,
        })
      ).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY() });
      // 新建了审稿工单 → 审稿侧列表 / 入口探活也要看到
      qc.invalidateQueries({ queryKey: ['peer-review', 'submissions'] });
    },
  });
}

/** 移动稿件到另一个稿件集。 */
export function useMoveManuscript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { manuscriptId: number; collectionId: string }) =>
      (
        await http.patch<{ data: { manuscript: Manuscript } }>(
          `/user/manuscripts/${vars.manuscriptId}`,
          { collectionId: vars.collectionId },
        )
      ).data.data.manuscript,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY() }),
  });
}
