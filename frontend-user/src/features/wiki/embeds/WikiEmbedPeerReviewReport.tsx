import { AlertCircle } from "lucide-react";
import type { CSSProperties } from "react";

const PEER_REPORT_MOCK_THEME = {
  "--wiki-mock-space-5": "1.25rem",
} as CSSProperties;

const DIMENSIONS = [
  { name: "科学性", grade: "B", note: "外部验证不足", tone: "amber" },
  { name: "严谨性", grade: "B", note: "需补充效应量", tone: "amber" },
  { name: "创新性", grade: "A", note: "问题设置清晰", tone: "green" },
  { name: "可读性", grade: "A", note: "结构完整", tone: "green" },
] as const;

/**
 * 审稿人详情报告 · 纯样式 fixture。
 * 冻结 current ReviewerDetailPanel 的“审稿人 B 报告已完成”单一页签，保留评分、
 * 逐句意见、整体性评价和综合结论；主审汇总属于另一页签，不在这里重复。
 */
export function WikiEmbedPeerReviewReport() {
  return (
    <article
      className="flex w-[min(100%,48rem)] flex-col gap-6 bg-surface-3 p-4"
      style={PEER_REPORT_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="peer-review-report"
    >
      <header className="flex items-start justify-between gap-4 rounded-16 border border-border bg-surface-card px-[var(--wiki-mock-space-5)] py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-pill bg-brand-amber text-foreground">
            <span className="font-serif text-16 font-bold">B</span>
          </span>
          <p className="text-14 font-medium text-foreground">审稿人 B</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-end gap-1">
            <span className="font-serif text-28 font-bold text-brand-amber">
              72
            </span>
            <span className="text-12 text-faint">/ 100</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-12 text-muted-foreground">推荐：</span>
            <span className="rounded-4 border border-brand-amber/60 bg-warning-soft px-2 py-1 text-12 font-medium text-brand-amber">
              返修
            </span>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-16 border border-border bg-surface-card px-[var(--wiki-mock-space-5)] py-4">
        <p className="text-14 font-medium text-foreground">
          结构化评分 · 四维度
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {DIMENSIONS.map((dimension) => (
            <DimensionCard key={dimension.name} {...dimension} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-16 border border-border bg-surface-card px-[var(--wiki-mock-space-5)] py-4">
        <header className="flex items-center justify-between gap-4">
          <p className="text-14 font-medium text-foreground">主观评论与建议</p>
          <p className="text-12 text-faint">客观评估难免主观，仅供作者参考</p>
        </header>

        <SectionHead
          tone="foreground"
          title="逐句意见"
          subtitle="针对原文具体语句的可定位修改建议"
          count="1 条"
        />
        <div className="flex flex-col gap-2 rounded-12 border border-border bg-surface-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-4 bg-surface-2 px-2 py-1 text-12 font-medium text-subtle">
              方法 · 第 3 段
            </span>
            <span className="rounded-4 bg-surface-2 px-2 py-1 text-12 text-muted-foreground">
              严谨性
            </span>
            <span className="ml-auto rounded-4 bg-danger-soft px-2 py-1 text-12 font-medium text-brand-red">
              必改
            </span>
          </div>
          <blockquote className="rounded-8 border-l-2 border-border-strong bg-surface-card px-3 py-2 text-12 italic leading-paragraph text-subtle">
            “模型在公开数据集上取得稳定提升。”
          </blockquote>
          <KvRow
            label="问题"
            text="“稳定提升”缺少效应量、置信区间和外部数据验证。"
          />
          <KvRow
            label="同行处理"
            text="通常会按数据集报告点估计、区间估计，并说明外部验证条件。"
            muted
          />
          <KvRow
            label="建议"
            text="补充逐数据集结果，并把结论强度限定在已验证范围。"
          />
        </div>

        <SectionHead
          tone="subtle"
          title="整体性评价"
          subtitle="针对结构 / 逻辑 / 叙事等宏观层面"
          count="1 条"
        />
        <div className="flex flex-col gap-2 rounded-12 border border-border bg-surface-1 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-4 bg-surface-2 px-2 py-1 text-12 text-subtle">
              论证结构
            </span>
            <span className="ml-auto text-12 font-medium text-subtle">
              需加强
            </span>
          </div>
          <p className="text-12 leading-paragraph text-subtle">
            讨论部分应把性能提升、临床意义和可推广性拆开，避免由单一数据集直接推到通用结论。
          </p>
        </div>

        <SectionHead
          tone="amber"
          title="综合结论与推荐理由"
          subtitle="结合上述意见的最终判断"
        />
        <div className="flex flex-col gap-2 rounded-12 border border-brand-amber/60 bg-surface-card px-4 py-3">
          <p className="text-12 leading-paragraph text-subtle">
            研究问题与方法框架有价值，但外部验证和统计报告仍不足以支撑当前结论，建议完成关键补充后返修。
          </p>
          <p className="flex items-center gap-2 pt-2 text-12 italic text-muted-foreground">
            <AlertCircle className="size-3.5 text-brand-amber" />
            最终结果由主审在汇总三位审稿人意见后决议。
          </p>
        </div>
      </section>
    </article>
  );
}

function DimensionCard({
  name,
  grade,
  note,
  tone,
}: {
  name: string;
  grade: string;
  note: string;
  tone: "green" | "amber";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-12 border border-border bg-surface-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-12 font-medium text-foreground">{name}</p>
        <span
          className={
            tone === "green"
              ? "inline-flex size-11 items-center justify-center rounded-pill border-4 border-brand-green/70 font-serif text-14 font-bold text-brand-green"
              : "inline-flex size-11 items-center justify-center rounded-pill border-4 border-brand-amber/70 font-serif text-14 font-bold text-brand-amber"
          }
        >
          {grade}
        </span>
      </div>
      <p className="text-12 leading-paragraph text-muted-foreground">{note}</p>
    </div>
  );
}

function SectionHead({
  tone,
  title,
  subtitle,
  count,
}: {
  tone: "foreground" | "subtle" | "amber";
  title: string;
  subtitle: string;
  count?: string;
}) {
  const bar =
    tone === "amber"
      ? "bg-brand-amber"
      : tone === "subtle"
        ? "bg-subtle"
        : "bg-foreground";
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className={`h-5 w-1 rounded-4 ${bar}`} />
      <p className="text-12 font-medium text-foreground">{title}</p>
      <p className="min-w-0 flex-1 truncate text-12 text-faint">{subtitle}</p>
      {count ? (
        <p className="shrink-0 text-12 font-medium text-faint">{count}</p>
      ) : null}
    </div>
  );
}

function KvRow({
  label,
  text,
  muted = false,
}: {
  label: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-12 font-medium text-faint">
        {label}
      </span>
      <p
        className={
          muted
            ? "flex-1 text-12 leading-paragraph text-muted-foreground"
            : "flex-1 text-12 leading-paragraph text-subtle"
        }
      >
        {text}
      </p>
    </div>
  );
}
