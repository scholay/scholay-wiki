import {
  ArrowUpRight,
  Bookmark,
  Copy,
  Download,
  FileText,
  Languages,
  Quote,
} from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const ACTIONS = [
  { label: "查看 PDF", icon: FileText, primary: true },
  { label: "OA 原文", icon: Download, primary: false },
  { label: "原始链接", icon: ArrowUpRight, primary: false },
  { label: "引用", icon: Quote, primary: false },
  { label: "收藏", icon: Bookmark, primary: false },
  { label: "AI 翻译", icon: Languages, primary: false },
] as const;

/** 论文详情正文的资料完整态，对齐编辑器式 880px 版心与真实段落顺序。 */
export function WikiEmbedPaperDetail() {
  return (
    <article
      className="w-full max-w-4xl overflow-hidden rounded-8 border border-border bg-background"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="paper-detail"
    >
      <div className="px-4 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-12">
        <header className="space-y-6 sm:space-y-8">
          <p className="text-12 font-medium uppercase text-faint">
            Nature Machine Intelligence · Computer Science · 2024
          </p>

          <h2 className="font-display text-32 font-medium leading-display-tight text-foreground">
            Foundation Models for Scientific Discovery: Methods, Evidence and
            Open Questions
          </h2>

          <div className="space-y-1">
            <p className="text-18 leading-paragraph text-subtle">
              <span className="underline decoration-dotted underline-offset-2">
                Lin Chen
              </span>
              <span className="text-faint">, </span>
              <span className="underline decoration-dotted underline-offset-2">
                Maya Gupta
              </span>
              <span className="text-faint">, </span>
              Daniel Park<span className="text-faint">, </span>Sofia Rossi
            </p>
            <p className="text-20 leading-paragraph text-muted-foreground">
              Institute for AI Research · University of Cambridge
            </p>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-20 text-subtle">
            <MetadataLabel>DOI</MetadataLabel>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-foreground">
                10.1038/s42256-024-00872-7
              </span>
              <Copy className="size-3 shrink-0 text-faint" />
            </dd>

            <MetadataLabel>发表</MetadataLabel>
            <dd className="tabular-nums text-foreground">2024-05-16</dd>

            <MetadataLabel>计数</MetadataLabel>
            <dd className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground">
              <span>
                被引用 <strong className="font-medium tabular-nums">286</strong>{" "}
                次
              </span>
              <span>
                参考文献{" "}
                <strong className="font-medium tabular-nums">74</strong> 条
              </span>
            </dd>

            <MetadataLabel>开放</MetadataLabel>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-5 items-center rounded-4 bg-brand-green-soft px-2 text-12 font-medium text-brand-green">
                OA
              </span>
              <span className="inline-flex items-center gap-1 text-16 text-brand-green">
                免费全文 PDF <ArrowUpRight className="size-3" />
              </span>
            </dd>

            <MetadataLabel>学科</MetadataLabel>
            <dd className="flex flex-wrap items-center gap-2">
              {[
                "Artificial Intelligence",
                "Scientific Discovery",
                "Machine Learning",
              ].map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center rounded-4 border border-border-hairline bg-surface-1 px-2 py-1 text-12 text-subtle"
                >
                  {field}
                </span>
              ))}
            </dd>
          </dl>

          <div className="space-y-4" data-wiki-spot="论文动作">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-20">
              {ACTIONS.map(({ label, icon: Icon, primary }, index) => (
                <span key={label} className="inline-flex items-center gap-3">
                  {index > 0 ? (
                    <span className="text-border-strong">·</span>
                  ) : null}
                  <span
                    className={
                      primary
                        ? "inline-flex items-center gap-2 font-medium text-foreground"
                        : "inline-flex items-center gap-2 text-foreground"
                    }
                  >
                    <Icon className="size-4" /> {label}
                  </span>
                </span>
              ))}
            </div>
            <div className="h-px bg-border" />
          </div>
        </header>

        <section className="mt-12 space-y-4">
          <h3 className="font-display text-28 italic text-muted-foreground">
            Abstract
          </h3>
          <p className="text-18 leading-paragraph text-subtle">
            Foundation models are becoming a general interface for scientific
            work. This review compares retrieval, evaluation and human oversight
            practices across research workflows, and separates demonstrated
            capabilities from claims that still require independent
            verification. We outline how evidence provenance, reproducible
            evaluation and domain expertise shape reliable scientific use.
          </p>
          <p className="text-20 italic text-faint">
            Keywords — foundation models, retrieval, scientific evidence,
            evaluation
          </p>
        </section>
      </div>
    </article>
  );
}

function MetadataLabel({ children }: { children: string }) {
  return (
    <dt className="pt-1 text-12 font-medium uppercase text-faint">
      {children}
    </dt>
  );
}
