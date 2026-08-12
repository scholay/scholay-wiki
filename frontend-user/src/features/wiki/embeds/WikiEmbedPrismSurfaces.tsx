import {
  ArrowRight,
  Calculator,
  Check,
  ChevronRight,
  Clock3,
  FunctionSquare,
  History,
  Languages,
  MessageSquareText,
  PenLine,
  Plus,
  Quote,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

const TOOL_STATES = [
  {
    label: "写作画像",
    icon: UserRound,
    title: "医学影像 · 证据审慎型",
    detail: "结构先行 · 过去时写方法 · 引用靠近论断",
    tone: "green",
  },
  {
    label: "修改意见",
    icon: MessageSquareText,
    title: "4 条意见已解析",
    detail: "2 条待处理 · 1 条需作者补充 · 1 条已应用",
    tone: "amber",
  },
  {
    label: "整篇翻译",
    icon: Languages,
    title: "两遍纪律",
    detail: "先逐节直译并应用，再开新对话做单语润色",
    tone: "neutral",
  },
  {
    label: "数字校验",
    icon: Calculator,
    title: "发现 2 个无来源数字",
    detail: "73.4% 与 1,204 未在源数据中找到",
    tone: "red",
  },
] as const;

/** Prism 写作画像、意见回应、翻译、数字与质量检查的组合面。 */
export function WikiEmbedPrismWritingToolsDialogs() {
  return (
    <div
      className="w-[min(100%,52rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-raised"
      aria-hidden
      data-wiki-fixture="prism-writing-tools-dialogs"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-10 font-medium uppercase text-brand-red">
            Prism tools
          </p>
          <h3 className="mt-1 text-14 font-medium text-foreground">
            写作工具与确定性检查
          </h3>
        </div>
        <X className="size-4 text-faint" />
      </header>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {TOOL_STATES.map(({ label, icon: Icon, title, detail, tone }) => (
          <section key={label} className="rounded-12 border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-11 font-medium text-foreground">
                <Icon
                  className={
                    tone === "green"
                      ? "size-4 text-brand-green"
                      : tone === "amber"
                        ? "size-4 text-brand-amber"
                        : tone === "red"
                          ? "size-4 text-brand-red"
                          : "size-4 text-subtle"
                  }
                />
                {label}
              </span>
              <ChevronRight className="size-4 text-faint" />
            </div>
            <p className="mt-3 text-12 font-medium text-foreground">{title}</p>
            <p className="mt-1 text-10 leading-paragraph text-faint">
              {detail}
            </p>
            <div className="mt-3 flex justify-end">
              <span className="inline-flex h-7 items-center gap-1 rounded-4 border border-border px-2 text-10 text-subtle">
                {label === "写作画像"
                  ? "使用此画像"
                  : label === "整篇翻译"
                    ? "开始第一遍"
                    : "查看详情"}
                <ArrowRight className="size-3" />
              </span>
            </div>
          </section>
        ))}
      </div>

      <section className="mx-4 mb-4 rounded-12 border border-brand-red/30 bg-danger-soft p-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="size-4 shrink-0 text-brand-red" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-11 font-medium text-foreground">
                质量检查 · 确定性
              </p>
              <span className="rounded-pill bg-surface-card px-2 py-1 text-9 text-brand-red">
                3 处硬问题
              </span>
            </div>
            <p className="mt-1 text-10 leading-paragraph text-subtle">
              悬空引用 1 处、未定义交叉引用 1 处、摘要数字无正文出处 1
              处。作者与机构缺失必须人工填写。
            </p>
          </div>
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-4 bg-brand-red px-2 text-10 font-medium text-on-dark">
            <Sparkles className="size-3" /> 交给 AI 修复
          </span>
        </div>
      </section>
    </div>
  );
}

/** Prism 的作者机构、真实文库引用和公式插入三类文档入口。 */
export function WikiEmbedPrismDocumentInsertDialogs() {
  return (
    <div
      className="grid w-[min(100%,54rem)] gap-3 lg:grid-cols-3"
      aria-hidden
      data-wiki-fixture="prism-document-insert-dialogs"
    >
      <section className="overflow-hidden rounded-12 border border-border bg-surface-card">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <UsersRound className="size-4 text-brand-green" />
          <h3 className="text-12 font-medium text-foreground">作者与机构</h3>
        </header>
        <div className="p-3">
          <div className="flex items-center justify-between text-10 font-medium text-faint">
            <span>机构</span>
            <span className="inline-flex items-center gap-1 text-brand-green">
              <Plus className="size-3" /> 添加
            </span>
          </div>
          <div className="mt-2 rounded-8 border border-border p-2 text-10 text-subtle">
            1 · Example University, Institute for AI Research
          </div>
          <div className="mt-3 flex items-center justify-between text-10 font-medium text-faint">
            <span>作者（署名顺序）</span>
            <span className="inline-flex items-center gap-1 text-brand-green">
              <Plus className="size-3" /> 添加
            </span>
          </div>
          {["Lin Chen · lin.chen@example.edu · 1", "Mateo Silva · 1"].map(
            (author) => (
              <div
                key={author}
                className="mt-2 rounded-8 border border-border p-2 text-10 text-subtle"
              >
                {author}
              </div>
            ),
          )}
          <span className="mt-3 inline-flex h-7 w-full items-center justify-center rounded-4 bg-foreground text-10 font-medium text-on-dark">
            保存作者与机构
          </span>
        </div>
      </section>

      <section className="overflow-hidden rounded-12 border border-border bg-surface-card">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Quote className="size-4 text-brand-amber" />
          <h3 className="text-12 font-medium text-foreground">
            插入引用 · 从文献库
          </h3>
        </header>
        <div className="p-3">
          <div className="flex h-8 items-center gap-2 rounded-8 border border-border px-2">
            <Search className="size-3 text-faint" />
            <span className="text-10 text-faint">搜索标题 / 作者…</span>
          </div>
          {[
            ["Retrieval-Augmented Generation", "Lewis 等 · 2020", true],
            ["Dense Passage Retrieval", "Karpukhin 等 · 2020", false],
          ].map(([title, meta, selected]) => (
            <div
              key={String(title)}
              className="mt-2 flex gap-2 rounded-8 border border-border p-2"
            >
              <span
                className={
                  selected
                    ? "inline-flex size-4 items-center justify-center rounded-pill bg-brand-green text-on-dark"
                    : "size-4 rounded-pill border border-border"
                }
              >
                {selected ? <Check className="size-3" /> : null}
              </span>
              <div className="min-w-0">
                <p className="line-clamp-1 text-10 font-medium text-foreground">
                  {title}
                </p>
                <p className="mt-1 text-9 text-faint">{meta}</p>
              </div>
            </div>
          ))}
          <p className="mt-3 text-9 leading-paragraph text-faint">
            只能插入个人文献库中的真实记录，避免由 AI 编造引用键。
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-12 border border-border bg-surface-card">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <FunctionSquare className="size-4 text-brand-red" />
          <h3 className="text-12 font-medium text-foreground">插入公式</h3>
        </header>
        <div className="p-3">
          <div className="rounded-8 border border-border bg-surface-1 p-5 text-center font-serif text-20 text-foreground">
            E = mc<sup>2</sup>
          </div>
          <div className="mt-3 rounded-8 border border-border px-3 py-2 font-mono text-10 text-subtle">
            E = mc^2
          </div>
          <p className="mt-2 text-9 text-faint">
            可视化编辑，保存为 LaTeX 并进入结构化文档。
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <span className="rounded-4 border border-border px-3 py-1 text-10 text-subtle">
              取消
            </span>
            <span className="rounded-4 bg-brand-red px-3 py-1 text-10 font-medium text-on-dark">
              插入
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Prism 文件版本、选区工具条与内联编辑提示。 */
export function WikiEmbedPrismHistoryInlineEdit() {
  return (
    <div
      className="grid w-[min(100%,54rem)] gap-4 lg:grid-cols-[20rem_1fr]"
      aria-hidden
      data-wiki-fixture="prism-history-inline-edit"
    >
      <section className="overflow-hidden rounded-12 border border-border bg-surface-card shadow-raised">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <History className="size-4 text-brand-green" />
          <div className="min-w-0">
            <h3 className="text-12 font-medium text-foreground">
              版本历史 · document.md
            </h3>
            <p className="text-9 text-faint">
              恢复会生成新的 current，不删除历史链
            </p>
          </div>
        </header>
        <div className="p-3">
          {[
            ["当前版本", "今天 14:26", "自动保存", true],
            ["版本 18", "今天 13:52", "AI 修订前", false],
            ["版本 17", "昨天 21:08", "编译前", false],
          ].map(([label, time, note, current]) => (
            <div
              key={String(label)}
              className="flex items-start gap-2 border-b border-border-hairline py-3 last:border-0"
            >
              <span
                className={
                  current
                    ? "inline-flex size-6 items-center justify-center rounded-pill bg-brand-green text-on-dark"
                    : "inline-flex size-6 items-center justify-center rounded-pill bg-surface-2 text-faint"
                }
              >
                {current ? (
                  <Check className="size-3" />
                ) : (
                  <Clock3 className="size-3" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-10 font-medium text-foreground">{label}</p>
                <p className="mt-1 text-9 text-faint">
                  {time} · {note}
                </p>
              </div>
              {!current ? (
                <span className="inline-flex items-center gap-1 text-9 text-brand-red">
                  <RefreshCw className="size-3" /> 恢复
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-12 border border-border bg-surface-card p-4">
        <div className="mx-auto flex w-fit items-center overflow-hidden rounded-8 border border-border bg-foreground text-on-dark shadow-raised">
          <span className="inline-flex items-center gap-1 border-r border-border-strong px-3 py-2 text-10">
            <PenLine className="size-3" /> 编辑此处
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-2 text-10">
            <Quote className="size-3" /> 引用此处
          </span>
        </div>

        <div className="mt-3 rounded-8 border-l-2 border-brand-green bg-brand-green-soft px-3 py-3">
          <p className="text-10 font-medium text-foreground">已选中 86 个字</p>
          <p className="mt-1 line-clamp-2 text-10 italic leading-paragraph text-subtle">
            “The retrieved evidence suggests that performance gains depend on
            both retrieval recall and the generator’s ability to ground claims…”
          </p>
        </div>

        <div className="mt-3 overflow-hidden rounded-12 border border-border shadow-raised">
          <header className="flex items-center gap-2 border-b border-border bg-surface-1 px-3 py-2">
            <Sparkles className="size-4 text-brand-green" />
            <span className="text-10 font-medium text-foreground">
              就选中内容让 AI 修改
            </span>
            <X className="ml-auto size-3 text-faint" />
          </header>
          <div className="flex flex-wrap gap-1 p-3">
            {["精简表达", "改得更学术", "检查事实强度", "改公式"].map(
              (action, index) => (
                <span
                  key={action}
                  className={
                    index === 1
                      ? "rounded-pill bg-brand-green-soft px-2 py-1 text-9 text-brand-green"
                      : "rounded-pill bg-surface-2 px-2 py-1 text-9 text-subtle"
                  }
                >
                  {action}
                </span>
              ),
            )}
          </div>
          <div className="m-3 mt-0 flex min-h-16 items-end gap-2 rounded-8 border border-border px-3 py-2">
            <span className="min-w-0 flex-1 text-10 text-faint">
              保留检索与生成的区分，并降低因果措辞…
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-4 bg-brand-red text-on-dark">
              <ArrowRight className="size-3" />
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
