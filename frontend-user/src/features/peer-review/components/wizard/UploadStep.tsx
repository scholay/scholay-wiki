import { useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2, X, FileText, FileImage, FileArchive, FileSpreadsheet, FileCode } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import type { AttachmentCategory, SubmissionAsset } from '../../types';
import type { UploadAssetParams } from '../../api/submissions';

/**
 * UploadHandlers — UploadStep 的 I/O 由父组件传, 不再自己持有 hook。
 * 这样:
 *   1. 父组件可以根据"是否已有 draft id"选择普通 useUploadAsset 或 lazy-create 包装版
 *   2. UploadStep 本身保持纯展示, 不耦合 draft 生命周期逻辑
 */
export interface UploadHandlers {
  /** 当前 submission 的 asset 列表 (可能为空,例如还没有 draft) */
  assets: SubmissionAsset[];
  /** 上传 mutate({file, role, category}) */
  uploadPending: boolean;
  onUpload: (params: UploadAssetParams) => void;
  /** 删 mutate(assetId) */
  deletePending: boolean;
  onDelete: (assetId: number) => void;
  /**
   * 重新上传稿件 —— **先传新、再删旧**, 保证资产数不经过 0。
   * (后端在 draft 资产数归 0 时会把整条草稿当"取消"删掉, 删旧→传新的顺序会误删草稿 → 后续 404。)
   * 不传时回退到 onDelete + onUpload (旧行为)。
   */
  onReplaceManuscript?: (oldAssetId: number, file: File) => void;
}

/**
 * Step1 上传文件 —— 期刊 / 毕业 共用(对照 .pen `xV7Lb` 主稿件 + `x5OLD` 附属材料)。
 *
 * 主要交互:
 *   - 稿件正文:必传 1 份 .docx/.pdf,≤ 200MB
 *     - 未上传:红描边大 dropzone (220px),"选择文件" 红按钮 + "从云盘导入"(预留)
 *     - 已上传:浅绿色卡片显示文件名 + 解析进度,右侧"重新上传"红字 + ✕ 删除
 *   - 附属材料:**只有主稿件传完后才显示**,0-10 份,任意类型 ≤ 200MB
 *     - dropzone (120px,灰色细描边)
 *     - 已上传列表,每行 icon + 文件名 + chip(类型)+ 大小,右侧 ✕ 删除
 */

const MAIN_TYPES = ['.docx', '.pdf'];
// 跟后端 peerreview/service.go 的 MaxManuscriptBytes / MaxAttachmentBytes 保持一致。
// 稿件 50MB (只用抽出的文本, 后端全量读内存做 sha256, 200MB 是 OOM 风险);
// 附件 30MB/份 (补充材料存 MinIO, 不抽文本)。
const MAIN_MAX = 50 * 1024 * 1024;
const ATT_MAX = 30 * 1024 * 1024;
const ATT_MAX_COUNT = 10;

const mb = (n: number) => Math.round(n / 1024 / 1024);

/**
 * 稿件正文校验 —— 返回错误文案或 null。三条都要拦 (前端 accept 属性只是建议, 拖拽/“所有文件”
 * 能绕过): 1) 后缀必须 .docx/.pdf (挡 .txt 等); 2) 非空 (挡 0B PDF); 3) ≤ 50MB。
 */
function validateManuscriptFile(f: File): string | null {
  const name = f.name.toLowerCase();
  if (!MAIN_TYPES.some((ext) => name.endsWith(ext))) {
    return `稿件正文只支持 ${MAIN_TYPES.join(' / ')} 格式`;
  }
  if (f.size === 0) return '文件是空的 (0 字节), 请重新选择';
  if (f.size > MAIN_MAX) return `文件超过 ${mb(MAIN_MAX)} MB 上限`;
  return null;
}

/** 附属材料校验 —— 类型不限, 但同样要拦空文件 + 超限。 */
function validateAttachmentFile(f: File): string | null {
  if (f.size === 0) return '文件是空的 (0 字节), 请重新选择';
  if (f.size > ATT_MAX) return `单文件超过 ${mb(ATT_MAX)} MB 上限`;
  return null;
}

export interface UploadStepProps extends UploadHandlers {
  /** 期刊 / 毕业 文案差异由父组件传 */
  mainHint: string;
  attachmentHint: string;
}

