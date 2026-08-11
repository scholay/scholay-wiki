import { useState } from 'react';
import { Loader2, Pause, Play, Square, UploadCloud } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { useApiToast } from '@/shared/hooks';
import { useConfirm } from '@/shared/components';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { TimeCell } from '../components/TimeCell';
import {
  useCancelJournalSync,
  useJournalBatches,
  useJournalSyncStatus,
  usePauseJournalSync,
  usePublishJournals,
  useResumeJournalSync,
  useRollbackJournalBatch,
  useStartJournalSync,
  type JournalPublishBatch,
  type JournalSyncRun,
  type JournalSyncRunStatus,
  type PublishJournalsResult,
} from '../api/journal-sync';

/**
 * JournalSyncPage — 期刊全量摄取与发布(SEO 主动化,backend/internal/seoingest)。
 *
 * 四块:①状态卡(上游/本地/tier 分布) ②同步控制(全量 run 的 start/pause/resume/cancel
 * + 进度条) ③发布控制(数量+tier → 分批发布,返回批号) ④批次历史(整批回滚)。
 * 轮询:status hook 内置 running 5s / 空闲 30s(见 api/journal-sync.ts)。
 * 全部危险动作(启动烧上游配额、取消、回滚)走全局 useConfirm。
 */

const RUN_STATUS_META: Record<
  JournalSyncRunStatus,
  { label: string; variant: 'success' | 'warning' | 'default' | 'destructive' | 'muted' }
> = {
  running: { label: '同步中', variant: 'success' },
  paused: { label: '已暂停', variant: 'warning' },
  done: { label: '已完成', variant: 'default' },
  failed: { label: '失败', variant: 'destructive' },
  cancelled: { label: '已取消', variant: 'muted' },
};

/** value_tier → 面板短标签(计算规则见 seoingest:1=JCR/中科院/新锐分区刊 …)。 */
const TIER_LABELS: Array<{ key: string; label: string }> = [
  { key: '1', label: 'T1 分区刊' },
  { key: '2', label: 'T2 SCImago·CCF' },
  { key: '3', label: 'T3 DOAJ·OA' },
  { key: '4', label: 'T4 仅 OpenAlex' },
  { key: '9', label: '未评' },
];

const num = (n?: number | null) => (n == null ? '—' : n.toLocaleString());

export function JournalSyncPage() {
  const statusQ = useJournalSyncStatus();
  const batchesQ = useJournalBatches();

  const status = statusQ.data;
  const run = status?.run ?? null;
  const counts = status?.counts ?? null;
  const upstream = status?.upstream ?? null;

  return (
    <AdminPageLayout
      title="期刊数据同步"
      description={
        statusQ.isError
          ? '状态加载失败 · 请刷新重试'
          : '上游全量摄取(staged)→ 按 tier 分批发布(published)→ 可整批回滚 · 同步中每 5 秒自动刷新'
      }
      onRefresh={() => {
        void statusQ.refetch();
        void batchesQ.refetch();
      }}
      refreshing={statusQ.isFetching || batchesQ.isFetching}
    >
      <div className="space-y-4 max-w-5xl">
        {/* ── ① 状态卡组 ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="上游总量"
            value={num(upstream?.total)}
            sub={
              upstream?.last_built_at ? (
                <>
                  构建于 <TimeCell value={upstream.last_built_at} />
                </>
              ) : (
                '上游构建时间未知'
              )
            }
          />
          <StatCard
            label="本地收录"
            value={num(counts?.total)}
            sub={`staged ${num(counts?.staged)}`}
          />
          <StatCard
            label="已发布"
            value={num(counts?.published)}
            sub="进 sitemap / 可被索引"
          />
          <StatCard
            label="资格达标(staged)"
            value={num(counts?.eligible_staged)}
            sub="满足发布门槛、待发布"
          />
        </div>

        {/* tier 分布 —— 发布按 tier 升序放行,这里是「还能发多少」的弹药面板 */}
        <div className="rounded-12 border border-border bg-surface-card px-4 py-3">
          <h3 className="text-12 font-medium uppercase text-faint">
            价值分层分布(value_tier)
          </h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-12">
            {TIER_LABELS.map(({ key, label }) => (
              <span key={key} className="inline-flex items-baseline gap-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-foreground tabular-nums">
                  {num(counts?.tier_distribution?.[key] ?? 0)}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* ── ② 同步控制 ─────────────────────────────────────────── */}
        <SyncControlCard
          run={run}
          upstreamTotal={upstream?.total ?? 0}
          loading={statusQ.isLoading}
        />

        {/* ── ③ 发布控制 ─────────────────────────────────────────── */}
        <PublishCard eligibleStaged={counts?.eligible_staged ?? 0} />

        {/* ── ④ 批次历史 ─────────────────────────────────────────── */}
        <BatchesSection batchesQ={batchesQ} />
      </div>
    </AdminPageLayout>
  );
}

// ============================================================================

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-12 border border-border bg-surface-card px-4 py-3">
      <span className="text-12 text-muted-foreground">{label}</span>
      <span className="text-20 font-medium text-foreground tabular-nums leading-none">
        {value}
      </span>
      {sub && <span className="text-12 text-faint">{sub}</span>}
    </div>
  );
}

