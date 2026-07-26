import { Fragment, useState } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { useDebounce } from '@/shared/hooks';
import { MarkdownRenderer } from '@/shared/components/chat';
import { DataTable, type Column } from './DataTable';
import { Pagination } from './Pagination';
import { UserCell } from './UserCell';
import { AdminFilePreviewDialog, type AdminPreviewFile } from './AdminFilePreviewDialog';
import { downloadAdminFile } from './AdminFileViewer';
import {
  usePRSubmissions,
  usePRSubmissionDetail,
  type PRSubmissionRow,
  type PRReport,
  type PRAsset,
} from '../api/peer-review-monitor';

const fmtTime = (s?: string | null) => (s ? s.slice(0, 16).replace('T', ' ') : '—');

function KV({ label, value }: { label: string; value?: string | number | null }) {
  if (value === '' || value == null) return null;
  return (
    <div className="min-w-0">
      <div className="text-2xs text-faint">{label}</div>
      <div className="text-xs text-subtle break-words">{value}</div>
    </div>
  );
}

function MdBlock({ label, md }: { label: string; md?: string }) {
  if (!md) return null;
  return (
    <div className="rounded-md border border-border bg-surface-1 p-3">
      <div className="mb-1 text-2xs text-faint">{label}</div>
      <div className="text-sm text-subtle">
        <MarkdownRenderer text={md} />
      </div>
    </div>
  );
}

// ---------- 结构化渲染:把 scores/dimensions/line-comments/… 的 JSON 渲染成可读 UI(替代裸 JSON.stringify) ----------

