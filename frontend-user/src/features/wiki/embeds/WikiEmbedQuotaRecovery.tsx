import { Info, RefreshCw, TrendingUp, Zap } from "lucide-react";

/** AI 额度耗尽与恢复入口 · 纯样式 fixture。数字仅为界面示例。 */
export function WikiEmbedQuotaRecovery() {
  return (
    <div
      className="w-[min(100%,36rem)] overflow-hidden rounded-12 border border-brand-amber/30 bg-warning-soft"
      aria-hidden
      data-wiki-fixture="quota-recovery"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-brand-amber/20 px-3 py-2">
        <RefreshCw className="size-3 text-brand-amber" />
        <p className="min-w-0 flex-1 text-12 text-foreground">
          重置次数还剩 <span className="font-medium">2</span> 次 · 用 1
          次立即恢复满额，不扣经费
        </p>
        <span className="inline-flex h-7 items-center rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
          立即恢复
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3 py-3">
        <div className="flex items-start gap-2">
          <Info className="mt-1 size-4 shrink-0 text-brand-amber" />
          <div>
            <p className="text-14 font-medium text-foreground">
              本周期用量已达上限
            </p>
            <p className="text-12 text-muted-foreground">
              额度将于 8 月 16 日 09:30 恢复
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-6">
          <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-brand-red px-3 text-12 font-medium text-on-dark">
            <TrendingUp className="size-3" />
            升级 Max
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle">
            <Zap className="size-3" />
            用经费继续
          </span>
        </div>
      </div>
    </div>
  );
}
