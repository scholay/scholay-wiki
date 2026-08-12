import { Coins, CreditCard, QrCode } from "lucide-react";

const AMOUNTS = [30, 50, 100, 200, 500, 1000] as const;

/**
 * 科研经费充值 · 纯样式 fixture。
 * 来源：product-mock settings/components/billing-panels.tsx::RechargePanel；数字为示例。
 */
export function WikiEmbedWalletRecharge() {
  return (
    <div
      className="grid w-[min(100%,48rem)] gap-4 md:grid-cols-[minmax(0,1fr)_16rem]"
      aria-hidden
      data-wiki-fixture="wallet-recharge"
    >
      <div className="space-y-4">
        <section className="rounded-12 border border-border bg-surface-card p-4 md:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-14 font-medium text-foreground">选择充值金额</p>
            <span className="text-12 text-faint">
              示例费率 · 1 元 = 100 经费
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {AMOUNTS.map((amount) => {
              const active = amount === 100;
              return (
                <div
                  key={amount}
                  className={`rounded-8 border p-3 ${
                    active
                      ? "border-brand-red bg-brand-red-soft"
                      : "border-border bg-surface-card"
                  }`}
                >
                  <p
                    className={`text-14 font-medium tabular-nums ${
                      active ? "text-brand-red" : "text-foreground"
                    }`}
                  >
                    ¥{amount}
                  </p>
                  <p className="mt-1 text-12 text-faint">
                    到账 {amount * 100} 经费
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex h-10 items-center gap-2 rounded-8 border border-border bg-surface-1 px-3">
            <Coins className="size-4 text-faint" />
            <span className="min-w-0 flex-1 text-12 text-faint">
              输入其他金额
            </span>
            <span className="text-12 text-faint">最低 10 元</span>
          </div>
        </section>

        <section className="rounded-12 border border-border bg-surface-card p-4 md:p-6">
          <p className="mb-3 text-14 font-medium text-foreground">支付方式</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-8 border border-brand-red bg-brand-red-soft p-3">
              <QrCode className="size-5 text-brand-red" />
              <div className="min-w-0 flex-1">
                <p className="text-12 font-medium text-foreground">微信支付</p>
                <p className="truncate text-12 text-faint">
                  推荐使用微信扫码支付
                </p>
              </div>
              <span className="size-3 rounded-pill bg-brand-red" />
            </div>
            <div className="flex items-center gap-3 rounded-8 border border-border p-3">
              <CreditCard className="size-5 text-faint" />
              <div>
                <p className="text-12 font-medium text-foreground">支付宝</p>
                <p className="text-12 text-faint">余额或银行卡</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside className="rounded-12 border border-border bg-surface-card p-4 md:p-6">
        <p className="text-14 font-medium text-foreground">订单详情</p>
        <div className="mt-3 space-y-2">
          <DetailRow label="充值金额" value="¥100.00" />
          <DetailRow label="到账经费" value="10000 经费" />
          <DetailRow label="支付方式" value="微信支付" />
        </div>
        <div className="my-4 h-px bg-border" />
        <div className="flex items-end justify-between gap-3">
          <span className="text-12 text-faint">实付金额</span>
          <span className="text-24 font-medium tabular-nums text-brand-red">
            ¥100.00
          </span>
        </div>
        <div className="mt-3 rounded-8 bg-brand-amber-soft p-3 text-12 text-brand-amber">
          100 元到账 10000 经费
        </div>
        <span className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-8 bg-brand-red text-14 font-medium text-on-dark">
          立即充值
        </span>
        <p className="mt-3 text-12 leading-paragraph text-faint">
          经费用于额度外按量继续使用，不能购买额度重置；实际费率与最低金额以账户页为准。
        </p>
      </aside>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-12">
      <span className="text-faint">{label}</span>
      <span className="tabular-nums text-subtle">{value}</span>
    </div>
  );
}
