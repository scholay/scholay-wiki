import { Check, Info, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { ParsingPhase } from './types';
import type { ParsedEvent } from '../../api/upload-resolve';
import { StepBanner } from '../shared/dialog-chrome';
import { PdfPreviewCard } from './PdfPreviewCard';

/**
 * 本地上传 · State 1 —— 刚上传 / 系统自动检索匹配
 *
 * 对照设计稿 scholay0523.pen 帧 `M6NQBY` 第二段 State 1:
 *   - 左列:PDF 首页缩略图卡片(文件名 / 大小 · 页数 / 1/N 翻页 / 第 1 页预览)
 *   - 右列:5 步检索进度 checklist + ⓘ "跳过自动匹配" 提示卡
 *
 * 后端 SSE 只暴露 2 个事件(parsed → searched),phase 三档
 * uploading → searching → done,映射到设计上的 5 步:
 *   1. 提取 PDF 元数据指纹                        —— 'uploading' active,phase ≥ 'searching' 完成
 *   2. 检索 Graph / Discovery 学术源    —— 'searching' active,'done' 完成
 *   3. 检索 Medicine 医学源                         —— 'searching' active,'done' 完成
 *   4. 归并 / 排序候选项                          —— 'done' 完成
 *   5. 返回最佳建议                               —— 'done' 完成(下一帧 step 切到 decide)
 *
 * 三源对外品牌名 Graph/Discovery/Medicine(内部映射 stc/olx/pmd,真名不对外)
 * 见 ../../lib/resolve-paper 的 sourceBrandLabel。
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
      {/* 顶部状态条 —— State 1 提示(对照设计稿) */}
      <StepBanner
        step={2}
        title="自动匹配中"
        desc="正在识别这份 PDF,并在在线论文库中查找匹配的论文"
      />

      {/* 双列主体:左 PDF 预览(共享),右检索进度 */}
      <div className="grid grid-cols-[minmax(0,300px)_1fr] gap-4">
        <PdfPreviewCard file={file} parsed={parsed} />

        {/* ─── 右列:5 步检索进度 ───────────────────────────────────────── */}
        <div className="rounded-12 border border-border bg-surface-card p-5">
          <div className="flex items-center gap-2.5 mb-1">
            <Loader2 className="size-4 animate-spin text-brand-amber" />
            <span className="text-14 font-medium text-foreground">
              正在自动检索在线论文信息…
            </span>
          </div>
          <div className="text-12 text-muted-foreground mb-5">
            匹配通常在 5-10 秒内完成
          </div>

          <ul className="space-y-3">
            <ProgressItem
              label="识别 PDF 内容"
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
              label="检索在线论文库 (Graph / Discovery)"
              state={stateFor(phase, 'scholarly')}
              doneHint="完成"
              activeHint="处理中…"
              pendingHint="待执行"
            />
            <ProgressItem
              label="检索医学库 (Medicine)"
              state={stateFor(phase, 'medicine')}
              doneHint="完成"
              activeHint="进行中…"
              pendingHint="待执行"
            />
            <ProgressItem
              label="整理候选结果"
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
          <div className="mt-5 flex items-center gap-2 px-3 py-2 rounded-8 bg-surface-1 border border-border-soft">
            <Info className="size-3.5 text-faint shrink-0" />
            <span className="text-12 text-muted-foreground">
              检索完成后,可以跳过匹配直接保存
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
            'text-14',
            state === 'done'
              ? 'text-foreground font-medium'
              : state === 'active'
                ? 'text-foreground font-medium'
                : 'text-faint'
          )}
        >
          {label}
        </div>
        <div className="text-12 text-muted-foreground mt-0.5">{hint}</div>
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
 * 后端 SSE 只有 'uploading' / 'searching' / 'done' 3 阶段(parsed 事件直接把
 * phase 推到 'searching'),这里映射到设计稿的 5 个 step,保证各步按
 * pending → active → done 连贯推进:
 *   - fingerprint:'uploading' active,phase ≥ 'searching' 完成
 *   - scholarly / medicine(三源检索):'searching' 时 active,'done' 时完成
 *   - merge / finalize:'done' 时完成(瞬时收尾,不展示 active;下一帧切 decide)
 */
type StepKey = 'fingerprint' | 'scholarly' | 'medicine' | 'merge' | 'finalize';

function stateFor(phase: ParsingPhase, key: StepKey): ItemState {
  const phaseRank: Record<ParsingPhase, number> = {
    uploading: 0,
    searching: 1,
    done: 2,
  };
  const r = phaseRank[phase];

  // 各 step 在哪个 phaseRank 下变 active / done
  const map: Record<StepKey, { doneAt: number; activeAt: number }> = {
    fingerprint: { activeAt: 0, doneAt: 1 },
    scholarly: { activeAt: 1, doneAt: 2 },
    medicine: { activeAt: 1, doneAt: 2 },
    merge: { activeAt: 2, doneAt: 2 },
    finalize: { activeAt: 2, doneAt: 2 },
  };
  const m = map[key];
  if (r >= m.doneAt) return 'done';
  if (r >= m.activeAt) return 'active';
  return 'pending';
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
