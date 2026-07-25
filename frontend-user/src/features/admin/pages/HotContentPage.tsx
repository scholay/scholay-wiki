import { useEffect, useState } from 'react';
import { Trash2, Loader2, FlameKindling, FileText, Search, Save } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import { useHasPermission, PERM } from '../permissions';
import {
  useHotKeywords,
  useHotPapers,
  useHotStats,
  useCleanupHotContent,
  useHotContentConfig,
  useUpdateHotContentConfig,
  HOT_CONTENT_RETENTION_MIN,
  HOT_CONTENT_RETENTION_MAX,
  HOT_CONTENT_MAX_RECORDS_MIN,
  HOT_CONTENT_MAX_RECORDS_MAX,
  type HotKeyword,
  type HotPaper,
  type SearchType,
} from '../api/hot-content';

/** 搜索类型筛选选项(undefined = 全部) */
const KW_FILTERS: Array<{ label: string; value: SearchType | undefined }> = [
  { label: '全部', value: undefined },
  { label: '文献', value: 'paper' },
  { label: '期刊', value: 'journal' },
];

/**
 * 清理策略配置卡 —— 保留天数 / 最大记录数。
 * 数据源 hot_content_config 单行表; 改完下次 cleanup (每天 04:30 / 手动) 立即按新值生效。
 * 校验范围与后端 binding 完全对齐, 提交前本地先拦。
 */
