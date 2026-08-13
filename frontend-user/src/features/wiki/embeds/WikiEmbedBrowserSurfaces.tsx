import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Copy,
  FileText,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UserRound,
  X,
} from "lucide-react";

const SUGGESTED_PAPERS = [
  ["Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", "G"],
  ["A Survey on Retrieval-Augmented Text Generation", "D"],
] as const;

/** SearchAutocomplete 聚焦且联想已展开时的真实纵向分组。 */
export function WikiEmbedSearchSuggestionsDropdown() {
  return (
    <div
      className="w-[40rem] max-w-full"
      aria-hidden
      data-wiki-fixture="search-suggestions-dropdown"
    >
      <div className="flex h-12 items-center gap-3 rounded-t-4 border border-b-0 border-brand-red bg-background pl-4 pr-2">
        <span className="min-w-0 flex-1 truncate text-12 text-foreground">
          retrieval augmented generation
        </span>
        <span className="inline-flex size-7 items-center justify-center rounded-4 text-faint">
          <X className="size-3.5" strokeWidth={2.5} />
        </span>
        <span className="inline-flex size-9 items-center justify-center rounded-4 bg-brand-red text-on-brand">
          <Search className="size-4" strokeWidth={2.5} />
        </span>
      </div>

      <div className="overflow-hidden rounded-b-4 border border-t-0 border-border-strong bg-background shadow-overlay">
        <section className="py-2">
          <div className="px-4 py-2 text-12 font-medium text-faint">论文</div>
          {SUGGESTED_PAPERS.map(([title, source]) => (
            <div
              key={title}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
            >
              <Search className="size-3.5 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-14 text-subtle">
                <span className="font-medium text-foreground">Retrieval</span>
                {title.slice("Retrieval".length)}
              </span>
              <SourceLetter>{source}</SourceLetter>
            </div>
          ))}
        </section>

        <div className="h-px bg-border-hairline" />
        <section className="py-2">
          <div className="px-4 py-2 text-12 font-medium text-faint">学者</div>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <UserRound className="size-3.5 shrink-0 text-faint" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-14 text-foreground">
                <span className="font-medium">Patrick Lewis</span>
              </p>
              <p className="mt-1 truncate text-12 text-faint">
                Meta AI · 42 篇 · h-index 31
              </p>
            </div>
            <SourceLetter>G</SourceLetter>
          </div>
        </section>

        <div className="h-px bg-border-hairline" />
        <section className="bg-journal-soft py-2">
          <div className="px-4 py-2 text-12 font-medium text-brand-red">
            期刊推荐
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="inline-flex h-14 w-11 shrink-0 items-center justify-center rounded-4 border border-foreground/15 bg-brand-red font-display text-14 font-medium text-on-brand">
              AI
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-14 font-medium text-foreground">
                  Artificial Intelligence
                </span>
                <span className="rounded-pill bg-danger-soft px-2 py-1 text-12 font-medium text-brand-red">
                  期刊
                </span>
              </div>
              <p className="truncate text-12 text-subtle">
                ISSN 0004-3702 · 3 个来源 · 18,642 篇收录
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-faint" />
          </div>
        </section>
      </div>
    </div>
  );
}

function SourceLetter({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-4 border border-border bg-surface-1 text-12 font-medium text-subtle">
      {children}
    </span>
  );
}

const BROWSER_TABS = [
  ["paper", "RAG for Knowledge-Intensive NLP"],
  ["journal", "Nature Machine Intelligence"],
  ["author", "Patrick Lewis"],
] as const;

