import { ArrowLeft, Compass, LayoutGrid, User } from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";

const TRANSACTIONS = [
  {
    note: "购买经费",
    date: "2026/8/11 14:32:08",
    amount: "+200",
    tone: "text-brand-green",
  },
  {
    note: "Claw 深度研究",
    date: "2026/8/11 10:08:41",
    amount: "-3.25",
    tone: "text-brand-red",
  },
  {
    note: "邀请好友奖励",
    date: "2026/8/9 18:20:16",
    amount: "+20",
    tone: "text-brand-green",
  },
] as const;

/** /m/me 在未登录时的就地登录入口。 */
export function WikiEmbedMobileMeLoggedOut() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-me-logged-out"
    >
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-surface-1 px-8 text-center">
        <BrandLogo size="lg" />
        <h1
          className="text-20 font-medium text-foreground"
          style={{ marginTop: 20 }}
        >
          登录 Scholay
        </h1>
        <p
          className="text-12 leading-paragraph text-muted-foreground"
          style={{ marginTop: 6 }}
        >
          登录后查看你的会员、科研经费、文件夹与设置
        </p>
        <div
          className="flex w-full max-w-xs flex-col"
          style={{ gap: 10, marginTop: 28 }}
        >
          <span className="flex h-12 items-center justify-center rounded-8 bg-foreground px-4 text-14 font-medium text-on-brand">
            登录
          </span>
          <span className="flex h-12 items-center justify-center rounded-8 border border-border bg-background px-4 text-14 font-medium text-foreground">
            注册新账号
          </span>
        </div>
      </main>
      <StaticMobileNav active="me" />
    </div>
  );
}

/** /m/me/billing 默认落在「经费流水」页签。 */
export function WikiEmbedMobileBillingLedger() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-billing-ledger"
    >
      <main className="flex min-h-0 flex-1 flex-col">
        <SubpageHeader title="资产明细" />
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="flex shrink-0 gap-2 p-3 pb-0">
            <span
              className="rounded-pill border border-foreground bg-foreground text-12 font-medium text-on-brand"
              style={{ paddingBlock: 6, paddingInline: 14 }}
            >
              经费流水
            </span>
            <span
              className="rounded-pill border border-border bg-background text-12 text-muted-foreground"
              style={{ paddingBlock: 6, paddingInline: 14 }}
            >
              订单记录
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <ul className="overflow-hidden rounded-8 border border-border bg-background">
              {TRANSACTIONS.map((transaction) => (
                <li
                  key={`${transaction.note}-${transaction.date}`}
                  className="flex items-center gap-3 border-b border-border-soft px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-12 text-foreground">
                      {transaction.note}
                    </p>
                    <p className="text-12 text-faint">{transaction.date}</p>
                  </div>
                  <span
                    className={`text-14 font-medium tabular-nums ${transaction.tone}`}
                  >
                    {transaction.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
      <StaticMobileNav active="me" />
    </div>
  );
}

/** 直接进入 /m/me/* 子页时的未登录兜底。 */
export function WikiEmbedMobileSubpageAuthGuard() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-subpage-auth-guard"
    >
      <main className="flex min-h-0 flex-1 flex-col">
        <SubpageHeader title="安全设置" />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-surface-1 px-8 text-center">
          <p className="text-12 text-muted-foreground">
            登录后才能查看安全设置
          </p>
          <span className="flex h-10 items-center justify-center rounded-8 bg-foreground px-8 text-14 font-medium text-on-brand">
            登录
          </span>
        </div>
      </main>
      <StaticMobileNav active="me" />
    </div>
  );
}

function SubpageHeader({ title }: { title: string }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2">
      <span className="flex size-9 items-center justify-center rounded-pill">
        <ArrowLeft className="size-5 text-foreground" />
      </span>
      <span className="text-14 font-medium text-foreground">{title}</span>
    </header>
  );
}

function StaticMobileNav({ active }: { active: "me" }) {
  const items = [
    [Compass, "浏览", "feed"],
    [ClawBrandIcon, "AI Claw", "claw"],
    [LayoutGrid, "功能", "tools"],
    [User, "我的", "me"],
  ] as const;

  return (
    <footer className="grid h-16 shrink-0 grid-cols-4 border-t border-border bg-background px-2">
      {items.map(([Icon, label, key]) => {
        const selected = key === active;
        return (
          <span
            key={key}
            className={`relative flex flex-col items-center justify-center gap-1 ${selected ? "text-foreground" : "text-faint"}`}
          >
            {selected ? (
              <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
            ) : null}
            <Icon className="size-5" />
            <span className={`text-12 ${selected ? "font-medium" : ""}`}>
              {label}
            </span>
          </span>
        );
      })}
    </footer>
  );
}