function CleanupConfigCard() {
  const cfgQ = useHotContentConfig();
  const update = useUpdateHotContentConfig();
  const apiToast = useApiToast();
  const [days, setDays] = useState('');
  const [maxRec, setMaxRec] = useState('');

  // 接到后端数据 / 保存返回后回填表单
  useEffect(() => {
    if (cfgQ.data) {
      setDays(String(cfgQ.data.retention_days));
      setMaxRec(String(cfgQ.data.max_records));
    }
  }, [cfgQ.data]);

  const d = Number(days);
  const m = Number(maxRec);
  const dValid =
    Number.isInteger(d) && d >= HOT_CONTENT_RETENTION_MIN && d <= HOT_CONTENT_RETENTION_MAX;
  const mValid =
    Number.isInteger(m) && m >= HOT_CONTENT_MAX_RECORDS_MIN && m <= HOT_CONTENT_MAX_RECORDS_MAX;
  const dirty =
    cfgQ.data &&
    (d !== cfgQ.data.retention_days || m !== cfgQ.data.max_records);

  const onSave = async () => {
    await apiToast(
      update.mutateAsync({ retention_days: d, max_records: m }),
      { success: '已保存,下次清理生效', failure: '保存失败' }
    );
  };

  return (
    <section className="mb-6 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold text-foreground">清理策略</h3>
        <span className="text-2xs text-faint">
          每天 04:30 自动清理 · 改完下次清理按新值生效
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-2xs text-muted-foreground">
            保留天数(last_*_at 早于此天数即删 · {HOT_CONTENT_RETENTION_MIN}-{HOT_CONTENT_RETENTION_MAX})
          </label>
          <Input
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            min={HOT_CONTENT_RETENTION_MIN}
            max={HOT_CONTENT_RETENTION_MAX}
            className="w-32"
            disabled={cfgQ.isLoading}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-2xs text-muted-foreground">
            最大记录数(超出按最久未动顺序删 · {HOT_CONTENT_MAX_RECORDS_MIN.toLocaleString()}-
            {HOT_CONTENT_MAX_RECORDS_MAX.toLocaleString()})
          </label>
          <Input
            type="number"
            value={maxRec}
            onChange={(e) => setMaxRec(e.target.value)}
            min={HOT_CONTENT_MAX_RECORDS_MIN}
            max={HOT_CONTENT_MAX_RECORDS_MAX}
            className="w-44"
            disabled={cfgQ.isLoading}
          />
        </div>
        <Button
          size="sm"
          onClick={onSave}
          disabled={!dirty || !dValid || !mValid || update.isPending}
        >
          {update.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          保存
        </Button>
      </div>
    </section>
  );
}

const PAGE_SIZE = 50;

export function HotContentPage() {
  const [kwType, setKwType] = useState<SearchType | undefined>(undefined);
  const [kwPage, setKwPage] = useState(1);
  const [paperPage, setPaperPage] = useState(1);
  const { data: stats } = useHotStats();
  const { data: keywords, isLoading: loadingK } = useHotKeywords(kwPage, PAGE_SIZE, 30, kwType);
  const { data: papers, isLoading: loadingP } = useHotPapers(paperPage, PAGE_SIZE);
  const cleanup = useCleanupHotContent();
  const apiToast = useApiToast();
  const confirm = useConfirm();
  // 清理策略配置 + 手动清理属系统维护(config.manage);运营(analytics.view)只读排行。
  const canManage = useHasPermission(PERM.configManage);

  // 切换类型筛选 → 回第 1 页(防停在不存在的页码)。
  useEffect(() => {
    setKwPage(1);
  }, [kwType]);

  const handleCleanup = async () => {
    const ok = await confirm({
      title: '清理过期热门数据?',
      description: '低于阈值或时间窗口外的搜索词/论文热度会被删除。',
      danger: true,
      confirmText: '清理',
    });
    if (!ok) return;
    await apiToast(cleanup.mutateAsync(), { success: '已清理', failure: '清理失败' });
  };

  // 排名 = 页偏移 + 数组下标(后端按 count desc 排序后返回)
  const keywordColumns: Column<HotKeyword>[] = [
    { header: '#', width: 50, align: 'right', cell: (_r, i) => <span className="text-faint">{(kwPage - 1) * PAGE_SIZE + i + 1}</span> },
    { header: '搜索词', cell: (r) => <span className="font-bold text-foreground">{r.keyword}</span> },
    {
      header: '类型',
      width: 80,
      cell: (r) => (
        <span
          className={
            'rounded-sm px-1.5 py-0.5 text-2xs ' +
            (r.search_type === 'journal'
              ? 'bg-warning-soft text-brand-amber'
              : 'bg-surface-2 text-subtle')
          }
        >
          {r.search_type === 'journal' ? '期刊' : '文献'}
        </span>
      ),
    },
    { header: '搜索次数', width: 110, align: 'right', cell: (r) => <span className="text-subtle">{r.search_count.toLocaleString()}</span> },
    {
      header: '最近搜索',
      width: 150,
      cell: (r) => <span className="text-2xs text-faint">{r.last_searched_at?.slice(0, 16).replace('T', ' ')}</span>,
    },
  ];

  const paperColumns: Column<HotPaper>[] = [
    { header: '#', width: 50, align: 'right', cell: (_r, i) => <span className="text-faint">{(paperPage - 1) * PAGE_SIZE + i + 1}</span> },
    {
      header: '论文',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-foreground line-clamp-1">{r.title || r.paper_id}</span>
          <span className="text-2xs text-faint font-mono">{r.paper_id}{r.year ? ` · ${r.year}` : ''}{r.venue ? ` · ${r.venue}` : ''}</span>
        </div>
      ),
    },
    { header: '曝光量', width: 90, align: 'right', cell: (r) => <span className="text-subtle">{(r.impression_count ?? 0).toLocaleString()}</span> },
    { header: '点击量', width: 90, align: 'right', cell: (r) => <span className="font-bold text-brand-red">{(r.click_count ?? 0).toLocaleString()}</span> },
    { header: 'SEO直访', width: 90, align: 'right', cell: (r) => <span className="text-brand-green">{(r.seo_view_count ?? 0).toLocaleString()}</span> },
  ];

  return (
    <AdminPageLayout
      title="热门内容"
      description={stats?.last_updated ? `最近更新:${stats.last_updated.slice(0, 16).replace('T', ' ')}` : '搜索热词 · 热门论文'}
      actions={
        canManage ? (
          <Button size="sm" variant="outline" disabled={cleanup.isPending} onClick={handleCleanup}>
            {cleanup.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            清理过期
          </Button>
        ) : undefined
      }
    >
      <section className="grid grid-cols-2 gap-4 mb-6">
        <StatCard
          icon={<Search />}
          label="热搜词条数"
          value={(stats?.total_keywords ?? keywords?.total ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<FileText />}
          label="热门论文数"
          value={(stats?.total_papers ?? papers?.total ?? 0).toLocaleString()}
        />
      </section>

      {canManage && <CleanupConfigCard />}

      <Tabs defaultValue="keywords">
        <TabsList>
          <TabsTrigger value="keywords">
            <FlameKindling className="size-3.5" />
            热门搜索词
          </TabsTrigger>
          <TabsTrigger value="papers">
            <FileText className="size-3.5" />
            热门论文
          </TabsTrigger>
        </TabsList>
        <TabsContent value="keywords" className="mt-4">
          {/* 文献 / 期刊 分类型筛选 */}
          <div className="mb-3 flex items-center gap-1">
            {KW_FILTERS.map((f) => (
              <Button
                key={f.label}
                size="sm"
                variant={kwType === f.value ? 'default' : 'outline'}
                onClick={() => setKwType(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <DataTable
            columns={keywordColumns}
            rows={keywords?.items}
            loading={loadingK}
            rowKey={(r) => `${r.search_type}:${r.keyword}`}
          />
          <Pagination total={keywords?.total ?? 0} page={kwPage} pageSize={PAGE_SIZE} onPageChange={setKwPage} />
        </TabsContent>
        <TabsContent value="papers" className="mt-4">
          <DataTable columns={paperColumns} rows={papers?.items} loading={loadingP} rowKey={(r) => r.paper_id} />
          <Pagination total={papers?.total ?? 0} page={paperPage} pageSize={PAGE_SIZE} onPageChange={setPaperPage} />
        </TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}
