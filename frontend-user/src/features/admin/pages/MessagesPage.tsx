import { useState } from 'react';
import { Plus, Send, Loader2 } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import { useUrlState } from '@/shared/hooks';
import {
  useMessages,
  useCreateMessage,
  useSendMessage,
  type AdminMessage,
  type MessageStatus,
  type MessageSendType,
  type MessageCategory,
} from '../api/messages';

const STATUS_LABEL: Record<MessageStatus, { text: string; variant: 'outline' | 'success' | 'muted' | 'destructive' | 'default' }> = {
  draft: { text: '草稿', variant: 'muted' },
  sending: { text: '发送中', variant: 'default' },
  sent: { text: '已发送', variant: 'success' },
  failed: { text: '发送失败', variant: 'destructive' },
};

const SEND_TYPE_LABEL: Record<MessageSendType, string> = {
  all: '全体用户',
  plans: '按订阅套餐',
  users: '指定用户',
};

const SEND_TYPE_OPTIONS: { value: MessageSendType; label: string; hint: string }[] = [
  { value: 'all', label: '全体用户', hint: '所有注册用户' },
  { value: 'plans', label: '按订阅套餐', hint: '逗号分隔的套餐 ID(如 1,2)' },
  { value: 'users', label: '指定用户', hint: '逗号分隔的用户 ID' },
];

export function MessagesPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [showCreate, setShowCreate] = useState(false);
  const [sendType, setSendType] = useState<MessageSendType>('all');
  const { data, isLoading } = useMessages({ page, page_size: 20 });
  const create = useCreateMessage();
  const send = useSendMessage();
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const handleSend = async (row: AdminMessage) => {
    const ok = await confirm({
      title: `发送「${row.title}」?`,
      description: `目标:${SEND_TYPE_LABEL[row.send_type]}。发送后无法撤回。`,
      danger: row.send_type === 'all',
      confirmText: '立即发送',
      typeToConfirm: row.send_type === 'all' ? 'SEND' : undefined,
    });
    if (!ok) return;
    await apiToast(send.mutateAsync(row.id), { success: '已发送', failure: '发送失败' });
  };

  const columns: Column<AdminMessage>[] = [
    { header: '标题', cell: (r) => <span className="font-medium text-foreground">{r.title}</span> },
    {
      header: '目标',
      width: 130,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-12 text-subtle">{SEND_TYPE_LABEL[r.send_type]}</span>
          {(r.target_user_ids || r.target_plans) && (
            <span className="text-12 text-faint truncate max-w-[120px]">
              {r.target_user_ids || r.target_plans}
            </span>
          )}
        </div>
      ),
    },
    {
      header: '状态',
      width: 100,
      cell: (r) => <Badge variant={STATUS_LABEL[r.status].variant}>{STATUS_LABEL[r.status].text}</Badge>,
    },
    {
      header: '阅读',
      width: 100,
      align: 'right',
      cell: (r) => (
        <span className="text-12 text-muted-foreground">
          {r.read_count} / {r.recipient_count}
        </span>
      ),
    },
    {
      header: '时间',
      width: 140,
      cell: (r) => (
        <span className="text-12 text-faint">
          {(r.send_at || r.created_at)?.slice(0, 16).replace('T', ' ')}
        </span>
      ),
    },
    {
      header: '',
      width: 100,
      align: 'right',
      cell: (r) =>
        r.status !== 'sent' &&
        r.status !== 'sending' && (
          <Button size="sm" variant="outline" disabled={send.isPending} onClick={() => handleSend(r)}>
            {send.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            发送
          </Button>
        ),
    },
  ];

  return (
    <AdminPageLayout
      title="站内消息"
      description={`共 ${data?.total ?? 0} 条 · 创建草稿 → 发送给全体 / 套餐 / 指定用户`}
      actions={
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="size-3.5" />
          新建消息
        </Button>
      }
    >
      <DataTable columns={columns} rows={data?.list} loading={isLoading} />

      <Pagination total={data?.total ?? 0} page={page} pageSize={20} onPageChange={setPage} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建消息</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const targetValue = String(fd.get('target_value') || '').trim();
              const ok = await apiToast(
                create.mutateAsync({
                  title: String(fd.get('title') || ''),
                  content: String(fd.get('content') || ''),
                  category: (String(fd.get('category') || 'notification')) as MessageCategory,
                  send_type: sendType,
                  target_plans: sendType === 'plans' && targetValue ? `[${targetValue}]` : undefined,
                  target_user_ids: sendType === 'users' && targetValue ? `[${targetValue}]` : undefined,
                  link_url: String(fd.get('link_url') || '') || undefined,
                  link_text: String(fd.get('link_text') || '') || undefined,
                  expire_at: String(fd.get('expire_at') || '') || undefined,
                  status: 'draft' as const,
                }),
                { success: '已存为草稿', failure: '创建失败' }
              );
              if (ok !== null) {
                setShowCreate(false);
                setSendType('all');
              }
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="title">标题</Label>
              <Input id="title" name="title" required />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="category">分类</Label>
                <select
                  id="category"
                  name="category"
                  defaultValue="notification"
                  className="h-9 w-full rounded-8 border border-input bg-surface-card px-2 text-12"
                >
                  <option value="system">系统</option>
                  <option value="notification">通知</option>
                  <option value="announcement">公告</option>
                  <option value="marketing">营销</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expire_at">过期时间(可选)</Label>
                <Input id="expire_at" name="expire_at" type="datetime-local" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="send_type">发送类型</Label>
                <select
                  id="send_type"
                  value={sendType}
                  onChange={(e) => setSendType(e.target.value as MessageSendType)}
                  className="h-9 w-full rounded-8 border border-input bg-surface-card px-2 text-12"
                >
                  {SEND_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="target_value">目标 ID 列表</Label>
                <Input
                  id="target_value"
                  name="target_value"
                  disabled={sendType === 'all'}
                  placeholder={SEND_TYPE_OPTIONS.find((o) => o.value === sendType)?.hint}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="content">内容</Label>
              <textarea
                id="content"
                name="content"
                rows={6}
                required
                className="w-full rounded-8 border border-input bg-surface-card px-3 py-2 text-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="link_url">链接 URL(可选)</Label>
                <Input id="link_url" name="link_url" placeholder="/announcements/123" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link_text">链接文案</Label>
                <Input id="link_text" name="link_text" placeholder="查看详情" />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button type="submit">存为草稿</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
