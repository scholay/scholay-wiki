import { AlertCircle, Check, Scale } from "lucide-react";

const DIMENSIONS = [
  { name: "科学性", grade: "B", note: "外部验证不足" },
  { name: "严谨性", grade: "B", note: "补充效应量" },
  { name: "创新性", grade: "A", note: "问题设置清晰" },
  { name: "可读性", grade: "A", note: "结构完整" },
] as const;

/** 审稿人四维评分、逐句意见与主审汇总 · 纯样式 fixture。 */
export function WikiEmbedPeerReviewReport() {
  return (
    <div
      className="w-[min(100%,46rem)] space-y-3"
      aria-hidden
      data-wiki-fixture="peer-review-report"
    >
      <section className="rounded-12 border border-border bg-surface-card p-4">
        <header className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-pill bg-brand-amber text-on-dark font-serif text-16 font-medium">
            B
          </span>
          <p className="text-14 font-medium text-foreground">审稿人 B</p>
          <div className="ml-auto text-right">
            <p className="font-serif text-24 font-medium text-brand-amber">
              72 <span className="text-12 text-faint">/ 100</span>
            </p>
            <p className="text-12 text-subtle">推荐 · 大修</p>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DIMENSIONS.map((dimension) => (
            <div
              key={dimension.name}
              className="rounded-8 border border-border-soft bg-surface-1 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-12 font-medium text-foreground">
                  {dimension.name}
                </p>
                <span className="inline-flex size-7 items-center justify-center rounded-pill border border-brand-amber/40 text-12 font-medium text-brand-amber">
                  {dimension.grade}
                </span>
              </div>
              <p className="mt-2 text-12 leading-paragraph text-faint">
                {dimension.note}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-8 border border-border-soft bg-surface-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-4 bg-surface-2 px-2 py-1 text-12 text-subtle">
              方法 · 第 3 段
            </span>
            <span className="rounded-4 bg-warning-soft px-2 py-1 text-12 text-brand-amber">
              重要
            </span>
            <span className="ml-auto text-12 text-faint">逐句意见</span>
          </div>
          <blockquote className="mt-3 border-l-2 border-border-strong bg-surface-card px-3 py-2 text-12 italic leading-paragraph text-subtle">
            “模型在公开数据集上取得稳定提升。”
          </blockquote>
          <div className="mt-3 grid gap-2 sm:grid-cols-[4rem_minmax(0,1fr)]">
            <span className="text-12 font-medium text-faint">问题</span>
            <p className="text-12 leading-paragraph text-subtle">
              “稳定提升”缺少效应量、置信区间和外部数据验证。
            </p>
            <span className="text-12 font-medium text-faint">建议</span>
            <p className="text-12 leading-paragraph text-subtle">
              补充逐数据集结果，并把结论强度限定在已验证范围。
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-12 border border-border bg-surface-card p-4">
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-brand-red" />
          <p className="text-14 font-medium text-foreground">主审汇总</p>
          <span className="ml-auto rounded-pill bg-danger-soft px-3 py-1 text-12 text-brand-red">
            大修
          </span>
        </div>
        <p className="mt-3 text-12 leading-paragraph text-subtle">
          三位审稿人一致认可研究问题，但对外部验证与统计报告提出关键保留意见。
        </p>
        <ul className="mt-3 space-y-2">
          <li className="flex items-start gap-2 text-12 text-foreground">
            <AlertCircle className="mt-1 size-3.5 shrink-0 text-brand-red" />
            必改：补充独立数据集验证与置信区间。
          </li>
          <li className="flex items-start gap-2 text-12 text-foreground">
            <Check className="mt-1 size-3.5 shrink-0 text-brand-green" />
            建议：按临床场景拆分误差分析。
          </li>
        </ul>
        <p className="mt-3 border-t border-border-soft pt-3 text-12 text-faint">
          界面示意 · 评分、意见和决议不是正式同行评审结果。
        </p>
      </section>
    </div>
  );
}
