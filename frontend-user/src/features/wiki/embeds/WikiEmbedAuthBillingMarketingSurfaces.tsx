import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  FileText,
  Gift,
  Github,
  Gauge,
  Gem,
  Info,
  LayoutGrid,
  Link2,
  Lock,
  LogOut,
  MessageCircle,
  RefreshCw,
  Shield,
  Sparkles,
  Ticket,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";

/** HomeAgentHero 首屏：文献搜索框。 */
export function WikiEmbedHomeResearchEntry() {
  return (
    <div
      className="relative w-[min(100%,60rem)] bg-surface-card"
      aria-hidden
      data-wiki-fixture="home-research-entry"
    >
      <div className="flex flex-col items-center px-6 py-10">
        <div className="flex w-full max-w-3xl flex-col items-center">
          <BrandLogo size="xl" />

          <div
            className="mt-8 w-full max-w-[40rem]"
            data-wiki-spot="文献搜索框"
          >
            <div className="flex h-12 items-center gap-3 rounded-16 border border-border bg-surface-card pl-4 pr-2 shadow-raised">
              <span className="inline-flex h-7 items-center rounded-8 bg-surface-2 p-1 text-12 text-subtle">
                <span className="inline-flex h-5 items-center rounded-4 bg-background px-2 text-foreground shadow-raised">
                  智能
                </span>
                <span className="px-2">文献</span>
              </span>
              <span className="min-w-0 flex-1 truncate text-14 text-faint">
                帮我找 3 篇 Transformer 可解释性方向的代表作
              </span>
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-foreground text-on-dark">
                <ArrowRight className="size-4 -rotate-90" strokeWidth={2.5} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** AuthDialog 的注册态；登录和找回密码分别由其它章节说明。 */
export function WikiEmbedAuthRegisterRecovery() {
  return (
    <div
      className="flex w-[min(100%,28rem)] justify-center"
      aria-hidden
      data-wiki-fixture="auth-register-recovery"
    >
      <AuthDialogStatic title="创建账号" description="免费开始使用 Scholay">
        <div className="space-y-4">
          <AccountTabs />
          <AuthField label="邮箱" value="you@example.com" />
          <AuthCodeField />
          <AuthField label="密码" value="至少 8 位，建议字母+数字" />
          <p className="flex items-start gap-2 text-12 leading-paragraph text-subtle">
            <span className="mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-4 border border-border bg-background">
              <Check className="size-3 text-brand-green" />
            </span>
            我已阅读并同意 服务条款 与 隐私政策
          </p>
          <AuthPrimary>注册并登录</AuthPrimary>
          <p className="text-center text-12 text-subtle">已有账号？ 返回登录</p>
        </div>
      </AuthDialogStatic>
    </div>
  );
}

function AuthDialogStatic({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative w-[28rem] shrink-0 overflow-hidden rounded-8 border border-border bg-background shadow-overlay">
      <X className="absolute right-4 top-4 size-4 text-faint" />
      <header className="flex flex-col items-center gap-1 border-b border-border-hairline px-6 pb-4 pt-8">
        <BrandLogo size="md" />
        <h3 className="mt-2 text-16 font-medium text-foreground">{title}</h3>
        <p className="text-12 text-subtle">{description}</p>
      </header>
      <div className="px-6 py-4">{children}</div>
      <footer className="px-6 pb-6">
        <div className="my-3 flex items-center">
          <span className="h-px flex-1 bg-border-hairline" />
          <span className="px-3 text-12 uppercase text-faint">或继续使用</span>
          <span className="h-px flex-1 bg-border-hairline" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <OAuthIcon icon={Github} label="GitHub" />
          <OAuthIcon icon={MessageCircle} label="微信" />
          <OAuthIcon icon={UserRound} label="ORCID" />
        </div>
      </footer>
    </section>
  );
}

function AccountTabs() {
  return (
    <div className="inline-flex items-center rounded-8 bg-surface-2 p-1 text-12">
      <span className="inline-flex h-7 items-center rounded-4 bg-background px-3 text-foreground shadow-raised">
        邮箱
      </span>
      <span className="inline-flex h-7 items-center px-3 text-subtle">
        手机号
      </span>
    </div>
  );
}

function AuthField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-12 font-medium text-subtle">{label}</p>
      <div className="flex h-10 items-center rounded-8 border border-border bg-background px-3 text-12 text-faint">
        {value}
      </div>
    </div>
  );
}

function AuthCodeField() {
  return (
    <div>
      <p className="mb-1 text-12 font-medium text-subtle">验证码</p>
      <div className="flex gap-2">
        <div className="flex h-10 min-w-0 flex-1 items-center rounded-8 border border-border px-3 text-12 text-faint">
          6 位数字
        </div>
        <span className="inline-flex h-10 shrink-0 items-center rounded-8 border border-border px-3 text-12 font-medium text-subtle">
          发送验证码
        </span>
      </div>
    </div>
  );
}

