import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import { DataTable, type Column } from '../DataTable';
import { Pagination } from '../Pagination';
import { useApiToast } from '../../hooks/useApiToast';
import {
  useTokenUsageLogs,
  exportTokenUsageCSV,
  FEATURE_OPTIONS,
  SOURCE_OPTIONS,
  type TokenLog,
  type TokenUsageFilters,
  type TokenLogParams,
} from '../../api/token-usage';

/** user_id 为 null → 公众号/匿名;否则优先用户名/邮箱,兜底 #id。 */
function userLabel(r: TokenLog): string {
  if (r.user_id == null) return '公众号/匿名';
  return r.username || r.email || `#${r.user_id}`;
}

const featureLabel = (f: string) => FEATURE_OPTIONS.find((o) => o.value === f)?.label ?? f;
const sourceLabel = (s: string) => SOURCE_OPTIONS.find((o) => o.value === s)?.label ?? s;

/**
 * 调用明细表 —— 共享上方筛选条件(filters),自管分页/排序/CSV 导出。
 * 后端分页(page_size 30,house 默认);排序走后端白名单(时间 / 总用量)。
 */
export function TokenUsageLogTable({ filters }: { filters: TokenUsageFilters }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'created_at' | 'total_tokens'>('created_at');
  const [exporting, setExporting] = useState(false);
  const apiToast = useApiToast();

  // 上方筛选或排序变化 → 回到第 1 页(否则可能停在不存在的页码)。
  const fkey = JSON.stringify(filters);
  useEffect(() => {
    setPage(1);
  }, [fkey, sort]);

  const params: TokenLogParams = { ...filters, page, page_size: 30, sort };
  const { data, isLoading } = useTokenUsageLogs(params);

  const handleExport = async () => {
    setExporting(true);
    await apiToast(exportTokenUsageCSV(params), { success: 'CSV 已下载', failure: '导出失败' });
    setExporting(false);
  };

  const numCell = (v: number) => <span className="tabular-nums text-xs">{v.toLocaleString()}</span>;

  const columns: Column<TokenLog>[] = [
    {
      header: '时间',
      width: 150,
      cell: (r) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {r.created_at?.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      header: '用户',
      width: 150,
      cell: (r) => (
        <div className="flex flex-col">
          <span className={cn('text-xs font-bold', r.user_id == null ? 'text-faint' : 'text-foreground')}>
            {userLabel(r)}
          </span>
          {r.user_id != null && r.email && <span className="text-2xs text-faint truncate">{r.email}</span>}
        </div>
      ),
    },
    { header: '功能', width: 90, cell: (r) => <Badge variant="muted">{featureLabel(r.feature)}</Badge> },
    {
      header: '来源',
      width: 70,
      cell: (r) => <span className="text-2xs text-faint">{sourceLabel(r.source)}</span>,
    },
    {
      header: '模型',
      width: 160,
      cell: (r) => <span className="text-xs text-subtle font-mono truncate">{r.model || '—'}</span>,
    },
    {
      header: 'Provider / 账号',
      width: 150,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-2xs text-subtle truncate">{r.provider || '—'}</span>
          {r.account_name && <span className="text-2xs text-faint truncate">{r.account_name}</span>}
        </div>
      ),
    },
    { header: '输入', width: 80, align: 'right', cell: (r) => numCell(r.input_tokens) },
    { header: '输出', width: 80, align: 'right', cell: (r) => numCell(r.output_tokens) },
    {
      header: '总',
      width: 90,
      align: 'right',
      cell: (r) => <span className="tabular-nums text-xs font-bold text-foreground">{r.total_tokens.toLocaleString()}</span>,
    },
    {
      header: '缓存(读/创)',
      width: 110,
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums text-2xs text-faint">
          {r.cache_read_tokens.toLocaleString()} / {r.cache_creation_tokens.toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">
          调用明细
          <span className="ml-2 text-xs font-normal text-faint">共 {(data?.total ?? 0).toLocaleString()} 条</span>
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {([
              ['created_at', '按时间'],
              ['total_tokens', '按用量'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={cn(
                  'h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
                  sort === k
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" disabled={exporting} onClick={handleExport}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            导出 CSV
          </Button>
        </div>
      </div>

      <DataTable columns={columns} rows={data?.logs} loading={isLoading} emptyMessage="暂无调用记录" />
      <Pagination total={data?.total ?? 0} page={page} pageSize={30} onPageChange={setPage} />
    </section>
  );
}
