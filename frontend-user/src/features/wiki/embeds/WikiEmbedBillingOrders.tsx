import { ChevronDown, Download, Undo2 } from "lucide-react";

const ORDERS = [
  {
    time: "2026-08-08 14:20",
    type: "订阅",
    desc: "Pro 月度会员",
    amount: "¥59.00",
  },
  {
    time: "2026-07-21 09:10",
    type: "充值",
    desc: "经费充值",
    amount: "¥100.00",
  },
  {
    time: "2026-07-08 14:16",
    type: "订阅",
    desc: "Pro 月度会员",
    amount: "¥59.00",
    refund: "已退款",
  },
] as const;

/** OrdersTable 的已支付订单代表态，包含当前退款叠加标记。 */
export function WikiEmbedBillingOrders() {
  return (
    <section
      className="w-[min(100%,48rem)] rounded-16 border border-border bg-surface-card p-[var(--orders-card-pad)] [--orders-card-pad:1.25rem]"
      aria-hidden
      data-wiki-fixture="billing-orders"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <span className="inline-flex h-7 items-center rounded-8 bg-foreground px-3 text-12 text-on-dark">
            全部
          </span>
          <span className="inline-flex h-7 items-center rounded-8 bg-surface-2 px-3 text-12 text-subtle">
            订阅
          </span>
          <span className="inline-flex h-7 items-center rounded-8 bg-surface-2 px-3 text-12 text-subtle">
            充值
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 items-center gap-3 rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle">
            全部月份
            <ChevronDown className="size-3 text-faint" />
          </span>
          <span className="inline-flex h-9 items-center gap-1 rounded-8 border border-border px-3 text-12 text-subtle">
            <Download className="size-3" />
            导出
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-12">
          <thead>
            <tr className="border-b border-border text-faint">
              <th className="py-2 text-left font-medium">时间</th>
              <th className="py-2 text-left font-medium">类型</th>
              <th className="py-2 text-right font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {ORDERS.map((order) => (
              <tr
                key={`${order.time}-${order.type}`}
                className="border-b border-border-soft last:border-0"
              >
                <td className="py-3 tabular-nums text-subtle">{order.time}</td>
                <td className="py-3">
                  <span
                    className={`rounded-pill px-2 py-1 font-medium ${
                      order.type === "订阅"
                        ? "bg-brand-green/10 text-brand-green"
                        : "bg-warning-soft text-brand-amber"
                    }`}
                  >
                    {order.type}
                  </span>
                </td>
                <td className="py-3 text-right text-subtle">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span>{order.desc}</span>
                    {"refund" in order ? (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-1 text-faint">
                        <Undo2 className="size-3" />
                        {order.refund}
                      </span>
                    ) : null}
                    <span
                      className={`font-medium tabular-nums ${
                        "refund" in order
                          ? "text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {order.amount}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-12 leading-paragraph text-faint">
        “用经费继续”的扣费按天合并成一条记录，当天用多少就累加多少。
      </p>
      <p className="mt-1 text-12 leading-paragraph text-faint">
        已退款订单保留原实付金额，并单独标出退款状态与退回金额。
      </p>
    </section>
  );
}
