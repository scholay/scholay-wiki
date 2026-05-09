/**
 * HotContent v2 — 热门关键词 / 论文统计
 *
 * 改进:
 *   - URL params 同步 tab + days + page
 *   - 用 react-query 缓存,切 tab 不重复 fetch
 *   - 清理用 ConfirmDialog 取代 confirm()
 *   - 统计卡片 + 分 tab 表格清晰分层
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RefreshCw,
  Trash2,
  Hash,
  FileText,
  Calendar,
  Database,
  ExternalLink,
  Download,
  Search,
} from 'lucide-react';

import api from '../../../services/client';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
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

interface HotKeyword {
  id: number;
  keyword: string;
  search_count: number;
  last_searched_at: string;
}

interface HotPaper {
  id: number;
  paper_id?: string;
  title: string;
  doi?: string;
  year?: number | string;
  view_count: number;
  last_viewed_at: string;
}

interface Stats {
  keywords_count?: number;
  papers_count?: number;
  retention_days?: number;
  max_records?: number;
}

const DAYS_OPTIONS = [
  { value: '7', label: '近 7 天' },
  { value: '15', label: '近 15 天' },
  { value: '30', label: '近 30 天' },
  { value: '60', label: '近 60 天' },
  { value: '90', label: '近 3 个月' },
  { value: '180', label: '近 6 个月' },
];

const PAGE_SIZE = 20;

export default function HotContentV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const tab = (searchParams.get('tab') || 'keywords') as 'keywords' | 'papers';
  const days = searchParams.get('days') || '30';
  const page = Number(searchParams.get('page') || 1);

  function patch(p: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(p).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  const statsQuery = useQuery({
    queryKey: ['admin', 'hot', 'stats'],
    queryFn: async () => {
      const r = await api.get('/admin/hot-content/stats');
      return (r.data?.data || {}) as Stats;
    },
    staleTime: 60_000,
  });

  const listQuery = useQuery({
    queryKey: ['admin', 'hot', tab, days, page],
    queryFn: async () => {
      const r = await api.get(`/admin/hot-content/${tab}`, {
        params: { days: Number(days), page, page_size: PAGE_SIZE },
      });
      return (r.data?.data || { items: [], total: 0 }) as {
        items: HotKeyword[] | HotPaper[];
        total: number;
      };
    },
    placeholderData: keepPreviousData,
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const r = await api.post('/admin/hot-content/cleanup');
      return r.data?.data;
    },
    onSuccess: () => {
      toast.success('已清理过期数据');
      setShowCleanup(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'hot'] });
    },
    onError: () => toast.error('清理失败'),
  });

  const [showCleanup, setShowCleanup] = useState(false);

  const items = (listQuery.data?.items ?? []) as any[];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 切 tab / 切 days 时回 page 1
  useEffect(() => {
    if (page > totalPages && totalPages >= 1) {
      patch({ page: '1' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, days]);

  return (
    <PageLayout
      title="热门内容"
      description="搜索关键词与论文热度统计,后端 5 分钟缓存"
      actions={
        <>
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
          <Button
            variant="outline"
            size="sm"
            disabled={items.length === 0}
            onClick={() => exportCsv(tab, items, page, days)}
          >
            <Download className="h-4 w-4" />
            导出当前页
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCleanup(true)}>
            <Trash2 className="h-4 w-4" />
            清理过期数据
          </Button>
        </>
      }
    >
      {/* 统计 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          title="关键词总数"
          value={statsQuery.data?.keywords_count ?? 0}
          icon={<Hash className="h-4 w-4 text-blue-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="论文总数"
          value={statsQuery.data?.papers_count ?? 0}
          icon={<FileText className="h-4 w-4 text-violet-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="保留天数"
          value={statsQuery.data?.retention_days ?? 0}
          icon={<Calendar className="h-4 w-4 text-emerald-500" />}
          loading={statsQuery.isLoading}
          unit="天"
        />
        <StatCard
          title="最大记录数"
          value={statsQuery.data?.max_records ?? 0}
          icon={<Database className="h-4 w-4 text-amber-500" />}
          loading={statsQuery.isLoading}
        />
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 rounded-md border bg-background p-1 w-fit">
        <button
          onClick={() => patch({ tab: 'keywords', page: undefined })}
          className={cn(
            'rounded-sm px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'keywords'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          热门关键词
        </button>
        <button
          onClick={() => patch({ tab: 'papers', page: undefined })}
          className={cn(
            'rounded-sm px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'papers'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          热门论文
        </button>
      </div>

      <SectionCard
        title={tab === 'keywords' ? '搜索关键词排行' : '论文浏览排行'}
        description={`共 ${total} 条`}
        bodyPadded={false}
        toolbar={
          <Select value={days} onValueChange={(v) => patch({ days: v, page: undefined })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <TableHead className="w-12">#</TableHead>
              {tab === 'keywords' ? (
                <>
                  <TableHead>关键词</TableHead>
                  <TableHead className="w-32 text-right">搜索次数</TableHead>
                  <TableHead className="w-44">最后搜索</TableHead>
                </>
              ) : (
                <>
                  <TableHead>论文</TableHead>
                  <TableHead className="w-20">年份</TableHead>
                  <TableHead className="w-32 text-right">查看次数</TableHead>
                  <TableHead className="w-44">最后查看</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  <TableCell colSpan={tab === 'keywords' ? 4 : 5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tab === 'keywords' ? 4 : 5}>
                  <EmptyState
                    title={tab === 'keywords' ? '暂无热门关键词' : '暂无热门论文'}
                    description="所选时间范围内还没有数据"
                  />
                </TableCell>
              </TableRow>
            ) : tab === 'keywords' ? (
              (items as HotKeyword[]).map((k, idx) => (
                <TableRow key={k.id}>
                  <TableCell className="text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + idx + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <a
                      href={`/search-results?query=${encodeURIComponent(k.keyword)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      title="在用户端搜索这个关键词"
                    >
                      {k.keyword}
                      <Search className="h-3 w-3 opacity-50" />
                    </a>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {k.search_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(k.last_searched_at)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              (items as HotPaper[]).map((p, idx) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="line-clamp-2 font-medium">{p.title}</div>
                    {p.doi && (
                      <a
                        href={`https://doi.org/${p.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                      >
                        {p.doi}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.year ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.view_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(p.last_viewed_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      <ConfirmDialog
        open={showCleanup}
        onOpenChange={setShowCleanup}
        title="清理过期数据?"
        description={`将删除超过 ${
          statsQuery.data?.retention_days ?? 30
        } 天的关键词与论文记录。此操作不可撤销。`}
        destructive
        loading={cleanupMutation.isPending}
        onConfirm={() => cleanupMutation.mutate()}
      />
    </PageLayout>
  );
}

/** 简单 CSV 导出 — 只导当前页(完整导出走后端 endpoint,后续做) */
function exportCsv(
  tab: 'keywords' | 'papers',
  items: any[],
  page: number,
  days: string,
) {
  if (items.length === 0) return;
  const header =
    tab === 'keywords'
      ? ['rank', 'keyword', 'search_count', 'last_searched_at']
      : ['rank', 'title', 'doi', 'year', 'view_count', 'last_viewed_at'];
  const rows = items.map((it: any, i) => {
    const rank = (page - 1) * 20 + i + 1;
    if (tab === 'keywords') {
      return [rank, it.keyword, it.search_count, it.last_searched_at || ''];
    }
    return [rank, it.title, it.doi || '', it.year || '', it.view_count, it.last_viewed_at || ''];
  });
  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          // 标准 CSV 转义:含引号 / 逗号 / 换行的字段加引号并双倍引号
          return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
  // BOM 让 Excel 正确识别 UTF-8
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hot-${tab}-${days}d-p${page}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
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
  unit,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  loading?: boolean;
  unit?: string;
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
              {unit && (
                <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
              )}
            </p>
          )}
        </div>
        <div className="rounded-md bg-muted/40 p-2">{icon}</div>
      </CardContent>
    </Card>
  );
}