function AuthPrimary({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-10 w-full items-center justify-center rounded-8 bg-brand-red text-12 font-medium text-on-brand">
      {children}
    </span>
  );
}

function OAuthIcon({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span
      title={label}
      className="inline-flex size-9 items-center justify-center rounded-8 border border-border text-subtle"
    >
      <Icon className="size-4" />
    </span>
  );
}

const BILLING_TABS: Array<[string, LucideIcon]> = [
  ["总览", LayoutGrid],
  ["经费充值", Coins],
  ["兑换码激活", Ticket],
  ["推广/邀请", UsersRound],
  ["明细查看", FileText],
  ["经费领取", Gift],
];

/** MembershipPage 的账户资产卡、分段导航与 OverviewContent。 */
export function WikiEmbedBillingOverviewUsage() {
  const weeks: Array<Array<number | null>> = [
    [null, null, null, null, null, null, 1],
    [0, 2, 1, 0, 3, 1, 0],
    [2, 4, 3, 0, 1, 2, 3],
    [1, 0, 4, 2, 1, 3, 0],
    [0, 2, 1, 4, 2, 0, 3],
    [1, 0, 2, 0, 4, 1, 0],
  ];
  return (
    <div
      className="flex w-[min(100%,60rem)] flex-col gap-4"
      aria-hidden
      data-wiki-fixture="billing-overview-usage"
    >
      <section className="rounded-8 border border-border bg-background p-4">
        <header className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-12 font-medium text-foreground">账户资产</h3>
          <div className="flex items-center gap-2">
            <span className="text-12 text-faint">Free</span>
            <span className="inline-flex h-7 items-center gap-1 rounded-4 bg-brand-red px-3 text-12 font-medium text-on-brand">
              <Sparkles className="size-3.5" /> 升级会员
            </span>
          </div>
        </header>

        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="inline-flex h-6 shrink-0 items-center rounded-4 border border-border bg-surface-2 px-2 text-12 font-medium text-subtle">
              FREE
            </span>
            <span className="flex size-4 shrink-0 items-center justify-center rounded-pill border border-border text-12 text-faint">
              ?
            </span>
            <span className="shrink-0 text-12 font-medium text-subtle">
              Free 剩余额度
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
              <div className="h-full w-3/4 rounded-pill bg-brand-green" />
            </div>
            <span className="w-9 shrink-0 text-right text-12 tabular-nums text-faint">
              75%
            </span>
            <span className="flex shrink-0 items-center gap-1 text-12 text-faint">
              <RefreshCw className="size-3" /> 3 天后重置
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-8 border border-border text-faint">
              <RefreshCw className="size-3.5" />
            </span>
          </div>
          <span className="h-10 w-px shrink-0 bg-border" />
          <div className="flex w-36 shrink-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Coins className="size-3.5 text-faint" />
              <span className="text-20 font-medium tabular-nums text-foreground">
                3,300
              </span>
              <span className="text-12 text-faint">经费</span>
            </div>
          </div>
        </div>

        <div className="my-3 h-px bg-border-hairline" />
        <div className="flex flex-col gap-2">
          <LockedQuota icon={Gem} label="Pro 额度" tone="amber" />
          <LockedQuota icon={Crown} label="Max 额度" tone="red" />
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-8 border border-border-hairline bg-surface-1 p-3">
          <span className="inline-flex size-8 items-center justify-center rounded-pill bg-surface-2 text-faint">
            <Gauge className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-12 font-medium text-foreground">额度区别</p>
            <p className="mt-1 text-12 leading-paragraph text-subtle">
              各档额度倍率由当前套餐配置决定，请以套餐页和本页实时显示为准。
            </p>
          </div>
          <span className="text-12 tabular-nums text-faint">1/4</span>
          <ChevronLeft className="size-3.5 text-faint" />
          <ChevronRight className="size-3.5 text-faint" />
        </div>
      </section>

      <div className="flex items-center gap-1 rounded-8 border border-border bg-surface-1 p-1">
        {BILLING_TABS.map(([label, Icon], index) => (
          <span
            key={label}
            className={
              index === 0
                ? "flex h-9 flex-1 items-center justify-center gap-2 rounded-4 bg-background text-12 font-medium text-brand-red shadow-raised"
                : "flex h-9 flex-1 items-center justify-center gap-2 rounded-4 text-12 font-medium text-subtle"
            }
          >
            <Icon className="size-3.5" /> {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-8 border border-border bg-background p-4">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="text-12 font-medium text-foreground">近期流水</h3>
            <span className="text-12 text-subtle">查看全部</span>
          </header>
          <div className="flex flex-col gap-1">
            {[
              ["充值到账", "2026-08-10 09:32", "+3,000 经费", true],
              ["任务奖励", "2026-08-08 17:05", "+300 经费", true],
              ["重置消耗", "2026-08-07 14:28", "−100 经费", false],
              ["礼品码", "2026-08-02 11:46", "+200 经费", true],
            ].map(([title, date, amount, positive]) => (
              <div
                key={String(title)}
                className="flex items-center justify-between border-b border-border-hairline py-2 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="text-12 text-subtle">{title}</span>
                  <span className="text-12 text-faint">{date}</span>
                </div>
                <span
                  className={
                    positive
                      ? "text-12 font-medium tabular-nums text-brand-green"
                      : "text-12 font-medium tabular-nums text-brand-red"
                  }
                >
                  {amount}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-8 border border-border bg-background p-4">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="text-12 font-medium text-foreground">
              本月每日活跃
            </h3>
            <span className="text-12 tabular-nums text-faint">19 天有使用</span>
          </header>
          <div className="flex gap-1">
            <div className="flex flex-col gap-1 pr-1">
              {["", "一", "", "三", "", "五", ""].map((day, index) => (
                <span
                  key={index}
                  className="flex h-4 items-center text-12 text-faint"
                >
                  {day}
                </span>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((level, dayIndex) => (
                  <span
                    key={dayIndex}
                    className={
                      level == null
                        ? "size-4"
                        : level === 0
                          ? "size-4 rounded-4 bg-surface-2"
                          : level === 1
                            ? "size-4 rounded-4 bg-brand-green/25"
                            : level === 2
                              ? "size-4 rounded-4 bg-brand-green/50"
                              : level === 3
                                ? "size-4 rounded-4 bg-brand-green/75"
                                : "size-4 rounded-4 bg-brand-green"
                    }
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1 text-12 text-faint">
            少
            <span className="size-3 rounded-4 bg-surface-2" />
            <span className="size-3 rounded-4 bg-brand-green/25" />
            <span className="size-3 rounded-4 bg-brand-green/50" />
            <span className="size-3 rounded-4 bg-brand-green/75" />
            <span className="size-3 rounded-4 bg-brand-green" />多
          </div>
        </section>
      </div>
    </div>
  );
}

function LockedQuota({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "amber" | "red";
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          tone === "amber"
            ? "inline-flex size-5 items-center justify-center rounded-4 bg-brand-amber/10 text-brand-amber"
            : "inline-flex size-5 items-center justify-center rounded-4 bg-brand-red/10 text-brand-red"
        }
      >
        <Icon className="size-3" />
      </span>
      <span className="text-12 font-medium text-faint">{label}</span>
      <span className="h-2 flex-1 rounded-pill bg-surface-2" />
      <span className="inline-flex items-center gap-1 rounded-pill border border-brand-red/40 px-2 py-1 text-12 font-medium text-brand-red">
        <Lock className="size-3" /> 升级解锁
      </span>
    </div>
  );
}

/** DropdownMenuContent + UserMenuContent 的真实 240px 布局。 */
export function WikiEmbedUserAccountMenu() {
  return (
    <div
      className="w-60 overflow-hidden rounded-12 border border-border bg-popover p-1 text-popover-foreground shadow-overlay"
      aria-hidden
      data-wiki-fixture="user-account-menu"
    >
      <header className="flex flex-col items-center gap-1 px-4 py-4">
        <span className="mb-1 inline-flex size-13 items-center justify-center rounded-pill bg-primary text-16 font-medium text-primary-foreground">
          L
        </span>
        <span className="text-14 font-medium text-foreground">Lin Chen</span>
        <span className="text-12 text-faint">lin.chen@example.edu</span>
        <span className="mt-1 inline-flex items-center rounded-pill bg-brand-green/10 px-3 py-1 text-12 font-medium text-brand-green">
          Free
        </span>
      </header>
      <div className="px-3 pb-3">
        <div className="flex w-full items-center justify-center gap-2 rounded-8 bg-brand-red px-3 py-2 text-on-brand">
          <Sparkles className="size-3.5" />
          <span className="text-12 font-medium">升级会员</span>
        </div>
      </div>
      <div className="-mx-1 my-1 h-px bg-border-hairline" />
      <nav className="p-2">
        {(
          [
            ["个人资料", UserRound],
            ["账户资产", Crown],
            ["安全设置", Shield],
            ["已连接账号", Link2],
            ["帮助中心", Info],
          ] as Array<[string, LucideIcon]>
        ).map(([label, Icon]) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-8 px-3 py-2"
          >
            <Icon className="size-3.5 text-faint" />
            <span className="text-12 text-subtle">{label}</span>
          </div>
        ))}
      </nav>
      <div className="-mx-1 my-1 h-px bg-border-hairline" />
      <footer className="p-2">
        <div className="flex items-center gap-2 rounded-8 px-3 py-2 text-brand-red">
          <LogOut className="size-3.5" />
          <span className="text-12">退出登录</span>
        </div>
      </footer>
    </div>
  );
}
