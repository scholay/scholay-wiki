import { Download, ReceiptText } from "lucide-react";

const ORDERS = [
  {
    time: "2026-08-08 14:20",
    type: "订阅",
    tone: "bg-brand-green-soft text-brand-green",
    desc: "Pro 月度会员",
    amount: "¥59.00",
  },
  {
    time: "2026-07-21 09:10",
    type: "充值",
    tone: "bg-brand-amber-soft text-brand-amber",
    desc: "科研经费充值",
    amount: "¥100.00",
  },
  {
    time: "2026-07-08 14:16",
    type: "订阅",
    tone: "bg-brand-green-soft text-brand-green",
    desc: "Pro 月度会员",
    amount: "¥59.00",
  },
] as const;

/**
 * 用户订单明细 · 纯样式 fixture。
 * 来源：product-mock settings/components/billing-panels.tsx::OrdersTable；行数据为示例。
 */
export function WikiEmbedBillingOrders() {
  return (
    <div
      className="w-[min(100%,44rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="billing-orders"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="size-4 text-subtle" />
          <div>
            <p className="text-14 font-medium text-foreground">订单明细</p>
            <p className="text-12 text-faint">示例订单 · 支持订阅 / 充值筛选</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-12">
          <span className="rounded-8 bg-foreground px-3 py-2 text-on-dark">
            全部
          </span>
          <span className="rounded-8 bg-surface-1 px-3 py-2 text-subtle">
            订阅
          </span>
          <span className="rounded-8 bg-surface-1 px-3 py-2 text-subtle">
            充值
          </span>
          <span className="inline-flex items-center gap-1 rounded-8 border border-border px-3 py-2 text-subtle">
            <Download className="size-3" /> 导出
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-8 border border-border">
        <div className="grid grid-cols-[1.2fr_0.6fr_1.4fr] border-b border-border bg-surface-1 px-3 py-2 text-12 text-faint">
          <span>时间</span>
          <span>类型</span>
          <span className="text-right">说明 / 金额</span>
        </div>
        {ORDERS.map((order) => (
          <div
            key={`${order.time}-${order.type}`}
            className="grid grid-cols-[1.2fr_0.6fr_1.4fr] items-center border-b border-border px-3 py-3 text-12 last:border-b-0"
          >
            <span className="tabular-nums text-subtle">{order.time}</span>
            <span
              className={`w-fit rounded-pill px-2 py-1 font-medium ${order.tone}`}
            >
              {order.type}
            </span>
            <span className="text-right text-subtle">
              {order.desc}
              <strong className="ml-2 font-medium tabular-nums text-foreground">
                {order.amount}
              </strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
