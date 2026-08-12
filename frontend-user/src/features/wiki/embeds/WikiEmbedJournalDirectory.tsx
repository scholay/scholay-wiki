import { BookOpen, Globe, Layers, Unlock } from "lucide-react";

const KPIS = [
  { label: "总期刊", value: "26,481", icon: BookOpen, tone: "red" },
  { label: "开放获取", value: "8,906", icon: Unlock, tone: "green" },
  { label: "覆盖国家", value: "126", icon: Globe, tone: "amber" },
  { label: "数据源", value: "9", icon: Layers, tone: "ink" },
] as const;

const RANKINGS = [
  ["SCI 一区", "JCR Q1 · 6,214 本期刊"],
  ["中科院一区", "基础版 1 区 · 1,382 本期刊"],
  ["CCF A 类", "计算机领域 · 87 本期刊"],
  ["高影响因子", "IF ≥ 10 · 642 本期刊"],
] as const;

/**
 * 期刊榜单与分类目录 · 纯样式 fixture。
 * 对齐 product-mock JournalExploreOverview + JournalCollectionPage。
 */
export function WikiEmbedJournalDirectory() {
  return (
    <section
      className="w-[min(100%,48rem)] rounded-16 border border-border bg-surface-card p-6"
      aria-hidden
      data-wiki-fixture="journal-directory"
    >
      <header>
        <p className="text-12 font-medium text-faint">期刊榜单</p>
        <h2 className="mt-1 font-display text-24 font-medium leading-display text-foreground">
          从评价体系进入期刊目录
        </h2>
        <p className="mt-2 max-w-2xl text-14 leading-paragraph text-muted-foreground">
          榜单是带预设筛选的入口；进入后仍可继续核对学科、出版方和投稿信息。
        </p>
      </header>

      <div
        className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4"
        data-wiki-spot="期刊概览"
      >
        {KPIS.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-12 border border-border p-3">
            <span
              className={
                tone === "red"
                  ? "flex size-7 items-center justify-center rounded-8 bg-brand-red-soft text-brand-red"
                  : tone === "green"
                    ? "flex size-7 items-center justify-center rounded-8 bg-brand-green-soft text-brand-green"
                    : tone === "amber"
                      ? "flex size-7 items-center justify-center rounded-8 bg-brand-amber-soft text-brand-amber"
                      : "flex size-7 items-center justify-center rounded-8 bg-surface-2 text-subtle"
              }
            >
              <Icon className="size-4" />
            </span>
            <p className="mt-3 font-display text-20 font-medium tabular-nums text-foreground">
              {value}
            </p>
            <p className="mt-1 text-12 text-faint">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {RANKINGS.map(([title, detail], index) => (
          <div
            key={title}
            className="flex items-center gap-3 rounded-12 border border-border p-4"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-1 font-display text-16 font-medium text-foreground">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-14 font-medium text-foreground">{title}</p>
              <p className="mt-1 truncate text-12 text-faint">{detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Distribution
          title="JCR 分区分布"
          values={["Q1  31%", "Q2  27%", "Q3  24%", "Q4  18%"]}
        />
        <Distribution
          title="中科院分区分布"
          values={["1 区  12%", "2 区  22%", "3 区  34%", "4 区  32%"]}
        />
      </div>
    </section>
  );
}

function Distribution({
  title,
  values,
}: {
  title: string;
  values: readonly string[];
}) {
  return (
    <div className="rounded-12 border border-border bg-surface-1 p-4">
      <h3 className="text-12 font-medium text-faint">{title}</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-8 bg-surface-card px-3 py-2 text-12 text-subtle"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
