import {
  ArrowLeft,
  CircleDollarSign,
  LockKeyhole,
  ReceiptText,
} from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";

/** /m/me 在未登录时的就地登录入口。 */
export function WikiEmbedMobileMeLoggedOut() {
  return (
    <div
      className="flex h-[34rem] w-[min(100%,26rem)] flex-col items-center justify-center rounded-20 border border-border bg-surface-1 px-8 text-center"
      aria-hidden
      data-wiki-fixture="mobile-me-logged-out"
    >
      <BrandLogo size="lg" />
      <h1 className="mt-6 text-20 font-medium text-foreground">登录 Scholay</h1>
      <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
        登录后查看你的会员、科研经费、文件夹与设置
      </p>
      <div className="mt-8 w-full max-w-xs space-y-3">
        <span className="flex h-12 items-center justify-center rounded-8 bg-foreground text-14 font-medium text-on-dark">
          登录
        </span>
        <span className="flex h-12 items-center justify-center rounded-8 border border-border bg-surface-card text-14 font-medium text-foreground">
          注册新账号
        </span>
      </div>
    </div>
  );
}

const TRANSACTIONS = [
  {
    note: "购买经费",
    date: "2026/8/11 14:32",
    amount: "+200",
    tone: "text-brand-green",
  },
  {
    note: "Claw 深度研究",
    date: "2026/8/11 10:08",
    amount: "-3.25",
    tone: "text-brand-red",
  },
  {
    note: "邀请好友奖励",
    date: "2026/8/9 18:20",
    amount: "+20",
    tone: "text-brand-green",
  },
] as const;

const ORDERS = [
  {
    title: "经费充值",
    orderNo: "SCH202608110031",
    date: "2026/8/11",
    amount: "¥20.00",
    refund: "",
  },
  {
    title: "年度会员",
    orderNo: "SCH202607180114",
    date: "2026/7/18",
    amount: "¥299.00",
    refund: "部分退款",
  },
] as const;

/** /m/me/billing 的经费流水与订单记录双页签。 */
export function WikiEmbedMobileBillingLedger() {
  return (
    <div
      className="grid w-[min(100%,54rem)] gap-4 md:grid-cols-2"
      aria-hidden
      data-wiki-fixture="mobile-billing-ledger"
    >
      <BillingPhone activeTab="经费流水">
        <ul className="overflow-hidden rounded-16 border border-border bg-surface-card">
          {TRANSACTIONS.map((transaction) => (
            <li
              key={`${transaction.note}-${transaction.date}`}
              className="flex items-center gap-3 border-b border-border-soft px-4 py-3 last:border-b-0"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand-green-soft text-brand-green">
                <CircleDollarSign className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-12 text-foreground">
                  {transaction.note}
                </p>
                <p className="mt-1 text-12 text-faint">{transaction.date}</p>
              </div>
              <span
                className={`text-14 font-medium tabular-nums ${transaction.tone}`}
              >
                {transaction.amount}
              </span>
            </li>
          ))}
        </ul>
      </BillingPhone>

      <BillingPhone activeTab="订单记录">
        <ul className="overflow-hidden rounded-16 border border-border bg-surface-card">
          {ORDERS.map((order) => (
            <li
              key={order.orderNo}
              className="space-y-2 border-b border-border-soft px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <ReceiptText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-12 font-medium text-foreground">
                    {order.title}
                  </span>
                  {order.refund ? (
                    <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-1 text-12 text-muted-foreground">
                      {order.refund}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-14 font-medium tabular-nums text-foreground">
                  {order.amount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-12 text-faint">
                <span className="truncate">{order.orderNo}</span>
                <span className="shrink-0">{order.date}</span>
              </div>
              {order.refund ? (
                <p className="text-12 text-faint">
                  已退{" "}
                  <span className="font-medium text-brand-red">¥59.80</span>
                  {" / 实付 ¥299.00"}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </BillingPhone>
    </div>
  );
}

/** 直接进入 /m/me/* 子页时的未登录兜底。 */
export function WikiEmbedMobileSubpageAuthGuard() {
  return (
    <div
      className="flex h-[30rem] w-[min(100%,26rem)] flex-col overflow-hidden rounded-20 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="mobile-subpage-auth-guard"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface-card px-3">
        <ArrowLeft className="size-5 text-foreground" />
        <span className="text-14 font-medium text-foreground">安全设置</span>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-pill bg-surface-2 text-muted-foreground">
          <LockKeyhole className="size-5" />
        </span>
        <p className="mt-4 text-12 text-muted-foreground">
          登录后才能查看安全设置
        </p>
        <span className="mt-4 inline-flex h-11 items-center justify-center rounded-8 bg-foreground px-8 text-14 font-medium text-on-dark">
          登录
        </span>
      </div>
    </div>
  );
}

function BillingPhone({
  activeTab,
  children,
}: {
  activeTab: "经费流水" | "订单记录";
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-20 border border-border bg-surface-1">
      <header className="flex h-12 items-center gap-2 border-b border-border bg-surface-card px-3">
        <ArrowLeft className="size-5 text-foreground" />
        <span className="text-14 font-medium text-foreground">资产明细</span>
      </header>
      <div className="flex gap-2 px-3 pb-0 pt-3">
        {(["经费流水", "订单记录"] as const).map((tab) => (
          <span
            key={tab}
            className={
              tab === activeTab
                ? "rounded-pill border border-foreground bg-foreground px-4 py-2 text-12 font-medium text-on-dark"
                : "rounded-pill border border-border bg-surface-card px-4 py-2 text-12 text-muted-foreground"
            }
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
