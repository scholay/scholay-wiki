import {
  Clock3,
  Flame,
  Landmark,
  Microscope,
  Newspaper,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

const SECTIONS = ["全部", "重大事件", "国内政策", "顶刊速递", "其他"] as const;

const NEWS = [
  {
    title: "多机构发布医学影像基础模型评测框架",
    summary:
      "评测覆盖跨设备泛化、少样本适配与临床安全性，原始报告同时公开数据限制。",
    section: "顶刊速递",
    source: "Nature Medicine",
    time: "2 小时前",
    heat: "1.8 万",
    featured: true,
    icon: Microscope,
  },
  {
    title: "国家自然科学基金更新科研诚信常见问题说明",
    summary: "新版说明补充申请材料、成果署名与生成式 AI 使用的核对边界。",
    section: "国内政策",
    source: "国家自然科学基金委员会",
    time: "昨天",
    heat: "8,420",
    featured: false,
    icon: Landmark,
  },
] as const;

/** 学术情报列表、排序、版块与卡片 · 纯样式 fixture。 */
export function WikiEmbedAcademicIntelList() {
  return (
    <div
      className="w-[min(100%,46rem)] rounded-12 border border-border bg-surface-card p-4 sm:p-6"
      aria-hidden
      data-wiki-fixture="academic-intel-list"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-danger-soft text-brand-red">
          <Newspaper className="size-4" />
        </span>
        <div>
          <h2 className="font-serif text-20 font-medium text-foreground">
            学术情报
          </h2>
          <p className="mt-1 text-12 text-subtle">
            顶刊速递 · 重大事件 · 国内政策
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-pill bg-foreground px-3 py-1 text-12 text-on-dark">
          最新
        </span>
        <span className="rounded-pill bg-surface-2 px-3 py-1 text-12 text-subtle">
          最热
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {SECTIONS.map((section, index) => (
          <span
            key={section}
            className={cn(
              "rounded-pill border px-3 py-1 text-12",
              index === 0
                ? "border-foreground bg-foreground text-on-dark"
                : "border-border text-subtle",
            )}
          >
            {section}
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {NEWS.map((item) => (
          <article
            key={item.title}
            className="flex gap-3 rounded-8 border border-border-soft bg-surface-card p-4"
          >
            <span className="hidden size-20 shrink-0 items-center justify-center rounded-8 bg-surface-1 text-faint sm:inline-flex">
              <item.icon className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-12">
                {item.featured && (
                  <span className="rounded-4 bg-brand-red px-2 py-1 text-on-dark">
                    头条
                  </span>
                )}
                <span className="inline-flex items-center gap-1 font-medium text-cat-blue">
                  <span className="size-1 rounded-pill bg-cat-blue" />
                  {item.section}
                </span>
                <span className="inline-flex items-center gap-1 text-faint">
                  <Flame className="size-3" />
                  {item.heat}
                </span>
                {item.featured && (
                  <span className="inline-flex items-center gap-1 text-brand-red">
                    <TrendingUp className="size-3" />
                    飙升
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1 text-faint">
                  <Clock3 className="size-3" />
                  {item.time}
                </span>
              </div>
              <h3 className="mt-2 text-16 font-medium leading-sans text-foreground">
                {item.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-12 leading-paragraph text-subtle">
                {item.summary}
              </p>
              <div className="mt-2 flex items-center gap-2 text-12 text-faint">
                <span className="rounded-4 bg-surface-1 px-2 py-1">快讯</span>
                <span className="truncate">来源 · {item.source}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
