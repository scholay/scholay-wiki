import { ChevronRight, Clock3, Flame, TrendingUp } from "lucide-react";

/** 移动端学术情报一屏一卡 · 纯样式 fixture，对齐 NewsPage + NewsCard。 */
export function WikiEmbedMobileAcademicIntel() {
  return (
    <div
      className="w-[min(100%,22rem)] overflow-hidden rounded-20 border border-border bg-surface-card shadow-raised"
      aria-hidden
      data-wiki-fixture="mobile-academic-intel"
    >
      <div className="flex h-12 items-center justify-center gap-6 border-b border-border-soft text-12">
        <span className="text-faint">论文</span>
        <span className="text-faint">期刊</span>
        <span className="border-b-2 border-foreground py-4 font-medium text-foreground">
          情报
        </span>
      </div>
      <div className="flex gap-2 px-4 py-2">
        <span className="rounded-pill bg-foreground px-3 py-1 text-12 text-on-dark">
          实时
        </span>
        <span className="rounded-pill bg-surface-2 px-3 py-1 text-12 text-subtle">
          热榜
        </span>
      </div>

      <article className="relative flex min-h-96 flex-col px-4 py-4">
        <div className="flex items-center gap-2 text-12">
          <span className="size-1 rounded-pill bg-cat-blue" />
          <span className="font-medium text-cat-blue">顶刊速递</span>
          <span className="text-faint">·</span>
          <span className="inline-flex items-center gap-1 text-faint">
            <Clock3 className="size-3" />2 小时前
          </span>
          <span className="ml-auto rounded-pill bg-brand-red px-2 py-1 text-12 text-on-dark">
            头条
          </span>
        </div>

        <div className="mt-4 flex h-32 items-center justify-center rounded-12 bg-cat-blue-soft text-24 text-cat-blue">
          AI × MRI
        </div>

        <h2 className="mt-4 font-serif text-24 font-medium leading-display-tight text-foreground">
          多机构发布医学影像基础模型评测框架
        </h2>
        <p className="mt-3 text-14 leading-paragraph text-subtle">
          评测覆盖跨设备泛化、少样本适配与临床安全性，并公开数据范围与失效边界。
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-12">
          <span className="rounded-pill bg-surface-2 px-2 py-1 text-subtle">
            快讯
          </span>
          <span className="truncate text-subtle">来源 · Nature Medicine</span>
          <span className="inline-flex items-center gap-1 text-faint">
            <Flame className="size-3.5" />
            1.8 万
          </span>
          <span className="inline-flex items-center gap-1 rounded-pill bg-danger-soft px-2 py-1 text-brand-red">
            <TrendingUp className="size-3" />
            飙升
          </span>
        </div>

        <span className="mt-4 ml-auto inline-flex items-center gap-1 text-12 text-faint">
          全文
          <ChevronRight className="size-3" />
        </span>
      </article>
    </div>
  );
}
