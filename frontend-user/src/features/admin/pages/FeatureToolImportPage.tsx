import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileJson, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { useApiToast } from '@/shared/hooks';
import { LoadingState, ResourceError } from '@/shared/components';
import { AdminPageLayout } from '../components/AdminPageLayout';
import {
  useImportTools, useImportToolsZip, useImportJob, isJobRunning,
  IMPORT_JOB_STATUS_LABEL, type ImportJob,
} from '../api/feature-tools';

/** 把粘贴/上传的 JSON 解析成工具数组。支持顶层数组, 或 {items:[...]} / {assignments:[...]} 包裹。 */
function parseItems(text: string): { items: unknown[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { items: [], error: 'JSON 格式错误: ' + (e as Error).message };
  }
  if (Array.isArray(parsed)) return { items: parsed };
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.items)) return { items: obj.items };
    if (Array.isArray(obj.tools)) return { items: obj.tools };
  }
  return { items: [], error: '需要一个 JSON 数组, 或 {items:[...]} 对象' };
}

export function FeatureToolImportPage() {
  const [text, setText] = useState('');
  const [filename, setFilename] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [notify, setNotify] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const apiToast = useApiToast();
  const importMut = useImportTools();
  const zipMut = useImportToolsZip();

  const parsed = text.trim() ? parseItems(text) : { items: [] as unknown[] };
  const count = parsed.items.length;
  const busy = importMut.isPending || zipMut.isPending;

  // 任务进度轮询 —— 轮询是否继续由任务状态决定(见 api/feature-tools.ts useImportJob)
  const jobQ = useImportJob(jobId ?? undefined, jobId != null);
  const job = jobQ.data;
  const running = isJobRunning(job?.status);

  const onFile = async (file: File) => {
    if (/\.zip$/i.test(file.name)) {
      setZipFile(file);
      setFilename(file.name);
      setText('');
      return;
    }
    const content = await file.text();
    setText(content);
    setFilename(file.name);
    setZipFile(null);
  };

  const submit = async () => {
    let created: ImportJob | null = null;
    if (zipFile) {
      created = await apiToast(zipMut.mutateAsync({ file: zipFile, notify }), {
        success: '导入任务已创建',
        failure: '创建导入任务失败',
      });
    } else if (count > 0) {
      created = await apiToast(
        importMut.mutateAsync({ items: parsed.items, notify, source: filename ? 'file' : 'json', filename }),
        { success: '导入任务已创建', failure: '创建导入任务失败' },
      );
    } else {
      return;
    }
    if (created && typeof created === 'object' && 'id' in created) {
      setJobId((created as ImportJob).id);
    }
  };

  return (
    <AdminPageLayout
      title="导入工具"
      description="粘贴 / 上传结构化 JSON, 批量 upsert 到功能广场 (按 source_topic_id / slug 幂等)"
      onRefresh={jobId != null ? () => void jobQ.refetch() : undefined}
      refreshing={jobQ.isFetching}
      actions={<Button asChild variant="outline" size="sm"><Link to="/admin/tools-jobs">全部任务</Link></Button>}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {/* 上传 */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" /> 选择 .json / .zip 文件
          </Button>
          {filename && <span className="inline-flex items-center gap-1 text-12 text-muted-foreground"><FileJson className="size-3.5" />{filename}</span>}
        </div>

        {/* 粘贴 */}
        <div>
          <p className="mb-1.5 text-12 font-medium text-subtle">或粘贴 JSON(工具对象数组)</p>
          <Textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setFilename(''); setZipFile(null); }}
            rows={12}
            placeholder='[{"name":"...","slug":"...","category":"...","access":{...},"spec":{...}}, ...]'
            className="font-mono leading-paragraph"
          />
        </div>

        {/* 解析状态 */}
        <div className="flex items-center gap-2 text-12">
          {zipFile ? (
            <span className="inline-flex items-center gap-1.5 text-brand-green"><CheckCircle2 className="size-4" />已选 zip:{zipFile.name} · 解包在服务端进行</span>
          ) : parsed.error ? (
            <span className="inline-flex items-center gap-1.5 text-brand-red"><AlertTriangle className="size-4" />{parsed.error}</span>
          ) : count > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-brand-green"><CheckCircle2 className="size-4" />已识别 {count} 条工具</span>
          ) : (
            <span className="text-faint">等待输入…</span>
          )}
        </div>

        {/* 选项 + 提交 */}
        <div className="flex flex-col gap-3 rounded-16 border border-border bg-surface-1 p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-wrap items-center gap-2 text-12 text-subtle">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4" />
            导入时通知下游 webhook 同步
            <span className="text-12 text-faint">(冷数据首次导入建议关闭)</span>
          </label>
          <Button onClick={submit} disabled={(!zipFile && count === 0) || busy}>
            {busy ? '提交中…' : zipFile ? '导入 zip' : `导入 ${count} 条`} <ArrowRight className="size-3.5" />
          </Button>
        </div>

        {/* 任务进度 */}
        {jobId != null && jobQ.isError && (
          <div className="rounded-16 border border-border bg-surface-card p-4">
            <ResourceError
              error={jobQ.error}
              resourceName="导入任务"
              onRetry={() => void jobQ.refetch()}
              autoRedirect={false}
              className="h-auto bg-transparent py-6"
            />
          </div>
        )}
        {jobId != null && !jobQ.isError && !job && (
          <div className="rounded-16 border border-border bg-surface-card p-4"><LoadingState dense /></div>
        )}
        {job && (() => {
          const uploadingLogos = job.phase === 'uploading_logos';
          const pct = uploadingLogos
            ? (job.logo_total ? Math.round((job.logo_done / job.logo_total) * 100) : 0)
            : (job.total ? Math.round((job.processed / job.total) * 100) : 0);
          // 状态文案走全表 —— 原来只映射了 succeeded / partial,失败时页面上是裸英文 `failed`
          const statusLabel = running
            ? (uploadingLogos ? '上传图标中…' : '导入中…')
            : (IMPORT_JOB_STATUS_LABEL[job.status] ?? job.status);
          const failures = (job.detail ?? []).filter((d) => d.action === 'failed');
          const failed = job.status === 'failed';
          return (
            <div className="rounded-16 border border-border bg-surface-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-12 font-medium text-foreground">
                  任务 #{job.id} · <span className={failed ? 'text-brand-red' : undefined}>{statusLabel}</span>
                </p>
                <Link to={`/admin/tools-jobs?job=${job.id}`} className="text-12 text-brand-red hover:underline">任务详情 →</Link>
              </div>
              <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2">
                <div
                  className={`h-full transition-all ${failed ? 'bg-brand-red' : uploadingLogos ? 'bg-brand-amber' : 'bg-brand-green'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-12 text-muted-foreground">
                {uploadingLogos ? (
                  <span className="text-brand-amber">上传图标 {job.logo_done}/{job.logo_total}</span>
                ) : (
                  <>
                    <span>进度 {job.processed}/{job.total}</span>
                    <span className="text-brand-green">新增 {job.created_cnt}</span>
                    <span className="text-brand-amber">更新 {job.updated_cnt}</span>
                    {/* 跳过 = 幂等命中。少了它,总数就和其余几项对不上账 */}
                    <span className="text-faint">跳过 {job.skipped_cnt}</span>
                    <span className={job.failed_cnt > 0 ? 'text-brand-red' : 'text-faint'}>失败 {job.failed_cnt}</span>
                  </>
                )}
              </div>

              {/* 🔴 失败原因必须在**这一页**看得见 —— 刚点完导入的这一刻正是最需要它的时候,
                  原先只能跳到 /admin/tools-jobs 再打开弹窗才知道为什么。 */}
              {job.error && (
                <p className="mt-3 break-all rounded-8 bg-danger-soft px-2 py-1.5 font-mono text-12 text-brand-red">
                  {job.error}
                </p>
              )}
              {failures.length > 0 && (
                <div className="mt-3 space-y-1">
                  {failures.slice(0, 3).map((f) => (
                    <p key={f.idx} className="break-all rounded-8 border border-border-soft bg-surface-1 px-2 py-1 text-12">
                      <span className="text-foreground">#{f.idx} {f.name || '(无名)'}</span>
                      <span className="ml-2 text-brand-red">{f.error}</span>
                    </p>
                  ))}
                  <Link
                    to={`/admin/tools-jobs?job=${job.id}`}
                    className="inline-flex items-center gap-1 text-12 text-brand-red hover:underline"
                  >
                    查看 {failures.length} 条失败明细 <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </AdminPageLayout>
  );
}
