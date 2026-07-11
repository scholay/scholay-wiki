import { useState } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
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
import { useApiToast } from '../hooks/useApiToast';
import { useUrlState, useDebounce } from '@/shared/hooks';
import {
  useFeedbackDetail,
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

/** ISO 时间 → "YYYY-MM-DD HH:mm"; 空值显示占位。 */
const fmtTime = (s?: string) => (s ? s.slice(0, 16).replace('T', ' ') : '—');

export function FeedbackPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [statusFilter, setStatusFilter] = useUrlState<FeedbackStatus | undefined>(
    'status',
    undefined,
    (raw) => (['pending', 'processed', 'replied', 'closed'].includes(raw) ? (raw as FeedbackStatus) : undefined)
  );
  const [replying, setReplying] = useState<Feedback | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);

  const { data, isLoading } = useFeedbackList({
    page,
    pageSize: 20,
    status: statusFilter,
    keyword: search || undefined,
  });
  const reply = useReplyFeedback();
  const updateStatus = useUpdateFeedbackStatus();
  const apiToast = useApiToast();
  /** 处理对话框打开后再拉详情 (含附件), 列表本身轻量不带 attachments */
  const { data: detail } = useFeedbackDetail(replying?.id ?? null);

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
      cell: (r) => <UserCell id={r.userId ?? null} name={r.username} email={r.email} anonymousLabel="未登录用户" />,
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
        <div className="flex flex-wrap gap-1">
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
      <div className="mb-4 flex h-9 w-full max-w-sm items-center gap-1.5 rounded-md border border-input bg-background px-2.5">
        <Search className="size-3.5 text-faint" />
        <Input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          placeholder="搜索 ID / 用户名 / 邮箱 / 反馈内容"
          className="h-8 flex-1 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
        />
      </div>
      <DataTable columns={columns} rows={data?.list} loading={isLoading} />

      <Pagination total={data?.total ?? 0} page={page} pageSize={20} onPageChange={setPage} />

      <Dialog open={!!replying} onOpenChange={(o) => !o && setReplying(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>反馈详情 · {replying?.username || replying?.email}</DialogTitle>
          </DialogHeader>
          {replying && (
            <div className="space-y-4">
              {/* 元信息 —— 分类/状态/时间/提交者/邮箱/IP归属地/负责人 */}
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-md border border-border bg-surface-1 p-3 sm:grid-cols-2">
                {([
                  ['分类', replying.category || '其他'],
                  ['状态', STATUS_LABEL[replying.status].text],
                  ['提交时间', fmtTime(replying.createdAt)],
                  ['提交者', `${replying.username || '匿名'}${replying.userId ? ` · ID ${replying.userId}` : ' · 未登录'}`],
                  ['邮箱', replying.email || '—'],
                  ['IP / 归属地', `${replying.ip || '—'}${replying.ipLocation ? ` · ${replying.ipLocation}` : ''}`],
                  ['负责人', replying.assigneeName || '未分配'],
                  ['首次响应', fmtTime(replying.firstResponseAt)],
                ] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <div className="text-2xs text-faint tracking-[0.12em]">{label}</div>
                    <div className="text-xs text-subtle truncate" title={value}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-border bg-surface-1 p-3">
                <div className="text-2xs text-faint mb-1 tracking-[0.12em]">用户反馈</div>
                <div className="text-sm text-subtle whitespace-pre-wrap">{replying.content}</div>
              </div>

              {/* 附件预览 — 走 MinIO, 点缩略图新窗口看大图; 文件类则直接下载 */}
              {detail?.attachments && detail.attachments.length > 0 && (
                <div className="rounded-md border border-border bg-surface-1 p-3">
                  <div className="text-2xs text-faint mb-2 tracking-[0.12em]">附件 ({detail.attachments.length})</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {detail.attachments.map((a, idx) => (
                      <a
                        key={idx}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-sm border border-border bg-background overflow-hidden hover:border-foreground transition-colors"
                        title={a.name}
                      >
                        {a.type === 'image' ? (
                          <img src={a.url} alt={a.name} className="w-full h-20 object-cover" />
                        ) : (
                          <div className="w-full h-20 flex items-center justify-center text-2xs text-muted-foreground p-2 text-center">
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
                <div className="rounded-md border border-brand-green/30 bg-brand-green/5 p-3">
                  <div className="text-2xs text-faint mb-1 tracking-[0.12em]">
                    已回复{replying.repliedBy ? ` · ${replying.repliedBy}` : ''}{replying.repliedAt ? ` · ${fmtTime(replying.repliedAt)}` : ''}
                  </div>
                  <div className="text-sm text-subtle whitespace-pre-wrap">{replying.replyContent}</div>
                </div>
              )}

              {/* 内部协作备注 —— 仅管理端可见, 不发给用户 */}
              {replying.internalNotes && (
                <div className="rounded-md border border-border bg-warning-soft p-3">
                  <div className="text-2xs text-faint mb-1 tracking-[0.12em]">内部备注 (用户不可见)</div>
                  <div className="text-sm text-subtle whitespace-pre-wrap">{replying.internalNotes}</div>
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
