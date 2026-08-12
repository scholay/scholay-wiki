import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  Copy,
  ExternalLink,
  FileText,
  GripVertical,
  Link2,
  MoreHorizontal,
  Plus,
  Quote,
  Search,
  Settings2,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

const SUGGESTED_PAPERS = [
  {
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    meta: "Patrick Lewis 等 · NeurIPS · 2020",
  },
  {
    title: "A Survey on Retrieval-Augmented Text Generation",
    meta: "Yunfan Gao 等 · 2024 · 1,286 次引用",
  },
] as const;

/** 搜索输入后的论文、作者与期刊建议面板。 */
export function WikiEmbedSearchSuggestionsDropdown() {
  return (
    <div
      className="w-[min(100%,42rem)]"
      aria-hidden
      data-wiki-fixture="search-suggestions-dropdown"
    >
      <div className="flex h-12 items-center gap-3 rounded-t-8 border border-foreground bg-surface-card px-4">
        <Search className="size-4 text-faint" />
        <span className="min-w-0 flex-1 truncate text-14 text-foreground">
          retrieval augmented generation
        </span>
        <span className="text-12 text-faint">Esc</span>
      </div>

      <div className="overflow-hidden rounded-b-12 border-x border-b border-border-strong bg-surface-card shadow-raised">
        <section className="border-b border-border p-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-12 font-medium text-foreground">论文</p>
            <span className="text-12 text-faint">查看全部结果</span>
          </div>
          {SUGGESTED_PAPERS.map((paper, index) => (
            <div
              key={paper.title}
              className={
                index === 0
                  ? "flex gap-3 rounded-8 bg-surface-1 px-3 py-2"
                  : "flex gap-3 rounded-8 px-3 py-2"
              }
            >
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-8 bg-brand-green-soft text-brand-green">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="line-clamp-1 text-13 font-medium text-foreground">
                  {paper.title}
                </p>
                <p className="mt-1 truncate text-12 text-faint">{paper.meta}</p>
              </div>
            </div>
          ))}
        </section>

        <div className="grid md:grid-cols-2">
          <section className="border-b border-border p-3 md:border-b-0 md:border-r">
            <p className="mb-2 px-2 text-12 font-medium text-foreground">
              作者
            </p>
            <div className="flex items-center gap-3 rounded-8 px-2 py-2">
              <span className="inline-flex size-8 items-center justify-center rounded-pill bg-brand-amber-soft text-brand-amber">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-13 font-medium text-foreground">
                  Patrick Lewis
                </p>
                <p className="truncate text-12 text-faint">
                  Meta AI · 42 篇论文
                </p>
              </div>
            </div>
          </section>
          <section className="p-3">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-12 font-medium text-brand-red">期刊推荐</p>
              <span className="inline-flex items-center gap-1 text-12 text-subtle">
                期刊搜索 <ExternalLink className="size-3" />
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-8 px-2 py-2">
              <span className="inline-flex size-8 items-center justify-center rounded-4 bg-danger-soft font-serif text-12 text-brand-red">
                AI
              </span>
              <div className="min-w-0">
                <p className="truncate text-13 font-medium text-foreground">
                  Artificial Intelligence
                </p>
                <p className="text-12 text-faint">SCI · JCR Q1 · IF 14.4</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const BROWSER_TABS = [
  ["paper", "RAG for Knowledge-Intensive NLP"],
  ["journal", "Nature Machine Intelligence"],
  ["author", "Patrick Lewis"],
] as const;

/** 详情浏览标签条及其“快速打开论文”锚定面板。 */
export function WikiEmbedBrowserTabsQuickOpen() {
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="browser-tabs-quick-open"
    >
      <div className="flex h-11 items-center border-b border-border bg-surface-1 px-2">
        <span className="inline-flex h-8 items-center gap-1 border-r border-border px-3 text-12 text-subtle">
          <ChevronLeft className="size-4" /> 返回
        </span>
        <div className="flex min-w-0 flex-1 items-end overflow-hidden self-stretch">
          {BROWSER_TABS.map(([kind, label], index) => (
            <div
              key={label}
              className={
                index === 0
                  ? "flex h-full min-w-0 max-w-48 items-center gap-2 border-b-2 border-brand-red bg-surface-card px-3 text-12 font-medium text-foreground"
                  : "flex h-full min-w-0 max-w-44 items-center gap-2 border-r border-border px-3 text-12 text-subtle"
              }
            >
              {kind === "paper" ? (
                <FileText className="size-4 shrink-0" />
              ) : kind === "journal" ? (
                <BookOpen className="size-4 shrink-0" />
              ) : (
                <UserRound className="size-4 shrink-0" />
              )}
              <span className="truncate">{label}</span>
              <X className="size-3 shrink-0 text-faint" />
            </div>
          ))}
        </div>
        <span className="inline-flex size-8 items-center justify-center rounded-8 text-subtle">
          <Search className="size-4" />
        </span>
      </div>

      <div className="flex justify-end bg-surface-card p-4">
        <section className="w-full max-w-sm overflow-hidden rounded-12 border border-border bg-surface-card shadow-raised">
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-4 text-faint" />
            <span className="flex-1 text-13 text-foreground">
              foundation model evaluation
            </span>
            <X className="size-4 text-faint" />
          </header>
          <div className="p-2">
            {[
              [
                "Holistic Evaluation of Language Models",
                "Liang et al. · 2023",
                "2,940",
              ],
              [
                "Beyond the Imitation Game",
                "Srivastava et al. · 2022",
                "1,886",
              ],
              ["Judging LLM-as-a-Judge", "Zheng et al. · 2023", "1,214"],
            ].map(([title, meta, cites], index) => (
              <div
                key={title}
                className={
                  index === 0
                    ? "flex gap-3 rounded-8 bg-surface-1 p-2"
                    : "flex gap-3 rounded-8 p-2"
                }
              >
                <FileText className="size-4 shrink-0 text-brand-green" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-13 font-medium text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-12 text-faint">
                    {meta} · {cites} 引用
                  </p>
                </div>
              </div>
            ))}
          </div>
          <footer className="border-t border-border px-3 py-2 text-center text-12 text-faint">
            选择后在新的浏览标签中打开
          </footer>
        </section>
      </div>
    </div>
  );
}

/** 论文详情底部的参考文献与内联引用区。 */
export function WikiEmbedPaperReferencesCitation() {
  return (
    <div
      className="w-[min(100%,48rem)] space-y-4 rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="paper-references-citation"
    >
      <section>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Quote className="size-4 text-brand-green" />
            <h3 className="font-serif text-16 font-medium text-foreground">
              参考文献
            </h3>
          </div>
          <span className="text-12 text-faint">已加载 126 篇</span>
        </div>
        <ol className="divide-y divide-border-hairline">
          {[
            [
              "01",
              "Dense Passage Retrieval for Open-Domain Question Answering",
              "Karpukhin 等 · EMNLP · 2020",
            ],
            [
              "02",
              "REALM: Retrieval-Augmented Language Model Pre-Training",
              "Guu 等 · ICML · 2020",
            ],
            [
              "03",
              "FiD: Leveraging Passage Retrieval with Generative Models",
              "Izacard 等 · EACL · 2021",
            ],
          ].map(([n, title, meta]) => (
            <li key={title} className="flex gap-3 py-3">
              <span className="w-6 shrink-0 text-12 tabular-nums text-faint">
                {n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-13 font-medium text-foreground">
                  {title}
                </p>
                <p className="mt-1 text-12 text-faint">{meta}</p>
              </div>
              <ExternalLink className="size-4 shrink-0 text-faint" />
            </li>
          ))}
        </ol>
        <div className="mt-2 rounded-8 bg-surface-1 py-2 text-center text-12 text-subtle">
          显示更多（123 篇）
        </div>
      </section>

      <section className="rounded-12 border border-brand-amber/30 bg-brand-amber-soft p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-13 font-medium text-foreground">引用本文</p>
            <p className="mt-1 text-12 text-faint">双击格式可设为个人默认</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {["GB/T 7714", "BibTeX", "APA", "MLA", "Chicago"].map(
              (format, index) => (
                <span
                  key={format}
                  className={
                    index === 1
                      ? "rounded-4 bg-foreground px-2 py-1 text-11 font-medium text-on-dark"
                      : "rounded-4 px-2 py-1 text-11 text-subtle"
                  }
                >
                  {format}
                </span>
              ),
            )}
          </div>
        </div>
        <div className="mt-3 flex items-start gap-3 rounded-8 border border-border bg-surface-card p-3">
          <code className="min-w-0 flex-1 whitespace-normal text-11 leading-paragraph text-subtle">
            @inproceedings (lewis2020retrieval), title: Retrieval-Augmented
            Generation..., year: 2020
          </code>
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-4 border border-border px-2 text-11 text-subtle">
            <Copy className="size-3" /> 复制
          </span>
        </div>
        <p className="mt-3 inline-flex items-center gap-1 text-12 text-brand-red">
          <ExternalLink className="size-3" /> 引用生成器（支持 DOI / 手动录入）
        </p>
      </section>
    </div>
  );
}

/** 作者详情中的合作网络摘要和年度发表趋势。 */
export function WikiEmbedAuthorCollaborationTrends() {
  const bars = [28, 42, 36, 58, 72, 64, 88, 76];
  return (
    <div
      className="grid w-[min(100%,48rem)] gap-4 md:grid-cols-[16rem_1fr]"
      aria-hidden
      data-wiki-fixture="author-collaboration-trends"
    >
      <section className="rounded-12 border border-border bg-surface-card p-4">
        <div className="flex items-center gap-2">
          <UsersRound className="size-4 text-brand-green" />
          <h3 className="text-14 font-medium text-foreground">常见合作作者</h3>
        </div>
        <div className="mt-3 space-y-1">
          {[
            ["Marta Kwiatkowska", "共同发表 18 篇", "MK"],
            ["Percy Liang", "共同发表 12 篇", "PL"],
            ["Yejin Choi", "共同发表 9 篇", "YC"],
            ["Diyi Yang", "共同发表 7 篇", "DY"],
          ].map(([name, meta, initials], index) => (
            <div
              key={name}
              className="flex items-center gap-3 rounded-8 px-1 py-2"
            >
              <span
                className={
                  index % 2 === 0
                    ? "inline-flex size-8 items-center justify-center rounded-pill bg-brand-green-soft text-11 font-medium text-brand-green"
                    : "inline-flex size-8 items-center justify-center rounded-pill bg-brand-amber-soft text-11 font-medium text-brand-amber"
                }
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-12 font-medium text-foreground">
                  {name}
                </p>
                <p className="text-11 text-faint">{meta}</p>
              </div>
              <ExternalLink className="size-3 text-faint" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-12 border border-border bg-surface-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-14 font-medium text-foreground">
              年度发表趋势
            </h3>
            <p className="mt-1 text-12 text-faint">基于当前返回的 50 篇论文</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-pill bg-brand-amber-soft px-2 py-1 text-11 text-brand-amber">
            <BarChart3 className="size-3" /> 峰值 2024
          </span>
        </div>
        <div className="mt-6 flex h-36 items-end gap-2 border-b border-l border-border px-3">
          {bars.map((height, index) => (
            <div
              key={height + index}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
            >
              <span className="text-10 tabular-nums text-faint">
                {Math.round(height / 6)}
              </span>
              <span
                className={
                  index === 6
                    ? "w-full max-w-7 rounded-t-4 bg-brand-amber"
                    : "w-full max-w-7 rounded-t-4 bg-brand-green/60"
                }
                style={{ height: `${height}%` }}
              />
              <span className="text-10 text-faint">{2018 + index}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-12 leading-paragraph text-subtle">
          合作关系与趋势都由本次作者论文样本派生，不代表完整学术生涯。
        </p>
      </section>
    </div>
  );
}

const DIMENSIONS = [
  ["核心结论", "提取论文最重要的研究结论", true],
  ["研究方法", "概括实验、数据集与模型方法", true],
  ["样本规模", "记录样本量与数据来源", true],
  ["局限性", "识别作者明确陈述的限制", false],
] as const;

/** 矩阵分析的维度管理弹层。 */
export function WikiEmbedMatrixDimensionSettings() {
  return (
    <div
      className="w-[min(100%,28rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-raised"
      aria-hidden
      data-wiki-fixture="matrix-dimension-settings"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-brand-green" />
          <div>
            <h3 className="text-14 font-medium text-foreground">
              分析维度设置
            </h3>
            <p className="text-11 text-faint">
              拖动排序，关闭后不参与下一次生成
            </p>
          </div>
        </div>
        <X className="size-4 text-faint" />
      </header>

      <div className="space-y-2 p-3">
        {DIMENSIONS.map(([name, description, enabled], index) => (
          <div
            key={name}
            className="flex items-center gap-2 rounded-8 border border-border p-2"
          >
            <GripVertical className="size-4 shrink-0 text-faint" />
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-4 bg-surface-1 text-11 tabular-nums text-faint">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-12 font-medium text-foreground">{name}</p>
              <p className="truncate text-11 text-faint">{description}</p>
            </div>
            <span
              className={
                enabled
                  ? "inline-flex h-5 w-9 items-center rounded-pill bg-brand-green p-1"
                  : "inline-flex h-5 w-9 items-center rounded-pill bg-surface-3 p-1"
              }
            >
              <span
                className={
                  enabled
                    ? "ml-auto size-4 rounded-pill bg-surface-card"
                    : "size-4 rounded-pill bg-surface-card"
                }
              />
            </span>
            <MoreHorizontal className="size-4 text-faint" />
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-surface-1 p-3">
        <p className="text-11 font-medium text-foreground">新增自定义维度</p>
        <div className="mt-2 flex gap-2">
          <div className="min-w-0 flex-1 rounded-8 border border-border bg-surface-card px-3 py-2 text-12 text-faint">
            例如：数据集与代码开放性
          </div>
          <span className="inline-flex size-9 items-center justify-center rounded-8 bg-foreground text-on-dark">
            <Plus className="size-4" />
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between text-11">
          <span className="inline-flex items-center gap-1 text-faint">
            <Link2 className="size-3" /> 维度修改只影响后续生成
          </span>
          <span className="inline-flex items-center gap-1 text-brand-red">
            <Trash2 className="size-3" /> 删除需二次确认
          </span>
        </div>
      </div>
    </div>
  );
}
