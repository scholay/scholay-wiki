import {
  BarChart3,
  ChevronRight,
  FileText,
  Search,
  Sparkles,
} from "lucide-react";

const TOOLS = [
  {
    name: "文献趋势分析",
    category: "数据分析",
    Icon: BarChart3,
    tone: "bg-cat-blue-soft text-cat-blue",
  },
  {
    name: "摘要结构检查",
    category: "论文写作",
    Icon: FileText,
    tone: "bg-cat-green-soft text-cat-green",
  },
  {
    name: "研究问题生成",
    category: "智能助手",
    Icon: Sparkles,
    tone: "bg-danger-soft text-brand-red",
  },
] as const;

/** 科研能力广场目录 · 纯样式 fixture。来源：product-mock tools catalog。 */
export function WikiEmbedFeaturePlaza() {
  return (
    <div
      className="w-[min(100%,42rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="feature-plaza"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-18 font-serif leading-serif text-foreground">
            科研能力广场
          </p>
          <p className="mt-1 text-12 text-muted-foreground">
            发现工具与社区技能
          </p>
        </div>
        <div className="flex h-control-md items-center gap-2 rounded-8 border border-border bg-surface-1 px-3 text-12 text-faint sm:w-56">
          <Search className="size-3" /> 搜索功能
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-hidden">
        {["全部", "学术搜索", "论文写作", "数据分析"].map((label, index) => (
          <span
            key={label}
            className={`shrink-0 rounded-pill px-3 py-1 text-12 ${index === 0 ? "bg-foreground text-on-dark" : "bg-surface-1 text-muted-foreground"}`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {TOOLS.map(({ name, category, Icon, tone }) => (
          <div
            key={name}
            className="rounded-8 border border-border bg-surface-card p-3"
          >
            <div
              className={`inline-flex size-9 items-center justify-center rounded-8 ${tone}`}
            >
              <Icon className="size-4" />
            </div>
            <p className="mt-3 text-14 font-medium text-foreground">{name}</p>
            <div className="mt-2 flex items-center justify-between text-12 text-faint">
              <span>{category}</span>
              <ChevronRight className="size-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
