import {
  BookMarked,
  ChevronRight,
  Compass,
  LayoutGrid,
  Link2,
  LogOut,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Ticket,
  User,
  UserPen,
  Wallet,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";

const MENU_ITEMS = [
  [UserPen, "个人资料"],
  [ShieldCheck, "安全设置"],
  [Link2, "已连接账号"],
  [ReceiptText, "资产明细"],
] as const;

/** /m/me 已登录代表态；对齐用户卡、文献集、资产卡和设置入口的层级。 */
export function WikiEmbedMobileMe() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden rounded-20 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="mobile-me"
    >
      <main className="space-y-3 p-3">
        <div className="flex items-center gap-3 rounded-12 border border-border bg-surface-card p-4">
          <span className="flex size-14 items-center justify-center rounded-pill bg-foreground text-18 font-medium text-on-dark">
            研
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-18 font-medium text-foreground">
              示例研究者
            </span>
            <span className="block truncate text-12 text-faint">
              researcher@university.edu
            </span>
          </span>
          <ChevronRight className="size-4 text-faint" />
        </div>

        <div className="flex h-12 items-center gap-3 rounded-12 border border-border bg-surface-card px-4">
          <BookMarked className="size-4 text-muted-foreground" />
          <span className="flex-1 text-14 text-foreground">我的文献集</span>
          <ChevronRight className="size-4 text-faint" />
        </div>

        <section className="overflow-hidden rounded-12 border border-border bg-surface-card">
          <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
            <span className="rounded-pill bg-brand-green px-3 py-1 text-12 font-medium text-on-dark">
              Pro
            </span>
            <span className="text-12 text-faint">2027/08/12 到期</span>
            <span className="ml-auto rounded-pill bg-foreground px-3 py-1 text-12 font-medium text-on-dark">
              升级会员
            </span>
          </div>

          <div className="space-y-2 px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-14 font-medium text-foreground">
                本周期额度
              </span>
              <span className="text-12 text-muted-foreground">剩余 68%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-pill bg-surface-2">
              <div className="h-full w-[68%] rounded-pill bg-brand-green" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-12 text-faint">5 天后重置 · 08/17</span>
              <span className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1 text-12 text-muted-foreground">
                <RotateCcw className="size-3" />
                重置额度
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft px-4 py-3">
            <Wallet className="size-4 text-brand-amber" />
            <span className="text-14 text-foreground">
              经费 <strong>2,400</strong>
            </span>
            <span className="ml-auto text-12 text-faint">
              临时 400 · 永久 2,000
            </span>
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft px-4 py-3">
            <Ticket className="size-4 text-faint" />
            <span className="flex-1 text-14 text-faint">输入兑换码</span>
            <span className="rounded-pill border border-border px-3 py-1 text-12 text-foreground">
              兑换
            </span>
          </div>
        </section>

        <nav className="overflow-hidden rounded-12 border border-border bg-surface-card">
          {MENU_ITEMS.map(([Icon, label], index) => (
            <div
              key={label}
              className={`flex h-12 items-center gap-3 px-4 ${index < MENU_ITEMS.length - 1 ? "border-b border-border-soft" : ""}`}
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="flex-1 text-14 text-foreground">{label}</span>
              <ChevronRight className="size-4 text-faint" />
            </div>
          ))}
        </nav>

        <div className="flex h-11 items-center justify-center gap-2 rounded-12 border border-border bg-surface-card text-14 text-brand-red">
          <LogOut className="size-4" />
          退出登录
        </div>
      </main>

      <footer className="grid h-16 grid-cols-4 border-t border-border bg-surface-card px-2">
        <MobileNav icon={Compass} label="浏览" />
        <MobileNav icon={ClawBrandIcon} label="AI Claw" />
        <MobileNav icon={LayoutGrid} label="功能" />
        <MobileNav icon={User} label="我的" active />
      </footer>
    </div>
  );
}

function MobileNav({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Compass;
  label: string;
  active?: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-1">
      {active ? (
        <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
      ) : null}
      <Icon className="size-5" />
      <span
        className={
          active ? "text-12 font-medium text-foreground" : "text-12 text-faint"
        }
      >
        {label}
      </span>
    </div>
  );
}