/** BrowserTabsBar 与右端“+”锚定的 QuickOpenPaperDialog。 */
export function WikiEmbedBrowserTabsQuickOpen() {
  return (
    <div
      className="relative w-[min(100%,52rem)] pb-[21rem]"
      aria-hidden
      data-wiki-fixture="browser-tabs-quick-open"
    >
      <div className="flex h-tab items-center gap-3 border-b border-border-hairline bg-background px-4">
        <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-4 px-2 text-12 text-subtle">
          <ArrowLeft className="size-3" /> 返回
        </span>
        <span className="h-4 w-px bg-border" />
        <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {BROWSER_TABS.map(([kind, label], index) => (
            <div
              key={label}
              className={
                index === 0
                  ? "inline-flex max-w-56 shrink-0 items-center gap-2 rounded-pill bg-surface-2 py-2 pl-3 pr-2 text-12 text-foreground"
                  : "inline-flex max-w-56 shrink-0 items-center gap-2 rounded-pill py-2 pl-3 pr-2 text-12 text-subtle"
              }
            >
              {kind === "paper" ? (
                <FileText className="size-3 shrink-0 text-foreground" />
              ) : kind === "journal" ? (
                <BookOpen className="size-3 shrink-0 text-brand-amber" />
              ) : (
                <UserRound className="size-3 shrink-0 text-brand-green" />
              )}
              <span className="truncate">{label}</span>
              <span className="inline-flex size-4 items-center justify-center rounded-4 text-faint">
                <X className="size-3" strokeWidth={2.5} />
              </span>
            </div>
          ))}
        </div>
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-4 text-subtle">
          <Plus className="size-3.5" strokeWidth={2.25} />
        </span>
      </div>

      <section className="absolute right-0 top-12 flex max-h-[20rem] w-[min(100%,32.5rem)] flex-col overflow-hidden rounded-8 border border-border bg-background shadow-overlay">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border-hairline px-3">
          <Search className="size-3.5 shrink-0 text-subtle" />
          <span className="min-w-0 flex-1 text-12 font-medium text-foreground">
            foundation model evaluation
          </span>
          <X className="size-3 text-faint" />
        </header>
        <ul className="min-h-0 flex-1 overflow-hidden">
          {[
            [
              "Holistic Evaluation of Language Models",
              "Liang et al.",
              "2023",
              "2,940",
            ],
            ["Beyond the Imitation Game", "Srivastava et al.", "2022", "1,872"],
            ["Judging LLM-as-a-Judge", "Zheng et al.", "2024", "824"],
          ].map(([title, authors, year, cites], index) => (
            <li
              key={title}
              className={
                index === 0
                  ? "flex items-center gap-2.5 bg-surface-1 px-3 py-2"
                  : "flex items-center gap-2.5 px-3 py-2"
              }
            >
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-4 border border-border bg-background">
                <FileText className="size-3.5 text-subtle" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-12 font-medium text-foreground">
                  {title}
                </p>
                <p className="mt-1 flex items-center gap-2 truncate text-12 text-subtle">
                  <SourceLetter>{index === 1 ? "D" : "G"}</SourceLetter>
                  <span className="truncate">{authors}</span>
                  <span>· {year}</span>
                  <span>· {cites} 引用</span>
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-faint" />
            </li>
          ))}
        </ul>
        <footer className="flex h-9 shrink-0 items-center justify-end border-t border-border-hairline bg-surface-1 px-3 text-12 text-subtle">
          点击任一行打开详情
        </footer>
      </section>
    </div>
  );
}

