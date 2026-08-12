import { ExternalLink, Gift, TicketCheck, X } from "lucide-react";

/**
 * 注册壳内展开的邀请码输入态 · 纯样式 fixture。
 * 来源：current auth/components/InviteAuthNotice.tsx；活动奖励数据已冻结。
 */
export function WikiEmbedInviteCodeField() {
  return (
    <div
      className="relative w-[28rem] max-w-full min-w-0 overflow-hidden rounded-12 border border-brand-green/30 bg-brand-green/5 p-3 pl-4"
      aria-hidden
      data-wiki-fixture="invite-code-field"
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-brand-green" />
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-green/10 text-brand-green">
          <TicketCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-14 font-medium text-foreground">填写好友邀请码</p>
          <p
            className="text-14 font-medium text-brand-green"
            style={{ marginTop: 2 }}
          >
            获得 20 经费
          </p>
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-8 text-faint">
          <X className="size-3.5" />
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex h-9 min-w-0 flex-1 items-center rounded-8 border border-border bg-surface-card px-3 font-mono text-12 tracking-code text-faint">
          输入邀请码
        </div>
        <span className="inline-flex h-9 shrink-0 items-center rounded-pill border border-brand-green bg-brand-green px-4 text-14 font-medium text-on-brand">
          确认
        </span>
      </div>
      <span className="mt-2 inline-flex items-center gap-1 text-12 font-medium text-brand-green">
        没有邀请码？查看获取方式
        <ExternalLink className="size-3" />
      </span>
    </div>
  );
}

/**
 * 注册完成后一次性补填提示 · 纯样式 fixture。
 * 来源：current auth/components/PostRegisterInviteDialog.tsx。
 */
export function WikiEmbedInviteCodePrompt() {
  return (
    <div
      className="relative w-[28rem] max-w-full overflow-hidden rounded-16 border border-border bg-surface-card p-6 shadow-overlay"
      aria-hidden
      data-wiki-fixture="invite-code-prompt"
    >
      <X className="absolute right-4 top-4 size-4 text-muted-foreground" />

      <div className="flex min-w-0 items-start gap-3 pr-8">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-12 bg-brand-red/10 text-brand-red">
          <Gift className="size-5" />
        </span>
        <div className="min-w-0" style={{ paddingTop: 2 }}>
          <p className="text-20 font-medium text-foreground">
            填写邀请码，领取邀请礼
          </p>
          <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
            注册后 7 天内仍可补填并完成关联。
          </p>
        </div>
      </div>

      <div className="mt-4 flex min-w-0 items-center justify-between gap-3 rounded-12 border border-brand-green/25 bg-brand-green/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-brand-green">
          <TicketCheck className="size-4 shrink-0" />
          <span className="text-12 font-medium">你可领取</span>
        </div>
        <strong className="shrink-0 text-20 font-medium tabular-nums text-foreground">
          20
          <span className="ml-1 text-12 font-normal text-muted-foreground">
            经费
          </span>
        </strong>
      </div>

      <div className="mt-4 flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <span className="inline-flex h-9 items-center justify-center gap-2 rounded-8 px-3 text-14 font-medium text-foreground">
          获取邀请码
          <ExternalLink className="size-3.5" />
        </span>
        <span className="inline-flex h-9 items-center justify-center gap-2 rounded-pill bg-foreground px-3 text-14 font-medium text-on-brand">
          <TicketCheck className="size-4" />
          立即填写
        </span>
      </div>
    </div>
  );
}
