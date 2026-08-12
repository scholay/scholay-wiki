import { ArrowRight, LogIn } from "lucide-react";

/**
 * OAuth 邮箱冲突后的未登录确认态 · 纯样式 fixture。
 * 来源：current auth/components/OAuthMergeConfirmDialog.tsx；该组件实际为回调页内容，不是 Dialog 卡片。
 */
export function WikiEmbedOAuthAccountMerge() {
  return (
    <div
      className="flex w-full max-w-md flex-col items-center"
      style={{ gap: 20 }}
      aria-hidden
      data-wiki-fixture="oauth-account-merge"
    >
      <h1 className="font-display text-24 font-medium italic text-foreground">
        发现已存在的账号
      </h1>
      <p className="max-w-md text-center text-12 leading-paragraph text-subtle">
        你的 <span className="font-medium text-foreground">GitHub</span>{" "}
        账号邮箱{" "}
        <span className="font-medium text-foreground">liang@example.edu</span>{" "}
        已被 Scholay 上一个账号注册。请选择:
      </p>

      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="flex flex-col items-start gap-2 rounded-16 border-2 border-foreground bg-surface-card p-4 text-left">
          <div className="flex w-full items-center justify-between">
            <span className="text-14 font-medium text-foreground">
              登录该账号后绑定 <span className="text-brand-amber">(推荐)</span>
            </span>
            <LogIn className="size-4 text-foreground" />
          </div>
          <p className="text-12 leading-paragraph text-muted-foreground">
            出于安全,需先登录邮箱为{" "}
            <span className="text-foreground">liang@example.edu</span>{" "}
            的账号,确认它确实属于你,再绑定 GitHub。
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 rounded-16 border border-border bg-surface-card p-4 text-left">
          <div className="flex w-full items-center justify-between">
            <span className="text-14 font-medium text-foreground">
              新建一个独立账号
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
          <p className="text-12 leading-paragraph text-muted-foreground">
            创建一个新的 Scholay 账号,只能用 GitHub
            登录(没有邮箱)。两个账号互不相干,数据不共享。
          </p>
        </div>
      </div>

      <span className="inline-flex h-7 items-center rounded-8 px-3 text-12 text-muted-foreground">
        取消并返回首页
      </span>
    </div>
  );
}
