import { useState } from 'react';
import { MessageSquare, Search, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { UserCell } from '../components/UserCell';
import { Pagination } from '../components/Pagination';
import { TimeCell, formatBackendTime } from '../components/TimeCell';
import { CopyableId } from '../components/CopyableId';
import { useApiToast } from '../hooks/useApiToast';
import { useUrlState, usePatchUrlState, useDebounce } from '@/shared/hooks';
import {
  useFeedbackDetail,
  useFeedbackList,
  useFeedbackStats,
  useReplyFeedback,
  useUpdateFeedbackStatus,
  type Feedback,
  type FeedbackStats,
  type FeedbackStatus,
} from '../api/feedback';

const STATUS_LABEL: Record<FeedbackStatus, { text: string; variant: 'default' | 'outline' | 'muted' | 'destructive' | 'success' }> = {
  pending: { text: '待处理', variant: 'destructive' },
  processed: { text: '处理中', variant: 'default' },
  replied: { text: '已回复', variant: 'success' },
  closed: { text: '已关闭', variant: 'muted' },
};

/** statKey 指向 /admin/feedbacks/stats 的对应计数 —— tab 上直接显示积压量 */
const STATUS_FILTERS: {
  value: FeedbackStatus | undefined;
  label: string;
  statKey: keyof Pick<FeedbackStats, 'total' | 'pending' | 'processed' | 'replied' | 'closed'>;
}[] = [
  { value: undefined, label: '全部', statKey: 'total' },
  { value: 'pending', label: '待处理', statKey: 'pending' },
  { value: 'processed', label: '处理中', statKey: 'processed' },
  { value: 'replied', label: '已回复', statKey: 'replied' },
  { value: 'closed', label: '已关闭', statKey: 'closed' },
];

const PAGE_SIZE = 20;

export function FeedbackPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [statusFilter] = useUrlState<FeedbackStatus | undefined>(
    'status',
    undefined,
    (raw) => (['pending', 'processed', 'replied', 'closed'].includes(raw) ? (raw as FeedbackStatus) : undefined)
  );
  /**
   * 🔴 status 与 page 要一起改,**必须走 patch 一次写完**。
   *
   * `setStatusFilter(x); setPage(1);` 是错的:react-router 的 setSearchParams 基于
   * 当前 render 闭包里的 searchParams 计算,同一事件里两次调用用的是同一份旧值,
   * 后一次 navigate 覆盖前一次 —— status 根本写不进 URL。表现是「点状态标签没反应」,
   * 以及「清除筛选」清不掉状态(运维看到空态、点清除、还是空态)。
   * (useUrlState.ts 顶部注释把这个失败模式写死了。)
   */
  const patchUrl = usePatchUrlState();
  const setStatusFilter = (v: FeedbackStatus | undefined) =>
    patchUrl({ status: v ?? null, page: null });
  const [replying, setReplying] = useState<Feedback | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);
  const hasFilter = !!statusFilter || !!search;

  const { data, isLoading, isFetching, error, refetch } = useFeedbackList({
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter,
    keyword: search || undefined,
  });
  const stats = useFeedbackStats();
  const reply = useReplyFeedback();
  const updateStatus = useUpdateFeedbackStatus();
  const apiToast = useApiToast();
  /** 处理对话框打开后再拉详情 (含附件), 列表本身轻量不带 attachments */
  const { data: detail } = useFeedbackDetail(replying?.id ?? null);

  const clearFilters = () => {
    setSearchInput('');
    setStatusFilter(undefined); // 内部走 patch,同时清掉 status 与 page
  };

  /**
   * 状态流转 —— 必须 await 完再关弹窗。
   * 改造前是 async 但调用处不 await 就 setReplying(null):弹窗先关、请求随后失败时
   * 界面上已经没有任何上下文,运维只看到一个红 toast 却不知道是哪一条工单。
   */
  const handleStatusChange = async (row: Feedback, status: FeedbackStatus, closeAfter = false) => {
    const ok = await apiToast(updateStatus.mutateAsync({ id: row.id, status }), {
      success: `已标记为${STATUS_LABEL[status].text}`,
      failure: '更新失败',
    });
    if (ok === null) return;
    // 弹窗内的按钮组按 replying.status 显隐,这里同步一份,免得刚点完还显示旧状态的按钮
    setReplying((cur) => (cur && cur.id === row.id ? { ...cur, status } : cur));
    if (closeAfter) setReplying(null);
  };

  const statusPending = (s: FeedbackStatus) =>
    updateStatus.isPending && updateStatus.variables?.status === s;

  const columns: Column<Feedback>[] = [
    {
      // 反馈单号 —— 用户在群里说「我那条反馈没人回」时,这是唯一可核对的凭据。
      // 改造前全页不可见:详情弹窗里的「ID」是 userId,不是反馈自身的 id。
      header: '单号',
      width: 92,
      cell: (r) => <CopyableId value={r.id} prefix="#" label="反馈单号" className="text-12" />,
    },
    {
      header: '用户',
      width: 180,
      cell: (r) => <UserCell id={r.userId ?? null} name={r.username} email={r.email} anonymousLabel="未登录用户" />,
    },
    {
      header: '分类',
      width: 110,
      cell: (r) => <Badge variant="muted">{r.category || '其他'}</Badge>,
    },
    {
      header: '内容',
      cell: (r) => <span className="text-12 text-subtle line-clamp-2">{r.content}</span>,
    },
    {
      header: '状态',
      width: 100,
      cell: (r) => {
        const s = STATUS_LABEL[r.status] ?? { text: r.status, variant: 'muted' as const };
        return <Badge variant={s.variant}>{s.text}</Badge>;
      },
    },
    {
      // 「负责人」改「回复人」:后端没有指派接口,那一列对所有行恒定显示「未分配」,
      // 运维会以为是自己没找到入口而反复翻菜单。repliedBy 是真实存在且会变的字段。
      header: '回复人',
      width: 120,
      cell: (r) => <span className="text-12 text-muted-foreground">{r.repliedBy || '—'}</span>,
    },
    {
      // 相对时间主显 —— 工单页最该一眼看到的是「积压多久」,而不是一列 2026-08-01 09:12
      header: '提交',
      width: 120,
      sortKey: (r) => r.createdAt,
      cell: (r) => <TimeCell value={r.createdAt} />,
    },
    {
      header: '',
      width: 120,
      align: 'right',
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => setReplying(r)}>
          <MessageSquare className="size-3.5" />
          处理
        </Button>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="用户反馈"
      description={
        stats.data
          ? `共 ${stats.data.total} 条 · 待处理 ${stats.data.pending} 条 · 可回复、流转状态`
          : '用户反馈工单 · 可回复、流转状态'
      }
      onRefresh={() => {
        void refetch();
        void stats.refetch();
      }}
      refreshing={isFetching || stats.isFetching}
      tabs={
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => {
            const count = stats.data?.[f.statKey];
            return (
              <Button
                key={f.label}
                size="sm"
                variant={statusFilter === f.value ? 'default' : 'outline'}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
                {count != null && <span className="tabular-nums opacity-70">{count}</span>}
              </Button>
            );
          })}
        </div>
      }
    >
      <div className="mb-4 flex h-9 w-full max-w-sm items-center gap-2 rounded-8 border border-input bg-surface-card px-2.5">
        <Search className="size-3.5 text-faint" />
        <Input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          // 后端 keyword 匹配的是 content + **用户** ID/用户名/邮箱(见 repository.go
          // UserSearchClause),不含反馈单号 —— 写「ID」会让人以为能搜 #123
          placeholder="搜索 用户 ID / 用户名 / 邮箱 / 反馈内容"
          className="h-8 flex-1 border-0 bg-transparent px-0 text-12"
        />
      </div>
      <DataTable
        columns={columns}
        rows={data?.list}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage={hasFilter ? '当前筛选下没有反馈' : '还没有用户反馈'}
        emptyDescription={
          hasFilter ? '换个状态或清空搜索词再看看。' : '用户从站内「反馈」入口提交后会出现在这里。'
        }
        emptyAction={
          hasFilter ? (
            <Button size="sm" variant="outline" onClick={clearFilters}>
              清除筛选
            </Button>
          ) : undefined
        }
      />

      <Pagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <Dialog open={!!replying} onOpenChange={(o) => !o && setReplying(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              反馈
              <CopyableId value={replying?.id ?? null} prefix="#" label="反馈单号" />
              {replying && (
                <span className="text-muted-foreground">
                  · {replying.username || replying.email || '匿名用户'}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {replying && (
            <div className="space-y-4">
              {/* 元信息 —— 分类/状态/时间/提交者/邮箱/IP归属地/回复人 */}
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-12 border border-border bg-surface-1 p-3 sm:grid-cols-2">
                {([
                  ['分类', replying.category || '其他'],
                  ['状态', (STATUS_LABEL[replying.status] ?? { text: replying.status }).text],
                  ['提交时间', formatBackendTime(replying.createdAt)],
                  ['提交者', `${replying.username || '匿名'}${replying.userId ? ` · ID ${replying.userId}` : ' · 未登录'}`],
                  ['邮箱', replying.email || '—'],
                  ['IP / 归属地', `${replying.ip || '—'}${replying.ipLocation ? ` · ${replying.ipLocation}` : ''}`],
                  ['回复人', replying.repliedBy || '—'],
                  ['首次响应', formatBackendTime(replying.firstResponseAt)],
                ] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <div className="text-12 text-faint">{label}</div>
                    <div className="text-12 text-subtle truncate" title={value}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-12 border border-border bg-surface-1 p-3">
                <div className="text-12 text-faint mb-1">用户反馈</div>
                <div className="text-12 text-subtle whitespace-pre-wrap">{replying.content}</div>
              </div>

              {/* 附件预览 — 走 MinIO, 点缩略图新窗口看大图; 文件类则直接下载 */}
              {detail?.attachments && detail.attachments.length > 0 && (
                <div className="rounded-12 border border-border bg-surface-1 p-3">
                  <div className="text-12 text-faint mb-2">附件 ({detail.attachments.length})</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {detail.attachments.map((a, idx) => (
                      <a
                        key={idx}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-8 border border-border bg-surface-card overflow-hidden hover:border-foreground transition-colors"
                        title={a.name}
                      >
                        {a.type === 'image' ? (
                          <img src={a.url} alt={a.name} className="w-full h-20 object-cover" />
                        ) : (
                          <div className="w-full h-20 flex items-center justify-center text-12 text-muted-foreground p-2 text-center">
                            {a.name}
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* 已有回复 (若已回复过) */}
              {replying.replyContent && (
                <div className="rounded-12 border border-brand-green/30 bg-brand-green/5 p-3">
                  <div className="text-12 text-faint mb-1">
                    已回复{replying.repliedBy ? ` · ${replying.repliedBy}` : ''}
                    {replying.repliedAt ? ` · ${formatBackendTime(replying.repliedAt)}` : ''}
                  </div>
                  <div className="text-12 text-subtle whitespace-pre-wrap">{replying.replyContent}</div>
                </div>
              )}

              {/* 内部协作备注 —— 仅管理端可见, 不发给用户 */}
              {replying.internalNotes && (
                <div className="rounded-12 border border-border bg-warning-soft p-3">
                  <div className="text-12 text-faint mb-1">内部备注 (用户不可见)</div>
                  <div className="text-12 text-subtle whitespace-pre-wrap">{replying.internalNotes}</div>
                </div>
              )}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const replyText = String(fd.get('replyContent') || '');
                  if (!replyText.trim()) return;
                  const ok = await apiToast(
                    reply.mutateAsync({ id: replying.id, replyContent: replyText }),
                    { success: '已回复', failure: '回复失败' }
                  );
                  if (ok !== null) setReplying(null);
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="replyContent">回复内容</Label>
                  <Textarea
                    id="replyContent"
                    name="replyContent"
                    rows={5}
                    required
                    defaultValue={replying.replyContent}
                  />
                </div>
                {/* 四个状态后端都支持(UpdateStatusRequest oneof=pending processed replied closed),
                    但改造前唯一的状态操作是「标记关闭」—— 多人协作时无法表达「我在跟这条了」,
                    误关的工单也回不去。 */}
                <DialogFooter className="gap-2 sm:gap-2">
                  {replying.status !== 'processed' && replying.status !== 'closed' && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updateStatus.isPending}
                      onClick={() => handleStatusChange(replying, 'processed')}
                    >
                      {statusPending('processed') && <Loader2 className="size-3.5 animate-spin" />}
                      标记处理中
                    </Button>
                  )}
                  {replying.status === 'closed' ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updateStatus.isPending}
                      onClick={() => handleStatusChange(replying, 'pending')}
                    >
                      {statusPending('pending') && <Loader2 className="size-3.5 animate-spin" />}
                      重新打开
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updateStatus.isPending}
                      onClick={() => handleStatusChange(replying, 'closed', true)}
                    >
                      {statusPending('closed') && <Loader2 className="size-3.5 animate-spin" />}
                      标记关闭
                    </Button>
                  )}
                  {/* 回复接口会发邮件 + 站内信:网络慢时连点两下 = 给用户发两封重复回复 */}
                  <Button type="submit" disabled={reply.isPending}>
                    {reply.isPending && <Loader2 className="size-3.5 animate-spin" />}
                    回复并标记已回复
                  </Button>
                </DialogFooter>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
