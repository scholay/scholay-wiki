import { Check, Clock3, Loader2, Scale } from "lucide-react";

const STAGES = [
  { label: "方法论编排", state: "active" },
  { label: "审稿人 A", state: "waiting" },
  { label: "审稿人 B", state: "waiting" },
  { label: "审稿人 C", state: "waiting" },
  { label: "主审决议", state: "waiting" },
] as const;

/** 智能审稿运行进度 · 纯样式 fixture，冻结在方法论编排阶段。 */
export function WikiEmbedPeerReviewProgress() {
  return (
    <div
      className="w-[min(100%,46rem)] rounded-12 border border-border bg-surface-card p-4"
      aria-hidden
      data-wiki-fixture="peer-review-progress"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-8 border border-brand-amber/30 bg-warning-soft px-3 py-3">
        <Loader2 className="size-4 shrink-0 text-brand-amber" />
        <div className="min-w-0 flex-1">
          <p className="text-12 font-medium text-foreground">
            通读全文 · 制定审稿标准…
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-pill bg-brand-amber/20">
            <div className="h-full w-1/5 rounded-pill bg-brand-amber" />
          </div>
        </div>
        <span className="shrink-0 text-12 tabular-nums text-brand-amber">
          阶段 1 / 5
        </span>
      </div>

      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STAGES.map((stage, index) => (
          <li
            key={stage.label}
            className={
              stage.state === "active"
                ? "rounded-8 border border-brand-amber/40 bg-warning-soft p-3"
                : "rounded-8 border border-border-soft bg-surface-1 p-3"
            }
          >
            <span
              className={
                stage.state === "active"
                  ? "inline-flex size-7 items-center justify-center rounded-pill bg-brand-amber/20 text-brand-amber"
                  : "inline-flex size-7 items-center justify-center rounded-pill border border-border bg-surface-card text-faint"
              }
            >
              {stage.state === "active" ? (
                <Loader2 className="size-3.5" />
              ) : (
                index + 1
              )}
            </span>
            <p className="mt-2 text-12 font-medium text-foreground">
              {stage.label}
            </p>
            <p className="mt-1 text-12 text-faint">
              {stage.state === "active" ? "进行中" : "待开始"}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-8 bg-surface-1 px-3 py-2 text-12 text-subtle">
          <Clock3 className="size-3.5 text-faint" />
          审稿人会按 A → B → C 串行形成报告
        </div>
        <div className="flex items-center gap-2 rounded-8 bg-surface-1 px-3 py-2 text-12 text-subtle">
          <Scale className="size-3.5 text-faint" />
          主审在三份报告完成后独立汇总
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-12 text-faint">
        <Check className="size-3.5 text-brand-green" />
        失败后已完成的部分意见仍可保留，并从未完成阶段重试。
      </div>
    </div>
  );
}
