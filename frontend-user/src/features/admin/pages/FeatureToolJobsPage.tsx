import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { useImportJobs, useImportJob, type ImportJob } from '../api/feature-tools';

const STATUS: Record<string, { text: string; variant: 'default' | 'outline' | 'success' | 'warning' | 'destructive' }> = {
  pending: { text: '排队中', variant: 'outline' },
  running: { text: '处理中', variant: 'warning' },
  succeeded: { text: '成功', variant: 'success' },
  partial: { text: '部分成功', variant: 'warning' },
  failed: { text: '失败', variant: 'destructive' },
};

export function FeatureToolJobsPage() {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading } = useImportJobs({ page, page_size: 20 });
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const columns: Column<ImportJob>[] = [
    { header: '任务', width: 64, cell: (r) => <span className="font-mono text-xs text-faint">#{r.id}</span> },
    {
      header: '状态', width: 90,
      cell: (r) => { const s = STATUS[r.status] ?? { text: r.status, variant: 'outline' as const }; return <Badge variant={s.variant}>{s.text}</Badge>; },
    },
    { header: '来源', width: 80, cell: (r) => <span className="text-xs text-muted-foreground">{r.source}{r.filename ? `·${r.filename}` : ''}</span> },
    { header: '总数', width: 56, align: 'right', cell: (r) => <span className="text-xs">{r.total}</span> },
    { header: '新增', width: 56, align: 'right', cell: (r) => <span className="text-xs text-brand-green">{r.created_cnt}</span> },
    { header: '更新', width: 56, align: 'right', cell: (r) => <span className="text-xs text-brand-amber">{r.updated_cnt}</span> },
    { header: '失败', width: 56, align: 'right', cell: (r) => <span className={`text-xs ${r.failed_cnt > 0 ? 'text-brand-red' : 'text-faint'}`}>{r.failed_cnt}</span> },
    { header: '通知', width: 56, cell: (r) => <span className="text-2xs text-faint">{r.notify ? '是' : '否'}</span> },
    { header: '时间', width: 150, cell: (r) => <span className="text-2xs text-faint">{r.created_at?.slice(0, 19).replace('T', ' ')}</span> },
    { header: '', width: 64, align: 'right', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setOpenId(r.id)}>详情</Button> },
  ];

  return (
    <AdminPageLayout
      title="导入任务"
      description="功能广场批量导入历史 · 点击查看逐条结果"
      actions={<Button asChild variant="outline" size="sm"><Link to="/admin/tools"><ArrowLeft className="size-3.5" />返回列表</Link></Button>}
    >
      <DataTable columns={columns} rows={data?.items} loading={isLoading} emptyMessage="还没有导入任务" />
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-faint">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-8 border border-border px-2 py-1 disabled:opacity-40 hover:bg-surface-1">上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-8 border border-border px-2 py-1 disabled:opacity-40 hover:bg-surface-1">下一页</button>
        </div>
      )}
      <JobDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </AdminPageLayout>
  );
}

function JobDetailDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data: job } = useImportJob(id ?? undefined, !!id);
  const running = job?.status === 'pending' || job?.status === 'running';
  const failures = (job?.detail ?? []).filter((d) => d.action === 'failed');
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      {id && (
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>导入任务 #{id} {running ? '· 处理中…' : ''}</DialogTitle></DialogHeader>
        {job && (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="总数" value={job.total} />
              <Stat label="新增" value={job.created_cnt} tone="text-brand-green" />
              <Stat label="更新" value={job.updated_cnt} tone="text-brand-amber" />
              <Stat label="失败" value={job.failed_cnt} tone={job.failed_cnt > 0 ? 'text-brand-red' : 'text-faint'} />
            </div>
            {job.error && <p className="rounded-8 bg-danger-soft p-2 text-xs text-brand-red">{job.error}</p>}
            {failures.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold text-subtle">失败明细 ({failures.length})</p>
                <div className="space-y-1">
                  {failures.map((f) => (
                    <div key={f.idx} className="rounded-8 border border-border-soft bg-surface-1 px-2 py-1.5 text-xs">
                      <span className="text-foreground">#{f.idx} {f.name || '(无名)'}</span>
                      <span className="ml-2 text-brand-red">{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {failures.length === 0 && !running && (
              <p className="text-xs text-muted-foreground">全部成功,无失败条目。</p>
            )}
          </div>
        )}
      </DialogContent>
      )}
    </Dialog>
  );
}

function Stat({ label, value, tone = 'text-foreground' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-8 border border-border bg-surface-card p-2 text-center">
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-2xs text-faint">{label}</p>
    </div>
  );
}
