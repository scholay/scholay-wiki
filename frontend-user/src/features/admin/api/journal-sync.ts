import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 期刊全量摄取与发布(SEO 主动化)admin API。
 *
 * mirrors backend/internal/seoingest:
 *   - service.go   statusPayload / runPayload / upstreamPayload
 *   - model.go     JournalSyncRun
 *   - handler.go   StartSync / PauseSync / ResumeSync / CancelSync / Publish / Rollback / Batches
 *   + backend/internal/seo/repository_journal_ingest.go JournalIngestStats / JournalPublishBatch
 *
 * 路由 /api/v1/admin/seo/journal-*(config.manage 组,routes_admin.go)。
 * 错误 message 由后端下发(409「已有同步任务在进行中…」/ 400 参数校验),
 * 调用方经 useApiToast 原样展示,不在这里吞。
 */

export type JournalSyncRunStatus =
  | 'running'
  | 'paused'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface JournalSyncRun {
  id: number;
  /** full / incremental */
  kind: string;
  status: JournalSyncRunStatus;
  /** 上游 id 游标(断点续跑真源) */
  cursor_id: number;
  pages_done: number;
  rows_seen: number;
  rows_upserted: number;
  rows_skipped: number;
  errors: number;
  last_error?: string;
  upstream_total: number;
  upstream_built_at?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  /** 进度条分母 = ceil(upstream_total / page_size) */
  total_pages: number;
}

export interface JournalIngestCounts {
  total: number;
  staged: number;
  published: number;
  /** staged 中已达「发布资格」门槛的行数 */
  eligible_staged: number;
  /** key = value_tier("1"-"4"、"9"=未评),JSON 里 map[int] 序列化成字符串键 */
  tier_distribution: Record<string, number>;
}

export interface JournalSyncUpstream {
  total: number;
  last_built_at?: string;
}

export interface JournalSyncStatus {
  run: JournalSyncRun | null;
  counts: JournalIngestCounts | null;
  upstream: JournalSyncUpstream | null;
}

export interface JournalPublishBatch {
  batch: number;
  total: number;
  /** 0 = 已整批回滚 */
  published: number;
  published_at?: string;
}

export interface PublishJournalsResult {
  batch: number;
  published: number;
  requested: number;
  tier: number;
}

/** running 时 5s 盯进度,空闲 30s 兜底(admin 全局 refetchOnWindowFocus 是关的)。 */
const RUNNING_POLL_MS = 5_000;
const IDLE_POLL_MS = 30_000;

const SYNC_KEY = ['admin', 'journal-sync'] as const;

export function useJournalSyncStatus() {
  return useQuery({
    queryKey: [...SYNC_KEY, 'status'] as const,
    queryFn: async () => {
      const r = await http.get<{ data: JournalSyncStatus }>(
        '/admin/seo/journal-sync/status',
      );
      return r.data.data;
    },
    refetchInterval: (query) =>
      query.state.data?.run?.status === 'running'
        ? RUNNING_POLL_MS
        : IDLE_POLL_MS,
  });
}

export function useJournalBatches() {
  return useQuery({
    queryKey: [...SYNC_KEY, 'batches'] as const,
    queryFn: async () => {
      const r = await http.get<{ data: { batches: JournalPublishBatch[] } }>(
        '/admin/seo/journal-batches',
      );
      return r.data.data.batches ?? [];
    },
  });
}

/** 同步控制 4 个动作共用的失效逻辑 —— 动作一发生立即刷状态,不等下个轮询周期。 */
function useSyncMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: SYNC_KEY }),
  });
}

export function useStartJournalSync() {
  return useSyncMutation(async () => {
    const r = await http.post<{
      data: { run_id: number; kind: string; status: JournalSyncRunStatus };
    }>('/admin/seo/journal-sync/start', { kind: 'full' });
    return r.data.data;
  });
}

export function usePauseJournalSync() {
  return useSyncMutation(async () => {
    const r = await http.post<{
      data: { run_id: number; status: JournalSyncRunStatus };
    }>('/admin/seo/journal-sync/pause', {});
    return r.data.data;
  });
}

export function useResumeJournalSync() {
  return useSyncMutation(async () => {
    const r = await http.post<{
      data: { run_id: number; status: JournalSyncRunStatus; from_page: number };
    }>('/admin/seo/journal-sync/resume', {});
    return r.data.data;
  });
}

export function useCancelJournalSync() {
  return useSyncMutation(async () => {
    const r = await http.post<{
      data: { run_id: number; status: JournalSyncRunStatus };
    }>('/admin/seo/journal-sync/cancel', {});
    return r.data.data;
  });
}

export function usePublishJournals() {
  return useSyncMutation(async (vars: { count: number; tier: number }) => {
    const r = await http.post<{ data: PublishJournalsResult }>(
      '/admin/seo/journal-publish',
      vars,
    );
    return r.data.data;
  });
}

export function useRollbackJournalBatch() {
  return useSyncMutation(async (vars: { batch: number }) => {
    const r = await http.post<{ data: { batch: number; rolled_back: number } }>(
      '/admin/seo/journal-rollback',
      vars,
    );
    return r.data.data;
  });
}
