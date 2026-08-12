import { Check, X } from "lucide-react";
import { PayMethodLogo } from "@/shared/components/PayMethodLogo";
import { ScholayMark } from "@/shared/components/brand/ScholayMark";

const BENEFITS = [
  "AI 额度是 Pro 的 5 倍",
  "每周约够 15 份完整审稿、150 轮对话",
  "最强 AI 模型",
  "高峰期优先处理",
] as const;

/** MembershipActionDialog 的 Pro 月付 → Max 月付升级态；不混入续费选项。 */
export function WikiEmbedSubscriptionCheckout() {
  return (
    <div
      className="relative w-[min(100%,48rem)] rounded-16 border border-border bg-surface-card p-6 shadow-overlay [--checkout-card-pad:1.25rem]"
      aria-hidden
      data-wiki-fixture="subscription-checkout"
    >
      <span className="absolute right-4 top-4 inline-flex size-6 items-center justify-center rounded-4 text-faint">
        <X className="size-4" />
      </span>
      <div>
        <p className="text-16 font-medium text-foreground">升级会员</p>
        <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
          年付一次付清更省。付款后立刻生效，到期不会自动续费。
        </p>
        <span className="mt-2 inline-flex text-12 text-brand-red">
          看看各档具体差在哪 →
        </span>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 p-1">
          <span className="inline-flex h-8 items-center gap-2 rounded-pill px-4 text-14 font-medium text-muted-foreground">
            年付
            <span className="rounded-pill bg-brand-red/10 px-2 py-1 text-12 font-medium text-brand-red">
              省 16%
            </span>
          </span>
          <span className="inline-flex h-8 items-center rounded-pill bg-surface-card px-4 text-14 font-medium text-foreground shadow-raised">
            月付
          </span>
        </div>
      </div>

      <section className="relative mt-4 overflow-hidden rounded-16 border border-brand-red bg-brand-red-soft p-[var(--checkout-card-pad)]">
        <ScholayMark
          aria-hidden
          className="pointer-events-none absolute -bottom-4 right-0 size-40 opacity-5"
        />

        <div className="relative flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-20 font-medium text-foreground">Max</p>
              <span className="rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-brand">
                最受欢迎
              </span>
            </div>
            <p className="mt-1 text-12 text-faint">
              天天跑审稿、绘图、写作的节奏
            </p>
          </div>
          <span className="flex size-5 shrink-0 items-center justify-center rounded-pill border border-brand-red bg-brand-red text-on-brand">
            <Check className="size-3" strokeWidth={3} />
          </span>
        </div>

        <div className="relative mt-4 flex flex-wrap items-baseline gap-2">
          <span className="font-display text-32 font-bold leading-display-tight tabular-nums text-foreground">
            ¥269
          </span>
          <span className="text-14 text-faint">/月</span>
        </div>
        <p className="relative mt-2 text-12 text-muted-foreground">
          当前周期为月付；升级按剩余时长计算最终补差。
        </p>

        <p className="relative mt-4 text-12 font-medium text-faint">
          包含 Pro 的全部，再加上:
        </p>
        <div className="relative mt-2 grid gap-2 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <span
              key={benefit}
              className="flex items-start gap-2 text-12 leading-paragraph text-subtle"
            >
              <Check
                className="mt-1 size-4 shrink-0 text-brand-green"
                strokeWidth={2.5}
              />
              {benefit}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-6 space-y-2">
        <p className="text-12 text-faint">支付方式</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <PaymentMethod
            method="wechat"
            name="微信支付"
            desc="微信扫码支付"
            active
          />
          <PaymentMethod
            method="alipay"
            name="支付宝"
            desc="支付宝账户余额或银行卡"
          />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-hairline pt-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-12 text-faint">合计</span>
            <span className="font-display text-24 font-bold leading-display-tight tabular-nums text-foreground">
              ¥126.80
            </span>
          </p>
          <p className="mt-1 text-12 text-muted-foreground">
            立即升档 · 到期日不变（2026-09-08） · 只补剩余 18 天的差价
          </p>
        </div>
        <span className="inline-flex h-10 shrink-0 items-center rounded-pill bg-brand-red px-[var(--checkout-card-pad)] text-14 font-medium text-on-brand">
          升级并支付
        </span>
      </div>
    </div>
  );
}

function PaymentMethod({
  method,
  name,
  desc,
  active = false,
}: {
  method: "wechat" | "alipay";
  name: string;
  desc: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-12 border p-3 ${
        active
          ? "border-brand-red bg-brand-red-soft"
          : "border-border bg-surface-card"
      }`}
    >
      <PayMethodLogo method={method} className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-14 font-medium text-foreground">{name}</p>
        <p className="text-12 text-faint">{desc}</p>
      </div>
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-pill border ${
          active
            ? "border-brand-red bg-brand-red text-on-brand"
            : "border-border"
        }`}
      >
        {active ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </div>
  );
}