/** camelCase / snake_case 键名 → 更易读的展示串。 */
function prettyKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function ObjectRows({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return <span className="text-2xs text-faint">—</span>;
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <div className="text-2xs text-faint">{prettyKey(k)}</div>
          <div className="min-w-0">
            <StructuredValue value={v} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function StructuredValue({ value }: { value: unknown }) {
  if (value == null || value === '') return <span className="text-2xs text-faint">—</span>;
  if (typeof value === 'string') return <span className="whitespace-pre-wrap break-words text-xs text-subtle">{value}</span>;
  if (typeof value === 'number' || typeof value === 'boolean')
    return <span className="text-xs tabular-nums text-foreground">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-2xs text-faint">(空)</span>;
    const allObj = value.every((v) => v != null && typeof v === 'object' && !Array.isArray(v));
    if (allObj) {
      return (
        <div className="space-y-1.5">
          {value.map((v, i) => (
            <div key={i} className="rounded-sm border border-border-soft bg-background p-2">
              <ObjectRows obj={v as Record<string, unknown>} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <ul className="ml-4 list-disc space-y-0.5">
        {value.map((v, i) => (
          <li key={i} className="text-xs text-subtle">
            <StructuredValue value={v} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') return <ObjectRows obj={value as Record<string, unknown>} />;
  return <span className="text-xs text-subtle">{String(value)}</span>;
}

/** 结构化数据块:可读渲染 + 「原始 JSON」折叠兜底(便于核对)。 */
function StructuredBlock({ label, data }: { label: string; data?: unknown }) {
  if (data == null || (Array.isArray(data) && data.length === 0)) return null;
  return (
    <div className="rounded-md border border-border bg-surface-1 p-2.5">
      <div className="mb-1.5 text-2xs text-faint">{label}</div>
      <StructuredValue value={data} />
      <details className="mt-1.5">
        <summary className="cursor-pointer text-2xs text-faint">原始 JSON</summary>
        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words text-2xs text-muted-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function ReportCard({ r }: { r: PRReport }) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default">{r.role}</Badge>
        {r.decision && <span className="text-xs text-foreground">决定: {r.decision}</span>}
        {r.recommendation && <span className="text-xs text-subtle">推荐: {r.recommendation}</span>}
        {r.score != null && <span className="text-xs text-subtle">评分: {r.score}</span>}
        {r.expertise && <span className="text-2xs text-faint">{r.expertise}</span>}
        <span className="ml-auto text-2xs text-faint">
          {r.agentDurationSec != null ? `${r.agentDurationSec}s · ` : ''}
          {r.agentTokensIn != null ? `in ${r.agentTokensIn} / out ${r.agentTokensOut}` : ''}
        </span>
      </div>
      <MdBlock label="总评 (final summary)" md={r.finalSummaryMd} />
      <MdBlock label="评审正文 (content)" md={r.contentMd} />
      <MdBlock label="主编裁定 · 摘要" md={r.rulingSummaryMd} />
      <MdBlock label="主编裁定 · 正文" md={r.rulingParagraphMd} />
      <KV label="给作者的一句话" value={r.summaryForAuthor} />
      <div className="grid gap-1.5 sm:grid-cols-2">
        <StructuredBlock label="评分明细 (scores)" data={r.scores} />
        <StructuredBlock label="维度评分 (dimensions)" data={r.dimensions} />
        <StructuredBlock label="逐句意见 (line comments)" data={r.lineComments} />
        <StructuredBlock label="宏观意见 (macro comments)" data={r.macroComments} />
        <StructuredBlock label="must-fix" data={r.mustFix} />
        <StructuredBlock label="修改建议 (suggestions)" data={r.suggestions} />
        <StructuredBlock label="审稿人回应 (responses)" data={r.reviewerResponses} />
      </div>
    </div>
  );
}

/** 附件卡:文件名 + 元信息 badges + [预览][下载] + 可折叠的 AI 抽取文本(textExcerpt)。 */
function AssetCard({
  a,
  submissionId,
  onPreview,
}: {
  a: PRAsset;
  submissionId: number;
  onPreview: (f: AdminPreviewFile) => void;
}) {
  const src = `/admin/peer-review/submissions/${submissionId}/assets/${a.id}`;
  return (
    <div className="rounded-md border border-border bg-surface-1 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="size-4 shrink-0 text-faint" />
        <span className="min-w-0 truncate text-xs font-medium text-foreground" title={a.filename}>
          {a.filename}
        </span>
        <span className="text-2xs text-faint">
          {a.role}
          {a.category ? `/${a.category}` : ''} · {(a.size / 1024).toFixed(0)}KB · {a.mime}
          {a.textChars != null ? ` · 抽取 ${a.textChars} 字` : ''}
        </span>
        <div className="ml-auto flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" className="h-7" onClick={() => onPreview({ src, mime: a.mime, filename: a.filename })}>
            <Eye className="size-3.5" />
            预览
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              downloadAdminFile(`${src}?download=1`, a.filename).catch(() => toast.error('下载失败,请重试'));
            }}
          >
            <Download className="size-3.5" />
            下载
          </Button>
        </div>
      </div>
      {a.textExcerpt && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-2xs text-faint">AI 实际读到的抽取文本(节选)</summary>
          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words text-2xs text-muted-foreground">
            {a.textExcerpt}
          </pre>
        </details>
      )}
    </div>
  );
}

/** 审稿监控:列投稿 → 看完整数据(草稿过程 + 附件含抽取文本/可预览下载 + 每个审稿人报告)。 */
export function PeerReviewMonitor() {
  const [page, setPage] = useState(1);
  const [kwInput, setKwInput] = useState('');
  const keyword = useDebounce(kwInput, 300);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<AdminPreviewFile | null>(null);

  const { data, isLoading } = usePRSubmissions({ keyword: keyword.trim() || undefined, page, pageSize: 20 });
  const { data: detail, isLoading: loadingDetail } = usePRSubmissionDetail(viewingId);
  const s = detail?.submission;

  const columns: Column<PRSubmissionRow>[] = [
    {
      header: '用户',
      width: 200,
      cell: (r) => <UserCell id={r.userId} name={r.username} email={r.userEmail} />,
    },
    { header: '标题', cell: (r) => <span className="text-xs text-subtle line-clamp-2">{r.title || '(未填)'}</span> },
    {
      header: '模式',
      width: 90,
      cell: (r) => (
        <span className="text-2xs text-faint">
          {r.mode === 'thesis' ? '学位论文' : r.mode === 'journal' ? '期刊投稿' : r.mode}
        </span>
      ),
    },
    { header: '状态', width: 100, cell: (r) => <Badge variant="muted">{r.status}</Badge> },
    { header: '时间', width: 130, cell: (r) => <span className="text-2xs text-faint">{fmtTime(r.createdAt)}</span> },
    {
      header: '',
      width: 100,
      align: 'right',
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => setViewingId(r.id)}>
          <Eye className="size-3.5" />
          查看
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3">
        <input
          value={kwInput}
          onChange={(e) => {
            setKwInput(e.target.value);
            setPage(1);
          }}
          placeholder="ID / 用户名 / 邮箱 / 手机号 / 标题"
          className="h-9 w-full sm:w-72 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <DataTable columns={columns} rows={data?.list} loading={isLoading} />
      <Pagination total={data?.total ?? 0} page={page} pageSize={20} onPageChange={setPage} />

      <Dialog open={viewingId != null} onOpenChange={(o) => !o && setViewingId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>审稿数据 · #{viewingId}</DialogTitle>
          </DialogHeader>
          {loadingDetail || !s ? (
            <div className="py-8 text-center text-sm text-faint">加载中…</div>
          ) : (
            <div className="space-y-4">
              {/* 投稿草稿过程数据 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-surface-1 p-3 sm:grid-cols-3">
                <KV label="模式" value={s.mode} />
                <KV label="状态" value={s.status} />
                <KV label="步骤" value={s.step} />
                <KV label="计算状态" value={s.computeState} />
                <KV label="期刊" value={s.journalName} />
                <KV label="学校" value={s.schoolName} />
                <KV label="学位" value={s.degreeType} />
                <KV label="学科" value={s.disciplineField} />
                <KV label="导师" value={s.advisorName} />
                <KV label="提交时间" value={fmtTime(s.submittedAt)} />
                <KV label="完成时间" value={fmtTime(s.completedAt)} />
                <KV label="创建时间" value={fmtTime(s.createdAt)} />
                <KV label="agent 会话" value={s.agentSessionId} />
                <KV label="失败原因" value={s.failedReason} />
                <KV label="计算错误" value={s.computeError} />
              </div>
              <MdBlock label="标题" md={s.title} />
              <MdBlock label="摘要" md={s.abstract} />
              <MdBlock label="投稿信 (cover letter)" md={s.letterBody} />
              <div className="grid gap-1.5 sm:grid-cols-2">
                <StructuredBlock label="期刊元数据" data={s.journalMeta} />
                <StructuredBlock label="额外元数据 (keywords/subjects)" data={s.extraMeta} />
              </div>

              {/* 附件(可预览/下载 + AI 实际读到的抽取文本) */}
              {detail.assets.length > 0 && (
                <div>
                  <div className="mb-1.5 text-2xs text-faint">附件 ({detail.assets.length})</div>
                  <div className="space-y-1.5">
                    {detail.assets.map((a) => (
                      <AssetCard key={a.id} a={a} submissionId={s.id} onPreview={setPreview} />
                    ))}
                  </div>
                </div>
              )}

              {/* 审稿结果(每个审稿人) */}
              <div>
                <div className="mb-1.5 text-2xs text-faint">审稿报告 ({detail.reports.length})</div>
                {detail.reports.length === 0 ? (
                  <div className="text-sm text-faint">暂无审稿报告(可能还在审稿中或已失败)</div>
                ) : (
                  <div className="space-y-3">
                    {detail.reports.map((r) => (
                      <ReportCard key={r.id} r={r} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 文件预览弹窗(叠在详情之上;常驻挂载 + 内容守卫,遵守 Radix 铁律) */}
      <AdminFilePreviewDialog file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
