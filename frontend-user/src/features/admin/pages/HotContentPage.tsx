import { Trash2, Loader2, FlameKindling, FileText, Search } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useHotKeywords,
  useHotPapers,
  useHotStats,
  useCleanupHotContent,
  type HotKeyword,
  type HotPaper,
} from '../api/hot-content';

export function HotContentPage() {
  const { data: stats } = useHotStats();
  const { data: keywords, isLoading: loadingK } = useHotKeywords(50);
  const { data: papers, isLoading: loadingP } = useHotPapers(50);
  const cleanup = useCleanupHotContent();
  const apiToast = useApiToast();
  const confirm = useConfirm();

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

  // 排名 = 数组下标(后端按 count desc 排序后返回)
  const keywordColumns: Column<HotKeyword>[] = [
    { header: '#', width: 50, align: 'right', cell: (_r, i) => <span className="text-faint">{i + 1}</span> },
    { header: '搜索词', cell: (r) => <span className="font-bold text-foreground">{r.keyword}</span> },
    { header: '搜索次数', width: 120, align: 'right', cell: (r) => <span className="text-subtle">{r.search_count.toLocaleString()}</span> },
    {
      header: '最近搜索',
      width: 150,
      cell: (r) => <span className="text-2xs text-faint">{r.last_searched_at?.slice(0, 16).replace('T', ' ')}</span>,
    },
  ];

  const paperColumns: Column<HotPaper>[] = [
    { header: '#', width: 50, align: 'right', cell: (_r, i) => <span className="text-faint">{i + 1}</span> },
    {
      header: '论文',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-foreground line-clamp-1">{r.title || r.paper_id}</span>
          <span className="text-2xs text-faint font-mono">{r.paper_id}{r.year ? ` · ${r.year}` : ''}{r.venue ? ` · ${r.venue}` : ''}</span>
        </div>
      ),
    },
    { header: '浏览量', width: 120, align: 'right', cell: (r) => <span className="text-subtle">{r.view_count.toLocaleString()}</span> },
  ];

  return (
    <AdminPageLayout
      title="热门内容"
      description={stats?.last_updated ? `最近更新:${stats.last_updated.slice(0, 16).replace('T', ' ')}` : '搜索热词 · 热门论文'}
      actions={
        <Button size="sm" variant="outline" disabled={cleanup.isPending} onClick={handleCleanup}>
          {cleanup.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          清理过期
        </Button>
      }
    >
      <section className="grid grid-cols-2 gap-4 mb-6">
        <StatCard
          icon={<Search />}
          label="热搜词条数"
          value={(stats?.total_keywords ?? keywords?.length ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<FileText />}
          label="热门论文数"
          value={(stats?.total_papers ?? papers?.length ?? 0).toLocaleString()}
        />
      </section>

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
          <DataTable columns={keywordColumns} rows={keywords} loading={loadingK} rowKey={(r) => r.keyword} />
        </TabsContent>
        <TabsContent value="papers" className="mt-4">
          <DataTable columns={paperColumns} rows={papers} loading={loadingP} rowKey={(r) => r.paper_id} />
        </TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}
