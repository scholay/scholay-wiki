import {
  CheckCircle2,
  Download,
  Edit3,
  FileSearch,
  FolderInput,
  Link2,
  Paperclip,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatSize, MAX_PDF_SIZE } from '../../api/pdf';
import { pickEffectiveFields } from '@/shared/lib/pick-field';
import type { UserLibraryPaper } from '@/shared/api/types';

/** PdfPanel 的展示子件 —— 当前文献信息卡 / 文件 tab / URL·DOI tab。拆出来让 PdfPanel ≤300 行。 */

export function CurrentPaperCard({
  paper,
  onEdit,
}: {
  paper: UserLibraryPaper;
  onEdit: () => void;
}) {
  const eff = pickEffectiveFields(paper);
  const authorNames =
    eff.authors && eff.authors.length > 0
      ? eff.authors.map((a) => a.name).filter(Boolean).join(', ')
      : '';
  const isComplete = !!eff.title && !!eff.venue && !!eff.year;

  return (
    <div className="rounded-12 border border-border bg-surface-card p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5 text-brand-green" strokeWidth={2.5} />
          <span className="text-12 font-medium text-foreground">当前文献信息</span>
          {isComplete && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-pill bg-brand-green/10 text-brand-green text-12 font-medium leading-none">
              已完整
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-8 text-12 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
        >
          <Edit3 className="size-3" />
          编辑信息
        </button>
      </div>
      <div className="space-y-1.5">
        <div className="text-14 font-medium text-foreground leading-paragraph line-clamp-2" title={eff.title}>
          {eff.title || '无标题'}
        </div>
        {authorNames && <div className="text-12 text-muted-foreground line-clamp-1">{authorNames}</div>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-12 text-faint">
          {eff.venue && <span>{eff.venue}</span>}
          {eff.year && (
            <>
              <span>·</span>
              <span className="tabular-nums">{eff.year}</span>
            </>
          )}
          {eff.doi && (
            <>
              <span>·</span>
              <span className="font-mono">DOI {eff.doi}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function FileTab({
  file,
  dragOver,
  isPending,
  progress,
  onDragOver,
  onDragLeave,
  onDrop,
  onPickFile,
  onPickFromLibrary,
  onClearFile,
  onCancelUpload,
}: {
  file: File | null;
  dragOver: boolean;
  isPending: boolean;
  progress: number;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onPickFile: () => void;
  onPickFromLibrary: () => void;
  onClearFile: () => void;
  onCancelUpload: () => void;
}) {
  if (file) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-12 border border-border bg-surface-1 px-3 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-8 bg-surface-card border border-border shrink-0">
            <Paperclip className="size-4 text-brand-amber" strokeWidth={2.25} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-14 font-medium text-foreground" title={file.name}>
              {file.name}
            </div>
            <div className="text-12 text-faint tabular-nums">{formatSize(file.size)}</div>
          </div>
          {!isPending && (
            <button
              type="button"
              onClick={onClearFile}
              aria-label="移除文件"
              className="inline-flex h-7 w-7 items-center justify-center rounded-8 text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {isPending && (
          <div>
            <div className="flex items-center justify-between text-12 text-muted-foreground mb-1.5">
              <span>正在上传…</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{progress}%</span>
                <button
                  type="button"
                  onClick={onCancelUpload}
                  className="text-12 text-brand-red hover:underline underline-offset-2"
                >
                  终止
                </button>
              </div>
            </div>
            <div className="h-1.5 w-full bg-surface-2 rounded-pill overflow-hidden">
              <div
                className="h-full bg-brand-amber transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-12 border-2 transition-colors text-center',
          dragOver
            ? 'border-brand-amber bg-warning-soft'
            : 'border-dashed border-brand-amber/50 bg-warning-soft/30 hover:bg-warning-soft/50'
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-brand-amber/15">
          <UploadCloud className="size-5 text-brand-amber" strokeWidth={2} />
        </div>
        <div>
          <div className="text-14 font-medium text-foreground">将 PDF 文件拖拽到这里</div>
          <div className="mt-1 text-12 text-muted-foreground">
            支持 .pdf,单个文件最大 {MAX_PDF_SIZE / 1024 / 1024} MB
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPickFile}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-8 bg-brand-amber text-foreground text-14 font-medium hover:bg-brand-amber/90 transition-colors"
          >
            <Upload className="size-3.5" strokeWidth={2.25} />
            浏览文件
          </button>
          <button
            type="button"
            onClick={onPickFromLibrary}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-8 bg-surface-card border border-border text-14 font-medium text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            <FolderInput className="size-3.5" strokeWidth={2.25} />
            从本地文献夹选取
          </button>
        </div>
      </div>
    </div>
  );
}

export function UrlTab({
  value,
  placeholder,
  onChange,
  onFetch,
  inputType,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onFetch: () => void;
  inputType: 'url' | 'doi';
}) {
  const Icon = inputType === 'url' ? Link2 : FileSearch;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-3 h-11 rounded-12 border border-border bg-surface-card focus-within:border-brand-amber focus-within:ring-2 focus-within:ring-brand-amber/20 transition-colors">
        <Icon className="size-4 text-muted-foreground shrink-0" />
        {/* outline-none 合法:焦点可供性由外层容器的 focus-within:border-brand-amber + ring 提供 */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 h-full bg-transparent text-14 font-medium text-foreground outline-none placeholder:text-faint placeholder:font-normal"
        />
        <button
          type="button"
          onClick={onFetch}
          disabled={!value.trim()}
          className={cn(
            'inline-flex items-center gap-1 h-7 px-3 rounded-8 border border-brand-amber text-brand-amber text-12 font-medium',
            'hover:bg-warning-soft disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
          )}
        >
          <Download className="size-3" />
          抓取
        </button>
      </div>
      <p className="text-12 text-muted-foreground">
        {inputType === 'url'
          ? '粘贴公开可访问的 PDF 链接'
          : '输入论文 DOI,自动尝试获取 PDF'}
      </p>
    </div>
  );
}
