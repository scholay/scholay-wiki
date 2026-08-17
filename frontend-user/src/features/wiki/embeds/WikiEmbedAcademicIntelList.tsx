import { Clock, Flame, TrendingUp } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const SECTIONS = ["全部", "重大事件", "国内政策", "顶刊速递", "其他"] as const;

const NEWS = [
  {
    title: "多机构发布医学影像基础模型评测框架",
    summary:
      "评测覆盖跨设备泛化、少样本适配与临床安全性，原始报告同时公开数据限制。",
    section: "顶刊速递",
    tone: "text-cat-blue",
    dot: "bg-cat-blue",
    source: "Nature Medicine",
    time: "2 小时前",
    heat: "1.8 万",
    featured: true,
  },
  {
    title: "国家自然科学基金更新科研诚信常见问题说明",
    summary: "新版说明补充申请材料、成果署名与生成式 AI 使用的核对边界。",
    section: "国内政策",
    tone: "text-brand-green",
    dot: "bg-brand-green",
    source: "国家自然科学基金委员会",
    time: "昨天",
    heat: "8,420",
    featured: false,
  },
] as const;

/** 对齐 NewsListPage 的已加载 row 状态；只冻结接口数据。 */
export function WikiEmbedAcademicIntelList() {
  return (
    <main
      className="w-[min(100%,48rem)] bg-background px-6 py-10"
      aria-hidden
      data-wiki-fixture="academic-intel-list"
    >
      <h1 className="text-24 font-medium text-foreground">scholay 情报</h1>
      <p className="mt-2 text-14 text-muted-foreground">
        顶刊速递 · 重大事件 · 国内政策 —— 实时汇集学术界动态。
      </p>

      <div className="mt-6 flex items-center gap-2">
        <span className="rounded-pill bg-foreground px-3 py-1 text-12 font-medium text-on-dark">
          最新
        </span>
        <span className="rounded-pill bg-surface-2 px-3 py-1 text-12 font-medium text-muted-foreground">
          最热
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {SECTIONS.map((section, index) => (
          <span
            key={section}
            className={cn(
              "rounded-pill border px-3 py-1 text-12",
              index === 0
                ? "border-foreground bg-foreground text-on-dark"
                : "border-border-button text-muted-foreground",
            )}
          >
            {section}
          </span>
        ))}
      </div>

      <div className="mt-6">
        {NEWS.map((item) => (
          <article
            key={item.title}
            className="flex items-start gap-2 border-b border-border px-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <h2 className="m-0 line-clamp-2 text-14 font-medium leading-sans text-foreground">
                {item.title}
              </h2>
              <div className="mt-1 flex items-center gap-2 text-12 text-muted-foreground">
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 font-medium",
                    item.tone,
                  )}
                >
                  <span className={cn("size-2 rounded-pill", item.dot)} />
                  {item.section}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  来源 · {item.source}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-faint">
                  <Clock className="size-3" /> {item.time}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {item.featured && (
                  <span className="inline-flex h-5 items-center rounded-4 bg-brand-red px-2 text-12 font-medium text-on-brand">
                    头条
                  </span>
                )}
                <span className="inline-flex h-5 items-center rounded-4 bg-surface-2 px-2 text-12 text-subtle">
                  快讯
                </span>
                <span className="inline-flex h-5 items-center gap-1 rounded-4 bg-surface-2 px-2 text-12 text-subtle">
                  <Flame className="size-3" /> {item.heat}
                </span>
                {item.featured && (
                  <span className="inline-flex h-5 items-center gap-1 rounded-4 bg-danger-soft px-2 text-12 text-brand-red">
                    <TrendingUp className="size-3" /> 飙升
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-12 leading-paragraph text-subtle">
                {item.summary}
              </p>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <span className="inline-flex h-9 items-center rounded-8 border border-border-button px-4 text-14 text-foreground">
          加载更多
        </span>
      </div>
    </main>
  );
}
