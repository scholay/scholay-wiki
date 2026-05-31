import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import {
  uploadAndResolveStream,
  useConfirmUploadJob,
  type ParsedEvent,
  type SearchHit,
} from '../../api/upload-resolve';
import { hitToConfirmLink } from '../../lib/resolve-paper';
import type { LibraryFolderFilter, UpdatePaperOGPayload } from '../../api/papers';
import { useUpdatePaper } from '../../api/papers';
import { validateFile } from '../pdf-import-wizard/validate-file';
import type { WizardStep } from '../pdf-import-wizard/types';
import { PdfUploadEntry } from './PdfUploadEntry';
import { PdfUploadInspecting } from './PdfUploadInspecting';
import { PdfUploadDecide } from './PdfUploadDecide';
import { PdfUploadFill } from './PdfUploadFill';

/**
 * 本地上传 PDF tab —— 整套流程:
 *
 *   State 0 (upload):   双卡片入口(先上传 PDF / 先填写信息)+ 4 步预告 stepper
 *   State 1 (parsing):  SSE 阶段事件进度
 *   State 2 (decide):   三源候选 + 自由文件兜底
 *   State 3 (fill):     表单预填(从 hit 或空)→ 保存
 *
 * 数据双轨语义:
 *   - 上游 metadata 字段(title/abstract/...)由 confirm 落库,**之后不变**
 *   - og_* 用户字段由 form 落库(PATCH),保留用户编辑;两份并存
 *
 * 上游路径(接受/采用候选)→ confirm({link}) + PATCH og_*
 * 手动路径(拒绝/跳过)   → confirm({free}) + PATCH og_*(可选,有内容才发)
 */

interface PdfUploadTabProps {
  currentFilter: LibraryFolderFilter;
  currentFolderName: string;
  onDone: () => void;
}

