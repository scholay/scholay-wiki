import { AlertTriangle, Check, FileWarning } from "lucide-react";

const CHECKS = [
  { label: "查重率", value: "6.2%", threshold: "≤ 15%" },
  { label: "AIGC 率", value: "4.1%", threshold: "≤ 20%" },
  { label: "排版规范", value: "96%", threshold: "≥ 90%" },
  { label: "选题匹配", value: "88%", threshold: "≥ 70%" },
] as const;

/** 编辑部初审固定演示层 · 纯样式 fixture，显式标注数值不是检测结果。 */
export function WikiEmbedPeerReviewEditorialCheck() {
  return (
    <div
      className="w-[min(100%,46rem)] rounded-12 border border-border bg-surface-card p-4"
      aria-hidden
      data-wiki-fixture="peer-review-editorial-check"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-brand-green/10 text-brand-green">
          <Check className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-12 text-faint">编辑部初审</p>
          <h2 className="mt-1 font-serif text-20 font-medium text-foreground">
            四项基础检查 · 全部通过
          </h2>
        </div>
        <span className="rounded-pill bg-brand-green/10 px-3 py-1 text-12 text-brand-green">
          固定演示层
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CHECKS.map((item) => (
          <section
            key={item.label}
            className="rounded-8 border border-border-soft bg-surface-1 p-3"
          >
            <p className="text-12 font-medium text-foreground">{item.label}</p>
            <p className="mt-2 font-serif text-20 font-medium text-foreground">
              {item.value}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2 text-12">
              <span className="text-faint">阈值 {item.threshold}</span>
              <span className="text-brand-green">通过</span>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-8 border border-brand-amber/30 bg-warning-soft p-3">
        <AlertTriangle className="mt-1 size-4 shrink-0 text-brand-amber" />
        <div>
          <p className="text-12 font-medium text-foreground">
            这些数值不是本稿件的测量结果
          </p>
          <p className="mt-1 text-12 leading-paragraph text-subtle">
            当前提交成功即按产品约定显示通过；6.2%、4.1%、96% 与 88%
            均来自前端预设展示。
          </p>
        </div>
      </div>

      <p className="mt-3 flex items-start gap-2 text-12 leading-paragraph text-faint">
        <FileWarning className="mt-1 size-3.5 shrink-0" />
        不能把本页当作查重报告、AIGC 检测证明、排版验收或正式送审凭证。
      </p>
    </div>
  );
}
