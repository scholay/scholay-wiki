import { Info, RefreshCw, TrendingUp, X, Zap } from "lucide-react";

/** QuotaComposerStrip 的 Pro 耗尽态：Reset Pass 与付费恢复路径分区呈现。 */
export function WikiEmbedQuotaRecovery() {
  return (
    <div
      className="w-[min(100%,40rem)] overflow-hidden rounded-12 border border-brand-amber/30 bg-warning-soft"
      aria-hidden
      data-wiki-fixture="quota-recovery"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-brand-amber/20 px-3 py-2">
        <RefreshCw className="size-4 shrink-0 text-brand-amber" />
        <p className="min-w-0 flex-1 text-12 text-foreground">
          重置次数还剩 <span className="font-medium">2</span> 次 · 用 1
          次立即恢复满额，不扣经费
        </p>
        <span className="inline-flex h-7 items-center rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
          立即恢复
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3 py-2">
        <div className="flex items-start gap-2">
          <Info className="mt-1 size-4 shrink-0 text-brand-amber" />
          <div className="min-w-0 flex-1">
            <p className="text-14 font-medium text-foreground">
              本周期用量已达上限
            </p>
            <p className="text-12 text-muted-foreground">
              额度将于 8 月 16 日 09:30 恢复
            </p>
          </div>
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-4 text-faint">
            <X className="size-4" />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-brand-red px-3 text-12 font-medium text-on-brand">
            <TrendingUp className="size-4" />
            升级 Max
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle">
            <Zap className="size-4" />
            用经费继续
          </span>
        </div>
      </div>
    </div>
  );
}
