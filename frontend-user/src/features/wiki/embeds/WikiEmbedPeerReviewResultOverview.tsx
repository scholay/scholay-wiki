import { Check, FileCheck2, Scale } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const RESULT_STAGES = [
  { id: "editorial", label: "编辑部初审", result: "通过", tone: "green" },
  { id: "alpha", label: "审稿人 A", result: "小修", tone: "amber" },
  { id: "beta", label: "审稿人 B", result: "大修", tone: "amber" },
  { id: "gamma", label: "审稿人 C", result: "小修", tone: "amber" },
  { id: "chief", label: "主审决议", result: "大修", tone: "red" },
] as const;

/** 审稿结果五页签与主审决议 · 纯样式 fixture。 */
export function WikiEmbedPeerReviewResultOverview() {
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="peer-review-result-overview"
    >
      <div className="px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-4 bg-danger-soft px-2 py-1 text-12 font-medium text-brand-red">
                已决议 · 大修
              </span>
              <span className="text-12 text-faint">最近更新 08-12 14:30</span>
            </div>
            <h2 className="mt-2 truncate font-serif text-20 font-medium text-foreground">
              Diffusion Models for Accelerated MRI Reconstruction
            </h2>
            <p className="mt-1 text-12 text-subtle">
              Nature Machine Intelligence · 医学影像
            </p>
          </div>
        </div>

        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {RESULT_STAGES.map((stage) => (
            <li
              key={stage.id}
              className={cn(
                "rounded-8 border p-3",
                stage.id === "chief"
                  ? "border-brand-red/40 bg-danger-soft"
                  : "border-border-soft bg-surface-1",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-pill",
                  stage.tone === "green" && "bg-brand-green text-on-dark",
                  stage.tone === "amber" && "bg-brand-amber text-on-dark",
                  stage.tone === "red" && "bg-brand-red text-on-dark",
                )}
              >
                {stage.id === "chief" ? (
                  <Scale className="size-3.5" />
                ) : (
                  <Check className="size-3.5" />
                )}
              </span>
              <p className="mt-2 truncate text-12 font-medium text-foreground">
                {stage.label}
              </p>
              <p className="mt-1 text-12 text-faint">{stage.result}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="overflow-x-auto border-y border-border-soft bg-surface-1 px-4">
        <div className="flex min-w-max gap-4">
          {RESULT_STAGES.map((stage) => (
            <span
              key={stage.id}
              className={cn(
                "inline-flex h-10 items-center border-b-2 text-12",
                stage.id === "chief"
                  ? "border-brand-red font-medium text-brand-red"
                  : "border-transparent text-subtle",
              )}
            >
              {stage.label}
            </span>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        <div className="border-l-2 border-foreground pl-4">
          <p className="text-12 text-faint">SCHOLAY 主审</p>
          <p className="mt-2 font-serif text-18 italic leading-paragraph text-foreground">
            研究问题具有价值，但外部验证、消融实验与误差分析仍需补强后再评估。
          </p>
        </div>
        <div className="mt-4 flex items-end gap-3 border-t border-border-soft pt-4">
          <FileCheck2 className="size-5 text-brand-red" />
          <p className="text-12 text-faint">确认结果</p>
          <p className="font-serif text-24 font-medium text-brand-red">大修</p>
          <p className="text-12 text-subtle">综合 72 / 100</p>
        </div>
        <p className="mt-3 rounded-8 bg-warning-soft px-3 py-2 text-12 leading-paragraph text-subtle">
          界面中的结果、分数与决议均为 AI 模拟评议，不是期刊或学校的正式决定。
        </p>
      </div>
    </div>
  );
}
