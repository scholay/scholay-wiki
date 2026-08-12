import { Coins } from "lucide-react";
import { PayMethodLogo } from "@/shared/components/PayMethodLogo";

const AMOUNTS = [20, 50, 100, 500, 1000] as const;

/** RechargePanel 的 ¥100 + 微信支付代表态；费率和最低金额只作界面示例。 */
export function WikiEmbedWalletRecharge() {
  return (
    <div
      className="flex w-[min(100%,52rem)] flex-col gap-4 [--recharge-card-pad:1.25rem] md:flex-row md:items-start"
      aria-hidden
      data-wiki-fixture="wallet-recharge"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <section className="rounded-16 border border-border bg-surface-card p-[var(--recharge-card-pad)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-14 font-medium text-foreground">
              选择充值金额
            </h3>
            <span className="text-12 text-faint">1 元 = 100 经费</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {AMOUNTS.map((amount) => (
              <AmountCard
                key={amount}
                amount={amount}
                active={amount === 100}
              />
            ))}
            <div className="flex flex-col rounded-12 border border-border p-3 text-left">
              <span className="text-14 font-medium text-foreground">
                自定义金额
              </span>
              <span className="mt-1 text-12 text-faint">输入充值金额</span>
            </div>
          </div>
        </section>

        <section className="rounded-16 border border-border bg-surface-card p-[var(--recharge-card-pad)]">
          <h3 className="mb-3 text-14 font-medium text-foreground">支付方式</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <PaymentCard
              method="wechat"
              name="微信支付"
              desc="微信扫码支付"
              active
            />
            <PaymentCard
              method="alipay"
              name="支付宝"
              desc="支付宝账户余额或银行卡"
            />
          </div>
        </section>
      </div>

      <aside className="rounded-16 border border-border bg-surface-card p-[var(--recharge-card-pad)] md:w-64 md:shrink-0">
        <h3 className="mb-3 text-14 font-medium text-foreground">订单详情</h3>
        <DetailRow label="充值金额" value="¥100.00" />
        <DetailRow label="到账经费" value="10000 经费" />
        <DetailRow label="支付方式" value="微信支付" />

        <div className="my-3 h-px bg-border-soft" />

        <div className="flex items-center justify-between gap-3">
          <span className="text-12 text-faint">实付金额</span>
          <span className="flex items-center gap-1 text-24 font-medium tabular-nums text-brand-red">
            <Coins className="size-4" />
            100.00
          </span>
        </div>

        <div className="my-3 flex items-center gap-2 rounded-8 bg-prism-badge-bg px-3 py-2 text-12 text-prism-badge-fg">
          <Coins className="size-4" />
          100 元到账 10000 经费
        </div>

        <span className="inline-flex h-10 w-full items-center justify-center rounded-8 bg-brand-red text-14 font-medium text-on-brand">
          立即充值
        </span>
        <p className="mt-3 text-12 leading-paragraph text-faint">
          充多少用多少；开启“用经费继续”后，额度用完还能按量续用。
        </p>
      </aside>
    </div>
  );
}

function AmountCard({ amount, active }: { amount: number; active: boolean }) {
  return (
    <div
      className={`flex flex-col rounded-12 border p-3 text-left ${
        active
          ? "border-brand-red bg-danger-soft"
          : "border-border bg-surface-card"
      }`}
    >
      <span
        className={`text-14 font-medium tabular-nums ${
          active ? "text-brand-red" : "text-foreground"
        }`}
      >
        ¥{amount}
      </span>
      <span className="mt-1 text-12 text-faint">到账 {amount * 100} 经费</span>
    </div>
  );
}

function PaymentCard({
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
      className={`flex items-center gap-2 rounded-12 border p-3 ${
        active ? "border-brand-red bg-danger-soft" : "border-border"
      }`}
    >
      <PayMethodLogo method={method} className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-14 font-medium text-foreground">{name}</p>
        <p className="truncate text-12 text-faint">{desc}</p>
      </div>
      <span
        className={`size-4 shrink-0 rounded-pill border-2 ${
          active ? "border-brand-red bg-brand-red" : "border-border"
        }`}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-12">
      <span className="text-faint">{label}</span>
      <span className="tabular-nums text-subtle">{value}</span>
    </div>
  );
}
