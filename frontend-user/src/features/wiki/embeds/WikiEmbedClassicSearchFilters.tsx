import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const SOURCES = ["综合", "Graph", "Discovery", "Medicine"] as const;
const TIME_OPTIONS = ["不限", "近 1 年", "近 3 年", "近 5 年"] as const;

/**
 * 传统搜索筛选面板 · 纯样式 fixture。
 * 对齐 product-mock SearchFiltersPanel(popover 展开态)。
 */
export function WikiEmbedClassicSearchFilters() {
  return (
    <div
      className="w-[min(100%,20rem)] overflow-hidden rounded-8 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="classic-search-filters"
    >
      <div className="flex items-center justify-end border-b border-border px-2 py-1">
        <span className="inline-flex size-7 items-center justify-center rounded-4 text-subtle">
          <X className="size-4" />
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="text-14 font-medium text-foreground">筛选器</span>
      </div>

      <div className="max-h-[min(60dvh,520px)] overflow-y-auto py-1">
        <FilterGroupLabel label="数据源" />
        <div className="flex flex-col pb-1">
          {SOURCES.map((label) => {
            const active = label === "综合";
            return (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5",
                  active && "bg-foreground/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-pill border",
                    active
                      ? "border-brand-red bg-brand-red"
                      : "border-border bg-surface-card",
                  )}
                >
                  {active ? (
                    <span className="size-1.5 rounded-pill bg-on-dark" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-14",
                    active ? "font-medium text-foreground" : "text-subtle",
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <FilterGroupLabel label="发表时间" />
        <div className="flex flex-col pb-1">
          {TIME_OPTIONS.map((label) => {
            const active = label === "不限";
            return (
              <div key={label} className="flex h-6 items-center gap-2 px-4">
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-pill border",
                    active
                      ? "border-brand-red bg-brand-red"
                      : "border-border bg-surface-card",
                  )}
                >
                  {active ? (
                    <span className="size-1.5 rounded-pill bg-on-dark" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-14",
                    active ? "font-medium text-foreground" : "text-subtle",
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <FilterGroupLabel label="学科领域" collapsed />
        <FilterGroupLabel label="文献类型" collapsed />

        <FilterGroupLabel label="开放获取" />
        <div className="flex h-6 items-center gap-2 px-4 pb-2">
          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-4 border border-border bg-surface-card">
            <Check className="size-3 opacity-0" />
          </span>
          <span className="min-w-0 flex-1 truncate text-14 text-subtle">
            仅显示开放获取论文
          </span>
        </div>
      </div>
    </div>
  );
}

function FilterGroupLabel({
  label,
  collapsed = false,
}: {
  label: string;
  collapsed?: boolean;
}) {
  return (
    <div className="flex h-6 items-center justify-between gap-2 px-4 pb-1 pt-1">
      <span className="text-12 font-medium uppercase text-faint">{label}</span>
      <ChevronDown
        className={cn("size-3 text-subtle", collapsed && "-rotate-90")}
      />
    </div>
  );
}