export function UploadStep({
  assets,
  uploadPending,
  onUpload,
  deletePending,
  onDelete,
  onReplaceManuscript,
  mainHint,
  attachmentHint,
}: UploadStepProps) {
  const manuscript = assets.find((a) => a.role === 'manuscript');
  const attachments = assets.filter((a) => a.role === 'attachment');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {/* ─── 主稿件 ───────────────────────────────────────────────── */}
      <section className="rounded-16 border border-border bg-surface-card p-6">
        <header className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-14 font-medium text-foreground">稿件正文</h2>
            <p className="mt-1 text-12 text-muted-foreground">{mainHint}</p>
          </div>
          <span className="rounded-pill bg-danger-soft px-3 py-1 text-12 font-medium text-brand-red">
            必填 · 支持 .docx / .pdf
          </span>
        </header>

        {manuscript ? (
          <ManuscriptUploadedRow
            asset={manuscript}
            onReupload={(file) => {
              // **先传新、再删旧** (onReplaceManuscript) —— 资产数不经过 0, 避免后端把草稿当
              // "删光=取消"误删 (会导致下一步 advance 404)。没传该回调才回退到旧的删→传。
              if (onReplaceManuscript) {
                onReplaceManuscript(manuscript.id, file);
              } else {
                onDelete(manuscript.id);
                setTimeout(() => onUpload({ file, role: 'manuscript' }), 50);
              }
            }}
            onDelete={() => onDelete(manuscript.id)}
            busy={uploadPending || deletePending}
          />
        ) : (
          <ManuscriptDropZone
            uploading={uploadPending}
            onFile={(f) => onUpload({ file: f, role: 'manuscript' })}
          />
        )}
      </section>

      {/* ─── 附属材料:只有主稿件传完才显示 ───────────────────────── */}
      {manuscript && (
        <section className="rounded-16 border border-border bg-surface-card">
          <header className="flex items-center justify-between border-b border-border-soft px-6 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-14 font-medium text-foreground">附件</h2>
                <span className="rounded-pill bg-danger-soft px-2.5 py-0.5 text-12 font-medium text-brand-red">
                  {attachments.length} / {ATT_MAX_COUNT}
                </span>
              </div>
              <p className="mt-1 text-12 text-muted-foreground">{attachmentHint}</p>
            </div>
            {attachments.length < ATT_MAX_COUNT && (
              <AttachmentAddButton
                uploading={uploadPending}
                onFile={(f) =>
                  onUpload({ file: f, role: 'attachment', category: 'other' as AttachmentCategory })
                }
              />
            )}
          </header>

          <div className="flex flex-col gap-3 px-6 py-5">
            {attachments.length === 0 && (
              <AttachmentDropZone
                uploading={uploadPending}
                remaining={ATT_MAX_COUNT - attachments.length}
                onFile={(f) =>
                  onUpload({ file: f, role: 'attachment', category: 'other' as AttachmentCategory })
                }
              />
            )}

            {attachments.length > 0 && (
              <>
                <p className="text-12 font-medium text-muted-foreground">
                  已上传 {attachments.length} 个文件
                </p>
                <div className="flex flex-col gap-2">
                  {attachments.map((a) => (
                    <AttachmentRow
                      key={a.id}
                      asset={a}
                      onDelete={() => onDelete(a.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── 主稿件 dropzone(.pen `nqJeG`) ────────────────────────────────────

function ManuscriptDropZone({
  uploading,
  onFile,
}: {
  uploading: boolean;
  onFile: (f: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | undefined) {
    if (!f) return;
    const err = validateManuscriptFile(f);
    if (err) {
      toast.error(err);
      return;
    }
    onFile(f);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        pickFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        'flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-12 border bg-surface-1 px-8 py-10 text-center transition',
        dragOver
          ? 'border-brand-red bg-danger-soft'
          : 'border-brand-red/60 hover:border-brand-red'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={MAIN_TYPES.join(',')}
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)}
      />
      <span className="flex size-14 items-center justify-center rounded-pill bg-danger-soft">
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-brand-red" />
        ) : (
          <Upload className="size-6 text-brand-red" />
        )}
      </span>
      <p className="text-14 font-medium text-foreground">
        把稿件拖到这里 · 或点击下方按钮上传
      </p>
      <p className="text-12 text-muted-foreground">
        支持 {MAIN_TYPES.join(' / ')} · 建议提交脱敏盲审版本
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-9 items-center rounded-8 bg-brand-red px-5 text-12 font-medium text-background transition hover:bg-brand-red/90 disabled:opacity-50"
        >
          选择文件
        </button>
        <button
          type="button"
          disabled
          title="即将上线"
          className="inline-flex h-9 items-center rounded-8 border border-border-button bg-surface-card px-5 text-12 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          从云盘导入
        </button>
      </div>
    </div>
  );
}

// ─── 主稿件已上传行(.pen `W7fig`) ────────────────────────────────────

function ManuscriptUploadedRow({
  asset,
  onReupload,
  onDelete,
  busy,
}: {
  asset: SubmissionAsset;
  onReupload: (file: File) => void | Promise<void>;
  onDelete: () => void;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 上传完成提示:绿色背景 + 描边走 brand-green token 的低不透明度变体,
  // 近似 .pen 设计稿里的 #F5FBF5 / #CFE8CF;.pen 暂无对应专用 surface token
  return (
    <div className="flex items-center gap-3 rounded-12 border border-brand-green/30 bg-brand-green/5 px-4 py-3">
      <span className="flex size-9 items-center justify-center rounded-8 border border-border bg-surface-card">
        <FileText className="size-5 text-subtle" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-12 font-medium text-foreground">{asset.filename}</p>
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-12 text-brand-green">
          <CheckCircle2 className="size-3" />
          上传完成 · {formatBytes(asset.size)}
          {asset.textChars ? ` · 已识别 ${asset.textChars} 字` : ''}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={MAIN_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // 重置 input,允许再选同一个文件
          e.target.value = '';
          if (!f) return;
          // 重新上传也要走同一套校验 —— 否则 .txt / 0B / 超 50MB 会被静默发到后端,
          // “先传新再删旧”的新传失败后旧稿件还在, 用户看不到任何错误 (报告里的 P1)。
          const err = validateManuscriptFile(f);
          if (err) {
            toast.error(err);
            return;
          }
          onReupload(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="text-12 font-medium text-brand-red hover:text-brand-red/80 disabled:opacity-50"
      >
        {busy ? '处理中…' : '重新上传'}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="text-faint hover:text-destructive disabled:opacity-50"
        aria-label="删除"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ─── 附件:dropzone (.pen `PkPO4`) + 已上传 row + add 按钮 ────────────────

function AttachmentDropZone({
  uploading,
  remaining,
  onFile,
}: {
  uploading: boolean;
  remaining: number;
  onFile: (f: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | undefined) {
    if (!f) return;
    const err = validateAttachmentFile(f);
    if (err) {
      toast.error(err);
      return;
    }
    onFile(f);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        pickFile(e.dataTransfer.files?.[0]);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-12 border bg-surface-1 px-6 py-5 text-center transition',
        dragOver ? 'border-brand-red bg-danger-soft' : 'border-border hover:border-brand-red/60'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)}
      />
      <span className="flex size-10 items-center justify-center rounded-pill border border-border bg-surface-card">
        {uploading ? (
          <Loader2 className="size-4 animate-spin text-faint" />
        ) : (
          <Upload className="size-4 text-faint" />
        )}
      </span>
      <p className="text-14 font-medium text-subtle">
        把附件拖到这里 · 或点击添加 · 还能再加 {remaining} 个
      </p>
      <p className="text-12 text-muted-foreground">
        支持 PDF / Word / Excel / 图片 / ZIP
      </p>
    </div>
  );
}

function AttachmentAddButton({
  uploading,
  onFile,
}: {
  uploading: boolean;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex h-9 items-center gap-1 rounded-8 border border-brand-red bg-surface-card px-4 text-12 font-medium text-brand-red transition hover:bg-danger-soft disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <span className="text-14 leading-none">+</span>
        )}
        添加附件
      </button>
    </>
  );
}

function AttachmentRow({ asset, onDelete }: { asset: SubmissionAsset; onDelete: () => void }) {
  const { Icon, tintCls } = iconForFilename(asset.filename);
  return (
    <div className="flex items-center gap-3 rounded-12 border border-border bg-surface-card px-4 py-3">
      <span className={cn('flex size-10 items-center justify-center rounded-8', tintCls)}>
        <Icon className="size-5 text-subtle" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-12 font-medium text-foreground">{asset.filename}</p>
        <p className="mt-0.5 text-12 text-muted-foreground">
          {asset.mime.split('/').pop()?.toUpperCase() || '—'} · {formatBytes(asset.size)}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-faint hover:text-destructive"
        aria-label="删除"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ─── 工具函数 ───────────────────────────────────────────────────────

function iconForFilename(name: string): { Icon: typeof FileText; tintCls: string } {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return { Icon: FileImage, tintCls: 'bg-surface-2' };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return { Icon: FileArchive, tintCls: 'bg-warning-soft' };
  if (['xls', 'xlsx', 'csv'].includes(ext))
    return { Icon: FileSpreadsheet, tintCls: 'bg-surface-2' };
  if (['json', 'js', 'ts', 'py', 'md', 'tex'].includes(ext))
    return { Icon: FileCode, tintCls: 'bg-surface-2' };
  return { Icon: FileText, tintCls: 'bg-surface-2' };
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
