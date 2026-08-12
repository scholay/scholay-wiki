import { ArrowRight, Clock3, LogIn, ShieldCheck } from "lucide-react";

/**
 * OAuth 邮箱冲突合并确认 · 纯样式 fixture。
 * 来源：product-mock auth/components/OAuthMergeConfirmDialog.tsx。
 */
export function WikiEmbedOAuthAccountMerge() {
  return (
    <div
      className="w-[min(100%,32rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="oauth-account-merge"
    >
      <div className="text-center">
        <span className="mx-auto inline-flex size-10 items-center justify-center rounded-pill bg-brand-amber-soft text-brand-amber">
          <ShieldCheck className="size-5" />
        </span>
        <p className="mt-3 font-serif text-24 font-medium italic text-foreground">
          发现已存在的账号
        </p>
        <p className="mx-auto mt-2 max-w-md text-12 leading-paragraph text-muted-foreground">
          GitHub 账号邮箱{" "}
          <span className="font-medium text-foreground">l***@example.edu</span>
          已被 Scholay 上的账号注册，请选择处理方式。
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <div className="rounded-8 border-2 border-foreground bg-surface-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-14 font-medium text-foreground">
              登录该账号后绑定
              <span className="ml-1 text-brand-amber">（推荐）</span>
            </p>
            <LogIn className="size-4 shrink-0 text-foreground" />
          </div>
          <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
            出于安全，需要先登录目标邮箱对应的账号，确认它确实属于你，再绑定
            GitHub。
          </p>
        </div>

        <div className="rounded-8 border border-border bg-surface-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-14 font-medium text-foreground">
              新建一个独立账号
            </p>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </div>
          <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
            新账号只能使用 GitHub 登录；两个账号互不相干，数据不共享。
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-8 bg-surface-1 p-3 text-12 text-faint">
        <Clock3 className="mt-1 size-3 shrink-0" />
        合并链接 10 分钟后失效；仅持有合并链接不能直接接管已有账号。
      </div>
    </div>
  );
}
