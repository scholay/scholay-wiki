import {
  ChevronRight,
  Clock,
  Compass,
  Flame,
  LayoutGrid,
  Search,
  SlidersHorizontal,
  TrendingUp,
  User,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";

/** NewsPage + NewsCard 的无封面情报冻结态。 */
export function WikiEmbedMobileAcademicIntel() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-academic-intel"
    >
      <header
        className="flex shrink-0 items-center justify-between bg-background px-4"
        style={{ height: 50 }}
      >
        <SlidersHorizontal className="size-5 text-muted-foreground" />
        <nav className="flex items-center gap-6">
          {["论文", "期刊", "情报"].map((label) => (
            <span key={label} className="flex flex-col items-center gap-1">
              <span
                className={
                  label === "情报"
                    ? "text-16 font-medium text-foreground"
                    : "text-14 text-faint"
                }
              >
                {label}
              </span>
              <span
                className={
                  label === "情报"
                    ? "h-0.5 w-5 rounded-pill bg-brand-red"
                    : "h-0.5 w-2"
                }
              />
            </span>
          ))}
        </nav>
        <Search className="size-5 text-muted-foreground" />
      </header>

      <div className="flex shrink-0 items-center gap-2 bg-background px-4 pb-2">
        <span className="rounded-pill bg-foreground px-3 py-1 text-12 font-medium text-on-dark">
          实时
        </span>
        <span className="rounded-pill bg-surface-2 px-3 py-1 text-12 font-medium text-muted-foreground">
          热榜
        </span>
      </div>

      <article
        className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-background py-4"
        style={{ gap: 14, paddingInline: 20 }}
      >
        <div className="flex shrink-0 items-center gap-2 text-12">
          <span className="size-2 rounded-pill bg-cat-blue" />
          <span className="font-medium text-cat-blue">顶刊速递</span>
          <span className="text-faint">·</span>
          <span className="inline-flex items-center gap-1 text-faint">
            <Clock className="size-3" />2 小时前
          </span>
          <span className="ml-auto rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-brand">
            头条
          </span>
        </div>

        <h2 className="line-clamp-3 shrink-0 text-24 font-medium leading-display-tight text-foreground">
          多机构发布医学影像基础模型评测框架
        </h2>

        <div className="min-h-0 shrink">
          <p className="line-clamp-[12] text-14 leading-paragraph text-muted-foreground">
            评测覆盖跨设备泛化、少样本适配与临床安全性，并公开数据范围与失效边界。研究团队同时给出面向真实临床部署的复现协议，帮助研究者比较不同模型在域偏移、稀有病灶和多中心数据上的稳定性。
          </p>
        </div>

        <div className="mt-auto flex shrink-0 flex-wrap items-center gap-2 pb-4 text-12">
          <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-1 text-muted-foreground">
            快讯
          </span>
          <span className="min-w-0 truncate text-muted-foreground">
            来源 · Nature Medicine
          </span>
          <span className="inline-flex items-center gap-1 text-faint">
            <Flame className="size-4" />
            1.8 万
          </span>
          <span className="inline-flex items-center gap-1 rounded-pill bg-danger-soft px-2 py-1 font-medium text-brand-red">
            <TrendingUp className="size-3" />
            飙升
          </span>
        </div>

        <span className="pointer-events-none absolute right-4 bottom-3 flex items-center gap-1 text-12 text-faint">
          全文
          <ChevronRight className="size-3" />
        </span>
      </article>

      <MobileNav />
    </div>
  );
}

function MobileNav() {
  const items = [
    [Compass, "浏览"],
    [ClawBrandIcon, "AI Claw"],
    [LayoutGrid, "功能"],
    [User, "我的"],
  ] as const;
  return (
    <footer className="grid h-16 shrink-0 grid-cols-4 border-t border-border bg-background px-2">
      {items.map(([Icon, label]) => (
        <span
          key={label}
          className={`relative flex flex-col items-center justify-center gap-1 ${label === "浏览" ? "text-foreground" : "text-faint"}`}
        >
          {label === "浏览" ? (
            <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
          ) : null}
          <Icon className="size-5" />
          <span className={`text-12 ${label === "浏览" ? "font-medium" : ""}`}>
            {label}
          </span>
        </span>
      ))}
    </footer>
  );
}
