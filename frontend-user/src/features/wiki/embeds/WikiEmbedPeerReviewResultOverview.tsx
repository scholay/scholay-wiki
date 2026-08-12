import { Check, Scale } from "lucide-react";
import type { CSSProperties } from "react";

const PEER_RESULT_MOCK_THEME = {
  "--wiki-mock-space-5": "1.25rem",
} as CSSProperties;

const TABS = [
  { label: "编辑部初审", badge: "" },
  { label: "审稿人 A", badge: "78" },
  { label: "审稿人 B", badge: "72" },
  { label: "审稿人 C", badge: "81" },
  { label: "主审决议", badge: "返修" },
] as const;

/**
 * 智能审稿结果总览 · 纯样式 fixture。
 * 冻结 RecordDetailPage 已完成且“主审决议”页签选中的单一状态，顶部状态格、
 * 页签和主审正文均属于同一份报告，不再把内部“大修”字段直接展示给用户。
 */
export function WikiEmbedPeerReviewResultOverview() {
  return (
    <div
      className="w-[min(100%,54rem)] rounded-16 bg-surface-3 p-4"
      style={PEER_RESULT_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="peer-review-result-overview"
    >
      <section className="overflow-x-auto rounded-16 border border-border bg-surface-card p-4">
        <div className="min-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-4 bg-warning-soft px-2 py-1 text-12 font-medium text-brand-amber">
                  已决议 · 返修
                </span>
                <span className="text-12 text-muted-foreground">
                  投稿时间 2026-08-12 14:21 · 最近更新 08-12 14:30
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

          <div className="mt-4 flex items-stretch">
            <EditorialResult />
            <Connector />
            <div className="flex shrink-0 overflow-hidden rounded-12 border border-border-strong bg-surface-card">
              <ReviewerResult letter="A" score="78" tone="green" />
              <span className="w-px self-stretch bg-border-soft" />
              <ReviewerResult letter="B" score="72" tone="amber" />
              <span className="w-px self-stretch bg-border-soft" />
              <ReviewerResult letter="C" score="81" tone="green" />
            </div>
            <Connector />
            <ChiefResult />
          </div>
        </div>
      </section>

      <div className="mt-3 overflow-x-auto border-b border-border-soft">
        <div className="flex min-w-max gap-6">
          {TABS.map((tab) => {
            const active = tab.label === "主审决议";
            return (
              <span
                key={tab.label}
                className={
                  active
                    ? "flex items-center gap-2 border-b-2 border-brand-red pb-2 text-12 font-medium text-foreground"
                    : "flex items-center gap-2 border-b-2 border-transparent pb-2 text-12 text-muted-foreground"
                }
              >
                {active ? (
                  <Scale className="size-3.5 text-brand-amber" />
                ) : (
                  <span
                    className={
                      tab.label === "审稿人 B"
                        ? "size-2 rounded-pill bg-brand-amber"
                        : "size-2 rounded-pill bg-brand-green"
                    }
                  />
                )}
                {tab.label}
                {tab.badge ? (
                  <span
                    className={
                      active || tab.label === "审稿人 B"
                        ? "rounded-pill bg-warning-soft px-2 py-1 text-12 font-medium text-brand-amber"
                        : "rounded-pill bg-brand-green/10 px-2 py-1 text-12 font-medium text-brand-green"
                    }
                  >
                    {tab.badge}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>

      <article className="flex flex-col gap-6 bg-surface-3 px-4 py-[var(--wiki-mock-space-5)]">
        <section className="flex flex-col gap-3 border-l-2 border-foreground py-3 pl-6">
          <p className="text-12 font-medium text-faint">SCHOLAY 主审</p>
          <p className="font-serif text-20 italic font-medium leading-paragraph text-foreground">
            研究问题具有价值，但外部验证、消融实验与误差分析仍需补强后再评估。
          </p>
          <p className="text-12 font-medium text-muted-foreground">
            综合分 72 / 100 · 返修
          </p>
        </section>

        <header className="flex items-end justify-between border-b-2 border-foreground pb-1">
          <h3 className="font-serif text-16 font-bold text-foreground">
            审稿人综合意见
          </h3>
          <p className="text-12 text-faint">主审独立复审后逐位回应</p>
        </header>

        <section className="flex flex-col gap-3 border-b border-border-soft pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-serif text-20 font-bold text-border-strong">
                01
              </span>
              <p className="text-14 font-medium text-foreground">
                审稿人 A · 综合 78 · 推荐录用
              </p>
            </div>
            <p className="text-12 font-medium text-foreground">
              主审：部分同意
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-[6rem_minmax(0,1fr)]">
            <p className="text-12 font-medium text-faint">其综合意见</p>
            <p className="text-14 leading-paragraph text-subtle">
              方法具有潜力，建议补足外部数据验证并收紧结论范围。
            </p>
            <p className="text-12 font-medium text-foreground">主审判断</p>
            <p className="text-14 font-medium leading-paragraph text-foreground">
              该问题会直接影响结果的可推广性，应作为本轮返修的核心要求。
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-3 pt-2">
          <header className="border-b-2 border-foreground pb-1">
            <h3 className="font-serif text-16 font-bold text-foreground">
              确认结果
            </h3>
          </header>
          <div className="flex items-end gap-4 py-2">
            <p className="w-24 shrink-0 text-12 font-medium text-faint">结果</p>
            <p className="font-serif text-32 font-bold leading-display-tight text-brand-amber">
              返修
            </p>
            <p className="text-14 font-medium text-muted-foreground">
              综合 72 / 100
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-[6rem_minmax(0,1fr)]">
            <p className="text-12 font-medium text-faint">必改 2 条</p>
            <ol className="list-decimal space-y-1 pl-4 text-14 leading-paragraph text-subtle">
              <li>补充独立数据集外部验证与置信区间。</li>
              <li>报告消融实验并解释关键误差来源。</li>
            </ol>
          </div>
        </section>
      </article>
    </div>
  );
}

function EditorialResult() {
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

function ReviewerResult({
  letter,
  score,
  tone,
}: {
  letter: string;
  score: string;
  tone: "green" | "amber";
}) {
  const avatar =
    tone === "green"
      ? "bg-brand-green text-on-brand"
      : "bg-brand-amber text-foreground";
  const badge =
    tone === "green"
      ? "bg-brand-green/10 text-brand-green"
      : "bg-warning-soft text-brand-amber";
  return (
    <div className="flex w-28 flex-col items-center justify-center gap-2 bg-surface-card px-2 py-3 text-center">
      <span
        className={`flex size-9 items-center justify-center rounded-pill font-serif text-12 font-bold ${avatar}`}
      >
        {letter}
      </span>
      <p className="text-14 font-medium text-foreground">审稿人 {letter}</p>
      <span
        className={`inline-flex items-center gap-1 rounded-pill px-2 py-1 text-12 font-medium ${badge}`}
      >
        <Check className="size-2.5" />
        {tone === "green" ? "录用" : "返修"} · {score}
      </span>
    </div>
  );
}

function ChiefResult() {
  return (
    <div className="flex w-64 shrink-0 flex-col justify-center gap-2 rounded-12 bg-brand-amber p-4 text-foreground ring-2 ring-foreground/20 ring-offset-2 ring-offset-surface-card">
      <div className="flex items-center gap-2">
        <Scale className="size-4" />
        <p className="text-14 font-medium">主审已决议</p>
        <span className="ml-auto text-12 tabular-nums opacity-70">14:30</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="font-serif text-28 font-bold leading-display-tight">
          返修
        </span>
        <span className="text-12 font-medium opacity-85">综合 72 / 100</span>
      </div>
    </div>
  );
}

function Connector() {
  return <span className="my-auto h-px min-w-6 flex-1 bg-border-strong" />;
}
