import {
  ArrowUp,
  BookOpen,
  ChartSpline,
  FileText,
  Grid3X3,
  Newspaper,
  Plus,
  Presentation,
  Puzzle,
  SearchCheck,
} from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";

const SUGGESTIONS = [
  { label: "找一篇综述", icon: BookOpen },
  { label: "读 PDF 写摘要", icon: FileText },
  { label: "查期刊动态", icon: Newspaper },
] as const;

/** Claw 新对话空态 · 纯样式 fixture，对齐 ClawHero + ChatComposer + TemplateCards。 */
export function WikiEmbedClawEmptyState() {
  return (
    <div
      className="flex w-[min(100%,42rem)] flex-col items-center rounded-12 border border-border bg-surface-card px-4 py-6"
      aria-hidden
      data-wiki-fixture="claw-empty-state"
    >
      <BrandLogo size="xl" />

      <div className="mt-6 w-full overflow-hidden rounded-16 border border-border-strong bg-surface-card shadow-raised">
        <div className="px-4 py-4 text-14 text-faint">
          说说你正在研究什么，或上传材料开始…
        </div>
        <div className="flex items-center gap-1 px-2 pb-2">
          <span className="inline-flex size-8 items-center justify-center rounded-8 text-subtle">
            <Plus className="size-4" />
          </span>
          <span className="inline-flex size-8 items-center justify-center rounded-8 text-subtle">
            <Puzzle className="size-4" />
          </span>
          <span className="ml-auto text-12 text-subtle">GPT-5</span>
          <span className="inline-flex size-8 items-center justify-center rounded-8 bg-foreground text-on-dark">
            <ArrowUp className="size-4" />
          </span>
        </div>
      </div>

      <div className="mt-4 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TemplateCard
          icon={Presentation}
          title="制作 PPT"
          description="从主题与受众生成可预览的演示稿"
          tone="amber"
        />
        <TemplateCard
          icon={ChartSpline}
          title="科研绘图"
          description="从描述生成论文级图表或示意图"
          tone="green"
        />
        <TemplateCard
          icon={SearchCheck}
          title="智能选刊"
          description="根据稿件画像匹配目标期刊"
          tone="red"
        />
        <TemplateCard
          icon={Grid3X3}
          title="矩阵分析"
          description="批量提取维度并横向比较文献"
          tone="green"
        />
        <TemplateCard
          icon={FileText}
          title="PDF-Chat"
          description="对着 PDF 提问、摘要与划段解读"
          tone="amber"
        />
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map(({ label, icon: Icon }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-card px-3 py-1 text-12 text-subtle shadow-raised"
          >
            <Icon className="size-3.5 text-faint" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TemplateCard({
  icon: Icon,
  title,
  description,
  tone,
}: {
  icon: typeof Presentation;
  title: string;
  description: string;
  tone: "amber" | "green" | "red";
}) {
  return (
    <section className="rounded-12 border border-border bg-surface-1 p-3">
      <span
        className={
          tone === "amber"
            ? "inline-flex size-8 items-center justify-center rounded-8 bg-warning-soft text-brand-amber"
            : tone === "green"
              ? "inline-flex size-8 items-center justify-center rounded-8 bg-brand-green/10 text-brand-green"
              : "inline-flex size-8 items-center justify-center rounded-8 bg-brand-red-soft text-brand-red"
        }
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-14 font-medium text-foreground">{title}</p>
      <p className="mt-1 text-12 leading-paragraph text-subtle">
        {description}
      </p>
    </section>
  );
}