function SyncControlCard({
  run,
  upstreamTotal,
  loading,
}: {
  run: JournalSyncRun | null;
  upstreamTotal: number;
  loading: boolean;
}) {
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const start = useStartJournalSync();
  const pause = usePauseJournalSync();
  const resume = useResumeJournalSync();
  const cancel = useCancelJournalSync();

  const active = run?.status === 'running' || run?.status === 'paused';
  const acting =
    start.isPending || pause.isPending || resume.isPending || cancel.isPending;

  const handleStart = async () => {
    const ok = await confirm({
      title: '启动全量同步?',
      description: `将按上游 id 游标全量拉取${
        upstreamTotal > 0 ? `约 ${upstreamTotal.toLocaleString()} 刊` : '全部期刊'
      }(限速 1 次/1.2 秒,约 70 分钟,消耗上游调用配额)。期间可随时暂停 / 取消,新行一律进 staged,不会直接发布。`,
      confirmText: '开始同步',
    });
    if (!ok) return;
    // 409(已有任务在跑)等由 apiToast 展示后端 message
    await apiToast(start.mutateAsync(undefined), {
      success: '全量同步已启动',
      failure: '启动同步失败',
    });
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: '取消当前同步?',
      description:
        '本条 run 将标记为已取消,已入库的数据保留;之后需重新「全量同步」开新 run。若只是临时让路,请用「暂停」。',
      danger: true,
      confirmText: '取消同步',
    });
    if (!ok) return;
    await apiToast(cancel.mutateAsync(undefined), {
      success: '同步已取消',
      failure: '取消失败',
    });
  };

  const progressPct =
    run && run.total_pages > 0
      ? Math.min(100, Math.round((run.pages_done / run.total_pages) * 100))
      : 0;

  return (
    <section className="rounded-12 border border-border bg-surface-card p-4 space-y-3">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-14 font-medium text-foreground">同步控制</h2>
          <p className="text-12 text-faint">
            full 模式按上游 id 游标断点续跑;新行全部进 staged(不进
            sitemap、SSR noindex),发布另走下方闸门。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run?.status === 'running' && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={acting}
                onClick={() =>
                  void apiToast(pause.mutateAsync(undefined), {
                    success: '已暂停,可随时继续',
                    failure: '暂停失败',
                  })
                }
              >
                <Pause className="size-3" />
                暂停
              </Button>
              <Button variant="destructive" size="sm" disabled={acting} onClick={handleCancel}>
                <Square className="size-3" />
                取消
              </Button>
            </>
          )}
          {run?.status === 'paused' && (
            <>
              <Button
                size="sm"
                disabled={acting}
                onClick={() =>
                  void apiToast(resume.mutateAsync(undefined), {
                    success: '已从断点继续',
                    failure: '续跑失败',
                  })
                }
              >
                <Play className="size-3" />
                继续
              </Button>
              <Button variant="destructive" size="sm" disabled={acting} onClick={handleCancel}>
                <Square className="size-3" />
                取消
              </Button>
            </>
          )}
          {!active && (
            <Button size="sm" disabled={acting || loading} onClick={handleStart}>
              {start.isPending && <Loader2 className="size-3 animate-spin" />}
              全量同步
            </Button>
          )}
        </div>
      </header>

      {run && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-12">
            <Badge variant={RUN_STATUS_META[run.status]?.variant ?? 'muted'}>
              {RUN_STATUS_META[run.status]?.label ?? run.status}
            </Badge>
            <span className="text-faint">
              run #{run.id} · {run.kind}
              {run.started_at && (
                <>
                  {' '}
                  · 开始 <TimeCell value={run.started_at} />
                </>
              )}
              {run.finished_at && (
                <>
                  {' '}
                  · 结束 <TimeCell value={run.finished_at} />
                </>
              )}
            </span>
          </div>

          {active && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-12 text-muted-foreground tabular-nums">
                <span>
                  {run.pages_done.toLocaleString()} /{' '}
                  {run.total_pages > 0 ? run.total_pages.toLocaleString() : '?'} 页
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded-pill bg-brand-green transition-all"
                  style={{ width: `${Math.max(progressPct, 1)}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-12 text-muted-foreground tabular-nums">
            <span>已读 {run.rows_seen.toLocaleString()}</span>
            <span>入库 {run.rows_upserted.toLocaleString()}</span>
            <span>跳过 {run.rows_skipped.toLocaleString()}</span>
            <span className={run.errors > 0 ? 'text-brand-red' : undefined}>
              错误 {run.errors.toLocaleString()}
            </span>
          </div>

          {run.last_error && (
            <p className="text-12 text-brand-red break-all">
              最近错误:{run.last_error}
            </p>
          )}
        </div>
      )}

      {!run && !loading && (
        <p className="text-12 text-faint">还没有同步记录 —— 点「全量同步」发起第一次摄取。</p>
      )}
    </section>
  );
}

// ============================================================================

/** 发布 tier 过滤选项 —— 0 = 不过滤(按 value_tier 升序自然放行),与后端 0-9 校验对齐。 */
const PUBLISH_TIER_OPTIONS = [
  { value: 1, label: '仅 T1(JCR/中科院/新锐分区刊)' },
  { value: 2, label: '仅 T2(SCImago / CCF)' },
  { value: 3, label: '仅 T3(DOAJ / OA)' },
  { value: 4, label: '仅 T4(仅 OpenAlex)' },
  { value: 0, label: '不限 tier(升序放行)' },
] as const;

function PublishCard({ eligibleStaged }: { eligibleStaged: number }) {
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const publish = usePublishJournals();
  const [count, setCount] = useState<number>(2000);
  const [tier, setTier] = useState<number>(1);
  const [lastResult, setLastResult] = useState<PublishJournalsResult | null>(null);

  const countValid = Number.isFinite(count) && count > 0 && count <= 50000;

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!countValid || publish.isPending) return;
    const tierLabel =
      PUBLISH_TIER_OPTIONS.find((o) => o.value === tier)?.label ?? String(tier);
    const ok = await confirm({
      title: `发布 ${count.toLocaleString()} 刊?`,
      description: `${tierLabel} · 按资格门槛取 staged 行置为 published,进入 sitemap 并推送 IndexNow / 百度。可按批次整批回滚。`,
      confirmText: '发布',
    });
    if (!ok) return;
    const result = await apiToast(publish.mutateAsync({ count, tier }), {
      success: '发布完成,批号见下方结果行',
      failure: '发布失败',
    });
    if (result) setLastResult(result);
  };

  return (
    <section className="rounded-12 border border-border bg-surface-card p-4 space-y-3">
      <header className="space-y-1">
        <h2 className="text-14 font-medium text-foreground">发布控制</h2>
        <p className="text-12 text-faint">
          当前资格达标待发布 {eligibleStaged.toLocaleString()} 刊。建议节奏:首批
          2,000(tier 1)观察 5-7 天 → 10,000 → 每周 50,000;单批上限 50,000。
        </p>
      </header>

      <form onSubmit={handlePublish} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 w-32">
          <Label htmlFor="publish-count">数量</Label>
          <Input
            id="publish-count"
            type="number"
            min={1}
            max={50000}
            value={Number.isFinite(count) ? count : ''}
            onChange={(e) =>
              setCount(e.target.value === '' ? Number.NaN : Number(e.target.value))
            }
          />
        </div>
        <div className="space-y-1 w-64">
          <Label htmlFor="publish-tier">价值分层</Label>
          <Select
            id="publish-tier"
            value={tier}
            onChange={(e) => setTier(Number(e.target.value))}
          >
            {PUBLISH_TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={!countValid || publish.isPending}>
          {publish.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <UploadCloud className="size-3" />
          )}
          发布
        </Button>
      </form>

      {lastResult && (
        <p className="text-12 text-muted-foreground">
          最近发布:批次{' '}
          <span className="font-medium text-foreground tabular-nums">
            #{lastResult.batch}
          </span>{' '}
          · 实际发布{' '}
          <span className="font-medium text-foreground tabular-nums">
            {lastResult.published.toLocaleString()}
          </span>
          {' / 请求 '}
          <span className="tabular-nums">{lastResult.requested.toLocaleString()}</span> 刊
          {lastResult.published < lastResult.requested &&
            '(达标行不足,已按现有达标行发完)'}
        </p>
      )}
    </section>
  );
}

// ============================================================================

function BatchesSection({
  batchesQ,
}: {
  batchesQ: ReturnType<typeof useJournalBatches>;
}) {
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const rollback = useRollbackJournalBatch();

  const handleRollback = async (b: JournalPublishBatch) => {
    const ok = await confirm({
      title: `回滚批次 #${b.batch}?`,
      description: `将把该批次已发布的 ${b.published.toLocaleString()} 刊全部打回未发布(staged):退出 sitemap、SSR 输出 noindex、停止推送。`,
      danger: true,
      confirmText: '整批回滚',
    });
    if (!ok) return;
    await apiToast(rollback.mutateAsync({ batch: b.batch }), {
      success: `批次 #${b.batch} 已回滚`,
      failure: '回滚失败',
    });
  };

  const columns: Column<JournalPublishBatch>[] = [
    {
      header: '批次',
      width: 80,
      cell: (r) => (
        <span className="font-medium text-foreground tabular-nums">#{r.batch}</span>
      ),
    },
    {
      header: '期刊数',
      width: 100,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.total.toLocaleString()}</span>,
    },
    {
      header: '状态',
      width: 140,
      cell: (r) =>
        r.published > 0 ? (
          <span className="tabular-nums">
            已发布 {r.published.toLocaleString()}
            {r.published < r.total && ` / ${r.total.toLocaleString()}`}
          </span>
        ) : (
          <Badge variant="muted">已回滚</Badge>
        ),
    },
    {
      header: '发布时间',
      cell: (r) => <TimeCell value={r.published_at} absolute />,
    },
    {
      header: '',
      width: 90,
      align: 'right',
      cell: (r) =>
        r.published > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-brand-red"
            disabled={rollback.isPending}
            onClick={() => void handleRollback(r)}
          >
            回滚
          </Button>
        ) : null,
    },
  ];

  return (
    <section className="space-y-2">
      <h2 className="text-14 font-medium text-foreground">批次历史</h2>
      <DataTable
        columns={columns}
        rows={batchesQ.data}
        loading={batchesQ.isLoading}
        error={batchesQ.error}
        onRetry={() => void batchesQ.refetch()}
        rowKey={(r) => r.batch}
        emptyMessage="还没有发布批次"
        emptyDescription="用上方「发布控制」发出第一批后,这里会出现批次记录与回滚入口。"
      />
    </section>
  );
}
