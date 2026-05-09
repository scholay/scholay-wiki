/**
 * UserDetailSheet — 用户详情抽屉(右侧滑出)
 *
 * 一次性拉取 /admin/users/:id/aggregate,展示:
 *   基础信息(邮箱/手机/状态/最后登录/IP 归属/Auth Providers)
 *   最近 10 个订单
 *   最近 10 条反馈
 *   最近 10 个会话
 *
 * 跳转入口:
 *   - "查看完整使用日志" → /admin/usage-logs?user_id=<id>(深链)
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  User,
  Mail,
  Phone,
  Globe,
  Activity,
  ShoppingCart,
  MessageCircle,
  Monitor,
  Save,
  Lock,
  StickyNote,
} from 'lucide-react';

import { adminAPI } from '../../services/api';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { ErrorState } from '../ui/error-state';
import { EmptyState } from '../ui/empty-state';
import { Button } from '../ui/button';
import { Label } from '../ui/label';

interface AggregateOrder {
  id: number;
  order_no: string;
  order_type: string;
  plan_name?: string;
  billing_cycle?: string;
  status: string;
  paid_amount: number;
  created_at: string;
}

interface AggregateFeedback {
  id: number;
  status: string;
  category: string;
  content: string;
  created_at: string;
}

interface AggregateSession {
  id: number;
  device_type: string;
  ip?: string;
  user_agent?: string;
  last_active_at: string;
  created_at: string;
}

interface UserAggregate {
  id: number;
  username?: string;
  email?: string;
  phone?: string;
  email_verified?: boolean;
  phone_verified?: boolean;
  status?: number;
  role?: string;
  frozen_at?: string;
  frozen_reason?: string;
  admin_notes?: string;
  created_at?: string;
  last_login_at?: string;
  last_login_ip?: string;
  last_login_ip_info?: string;
  auth_providers?: string[];
  ai_conversation_stats?: any;
  analysis_conversation_stats?: any;
  orders?: AggregateOrder[];
  feedbacks?: AggregateFeedback[];
  sessions?: AggregateSession[];
}

interface Props {
  userId: number | null;
  onClose: () => void;
}

export function UserDetailSheet({ userId, onClose }: Props) {
  const open = userId != null;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'user', 'aggregate', userId],
    enabled: open,
    queryFn: async () => {
      const r = await adminAPI.getUserAggregate(userId!);
      return (r.data?.data || {}) as UserAggregate;
    },
  });

  const u = query.data;

  // admin_notes 本地编辑 state
  const [notesDraft, setNotesDraft] = useState('');
  useEffect(() => {
    setNotesDraft(u?.admin_notes || '');
  }, [u?.admin_notes]);

  const notesMutation = useMutation({
    mutationFn: async (notes: string) => {
      if (!userId) return;
      await adminAPI.updateAdminNotes(userId, notes);
    },
    onSuccess: () => {
      toast.success('备注已保存');
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', 'aggregate', userId] });
    },
    onError: () => toast.error('保存失败'),
  });

  const notesDirty = notesDraft !== (u?.admin_notes || '');

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {u?.username || u?.email || `用户 #${userId}`}
          </SheetTitle>
          <SheetDescription>查看用户基础信息、订单、反馈、活跃会话</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 space-y-6 overflow-y-auto pr-1">
          {query.isLoading && <SkeletonBlock />}
          {query.isError && (
            <ErrorState
              title="加载用户详情失败"
              onRetry={() => query.refetch()}
            />
          )}
          {u && (
            <>
              {/* 基础信息 */}
              <Section icon={<User className="h-4 w-4" />} title="基础信息">
                <Field label="ID" value={String(u.id)} />
                <Field label="角色" value={<RoleBadge role={u.role} />} />
                <Field
                  label="邮箱"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3 w-3 opacity-60" />
                      {u.email || '—'}
                      {u.email_verified && <Badge variant="success">已验证</Badge>}
                    </span>
                  }
                />
                <Field
                  label="手机"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3 w-3 opacity-60" />
                      {u.phone || '—'}
                      {u.phone_verified && <Badge variant="success">已验证</Badge>}
                    </span>
                  }
                />
                <Field label="状态" value={<StatusBadge status={u.status} />} />
                <Field label="注册时间" value={fmt(u.created_at)} />
                <Field label="最后登录" value={fmt(u.last_login_at)} />
                {(u.last_login_ip || u.last_login_ip_info) && (
                  <Field
                    label="最后登录 IP"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <Globe className="h-3 w-3 opacity-60" />
                        {u.last_login_ip}
                        {u.last_login_ip_info && (
                          <span className="text-xs text-muted-foreground">({u.last_login_ip_info})</span>
                        )}
                      </span>
                    }
                  />
                )}
                {(u.auth_providers?.length ?? 0) > 0 && (
                  <Field
                    label="登录方式"
                    value={
                      <div className="flex flex-wrap gap-1">
                        {u.auth_providers!.map((p) => (
                          <Badge key={p} variant="outline">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    }
                  />
                )}
              </Section>

              {/* 冻结状态提示 */}
              {u.status === 2 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-amber-900">
                    <Lock className="h-4 w-4" />
                    该账号已被冻结
                  </div>
                  {u.frozen_reason && (
                    <p className="mt-1 text-xs text-amber-800">
                      原因:{u.frozen_reason}
                    </p>
                  )}
                  {u.frozen_at && (
                    <p className="mt-0.5 text-xs text-amber-700">
                      冻结时间:{fmt(u.frozen_at)}
                    </p>
                  )}
                </div>
              )}

              {/* 管理员备注 */}
              <Section
                icon={<StickyNote className="h-4 w-4 text-amber-500" />}
                title="管理员备注(用户不可见)"
              >
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="例:VIP 客户 / 已与 sales 沟通 / 需特殊处理..."
                />
                <div className="mt-1 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!notesDirty || notesMutation.isPending}
                    onClick={() => notesMutation.mutate(notesDraft)}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {notesMutation.isPending ? '保存中…' : '保存备注'}
                  </Button>
                </div>
              </Section>

              {/* 快捷链接 */}
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/admin/usage-logs?user_id=${u.id}`} target="_blank">
                    <Activity className="h-3.5 w-3.5" />
                    查看完整使用日志
                  </Link>
                </Button>
              </div>

              {/* 订单 */}
              <Section
                icon={<ShoppingCart className="h-4 w-4 text-violet-500" />}
                title={`最近订单 (${u.orders?.length ?? 0})`}
              >
                {u.orders && u.orders.length > 0 ? (
                  <ul className="space-y-2">
                    {u.orders.map((o) => (
                      <li key={o.id} className="flex items-start justify-between rounded-md border p-2 text-sm">
                        <div>
                          <div className="font-medium">{o.plan_name || o.order_type}</div>
                          <div className="text-xs text-muted-foreground">
                            {o.order_no}{' '}
                            {o.billing_cycle && <span>· {o.billing_cycle}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">{fmt(o.created_at)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium tabular-nums">¥{o.paid_amount}</div>
                          <Badge
                            variant={o.status === 'paid' ? 'success' : 'secondary'}
                            className="mt-1"
                          >
                            {o.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="暂无订单" />
                )}
              </Section>

              {/* 反馈 */}
              <Section
                icon={<MessageCircle className="h-4 w-4 text-emerald-500" />}
                title={`最近反馈 (${u.feedbacks?.length ?? 0})`}
              >
                {u.feedbacks && u.feedbacks.length > 0 ? (
                  <ul className="space-y-2">
                    {u.feedbacks.map((f) => (
                      <li key={f.id} className="space-y-1 rounded-md border p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{f.category}</Badge>
                            <Badge
                              variant={
                                f.status === 'replied' ? 'success' : f.status === 'pending' ? 'warning' : 'secondary'
                              }
                            >
                              {f.status}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{fmt(f.created_at)}</span>
                        </div>
                        <p className="line-clamp-2 text-muted-foreground">{f.content}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="暂无反馈" />
                )}
              </Section>

              {/* 会话 */}
              <Section
                icon={<Monitor className="h-4 w-4 text-blue-500" />}
                title={`最近活跃会话 (${u.sessions?.length ?? 0})`}
              >
                {u.sessions && u.sessions.length > 0 ? (
                  <ul className="space-y-2">
                    {u.sessions.map((s) => (
                      <li key={s.id} className="rounded-md border p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">{s.device_type}</Badge>
                          <span className="text-xs text-muted-foreground">最后活跃 {fmt(s.last_active_at)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {s.ip || '—'}
                        </div>
                        {s.user_agent && (
                          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {s.user_agent}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="暂无活跃会话" />
                )}
              </Section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-2 py-1 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status?: number }) {
  if (status === 1) return <Badge variant="success">活跃</Badge>;
  if (status === 0) return <Badge variant="secondary">未激活</Badge>;
  return <Badge variant="destructive">禁用</Badge>;
}

function RoleBadge({ role }: { role?: string }) {
  if (role === 'super_admin') return <Badge>超级管理员</Badge>;
  if (role === 'admin') return <Badge variant="secondary">管理员</Badge>;
  return <Badge variant="outline">用户</Badge>;
}

function fmt(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
}

function SkeletonBlock() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
