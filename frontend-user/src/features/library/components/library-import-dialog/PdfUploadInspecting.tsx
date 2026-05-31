import { Check, Info, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { ParsingPhase } from '../pdf-import-wizard/types';
import type { ParsedEvent } from '../../api/upload-resolve';
import { PdfPreviewCard } from './PdfPreviewCard';

/**
 * 本地上传 · State 1 —— 刚上传 / 系统自动检索匹配
 *
 * 对照设计稿 scholay0523.pen 帧 `M6NQBY` 第二段 State 1:
 *   - 左列:PDF 首页缩略图卡片(文件名 / 大小 · 页数 / 1/N 翻页 / 第 1 页预览)
 *   - 右列:5 步检索进度 checklist + ⓘ "跳过自动匹配" 提示卡
 *
 * 后端 SSE 只暴露 2 个事件(parsed → searched),设计上是 5 步:
 *   1. 提取 PDF 元数据指纹      —— phase ≥ 'searching' 即完成
 *   2. 查询 Crossref            —— phase ≥ 'searching' 即完成(后端打包到 search 阶段)
 *   3. 查询 Semantic Scholar    —— phase === 'searching' active,phase === 'done' 完成
 *   4. 归并 / 排序候选项        —— phase === 'done' 完成
 *   5. 返回最佳建议             —— phase === 'done' 完成(下一帧 step 切到 decide)
 */

interface PdfUploadInspectingProps {
  file: File;
  phase: ParsingPhase;
  parsed: ParsedEvent | null;
}

export function PdfUploadInspecting({
  file,
  phase,
  parsed,
}: PdfUploadInspectingProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* 顶部状态条 —— State 1 起点提示(对照设计稿) */}
      <div className="rounded-md border border-border-soft bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-pill bg-brand-amber text-background text-2xs font-bold tabular-nums">
            1
          </span>
          <span className="text-sm font-semibold text-foreground">刚上传</span>
          <span className="text-faint">·</span>
          <span className="text-xs text-muted-foreground">
            PDF 已上传 / 提取指纹 / 调用 Crossref + Semantic Scholar / 准备结果
          </span>
        </div>
      </div>

      {/* 双列主体:左 PDF 预览(共享),右检索进度 */}
      <div className="grid grid-cols-[minmax(0,300px)_1fr] gap-4">
        <PdfPreviewCard file={file} parsed={parsed} />

        {/* ─── 右列:5 步检索进度 ───────────────────────────────────────── */}
        <div className="rounded-md border border-border bg-background p-5">
          <div className="flex items-center gap-2.5 mb-1">
            <Loader2 className="size-4 animate-spin text-brand-amber" />
            <span className="text-sm font-bold text-foreground">
              正在自动检索文献元数据…
            </span>
          </div>
          <div className="text-xs text-muted-foreground mb-5">
            结合 PDF 指纹 + 文本特征,匹配通常在 5-10 秒完成
          </div>

          <ul className="space-y-3">
            <ProgressItem
              label="提取 PDF 元数据指纹"
              state={stateFor(phase, 'fingerprint')}
              doneHint={
                parsed?.title
                  ? `完成 · 已识别"${truncate(parsed.title, 24)}"`
                  : '完成'
              }
              activeHint="处理中…"
              pendingHint="待执行"
            />
            <ProgressItem
              label="查询 Crossref"
              state={stateFor(phase, 'crossref')}
              doneHint="完成"
              activeHint="处理中…"
              pendingHint="待执行"
            />
            <ProgressItem
              label="查询 Semantic Scholar"
              state={stateFor(phase, 'semantic')}
              doneHint="完成"
              activeHint="进行中…"
              pendingHint="待执行"
            />
            <ProgressItem
              label="归并 / 排序候选项"
              state={stateFor(phase, 'merge')}
              doneHint="完成"
              activeHint="处理中…"
              pendingHint="待执行"
            />
            <ProgressItem
              label="返回最佳建议"
              state={stateFor(phase, 'finalize')}
              doneHint="完成"
              activeHint="处理中…"
              pendingHint="待执行"
            />
          </ul>

          {/* "跳过自动匹配"提示 */}
          <div className="mt-5 flex items-center gap-2 px-3 py-2 rounded-sm bg-surface-1 border border-border-soft">
            <Info className="size-3.5 text-faint shrink-0" />
            <span className="text-xs text-muted-foreground">
              不想等?点击右下角「跳过自动匹配」可立即手动填写
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 5 步进度的逐项渲染 ──────────────────────────────────────────────────────

type ItemState = 'done' | 'active' | 'pending';

function ProgressItem({
  label,
  state,
  doneHint,
  activeHint,
  pendingHint,
}: {
  label: string;
  state: ItemState;
  doneHint: string;
  activeHint: string;
  pendingHint: string;
}) {
  const hint =
    state === 'done' ? doneHint : state === 'active' ? activeHint : pendingHint;
  return (
    <li className="flex items-start gap-3">
      <StateMark state={state} />
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-sm',
            state === 'done'
              ? 'text-foreground font-semibold'
              : state === 'active'
                ? 'text-foreground font-semibold'
                : 'text-faint'
          )}
        >
          {label}
        </div>
        <div className="text-2xs text-muted-foreground mt-0.5">{hint}</div>
      </div>
    </li>
  );
}

function StateMark({ state }: { state: ItemState }) {
  if (state === 'done') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-pill bg-brand-green/15 border border-brand-green text-brand-green shrink-0">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-pill border border-foreground text-foreground shrink-0">
        <Loader2 className="size-3 animate-spin" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-pill border border-border text-faint shrink-0">
      <span className="size-1.5 rounded-pill bg-faint" />
    </span>
  );
}

// ─── phase → 各步骤状态映射 ─────────────────────────────────────────────────

/**
 * 后端 SSE 只有 'uploading' / 'parsed' / 'searching' / 'done' 4 阶段,
 * 这里映射到设计稿的 5 个 step。原则:
 *   - fingerprint:phase >= 'searching' 即完成(parsed 事件后)
 *   - crossref:与 fingerprint 同步完成(后端打包了)
 *   - semantic:'searching' 时 active,'done' 时完成
 *   - merge / finalize:phase === 'done' 时完成
 */
type StepKey = 'fingerprint' | 'crossref' | 'semantic' | 'merge' | 'finalize';

function stateFor(phase: ParsingPhase, key: StepKey): ItemState {
  const phaseRank: Record<ParsingPhase, number> = {
    uploading: 0,
    parsed: 1,
    searching: 2,
    done: 3,
  };
  const r = phaseRank[phase];

  // 各 step 在哪个 phaseRank 下变 active / done
  const map: Record<StepKey, { doneAt: number; activeAt: number }> = {
    fingerprint: { activeAt: 0, doneAt: 2 },
    crossref: { activeAt: 1, doneAt: 2 },
    semantic: { activeAt: 2, doneAt: 3 },
    merge: { activeAt: 2, doneAt: 3 },
    finalize: { activeAt: 2, doneAt: 3 },
  };
  const m = map[key];
  if (r >= m.doneAt) return 'done';
  if (r >= m.activeAt) return 'active';
  return 'pending';
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
