import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { LoadingState, ResourceError } from '@/shared/components';
import { useUrlState } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { TimeCell } from '../components/TimeCell';
import {
  useImportJobs, useImportJob, isJobRunning,
  IMPORT_JOB_STATUS_LABEL, type ImportJob,
} from '../api/feature-tools';

/** 状态 → Badge 配色(文案取自 api 层的 IMPORT_JOB_STATUS_LABEL,两页共用一份) */
const STATUS_VARIANT: Record<string, 'default' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  pending: 'outline',
  running: 'warning',
  succeeded: 'success',
  partial: 'warning',
  failed: 'destructive',
};

const PAGE_SIZE = 20;

export function FeatureToolJobsPage() {
  const [page, setPage] = useState(1);
  // 深链:导入页的「查看 N 条失败明细 →」直接带 ?job=<id> 过来,落地即打开详情
  const [openId, setOpenId] = useUrlState('job', 0, Number);
  const { data, isLoading, isFetching, error, refetch } = useImportJobs({ page, page_size: PAGE_SIZE });
  const total = data?.total ?? 0;

  const columns: Column<ImportJob>[] = [
    { header: '任务', width: 64, cell: (r) => <span className="font-mono text-12 text-faint">#{r.id}</span> },
    {
      header: '状态', width: 90,
      cell: (r) => (
        <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'}>
          {IMPORT_JOB_STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
    { header: '来源', width: 80, cell: (r) => <span className="text-12 text-muted-foreground">{r.source}{r.filename ? `·${r.filename}` : ''}</span> },
    { header: '总数', width: 56, align: 'right', cell: (r) => <span className="text-12">{r.total}</span> },
    { header: '新增', width: 56, align: 'right', cell: (r) => <span className="text-12 text-brand-green">{r.created_cnt}</span> },
    { header: '更新', width: 56, align: 'right', cell: (r) => <span className="text-12 text-brand-amber">{r.updated_cnt}</span> },
    // 跳过 = 幂等命中(同 source_topic_id / slug 且无变化)。少了这一列,
    // total 就和 新增+更新+失败 对不上账,看的人只能怀疑「另外那些条丢了」。
    { header: '跳过', width: 56, align: 'right', cell: (r) => <span className="text-12 text-faint">{r.skipped_cnt}</span> },
    { header: '失败', width: 56, align: 'right', cell: (r) => <span className={`text-12 ${r.failed_cnt > 0 ? 'text-brand-red' : 'text-faint'}`}>{r.failed_cnt}</span> },
    { header: '通知', width: 56, cell: (r) => <span className="text-12 text-faint">{r.notify ? '是' : '否'}</span> },
    { header: '时间', width: 130, cell: (r) => <TimeCell value={r.created_at} /> },
    { header: '', width: 64, align: 'right', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setOpenId(r.id)}>详情</Button> },
  ];

  return (
    <AdminPageLayout
      title="导入任务"
      description="功能广场批量导入历史 · 点击查看逐条结果 · 总数 = 新增 + 更新 + 跳过 + 失败"
      onRefresh={() => void refetch()}
      refreshing={isFetching}
      actions={<Button asChild variant="outline" size="sm"><Link to="/admin/tools"><ArrowLeft className="size-3.5" />返回列表</Link></Button>}
    >
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="还没有导入任务"
        emptyDescription="在「导入工具」页粘贴 JSON 或上传 zip 后,任务会出现在这里。"
        emptyAction={<Button asChild size="sm"><Link to="/admin/tools-import">去导入</Link></Button>}
      />
      <Pagination total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
      <JobDetailDialog id={openId || null} onClose={() => setOpenId(0)} />
    </AdminPageLayout>
  );
}

function JobDetailDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data: job, isLoading, isError, error, refetch } = useImportJob(id ?? undefined, !!id);
  const running = isJobRunning(job?.status);
  const failures = (job?.detail ?? []).filter((d) => d.action === 'failed');
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      {id && (
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>导入任务 #{id} {running ? '· 处理中…' : ''}</DialogTitle></DialogHeader>
        {isLoading ? (
          <LoadingState dense />
        ) : isError || !job ? (
          <ResourceError
            error={error}
            resourceName="导入任务"
            onRetry={() => void refetch()}
            autoRedirect={false}
            className="h-auto bg-transparent py-8"
          />
        ) : (
          <div className="max-h-[70dvh] space-y-4 overflow-y-auto">
            {/* 五格 —— 总数必须能被后四格加出来,否则读的人只会怀疑数据丢了 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="总数" value={job.total} />
              <Stat label="新增" value={job.created_cnt} tone="text-brand-green" />
              <Stat label="更新" value={job.updated_cnt} tone="text-brand-amber" />
              <Stat label="跳过" value={job.skipped_cnt} tone="text-faint" />
              <Stat label="失败" value={job.failed_cnt} tone={job.failed_cnt > 0 ? 'text-brand-red' : 'text-faint'} />
            </div>
            {job.error && <p className="rounded-8 bg-danger-soft p-2 text-12 text-brand-red">{job.error}</p>}
            {failures.length > 0 && (
              <div>
                <p className="mb-1.5 text-12 font-medium text-subtle">失败明细 ({failures.length})</p>
                <div className="space-y-1">
                  {failures.map((f) => (
                    <div key={f.idx} className="rounded-8 border border-border-soft bg-surface-1 px-2 py-1.5 text-12">
                      <span className="text-foreground">#{f.idx} {f.name || '(无名)'}</span>
                      <span className="ml-2 text-brand-red">{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {failures.length === 0 && !running && (
              <p className="text-12 text-muted-foreground">
                {job.skipped_cnt > 0
                  ? `无失败条目;其中 ${job.skipped_cnt} 条与库里现有记录一致,已幂等跳过。`
                  : '全部成功,无失败条目。'}
              </p>
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
      <p className={`text-16 font-medium tabular-nums ${tone}`}>{value}</p>
      <p className="text-12 text-faint">{label}</p>
    </div>
  );
}
