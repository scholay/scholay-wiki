import {
  CheckCircle2,
  ExternalLink,
  Gift,
  Ticket,
  TicketCheck,
  X,
} from "lucide-react";

/**
 * 注册邀请码的两个静态表面。
 * 视觉来源：product-mock 的 InvitationCodeField / InviteCodePromptDialog；
 * 语义按现行 InviteAuthNotice / PostRegisterInviteDialog / InviteFlowController 校正。
 */
export function WikiEmbedInviteCodeField() {
  return (
    <div
      className="w-[min(100%,34rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="invite-code-field"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-14 font-medium text-foreground">注册时填写</p>
          <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
            邀请码不是注册必填项，可以直接跳过。
          </p>
        </div>
        <span className="rounded-pill bg-surface-2 px-2 py-1 text-12 text-faint">
          选填
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-12 font-medium text-foreground">
          <Ticket className="size-4 text-faint" />
          邀请码
          <span className="font-normal text-muted-foreground">（选填）</span>
        </div>
        <div className="flex min-w-0 gap-2">
          <span className="flex h-control-lg min-w-0 flex-1 items-center rounded-8 border border-border px-3 font-mono text-12 tracking-code text-faint">
            输入好友邀请码
          </span>
          <span className="inline-flex h-control-lg shrink-0 items-center rounded-8 bg-brand-green px-4 text-12 font-medium text-on-brand">
            确认
          </span>
        </div>
        <p className="mt-2 text-12 leading-paragraph text-faint">
          先校验有效性；校验成功后才保存为本次注册的候选码。
        </p>
      </div>

      <div className="mt-4 flex min-w-0 items-center gap-2 rounded-8 border border-brand-green/30 bg-brand-green/5 px-3 py-3">
        <CheckCircle2 className="size-4 shrink-0 text-brand-green" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-12 tracking-code text-foreground">
            KQ9M2RT7
          </p>
          <p className="mt-1 text-12 text-brand-green">
            已验证 · 注册成功后再尝试建立关联
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-12 text-muted-foreground">
          <X className="size-4" /> 取消
        </span>
      </div>
    </div>
  );
}

export function WikiEmbedInviteCodePrompt() {
  return (
    <div
      className="w-[min(100%,32rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="invite-code-prompt"
    >
      <div className="flex items-start gap-3 px-6 pb-4 pt-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-12 bg-brand-red/10 text-brand-red">
          <Gift className="size-5" />
        </span>
        <div className="min-w-0 pt-1">
          <p className="text-18 font-medium text-foreground">
            填写邀请码，领取邀请礼
          </p>
          <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
            新账户没有候选码时，可在当期活动规定的绑定窗口内补填。
          </p>
        </div>
      </div>

      <div className="mx-6 rounded-8 bg-surface-1 px-3 py-3 text-12 leading-paragraph text-muted-foreground">
        <div className="flex items-start gap-2">
          <TicketCheck className="mt-1 size-4 shrink-0 text-brand-green" />
          <span>
            此处只提醒补录，不会在弹窗内直接绑定；进入“邀请好友”后仍需本人确认。
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-6">
        <span className="inline-flex items-center gap-1 text-12 text-muted-foreground">
          获取邀请码 <ExternalLink className="size-3" />
        </span>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 items-center rounded-8 px-3 text-12 text-muted-foreground">
            暂不填写
          </span>
          <span className="inline-flex h-9 items-center gap-2 rounded-8 bg-foreground px-4 text-12 font-medium text-on-dark">
            <TicketCheck className="size-4" /> 立即填写
          </span>
        </div>
      </div>

      <p className="border-t border-border bg-surface-1 px-6 py-3 text-12 leading-paragraph text-faint">
        仅在活动开启、受邀礼有效且新账号没有候选码时提示一次；旧账号不会静默绑定。
      </p>
    </div>
  );
}
