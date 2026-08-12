import { X } from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { ProviderLogo, type Provider } from "@/shared/components/ProviderLogo";

const PROVIDERS: Array<{ id: Provider; label: string }> = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
  { id: "wechat", label: "微信" },
  { id: "orcid", label: "ORCID" },
];

/** AuthDialog 的桌面登录态；提供方为静态代表集，真实入口仍由公开配置决定。 */
export function WikiEmbedAuthDialog() {
  return (
    <div
      className="relative w-[min(100%,28rem)] min-w-0 overflow-x-hidden rounded-16 border border-border bg-surface-card shadow-overlay [--auth-body-pad:1.25rem] [--auth-header-top:1.75rem] [--auth-segment-pad:0.125rem]"
      aria-hidden
      data-wiki-fixture="auth-dialog"
    >
      <span className="absolute right-4 top-4 inline-flex size-6 items-center justify-center rounded-4 text-faint">
        <X className="size-4" />
      </span>
      <div className="flex flex-col items-center gap-1 border-b border-border-soft px-6 pb-4 pt-[var(--auth-header-top)]">
        <BrandLogo size="md" />
        <p className="mt-2 text-16 font-medium text-foreground">欢迎回来</p>
        <p className="text-12 text-muted-foreground">继续你的学术之旅</p>
      </div>

      <div className="min-w-0 px-6 py-[var(--auth-body-pad)]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-12 bg-surface-2 p-[var(--auth-segment-pad)] text-12">
              <span className="inline-flex h-7 items-center rounded-8 bg-surface-card px-3 text-foreground shadow-raised">
                邮箱
              </span>
              <span className="inline-flex h-7 items-center rounded-8 px-3 text-muted-foreground">
                手机号
              </span>
            </div>
            <span className="text-12 text-muted-foreground">
              使用验证码登录
            </span>
          </div>

          <AuthField label="邮箱" value="you@example.com" />
          <AuthField label="密码" value="至少 8 位" password />

          <span className="inline-flex h-10 w-full items-center justify-center rounded-8 bg-brand-red text-14 font-medium text-on-brand">
            登录
          </span>

          <p className="text-center text-12 leading-paragraph text-faint">
            登录即表示同意
            <span className="mx-1 text-muted-foreground underline underline-offset-2">
              服务条款
            </span>
            与
            <span className="ml-1 text-muted-foreground underline underline-offset-2">
              隐私政策
            </span>
          </p>

          <div className="flex items-center justify-between text-12 text-muted-foreground">
            <span>忘记密码?</span>
            <span>还没有账号? 立即注册</span>
          </div>
        </div>
      </div>

      <div className="min-w-0 px-6 pb-6">
        <div className="my-3 flex items-center">
          <div className="h-px flex-1 bg-border" />
          <span className="px-3 text-12 uppercase text-faint">或继续使用</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PROVIDERS.map((provider) => (
            <span
              key={provider.id}
              title={provider.label}
              className="inline-flex size-9 items-center justify-center rounded-8 border border-border text-subtle"
            >
              <ProviderLogo provider={provider.id} className="size-4" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** ForgotPasswordForm 的桌面邮箱初始态；不包含发送中、倒计时或提交结果。 */
export function WikiEmbedForgotPasswordEmail() {
  return (
    <div
      className="relative w-[min(100%,28rem)] min-w-0 overflow-x-hidden rounded-16 border border-border bg-surface-card shadow-overlay [--auth-body-pad:1.25rem] [--auth-header-top:1.75rem] [--auth-segment-pad:0.125rem]"
      aria-hidden
      data-wiki-fixture="auth-password-recovery-email"
    >
      <span className="absolute right-4 top-4 inline-flex size-6 items-center justify-center rounded-4 text-faint">
        <X className="size-4" />
      </span>

      <div className="flex flex-col items-center gap-1 border-b border-border-soft px-6 pb-4 pt-[var(--auth-header-top)]">
        <BrandLogo size="md" />
        <p className="mt-2 text-16 font-medium text-foreground">找回密码</p>
        <p className="text-12 text-muted-foreground">通过验证码重置你的密码</p>
      </div>

      <div className="min-w-0 px-6 py-[var(--auth-body-pad)]">
        <div className="space-y-4">
          <div className="inline-flex items-center rounded-12 bg-surface-2 p-[var(--auth-segment-pad)] text-12">
            <span className="inline-flex h-7 items-center rounded-8 bg-surface-card px-3 text-foreground shadow-raised">
              邮箱
            </span>
            <span className="inline-flex h-7 items-center rounded-8 px-3 text-muted-foreground">
              手机号
            </span>
          </div>

          <AuthField label="邮箱" value="" />

          <div className="space-y-2">
            <p className="text-12 font-medium text-foreground">验证码</p>
            <div className="flex gap-2">
              <span className="flex h-10 min-w-0 flex-1 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-faint" />
              <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-pill border border-border-control-emphasis bg-surface-card px-2.5 text-14 font-medium text-foreground">
                获取验证码
              </span>
            </div>
          </div>

          <AuthField label="新密码" value="至少 8 位" />

          <span className="inline-flex h-10 w-full items-center justify-center rounded-pill bg-primary text-14 font-medium text-primary-foreground">
            重置密码
          </span>

          <p className="text-center text-12 text-muted-foreground">
            想起来了? <span className="text-foreground">返回登录</span>
          </p>
        </div>
      </div>

      <div className="min-w-0 px-6 pb-6">
        <div className="my-3 flex items-center">
          <div className="h-px flex-1 bg-border" />
          <span className="px-3 text-12 uppercase text-faint">或继续使用</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PROVIDERS.map((provider) => (
            <span
              key={provider.id}
              title={provider.label}
              className="inline-flex size-9 items-center justify-center rounded-8 border border-border text-subtle"
            >
              <ProviderLogo provider={provider.id} className="size-4" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuthField({
  label,
  value,
  password = false,
}: {
  label: string;
  value: string;
  password?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-12 font-medium text-foreground">{label}</p>
      <div className="flex h-10 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-faint">
        {password ? "••••••••" : value}
      </div>
    </div>
  );
}
