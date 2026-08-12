import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

const STATES = [
  {
    label: "处理中",
    copy: "正在完成 GitHub 登录…",
    icon: LoaderCircle,
    iconTone: "text-muted-foreground",
    badge: "回调校验",
  },
  {
    label: "成功",
    copy: "登录成功，正在跳转…",
    icon: CheckCircle2,
    iconTone: "text-brand-green",
    badge: "会话已建立",
  },
  {
    label: "失败",
    copy: "回调参数不完整",
    icon: AlertCircle,
    iconTone: "text-brand-red",
    badge: "可返回首页重试",
  },
] as const;

/**
 * OAuth / 微信登录回调状态 · 纯样式 fixture。
 * 来源：product-mock auth/pages/OAuthCallbackPage.tsx + WeChatCallbackPage.tsx。
 */
export function WikiEmbedOAuthCallbackStates() {
  return (
    <div
      className="grid w-[min(100%,44rem)] gap-3 md:grid-cols-3"
      aria-hidden
      data-wiki-fixture="oauth-callback-states"
    >
      {STATES.map(({ label, copy, icon: Icon, iconTone, badge }) => (
        <section
          key={label}
          className="flex min-h-44 flex-col items-center justify-center rounded-12 border border-border bg-surface-card p-6 text-center"
        >
          <Icon className={`size-7 ${iconTone}`} />
          <p className="mt-3 text-14 font-medium text-foreground">{label}</p>
          <p className="mt-1 text-12 text-muted-foreground">{copy}</p>
          <span className="mt-4 rounded-pill bg-surface-1 px-2 py-1 text-12 text-faint">
            {badge}
          </span>
        </section>
      ))}
    </div>
  );
}