/** PaperReferences 与 PaperFooter 在论文详情正文中的原始上下顺序。 */
export function WikiEmbedPaperReferencesCitation() {
  return (
    <div
      className="w-[min(100%,48rem)] bg-background px-4 py-4"
      aria-hidden
      data-wiki-fixture="paper-references-citation"
    >
      <section className="space-y-4">
        <div className="space-y-2">
          <p className="text-12 font-medium uppercase text-faint">REFERENCES</p>
          <h2 className="font-display text-24 font-medium text-foreground">
            参考文献
            <span className="ml-2 font-sans text-12 font-normal text-faint">
              · 共 38 篇
            </span>
          </h2>
        </div>
        <div className="h-px bg-border" />
        <ol className="space-y-4">
          {[
            "Karpukhin, V. et al. (2020). Dense Passage Retrieval for Open-Domain Question Answering. EMNLP.",
            "Izacard, G. & Grave, E. (2021). Leveraging Passage Retrieval with Generative Models. EACL.",
            "Guu, K. et al. (2020). REALM: Retrieval-Augmented Language Model Pre-Training. ICML.",
          ].map((citation, index) => (
            <li
              key={citation}
              className="flex gap-4 text-12 leading-paragraph text-subtle"
            >
              <span className="w-8 shrink-0 font-medium tabular-nums text-faint">
                [{index + 1}]
              </span>
              <span className="min-w-0 flex-1">{citation}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-12 font-medium uppercase text-faint">
              HOW TO CITE
            </p>
            <h2 className="font-display text-20 font-medium text-foreground">
              引用本文
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {["GB/T 7714", "BibTeX", "APA", "MLA", "Chicago"].map(
              (format, index) => (
                <span
                  key={format}
                  className={
                    index === 1
                      ? "inline-flex h-7 items-center rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark"
                      : "inline-flex h-7 items-center rounded-8 px-3 text-12 font-medium text-subtle"
                  }
                >
                  {format}
                </span>
              ),
            )}
          </div>
        </div>
        <div className="relative min-w-0">
          <pre className="w-full overflow-x-auto whitespace-pre rounded-4 border border-border bg-surface-1 px-4 py-4 font-mono text-12 leading-code text-subtle">
            {`@inproceedings{lewis2020retrieval,
  title={Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks},
  year={2020}
}`}
          </pre>
          <span className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-4 border border-border bg-background px-2.5 text-12 font-medium text-subtle">
            <Copy className="size-3" strokeWidth={2.5} /> 复制
          </span>
        </div>
        <p className="text-12 text-faint">
          单击切换格式 · 双击格式名设为默认 · 引用生成器（支持 DOI / 手动录入）
        </p>
      </section>
    </div>
  );
}

const COLLABORATORS = [
  ["Marta Kwiatkowska", "University of Oxford", "合作 18 次", "M"],
  ["Percy Liang", "Stanford University", "合作 12 次", "P"],
  ["Yejin Choi", "University of Washington", "合作 9 次", "Y"],
  ["Diyi Yang", "Stanford University", "合作 7 次", "D"],
] as const;

/** AuthorDetailPane 的双列关系与全宽年度柱状图。 */
export function WikiEmbedAuthorCollaborationTrends() {
  const bars = [4, 6, 5, 9, 12, 10, 16, 13, 18, 15];
  return (
    <div
      className="w-[min(100%,64rem)] space-y-6"
      aria-hidden
      data-wiki-fixture="author-collaboration-trends"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_23.75rem]">
        <section className="space-y-4">
          <div className="flex items-end gap-2.5">
            <h2 className="font-display text-20 font-medium leading-display text-foreground">
              代表论文
            </h2>
            <span className="pb-1 text-12 text-faint">按被引排序</span>
          </div>
          <div className="overflow-hidden rounded-8 border border-border bg-background">
            {[
              [
                "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
                "4,281 次引用",
              ],
              [
                "Dense Passage Retrieval for Open-Domain Question Answering",
                "3,948 次引用",
              ],
              [
                "Pre-trained Language Models for Interactive Decision-Making",
                "1,726 次引用",
              ],
            ].map(([title, meta], index) => (
              <div
                key={title}
                className={
                  index < 2
                    ? "flex items-center gap-3 border-b border-border-hairline px-4 py-4"
                    : "flex items-center gap-3 px-4 py-4"
                }
              >
                <FileText className="size-4 shrink-0 text-faint" />
                <p className="min-w-0 flex-1 truncate text-12 font-medium text-foreground">
                  {title}
                </p>
                <span className="shrink-0 text-12 text-faint">{meta}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end gap-2.5">
            <h2 className="font-display text-20 font-medium leading-display text-foreground">
              合作学者
            </h2>
            <span className="pb-1 text-12 text-faint">Top 4</span>
          </div>
          <div className="overflow-hidden rounded-8 border border-border bg-background">
            {COLLABORATORS.map(([name, affiliation, count, initial], index) => (
              <div
                key={name}
                className={
                  index < COLLABORATORS.length - 1
                    ? "flex items-center gap-3 border-b border-border-hairline px-4 py-4"
                    : "flex items-center gap-3 px-4 py-4"
                }
              >
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-green text-12 font-medium text-on-brand">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-12 font-medium text-foreground">
                    {name}
                  </p>
                  <p className="truncate text-12 text-faint">{affiliation}</p>
                </div>
                <span className="shrink-0 text-12 tabular-nums text-faint">
                  {count}
                </span>
                <ArrowUpRight className="size-3.5 shrink-0 text-faint" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="space-y-4 rounded-8 border border-border bg-background p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-2.5">
            <h2 className="font-display text-20 font-medium leading-display text-foreground">
              年度发表趋势
            </h2>
            <span className="pb-1 text-12 text-faint">近 10 年</span>
          </div>
          <div className="flex items-center gap-3 text-12 text-faint">
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-4 bg-foreground" /> 年发表量
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-4 bg-brand-amber" /> 峰值
            </span>
          </div>
        </div>
        <div className="flex h-48 items-end gap-4">
          {bars.map((value, index) => (
            <div
              key={2016 + index}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
            >
              <span className="text-12 font-medium tabular-nums text-subtle">
                {value}
              </span>
              <span
                className={
                  value === 18
                    ? "w-full rounded-t-8 bg-brand-amber"
                    : "w-full rounded-t-8 bg-foreground"
                }
                style={{ height: `${Math.max((value / 18) * 100, 2)}%` }}
              />
              <span className="text-12 tabular-nums text-faint">
                {2016 + index}
              </span>
            </div>
          ))}
        </div>
        <p className="text-12 text-subtle">
          近 5 年平均 <span className="font-medium text-foreground">14.4</span>{" "}
          篇/年，峰值出现在{" "}
          <span className="font-medium text-brand-amber">2024</span>（18 篇）
        </p>
      </section>
    </div>
  );
}

const DIMENSIONS = [
  ["研究问题", "抽取论文解决的核心研究问题与目标", true, "system"],
  ["研究方法", "归纳数据、模型、实验与评估方法", true, "system"],
  ["主要结论", "概括作者报告的关键发现", true, "system"],
  ["局限性", "识别作者明示或证据支持的限制", false, "custom"],
] as const;

/** DimensionSettingsDialog 的默认列表态。 */
export function WikiEmbedMatrixDimensionSettings() {
  return (
    <div
      className="flex w-[min(100%,26.25rem)] flex-col overflow-hidden rounded-8 border border-border bg-background shadow-overlay"
      aria-hidden
      data-wiki-fixture="matrix-dimension-settings"
    >
      <header className="flex h-13 shrink-0 items-center border-b border-border-hairline px-4.5">
        <h3 className="text-14 font-medium text-foreground">维度设置</h3>
        <X className="ml-auto size-4 text-faint" />
      </header>
      <div className="flex h-8.5 shrink-0 items-center border-b border-border-hairline bg-surface-1 px-4.5 text-12 text-faint">
        共 4 个维度 · 3 个可见
      </div>
      <div>
        {DIMENSIONS.map(([name, description, visible, kind]) => (
          <div
            key={name}
            className={
              visible
                ? "flex h-14 items-center gap-2 border-b border-border-hairline bg-background px-2"
                : "flex h-14 items-center gap-2 border-b border-border-hairline bg-surface-1 px-2"
            }
          >
            <GripVertical className="size-3.5 shrink-0 text-faint" />
            <span
              className={
                visible
                  ? "inline-flex h-5 w-9 shrink-0 items-center rounded-pill border-2 border-transparent bg-brand-green"
                  : "inline-flex h-5 w-9 shrink-0 items-center rounded-pill border-2 border-transparent bg-surface-2"
              }
            >
              <span
                className={
                  visible
                    ? "block size-4 translate-x-4 rounded-pill bg-surface-card shadow-raised"
                    : "block size-4 translate-x-0 rounded-pill bg-surface-card shadow-raised"
                }
              />
            </span>
            <div className="min-w-0 flex-1 pl-1">
              <p
                className={
                  visible
                    ? "truncate text-12 font-medium text-foreground"
                    : "truncate text-12 font-medium text-faint"
                }
              >
                {name}
              </p>
              <p className="mt-px truncate text-12 text-faint">
                {visible ? description : "已隐藏 · 打开右侧开关恢复显示"}
              </p>
            </div>
            <span className="inline-flex size-7 items-center justify-center rounded-4 bg-surface-2 text-subtle">
              <Pencil className="size-3" />
            </span>
            <span
              className={
                kind === "custom"
                  ? "inline-flex size-7 items-center justify-center rounded-4 bg-danger-soft text-brand-red"
                  : "inline-flex size-7 items-center justify-center rounded-4 bg-surface-2 text-subtle"
              }
            >
              {kind === "custom" ? (
                <X className="size-3" />
              ) : (
                <RotateCcw className="size-3" />
              )}
            </span>
          </div>
        ))}
        <div className="flex h-13 items-center gap-2 bg-surface-1 px-4.5 text-12 font-medium text-brand-red">
          <span className="inline-flex size-6 items-center justify-center rounded-pill bg-brand-red text-on-brand">
            <Plus className="size-3.5" strokeWidth={3} />
          </span>
          添加新维度
        </div>
      </div>
    </div>
  );
}
