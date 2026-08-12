import { Check, Ticket } from "lucide-react";

/** 礼品码先预览、后确认 · 纯样式 fixture。 */
export function WikiEmbedRedeemPreview() {
  return (
    <div
      className="w-[min(100%,28rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="redeem-preview"
    >
      <span className="block h-1 w-full bg-cat-blue" />
      <div className="p-4 md:p-6">
        <span className="inline-flex items-center gap-1 text-12 font-medium text-brand-red">
          <Ticket className="size-3" />
          礼品码兑换
        </span>
        <p className="mt-2 text-18 font-serif leading-serif text-foreground">
          确认兑换权益？
        </p>
        <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
          系统会先展示将授予的内容，确认后才真正兑换。
        </p>

        <div className="mt-4 space-y-3 rounded-8 border border-border bg-surface-1 p-4">
          <div className="flex items-center justify-between gap-3 text-12">
            <span className="text-muted-foreground">兑换内容</span>
            <span className="font-medium text-foreground">示例会员权益</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-12">
            <span className="text-muted-foreground">生效方式</span>
            <span className="font-medium text-foreground">确认后立即生效</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-12">
            <span className="text-muted-foreground">兑换限制</span>
            <span className="text-right font-medium text-foreground">
              每账号对本码限 1 次
            </span>
          </div>
        </div>

        <p className="mt-3 text-12 leading-paragraph text-faint">
          单码可配置多人使用的总次数；不是第一位用户兑换后就全局失效。
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <span className="inline-flex h-control-md items-center rounded-8 border border-border px-3 text-12 text-subtle">
            取消
          </span>
          <span className="inline-flex h-control-md items-center gap-2 rounded-8 bg-brand-red px-3 text-12 font-medium text-on-dark">
            <Check className="size-3" />
            确认兑换
          </span>
        </div>
      </div>
    </div>
  );
}
