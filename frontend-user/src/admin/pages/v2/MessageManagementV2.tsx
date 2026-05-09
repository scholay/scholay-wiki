/**
 * MessageManagement v2 — 站内信管理(只覆盖发送/历史)
 *
 * 老版还有一些细节(批量用户ID等),都保留;视觉换 shadcn
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Plus,
  RefreshCw,
  Send,
  Inbox,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';

interface MessageRow {
  id: number;
  title: string;
  content?: string;
  category?: string;
  send_type?: string;
  status?: string;
  created_at?: string;
  sent_at?: string;
  read_count?: number;
  target_count?: number;
}

interface Stats {
  total?: number;
  sent?: number;
  pending?: number;
  failed?: number;
}

interface FormState {
  title: string;
  content: string;
  category: 'system' | 'promotion' | 'transaction';
  send_type: 'all' | 'by_plan' | 'batch';
  target_plans: string[];
  target_user_ids: string;
  link_url: string;
  link_text: string;
  send_now: boolean;
}

function emptyForm(): FormState {
  return {
    title: '',
    content: '',
    category: 'system',
    send_type: 'all',
    target_plans: [],
    target_user_ids: '',
    link_url: '',
    link_text: '',
    // 默认存草稿,避免误发;管理员主动勾选才立即发送
    send_now: false,
  };
}

interface MsgTemplate {
  id: number;
  name: string;
  template_key?: string;
  title_template?: string;
  content_template?: string;
  category?: string;
}

const PAGE_SIZE = 20;

export default function MessageManagementV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const status = searchParams.get('status') || 'all';
  const page = Number(searchParams.get('page') || 1);

  function patch(p: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(p).forEach(([k, v]) => {
      if (!v || v === 'all') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  const statsQuery = useQuery({
    queryKey: ['admin', 'messages', 'stats'],
    queryFn: async () => (await adminAPI.getMessageStats()).data?.data as Stats,
    staleTime: 30_000,
  });

  // 模板列表 — 用于"从模板填充"下拉
  const templatesQuery = useQuery({
    queryKey: ['admin', 'msgTemplates', 'pick'],
    queryFn: async () => {
      const r = await adminAPI.getMessageTemplates({});
      return ((r.data?.data?.list || r.data?.data || []) as MsgTemplate[]);
    },
    staleTime: 60_000,
  });

  const listQuery = useQuery({
    queryKey: ['admin', 'messages', { status, page }],
    queryFn: async () => {
      const r = await adminAPI.getMessages({
        page,
        pageSize: PAGE_SIZE,
        ...(status !== 'all' ? { status } : {}),
      });
      const data = r.data?.data || {};
      return {
        items: (data.list || data.items || []) as MessageRow[],
        total: (data.total ?? 0) as number,
      };
    },
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: async (input: FormState) => {
      const data: any = {
        title: input.title,
        content: input.content,
        category: input.category,
        send_type: input.send_type,
        link_url: input.link_url || undefined,
        link_text: input.link_text || undefined,
        send_now: input.send_now,
      };
      if (input.send_type === 'by_plan') data.target_plans = input.target_plans;
      if (input.send_type === 'batch')
        data.target_user_ids = input.target_user_ids
          .split(/\s+/)
          .filter(Boolean)
          .map((s) => Number(s) || s);
      await adminAPI.createMessage(data);
    },
    onSuccess: () => {
      toast.success('已创建' + (form?.send_now ? '并发送' : ''));
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'messages'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '创建失败'),
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => adminAPI.sendMessage(id),
    onSuccess: () => {
      toast.success('已发送');
      setSendTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'messages'] });
    },
    onError: () => toast.error('发送失败'),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [sendTarget, setSendTarget] = useState<MessageRow | null>(null);

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function submit() {
    if (!form) return;
    if (!form.title.trim()) return toast.error('请填写标题');
    if (!form.content.trim()) return toast.error('请填写内容');
    createMutation.mutate(form);
  }

  return (
    <PageLayout
      title="站内信"
      description="向用户发送系统通知 / 营销推广 / 交易消息"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={() => setForm(emptyForm())}>
            <Plus className="h-4 w-4" />
            新建消息
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="总消息" value={statsQuery.data?.total ?? 0} icon={<Inbox className="h-4 w-4 text-blue-500" />} loading={statsQuery.isLoading} />
        <StatCard title="已发送" value={statsQuery.data?.sent ?? 0} icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} loading={statsQuery.isLoading} />
        <StatCard title="待发送" value={statsQuery.data?.pending ?? 0} icon={<Clock className="h-4 w-4 text-amber-500" />} loading={statsQuery.isLoading} />
        <StatCard title="失败" value={statsQuery.data?.failed ?? 0} icon={<AlertCircle className="h-4 w-4 text-red-500" />} loading={statsQuery.isLoading} />
      </div>

      <SectionCard
        title="消息列表"
        description={`共 ${total} 条`}
        bodyPadded={false}
        toolbar={
          <Select value={status} onValueChange={(v) => patch({ status: v, page: '1' })}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待发送</SelectItem>
              <SelectItem value="sent">已发送</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
            </SelectContent>
          </Select>
        }
        footer={
          <>
            <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || listQuery.isFetching} onClick={() => patch({ page: String(page - 1) })}>上一页</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || listQuery.isFetching} onClick={() => patch({ page: String(page + 1) })}>下一页</Button>
            </div>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>消息</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-28 text-right">阅读 / 目标</TableHead>
              <TableHead className="w-44">创建时间</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`s-${i}`}><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={5}><EmptyState title="暂无消息" /></TableCell></TableRow>
            ) : (
              items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">{m.title}</div>
                    <div className="line-clamp-1 text-xs text-muted-foreground">{m.content?.slice(0, 80)}</div>
                  </TableCell>
                  <TableCell><MessageStatusBadge status={m.status} /></TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {m.read_count ?? 0} / {m.target_count ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(m.created_at)}</TableCell>
                  <TableCell>
                    {m.status === 'pending' && (
                      <Button variant="outline" size="sm" onClick={() => setSendTarget(m)}>
                        <Send className="h-3.5 w-3.5" />
                        发送
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* 创建消息 */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建消息</DialogTitle>
            <DialogDescription>支持 Markdown 格式</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
              {/* 从模板填充 */}
              {(templatesQuery.data?.length ?? 0) > 0 && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <Label className="mb-1.5 text-xs text-muted-foreground">
                    从模板填充(选了会覆盖标题/内容/分类)
                  </Label>
                  <Select
                    onValueChange={(id) => {
                      const t = templatesQuery.data?.find((x) => x.id === Number(id));
                      if (!t) return;
                      setForm({
                        ...form,
                        title: t.title_template || form.title,
                        content: t.content_template || form.content,
                        category:
                          ((t.category as FormState['category']) || form.category),
                      });
                      toast.success(`已填充模板:${t.name}`);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="选择消息模板..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(templatesQuery.data ?? []).map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          <span className="font-medium">{t.name}</span>
                          {t.template_key && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t.template_key}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>标题</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>内容 (Markdown)</Label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="**加粗** *斜体* [链接](https://...)"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>分类</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">系统通知</SelectItem>
                      <SelectItem value="promotion">营销推广</SelectItem>
                      <SelectItem value="transaction">交易通知</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>发送目标</Label>
                  <Select value={form.send_type} onValueChange={(v) => setForm({ ...form, send_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全站广播</SelectItem>
                      <SelectItem value="by_plan">按会员等级</SelectItem>
                      <SelectItem value="batch">指定用户</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.send_type === 'by_plan' && (
                <div className="space-y-1.5">
                  <Label>会员等级</Label>
                  <div className="flex flex-wrap gap-2">
                    {['free', 'pro', 'max'].map((p) => (
                      <label key={p} className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={form.target_plans.includes(p)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              target_plans: e.target.checked
                                ? [...form.target_plans, p]
                                : form.target_plans.filter((x) => x !== p),
                            })
                          }
                        />
                        {p.toUpperCase()}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.send_type === 'batch' && (
                <div className="space-y-1.5">
                  <Label>用户 ID 列表 (每行一个)</Label>
                  <textarea
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    value={form.target_user_ids}
                    onChange={(e) => setForm({ ...form, target_user_ids: e.target.value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>跳转链接 (可选)</Label>
                  <Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://" />
                </div>
                <div className="space-y-1.5">
                  <Label>链接文字</Label>
                  <Input value={form.link_text} onChange={(e) => setForm({ ...form, link_text: e.target.value })} placeholder="查看详情" />
                </div>
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.send_now}
                  onChange={(e) => setForm({ ...form, send_now: e.target.checked })}
                />
                立即发送 (默认保存为待发送草稿)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>取消</Button>
            <Button onClick={submit} disabled={createMutation.isPending}>
              {createMutation.isPending ? '处理中…' : (form?.send_now ? '创建并立即发送' : '保存为草稿')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!sendTarget}
        onOpenChange={(o) => !o && setSendTarget(null)}
        title="发送该消息?"
        description={`将向目标用户发送 "${sendTarget?.title}",发送后无法撤回。`}
        confirmText="立即发送"
        loading={sendMutation.isPending}
        onConfirm={() => sendTarget && sendMutation.mutate(sendTarget.id)}
      />
    </PageLayout>
  );
}

function MessageStatusBadge({ status }: { status?: string }) {
  if (status === 'sent') return <Badge variant="success">已发送</Badge>;
  if (status === 'pending') return <Badge variant="warning">待发送</Badge>;
  if (status === 'failed') return <Badge variant="destructive">失败</Badge>;
  return <Badge variant="outline">{status || '—'}</Badge>;
}

function fmtDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
}

function StatCard({ title, value, icon, loading }: { title: string; value: number; icon: React.ReactNode; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          {loading ? <Skeleton className="mt-1 h-7 w-16" /> : <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>}
        </div>
        <div className="rounded-md bg-muted/40 p-2">{icon}</div>
      </CardContent>
    </Card>
  );
}
