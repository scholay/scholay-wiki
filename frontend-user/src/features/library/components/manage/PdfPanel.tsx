import { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  FileSearch,
  Info,
  Link2,
  Loader2,
  Paperclip,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import type { UserLibraryPaper } from '@/shared/api/types';
import {
  formatSize,
  MAX_PDF_SIZE,
  UPLOAD_CANCELLED,
  useDeletePaperPdf,
  useUploadPaperPdf,
} from '../../api/pdf';
import { CurrentPaperCard, FileTab, UrlTab } from './pdf-parts';

/**
 * 统一管理弹窗 · PDF tab —— 补充 / 更换 / 移除 PDF。
 * 三子 tab:上传文件(dropzone)/ 粘贴链接(占位)/ DOI 抓取(占位)。
 * "编辑信息"按钮切到本弹窗的「元数据」tab。原 PdfAttachDialog 的弹窗外壳由 PaperManageDialog 提供。
 */

type AttachTab = 'file' | 'link' | 'doi';

const TABS: Array<{ id: AttachTab; label: string; icon: typeof Upload }> = [
  { id: 'file', label: '上传文件', icon: Upload },
  { id: 'link', label: '粘贴链接', icon: Link2 },
  { id: 'doi', label: '通过 DOI 抓取', icon: FileSearch },
];

export function PdfPanel({
  paper,
  onClose,
  onRequestEditMeta,
}: {
  paper: UserLibraryPaper;
  onClose: () => void;
  /** 切到「元数据」tab */
  onRequestEditMeta: () => void;
}) {
  const hasExisting = !!(paper.pdf_url && paper.pdf_url.trim().length > 0);
  const [tab, setTab] = useState<AttachTab>('file');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const uploadMut = useUploadPaperPdf();
  const deleteMut = useDeletePaperPdf();
  const isPending = uploadMut.isPending;
  const isDeleting = deleteMut.isPending;

  const validate = useCallback((f: File): string | null => {
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.pdf')) return '只支持 .pdf 文件';
    if (f.size === 0) return '文件为空';
    if (f.size > MAX_PDF_SIZE)
      return `文件过大(${formatSize(f.size)}),上限 ${MAX_PDF_SIZE / 1024 / 1024} MB`;
    return null;
  }, []);

  const acceptFile = useCallback(
    (f: File) => {
      const err = validate(f);
      if (err) {
        setError(err);
        setFile(null);
        return;
      }
      setError(null);
      setFile(f);
    },
    [validate]
  );

  const handleUpload = () => {
    if (!file || isPending) return;
    setProgress(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    uploadMut.mutate(
      { paperId: paper.id, file, onProgress: setProgress, signal: ctrl.signal },
      {
        onSuccess: () => {
          abortRef.current = null;
          toast.success(hasExisting ? '已替换 PDF' : '已上传 PDF');
          onClose();
        },
        onError: (err: unknown) => {
          abortRef.current = null;
          const msg = err instanceof Error ? err.message : '上传失败';
          if (msg === UPLOAD_CANCELLED) {
            setProgress(0);
            return;
          }
          setError(msg);
          setProgress(0);
        },
      }
    );
  };

  const handleDelete = async () => {
    if (isPending || isDeleting) return;
    try {
      await deleteMut.mutateAsync(paper.id);
      toast.success('已移除 PDF');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除失败');
    }
  };

  const saveBtnLabel = hasExisting ? '替换 PDF' : '保存 PDF';
  const stateLabel = hasExisting ? '更换 PDF · 替换已有附件' : '补充 PDF · 仅缺附件';

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* 状态条 + 当前信息 + 子 tab + body 滚动区 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 pt-4">
          <div className="rounded-md border border-border-soft bg-surface-1 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-pill bg-brand-amber text-background text-2xs font-bold tabular-nums">
                {hasExisting ? 1 : 0}
              </span>
              <span className="text-sm font-semibold text-foreground">{stateLabel}</span>
            </div>
          </div>
        </div>

        <div className="px-6 pt-3">
          <CurrentPaperCard paper={paper} onEdit={onRequestEditMeta} />
        </div>

        <div role="tablist" aria-label="附件来源" className="flex items-center gap-1 px-6 pt-3 border-b border-border">
          {TABS.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 h-9 px-3 text-sm font-semibold transition-colors',
                  active ? 'text-brand-amber' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-3.5" strokeWidth={2.25} />
                {t.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-pill bg-brand-amber"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="px-6 py-4">
          {tab === 'file' && (
            <FileTab
              file={file}
              dragOver={dragOver}
              isPending={isPending}
              progress={progress}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (isPending) return;
                const f = e.dataTransfer.files?.[0];
                if (f) acceptFile(f);
              }}
              onPickFile={() => inputRef.current?.click()}
              onPickFromLibrary={() => toast.info('「从本地文献夹选取」功能开发中')}
              onClearFile={() => {
                setFile(null);
                setError(null);
              }}
              onCancelUpload={() => abortRef.current?.abort()}
            />
          )}
          {tab === 'link' && (
            <UrlTab
              value={urlInput}
              placeholder="https:// 或 doi:10.xxxx/xxxxx"
              onChange={setUrlInput}
              onFetch={() => toast.info('「链接抓取」功能开发中')}
              inputType="url"
            />
          )}
          {tab === 'doi' && (
            <UrlTab
              value={urlInput}
              placeholder="10.1038/s41586-..."
              onChange={setUrlInput}
              onFetch={() => toast.info('「DOI 抓取」功能开发中')}
              inputType="doi"
            />
          )}

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptFile(f);
              e.target.value = '';
            }}
          />

          {tab === 'file' && !error && (
            <div className="mt-4 flex items-start gap-2 rounded-sm bg-brand-blue-soft border border-brand-blue/20 px-3 py-2">
              <Info className="size-3.5 text-brand-blue shrink-0 mt-0.5" />
              <span className="text-xs text-muted-foreground">
                系统将自动核对附件与现有信息的标题 / DOI 是否一致,不一致时会弹出确认
              </span>
            </div>
          )}

          {hasExisting && tab === 'file' && (
            <div className="mt-3 flex items-start gap-2 rounded-sm bg-danger-soft border border-brand-red/20 px-3 py-2">
              <AlertTriangle className="size-3.5 text-brand-red shrink-0 mt-0.5" />
              <span className="text-xs text-brand-red">上传成功后将替换当前 PDF;旧文件不可恢复</span>
            </div>
          )}

          {error && !isPending && (
            <div className="mt-3 px-3 py-2 rounded-sm bg-danger-soft text-xs text-brand-red">{error}</div>
          )}
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-2 px-6 py-3 bg-surface-1 border-t border-border-soft shrink-0">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Paperclip className="size-3" />
          PDF 将自动与当前信息关联,无需再次填写元数据
        </span>
        <div className="flex items-center gap-2">
          {hasExisting && (
            <ConfirmPopover
              title="移除已上传的 PDF?"
              description="将清除你为这篇论文上传的 PDF,信息卡其他字段保留"
              confirmText="移除 PDF"
              cancelText="取消"
              danger
              side="top"
              align="start"
              onConfirm={handleDelete}
            >
              <button
                type="button"
                disabled={isPending || isDeleting}
                className={cn(
                  'inline-flex items-center gap-1 h-8 px-3 rounded-sm border border-brand-red/30 bg-background text-sm font-semibold text-brand-red',
                  'hover:bg-danger-soft disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
                )}
              >
                {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                移除 PDF
              </button>
            </ConfirmPopover>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-8 px-3 rounded-sm text-sm font-semibold text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            {isPending ? '关闭(终止)' : '取消'}
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isPending || isDeleting || tab !== 'file'}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3.5 rounded-sm bg-brand-green text-background text-sm font-bold',
              'hover:bg-brand-green/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
            )}
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" strokeWidth={2.25} />}
            {saveBtnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
