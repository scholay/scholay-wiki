import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { UserLibraryPaper } from '@/shared/api/types';
import {
  uploadAndResolveStream,
  useConfirmUploadJob,
  type ParsedEvent,
  type SearchHit,
} from '../../api/upload-resolve';
import { hitToConfirmLink } from '../../lib/resolve-paper';
import type { LibraryFolderFilter } from '../../api/papers';
import {
  DialogFooterBar,
  footerGhostCn,
  footerPrimaryCn,
} from '../shared/dialog-chrome';
import { validateFile } from '../shared/validate-pdf';
import type { WizardStep } from './types';
import { PdfUploadEntry } from './PdfUploadEntry';
import { PdfUploadInspecting } from './PdfUploadInspecting';
import { PdfUploadDecide } from './PdfUploadDecide';

/**
 * 本地上传 PDF tab —— 三态流程(原独立"填写步"已统一为工作台管理语境的元数据面板):
 *
 *   State 0 (upload):   双卡片入口 + 4 步预告 stepper
 *   State 1 (parsing):  SSE 阶段事件进度
 *   State 2 (decide):   三源候选确认 → **立即 confirm 入库** → onCreated
 *
 * 数据双轨语义:
 *   - 接受候选 → confirm({link}):上游快照落 metadata,og_* 留空(展示自动透出上游值,
 *     不再把上游值重复复制进 og —— 否则日后换关联时旧副本会压住新元数据)
 *   - 拒绝/无匹配 → confirm({free}):后端把 PDF 解析结果落 og_*
 *
 * confirm 成功后由父级(PaperWorkbenchDialog)原地切到该行的管理语境继续完善。
 */

interface PdfUploadTabProps {
  currentFilter: LibraryFolderFilter;
  currentFolderName: string;
  onDone: () => void;
  /** confirm 入库成功 → 父级切到该行的管理语境 */
  onCreated: (paper: UserLibraryPaper, merged: boolean) => void;
}

export function PdfUploadTab({
  currentFilter,
  currentFolderName,
  onDone,
  onCreated,
}: PdfUploadTabProps) {
  const [step, setStep] = useState<WizardStep>({ kind: 'upload' });
  const [parsedMeta, setParsedMeta] = useState<ParsedEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const confirmMut = useConfirmUploadJob();
  const folderId = typeof currentFilter === 'number' ? currentFilter : undefined;
  const saving = confirmMut.isPending;

  useEffect(() => () => abortRef.current?.abort(), []);

  const cancelAndClose = () => {
    abortRef.current?.abort();
    onDone();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 上传 → SSE 流
  // ──────────────────────────────────────────────────────────────────────────
  const startUpload = (file: File) => {
    if (!validateFile(file, setError)) return;
    setError(null);
    setParsedMeta(null);
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
            setParsedMeta(parsed);
            setStep({ kind: 'parsing', file, phase: 'searching' });
            break;
          case 'searched':
            hits = e.payload.papers ?? [];
            setStep({ kind: 'parsing', file, phase: 'done' });
            break;
        }
      },
    })
      .then((jobId) => {
        abortRef.current = null;
        setStep({ kind: 'decide', file, parsed, searchHits: hits, jobId });
      })
      .catch((err: unknown) => {
        abortRef.current = null;
        if (ctrl.signal.aborted) {
          setStep({ kind: 'upload' });
          return;
        }
        const msg = err instanceof Error ? err.message : '解析失败';
        setError(msg);
        setStep({ kind: 'upload' });
      });
  };

  // ──────────────────────────────────────────────────────────────────────────
  // State 2 决策 → confirm 立即入库 → 父级切管理语境
  // ──────────────────────────────────────────────────────────────────────────
  const confirmDecision = (hit: SearchHit | null) => {
    if (step.kind !== 'decide' || saving) return;
    setError(null);
    confirmMut.mutate(
      {
        jobId: step.jobId,
        decision: hit ? 'link' : 'free',
        link: hit ? hitToConfirmLink(hit) : undefined,
        folderId,
      },
      {
        onSuccess: (r) => onCreated(r.paper, r.merged),
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : '保存失败,请检查网络后重试');
        },
      }
    );
  };

  const skipToFree = () => {
    if (step.kind === 'parsing') {
      // parsing 阶段还没拿到 jobId → confirm 无从谈起,只能等检索完成
      toast.info('请等检索完成后再跳过');
      return;
    }
    confirmDecision(null);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* 主区 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {step.kind === 'upload' && (
          <PdfUploadEntry
            dragOver={dragOver}
            currentFolderName={currentFolderName}
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
            onPickFile={() => inputRef.current?.click()}
          />
        )}
        {step.kind === 'parsing' && (
          <PdfUploadInspecting file={step.file} phase={step.phase} parsed={parsedMeta} />
        )}
        {step.kind === 'decide' && (
          <PdfUploadDecide
            file={step.file}
            parsed={step.parsed}
            searchHits={step.searchHits}
            isPending={saving}
            onPickHit={(hit) => confirmDecision(hit)}
            onReject={() => confirmDecision(null)}
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
          <div className="mt-3 px-3 py-2 rounded-8 bg-danger-soft text-12 text-brand-red">
            {error}
          </div>
        )}
      </div>

      {/* footer —— 按 step 切换 */}
      <PdfTabFooter
        step={step.kind}
        confirming={saving}
        onCancel={cancelAndClose}
        onSkipToFree={skipToFree}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// footer:按 step 选择不同按钮组合
//   upload  → [hint][取消]
//   parsing → [取消(终止)][继续等待匹配 disabled]
//   decide  → [hint][取消][跳过 · 存为自由文件]  (主操作在 body)
// ────────────────────────────────────────────────────────────────────────────

function PdfTabFooter({
  step,
  confirming,
  onCancel,
  onSkipToFree,
}: {
  step: WizardStep['kind'];
  confirming: boolean;
  onCancel: () => void;
  onSkipToFree: () => void;
}) {
  const leftHint =
    step === 'upload'
      ? '仅支持 PDF · 上传后自动识别并匹配在线论文'
      : step === 'decide'
        ? '加入后还可以继续编辑信息或更换关联'
        : '';

  return (
    <DialogFooterBar hint={leftHint}>
      {step === 'decide' && (
        <button
          type="button"
          onClick={onSkipToFree}
          disabled={confirming}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-8 border border-brand-amber text-brand-amber text-14 font-medium hover:bg-warning-soft disabled:opacity-60 transition-colors"
        >
          跳过 · 直接保存
        </button>
      )}

      {step === 'parsing' && (
        <button type="button" disabled className={footerPrimaryCn('amber')}>
          <Loader2 className="size-3.5 animate-spin" />
          继续等待匹配
        </button>
      )}

      {/* confirm 入库请求一旦发出无法真正终止,confirming 阶段只显示普通「取消」 */}
      <button type="button" onClick={onCancel} className={footerGhostCn}>
        × {step === 'parsing' ? '取消上传' : '取消'}
      </button>
    </DialogFooterBar>
  );
}
