import {
  BarChart3,
  Blocks,
  ChevronDown,
  Cloud,
  Compass,
  Dna,
  Download,
  FlaskConical,
  Globe,
  LayoutGrid,
  Library,
  LineChart,
  Search,
  type LucideIcon,
} from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const CATEGORIES: Array<{
  label: string;
  count: number;
  Icon: LucideIcon;
}> = [
  { label: "统计与计量", count: 42, Icon: BarChart3 },
  { label: "化学与材料", count: 31, Icon: FlaskConical },
  { label: "生物与生命", count: 28, Icon: Dna },
  { label: "可视化绘图", count: 36, Icon: LineChart },
  { label: "文献管理", count: 24, Icon: Library },
];

const TOOLS: Array<{
  initial: string;
  name: string;
  category: string;
  tagline: string;
  tags: readonly string[];
  price: string;
  access: "website" | "download" | "both";
}> = [
  {
    initial: "Z",
    name: "Zotero",
    category: "文献管理与 PDF",
    tagline: "收集、管理、引用并协作整理研究文献。",
    tags: ["文献管理", "引用"],
    price: "免费",
    access: "download",
  },
  {
    initial: "O",
    name: "Overleaf",
    category: "论文写作与 LaTeX",
    tagline: "在线协作撰写、编译与审阅 LaTeX 文档。",
    tags: ["LaTeX", "协作"],
    price: "免费增值",
    access: "website",
  },
  {
    initial: "R",
    name: "RStudio",
    category: "统计与计量",
    tagline: "面向 R 语言的数据分析与可重复研究环境。",
    tags: ["统计", "开源"],
    price: "免费",
    access: "download",
  },
  {
    initial: "V",
    name: "VOSviewer",
    category: "可视化绘图",
    tagline: "构建并查看文献计量网络与知识图谱。",
    tags: ["计量", "图谱"],
    price: "免费",
    access: "download",
  },
  {
    initial: "G",
    name: "GraphPad Prism",
    category: "统计与计量",
    tagline: "生命科学统计分析、曲线拟合与科研绘图。",
    tags: ["统计", "绘图"],
    price: "试用",
    access: "both",
  },
  {
    initial: "B",
    name: "BioRender",
    category: "可视化绘图",
    tagline: "用科研图标快速制作生命科学示意图。",
    tags: ["生物", "插图"],
    price: "免费增值",
    access: "website",
  },
];

/** 科研能力广场的全网工具首屏 · 来源：ToolsLayout + PlazaHeader + ToolsCatalogPage。 */
export function WikiEmbedFeaturePlaza() {
  return (
    <div
      className="flex w-full max-w-6xl overflow-hidden rounded-8 border border-border bg-surface-1"
      style={{ ...DISCOVERY_MOCK_THEME, minHeight: 620 }}
      aria-hidden
      data-wiki-fixture="feature-plaza"
    >
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="px-4 pb-2 pt-3">
          <p className="text-16 font-medium text-foreground">科研能力广场</p>
        </div>

        <div className="border-b border-border-hairline py-2">
          <div className="flex h-8 items-center gap-2 bg-surface-1 px-4 text-16 font-medium text-foreground">
            <LayoutGrid className="size-4" />
            <span className="min-w-0 flex-1">全部工具</span>
            <span className="text-12 tabular-nums text-faint">186</span>
          </div>
        </div>

        <div className="py-2">
          <div className="flex h-7 items-center justify-between px-4 text-12 font-medium uppercase text-faint">
            分类
            <ChevronDown className="size-3" />
          </div>
          {CATEGORIES.map(({ label, count, Icon }) => (
            <div
              key={label}
              className="flex h-8 items-center gap-2 px-4 text-16 text-subtle"
            >
              <Icon className="size-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="text-12 tabular-nums text-faint">{count}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-border-hairline py-2">
          <div className="flex h-7 items-center justify-between px-4 text-12 font-medium uppercase text-faint">
            价格
            <ChevronDown className="size-3" />
          </div>
          {[
            ["全部", true],
            ["免费", false],
            ["试用", false],
            ["付费", false],
          ].map(([label, active]) => (
            <div
              key={String(label)}
              className="flex h-7 items-center gap-2 px-4 text-16 text-subtle"
            >
              <span
                className={
                  active
                    ? "size-3 rounded-pill border-4 border-foreground"
                    : "size-3 rounded-pill border border-border-strong"
                }
              />
              {label}
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border bg-background px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex justify-center">
              <div className="inline-flex rounded-12 border border-border bg-surface-1 p-1">
                <span className="inline-flex items-center gap-1 rounded-8 bg-background px-4 py-2 text-16 font-medium text-foreground shadow-raised">
                  <Compass className="size-4" />
                  全网工具
                </span>
                <span className="inline-flex items-center gap-1 rounded-8 px-4 py-2 text-16 text-muted-foreground">
                  <Blocks className="size-4" />
                  社区技能
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-12 border border-border bg-surface-1 px-3">
                <Search className="size-4 shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate text-16 text-faint">
                  搜索科研工具 —— 名称 / 关键词 / 用途
                </span>
              </div>
              <div className="inline-flex h-11 shrink-0 items-center gap-2 rounded-12 border border-border bg-surface-1 px-3 text-12 font-medium text-subtle">
                热度排序
                <ChevronDown className="size-3" />
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-20 font-medium text-foreground">全部工具</h2>
              <span className="text-12 text-faint">共 186 个</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          </div>
        </main>
      </section>
    </div>
  );
}

function ToolCard({ tool }: { tool: (typeof TOOLS)[number] }) {
  const AccessIcon =
    tool.access === "download"
      ? Download
      : tool.access === "both"
        ? Cloud
        : Globe;

  return (
    <article className="flex min-h-40 flex-col gap-2 rounded-8 border border-border bg-background p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-8 border border-border-hairline bg-surface-2 text-20 font-medium text-subtle">
          {tool.initial}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-16 font-medium text-foreground">
            {tool.name}
          </h3>
          <p className="truncate text-12 text-faint">{tool.category}</p>
        </div>
      </div>

      <p className="line-clamp-2 text-14 leading-paragraph text-muted-foreground">
        {tool.tagline}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 items-center gap-1">
          {tool.tags.map((tag) => (
            <span
              key={tag}
              className="truncate rounded-4 bg-surface-2 px-2 py-1 text-12 text-subtle"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={
              tool.price === "试用"
                ? "text-12 font-medium text-brand-amber"
                : "text-12 font-medium text-brand-green"
            }
          >
            {tool.price}
          </span>
          <AccessIcon className="size-3 text-faint" />
        </div>
      </div>
    </article>
  );
}
