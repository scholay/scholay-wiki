import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookText, ChevronLeft, ChevronRight, GraduationCap, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadingState } from '@/shared/components/LoadingState';
import { useConfirm } from '@/shared/components/ConfirmDialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';
import { cn } from '@/shared/lib/utils';
import { useDeleteSubmission, useSubmissionList } from '../api/submissions';
import { recBadgeClasses, recLabel } from '../lib/recommendation';
import type { SubmissionListItem, SubmissionStatus } from '../types';

const PAGE_SIZE = 20;

/**
 * 工单总览(.pen `bT0Dp`) —— 设计稿对照实现:
 *
 *   ┌─ pageHeader      "所有审稿" + 右上 "新建投稿" 红按钮
 *   ├─ filterBar       全部 / 待处理 / 进行中 / 已完成  下划线 tab
 *   └─ tableCard       7 列表格 (工单号 / 标题 / 期刊 / 日期 / 进度 / 结果 / 操作)
 *
 * 状态映射:
 *   待处理 = draft
 *   进行中 = queued / reviewing / failed
 *   已完成 = completed
 *
 * 操作列:
 *   draft     → "继续投稿"   跳转到 wizard 的 step
 *   reviewing → "查看进度"   跳详情页
 *   completed → "查看评议"   跳详情页
 *   failed    → "重试 / 查看"   跳详情页
 */

type TabKey = 'all' | 'pending' | 'inflight' | 'done';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '草稿' },
  { key: 'inflight', label: '进行中' },
  { key: 'done', label: '已完成' },
];

function statusBucket(s: SubmissionStatus): TabKey {
  if (s === 'draft') return 'pending';
  if (s === 'completed') return 'done';
  return 'inflight';
}

