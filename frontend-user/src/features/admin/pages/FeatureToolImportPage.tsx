import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileJson, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useApiToast } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { useImportTools, useImportToolsZip, useImportJob, type ImportJob } from '../api/feature-tools';

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

  // 任务进度轮询 (running 时)
  const { data: job } = useImportJob(jobId ?? undefined, jobId != null);
  const running = job?.status === 'pending' || job?.status === 'running';

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
    <AdminPageLayout title="导入工具" description="粘贴 / 上传结构化 JSON, 批量 upsert 到功能广场 (按 source_topic_id / slug 幂等)">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* 上传 */}
        <div className="flex items-center gap-3">
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
          {filename && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FileJson className="size-3.5" />{filename}</span>}
        </div>

        {/* 粘贴 */}
        <div>
          <p className="mb-1.5 text-xs font-bold text-subtle">或粘贴 JSON(工具对象数组)</p>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setFilename(''); setZipFile(null); }}
            rows={12}
            placeholder='[{"name":"...","slug":"...","category":"...","access":{...},"spec":{...}}, ...]'
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* 解析状态 */}
        <div className="flex items-center gap-2 text-sm">
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
        <div className="flex items-center justify-between rounded-md border border-border bg-surface-1 p-3">
          <label className="flex items-center gap-2 text-sm text-subtle">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4" />
            导入时通知下游 webhook 同步
            <span className="text-2xs text-faint">(冷数据首次导入建议关闭)</span>
          </label>
          <Button onClick={submit} disabled={(!zipFile && count === 0) || busy}>
            {busy ? '提交中…' : zipFile ? '导入 zip' : `导入 ${count} 条`} <ArrowRight className="size-3.5" />
          </Button>
        </div>

        {/* 任务进度 */}
        {job && (
          <div className="rounded-md border border-border bg-background p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">
                任务 #{job.id} · {running ? '处理中…' : job.status === 'succeeded' ? '完成' : job.status === 'partial' ? '部分完成' : job.status}
              </p>
              <Link to="/admin/tools-jobs" className="text-xs text-brand-red hover:underline">全部任务 →</Link>
            </div>
            <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2">
              <div className="h-full bg-brand-green transition-all" style={{ width: `${job.total ? Math.round((job.processed / job.total) * 100) : 0}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>进度 {job.processed}/{job.total}</span>
              <span className="text-brand-green">新增 {job.created_cnt}</span>
              <span className="text-brand-amber">更新 {job.updated_cnt}</span>
              {job.failed_cnt > 0 && <span className="text-brand-red">失败 {job.failed_cnt}</span>}
            </div>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}
