import { BrandLogo } from "@/shared/components/BrandLogo";

/**
 * 登录弹窗壳 · 纯样式 fixture。
 * 对齐 product-mock AuthDialog(login)外观；无表单逻辑 / OAuth / Turnstile。
 */
export function WikiEmbedAuthDialog() {
  return (
    <div
      className="w-[min(100%,28rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="auth-dialog"
    >
      <div className="flex flex-col items-center gap-1 border-b border-border-soft px-6 pb-4 pt-8">
        <BrandLogo size="md" />
        <p className="mt-2 text-16 font-medium text-foreground">欢迎回来</p>
        <p className="text-12 text-muted-foreground">继续你的学术之旅</p>
      </div>

      <div className="space-y-4 px-6 py-6">
        <div className="flex gap-2">
          <span className="inline-flex h-8 flex-1 items-center justify-center rounded-8 bg-foreground text-12 font-medium text-on-dark">
            邮箱
          </span>
          <span className="inline-flex h-8 flex-1 items-center justify-center rounded-8 border border-border text-12 text-muted-foreground">
            手机
          </span>
        </div>

        <div className="space-y-2">
          <p className="text-12 text-subtle">邮箱</p>
          <div className="flex h-10 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-faint">
            you@university.edu
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-12 text-subtle">密码</p>
            <span className="text-12 text-brand-red">忘记密码?</span>
          </div>
          <div className="flex h-10 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-faint">
            ••••••••
          </div>
        </div>

        <span className="inline-flex h-10 w-full items-center justify-center rounded-8 bg-brand-red text-14 font-medium text-on-dark">
          登录
        </span>
      </div>

      <div className="px-6 pb-6">
        <div className="relative my-3 flex items-center">
          <div className="h-px flex-1 bg-border" />
          <span className="px-3 text-12 text-faint">或继续使用</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {["GitHub", "微信", "Google", "ORCID"].map((label) => (
            <span
              key={label}
              className="inline-flex h-9 items-center rounded-8 border border-border px-3 text-12 text-subtle"
            >
              {label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-center text-12 leading-paragraph text-faint">
          第三方登录为入口示例，实际显示项由后台配置决定。
        </p>
      </div>
    </div>
  );
}
