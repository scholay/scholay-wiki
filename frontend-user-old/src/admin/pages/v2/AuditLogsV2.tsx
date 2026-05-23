/**
 * AuditLogsV2 — 管理员操作审计日志查看页
 *
 * 数据源:GET /admin/audit-logs (admin/audit_handler.go)
 * 显示:操作时间 / 操作人 / 角色 / 动作 / 资源 / 详情(JSON 折叠)/ IP
 * 筛选:动作 / 资源类型 / 时间范围
 *
 * 关键场景:
 *   - 谁删了某个 prompt 模板
 *   - super_admin 给谁分配了 admin 角色
 *   - 谁清空了使用日志
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { RefreshCw, ChevronDown, Shield } from 'lucide-react';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
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
import { cn } from '../../lib/utils';

interface AuditLog {
  id: number;
  admin_user_id: number;
  admin_username: string;
  admin_role: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  ip: string;
  user_agent: string;
  created_at: string;
}

const ACTION_OPTIONS = [
  { value: 'create', label: '创建' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'batch_delete', label: '批量删除' },
  { value: 'role_assign', label: '分配角色' },
  { value: 'clear', label: '清空' },
  { value: 'activate', label: '激活' },
  { value: 'test', label: '测试' },
];

const RESOURCE_OPTIONS = [
  { value: 'user', label: '用户' },
  { value: 'prompt_template', label: 'Prompt 模板' },
  { value: 'message_template', label: '消息模板' },
  { value: 'feedback', label: '反馈' },
  { value: 'usage_log', label: '使用日志' },
  { value: 'third_party_account', label: '第三方账号' },
  { value: 'latex_agent', label: 'LaTeX Agent' },
  { value: 'alipay_config', label: '支付宝配置' },
  { value: 'wechat_pay_config', label: '微信支付配置' },
  { value: 'oauth_config', label: 'OAuth 配置' },
  { value: 'email_config', label: '邮件配置' },
  { value: 'sms_config', label: 'SMS 配置' },
  { value: 'system_config', label: '系统配置' },
  { value: 'code_snippet', label: '代码片段' },
];

const PAGE_SIZE = 30;

export default function AuditLogsV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const action = searchParams.get('action') || 'all';
  const resourceType = searchParams.get('resource_type') || 'all';
  const page = Number(searchParams.get('page') || 1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function patch(p: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(p).forEach(([k, v]) => {
      if (!v || v === 'all') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  const listQuery = useQuery({
    queryKey: ['admin', 'auditLogs', { action, resourceType, page }],
    queryFn: async () => {
      const r = await adminAPI.getAuditLogs({
        page,
        page_size: PAGE_SIZE,
        ...(action !== 'all' ? { action } : {}),
        ...(resourceType !== 'all' ? { resource_type: resourceType } : {}),
      });
      const data = r.data?.data || {};
      return {
        items: (data.items || []) as AuditLog[],
        total: (data.total ?? 0) as number,
      };
    },
    placeholderData: keepPreviousData,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageLayout
      title="审计日志"
      description="管理员所有写操作的全量审计记录"
      actions={
        <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      }
    >
      <SectionCard
        title="操作记录"
        description={`共 ${total} 条`}
        bodyPadded={false}
        toolbar={
          <>
            <Select value={action} onValueChange={(v) => patch({ action: v, page: '1' })}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="动作" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部动作</SelectItem>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={resourceType}
              onValueChange={(v) => patch({ resource_type: v, page: '1' })}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="资源类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部资源</SelectItem>
                {RESOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <TableHead className="w-44">时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead className="w-28">动作</TableHead>
              <TableHead>资源</TableHead>
              <TableHead>详情</TableHead>
              <TableHead className="w-32">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState
                    title="暂无审计日志"
                    description={
                      action !== 'all' || resourceType !== 'all'
                        ? '调整筛选条件试试'
                        : '没有写操作被记录,可能后端还未触发埋点'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => {
                const isOpen = expanded.has(row.id);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(row.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {row.admin_role === 'super_admin' && (
                          <Shield className="h-3 w-3 text-amber-500" />
                        )}
                        <span className="font-medium">{row.admin_username}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">#{row.admin_user_id}</div>
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={row.action} />
                    </TableCell>
                    <TableCell>
                      <ResourceBadge type={row.resource_type} />
                      {row.resource_id && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          #{row.resource_id}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.details ? (
                        <button
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const next = new Set(expanded);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            setExpanded(next);
                          }}
                        >
                          <ChevronDown
                            className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')}
                          />
                          {isOpen ? '收起' : '展开'}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {isOpen && row.details && (
                        <pre className="mt-2 max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px]">
                          {tryFormatJSON(row.details)}
                        </pre>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.ip || '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </PageLayout>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    create: { label: '创建', variant: 'default' },
    update: { label: '更新', variant: 'secondary' },
    delete: { label: '删除', variant: 'destructive' },
    batch_delete: { label: '批量删除', variant: 'destructive' },
    role_assign: { label: '分配角色', variant: 'warning' },
    clear: { label: '清空', variant: 'destructive' },
    activate: { label: '激活', variant: 'success' },
    test: { label: '测试', variant: 'outline' },
  };
  const m = map[action] || { label: action, variant: 'outline' };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function ResourceBadge({ type }: { type: string }) {
  const opt = RESOURCE_OPTIONS.find((o) => o.value === type);
  return <Badge variant="outline">{opt?.label || type}</Badge>;
}

function fmtDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
}

function tryFormatJSON(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
