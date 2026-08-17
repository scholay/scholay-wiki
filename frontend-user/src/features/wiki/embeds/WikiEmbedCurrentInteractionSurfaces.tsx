import {
  Gift,
  Moon,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserPlus,
  Wallet,
} from "lucide-react";
import { RhinoRunLoader } from "@/shared/components/RhinoRunLoader";

const INVITE_SCENES = [
  {
    label: "填写邀请码",
    Icon: Gift,
    tone: "border-brand-green/40 text-brand-green",
  },
  {
    label: "推广有好礼",
    Icon: UserPlus,
    tone: "border-brand-red/40 text-brand-red",
  },
  {
    label: "获取邀请码",
    Icon: QrCode,
    tone: "border-border-strong text-foreground",
  },
] as const;

export function WikiEmbedInviteNavHub() {
  return (
    <div
      className="w-[44rem] max-w-full overflow-hidden rounded-16 border border-border bg-background shadow-raised"
      aria-hidden
      data-wiki-fixture="invite-nav-hub"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-1 px-4 py-3">
        {INVITE_SCENES.slice(0, 1).map(({ label, Icon, tone }) => (
          <span
            key={label}
            className={`inline-flex items-center gap-1.5 rounded-8 border bg-background px-3 py-2 text-12 ${tone}`}
          >
            <Icon className="size-3.5" />
            {label}
            <span className="ml-1 text-faint">5s</span>
          </span>
        ))}
        <span className="text-12 text-faint">
          下一态：推广有好礼 → 获取邀请码
        </span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_12rem]">
        <div>
          <p className="m-0 text-16 font-medium text-foreground">
            填写邀请码可获得奖励
          </p>
          <p className="mt-1 text-12 text-muted-foreground">
            未填码时，顶栏在三种场景间每 5 秒轮播；填码后只保留“推广有好礼”。
          </p>
          <div className="mt-4 flex gap-2">
            <span className="flex-1 rounded-8 border border-border px-3 py-2 text-12 text-faint">
              请输入邀请码
            </span>
            <span className="rounded-8 bg-foreground px-3 py-2 text-12 text-on-inverse">
              确认
            </span>
          </div>
        </div>
        <div className="flex min-h-28 flex-col items-center justify-center rounded-12 bg-surface-2 text-center">
          <QrCode className="size-8 text-foreground" />
          <p className="mb-0 mt-2 text-12 text-muted-foreground">
            扫码获取邀请码
          </p>
        </div>
      </div>
    </div>
  );
}

export function WikiEmbedFundsReminder() {
  return (
    <div
      className="w-[40rem] max-w-full overflow-hidden rounded-16 border border-brand-amber/30 bg-background shadow-raised"
      aria-hidden
      data-wiki-fixture="funds-reminder"
    >
      <div className="flex items-start gap-3 bg-warning-soft px-4 py-3">
        <Wallet className="mt-0.5 size-4 shrink-0 text-brand-amber" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-14 font-medium text-foreground">额度已用完</p>
          <p className="m-0 text-12 text-muted-foreground">
            账户内仍有经费 ¥36，可开启“用经费继续”。明日 09:30 恢复满额。
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-y border-brand-amber/20 px-4 py-3">
        <RefreshCw className="size-4 text-brand-amber" />
        <p className="m-0 min-w-0 flex-1 text-12 text-foreground">
          可立即恢复 2 次，不消耗经费
        </p>
        <span className="rounded-8 bg-foreground px-3 py-2 text-12 text-on-inverse">
          立即恢复
        </span>
      </div>
      <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
        {["升级 Max", "用经费继续"].map((label, index) => (
          <span
            key={label}
            className={`rounded-8 border px-3 py-2 text-12 ${
              index === 0
                ? "border-foreground bg-foreground text-on-inverse"
                : "border-border bg-background text-foreground"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <p className="m-0 bg-surface-1 px-4 py-2 text-12 text-faint">
        此图为 Pro 且账户有经费的代表状态。Free
        档显示“升级会员”；无余额时改为“充值经费”。
      </p>
    </div>
  );
}

export function WikiEmbedOAuthConfirm() {
  return (
    <div
      className="w-[24rem] max-w-full rounded-16 border border-border bg-background p-5 text-center shadow-raised"
      aria-hidden
      data-wiki-fixture="oauth-confirm"
    >
      <span className="mx-auto flex size-16 items-center justify-center rounded-16 border border-border bg-surface-1 text-foreground">
        <ShieldCheck className="size-8" />
      </span>
      <p className="mb-0 mt-3 text-16 font-medium text-foreground">ORCID</p>
      <p className="m-0 text-12 text-muted-foreground">
        授权完成后即可登录或注册
      </p>
      <div className="mt-5 rounded-8 border border-border px-3 py-2 text-left text-12 text-faint">
        邀请码（选填，可先校验）
      </div>
      <span className="mt-5 block rounded-8 bg-foreground px-4 py-2.5 text-14 font-medium text-on-inverse">
        前往 ORCID 授权
      </span>
      <p className="mb-0 mt-3 text-12 text-faint">
        选择第三方方式后先确认，不会立即离开 Scholay。
      </p>
    </div>
  );
}

export function WikiEmbedThemeAndRhinoLoading() {
  return (
    <div
      className="grid w-[42rem] max-w-full overflow-hidden rounded-16 border border-border bg-background shadow-raised sm:grid-cols-2"
      aria-hidden
      data-wiki-fixture="theme-and-rhino-loading"
    >
      <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
        <p className="m-0 text-14 font-medium text-foreground">全站日夜切换</p>
        <p className="mt-1 text-12 text-muted-foreground">
          顶栏切换整个产品主题；Wiki 内部主题仍由独立设置管理。
        </p>
        <div className="mt-4 flex gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-8 border border-foreground bg-foreground px-3 py-2 text-12 text-on-inverse">
            <Moon className="size-3.5" /> 夜间
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-8 border border-border px-3 py-2 text-12 text-foreground">
            <Sun className="size-3.5" /> 日间
          </span>
        </div>
      </div>
      <div className="relative flex min-h-44 items-center justify-center overflow-hidden bg-foreground/40 p-4">
        <div className="absolute inset-0 backdrop-blur-2" />
        <div className="relative text-center">
          <RhinoRunLoader label="正在加载" className="mx-auto" />
          <p className="mb-0 mt-2 text-12 font-medium text-on-dark">
            彩色牛犀犀 · 全站唯一加载蒙层
          </p>
        </div>
      </div>
    </div>
  );
}
