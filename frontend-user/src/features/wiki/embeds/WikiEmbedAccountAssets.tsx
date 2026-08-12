import {
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  Gauge,
  Lock,
  Sparkles,
} from "lucide-react";

/**
 * AccountAssetsCard 的 Pro 月付代表态。
 * 数值被冻结用于说明布局；升级与续费保持为两个不同层级的入口。
 */
export function WikiEmbedAccountAssets() {
  return (
    <section
      className="w-[min(100%,48rem)] rounded-16 border border-border bg-surface-card p-[var(--account-card-pad)] [--account-card-pad:1.25rem]"
      aria-hidden
      data-wiki-fixture="account-assets"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-14 font-medium text-foreground">账户资产</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-12 text-faint">Pro · 有效期至 2026-09-08</span>
          <span className="text-12 text-muted-foreground underline underline-offset-2">
            续费
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-brand-red px-3 text-12 font-medium text-on-brand">
            <Sparkles className="size-3" />
            升级套餐
          </span>
        </div>
      </div>

      <div className="flex items-stretch gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-7 shrink-0 items-center rounded-6 border border-brand-amber/25 bg-brand-amber/10 px-3 text-12 font-medium text-brand-amber">
              PRO 会员
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
              <div className="h-full w-2/3 rounded-pill bg-brand-green" />
            </div>
            <span className="w-20 shrink-0 text-right text-14 font-medium tabular-nums text-muted-foreground">
              剩余 68%
            </span>
          </div>

          <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 truncate text-12 text-faint">
              3 天后自动回满
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-12 text-faint">
                可用 2 次 · 9 月 30 日前有效
              </span>
              <span className="inline-flex h-7 items-center rounded-8 border border-border px-3 text-12 font-medium text-faint">
                重置
              </span>
            </div>
          </div>
        </div>

        <div className="h-10 w-px shrink-0 bg-border" />

        <div className="flex w-36 shrink-0 items-center justify-center gap-2">
          <Coins className="size-4 shrink-0 text-faint" />
          <span className="text-20 font-medium leading-display-tight tabular-nums text-foreground">
            36.75
          </span>
          <span className="text-12 text-faint">经费</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-12 border border-border-soft bg-surface-1 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-faint">
          <Coins className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-14 font-medium text-foreground">用经费继续</p>
          <p className="text-12 text-faint">
            额度用完后，仅对超出部分按量扣除经费
          </p>
        </div>
        <span className="inline-flex h-6 w-10 shrink-0 items-center rounded-pill bg-brand-green p-1">
          <span className="ml-auto size-4 rounded-pill bg-surface-card shadow-raised" />
        </span>
      </div>

      <div className="my-3 h-px bg-border-soft" />

      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-4 bg-brand-red/10 text-brand-red">
          <Crown className="size-3" />
        </span>
        <span className="shrink-0 text-12 font-medium text-faint">
          Max 额度
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
          <div className="h-full w-full rounded-pill bg-brand-red/70" />
        </div>
        <span className="shrink-0 text-12 font-medium tabular-nums text-brand-red">
          5× 当前额度
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-brand-red/40 px-2 py-1 text-12 font-medium text-brand-red">
          <Lock className="size-3" /> 升级解锁
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-12 border border-border-soft bg-surface-1 p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-faint">
          <Gauge className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-14 font-medium text-foreground">经费怎么用</p>
          <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
            充值到账后长期保留；开启“用经费继续”，只扣额度外实际使用的部分。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-12 tabular-nums text-faint">4/4</span>
          <span className="flex size-6 items-center justify-center rounded-8 border border-border text-faint">
            <ChevronLeft className="size-3" />
          </span>
          <span className="flex size-6 items-center justify-center rounded-8 border border-border text-faint">
            <ChevronRight className="size-3" />
          </span>
        </div>
      </div>
    </section>
  );
}
