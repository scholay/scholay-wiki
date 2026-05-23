import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { FileText, Loader2, Trash2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/shared/ui/dialog';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import { cn } from '@/shared/lib/utils';
import {
  formatSize,
  MAX_PDF_SIZE,
  UPLOAD_CANCELLED,
  useDeletePaperPdf,
  useUploadPaperPdf,
} from '../api/pdf';

/**
 * PDF 上传弹窗 —— 单文件,仅 PDF,最大 50 MiB。
 *
 * 设计:
 *   - 大块 dropzone(点击 / 拖拽 / 粘贴都行),边框 dashed,hover/active 变色
 *   - 选好文件后切换到 "确认" 区:文件名 + 大小 + 重选 / 开始上传
 *   - 上传中:进度条 + 百分比,取消按钮(axios CancelToken 暂未接,后续要做)
 *   - 成功:toast + close + react-query 自动 invalidate
 *
 * 后端校验更严(magic bytes + 50MB hard cap),前端只做轻量过滤。
 */

interface PdfUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paperId: number;
  /** 当前论文标题 —— dialog 头部回显,让用户知道是给哪篇上传 */
  paperTitle: string;
  /** 是否已上传过(决定标题文案 "上传 PDF" vs "重新上传") */
  hasExisting: boolean;
}

export function PdfUploadDialog({
  open,
  onOpenChange,
  paperId,
  paperTitle,
  hasExisting,
}: PdfUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 当前 in-flight 上传的 AbortController —— 关闭弹窗 / 点击"终止"时 abort
  const abortRef = useRef<AbortController | null>(null);

  const uploadMut = useUploadPaperPdf();
  const deleteMut = useDeletePaperPdf();
  const isPending = uploadMut.isPending;
  const isDeleting = deleteMut.isPending;

  const handleDelete = async () => {
    if (isPending || isDeleting) return;
    try {
      await deleteMut.mutateAsync(paperId);
      toast.success('已移除 PDF');
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '移除失败';
      setError(msg);
    }
  };

  // 关闭/重开 reset 状态 —— 若关闭时还在上传,触发 abort 释放网络资源
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setFile(null);
      setError(null);
      setProgress(0);
      setDragOver(false);
    }
  }, [open]);

  // 卸载时彻底回收(避免 dialog 直接卸载没走 close 的 edge case)
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const validate = useCallback((f: File): string | null => {
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.pdf')) {
      return '只支持 .pdf 文件';
    }
    if (f.size === 0) {
      return '文件为空';
    }
    if (f.size > MAX_PDF_SIZE) {
      return `文件过大(${formatSize(f.size)}),上限 ${MAX_PDF_SIZE / 1024 / 1024} MB`;
    }
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

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
    // reset input value 允许同名文件二次选(浏览器默认会 dedupe)
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (isPending) return;
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  };

  const handleUpload = () => {
    if (!file || isPending) return;
    setProgress(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    uploadMut.mutate(
      { paperId, file, onProgress: setProgress, signal: ctrl.signal },
      {
        onSuccess: () => {
          abortRef.current = null;
          toast.success(hasExisting ? '已重新上传 PDF' : '已上传 PDF');
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          abortRef.current = null;
          const msg = err instanceof Error ? err.message : '上传失败';
          // 用户主动取消:不报错,只复位状态
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

  const handleCancelUpload = () => {
    abortRef.current?.abort();
  };

  return (
    // 关闭弹窗时不阻断 isPending —— effect 会 abort 网络请求,
    // 用户随时可关。"终止上传" 按钮同样调 onOpenChange(false) 走 abort。
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[520px] max-w-[calc(100vw-32px)]',
            '-translate-x-1/2 -translate-y-1/2',
            'flex flex-col overflow-hidden rounded-lg border border-border bg-background',
            'shadow-[0_8px_24px_rgba(15,23,42,0.12)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          {/* header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                {hasExisting ? '重新上传 PDF' : '上传 PDF'}
              </DialogPrimitive.Title>
              <p
                className="mt-1 text-xs text-muted-foreground truncate"
                title={paperTitle}
              >
                {paperTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
              title={isPending ? '关闭并终止上传' : '关闭'}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* body */}
          <div className="px-5 pb-4">
            {file ? (
              <SelectedFileCard
                file={file}
                onClear={() => {
                  setFile(null);
                  setError(null);
                }}
                disabled={isPending}
              />
            ) : (
              <DropZone
                dragOver={dragOver}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                disabled={isPending}
              />
            )}

            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={onPick}
            />

            {/* 进度 / 错误 */}
            {isPending && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>正在上传…</span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{progress}%</span>
                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="text-2xs text-brand-red hover:underline underline-offset-2"
                    >
                      终止
                    </button>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-surface-2 rounded-pill overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-[width] duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {error && !isPending && (
              <div className="mt-3 px-3 py-2 rounded-sm bg-danger-soft text-xs text-brand-red">
                {error}
              </div>
            )}

            {/* hint */}
            <p className="mt-3 text-2xs text-faint leading-relaxed">
              仅支持 PDF 格式,大小 ≤ {MAX_PDF_SIZE / 1024 / 1024} MB。
              上传的文件仅你自己可见,用于本论文的离线阅读 / AI 翻译等。
            </p>
          </div>

          {/* footer */}
          <div className="flex items-center justify-between gap-2 px-5 py-3 bg-surface-1 border-t border-border-soft">
            {/* 左:已上传过 PDF 才出现"移除 PDF",ConfirmPopover 二次确认。
                在上传中 / 删除中都禁用,防止操作冲突 */}
            {hasExisting ? (
              <ConfirmPopover
                title="移除已上传的 PDF?"
                description="将清除你为这篇论文上传的 PDF 文件,论文条目本身保留。"
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
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-sm border border-brand-red/30 bg-danger-soft text-sm font-semibold text-brand-red hover:bg-brand-red/15 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isDeleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  移除 PDF
                </button>
              </ConfirmPopover>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center h-8 px-3 rounded-sm bg-background border border-border text-sm font-semibold text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
              >
                {isPending ? '关闭(终止)' : '取消'}
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || isPending || isDeleting}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-4 rounded-sm text-sm font-semibold transition-colors',
                  'bg-foreground text-background hover:bg-foreground/85',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isPending && <Loader2 className="size-3.5 animate-spin" />}
                {isPending ? '上传中…' : hasExisting ? '替换并上传' : '开始上传'}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

// ============================================================================
// 子组件
// ============================================================================

interface DropZoneProps {
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  disabled: boolean;
}

function DropZone({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  disabled,
}: DropZoneProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center w-full gap-2.5 px-6 py-10 rounded-md',
        'border border-dashed transition-colors',
        dragOver
          ? 'border-foreground bg-surface-1'
          : 'border-border-strong bg-surface-1/40 hover:bg-surface-1 hover:border-foreground/60',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      <UploadCloud className="size-7 text-muted-foreground" strokeWidth={1.5} />
      <div className="text-sm font-semibold text-foreground">
        点击选择 PDF 文件
      </div>
      <div className="text-xs text-muted-foreground">或拖拽 PDF 到此处</div>
    </button>
  );
}

function SelectedFileCard({
  file,
  onClear,
  disabled,
}: {
  file: File;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-surface-1 border border-border">
      <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-background border border-border shrink-0">
        <FileText className="size-4 text-brand-red" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="truncate text-sm font-medium text-foreground"
          title={file.name}
        >
          {file.name}
        </div>
        <div className="text-2xs text-faint tabular-nums">
          {formatSize(file.size)}
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        aria-label="移除文件"
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export default PdfUploadDialog;