export function RecordsPage() {
  const { data, isLoading, error } = useSubmissionList();
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const deleteMut = useDeleteSubmission();
  const confirm = useConfirm();

  async function deleteOne(item: SubmissionListItem) {
    const isDraft = item.status === 'draft';
    const ok = await confirm({
      title: isDraft ? '取消这份草稿?' : '删除这份审稿记录?',
      description: isDraft
        ? '草稿、已上传的文件、AI 已识别的内容都会一起删除,无法恢复。'
        : '审稿报告、投稿信、上传的文件都会一起删除,无法恢复。建议先查看后再删。',
      confirmText: isDraft ? '取消草稿' : '永久删除',
      danger: true,
    });
    if (!ok) return;
    deleteMut.mutate(item.id, {
      onSuccess: () => toast.success(isDraft ? '已取消' : '已删除'),
      onError: (e) => toast.error(`删除失败:${(e as Error).message}`),
    });
  }

  const items = data ?? [];
  const filtered = useMemo(
    () => (tab === 'all' ? items : items.filter((it) => statusBucket(it.status) === tab)),
    [items, tab]
  );

  const counts: Record<TabKey, number> = useMemo(
    () => ({
      all: items.length,
      pending: items.filter((it) => statusBucket(it.status) === 'pending').length,
      inflight: items.filter((it) => statusBucket(it.status) === 'inflight').length,
      done: items.filter((it) => statusBucket(it.status) === 'done').length,
    }),
    [items]
  );

  // 分页:一页 20 条, 客户端切片 (列表整份已加载)。切 tab 时回到第 1 页。
  useEffect(() => setPage(1), [tab]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE),
    [filtered, pageClamped]
  );

  if (isLoading) return <LoadingState />;
  if (error) {
    return (
      <EmptyState
        title="加载失败"
        description="请稍后重试,或刷新页面。"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      {/* 顶部头 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-8">
        <h1 className="text-xl font-bold text-foreground">我的审稿</h1>
        <HoverCard openDelay={60} closeDelay={150}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-8 bg-brand-red px-4 text-xs font-bold text-background hover:bg-brand-red/90"
            >
              <Plus className="size-3.5" />
              新建审稿
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="end" sideOffset={8} className="w-56 p-1.5">
            <div className="flex flex-col gap-1">
              <Link
                to="/peer-review/journal"
                className="flex items-center gap-2.5 rounded-8 px-3 py-2 transition hover:bg-surface-2"
              >
                <BookText className="size-4 shrink-0 text-brand-red" />
                <span className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">期刊投稿</span>
                  <span className="text-2xs text-muted-foreground">投递学术期刊,三审 + 主审决议</span>
                </span>
              </Link>
              <Link
                to="/peer-review/thesis"
                className="flex items-center gap-2.5 rounded-8 px-3 py-2 transition hover:bg-surface-2"
              >
                <GraduationCap className="size-4 shrink-0 text-brand-red" />
                <span className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">毕业审稿</span>
                  <span className="text-2xs text-muted-foreground">毕业论文预审,按学位标准评议</span>
                </span>
              </Link>
            </div>
          </HoverCardContent>
        </HoverCard>
      </header>

      {/* tab 过滤栏 */}
      <nav className="flex h-11 shrink-0 items-center border-b border-border bg-background px-6">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex h-full items-center gap-1.5 border-b-2 px-4 text-sm transition',
                active
                  ? 'border-brand-red font-bold text-brand-red'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              <span
                className={cn(
                  'text-xs',
                  active ? 'text-brand-red' : 'text-faint'
                )}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 表格 */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {filtered.length === 0 ? (
          <EmptyState
            title={tab === 'all' ? '还没有审稿' : '这个状态下还没有'}
            description={
              tab === 'all'
                ? '点右上「+ 新建审稿」开始第一份。'
                : '切换到其它状态看看。'
            }
          />
        ) : (
          <div className="overflow-hidden rounded-12 border border-border bg-surface-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-1">
                <tr className="text-left text-xs text-faint">
                  <th className="px-4 py-3 font-normal">标题</th>
                  <th className="w-36 px-4 py-3 font-normal">投递目标</th>
                  <th className="w-28 px-4 py-3 font-normal">提交时间</th>
                  <th className="w-40 px-4 py-3 font-normal">审稿进度</th>
                  <th className="w-24 px-4 py-3 font-normal">决议</th>
                  <th className="w-32 px-4 py-3 text-right font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((it) => (
                  <RecordRow
                    key={it.id}
                    item={it}
                    onDelete={() => deleteOne(it)}
                    deleting={deleteMut.isPending && deleteMut.variables === it.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页:超过一页才显示 */}
        {filtered.length > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              共 {filtered.length} 条 · 第 {pageClamped} / {totalPages} 页
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pageClamped <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-7 items-center gap-0.5 rounded-8 border border-border bg-surface-card pl-1.5 pr-2.5 font-bold text-subtle transition hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" />
                上一页
              </button>
              <button
                type="button"
                disabled={pageClamped >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-7 items-center gap-0.5 rounded-8 border border-border bg-surface-card pl-2.5 pr-1.5 font-bold text-subtle transition hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecordRow({
  item,
  onDelete,
  deleting,
}: {
  item: SubmissionListItem;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <tr className="group border-b border-border-soft last:border-0 hover:bg-surface-1">
      <td className="px-4 py-4">
        <Link
          to={`/peer-review/records/${item.id}`}
          className="line-clamp-1 text-sm font-bold text-foreground hover:text-brand-red"
        >
          {item.title || '(未填标题)'}
        </Link>
        <p className="mt-1 text-2xs text-faint">
          {item.mode === 'journal' ? '期刊投稿' : '毕业审稿'}
        </p>
      </td>
      <td className="px-4 py-4 text-xs text-muted-foreground">
        {item.targetLabel ? (
          <span className="line-clamp-1">{item.targetLabel}</span>
        ) : item.status === 'draft' ? (
          <span className="text-faint">—</span>
        ) : (
          <span className="text-muted-foreground">通用 STM 模板</span>
        )}
      </td>
      <td className="px-4 py-4 text-xs text-muted-foreground">
        {item.submittedAt
          ? new Date(item.submittedAt).toLocaleDateString('zh-CN')
          : <span className="text-faint">—</span>}
      </td>
      <td className="px-4 py-4">
        <ProgressIndicator item={item} />
      </td>
      <td className="px-4 py-4">
        <ResultChip item={item} />
      </td>
      <td className="px-4 py-4 text-right">
        <div className="inline-flex items-center justify-end gap-1.5">
          <ActionButton item={item} />
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            title={item.status === 'draft' ? '取消并删除草稿' : '永久删除这份审稿'}
            aria-label={item.status === 'draft' ? '取消草稿' : '删除'}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-8 border border-border text-faint transition hover:border-destructive hover:bg-danger-soft hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── status 子组件 ────────────────────────────────────────────────────

function ProgressIndicator({ item }: { item: SubmissionListItem }) {
  if (item.status === 'draft') {
    return <span className="text-2xs text-faint">草稿中</span>;
  }
  if (item.status === 'completed') {
    return (
      <div className="flex items-center gap-2">
        <ProgressBar percent={100} color="bg-brand-green" />
        <span className="shrink-0 text-2xs text-muted-foreground">100%</span>
      </div>
    );
  }
  if (item.status === 'failed') {
    return (
      <div className="flex items-center gap-2">
        <ProgressBar percent={100} color="bg-destructive" />
        <span className="shrink-0 text-2xs text-destructive">失败</span>
      </div>
    );
  }
  // queued / reviewing - 估算进度(没有真实数据时用 50%)
  const percent = item.status === 'queued' ? 10 : 60;
  return (
    <div className="flex items-center gap-2">
      <ProgressBar percent={percent} color="bg-brand-amber" />
      <span className="shrink-0 text-2xs text-brand-amber">{percent}%</span>
    </div>
  );
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
      <div
        className={cn('h-full transition-all', color)}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function ResultChip({ item }: { item: SubmissionListItem }) {
  if (item.status === 'draft') return <span className="text-2xs text-faint">—</span>;
  if (item.status === 'queued' || item.status === 'reviewing') {
    return (
      <span className="rounded-pill bg-warning-soft px-2.5 py-0.5 text-2xs font-bold text-brand-amber">
        进行中
      </span>
    );
  }
  if (item.status === 'failed') {
    return (
      <span className="rounded-pill bg-danger-soft px-2.5 py-0.5 text-2xs font-bold text-destructive">
        失败
      </span>
    );
  }
  // completed
  if (!item.decision) {
    return (
      <span className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-2xs font-bold text-muted-foreground">
        已完成
      </span>
    );
  }
  // 3 档最终状态 (小修→(修改后)录用 / 大修→返修 / 拒稿), 兼容历史 录用/返修/英文 enum。
  return (
    <span className={cn('rounded-pill px-2.5 py-0.5 text-2xs font-bold', recBadgeClasses(item.decision))}>
      {recLabel(item.decision)}
    </span>
  );
}

function ActionButton({ item }: { item: SubmissionListItem }) {
  // draft: 继续投稿 -> 跳 wizard 对应的 step (路由 ?id=N 已经够,wizard 内部用 submission.step)
  if (item.status === 'draft') {
    const path = item.mode === 'thesis' ? '/peer-review/thesis' : '/peer-review/journal';
    return (
      <Link
        to={`${path}?id=${item.id}`}
        className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-8 border border-brand-red bg-surface-card px-3 text-2xs font-bold text-brand-red hover:bg-danger-soft"
      >
        继续投稿
      </Link>
    );
  }
  // 其它状态:统一跳详情页
  return (
    <Link
      to={`/peer-review/records/${item.id}`}
      className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-8 border border-border bg-surface-card px-3 text-2xs font-bold text-subtle hover:border-foreground hover:text-foreground"
    >
      {item.status === 'completed' ? '查看评议' : '查看进度'}
    </Link>
  );
}
