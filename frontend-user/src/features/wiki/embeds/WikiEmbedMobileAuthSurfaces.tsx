import { Compass, LayoutGrid, User, X } from "lucide-react";
import { WikiEmbedBrandLogo } from "./WikiEmbedBrandLogo";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";
import { ProviderLogo, type Provider } from "@/shared/components/ProviderLogo";

const PROVIDERS: Array<{ key: Provider; label: string }> = [
  { key: "github", label: "GitHub" },
  { key: "google", label: "Google" },
  { key: "orcid", label: "ORCID" },
];

/** MobileAuthSheet 在未登录「我的」页上的登录冻结态。 */
export function WikiEmbedMobileAuthSurfaces() {
  return (
    <div
      className="relative flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-auth-surfaces"
    >
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
        <WikiEmbedBrandLogo size="lg" />
        <h2
          className="text-20 font-medium text-foreground"
          style={{ marginTop: 20 }}
        >
          登录 Scholay
        </h2>
        <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
          登录后查看你的会员、科研经费、文件夹与设置
        </p>
        <div
          className="flex w-full max-w-xs flex-col gap-3"
          style={{ marginTop: 28 }}
        >
          <span className="flex h-12 items-center justify-center rounded-8 bg-brand-red text-14 font-medium text-on-brand">
            登录
          </span>
          <span className="flex h-12 items-center justify-center rounded-8 border border-border-button bg-surface-card text-14 text-foreground">
            注册新账号
          </span>
        </div>
      </main>
      <MobileNav />

      <div className="absolute inset-0 bg-foreground/40" />
      <section className="absolute inset-x-0 bottom-0 flex max-h-[92%] flex-col rounded-t-16 bg-surface-card shadow-overlay">
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <span className="h-1 w-9 rounded-pill bg-border-strong" />
        </div>

        <div className="relative flex shrink-0 flex-col items-center gap-1 px-6 pb-3 pt-1 text-center">
          <span className="absolute right-0 top-0 flex size-8 items-center justify-center rounded-pill text-muted-foreground">
            <X className="size-5" />
          </span>
          <WikiEmbedBrandLogo size="md" />
          <h2 className="mt-2 text-16 font-medium text-foreground">欢迎回来</h2>
          <p className="text-12 text-muted-foreground">继续你的学术之旅</p>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-6 pb-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center rounded-12 bg-surface-2 p-1 text-12">
                <span className="flex h-7 items-center rounded-8 bg-surface-card px-3 text-foreground shadow-raised">
                  邮箱
                </span>
                <span className="flex h-7 items-center px-3 text-muted-foreground">
                  手机号
                </span>
              </div>
              <span className="text-12 text-muted-foreground">
                使用验证码登录
              </span>
            </div>

            <Field label="邮箱" placeholder="you@example.com" />
            <Field label="密码" placeholder="至少 8 位" secret />

            <span className="flex h-12 items-center justify-center rounded-12 bg-brand-red text-14 font-medium text-on-brand">
              登录
            </span>

            <p className="text-center text-12 leading-paragraph text-faint">
              登录即表示同意 <span className="underline">服务条款</span> 与{` `}
              <span className="underline">隐私政策</span>
            </p>

            <div className="flex items-center justify-between text-12 text-muted-foreground">
              <span>忘记密码?</span>
              <span>还没有账号? 立即注册</span>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center">
              <span className="h-px flex-1 bg-border" />
              <span className="px-3 text-12 text-faint">或继续使用</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {PROVIDERS.map((provider) => (
                <span
                  key={provider.key}
                  title={provider.label}
                  className="inline-flex size-9 items-center justify-center rounded-8 border border-border text-subtle"
                >
                  <ProviderLogo provider={provider.key} className="size-4" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  placeholder,
  secret = false,
}: {
  label: string;
  placeholder: string;
  secret?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-12 text-subtle">{label}</span>
      <span className="flex h-12 items-center rounded-12 border border-border px-3 text-14 text-faint">
        {secret ? "••••••••" : placeholder}
      </span>
    </label>
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