export function PdfUploadTab({
  currentFilter,
  currentFolderName,
  onDone,
}: PdfUploadTabProps) {
  const [step, setStep] = useState<WizardStep>({ kind: 'upload' });
  const [parsedMeta, setParsedMeta] = useState<ParsedEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const confirmMut = useConfirmUploadJob();
  const updateMut = useUpdatePaper();
  const folderId = typeof currentFilter === 'number' ? currentFilter : undefined;

  // confirm + PATCH 二段串行,任一执行中都算"保存中"
  const saving = confirmMut.isPending || updateMut.isPending;

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
  // State 2 → State 3 决策跳转
  //   接受/采用:把候选 hit 带进 fill
  //   拒绝/跳过:空 hit 进 fill(form 用 parsed event 预填,用户可清空)
  // ──────────────────────────────────────────────────────────────────────────
  const goToFillWithHit = (hit: SearchHit) => {
    if (step.kind !== 'decide') return;
    setStep({
      kind: 'fill',
      file: step.file,
      parsed: step.parsed,
      jobId: step.jobId,
      sourceHit: hit,
    });
  };

  const goToFillManual = () => {
    // 可从 decide 或 parsing 跳过来 —— 都要 abort 当前 SSE(parsing 时)
    if (step.kind === 'parsing') {
      abortRef.current?.abort();
      abortRef.current = null;
      // parsing 阶段还没拿到 jobId → 不能直接进 fill(confirm 需要 jobId)
      // TODO: 后端补一个"无 PDF 解析,直接建条目"的入口;当前提示用户先等检索完
      toast.info('请等检索完成后再选择跳过 · 手动填写');
      return;
    }
    if (step.kind !== 'decide') return;
    setStep({
      kind: 'fill',
      file: step.file,
      parsed: step.parsed,
      jobId: step.jobId,
      sourceHit: null,
    });
  };

  // ──────────────────────────────────────────────────────────────────────────
  // State 3 → 保存
  //   confirm 完成拿到 paperId → 立刻 PATCH og_* 把表单值落进去。
  //   即使用户没改字段也 PATCH —— 设计语义就是"表单 = og_*",不区分"原值 vs 修改值"。
  // ──────────────────────────────────────────────────────────────────────────
  const handleSave = (payload: UpdatePaperOGPayload) => {
    if (step.kind !== 'fill' || saving) return;
    if (!payload.og_title?.trim()) {
      setError('标题不能为空');
      return;
    }
    setError(null);

    const link = step.sourceHit ? hitToConfirmLink(step.sourceHit) : undefined;
    confirmMut.mutate(
      {
        jobId: step.jobId,
        decision: step.sourceHit ? 'link' : 'free',
        link,
        folderId,
      },
      {
        onSuccess: (r) => {
          const paperId = r.paper.id;
          // 接着 PATCH og_* —— 表单当前值(全量)落到用户字段
          updateMut.mutate(
            { paperId, payload },
            {
              onSuccess: () => {
                toast.success(
                  r.merged
                    ? `已合并到已有收藏「${payload.og_title ?? ''}」`
                    : step.sourceHit
                      ? '已加入文献集 · 字段已填'
                      : '已保存为自由文件'
                );
                onDone();
              },
              onError: (err) => {
                // PATCH 失败但 confirm 已成功 —— 论文已经在库里,只是 og 没写
                // toast warn + 关弹窗;用户可以稍后去编辑卡片改字段
                toast.warning(
                  `已保存但字段同步失败:${err instanceof Error ? err.message : '请稍后在卡片上编辑'}`
                );
                onDone();
              },
            }
          );
        },
        onError: (err: unknown) => {
          setError(
            err instanceof Error ? err.message : '保存失败,请检查网络后重试'
          );
        },
      }
    );
  };

  return (
    <div className="flex flex-col">
      {/* 主区 */}
      <div className="px-6 py-5">
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
            onStartFill={goToFillManual}
          />
        )}
        {step.kind === 'parsing' && (
          <PdfUploadInspecting
            file={step.file}
            phase={step.phase}
            parsed={parsedMeta}
          />
        )}
        {step.kind === 'decide' && (
          <PdfUploadDecide
            file={step.file}
            parsed={step.parsed}
            searchHits={step.searchHits}
            isPending={saving}
            onPickHit={goToFillWithHit}
            onReject={goToFillManual}
          />
        )}
        {step.kind === 'fill' && (
          <PdfUploadFill
            file={step.file}
            parsed={step.parsed}
            sourceHit={step.sourceHit}
            saving={saving}
            onSave={handleSave}
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

      {/* footer —— 按 step 切换 */}
      <PdfTabFooter
        step={step.kind}
        confirming={saving}
        onCancel={cancelAndClose}
        onSkipToManualFill={goToFillManual}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// footer:按 step 选择不同按钮组合
//   upload  → [hint][取消]
//   parsing → [取消][跳过 · 手动填写][继续等待匹配 disabled]
//   decide  → [hint][取消][跳过 · 手动填写]  (主操作在 body)
//   fill    → [取消]  (主"保存到文献库"按钮在 body 内,与设计稿一致)
// ────────────────────────────────────────────────────────────────────────────

function PdfTabFooter({
  step,
  confirming,
  onCancel,
  onSkipToManualFill,
}: {
  step: WizardStep['kind'];
  confirming: boolean;
  onCancel: () => void;
  onSkipToManualFill: () => void;
}) {
  const showSkipToManual = step === 'parsing' || step === 'decide';

  const leftHint =
    step === 'upload'
      ? '也可粘贴 PDF 链接 (Ctrl + V) / DOI'
      : step === 'decide'
        ? '也可点击「跳过」直接进入手动填写'
        : '';

  return (
    <div className="flex items-center justify-between gap-2 px-6 py-3 bg-surface-1 border-t border-border-soft">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {leftHint}
      </span>

      <div className="flex items-center gap-2">
        {showSkipToManual && (
          <button
            type="button"
            onClick={onSkipToManualFill}
            disabled={confirming}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-brand-amber text-brand-amber text-sm font-semibold',
              'hover:bg-warning-soft disabled:opacity-60 transition-colors'
            )}
          >
            跳过 · 手动填写
          </button>
        )}

        {step === 'parsing' && (
          <button
            type="button"
            disabled
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-sm bg-brand-amber text-background text-sm font-bold',
              'opacity-90 cursor-default'
            )}
          >
            <Loader2 className="size-3.5 animate-spin" />
            继续等待匹配
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-sm text-sm font-semibold text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
        >
          × {step === 'parsing' || confirming ? '取消(终止)' : '取消'}
        </button>
      </div>
    </div>
  );
}

// 表单 → og_* payload(formToOG)已收编到 hooks/useMetadataForm 的 toFullOgPayload。
