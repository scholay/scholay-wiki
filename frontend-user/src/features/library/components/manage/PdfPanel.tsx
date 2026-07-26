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
import { UPLOAD_CANCELLED, useDeletePaperPdf, useUploadPaperPdf } from '../../api/pdf';
import { hasLocalOverride } from '@/shared/lib/pick-field';
import {
  DialogFooterBar,
  DialogTabBar,
  StepBanner,
  footerGhostCn,
  footerPrimaryCn,
  type DialogTabDef,
} from '../shared/dialog-chrome';
import { validateFile } from '../shared/validate-pdf';
import { CurrentPaperCard, FileTab, UrlTab } from './pdf-parts';

/**
 * 统一管理弹窗 · PDF tab —— 补充 / 更换 / 移除 PDF。
 * 三子 tab:上传文件(dropzone)/ 粘贴链接(占位)/ DOI 抓取(占位)。
 * "编辑信息"按钮切到本弹窗的「元数据」tab。原 PdfAttachDialog 的弹窗外壳由 PaperWorkbenchDialog 提供。
 */

type AttachTab = 'file' | 'link' | 'doi';

const TABS: Array<DialogTabDef<AttachTab>> = [
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
  // "已有 PDF" = 用户上传过(pdf_uploaded_at / pdf_sha256 非空)。
  // ⚠️ 不能用 paper.pdf_url 判 —— 那是在线数据列(收藏时带来的 OA 直链),
  // 与用户是否上传过无关(与 lib/paper-status 的 getPdfStatus 口径一致)。
  const hasExisting = Boolean(paper.pdf_uploaded_at || (paper.pdf_sha256 ?? '').trim());

  // 空壳防护(与后端守卫口径一致):free 行(无在线关联)且无本地信息时,
  // 这份 PDF 就是条目仅剩的内容 —— 移除后条目将不包含任何信息,置灰挡住。
  // (linked 行随便删 PDF,在线数据还在。)
  const removeBlocked = paper.link_state === 'free' && !hasLocalOverride(paper);
  const [tab, setTab] = useState<AttachTab>('file');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  // link 与 doi 两个子 tab 各自独立的输入(共用一个 state 会互相串值)
  const [linkInput, setLinkInput] = useState('');
  const [doiInput, setDoiInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const uploadMut = useUploadPaperPdf();
  const deleteMut = useDeletePaperPdf();
  const isPending = uploadMut.isPending;
  const isDeleting = deleteMut.isPending;

  const acceptFile = useCallback((f: File) => {
    if (!validateFile(f, setError)) {
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }, []);

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

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* 状态条 + 当前信息 + 子 tab + body 滚动区 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 pt-4">
          <StepBanner
            step={1}
            title={hasExisting ? '更换 PDF' : '补充 PDF'}
            desc={hasExisting ? '上传新文件,替换当前 PDF' : '这篇文献还没有 PDF,补上后随时在线预览'}
          />
        </div>

        <div className="px-6 pt-3">
          <CurrentPaperCard paper={paper} onEdit={onRequestEditMeta} />
        </div>

        <div className="pt-3">
          <DialogTabBar tabs={TABS} value={tab} onChange={setTab} ariaLabel="PDF 来源" size="sm" />
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
              value={linkInput}
              placeholder="https:// 或 doi:10.xxxx/xxxxx"
              onChange={setLinkInput}
              onFetch={() => toast.info('「链接抓取」功能开发中')}
              inputType="url"
            />
          )}
          {tab === 'doi' && (
            <UrlTab
              value={doiInput}
              placeholder="10.1038/s41586-..."
              onChange={setDoiInput}
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
            <div className="mt-4 flex items-start gap-2 rounded-sm bg-brand-amber-soft border border-brand-amber/20 px-3 py-2">
              <Info className="size-3.5 text-brand-amber shrink-0 mt-0.5" />
              <span className="text-xs text-muted-foreground">
                仅支持 PDF,最大 50 MB · 文件只对你自己可见
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

      <DialogFooterBar
        hint={
          <>
            <Paperclip className="size-3" />
            上传后即可在线预览,不用重新填写信息
          </>
        }
      >
        {hasExisting &&
          (removeBlocked ? (
            // 空壳防护:置灰 + title 说明,不进 ConfirmPopover(入口直接挡住)
            <button
              type="button"
              disabled
              title="移除后这条收藏就没有内容了;不需要的话可以直接删除这条收藏"
              className={cn(
                'inline-flex items-center gap-1 h-8 px-3 rounded-sm border border-brand-red/30 bg-surface-card text-sm font-semibold text-brand-red',
                'opacity-60 cursor-not-allowed'
              )}
            >
              <Trash2 className="size-3.5" />
              移除 PDF
            </button>
          ) : (
            <ConfirmPopover
              title="移除已上传的 PDF?"
              description="会删除你上传的 PDF,文献信息保留"
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
                  'inline-flex items-center gap-1 h-8 px-3 rounded-sm border border-brand-red/30 bg-surface-card text-sm font-semibold text-brand-red',
                  'hover:bg-danger-soft disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
                )}
              >
                {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                移除 PDF
              </button>
            </ConfirmPopover>
          ))}
        <button
          type="button"
          onClick={() => {
            // 「关闭(终止)」要真的终止:上传中先 abort 再关,行为与文案一致
            if (isPending) abortRef.current?.abort();
            onClose();
          }}
          className={footerGhostCn}
        >
          {isPending ? '取消上传' : '取消'}
        </button>
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || isPending || isDeleting || tab !== 'file'}
          className={footerPrimaryCn('green')}
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" strokeWidth={2.25} />}
          {saveBtnLabel}
        </button>
      </DialogFooterBar>
    </div>
  );
}
