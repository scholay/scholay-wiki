import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
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
import { Pagination } from '../components/Pagination';
import { useApiToast } from '../hooks/useApiToast';
import { useUrlState } from '@/shared/hooks';
import {
  useFeedbackList,
  useReplyFeedback,
  useUpdateFeedbackStatus,
  type Feedback,
  type FeedbackStatus,
} from '../api/feedback';

const STATUS_LABEL: Record<FeedbackStatus, { text: string; variant: 'default' | 'outline' | 'muted' | 'destructive' | 'success' }> = {
  pending: { text: '待处理', variant: 'destructive' },
  processed: { text: '处理中', variant: 'default' },
  replied: { text: '已回复', variant: 'success' },
  closed: { text: '已关闭', variant: 'muted' },
};

const STATUS_FILTERS: { value: FeedbackStatus | undefined; label: string }[] = [
  { value: undefined, label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'processed', label: '处理中' },
  { value: 'replied', label: '已回复' },
  { value: 'closed', label: '已关闭' },
];

export function FeedbackPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [statusFilter, setStatusFilter] = useUrlState<FeedbackStatus | undefined>(
    'status',
    undefined,
    (raw) => (['pending', 'processed', 'replied', 'closed'].includes(raw) ? (raw as FeedbackStatus) : undefined)
  );
  const [replying, setReplying] = useState<Feedback | null>(null);

  const { data, isLoading } = useFeedbackList({ page, pageSize: 20, status: statusFilter });
  const reply = useReplyFeedback();
  const updateStatus = useUpdateFeedbackStatus();
  const apiToast = useApiToast();

  const handleStatusChange = async (row: Feedback, status: FeedbackStatus) => {
    await apiToast(updateStatus.mutateAsync({ id: row.id, status }), {
      success: '状态已更新',
      failure: '更新失败',
    });
  };

  const columns: Column<Feedback>[] = [
    {
      header: '用户',
      width: 180,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-foreground text-xs font-bold">{r.username || r.email}</span>
          <span className="text-2xs text-faint">{r.email}{r.userId ? ` · ID ${r.userId}` : ''}</span>
        </div>
      ),
    },
    {
      header: '分类',
      width: 110,
      cell: (r) => <Badge variant="muted">{r.category || '其他'}</Badge>,
    },
    {
      header: '内容',
      cell: (r) => <span className="text-xs text-subtle line-clamp-2">{r.content}</span>,
    },
    {
      header: '状态',
      width: 100,
      cell: (r) => <Badge variant={STATUS_LABEL[r.status].variant}>{STATUS_LABEL[r.status].text}</Badge>,
    },
    {
      header: '负责人',
      width: 140,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{r.assigneeName || '未分配'}</span>
      ),
    },
    {
      header: '时间',
      width: 130,
      cell: (r) => (
        <span className="text-2xs text-faint">{r.createdAt?.slice(0, 16).replace('T', ' ')}</span>
      ),
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
      description={`共 ${data?.total ?? 0} 条反馈 · 可分配、回复、关闭`}
      tabs={
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.label}
              size="sm"
              variant={statusFilter === f.value ? 'default' : 'outline'}
              onClick={() => {
                setStatusFilter(f.value);
                setPage(1);
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>
      }
    >
      <DataTable columns={columns} rows={data?.list} loading={isLoading} />

      <Pagination total={data?.total ?? 0} page={page} pageSize={20} onPageChange={setPage} />

      <Dialog open={!!replying} onOpenChange={(o) => !o && setReplying(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>处理反馈 · {replying?.username || replying?.email}</DialogTitle>
          </DialogHeader>
          {replying && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-surface-1 p-3">
                <div className="text-2xs text-faint mb-1 tracking-[0.12em]">用户反馈</div>
                <div className="text-sm text-subtle whitespace-pre-wrap">{replying.content}</div>
              </div>

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
                  <textarea
                    id="replyContent"
                    name="replyContent"
                    rows={5}
                    required
                    defaultValue={replying.replyContent}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      handleStatusChange(replying, 'closed');
                      setReplying(null);
                    }}
                  >
                    标记关闭
                  </Button>
                  <Button type="submit">回复并标记已回复</Button>
                </DialogFooter>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
