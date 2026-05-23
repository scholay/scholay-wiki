import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import {
  uploadAndResolveStream,
  useConfirmUploadJob,
  type ConfirmLink,
  type ParsedEvent,
  type SearchHit,
} from '../api/upload-resolve';
import type { LibraryFolderFilter } from '../api/papers';
import { UploadStep } from './pdf-import-wizard/UploadStep';
import { ParsingStep } from './pdf-import-wizard/ParsingStep';
import { DecideStep } from './pdf-import-wizard/DecideStep';
import { validateFile } from './pdf-import-wizard/validate-file';
import type { WizardStep } from './pdf-import-wizard/types';

/**
 * 文献集 · 上传 PDF 智能识别向导。
 *
 *   Step 1  Upload:   拖拽 / 选择 PDF —— [[UploadStep]]
 *   Step 2  Parsing:  SSE 阶段事件进度 —— [[ParsingStep]]
 *   Step 3  Decide:   三源候选 + 自由文件兜底 —— [[DecideStep]]
 *   Step 4  Confirming: confirm endpoint 落库
 *
 * 各 step UI 已拆到 `pdf-import-wizard/` 子目录,本文件只负责:
 *   - 状态机(WizardStep)
 *   - SSE 上传 + AbortController 生命周期
 *   - confirm mutation + toast
 *   - Dialog 外壳
 */

interface PdfImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前定位的文件夹 —— 'root' 走默认文件夹,number 落到指定 */
  currentFilter: LibraryFolderFilter;
  currentFolderName: string;
}

export function PdfImportWizard({
  open,
  onOpenChange,
  currentFilter,
  currentFolderName,
}: PdfImportWizardProps) {
  const [step, setStep] = useState<WizardStep>({ kind: 'upload' });
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const confirmMut = useConfirmUploadJob();
  const folderId =
    typeof currentFilter === 'number' ? currentFilter : undefined;

  // 关闭复位
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setStep({ kind: 'upload' });
      setError(null);
      setDragOver(false);
    }
  }, [open]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // ----------------------------------------------------------------
  // 上传 → SSE 流
  // ----------------------------------------------------------------
  const startUpload = (file: File) => {
    if (!validateFile(file, setError)) return;
    setError(null);
    setStep({ kind: 'parsing', file, phase: 'uploading' });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let parsed: ParsedEvent | null = null;
    let hits: SearchHit[] = [];

    uploadAndResolveStream({
      file,
      signal: ctrl.signal,
      onEvent: (e) => {
        switch (e.type) {
          case 'parsed':
            parsed = e.payload;
            setStep({ kind: 'parsing', file, phase: 'searching' });
            break;
          case 'searched':
            hits = e.payload.papers ?? [];
            setStep({ kind: 'parsing', file, phase: 'done' });
            break;
          // ai_done 事件后端不再发(AI 兜底已下线);ready 在 promise resolve 时处理;
          // error 在 promise reject 时处理
        }
      },
    })
      .then((jobId) => {
        abortRef.current = null;
        setStep({
          kind: 'decide',
          file,
          parsed,
          searchHits: hits,
          jobId,
        });
      })
      .catch((err: unknown) => {
        abortRef.current = null;
        if (ctrl.signal.aborted) {
          // 用户主动取消 → 复位到 upload step,不报错
          setStep({ kind: 'upload' });
          return;
        }
        const msg = err instanceof Error ? err.message : '解析失败';
        setError(msg);
        setStep({ kind: 'upload' });
      });
  };

  // ----------------------------------------------------------------
  // 决策 → confirm —— mutation isPending 期间 decide step 不离开,只把按钮禁用
  // ----------------------------------------------------------------
  const handlePickHit = (hit: SearchHit) => {
    if (step.kind !== 'decide' || confirmMut.isPending) return;
    const link: ConfirmLink = {
      source: hit.source,
      source_paper_id: hit.source_paper_id,
      title: hit.title,
      abstract: hit.abstract,
      year: hit.year,
      venue: hit.venue,
      doi: hit.doi,
      citation_count: hit.citation_count,
      pdf_url: hit.pdf_url,
      authors: hit.authors,
      raw: hit.raw,
    };
    setError(null);
    confirmMut.mutate(
      { jobId: step.jobId, decision: 'link', link, folderId },
      {
        onSuccess: (r) => {
          toast.success(
            r.merged ? `已合并到已有收藏「${hit.title}」` : '已加入文献集'
          );
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          setError(
            err instanceof Error ? err.message : '保存失败,请检查网络后重试'
          );
        },
      }
    );
  };

  const handlePickFree = () => {
    if (step.kind !== 'decide' || confirmMut.isPending) return;
    setError(null);
    confirmMut.mutate(
      { jobId: step.jobId, decision: 'free', folderId },
      {
        onSuccess: () => {
          toast.success('已保存为自由文件(AI 识别)');
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          setError(
            err instanceof Error ? err.message : '保存失败,请检查网络后重试'
          );
        },
      }
    );
  };

  const isWorking = step.kind === 'parsing' || confirmMut.isPending;

  return (
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
            'fixed left-1/2 top-1/2 z-50 w-[720px] max-w-[calc(100vw-32px)]',
            '-translate-x-1/2 -translate-y-1/2',
            'flex flex-col max-h-[85vh] overflow-hidden',
            'rounded-lg border border-border bg-background',
            'shadow-[0_8px_24px_rgba(15,23,42,0.12)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          {/* header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                上传 PDF · 智能识别
              </DialogPrimitive.Title>
              <p className="mt-1 text-xs text-muted-foreground">
                自动解析标题 → 三源搜索关联,或 AI 兜底识别为自由文件 ·
                收藏到{' '}
                <span className="font-semibold text-foreground">
                  「{currentFolderName}」
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* body —— 滚动区,Wizard step 切换 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3">
            {step.kind === 'upload' && (
              <UploadStep
                dragOver={dragOver}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) startUpload(f);
                }}
                onClick={() => inputRef.current?.click()}
              />
            )}
            {step.kind === 'parsing' && <ParsingStep phase={step.phase} />}
            {step.kind === 'decide' && (
              <DecideStep
                searchHits={step.searchHits}
                parsed={step.parsed}
                isPending={confirmMut.isPending}
                onPickHit={handlePickHit}
                onPickFree={handlePickFree}
              />
            )}

            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) startUpload(f);
                e.target.value = '';
              }}
            />

            {error && (
              <div className="mt-3 px-3 py-2 rounded-sm bg-danger-soft text-xs text-brand-red">
                {error}
              </div>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 bg-surface-1 border-t border-border-soft shrink-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center h-8 px-3 rounded-sm bg-background border border-border text-sm font-semibold text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              {isWorking ? '关闭(终止)' : '取消'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

export default PdfImportWizard;
