import {
  ArrowLeft,
  Check,
  ChevronLeft,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Globe,
  LayoutGrid,
  Monitor,
  Search,
  Share2,
  SlidersHorizontal,
  Smartphone,
  User,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";
import { ToolLogo } from "@/features/tools/components/ToolLogo";

const TOOL_ROWS = [
  {
    name: "Zotero",
    name_en: "Zotero",
    tagline: "收集、管理并引用研究资料",
    price: "免费",
  },
  {
    name: "Overleaf",
    name_en: "Overleaf",
    tagline: "在线协作 LaTeX 编辑器",
    price: "免费增值",
  },
  {
    name: "Connected Papers",
    name_en: "Connected Papers",
    tagline: "从一篇论文探索相关研究图谱",
    price: "免费",
  },
] as const;

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

/** /m/tools/all 的搜索、分类和工具列表主表面。 */
export function WikiEmbedMobileToolsCatalog() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-tools-catalog"
    >
      <FrozenToolsShell />
    </div>
  );
}

/** MobileToolsFilterSheet 的完整展开态。 */
export function WikiEmbedMobileToolsFilterSheet() {
  return (
    <div
      className="relative w-[min(100%,24rem)] overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-tools-filter-sheet"
    >
      <FrozenToolsShell muted />
      <div className="absolute inset-0 bg-foreground/40" />
      <section className="absolute inset-x-0 bottom-0 flex max-h-[92%] flex-col rounded-t-16 bg-background shadow-overlay">
        <div
          className="flex shrink-0 justify-center pb-1"
          style={{ paddingTop: 10 }}
        >
          <span className="h-1 w-9 rounded-pill bg-border-strong" />
        </div>
        <div className="flex flex-col px-4 pb-3 pt-1" style={{ gap: 20 }}>
          <div className="flex items-center justify-between">
            <span className="text-14 font-medium text-foreground">筛选</span>
            <span className="text-12 text-muted-foreground">重置</span>
          </div>
          {TOOL_FILTER_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <p className="text-12 font-medium text-faint">{group.title}</p>
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <span
                    key={option}
                    className={`rounded-pill border text-12 ${option === group.active ? "border-foreground bg-foreground font-medium text-on-brand" : "border-border bg-background text-muted-foreground"}`}
                    style={{ paddingBlock: 6, paddingInline: 12 }}
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
  const tool = { logo: undefined, name: "Zotero", name_en: "Zotero" };

  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-tool-detail"
    >
      <main className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2">
          <span className="flex size-9 items-center justify-center rounded-pill">
            <ArrowLeft className="size-5 text-foreground" />
          </span>
          <span className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
            Zotero
          </span>
          <span className="flex size-9 items-center justify-center rounded-pill">
            <Share2 className="size-5 text-foreground" />
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-surface-1">
          <div className="space-y-3 p-3">
            <section className="rounded-8 border border-border bg-background p-4">
              <div className="flex items-start gap-3">
                <ToolLogo
                  tool={tool}
                  className="h-14 w-14"
                  textClass="text-20"
                />
                <div className="min-w-0 flex-1">
                  <h1 className="text-16 font-medium text-foreground">
                    Zotero
                  </h1>
                  <div
                    className="flex flex-wrap"
                    style={{ gap: 6, marginTop: 6 }}
                  >
                    {["文献管理", "免费", "下载", "开源"].map((tag) => (
                      <span
                        key={tag}
                        className="rounded-4 bg-surface-2 text-12 text-muted-foreground"
                        style={{ paddingBlock: 2, paddingInline: 6 }}
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
                <span
                  className="flex h-10 flex-1 items-center justify-center rounded-8 bg-foreground text-14 font-medium text-on-brand"
                  style={{ gap: 6 }}
                >
                  <Globe className="size-4" /> 访问官网
                </span>
                <span
                  className="flex h-10 flex-1 items-center justify-center rounded-8 border border-border-button bg-background text-14 font-medium text-foreground"
                  style={{ gap: 6 }}
                >
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
            <section className="rounded-8 border border-border bg-background p-4">
              <h2 className="text-14 font-medium text-foreground">
                教程与资源
              </h2>
              <div
                className="flex items-center text-12 text-brand-green"
                style={{ gap: 6, marginTop: 12 }}
              >
                <ExternalLink className="size-4" /> Zotero 快速入门
              </div>
            </section>
          </div>
        </div>
      </main>
      <StaticMobileNav active="tools" />
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
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-pc-only-guide"
    >
      <main className="flex min-h-0 flex-1 flex-col bg-background">
        <header
          className="flex h-14 shrink-0 items-center justify-between border-b border-border"
          style={{ paddingInline: 14 }}
        >
          <span className="flex size-9 items-center justify-center rounded-pill text-foreground">
            <ChevronLeft className="size-6" />
          </span>
          <span className="text-14 font-medium text-foreground">智能审稿</span>
          <span className="size-9" />
        </header>

        <div
          className="min-h-0 flex-1 overflow-hidden"
          style={{ paddingBlock: "24px 20px", paddingInline: 20 }}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-3">
              <span className="flex size-24 items-center justify-center rounded-pill bg-amber-soft">
                <Monitor
                  className="size-11 text-foreground"
                  strokeWidth={1.6}
                />
              </span>
              <span
                className="flex items-center rounded-pill bg-surface-2 text-12 font-medium text-muted-foreground"
                style={{ gap: 6, paddingBlock: 6, paddingInline: 12 }}
              >
                <Smartphone className="size-3" />
                手机端功能受限
              </span>
            </div>

            <h1 className="text-center text-20 font-medium text-foreground">
              智能审稿建议在电脑端使用
            </h1>
            <p className="text-center text-12 leading-paragraph text-muted-foreground">
              完整审稿需要上传
              PDF、逐段批注、多栏对照与导出,手机屏幕空间有限。前往电脑端可获得完整能力。
            </p>

            <section className="w-full rounded-8 border border-border bg-surface-1 p-4 text-left">
              <h2
                className="text-14 font-medium text-foreground"
                style={{ marginBottom: 10 }}
              >
                电脑端可用
              </h2>
              <ul className="flex flex-col" style={{ gap: 10 }}>
                {features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-brand-green" />
                    <span className="text-12 text-muted-foreground">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="w-full rounded-8 border border-border bg-background p-4">
              <div
                className="flex h-11 items-center justify-between gap-2 rounded-4 border border-border-button bg-surface-1"
                style={{ paddingLeft: 12, paddingRight: 6 }}
              >
                <span className="min-w-0 flex-1 truncate text-left text-12 text-muted-foreground">
                  scholay.com/peer-review
                </span>
                <span
                  className="flex shrink-0 items-center rounded-4 border border-border-button bg-background text-12 font-medium text-foreground"
                  style={{ gap: 6, paddingBlock: 6, paddingInline: 12 }}
                >
                  <Copy className="size-4" />
                  复制
                </span>
              </div>
            </section>
          </div>
        </div>
      </main>
      <StaticMobileNav active="tools" />
    </div>
  );
}

function FrozenToolsShell({ muted = false }: { muted?: boolean }) {
  return (
    <div
      className={`flex h-full flex-col bg-background ${muted ? "opacity-50" : ""}`}
    >
      <main className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 space-y-3 border-b border-border bg-background px-4 pb-3 pt-3">
          <div className="flex items-center gap-1">
            <span
              className="flex size-8 items-center justify-center rounded-pill text-foreground"
              style={{ marginLeft: -6 }}
            >
              <ChevronLeft className="size-5" />
            </span>
            <h2 className="text-16 font-medium text-foreground">功能广场</h2>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-pill border border-border bg-surface-1"
              style={{ paddingLeft: 14, paddingRight: 4 }}
            >
              <Search className="size-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-14 text-faint">
                搜索网站、工具…
              </span>
              <span className="flex h-8 shrink-0 items-center rounded-8 bg-foreground px-3 text-14 font-medium text-on-brand">
                搜索
              </span>
            </div>
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-pill border border-border bg-surface-1">
              <SlidersHorizontal className="size-4 text-foreground" />
              <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-pill bg-brand-red px-1 text-12 font-medium text-on-brand">
                2
              </span>
            </span>
          </div>
          <div className="flex gap-2 overflow-hidden">
            {["全部", "文献管理 18", "写作排版 12"].map((label, index) => (
              <span
                key={label}
                className={`shrink-0 rounded-pill border text-12 ${index === 0 ? "border-foreground bg-foreground font-medium text-on-brand" : "border-border bg-background text-muted-foreground"}`}
                style={{ paddingBlock: 6, paddingInline: 12 }}
              >
                {label}
              </span>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-surface-1 p-3">
          <p className="px-1 pb-2 text-12 text-faint">共 46 个工具</p>
          <div className="space-y-2">
            {TOOL_ROWS.map((tool) => (
              <article
                key={tool.name}
                className="flex items-center gap-3 rounded-8 border border-border bg-background p-3"
              >
                <ToolLogo
                  tool={{ ...tool, logo: undefined }}
                  className="h-11 w-11"
                  textClass="text-16"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-14 font-medium text-foreground">
                      {tool.name}
                    </h3>
                    <span
                      className="shrink-0 rounded-4 bg-surface-2 text-12 text-muted-foreground"
                      style={{ paddingBlock: 2, paddingInline: 6 }}
                    >
                      {tool.price}
                    </span>
                  </div>
                  <p
                    className="line-clamp-2 text-12 leading-paragraph text-muted-foreground"
                    style={{ marginTop: 2 }}
                  >
                    {tool.tagline}
                  </p>
                </div>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-pill text-faint">
                  <Share2 className="size-4" />
                </span>
              </article>
            ))}
          </div>
        </div>
      </main>
      <StaticMobileNav active="tools" />
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
    <section className="rounded-8 border border-border bg-background p-4">
      <h2 className="mb-2 text-14 font-medium text-foreground">{title}</h2>
      <div className="text-12 leading-paragraph text-subtle">{children}</div>
    </section>
  );
}

function StaticMobileNav({ active }: { active: "tools" }) {
  const items = [
    [Compass, "浏览", "feed"],
    [ClawBrandIcon, "AI Claw", "claw"],
    [LayoutGrid, "功能", "tools"],
    [User, "我的", "me"],
  ] as const;

  return (
    <footer className="grid h-16 shrink-0 grid-cols-4 border-t border-border bg-background px-2">
      {items.map(([Icon, label, key]) => {
        const selected = key === active;
        return (
          <span
            key={key}
            className={`relative flex flex-col items-center justify-center gap-1 ${selected ? "text-foreground" : "text-faint"}`}
          >
            {selected ? (
              <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
            ) : null}
            <Icon className="size-5" />
            <span className={`text-12 ${selected ? "font-medium" : ""}`}>
              {label}
            </span>
          </span>
        );
      })}
    </footer>
  );
}
