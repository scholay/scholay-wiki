import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  FileText,
  Info,
  MoreHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

/** PDF 上传流程的 State 2：候选已返回，等待用户确认关联。 */
export function WikiEmbedPdfResolve() {
  return (
    <div
      className="w-full max-w-5xl space-y-4 rounded-8 border border-border bg-background p-4"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="pdf-resolve"
    >
      <header className="rounded-8 border border-border-hairline bg-surface-1 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-pill bg-brand-amber text-12 font-medium tabular-nums text-on-brand">
            3
          </span>
          <h2 className="text-20 font-medium text-foreground">确认匹配</h2>
          <span className="text-faint">·</span>
          <p className="min-w-0 truncate text-16 text-muted-foreground">
            从候选中选出这份 PDF 对应的论文；都不对的话，跳过直接保存也可以
          </p>
        </div>
      </header>

      <div className="grid items-start gap-4 md:grid-cols-[18rem_1fr]">
        <aside className="flex flex-col overflow-hidden rounded-8 border border-border bg-background">
          <div className="flex items-center justify-between gap-2 border-b border-border-hairline px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex items-center rounded-4 bg-brand-red-soft px-2 py-1 text-12 font-medium text-brand-red">
                PDF
              </span>
              <div className="min-w-0">
                <p className="truncate text-16 font-medium text-foreground">
                  attention-paper.pdf
                </p>
                <p className="text-12 tabular-nums text-faint">
                  2.4 MB · 15 页
                </p>
              </div>
            </div>
            <MoreHorizontal className="size-4 shrink-0 text-faint" />
          </div>

          <div className="flex items-center justify-center gap-3 border-b border-border-hairline bg-surface-1 px-3 py-1">
            <ChevronLeft className="size-4 text-faint opacity-40" />
            <span className="text-12 tabular-nums text-muted-foreground">
              1 / 15
            </span>
            <ChevronRight className="size-4 text-faint" />
          </div>

          <div className="flex min-h-80 items-start justify-center bg-surface-1/40 p-3">
            <div className="flex min-h-72 w-full flex-col bg-background px-6 py-6 shadow-raised">
              <p className="text-center text-12 font-medium uppercase text-faint">
                Advances in Neural Information Processing Systems
              </p>
              <h3 className="mt-4 text-center font-display text-18 font-medium leading-display text-foreground">
                Attention Is All You Need
              </h3>
              <p className="mt-2 text-center text-12 text-faint">
                Vaswani et al.
              </p>
              <div className="mt-6 space-y-2">
                <span className="block h-1 rounded-pill bg-border" />
                <span className="block h-1 w-11/12 rounded-pill bg-border" />
                <span className="block h-1 w-4/5 rounded-pill bg-border" />
                <span className="block h-1 w-full rounded-pill bg-border" />
                <span className="block h-1 w-3/4 rounded-pill bg-border" />
              </div>
            </div>
          </div>

          <div className="border-t border-border-hairline bg-background px-3 py-2">
            <p className="line-clamp-2 text-16 font-medium text-foreground">
              Attention Is All You Need
            </p>
            <p className="mt-1 truncate text-12 text-muted-foreground">
              Ashish Vaswani, Noam Shazeer, Niki Parmar et al.
            </p>
          </div>
        </aside>

        <main className="min-w-0 space-y-3">
          <div className="flex items-start gap-3 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-4 py-3">
            <Info className="mt-1 size-4 shrink-0 text-brand-amber" />
            <div className="min-w-0 flex-1">
              <p className="text-20 font-medium text-foreground">
                找到 4 条匹配结果，请确认
              </p>
              <p className="mt-1 text-16 text-muted-foreground">
                根据 PDF 内容在在线论文库中检索，已按相关度排序
              </p>
            </div>
          </div>

          <section
            className="overflow-hidden rounded-8 border border-border bg-background"
            data-wiki-spot="最佳匹配"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-hairline bg-surface-1 px-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="size-4 text-brand-amber" />
                <span className="text-16 font-medium text-foreground">
                  最佳建议
                </span>
                <span className="inline-flex items-center rounded-4 bg-surface-2 px-2 py-1 text-12 font-medium uppercase text-subtle">
                  Graph
                </span>
                <span className="inline-flex items-center rounded-4 bg-brand-green-soft px-2 py-1 text-12 font-medium text-brand-green">
                  标题精确匹配
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-16 text-brand-green">
                <ExternalLink className="size-3" /> 查看原文
              </span>
            </header>

            <div className="space-y-2 px-4 py-3">
              <h3 className="text-20 font-medium leading-paragraph text-foreground">
                Attention Is All You Need
              </h3>
              <p className="text-16 text-muted-foreground">
                Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit
              </p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-12 text-faint">
                <span className="font-mono">
                  <strong className="font-medium">DOI</strong>{" "}
                  10.48550/arXiv.1706.03762
                </span>
                <span>· NeurIPS</span>
                <span>· 2017</span>
                <span>· 128,416 引用</span>
              </p>
              <div className="flex items-center gap-2 pt-2">
                <span className="inline-flex h-8 items-center gap-2 rounded-4 bg-brand-green px-4 text-20 font-medium text-on-brand">
                  <Check className="size-4" /> 接受并加入
                </span>
                <span className="inline-flex h-8 items-center gap-1 rounded-4 px-3 text-20 font-medium text-subtle">
                  <X className="size-4" /> 拒绝
                </span>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-8 border border-border bg-background">
            <header className="flex items-center justify-between px-4 py-2">
              <span className="text-16 font-medium text-foreground">
                其他候选项 (3)
              </span>
              <ChevronUp className="size-4 text-faint" />
            </header>
            <ul className="border-t border-border-hairline">
              <Candidate
                title="Attention Is All You Need"
                meta="A. Vaswani et al. · NeurIPS · 2017"
                source="Discovery"
              />
              <Candidate
                title="Attention Is All You Need: A Survey of Transformer Models"
                meta="T. Lin et al. · ACM Computing Surveys · 2022"
                source="Graph"
                bordered
              />
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}

function Candidate({
  title,
  meta,
  source,
  bordered = false,
}: {
  title: string;
  meta: string;
  source: string;
  bordered?: boolean;
}) {
  return (
    <li
      className={`flex items-start gap-3 px-4 py-2 ${bordered ? "border-t border-border-hairline" : ""}`}
    >
      <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-4 border border-border bg-background">
        <FileText className="size-3 text-subtle" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-20 font-medium text-foreground">
          {title}
        </p>
        <p className="mt-1 text-12 text-muted-foreground">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-4 bg-surface-2 px-2 py-1 text-12 font-medium uppercase text-subtle">
          {source}
        </span>
        <span className="inline-flex h-7 items-center rounded-4 border border-brand-green px-3 text-16 font-medium text-brand-green">
          采用
        </span>
      </div>
    </li>
  );
}
