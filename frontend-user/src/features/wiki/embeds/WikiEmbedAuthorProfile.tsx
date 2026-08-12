import { BadgeCheck, ExternalLink } from "lucide-react";

const STATS = [
  ["发表论文", "186"],
  ["被引次数", "24,731"],
  ["H-Index", "68"],
  ["篇均被引", "133"],
] as const;

const PAPERS = [
  ["Robust Evaluation of Foundation Models", "1,284 次引用"],
  ["Evidence-Grounded Scientific Retrieval", "906 次引用"],
  ["Human Oversight in Research Assistants", "445 次引用"],
] as const;

/**
 * 作者档案页 · 纯样式 fixture。
 * 对齐 product-mock AuthorHero + TopicSection + FeaturedPapersCol。
 */
export function WikiEmbedAuthorProfile() {
  return (
    <article
      className="w-[min(100%,48rem)] space-y-4 rounded-16 border border-border bg-surface-card p-6"
      aria-hidden
      data-wiki-fixture="author-profile"
    >
      <section className="flex flex-col gap-6 rounded-12 border border-border bg-surface-1 p-6 sm:flex-row">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-pill bg-brand-green-soft font-display text-32 font-medium text-brand-green">
          L
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-12 font-medium text-brand-green">
            学者档案
            <span className="text-border-strong">·</span>
            Scholay Graph
          </p>
          <h2 className="mt-2 font-display text-28 font-medium leading-display text-foreground">
            Lin Chen
          </h2>
          <p className="mt-1 text-14 text-subtle">
            Institute for AI Research · Example University
          </p>
          <span className="mt-3 inline-flex items-center gap-2 rounded-pill bg-brand-green-soft px-3 py-1 text-12 font-medium text-brand-green">
            <BadgeCheck className="size-3" />
            ORCID 已验证
          </span>
        </div>

        <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-8 border border-border bg-surface-card px-3 text-12 font-medium text-subtle">
          <ExternalLink className="size-3" />
          个人主页
        </span>
      </section>

      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        data-wiki-spot="作者指标"
      >
        {STATS.map(([label, value]) => (
          <div key={label} className="rounded-12 border border-border p-3">
            <p className="font-display text-20 font-medium tabular-nums text-foreground">
              {value}
            </p>
            <p className="mt-1 text-12 text-faint">{label}</p>
          </div>
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <div className="overflow-hidden rounded-12 border border-border">
          <header className="border-b border-border bg-surface-1 px-4 py-3">
            <h3 className="text-14 font-medium text-foreground">代表作</h3>
          </header>
          <ul className="divide-y divide-border-hairline">
            {PAPERS.map(([title, metric], index) => (
              <li key={title} className="flex gap-3 px-4 py-3">
                <span className="text-12 tabular-nums text-faint">
                  0{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-14 font-medium leading-sans text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-12 text-faint">{metric}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-12 border border-border p-4">
          <h3 className="text-14 font-medium text-foreground">研究主题</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "Computer Vision",
              "Deep Learning",
              "Recognition",
              "Detection",
            ].map((topic) => (
              <span
                key={topic}
                className="rounded-pill bg-surface-2 px-3 py-1 text-12 text-subtle"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}
