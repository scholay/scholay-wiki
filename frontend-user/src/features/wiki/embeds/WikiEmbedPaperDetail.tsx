import {
  ArrowUpRight,
  Bookmark,
  Copy,
  Download,
  FileText,
  Languages,
  Quote,
} from "lucide-react";

const ACTIONS = [
  { label: "查看 PDF", icon: FileText },
  { label: "OA 原文", icon: Download },
  { label: "原始链接", icon: ArrowUpRight },
  { label: "引用", icon: Quote },
  { label: "收藏", icon: Bookmark },
  { label: "AI 翻译", icon: Languages },
] as const;

/**
 * 论文详情页 · 纯样式 fixture。
 * 对齐 product-mock PaperHeader + PaperMetadataBlock + PaperActionRow + PaperAbstract。
 */
export function WikiEmbedPaperDetail() {
  return (
    <article
      className="w-[min(100%,48rem)] overflow-hidden rounded-16 border border-border bg-surface-card p-6"
      aria-hidden
      data-wiki-fixture="paper-detail"
    >
      <header className="space-y-4">
        <p className="text-12 font-medium text-faint">
          Nature Machine Intelligence · Computer Science · 2024
        </p>
        <h2 className="font-display text-28 font-medium leading-display-tight text-foreground">
          Foundation Models for Scientific Discovery: Methods, Evidence and Open
          Questions
        </h2>
        <div className="space-y-1">
          <p className="text-14 leading-paragraph text-subtle">
            Lin Chen, Maya Gupta, Daniel Park, Sofia Rossi
          </p>
          <p className="text-12 text-muted-foreground">
            Institute for AI Research · University of Cambridge
          </p>
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-12">
        <dt className="font-medium text-faint">DOI</dt>
        <dd className="flex min-w-0 items-center gap-2 font-mono text-foreground">
          <span className="truncate">10.1038/s42256-024-00872-7</span>
          <Copy className="size-3 shrink-0 text-faint" />
        </dd>

        <dt className="font-medium text-faint">发表</dt>
        <dd className="tabular-nums text-foreground">2024-05-16</dd>

        <dt className="font-medium text-faint">计数</dt>
        <dd className="flex flex-wrap gap-4 text-foreground">
          <span>
            被引用 <strong className="font-medium tabular-nums">286</strong> 次
          </span>
          <span>
            参考文献 <strong className="font-medium tabular-nums">74</strong> 条
          </span>
        </dd>

        <dt className="font-medium text-faint">开放</dt>
        <dd className="flex items-center gap-2">
          <span className="rounded-4 bg-brand-green-soft px-2 py-1 font-medium text-brand-green">
            OA
          </span>
          <span className="text-subtle">免费全文 PDF</span>
        </dd>

        <dt className="font-medium text-faint">学科</dt>
        <dd className="flex flex-wrap gap-2">
          {[
            "Artificial Intelligence",
            "Scientific Discovery",
            "Machine Learning",
          ].map((field) => (
            <span
              key={field}
              className="rounded-4 border border-border bg-surface-1 px-2 py-1 text-subtle"
            >
              {field}
            </span>
          ))}
        </dd>
      </dl>

      <div
        className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-6"
        data-wiki-spot="论文动作"
      >
        {ACTIONS.map(({ label, icon: Icon }, index) => (
          <span key={label} className="inline-flex items-center gap-3 text-12">
            {index > 0 ? <span className="text-border-strong">·</span> : null}
            <span className="inline-flex items-center gap-2 font-medium text-foreground">
              <Icon className="size-3" strokeWidth={2} />
              {label}
            </span>
          </span>
        ))}
      </div>

      <section className="mt-6 space-y-3">
        <h3 className="font-display text-18 italic text-muted-foreground">
          Abstract
        </h3>
        <p className="line-clamp-4 text-14 leading-paragraph text-subtle">
          Foundation models are becoming a general interface for scientific
          work. This review compares retrieval, evaluation and human oversight
          practices, and separates demonstrated capabilities from claims that
          still require independent verification.
        </p>
        <p className="text-12 italic text-faint">
          Keywords — foundation models, retrieval, scientific evidence
        </p>
      </section>
    </article>
  );
}
