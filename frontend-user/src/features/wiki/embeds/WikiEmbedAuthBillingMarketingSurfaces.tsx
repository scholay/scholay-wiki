import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Gem,
  Gift,
  Globe2,
  GraduationCap,
  HelpCircle,
  KeyRound,
  Library,
  LockKeyhole,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";

/** 首页的搜索入口、功能快捷入口与三段研究能力叙事。 */
export function WikiEmbedHomeResearchEntry() {
  return (
    <div
      className="w-[min(100%,54rem)] overflow-hidden rounded-16 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="home-research-entry"
    >
      <section className="bg-brand-green-soft px-6 py-8 text-center">
        <BrandLogo size="xl" />
        <p className="mt-3 text-12 text-subtle">
          从一个问题开始，连接检索、阅读、写作与评议
        </p>
        <div className="mx-auto mt-5 flex max-w-2xl items-center gap-2 rounded-12 border border-foreground bg-surface-card px-4 py-3 shadow-raised">
          <span className="inline-flex items-center gap-1 rounded-4 bg-surface-2 px-2 py-1 text-10 text-subtle">
            综合搜索 <ChevronDown className="size-3" />
          </span>
          <span className="min-w-0 flex-1 text-left text-12 text-faint">
            搜索论文、期刊、作者，或切换智能搜索…
          </span>
          <span className="inline-flex size-8 items-center justify-center rounded-8 bg-brand-red text-on-dark">
            <Search className="size-4" />
          </span>
        </div>
        <div className="mx-auto mt-4 grid max-w-2xl gap-2 sm:grid-cols-4">
          {(
            [
              ["智能搜索", Sparkles, "green"],
              ["个人文献集", Library, "amber"],
              ["Prism 写作", FileText, "red"],
              ["智能审稿", ShieldCheck, "neutral"],
            ] as Array<[string, LucideIcon, string]>
          ).map(([label, Icon, tone]) => (
            <div
              key={String(label)}
              className="flex items-center gap-2 rounded-8 border border-border bg-surface-card px-3 py-2 text-left"
            >
              <Icon
                className={
                  tone === "green"
                    ? "size-4 text-brand-green"
                    : tone === "amber"
                      ? "size-4 text-brand-amber"
                      : tone === "red"
                        ? "size-4 text-brand-red"
                        : "size-4 text-subtle"
                }
              />
              <span className="text-10 font-medium text-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {(
          [
            [
              "发现与筛选",
              "从多来源搜索进入论文、作者与期刊关系，再把候选放入暂存区。",
              Search,
              "01",
            ],
            [
              "阅读与组织",
              "在个人文献集中维护元数据与 PDF，并通过矩阵和 PDF Chat 比较证据。",
              BookOpen,
              "02",
            ],
            [
              "形成与核对",
              "把材料带入 Prism 写作或智能审稿；AI 输出始终需要回到原始证据检查。",
              GraduationCap,
              "03",
            ],
          ] as Array<[string, string, LucideIcon, string]>
        ).map(([title, body, Icon, number]) => (
          <article key={String(title)} className="p-5">
            <div className="flex items-center justify-between">
              <span className="inline-flex size-8 items-center justify-center rounded-8 bg-surface-1">
                <Icon className="size-4 text-brand-green" />
              </span>
              <span className="font-serif text-18 text-border-strong">
                {number}
              </span>
            </div>
            <h3 className="mt-4 text-12 font-medium text-foreground">
              {title}
            </h3>
            <p className="mt-2 text-10 leading-paragraph text-subtle">{body}</p>
            <p className="mt-3 inline-flex items-center gap-1 text-10 text-brand-red">
              进入能力 <ArrowRight className="size-3" />
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

/** 注册、验证码登录切换和找回密码三种鉴权表单。 */
export function WikiEmbedAuthRegisterRecovery() {
  return (
    <div
      className="grid w-[min(100%,54rem)] gap-3 lg:grid-cols-3"
      aria-hidden
      data-wiki-fixture="auth-register-recovery"
    >
      <AuthPanel
        title="验证码登录"
        subtitle="可切换邮箱 / 手机"
        icon={<KeyRound className="size-4" />}
      >
        <AuthField label="邮箱" value="you@university.edu" />
        <AuthCodeField />
        <AuthSubmit label="登录" />
        <p className="text-center text-9 text-faint">
          使用密码登录 · 还没有账号？立即注册
        </p>
      </AuthPanel>

      <AuthPanel
        title="注册 Scholay"
        subtitle="验证码与密码均需校验"
        icon={<UserRound className="size-4" />}
      >
        <AuthField label="邮箱" value="name@example.edu" />
        <AuthCodeField />
        <AuthField
          label="设置密码"
          value="至少 8 位，建议含字母和数字"
          secret
        />
        <p className="flex items-start gap-2 text-9 leading-paragraph text-subtle">
          <span className="mt-1 inline-flex size-3 items-center justify-center rounded-4 bg-brand-green text-on-dark">
            <Check className="size-2" />
          </span>
          我已阅读服务条款和隐私政策
        </p>
        <AuthSubmit label="注册并登录" />
      </AuthPanel>

      <AuthPanel
        title="找回密码"
        subtitle="验证账号后设置新密码"
        icon={<LockKeyhole className="size-4" />}
      >
        <AuthField label="邮箱" value="you@university.edu" />
        <AuthCodeField />
        <AuthField label="新密码" value="至少 8 位" secret />
        <AuthSubmit label="重置密码" />
        <p className="text-center text-9 text-brand-red">返回登录</p>
      </AuthPanel>
    </div>
  );
}

function AuthPanel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-12 border border-border bg-surface-card shadow-raised">
      <header className="border-b border-border bg-surface-1 px-4 py-3">
        <div className="flex items-center gap-2 text-12 font-medium text-foreground">
          {icon}
          {title}
        </div>
        <p className="mt-1 text-9 text-faint">{subtitle}</p>
      </header>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function AuthField({
  label,
  value,
  secret,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  return (
    <div>
      <p className="text-9 font-medium text-faint">{label}</p>
      <div className="mt-1 flex h-8 items-center rounded-8 border border-border px-3 text-10 text-subtle">
        {secret ? "••••••••" : value}
      </div>
    </div>
  );
}

function AuthCodeField() {
  return (
    <div>
      <p className="text-9 font-medium text-faint">验证码</p>
      <div className="mt-1 flex h-8 items-center rounded-8 border border-border pl-3 text-10 text-faint">
        <span className="flex-1">6 位数字</span>
        <span className="border-l border-border px-2 text-brand-red">
          发送验证码
        </span>
      </div>
    </div>
  );
}

function AuthSubmit({ label }: { label: string }) {
  return (
    <span className="inline-flex h-8 w-full items-center justify-center rounded-8 bg-brand-red text-10 font-medium text-on-dark">
      {label}
    </span>
  );
}

/** 账户资产页总览中的近期流水与月度用量热力图。 */
export function WikiEmbedBillingOverviewUsage() {
  const heat = [
    0, 1, 2, 0, 3, 4, 1, 0, 2, 1, 4, 3, 0, 0, 1, 2, 3, 4, 2, 1, 0, 3, 2, 4, 1,
    0, 2, 3, 1, 4, 2,
  ];
  return (
    <div
      className="grid w-[min(100%,50rem)] gap-4 lg:grid-cols-[1fr_18rem]"
      aria-hidden
      data-wiki-fixture="billing-overview-usage"
    >
      <section className="overflow-hidden rounded-12 border border-border bg-surface-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-13 font-medium text-foreground">近期流水</h3>
            <p className="mt-1 text-9 text-faint">
              经费余额的充值、活动与 AI 扣费
            </p>
          </div>
          <span className="text-10 text-brand-red">查看全部</span>
        </header>
        <div className="divide-y divide-border-hairline">
          {(
            [
              [
                "AI 使用 · Prism 编译修复",
                "今天 14:28",
                "− 4.2",
                "red",
                Sparkles,
              ],
              ["充值到账", "8 月 10 日", "+ 3,000", "green", CircleDollarSign],
              ["邀请活动奖励", "8 月 8 日", "+ 300", "green", Gift],
              ["AI 使用 · 智能审稿", "8 月 7 日", "− 18.6", "red", ShieldCheck],
            ] as Array<[string, string, string, string, LucideIcon]>
          ).map(([title, date, amount, tone, Icon]) => (
            <div
              key={String(title)}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span className="inline-flex size-8 items-center justify-center rounded-8 bg-surface-1">
                <Icon
                  className={
                    tone === "green"
                      ? "size-4 text-brand-green"
                      : "size-4 text-brand-red"
                  }
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-10 font-medium text-foreground">
                  {title}
                </p>
                <p className="mt-1 text-9 text-faint">{date}</p>
              </div>
              <span
                className={
                  tone === "green"
                    ? "text-11 font-medium tabular-nums text-brand-green"
                    : "text-11 font-medium tabular-nums text-brand-red"
                }
              >
                {amount}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-12 border border-border bg-surface-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-12 font-medium text-foreground">
              本月每日用量
            </h3>
            <p className="mt-1 text-9 text-faint">相对活跃度，不显示绝对额度</p>
          </div>
          <BarChart3 className="size-4 text-brand-green" />
        </div>
        <div className="mt-5 grid grid-cols-7 gap-1">
          {heat.map((level, index) => (
            <span
              key={index}
              className={
                level === 0
                  ? "aspect-square rounded-4 bg-surface-2"
                  : level === 1
                    ? "aspect-square rounded-4 bg-brand-green/20"
                    : level === 2
                      ? "aspect-square rounded-4 bg-brand-green/40"
                      : level === 3
                        ? "aspect-square rounded-4 bg-brand-green/70"
                        : "aspect-square rounded-4 bg-brand-green"
              }
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-9 text-faint">
          <span>8 月</span>
          <span className="flex items-center gap-1">
            少 <span className="size-3 rounded-4 bg-surface-2" />
            <span className="size-3 rounded-4 bg-brand-green/40" />
            <span className="size-3 rounded-4 bg-brand-green" /> 多
          </span>
        </div>
        <div className="mt-4 rounded-8 bg-brand-green-soft p-3">
          <p className="text-10 font-medium text-foreground">AI 周期额度</p>
          <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-card">
            <div className="h-full w-3/4 rounded-pill bg-brand-green" />
          </div>
          <p className="mt-2 text-9 text-subtle">
            剩余 75% · 周期结束后读取时恢复
          </p>
        </div>
      </section>
    </div>
  );
}

/** 头像下拉中的会员状态、账户设置入口与退出操作。 */
export function WikiEmbedUserAccountMenu() {
  return (
    <div
      className="w-[min(100%,20rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="user-account-menu"
    >
      <header className="flex items-center gap-3 border-b border-border p-4">
        <span className="inline-flex size-10 items-center justify-center rounded-pill bg-brand-green-soft font-serif text-16 text-brand-green">
          L
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-12 font-medium text-foreground">
            Lin Chen
          </p>
          <p className="mt-1 truncate text-9 text-faint">
            lin.chen@example.edu
          </p>
        </div>
        <ChevronDown className="size-3 text-faint" />
      </header>
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-3 rounded-8 bg-brand-amber-soft p-3">
          <Gem className="size-5 text-brand-amber" />
          <div className="flex-1">
            <p className="text-10 font-medium text-foreground">Free 会员</p>
            <p className="mt-1 text-9 text-subtle">升级获得更高 AI 周期额度</p>
          </div>
          <span className="rounded-4 bg-brand-red px-2 py-1 text-9 font-medium text-on-dark">
            升级
          </span>
        </div>
      </div>
      <nav className="p-2">
        {(
          [
            ["个人资料", UserRound],
            ["账户资产", WalletCards],
            ["安全设置", ShieldCheck],
            ["第三方连接", Globe2],
            ["帮助中心", HelpCircle],
          ] as Array<[string, LucideIcon]>
        ).map(([label, Icon], index) => (
          <div
            key={String(label)}
            className={
              index === 1
                ? "flex items-center gap-3 rounded-8 bg-surface-1 px-3 py-2"
                : "flex items-center gap-3 rounded-8 px-3 py-2"
            }
          >
            <Icon className="size-4 text-faint" />
            <span className="flex-1 text-10 text-subtle">{label}</span>
            <ChevronRight className="size-3 text-faint" />
          </div>
        ))}
      </nav>
      <footer className="border-t border-border p-2">
        <div className="flex items-center gap-3 rounded-8 px-3 py-2 text-10 text-brand-red">
          <LogOut className="size-4" />
          退出登录
        </div>
      </footer>
    </div>
  );
}

/** 功能总览与共用营销落地页的内容模板，不含顶部营销导航。 */
export function WikiEmbedMarketingLandingTemplate() {
  return (
    <div
      className="w-[min(100%,54rem)] overflow-hidden rounded-16 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="marketing-landing-template"
    >
      <section className="bg-foreground px-6 py-8 text-on-dark">
        <p className="text-10 font-medium uppercase text-brand-green">
          Scholay features
        </p>
        <div className="mt-3 grid gap-5 md:grid-cols-[1fr_18rem] md:items-end">
          <div>
            <h2 className="font-serif text-28 font-medium leading-display">
              把研究材料，变成可核对的工作流
            </h2>
            <p className="mt-3 max-w-xl text-11 leading-paragraph text-on-dark-muted">
              功能介绍页解释愿景与入口；真正的限制、数据与外部动作，以产品工作区和即时提示为准。
            </p>
          </div>
          <div className="rounded-12 border border-border-strong bg-surface-inverse p-4">
            <p className="text-10 text-on-dark-muted">本页 CTA</p>
            <span className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-8 bg-brand-red text-10 font-medium text-on-dark">
              进入真实工作区 <ArrowRight className="size-3" />
            </span>
          </div>
        </div>
      </section>

      <section className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-10 font-medium text-brand-red">功能总览</p>
            <h3 className="mt-1 font-serif text-20 font-medium text-foreground">
              选择你的下一步
            </h3>
          </div>
          <span className="text-9 text-faint">6 个产品工作区</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["学术搜索", Search, "检索、筛选与暂存"],
              ["个人文献集", Library, "整理、分享与 PDF"],
              ["Prism", FileText, "结构化写作与编译"],
              ["Claw", Sparkles, "研究对话与交付物"],
              ["智能审稿", ShieldCheck, "投稿前风险检查"],
              ["功能广场", Menu, "工具与社区 Skills"],
            ] as Array<[string, LucideIcon, string]>
          ).map(([title, Icon, body], index) => (
            <article
              key={String(title)}
              className={
                index === 3
                  ? "rounded-12 bg-foreground p-3 text-on-dark"
                  : "rounded-12 border border-border bg-surface-1 p-3"
              }
            >
              <Icon
                className={
                  index === 3
                    ? "size-5 text-brand-green"
                    : "size-5 text-brand-red"
                }
              />
              <h4
                className={
                  index === 3
                    ? "mt-3 text-11 font-medium text-on-dark"
                    : "mt-3 text-11 font-medium text-foreground"
                }
              >
                {title}
              </h4>
              <p
                className={
                  index === 3
                    ? "mt-1 text-9 text-on-dark-muted"
                    : "mt-1 text-9 text-faint"
                }
              >
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid border-t border-border bg-brand-amber-soft md:grid-cols-[1fr_1fr]">
        <div className="border-b border-border p-5 md:border-b-0 md:border-r">
          <p className="text-10 font-medium text-brand-amber">标准落地页结构</p>
          <ol className="mt-3 space-y-2">
            {[
              "价值主张与 CTA",
              "信任条与核心能力",
              "工作流与使用场景",
              "比较、数字、FAQ 与底部 CTA",
            ].map((item, index) => (
              <li
                key={item}
                className="flex items-center gap-2 text-10 text-subtle"
              >
                <span className="inline-flex size-5 items-center justify-center rounded-pill bg-surface-card text-9 text-brand-amber">
                  {index + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </div>
        <div className="p-5">
          <p className="text-10 font-medium text-brand-red">实装边界</p>
          <p className="mt-3 text-10 leading-paragraph text-subtle">
            Zotero / EndNote
            等占位、真实投稿、多人实时协作与静态宣传数字不能因落地页出现就视为已实装。Wiki
            应把愿景留在营销语境，并指向现行工作区事实。
          </p>
          <div className="mt-4 flex items-center gap-2 text-9 text-faint">
            <CheckCircle2 className="size-3 text-brand-green" /> 真实入口可验证{" "}
            <span>·</span>
            <ExternalLink className="size-3" /> 外部动作需另行确认
          </div>
        </div>
      </section>
    </div>
  );
}
