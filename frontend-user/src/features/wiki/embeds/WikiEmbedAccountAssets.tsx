import {
  Coins,
  Crown,
  Gem,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";

/**
 * 账户资产卡 · 纯样式 fixture。
 * 来源：product-mock settings/components/account-assets-card.tsx。
 * 数字仅用于说明界面组成，不代表访问者的实时额度或经费。
 */
export function WikiEmbedAccountAssets() {
  return (
    <div
      className="w-[min(100%,42rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="account-assets"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-16 font-medium text-foreground">账户资产</p>
          <p className="mt-1 text-12 text-faint">
            示例数据 · 实际数值以账户页面为准
          </p>
        </div>
        <span className="inline-flex h-8 items-center gap-1 rounded-8 bg-brand-red px-3 text-12 font-medium text-on-dark">
          <Sparkles className="size-3" />
          升级会员
        </span>
      </div>

      <div className="mt-4 rounded-8 border border-border bg-surface-1 p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-4 border border-border bg-surface-card px-2 text-12 font-medium text-subtle">
              FREE
            </span>
            <span className="shrink-0 text-12 text-subtle">剩余额度</span>
            <div className="h-2 min-w-16 flex-1 overflow-hidden rounded-pill bg-surface-3">
              <div className="h-full w-3/4 rounded-pill bg-brand-green" />
            </div>
            <span className="text-12 tabular-nums text-faint">75%</span>
            <span className="inline-flex size-8 items-center justify-center rounded-8 border border-border text-faint">
              <RefreshCw className="size-3" />
            </span>
          </div>

          <div className="hidden h-10 w-px bg-border md:block" />

          <div className="flex shrink-0 items-center gap-2 md:w-36">
            <Coins className="size-4 text-brand-amber" />
            <span className="text-20 font-medium tabular-nums text-foreground">
              36
            </span>
            <span className="text-12 text-faint">经费</span>
          </div>
        </div>

        <div className="my-3 h-px bg-border" />

        <div className="flex flex-wrap items-center gap-3 text-12">
          <span className="inline-flex items-center gap-2 text-subtle">
            <RotateCcw className="size-3 text-brand-green" />
            重置次数 <span className="font-medium text-foreground">2</span>
          </span>
          <span className="text-faint">2 次将于 9 月 30 日前有效</span>
          <span className="ml-auto inline-flex items-center gap-2 text-subtle">
            <Zap className="size-3" />
            用经费继续
            <span className="inline-flex h-6 w-10 items-center rounded-pill bg-brand-green p-1">
              <span className="ml-auto size-4 rounded-pill bg-surface-card" />
            </span>
          </span>
        </div>

        <div className="my-3 h-px bg-border" />

        <div className="space-y-2">
          {[
            { name: "Pro 额度", Icon: Gem, tone: "text-brand-amber" },
            { name: "Max 额度", Icon: Crown, tone: "text-brand-red" },
          ].map(({ name, Icon, tone }) => (
            <div key={name} className="flex items-center gap-2">
              <span className="inline-flex size-6 items-center justify-center rounded-4 bg-surface-2">
                <Icon className={`size-3 ${tone}`} />
              </span>
              <span className="shrink-0 text-12 text-faint">{name}</span>
              <div className="h-2 flex-1 rounded-pill bg-surface-3" />
              <span className="rounded-pill border border-brand-red/40 px-2 py-1 text-12 font-medium text-brand-red">
                升级解锁
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
