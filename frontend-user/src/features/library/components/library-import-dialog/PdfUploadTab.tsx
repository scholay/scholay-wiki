import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { UserLibraryPaper } from '@/shared/api/types';
import { toApiError } from '@/shared/lib/http';
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
import { checkPdfFile, pdfCheckErrorText } from '../shared/validate-pdf';
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
  /** 降级警告(如扫描件读不出文字)—— 与 error 分开:它不打回第一步,配色也不同 */
  const [warning, setWarning] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const confirmMut = useConfirmUploadJob();
  const folderId = typeof currentFilter === 'number' ? currentFilter : undefined;
  const saving = confirmMut.isPending;

  useEffect(() => () => abortRef.current?.abort(), []);

  // 错误条渲染在这块 overflow-y-auto 区域的所有内容**之后** —— decide 步候选多时
  // 它会落在视口外,用户的体感是"点了没反应"。出错就把它滚进视口。
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

  const cancelAndClose = () => {
    abortRef.current?.abort();
    onDone();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 上传 → SSE 流
  // ──────────────────────────────────────────────────────────────────────────
  // async:magic bytes 预检要读文件前 5 字节
  const startUpload = async (file: File) => {
    const check = await checkPdfFile(file);
    if (!check.ok) {
      setError(pdfCheckErrorText(check));
      return;
    }
    // 放行但有事要说(如文件名会被截短)—— 警告不打断流程,不占错误条
    if (check.warning) toast.warning(check.warning);
    setError(null);
    setParsedMeta(null);
    setStep({ kind: 'parsing', file, phase: 'uploading' });

    setWarning(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let parsed: ParsedEvent | null = null;
    let hits: SearchHit[] = [];

    uploadAndResolveStream({
      file,
      signal: ctrl.signal,
      onEvent: (e) => {
        switch (e.type) {
          case 'parsed' :
            parsed = e.payload;
            setParsedMeta(parsed);
            setStep({ kind: 'parsing', file, phase: 'searching' });
            break;
          case 'searched' :
            hits = e.payload.papers ?? [];
            setStep({ kind: 'parsing', file, phase: 'done' });
            break;
          case 'warn':
            // 降级提示 —— 流程继续,不动 step,不占错误条
            setWarning(e.payload.message);
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
        // 同 PdfPanel:上传/解析流抛的可能是 toApiError 的对象字面量(instanceof 恒 false),
        // 也可能是流内部 throw 的真 Error —— toApiError 幂等,两种都能拿到 message。
        setError(toApiError(err).message || '解析失败');
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
          // 原来兜底文案写死"请检查网络" —— 但这一步的失败绝大多数与网络无关
          // (job 过期 / 存储故障 / 文献集到上限),把真实 message 透出来。
          setError(toApiError(err).message || '保存失败,请重试');
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

        {warning && !error && (
          <div className="mt-3 flex items-start gap-2 rounded-8 bg-brand-amber-soft border border-brand-amber/20 px-3 py-2">
            <AlertTriangle className="size-3.5 text-brand-amber shrink-0 mt-0.5" />
            <span className="text-12 text-muted-foreground">{warning}</span>
          </div>
        )}

        {error && (
          <div
            ref={errorRef}
            className="mt-3 px-3 py-2 rounded-8 bg-danger-soft text-12 text-brand-red"
          >
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
