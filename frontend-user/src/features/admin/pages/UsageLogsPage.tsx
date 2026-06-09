import { useState } from 'react';
import { Download, Trash2, Loader2, Activity, Users } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { StatCard } from '../components/StatCard';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import { useUrlState, useDebounce, usePatchUrlState } from '@/shared/hooks';
import { DateRangeControl, windowToDateRange, type DateWindow } from '../components/DateRangeControl';
import {
  useUsageLogs,
  useUsageLogSummary,
  useUsageLogConfig,
  useUpdateUsageLogConfig,
  useTriggerUsageLogCleanup,
  exportUsageLogsCSV,
  type UsageLog,
} from '../api/usage-logs';

export function UsageLogsPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [featureCode, setFeatureCode] = useUrlState('feature', '');
  const [days] = useUrlState('days', '');
  const [startDate] = useUrlState('start', '');
  const [endDate] = useUrlState('end', '');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);
  const [exporting, setExporting] = useState(false);
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const patch = usePatchUrlState();

  // 日期窗口:start+end(今天/自定义)优先,否则按 days 预设(默认近 7 天)。
  const win: DateWindow = startDate && endDate ? { start: startDate, end: endDate } : { days: days ? Number(days) : 7 };
  const setWin = (w: DateWindow) => {
    if (w.start && w.end) patch({ days: null, start: w.start, end: w.end, page: '1' });
    else patch({ days: String(w.days ?? 7), start: null, end: null, page: '1' });
  };
  const range = windowToDateRange(win);

  const params = {
    page,
    page_size: 30,
    feature_code: featureCode || undefined,
    keyword: search || undefined,
    start_date: range.start,
    end_date: range.end,
  };

  const { data, isLoading } = useUsageLogs(params);
  const { data: summary } = useUsageLogSummary({ start_date: range.start, end_date: range.end });
  const { data: config } = useUsageLogConfig();
  const updateConfig = useUpdateUsageLogConfig();
  const cleanup = useTriggerUsageLogCleanup();

  const handleExport = async () => {
    setExporting(true);
    await apiToast(exportUsageLogsCSV(params), { success: 'CSV 已下载', failure: '导出失败' });
    setExporting(false);
  };

  const handleCleanup = async () => {
    const ok = await confirm({
      title: `立即清理 ${config?.retention_days ?? '?'} 天前的日志?`,
      description: '该操作触发后端定时任务,会异步删除超过保留期的所有日志条目。',
      danger: true,
      confirmText: '立即清理',
    });
    if (!ok) return;
    await apiToast(cleanup.mutateAsync(), { success: '清理任务已触发', failure: '清理失败' });
  };

  const handleConfigSave = async (retention_days: number) => {
    await apiToast(updateConfig.mutateAsync({ retention_days }), { success: '已保存', failure: '保存失败' });
  };

  const columns: Column<UsageLog>[] = [
    {
      header: '时间',
      width: 150,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.created_at?.slice(0, 19).replace('T', ' ')}</span>,
    },
    {
      header: '用户',
      width: 140,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-foreground text-xs font-bold">User #{r.user_id}</span>
          {r.session_id && <span className="text-2xs text-faint truncate">{r.session_id.slice(0, 8)}…</span>}
        </div>
      ),
    },
    {
      header: '功能',
      width: 200,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-xs text-subtle">{r.feature_name || r.feature_code}</span>
          <span className="text-2xs text-faint font-mono">{r.feature_code}</span>
        </div>
      ),
    },
    { header: '动作', cell: (r) => <Badge variant="muted">{r.action}</Badge> },
    {
      header: '入口',
      width: 110,
      cell: (r) => <span className="text-2xs text-faint">{r.entry_point || '—'}</span>,
    },
  ];

  return (
    <AdminPageLayout
      title="使用日志"
      description={`共 ${data?.total ?? 0} 条 · 功能 / API 用量审计 · 可导出 CSV`}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={exporting} onClick={handleExport}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            导出 CSV
          </Button>
          <Button size="sm" variant="outline" disabled={cleanup.isPending} onClick={handleCleanup}>
            {cleanup.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            立即清理
          </Button>
        </div>
      }
    >
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatCard
          icon={<Activity />}
          label="总调用次数"
          value={(summary?.total_calls ?? 0).toLocaleString()}
          hint={`${range.start} → ${range.end}`}
        />
        <StatCard
          icon={<Users />}
          label="独立用户"
          value={(summary?.unique_users ?? 0).toLocaleString()}
        />
        <div className="rounded-md border border-border bg-background p-4">
          <div className="text-sm text-faint mb-2">保留策略</div>
          <div className="text-xl font-bold text-foreground">{config?.retention_days ?? '—'} 天</div>
          <div className="mt-2 flex gap-1">
            <Input
              type="number"
              defaultValue={config?.retention_days}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0 && v !== config?.retention_days) handleConfigSave(v);
              }}
              className="h-7 w-20"
            />
            <span className="self-center text-2xs text-faint">天后清理</span>
          </div>
        </div>
      </section>

      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-border-soft bg-surface-1 p-3">
        <div className="space-y-1">
          <Label className="text-2xs text-faint tracking-[0.12em]">用户 / 关键词</Label>
          <Input
            placeholder="ID / 用户名 / 邮箱 / 手机号 / 路径"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            className="h-8 w-56"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-2xs text-faint tracking-[0.12em]">功能代码</Label>
          <Input
            placeholder="search / chat / analysis"
            value={featureCode}
            onChange={(e) => {
              setFeatureCode(e.target.value);
              setPage(1);
            }}
            className="h-8 w-44"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-2xs text-faint tracking-[0.12em]">日期</Label>
          <DateRangeControl value={win} onChange={setWin} />
        </div>
        {(featureCode || searchInput) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFeatureCode('');
              setSearchInput('');
              setPage(1);
            }}
          >
            重置
          </Button>
        )}
      </section>

      <DataTable columns={columns} rows={data?.list} loading={isLoading} />

      <Pagination total={data?.total ?? 0} page={page} pageSize={30} onPageChange={setPage} />
    </AdminPageLayout>
  );
}
