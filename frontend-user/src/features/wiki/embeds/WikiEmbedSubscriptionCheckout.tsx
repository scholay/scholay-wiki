import { Check, CreditCard, Gem, QrCode, ShieldCheck } from "lucide-react";

/**
 * 会员订阅 / 升级结算 · 纯样式 fixture。
 * 来源：product-mock shared/components/subscribe-dialog.tsx；金额与到期日均为示例报价。
 */
export function WikiEmbedSubscriptionCheckout() {
  return (
    <div
      className="w-[min(100%,46rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="subscription-checkout"
    >
      <div className="border-b border-border px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-16 font-medium text-foreground">升级会员</p>
            <p className="mt-1 text-12 text-muted-foreground">
              当前 Pro 月付 · 选择 Max 月付或年付，不支持降级
            </p>
          </div>
          <div className="flex rounded-8 bg-surface-1 p-1 text-12">
            <span className="inline-flex h-8 items-center rounded-4 bg-surface-card px-3 font-medium text-foreground">
              月付
            </span>
            <span className="inline-flex h-8 items-center rounded-4 px-3 text-muted-foreground">
              年付
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-4 py-6 md:px-6">
        <section className="rounded-8 border-2 border-brand-red bg-brand-red-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-8 bg-surface-card text-brand-red">
                <Gem className="size-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-14 font-medium text-foreground">
                    Max 升级
                  </p>
                  <span className="rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-dark">
                    已选择
                  </span>
                </div>
                <p className="mt-1 text-12 text-muted-foreground">
                  剩余 18 天补差 · 立即生效 · 到期日不变
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-20 font-medium tabular-nums text-brand-red">
                ¥126.80
              </p>
              <p className="text-12 text-faint">示例报价</p>
            </div>
          </div>
        </section>

        <section>
          <p className="mb-2 text-12 font-medium text-foreground">支付方式</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <PaymentMethod
              icon={QrCode}
              name="微信支付"
              desc="微信扫码支付"
              active
            />
            <PaymentMethod
              icon={CreditCard}
              name="支付宝"
              desc="余额或银行卡"
            />
            <PaymentMethod
              icon={ShieldCheck}
              name="测试支付"
              desc="仅开发环境"
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-12 text-faint">补差价</span>
              <span className="text-20 font-medium tabular-nums text-brand-red">
                ¥126.80
              </span>
            </div>
            <p className="mt-1 text-12 text-faint">
              示例报价 · 周期与到期日沿用当前订阅
            </p>
          </div>
          <span className="inline-flex h-10 items-center gap-2 rounded-8 bg-brand-red px-4 text-14 font-medium text-on-dark">
            <Check className="size-4" /> 升级并补差价
          </span>
        </div>
      </div>
    </div>
  );
}

function PaymentMethod({
  icon: Icon,
  name,
  desc,
  active = false,
}: {
  icon: typeof CreditCard;
  name: string;
  desc: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-8 border p-3 ${
        active
          ? "border-brand-red bg-brand-red-soft"
          : "border-border bg-surface-card"
      }`}
    >
      <Icon
        className={`size-5 shrink-0 ${active ? "text-brand-red" : "text-faint"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-12 font-medium text-foreground">{name}</p>
        <p className="truncate text-12 text-faint">{desc}</p>
      </div>
      <span
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded-pill border ${
          active ? "border-brand-red" : "border-border"
        }`}
      >
        {active ? <span className="size-2 rounded-pill bg-brand-red" /> : null}
      </span>
    </div>
  );
}
