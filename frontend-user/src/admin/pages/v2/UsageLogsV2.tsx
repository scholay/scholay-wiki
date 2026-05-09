/**
 * UsageLogs v2 — 使用日志查询(精简核心版)
 *
 * 保留:
 *   - 日志列表 + 分页
 *   - 关键筛选 (feature/keyword/ip)
 *   - 日期范围 (近 1/7/30 天)
 *   - Summary 4 个统计 (total/today/unique users/unique sessions)
 *   - 清空全部日志(危险操作)
 *
 * 简化:
 *   - 趋势图先去掉(后续可补 recharts)
 *   - retention_days 编辑放进设置 Dialog(可后做)
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RefreshCw,
  Search,
  Trash2,
  Activity,
  Users,
  Clock,
  Database,
  Download,
  X,
} from 'lucide-react';

import api from '../../../services/client';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { DangerConfirmDialog } from '../../components/ui/danger-confirm-dialog';
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

interface LogRow {
  id: number | string;
  created_at?: string;
  feature_code?: string;
  feature_name?: string;
  entry_point?: string;
  ip_address?: string;
  device_type?: string;
  browser?: string;
  user_id?: number;
  user_email?: string;
}

interface Summary {
  total_count?: number;
  today_count?: number;
  unique_users?: number;
  unique_sessions?: number;
  feature_counts?: { feature_code: string; feature_name: string; count: number }[];
}

interface FeatureOption {
  feature_code: string;
  feature_name: string;
}

const RANGE_OPTIONS = [
  { value: '1', label: '最近 1 天' },
  { value: '7', label: '最近 7 天' },
  { value: '30', label: '最近 30 天' },
];

const PAGE_SIZE = 20;

export default function UsageLogsV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const days = searchParams.get('days') || '7';
  const feature = searchParams.get('feature') || 'all';
  const keyword = searchParams.get('q') || '';
  const ip = searchParams.get('ip') || '';
  const userId = searchParams.get('user_id') || ''; // 深链:从 UserDetail 跳过来
  const page = Number(searchParams.get('page') || 1);

  const [keywordInput, setKeywordInput] = useState(keyword);
  const [ipInput, setIpInput] = useState(ip);
  useEffect(() => setKeywordInput(keyword), [keyword]);
  useEffect(() => setIpInput(ip), [ip]);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      let changed = false;
      if (keywordInput !== keyword) {
        if (keywordInput) next.set('q', keywordInput);
        else next.delete('q');
        changed = true;
      }
      if (ipInput !== ip) {
        if (ipInput) next.set('ip', ipInput);
        else next.delete('ip');
        changed = true;
      }
      if (changed) {
        next.set('page', '1');
        setSearchParams(next, { replace: true });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordInput, ipInput]);

  function patch(p: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(p).forEach(([k, v]) => {
      if (!v || v === 'all') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  // 时间范围 → start/end
  const { startTime, endTime } = computeRange(Number(days) || 7);

  const summaryQuery = useQuery({
    queryKey: ['admin', 'usageLogs', 'summary', { days, feature, keyword, ip }],
    queryFn: async () => {
      const r = await api.get('/admin/usage-logs/summary', {
        params: {
          start_time: startTime,
          end_time: endTime,
          ...(feature !== 'all' ? { feature_code: feature } : {}),
          ...(keyword ? { keyword } : {}),
          ...(ip ? { ip_address: ip } : {}),
          ...(userId ? { user_id: userId } : {}),
        },
      });
      return (r.data?.data || {}) as Summary;
    },
    staleTime: 30_000,
  });

  const optionsQuery = useQuery({
    queryKey: ['admin', 'usageLogs', 'options'],
    queryFn: async () => {
      const r = await api.get('/admin/usage-logs/filter-options');
      const data = r.data?.data || {};
      return {
        features: (data.features || []) as FeatureOption[],
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const listQuery = useQuery({
    queryKey: ['admin', 'usageLogs', 'list', { days, feature, keyword, ip, page }],
    queryFn: async () => {
      const r = await api.get('/admin/usage-logs', {
        params: {
          page,
          page_size: PAGE_SIZE,
          start_time: startTime,
          end_time: endTime,
          ...(feature !== 'all' ? { feature_code: feature } : {}),
          ...(keyword ? { keyword } : {}),
          ...(ip ? { ip_address: ip } : {}),
          ...(userId ? { user_id: userId } : {}),
        },
      });
      const data = r.data?.data || {};
      return {
        items: (data.list || data.items || data.logs || []) as LogRow[],
        total: (data.total ?? 0) as number,
      };
    },
    placeholderData: keepPreviousData,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await api.delete('/admin/usage-logs/all');
    },
    onSuccess: () => {
      toast.success('已清空全部日志');
      setShowClear(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'usageLogs'] });
    },
    onError: () => toast.error('清空失败'),
  });

  const [showClear, setShowClear] = useState(false);

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageLayout
      title="使用日志"
      description="平台功能调用 / 用户行为审计日志"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              listQuery.refetch();
              summaryQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const params = new URLSearchParams();
              params.set('start_time', startTime);
              params.set('end_time', endTime);
              if (feature !== 'all') params.set('feature_code', feature);
              if (keyword) params.set('keyword', keyword);
              if (ip) params.set('ip_address', ip);
              if (userId) params.set('user_id', userId);
              // 走 axios baseURL,默认 /api/v1
              const url = `/api/v1/admin/usage-logs/export?${params.toString()}`;
              const a = document.createElement('a');
              a.href = url;
              a.click();
            }}
            title="导出当前筛选条件下的所有日志(上限 5 万条)"
          >
            <Download className="h-4 w-4" />
            导出 CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowClear(true)}>
            <Trash2 className="h-4 w-4" />
            清空全部
          </Button>
        </>
      }
    >
      {/* user_id 深链筛选条 */}
      {userId && (
        <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50/70 px-4 py-2 text-sm">
          <span className="flex items-center gap-2 text-blue-900">
            <Users className="h-4 w-4" />
            正在查看用户 <code className="rounded bg-blue-100 px-1.5 py-0.5">#{userId}</code> 的日志
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-blue-800 hover:text-blue-900"
            onClick={() => patch({ user_id: undefined, page: '1' })}
          >
            <X className="h-3.5 w-3.5" />
            移除筛选
          </Button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          title="总调用"
          value={summaryQuery.data?.total_count ?? 0}
          icon={<Activity className="h-4 w-4 text-blue-500" />}
          loading={summaryQuery.isLoading}
        />
        <StatCard
          title="今日调用"
          value={summaryQuery.data?.today_count ?? 0}
          icon={<Clock className="h-4 w-4 text-violet-500" />}
          loading={summaryQuery.isLoading}
        />
        <StatCard
          title="独立用户"
          value={summaryQuery.data?.unique_users ?? 0}
          icon={<Users className="h-4 w-4 text-emerald-500" />}
          loading={summaryQuery.isLoading}
        />
        <StatCard
          title="独立会话"
          value={summaryQuery.data?.unique_sessions ?? 0}
          icon={<Database className="h-4 w-4 text-amber-500" />}
          loading={summaryQuery.isLoading}
        />
      </div>

      <SectionCard
        title="日志列表"
        description={`共 ${total} 条`}
        bodyPadded={false}
        toolbar={
          <>
            <Select value={days} onValueChange={(v) => patch({ days: v, page: '1' })}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={feature}
              onValueChange={(v) => patch({ feature: v, page: '1' })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="功能" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部功能</SelectItem>
                {(optionsQuery.data?.features ?? []).map((f) => (
                  <SelectItem key={f.feature_code} value={f.feature_code}>
                    {f.feature_name || f.feature_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索 关键词"
                className="w-44 pl-8"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
              />
            </div>
            <Input
              placeholder="IP"
              className="w-36"
              value={ipInput}
              onChange={(e) => setIpInput(e.target.value)}
            />
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
              <TableHead>功能</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>IP / 设备</TableHead>
              <TableHead>入口</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState title="暂无日志" description="所选时间范围内没有匹配的日志" />
                </TableCell>
              </TableRow>
            ) : (
              items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(log.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.feature_name || log.feature_code || '—'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.user_email || (log.user_id ? `#${log.user_id}` : '游客')}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div>{log.ip_address || '—'}</div>
                    {(log.device_type || log.browser) && (
                      <div className="text-xs">
                        {log.device_type} {log.browser}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.entry_point || '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      <DangerConfirmDialog
        open={showClear}
        onOpenChange={setShowClear}
        title="清空全部使用日志"
        description={
          <>
            将<strong className="text-destructive">永久删除所有历史日志</strong>,无法恢复。
            合规审计场景请先<strong>导出 CSV</strong> 备份。
          </>
        }
        confirmWord="CLEAR"
        confirmText="确认清空全部"
        loading={clearMutation.isPending}
        onConfirm={() => clearMutation.mutate()}
      />
    </PageLayout>
  );
}

function computeRange(days: number) {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { startTime: fmt(start), endTime: fmt(end) };
}

function fmtDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
}

function StatCard({
  title,
  value,
  icon,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  loading?: boolean;
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
              {value.toLocaleString()}
            </p>
          )}
        </div>
        <div className="rounded-md bg-muted/40 p-2">{icon}</div>
      </CardContent>
    </Card>
  );
}
