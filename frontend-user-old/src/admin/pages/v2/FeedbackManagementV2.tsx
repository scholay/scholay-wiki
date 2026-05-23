/**
 * FeedbackManagement v2 — 反馈管理
 *
 * 改进:
 *   - URL params 同步 status / q / page
 *   - 详情用 Dialog,回复直接在详情底部展开(无需切换两个 Modal)
 *   - 状态用 Badge 表示
 *   - 删除走 ConfirmDialog
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RefreshCw,
  MoreHorizontal,
  Trash2,
  Eye,
  Reply,
  CheckCircle2,
  Clock,
  Search,
  MessageCircle,
  Inbox,
  UserCircle2,
  StickyNote,
  AlertTriangle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Label } from '../../components/ui/label';

interface Feedback {
  id: number;
  email: string;
  content?: string;
  username?: string;
  ip?: string;
  ipLocation?: string;
  status: string;
  category?: string;
  createdAt: string;
  attachments?: string;
  replyContent?: string;
  repliedBy?: string;
  repliedAt?: string;
  assignedTo?: number | null;
  assigneeName?: string;
  internalNotes?: string;
  firstResponseAt?: string;
}

interface Stats {
  total?: number;
  pending?: number;
  processed?: number;
  replied?: number;
  unassigned?: number;
  avgFirstResponseMinutes?: number;
  oldestPendingMinutes?: number;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: '待处理' },
  { value: 'processed', label: '已处理' },
  { value: 'replied', label: '已回复' },
  { value: 'closed', label: '已关闭' },
];

type Category = 'bug' | 'feature' | 'complaint' | 'praise' | 'other';

const CATEGORY_OPTIONS: { value: Category; label: string; variant: any }[] = [
  { value: 'bug', label: 'Bug', variant: 'destructive' },
  { value: 'feature', label: '需求', variant: 'default' },
  { value: 'complaint', label: '投诉', variant: 'warning' },
  { value: 'praise', label: '表扬', variant: 'success' },
  { value: 'other', label: '其他', variant: 'outline' },
];

function CategoryBadge({ category }: { category?: string }) {
  const opt = CATEGORY_OPTIONS.find((o) => o.value === category) || CATEGORY_OPTIONS[4];
  return <Badge variant={opt.variant}>{opt.label}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <Badge variant="warning">待处理</Badge>;
    case 'processed':
      return <Badge>已处理</Badge>;
    case 'replied':
      return <Badge variant="success">已回复</Badge>;
    case 'closed':
      return <Badge variant="secondary">已关闭</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

const PAGE_SIZE = 20;

export default function FeedbackManagementV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const status = searchParams.get('status') || 'all';
  const category = searchParams.get('category') || 'all';
  const keyword = searchParams.get('q') || '';
  const page = Number(searchParams.get('page') || 1);
  const unassigned = searchParams.get('unassigned') === '1';

  const [keywordInput, setKeywordInput] = useState(keyword);
  useEffect(() => setKeywordInput(keyword), [keyword]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (keywordInput === keyword) return;
      const next = new URLSearchParams(searchParams);
      if (keywordInput) next.set('q', keywordInput);
      else next.delete('q');
      next.set('page', '1');
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordInput]);

  function patch(p: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(p).forEach(([k, v]) => {
      if (!v || v === 'all') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  const statsQuery = useQuery({
    queryKey: ['admin', 'feedback', 'stats'],
    queryFn: async () => {
      const r = await adminAPI.getFeedbackStats();
      return (r.data?.data || {}) as Stats;
    },
    staleTime: 30_000,
  });

  const listQuery = useQuery({
    queryKey: ['admin', 'feedback', { status, category, keyword, page, unassigned }],
    queryFn: async () => {
      const r = await adminAPI.getFeedbacks({
        page,
        pageSize: PAGE_SIZE,
        ...(status !== 'all' ? { status } : {}),
        ...(category !== 'all' ? { category } : {}),
        ...(keyword ? { keyword } : {}),
        ...(unassigned ? { unassigned: true } : {}),
      });
      const data = r.data?.data || {};
      return {
        items: (data.list || data.items || []) as Feedback[],
        total: (data.total ?? 0) as number,
      };
    },
    placeholderData: keepPreviousData,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (input: { id: number; status: string }) => {
      await adminAPI.updateFeedbackStatus(input.id, input.status);
    },
    onSuccess: () => {
      toast.success('状态已更新');
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
    onError: () => toast.error('更新失败'),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async (input: { id: number; category: Category }) => {
      await adminAPI.updateFeedbackCategory(input.id, input.category);
    },
    onSuccess: () => {
      toast.success('分类已更新');
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
    onError: () => toast.error('更新失败'),
  });

  const replyMutation = useMutation({
    mutationFn: async (input: { id: number; content: string }) => {
      await adminAPI.replyFeedback(input.id, input.content);
    },
    onSuccess: () => {
      toast.success('已回复');
      setReplyContent('');
      // 详情 Dialog 保持打开,允许继续操作
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
    onError: () => toast.error('回复失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => adminAPI.deleteFeedback(id),
    onSuccess: () => {
      toast.success('已删除');
      setDeleteTarget(null);
      setDetail(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
    onError: () => toast.error('删除失败'),
  });

  // 当前登录管理员(用于"指派给我")
  const profileQuery = useQuery({
    queryKey: ['admin', 'profile'],
    queryFn: async () => {
      const r = await adminAPI.getProfile();
      return r.data?.data as { id: number; username: string } | undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  const assignMutation = useMutation({
    mutationFn: async (input: { id: number; assignedTo: number | null }) => {
      await adminAPI.assignFeedback(input.id, input.assignedTo);
    },
    onSuccess: (_, input) => {
      toast.success(input.assignedTo ? '已指派' : '已取消指派');
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
      // 详情同步刷新
      if (detail?.id === input.id) {
        setDetail({
          ...detail,
          assignedTo: input.assignedTo,
          assigneeName: input.assignedTo === profileQuery.data?.id ? profileQuery.data?.username : detail.assigneeName,
        });
      }
    },
    onError: () => toast.error('指派失败'),
  });

  const notesMutation = useMutation({
    mutationFn: async (input: { id: number; notes: string }) => {
      await adminAPI.updateFeedbackInternalNotes(input.id, input.notes);
    },
    onSuccess: (_, input) => {
      toast.success('备注已保存');
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
      if (detail?.id === input.id) {
        setDetail({ ...detail, internalNotes: input.notes });
      }
    },
    onError: () => toast.error('保存备注失败'),
  });

  const [detail, setDetail] = useState<Feedback | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Feedback | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [internalNotesDraft, setInternalNotesDraft] = useState('');

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageLayout
      title="反馈管理"
      description="处理用户提交的产品反馈、bug 报告与建议"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            listQuery.refetch();
            statsQuery.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      }
    >
      {/* 统计 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        <StatCard
          title="总反馈"
          value={statsQuery.data?.total ?? 0}
          icon={<Inbox className="h-4 w-4 text-blue-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="待处理"
          value={statsQuery.data?.pending ?? 0}
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="已处理"
          value={statsQuery.data?.processed ?? 0}
          icon={<CheckCircle2 className="h-4 w-4 text-violet-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="已回复"
          value={statsQuery.data?.replied ?? 0}
          icon={<MessageCircle className="h-4 w-4 text-emerald-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="未指派"
          value={statsQuery.data?.unassigned ?? 0}
          icon={<UserCircle2 className="h-4 w-4 text-rose-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="平均首响"
          valueText={fmtMinutes(statsQuery.data?.avgFirstResponseMinutes)}
          icon={<AlertTriangle className="h-4 w-4 text-cyan-500" />}
          loading={statsQuery.isLoading}
          hint={
            statsQuery.data?.oldestPendingMinutes && statsQuery.data.oldestPendingMinutes > 0
              ? `最久未响应: ${fmtMinutes(statsQuery.data.oldestPendingMinutes)}`
              : undefined
          }
        />
      </div>

      <SectionCard
        title="反馈列表"
        description={`共 ${total} 条`}
        bodyPadded={false}
        toolbar={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索 邮箱 / 内容"
                className="w-64 pl-8"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={(v) => patch({ status: v, page: '1' })}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={(v) => patch({ category: v, page: '1' })}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={unassigned ? 'default' : 'outline'}
              size="sm"
              onClick={() => patch({ unassigned: unassigned ? undefined : '1', page: '1' })}
            >
              <UserCircle2 className="h-4 w-4" />
              {unassigned ? '只看未指派 ✓' : '只看未指派'}
            </Button>
          </>
        }
        footer={
          <>
            <span className="text-sm text-muted-foreground">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || listQuery.isFetching}
                onClick={() => patch({ page: String(page - 1) })}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || listQuery.isFetching}
                onClick={() => patch({ page: String(page + 1) })}
              >
                下一页
              </Button>
            </div>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>提交人</TableHead>
              <TableHead>内容预览</TableHead>
              <TableHead className="w-20">分类</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-28">指派</TableHead>
              <TableHead className="w-44">提交时间</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState title="暂无反馈" description={keyword || status !== 'all' || category !== 'all' ? '调整筛选试试' : '还没有用户提交反馈'} />
                </TableCell>
              </TableRow>
            ) : (
              items.map((fb) => (
                <TableRow key={fb.id} className="cursor-pointer" onClick={() => { setDetail(fb); setReplyContent(fb.replyContent || ''); setInternalNotesDraft(fb.internalNotes || ''); }}>
                  <TableCell>
                    <div className="font-medium">{fb.email}</div>
                    {fb.username && (
                      <div className="text-xs text-muted-foreground">{fb.username}</div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="line-clamp-2 text-sm">{fb.content || '—'}</div>
                  </TableCell>
                  <TableCell>
                    <CategoryBadge category={fb.category} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={fb.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {fb.assignedTo ? (
                      <Badge variant="info" className="font-normal">
                        {fb.assigneeName || `#${fb.assignedTo}`}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">未指派</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(fb.createdAt)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="操作">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>操作</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => { setDetail(fb); setReplyContent(fb.replyContent || ''); setInternalNotesDraft(fb.internalNotes || ''); }}>
                          <Eye />
                          查看详情
                        </DropdownMenuItem>
                        {fb.status !== 'replied' && (
                          <DropdownMenuItem onSelect={() => updateStatusMutation.mutate({ id: fb.id, status: 'processed' })}>
                            <CheckCircle2 />
                            标为已处理
                          </DropdownMenuItem>
                        )}
                        {profileQuery.data && fb.assignedTo !== profileQuery.data.id && (
                          <DropdownMenuItem
                            onSelect={() =>
                              assignMutation.mutate({ id: fb.id, assignedTo: profileQuery.data!.id })
                            }
                          >
                            <UserCircle2 />
                            指派给我
                          </DropdownMenuItem>
                        )}
                        {fb.assignedTo && (
                          <DropdownMenuItem
                            onSelect={() => assignMutation.mutate({ id: fb.id, assignedTo: null })}
                          >
                            <UserCircle2 />
                            取消指派
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(fb)}
                        >
                          <Trash2 />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* 详情 + 回复 */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              反馈详情
              {detail && <StatusBadge status={detail.status} />}
            </DialogTitle>
            <DialogDescription>
              来自 {detail?.email} · {detail && fmtDate(detail.createdAt)}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
              {/* 分类 + 指派 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground">分类</Label>
                  <Select
                    value={detail.category || 'other'}
                    onValueChange={(v) =>
                      updateCategoryMutation.mutate({ id: detail.id, category: v as Category })
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-muted-foreground">指派</Label>
                  <div className="mt-1 flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm">
                    {detail.assignedTo ? (
                      <>
                        <Badge variant="info" className="font-normal">
                          {detail.assigneeName || `#${detail.assignedTo}`}
                        </Badge>
                        <button
                          className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => assignMutation.mutate({ id: detail.id, assignedTo: null })}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">未指派</span>
                        {profileQuery.data && (
                          <button
                            className="ml-auto text-xs text-primary hover:underline"
                            onClick={() =>
                              assignMutation.mutate({
                                id: detail.id,
                                assignedTo: profileQuery.data!.id,
                              })
                            }
                          >
                            指派给我
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">反馈内容</Label>
                <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {detail.content || '—'}
                </div>
              </div>

              {(detail.ip || detail.ipLocation) && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <Label className="text-muted-foreground">IP</Label>
                    <p className="mt-0.5">{detail.ip || '—'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">归属地</Label>
                    <p className="mt-0.5">{detail.ipLocation || '—'}</p>
                  </div>
                </div>
              )}

              {detail.replyContent && (
                <div>
                  <Label className="text-muted-foreground">历史回复</Label>
                  <div className="mt-1 whitespace-pre-wrap rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
                    {detail.replyContent}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {detail.repliedBy || '—'} · {fmtDate(detail.repliedAt)}
                  </p>
                </div>
              )}

              {/* 内部协作备注 (用户不可见) */}
              <div>
                <Label className="flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5 text-amber-600" />
                  内部备注
                  <span className="text-xs font-normal text-muted-foreground">(仅管理员可见)</span>
                </Label>
                <textarea
                  className="mt-1 flex h-20 w-full rounded-md border border-amber-200 bg-amber-50/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  value={internalNotesDraft}
                  onChange={(e) => setInternalNotesDraft(e.target.value)}
                  placeholder="例:已联系研发,需要查 prod 日志后再回复"
                  maxLength={5000}
                />
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    管理员之间的协作笔记,不会发送给用户
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      internalNotesDraft === (detail.internalNotes || '') || notesMutation.isPending
                    }
                    onClick={() =>
                      notesMutation.mutate({ id: detail.id, notes: internalNotesDraft })
                    }
                  >
                    {notesMutation.isPending ? '保存中…' : '保存备注'}
                  </Button>
                </div>
              </div>

              <div>
                <Label>回复内容</Label>
                <textarea
                  className="mt-1 flex h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="输入回复内容,提交后会通过站内信和邮件发送给用户"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  发送后用户会收到 <strong>站内信</strong>;若用户邮箱已验证,同时发送邮件通知。
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              关闭
            </Button>
            <Button
              disabled={!replyContent.trim() || replyMutation.isPending || !detail}
              onClick={() => detail && replyMutation.mutate({ id: detail.id, content: replyContent.trim() })}
            >
              <Reply className="h-4 w-4" />
              {replyMutation.isPending ? '发送中…' : '发送回复'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除该反馈?"
        description={`将删除来自 "${deleteTarget?.email}" 的反馈。此操作不可撤销。`}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </PageLayout>
  );
}

function fmtDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
}

function StatCard({
  title,
  value,
  valueText,
  icon,
  loading,
  hint,
}: {
  title: string;
  value?: number;
  valueText?: string;
  icon: React.ReactNode;
  loading?: boolean;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {valueText ?? (value ?? 0).toLocaleString()}
            </p>
          )}
          {hint && !loading && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
        </div>
        <div className="rounded-md bg-muted/40 p-2">{icon}</div>
      </CardContent>
    </Card>
  );
}

// 把分钟数显示为 "1h 20m" / "45m" / "—"
function fmtMinutes(m?: number): string {
  if (!m || m <= 0) return '—';
  const total = Math.round(m);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (h < 24) return min ? `${h}h ${min}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
