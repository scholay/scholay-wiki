import {
  ArrowLeft,
  Check,
  ChevronLeft,
  Copy,
  Database,
  Download,
  ExternalLink,
  Globe,
  Monitor,
  Search,
  Share2,
  Sigma,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";

const TOOL_ROWS = [
  {
    name: "Zotero",
    tagline: "收集、管理并引用研究资料",
    price: "免费",
    icon: Database,
    tone: "bg-brand-green-soft text-brand-green",
  },
  {
    name: "Overleaf",
    tagline: "在线协作 LaTeX 编辑器",
    price: "免费增值",
    icon: Sigma,
    tone: "bg-warning-soft text-brand-amber",
  },
  {
    name: "Connected Papers",
    tagline: "从一篇论文探索相关研究图谱",
    price: "免费",
    icon: Sparkles,
    tone: "bg-cat-blue-soft text-cat-blue",
  },
] as const;

/** /m/tools/all 的搜索、分类和工具列表主表面。 */
export function WikiEmbedMobileToolsCatalog() {
  return (
    <div
      className="w-[min(100%,26rem)] overflow-hidden rounded-20 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="mobile-tools-catalog"
    >
      <header className="space-y-3 border-b border-border bg-surface-card px-4 pb-3 pt-3">
        <div className="flex items-center gap-1">
          <ChevronLeft className="size-5 text-foreground" />
          <h2 className="text-16 font-medium text-foreground">功能广场</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-16 border border-border bg-surface-1 px-3">
            <Search className="size-4 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-14 text-faint">
              搜索网站、工具…
            </span>
            <span className="rounded-8 bg-foreground px-3 py-2 text-12 font-medium text-on-dark">
              搜索
            </span>
          </div>
          <span className="relative flex size-11 shrink-0 items-center justify-center rounded-pill border border-border bg-surface-1">
            <SlidersHorizontal className="size-4 text-foreground" />
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-pill bg-brand-red px-1 text-12 text-on-brand">
              2
            </span>
          </span>
        </div>
        <div className="flex gap-2 overflow-hidden text-12">
          <span className="shrink-0 rounded-pill border border-foreground bg-foreground px-3 py-2 font-medium text-on-dark">
            全部
          </span>
          <span className="shrink-0 rounded-pill border border-border bg-surface-card px-3 py-2 text-muted-foreground">
            文献管理 18
          </span>
          <span className="shrink-0 rounded-pill border border-border bg-surface-card px-3 py-2 text-muted-foreground">
            写作排版 12
          </span>
        </div>
      </header>

      <div className="p-3">
        <p className="px-1 pb-2 text-12 text-faint">共 46 个工具</p>
        <div className="space-y-2">
          {TOOL_ROWS.map(({ icon: Icon, name, price, tagline, tone }) => (
            <article
              key={name}
              className="flex items-center gap-3 rounded-16 border border-border bg-surface-card p-3"
            >
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-12 ${tone}`}
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-14 font-medium text-foreground">
                    {name}
                  </h3>
                  <span className="shrink-0 rounded-4 bg-surface-2 px-2 py-1 text-12 text-muted-foreground">
                    {price}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-12 leading-paragraph text-muted-foreground">
                  {tagline}
                </p>
              </div>
              <Share2 className="size-4 shrink-0 text-faint" />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

const TOOL_FILTER_GROUPS = [
  {
    title: "价格",
    options: ["免费", "免费增值", "试用", "付费", "教育"],
    active: "免费",
  },
  { title: "获取方式", options: ["在线", "下载"], active: "在线" },
  { title: "开源", options: ["开源", "闭源"], active: "开源" },
  { title: "排序", options: ["最热", "最新", "名称"], active: "最热" },
] as const;

/** MobileToolsFilterSheet 的完整展开态。 */
export function WikiEmbedMobileToolsFilterSheet() {
  return (
    <div
      className="relative h-[38rem] w-[min(100%,26rem)] overflow-hidden rounded-20 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="mobile-tools-filter-sheet"
    >
      <div className="space-y-3 px-4 pt-4 opacity-50">
        <div className="flex h-11 items-center gap-2 rounded-16 border border-border bg-surface-card px-3 text-12 text-faint">
          <Search className="size-4" /> 搜索网站、工具…
        </div>
        <div className="space-y-2">
          {TOOL_ROWS.slice(0, 2).map(({ name }) => (
            <div
              key={name}
              className="h-20 rounded-16 border border-border bg-surface-card"
            />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-foreground/40" />

      <section className="absolute inset-x-0 bottom-0 rounded-t-20 bg-surface-card pb-6 shadow-overlay">
        <div className="flex justify-center pb-1 pt-3">
          <span className="h-1 w-9 rounded-pill bg-border-strong" />
        </div>
        <div className="flex items-center border-b border-border-soft px-4 py-3">
          <h2 className="text-14 font-medium text-foreground">筛选</h2>
          <span className="ml-auto text-12 text-muted-foreground">重置</span>
          <X className="ml-4 size-4 text-muted-foreground" />
        </div>
        <div className="space-y-6 px-4 pt-4">
          {TOOL_FILTER_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-12 font-medium text-faint">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <span
                    key={option}
                    className={
                      option === group.active
                        ? "rounded-pill border border-foreground bg-foreground px-3 py-2 text-12 font-medium text-on-dark"
                        : "rounded-pill border border-border bg-surface-card px-3 py-2 text-12 text-muted-foreground"
                    }
                  >
                    {option}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** /m/tools/:idOrSlug 的工具详情信息架构。 */
export function WikiEmbedMobileToolDetail() {
  return (
    <div
      className="w-[min(100%,26rem)] overflow-hidden rounded-20 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="mobile-tool-detail"
    >
      <header className="flex h-12 items-center gap-2 border-b border-border bg-surface-card px-2">
        <ArrowLeft className="size-5 text-foreground" />
        <span className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
          Zotero
        </span>
        <Share2 className="size-5 text-foreground" />
      </header>

      <div className="space-y-3 p-3">
        <section className="rounded-16 border border-border bg-surface-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-12 bg-brand-green-soft text-brand-green">
              <Database className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-16 font-medium text-foreground">Zotero</h1>
              <p className="text-12 text-faint">Zotero</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["文献管理", "免费", "下载", "开源"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-4 bg-surface-2 px-2 py-1 text-12 text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-12 leading-paragraph text-subtle">
            你的个人研究助手，用于收集、组织、注释、引用和共享研究资料。
          </p>
          <div className="mt-3 flex gap-2">
            <span className="flex h-10 flex-1 items-center justify-center gap-2 rounded-8 bg-foreground text-14 font-medium text-on-dark">
              <Globe className="size-4" /> 访问官网
            </span>
            <span className="flex h-10 flex-1 items-center justify-center gap-2 rounded-8 border border-border bg-surface-card text-14 font-medium text-foreground">
              <Download className="size-4" /> 下载
            </span>
          </div>
        </section>

        <ToolDetailSection title="介绍">
          Zotero
          可自动感知浏览器里的研究内容，并用一键保存的方式建立可检索的个人文献库。
        </ToolDetailSection>
        <ToolDetailSection title="使用场景">
          <p className="font-medium text-foreground">系统综述资料管理</p>
          <p className="mt-1">集中管理检索结果、附件、笔记和引文元数据。</p>
        </ToolDetailSection>
        <section className="rounded-16 border border-border bg-surface-card p-4">
          <h2 className="text-14 font-medium text-foreground">教程与资源</h2>
          <div className="mt-3 flex items-center gap-2 text-12 text-brand-green">
            <ExternalLink className="size-4" /> Zotero 快速入门
          </div>
        </section>
      </div>
    </div>
  );
}

/** 手机访问纯电脑端能力时的能力说明与链接复制页。 */
export function WikiEmbedMobilePcOnlyGuide() {
  const features = [
    "全文结构化预审与逻辑检查",
    "逐段修改意见与一键改写",
    "投稿期刊匹配与命中率预测",
    "格式 · 查重 · 参考文献核对",
  ];

  return (
    <div
      className="w-[min(100%,26rem)] overflow-hidden rounded-20 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="mobile-pc-only-guide"
    >
      <header className="flex h-14 items-center justify-between border-b border-border px-3">
        <ChevronLeft className="size-6 text-foreground" />
        <span className="text-14 font-medium text-foreground">智能审稿</span>
        <span className="size-6" />
      </header>
      <div className="flex flex-col items-center px-6 pb-6 pt-6 text-center">
        <span className="flex size-24 items-center justify-center rounded-pill bg-amber-soft">
          <Monitor className="size-11 text-foreground" />
        </span>
        <span className="mt-3 inline-flex items-center gap-2 rounded-pill bg-surface-2 px-3 py-2 text-12 font-medium text-muted-foreground">
          <Smartphone className="size-3" /> 手机端功能受限
        </span>
        <h1 className="mt-4 text-20 font-medium text-foreground">
          智能审稿建议在电脑端使用
        </h1>
        <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
          完整审稿需要上传
          PDF、逐段批注、多栏对照与导出,手机屏幕空间有限。前往电脑端可获得完整能力。
        </p>

        <section className="mt-6 w-full rounded-16 border border-border bg-surface-1 p-4 text-left">
          <h2 className="text-14 font-medium text-foreground">电脑端可用</h2>
          <ul className="mt-3 space-y-3">
            {features.map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-2 text-12 text-muted-foreground"
              >
                <Check className="size-4 shrink-0 text-brand-green" />
                {feature}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-4 flex h-11 w-full items-center gap-2 rounded-8 border border-border bg-surface-1 pl-3 pr-2">
          <span className="min-w-0 flex-1 truncate text-left text-12 text-muted-foreground">
            scholay.com/peer-review
          </span>
          <span className="inline-flex items-center gap-2 rounded-4 border border-border bg-surface-card px-3 py-2 text-12 font-medium text-foreground">
            <Copy className="size-4" /> 复制
          </span>
        </div>
      </div>
    </div>
  );
}

function ToolDetailSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-16 border border-border bg-surface-card p-4">
      <h2 className="mb-2 text-14 font-medium text-foreground">{title}</h2>
      <div className="text-12 leading-paragraph text-subtle">{children}</div>
    </section>
  );
}
