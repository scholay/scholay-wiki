import {
  BookMarked,
  ChevronRight,
  CreditCard,
  Crown,
  Gem,
  Ticket,
  Wallet,
  X,
} from "lucide-react";
import { PayMethodLogo } from "@/shared/components/PayMethodLogo";

const PLANS = [
  {
    icon: Gem,
    tone: "text-brand-green",
    tier: "Pro",
    position: "轻量检索与日常写作 · 20× 于 Free 额度",
    action: "renew",
    monthly: "49",
    yearly: "590",
  },
  {
    icon: Crown,
    tone: "text-brand-red",
    tier: "Max",
    position: "高频科研主力 · 5× 于 Pro 额度",
    action: "upgrade",
    monthly: "1,150.68",
    yearly: "",
  },
] as const;

/** MobileMembershipDialog 的 Pro 年付在期冻结态。 */
export function WikiEmbedMobileMembershipPurchase() {
  return (
    <div
      className="relative flex w-[min(100%,24rem)] flex-col overflow-hidden bg-surface-1"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-membership-purchase"
    >
      <div className="flex flex-1 flex-col gap-3 p-3 opacity-70">
        <div className="flex items-center gap-3 rounded-16 border border-border bg-surface-card p-4">
          <span className="flex size-14 items-center justify-center rounded-pill bg-foreground text-20 font-medium text-on-dark">
            研
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-16 font-medium text-foreground">
              示例研究者
            </span>
            <span className="block text-12 text-faint">
              researcher@university.edu
            </span>
          </span>
          <ChevronRight className="size-4 text-faint" />
        </div>
        <div className="flex h-12 items-center gap-3 rounded-16 border border-border bg-surface-card px-4">
          <BookMarked className="size-4 text-muted-foreground" />
          <span className="flex-1 text-14 text-foreground">我的文件夹</span>
          <ChevronRight className="size-4 text-faint" />
        </div>
        <div className="overflow-hidden rounded-16 border border-border bg-surface-card">
          <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
            <span className="rounded-pill bg-brand-green px-3 py-1 text-12 font-medium text-on-brand">
              Pro
            </span>
            <span className="text-12 text-faint">2027/8/12 到期</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <Wallet className="size-4 text-brand-amber" />
            <span className="text-14 text-foreground">经费 2,400</span>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-2" />
      <section className="absolute left-1/2 top-1/2 grid max-h-[90%] w-full -translate-x-1/2 -translate-y-1/2 gap-4 overflow-hidden border border-border bg-surface-card p-6 shadow-overlay">
        <span className="absolute right-4 top-4 text-muted-foreground">
          <X className="size-4" />
        </span>

        <header className="flex flex-col gap-2 pr-6">
          <h2 className="text-16 font-medium text-foreground">开通会员</h2>
          <p className="text-12 text-muted-foreground">
            会员享更高 AI 额度与全部高级功能。
          </p>
        </header>

        <section className="rounded-12 border border-border p-4">
          <div className="mb-2 flex items-center gap-2 text-14 font-medium text-foreground">
            <Ticket className="size-4 text-brand-green" />
            用兑换码开通会员
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 min-w-0 flex-1 items-center rounded-8 border border-border px-3 text-12 text-faint">
              输入会员兑换码
            </span>
            <span className="flex h-9 items-center rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark opacity-40">
              兑换
            </span>
          </div>
          <p className="mt-2 text-12 text-faint">
            兑换码可来自活动赠送 / 机构发放 / 合作渠道，兑换后立即生效。
          </p>
        </section>

        <section className="rounded-12 border border-border p-4">
          <div className="mb-2 flex items-center gap-2 text-14 font-medium text-foreground">
            <CreditCard className="size-4 text-muted-foreground" />
            在线付款开通
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <PaymentMethod method="wechat" label="微信支付" selected />
              <PaymentMethod method="alipay" label="支付宝" />
            </div>

            <div className="flex flex-col gap-1 pb-1">
              {PLANS.map((plan) => (
                <p key={plan.tier} className="text-12 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {plan.tier}
                  </span>
                  {` · ${plan.position}`}
                </p>
              ))}
            </div>

            <div className="flex justify-center pb-1">
              <div className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 p-1">
                <span className="flex h-8 items-center gap-2 rounded-pill bg-surface-card px-4 text-14 font-medium text-foreground shadow-raised">
                  年付
                  <span className="rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-brand">
                    省 17%
                  </span>
                </span>
                <span className="flex h-8 items-center rounded-pill px-4 text-12 font-medium text-faint">
                  月付不可选
                </span>
              </div>
            </div>

            {PLANS.map((plan) => (
              <PlanRow key={plan.tier} {...plan} />
            ))}

            <p className="text-12 leading-paragraph text-faint">
              将打开微信完成付款，开通后回到本页自动更新。
            </p>
          </div>
        </section>

        <span className="mx-auto text-12 text-muted-foreground underline">
          查看完整权益对比 →
        </span>
      </section>
    </div>
  );
}

function PaymentMethod({
  method,
  label,
  selected = false,
}: {
  method: "wechat" | "alipay";
  label: string;
  selected?: boolean;
}) {
  return (
    <span
      className={`flex min-h-8 flex-1 items-center justify-center gap-1 rounded-8 border text-12 ${selected ? "border-brand-red bg-danger-soft text-brand-red" : "border-border text-muted-foreground"}`}
    >
      <PayMethodLogo method={method} className="size-4" />
      {label}
    </span>
  );
}

function PlanRow({
  icon: Icon,
  tone,
  tier,
  action,
  monthly,
  yearly,
}: (typeof PLANS)[number]) {
  return (
    <div
      className="flex min-h-11 items-center justify-between rounded-8 border border-border px-3"
      style={{ paddingBlock: 10 }}
    >
      <span className="flex items-center gap-2 text-14 font-medium text-foreground">
        <Icon className={`size-4 ${tone}`} />
        {tier} {action === "upgrade" ? "升级补差" : "年度会员"}
      </span>
      <span className="flex items-center gap-2">
        <span className="flex flex-col items-end">
          <span className="text-14 font-medium text-foreground">
            ¥{monthly}
            {action === "renew" ? (
              <span className="text-12 font-normal text-faint">/月</span>
            ) : null}
          </span>
          <span className="text-12 text-faint">
            {action === "upgrade"
              ? "剩余 200 天补差 · 到期日不变"
              : `按年付 ¥${yearly}`}
          </span>
        </span>
        <ChevronRight className="size-4 text-faint" />
      </span>
    </div>
  );
}
