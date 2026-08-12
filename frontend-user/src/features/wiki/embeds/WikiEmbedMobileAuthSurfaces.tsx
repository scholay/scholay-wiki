import { Compass, LayoutGrid, User, X } from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";

/** /m/auth 整页与 MobileAuthSheet 就地登录的并列代表态。 */
export function WikiEmbedMobileAuthSurfaces() {
  return (
    <div
      className="grid w-[min(100%,50rem)] gap-4 md:grid-cols-2"
      aria-hidden
      data-wiki-fixture="mobile-auth-surfaces"
    >
      <section className="overflow-hidden rounded-20 border border-border bg-surface-card">
        <SurfaceLabel label="整页认证" route="/m/auth" />
        <div className="flex min-h-[38rem] flex-col">
          <div className="flex flex-1 flex-col overflow-hidden px-6 pb-8">
            <div className="flex flex-col items-center pb-8 pt-10 text-center">
              <BrandLogo size="lg" />
              <h2 className="mt-6 text-24 font-medium text-foreground">
                欢迎回来
              </h2>
              <p className="mt-2 text-14 text-muted-foreground">
                继续你的学术之旅
              </p>
            </div>
            <AuthForm />
            <OAuthDivider />
          </div>
          <MobileNav />
        </div>
      </section>

      <section className="overflow-hidden rounded-20 border border-border bg-surface-1">
        <SurfaceLabel label="就地登录 Sheet" route="MobileAuthSheet" />
        <div className="relative flex min-h-[38rem] flex-col overflow-hidden">
          <div className="flex flex-1 flex-col items-center justify-center bg-surface-1 px-8 text-center opacity-60">
            <BrandLogo size="lg" />
            <h2 className="mt-6 text-20 font-medium text-foreground">
              登录 Scholay
            </h2>
            <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
              登录后查看会员、科研经费、文献集与设置
            </p>
          </div>
          <div className="absolute inset-0 bg-foreground/30" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-20 bg-surface-card px-6 pb-8 pt-3 shadow-overlay">
            <div className="mx-auto mb-3 h-1 w-10 rounded-pill bg-border-strong" />
            <div className="relative flex flex-col items-center pb-3 text-center">
              <X className="absolute right-0 top-0 size-5 text-muted-foreground" />
              <BrandLogo size="md" />
              <h2 className="mt-2 text-18 font-medium text-foreground">
                欢迎回来
              </h2>
              <p className="text-12 text-muted-foreground">继续你的学术之旅</p>
            </div>
            <AuthForm compact />
            <OAuthDivider compact />
          </div>
        </div>
      </section>
    </div>
  );
}

function SurfaceLabel({ label, route }: { label: string; route: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-2 text-12">
      <span className="font-medium text-subtle">{label}</span>
      <code className="text-faint">{route}</code>
    </div>
  );
}

function AuthForm({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-center justify-between">
        <div className="flex rounded-pill bg-surface-2 p-1 text-12">
          <span className="rounded-pill bg-surface-card px-3 py-1 font-medium text-foreground shadow-raised">
            邮箱
          </span>
          <span className="px-3 py-1 text-muted-foreground">手机</span>
        </div>
        <span className="text-12 text-muted-foreground">使用验证码登录</span>
      </div>

      <label className="block space-y-2">
        <span className="text-12 text-subtle">邮箱</span>
        <span className="flex h-12 items-center rounded-12 border border-border px-3 text-14 text-faint">
          you@example.com
        </span>
      </label>
      <label className="block space-y-2">
        <span className="text-12 text-subtle">密码</span>
        <span className="flex h-12 items-center rounded-12 border border-border px-3 text-14 text-faint">
          ••••••••
        </span>
      </label>
      <span className="flex h-12 items-center justify-center rounded-12 bg-brand-red text-16 font-medium text-on-dark">
        登录
      </span>
      {!compact ? (
        <>
          <p className="text-center text-12 leading-paragraph text-faint">
            登录即表示同意服务条款与隐私政策
          </p>
          <div className="flex justify-between text-12 text-muted-foreground">
            <span>忘记密码?</span>
            <span>还没有账号? 立即注册</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function OAuthDivider({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "mt-4" : "mt-8"}>
      <div className="flex items-center">
        <span className="h-px flex-1 bg-border" />
        <span className="px-3 text-12 text-faint">或继续使用</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-12 text-subtle">
        {["GitHub", "Google", "ORCID"].map((provider) => (
          <span
            key={provider}
            className="rounded-8 border border-border px-2 py-2"
          >
            {provider}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-12 text-faint">
        移动端不提供微信扫码入口
      </p>
    </div>
  );
}

function MobileNav() {
  return (
    <footer className="grid h-16 grid-cols-4 border-t border-border px-2">
      <MobileNavItem icon={Compass} label="浏览" />
      <MobileNavItem icon={ClawBrandIcon} label="AI Claw" />
      <MobileNavItem icon={LayoutGrid} label="功能" />
      <MobileNavItem icon={User} label="我的" active />
    </footer>
  );
}

function MobileNavItem({
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
