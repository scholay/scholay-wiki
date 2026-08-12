import { Check, Clock, Loader2, Scale } from "lucide-react";

/**
 * 智能审稿运行进度 · 纯样式 fixture。
 * 冻结 current RecordDetailPage / StatusGrid 的“方法论编排中”状态：初审已通过，
 * 三位审稿人与主审都尚未开始，避免把五阶段画成五张彼此独立的卡。
 */
export function WikiEmbedPeerReviewProgress() {
  return (
    <div
      className="w-[min(100%,52rem)] overflow-x-auto rounded-16 bg-surface-3 p-4"
      aria-hidden
      data-wiki-fixture="peer-review-progress"
    >
      <section className="min-w-3xl rounded-16 border border-border bg-surface-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-4 border border-border bg-surface-1 px-2 py-1 text-12 font-medium text-subtle">
                审稿中
              </span>
              <span className="text-12 text-muted-foreground">
                投稿时间 2026-08-12 14:21
              </span>
            </div>
            <h2 className="mt-1 truncate font-serif text-20 font-bold leading-display-tight text-foreground">
              Diffusion Models for Accelerated MRI Reconstruction
            </h2>
            <p className="mt-2 text-12 text-muted-foreground">
              Nature Machine Intelligence · 医学影像
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-12 border border-brand-amber/40 bg-warning-soft px-4 py-2">
            <Loader2 className="size-4 shrink-0 text-brand-amber" />
            <span className="shrink-0 text-12 font-medium text-brand-amber">
              通读全文 · 制定审稿标准…
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-pill bg-brand-amber/15">
              <div className="h-full w-[8%] rounded-pill bg-brand-amber" />
            </div>
            <span className="shrink-0 text-12 font-medium tabular-nums text-brand-amber">
              阶段 1/5 · 预计剩余 ~10 分钟
            </span>
          </div>

          <div className="flex items-stretch">
            <EditorialCell />
            <Connector />
            <div className="flex shrink-0 overflow-hidden rounded-12 border border-border-strong bg-surface-card">
              <ReviewerCell letter="A" active />
              <span className="w-px self-stretch bg-border-soft" />
              <ReviewerCell letter="B" />
              <span className="w-px self-stretch bg-border-soft" />
              <ReviewerCell letter="C" />
            </div>
            <Connector />
            <ChiefCell />
          </div>
        </div>
      </section>
    </div>
  );
}

function EditorialCell() {
  return (
    <div className="flex w-44 shrink-0 flex-col justify-center gap-2 rounded-12 border border-border-strong bg-surface-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-pill bg-brand-green text-on-brand">
          <Check className="size-3.5" strokeWidth={3.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-14 font-medium text-foreground">
            编辑部初审
          </p>
          <p className="truncate text-12 text-faint">排版 · 查重 · AIGC</p>
        </div>
        <span className="rounded-4 bg-surface-2 px-2 py-1 text-12 font-medium text-subtle">
          通过
        </span>
      </div>
      <div className="flex items-end justify-between">
        <span className="font-serif text-20 font-bold text-foreground">
          通过
        </span>
        <span className="text-12 text-faint">4/4 项</span>
      </div>
    </div>
  );
}

function ReviewerCell({
  letter,
  active = false,
}: {
  letter: string;
  active?: boolean;
}) {
  return (
    <div
      className={
        active
          ? "flex w-28 flex-col items-center justify-center gap-2 bg-surface-2 px-2 py-3 text-center"
          : "flex w-28 flex-col items-center justify-center gap-2 bg-surface-card px-2 py-3 text-center"
      }
    >
      <span className="flex size-9 items-center justify-center rounded-pill border-2 border-border-strong bg-surface-card font-serif text-12 font-bold text-faint">
        {letter}
      </span>
      <p className="text-14 font-medium text-muted-foreground">
        审稿人 {letter}
      </p>
      <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-1 text-12 font-medium text-faint">
        <Clock className="size-2.5" />
        等待中
      </span>
    </div>
  );
}

function ChiefCell() {
  return (
    <div className="flex w-64 shrink-0 flex-col justify-center gap-2 rounded-12 border border-border-strong bg-surface-card px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-pill border-2 border-border-strong text-faint">
          <Scale className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-14 font-medium text-muted-foreground">
            主审决议
          </p>
          <p className="truncate text-12 text-faint">待 3 位完成</p>
        </div>
        <span className="rounded-pill bg-surface-2 px-2 py-1 text-12 font-medium text-faint">
          待汇总
        </span>
      </div>
      <span className="font-serif text-20 font-bold text-faint">待定</span>
    </div>
  );
}

function Connector() {
  return <span className="my-auto h-px min-w-6 flex-1 bg-border-strong" />;
}
