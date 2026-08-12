import {
  BookMarked,
  ChevronRight,
  Compass,
  LayoutGrid,
  Link2,
  LogOut,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Ticket,
  User,
  UserPen,
  UserPlus,
  Wallet,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";
import { Switch } from "@/shared/ui/switch";

const MENU_ITEMS = [
  [UserPen, "个人资料", ""],
  [ShieldCheck, "安全设置", ""],
  [Link2, "已连接账号", ""],
  [ReceiptText, "资产明细", ""],
  [UserPlus, "邀请好友", "邀请有礼 +100 经费"],
] as const;

/** MobileMePage 已登录首屏，资产口径取 current scholar。 */
export function WikiEmbedMobileMe() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-surface-1"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-me"
    >
      <main className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="space-y-3">
          <section className="flex items-center gap-3 rounded-16 border border-border bg-surface-card p-4">
            <span className="flex size-14 items-center justify-center rounded-pill bg-primary text-20 font-medium text-on-brand">
              研
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-16 font-medium text-foreground">
                示例研究者
              </span>
              <span className="block truncate text-12 text-faint">
                researcher@university.edu
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-faint" />
          </section>

          <nav className="overflow-hidden rounded-16 border border-border bg-surface-card">
            <MenuRow icon={BookMarked} label="我的文件夹" />
          </nav>

          <section className="overflow-hidden rounded-16 border border-border bg-surface-card">
            <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
              <span className="rounded-pill bg-brand-green px-3 py-1 text-12 font-medium text-on-brand">
                Pro
              </span>
              <span className="rounded-pill bg-brand-amber/10 px-2 py-1 text-12 font-medium text-brand-amber">
                年费
              </span>
              <span className="text-12 text-faint">2027/8/12 到期</span>
              <span className="ml-auto rounded-pill bg-foreground px-3 py-1 text-12 font-medium text-on-brand">
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
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-12 text-faint">
                  5 天后重置 · 08/17
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-pill border border-border-button px-3 py-1 text-12 text-muted-foreground">
                  <RotateCcw className="size-3" />
                  重置额度
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-border-soft px-4 py-3">
              <Wallet className="size-4 shrink-0 text-brand-amber" />
              <span className="text-14 text-foreground">
                经费 <span className="font-medium">2,400</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 rounded-pill border border-border-button px-3 py-1 text-12 text-foreground">
                <Plus className="size-3" />
                充值
              </span>
              <span className="ml-auto text-right text-12 text-faint">
                剩余重置次数 2
              </span>
            </div>

            <div className="flex items-center gap-3 border-t border-border-soft px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-14 text-foreground">用经费继续</span>
                <span className="truncate text-12 text-faint">
                  额度耗尽后自动用经费按量续用
                </span>
              </span>
              <Switch checked={false} tabIndex={-1} />
            </div>

            <div className="flex items-center gap-2 border-t border-border-soft px-4 py-3">
              <Ticket className="size-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 text-12 text-faint">
                输入兑换码
              </span>
              <span className="rounded-pill border border-border-button px-3 py-1 text-12 text-foreground opacity-40">
                兑换
              </span>
            </div>
          </section>

          <nav className="overflow-hidden rounded-16 border border-border bg-surface-card">
            {MENU_ITEMS.map(([Icon, label, badge], index) => (
              <MenuRow
                key={label}
                icon={Icon}
                label={label}
                badge={badge || undefined}
                border={index < MENU_ITEMS.length - 1}
              />
            ))}
          </nav>

          <div className="flex h-11 items-center justify-center gap-2 rounded-16 border border-border bg-surface-card text-14 text-brand-red">
            <LogOut className="size-4" />
            退出登录
          </div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}

function MenuRow({
  icon: Icon,
  label,
  badge,
  border = false,
}: {
  icon: typeof User;
  label: string;
  badge?: string;
  border?: boolean;
}) {
  return (
    <div
      className={`flex h-12 items-center gap-3 px-4 ${border ? "border-b border-border-soft" : ""}`}
    >
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1 text-14 text-foreground">{label}</span>
      {badge ? (
        <span className="shrink-0 rounded-pill bg-brand-red/10 px-2 py-1 text-12 text-brand-red">
          {badge}
        </span>
      ) : null}
      <ChevronRight className="size-4 text-faint" />
    </div>
  );
}

function MobileNav() {
  const items = [
    [Compass, "浏览"],
    [ClawBrandIcon, "AI Claw"],
    [LayoutGrid, "功能"],
    [User, "我的"],
  ] as const;
  return (
    <footer className="grid h-16 shrink-0 grid-cols-4 border-t border-border bg-background px-2">
      {items.map(([Icon, label]) => (
        <span
          key={label}
          className={`relative flex flex-col items-center justify-center gap-1 ${label === "我的" ? "text-foreground" : "text-faint"}`}
        >
          {label === "我的" ? (
            <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
          ) : null}
          <Icon className="size-5" />
          <span className={`text-12 ${label === "我的" ? "font-medium" : ""}`}>
            {label}
          </span>
        </span>
      ))}
    </footer>
  );
}
