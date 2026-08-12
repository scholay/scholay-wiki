import { CheckCircle2, Copy, Link2, QrCode, Users } from "lucide-react";

const INVITE_CODE = "KQ9M2RT7";

/**
 * 邀请分享入口 · 纯样式 fixture。
 * 来源：InvitePage、MobileInvitePage 与 GET /user/invite；展示活动开启且数据加载成功的一种合法状态。
 */
export function WikiEmbedInviteShare() {
  return (
    <div
      className="w-[min(100%,44rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="invite-share"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <QrCode className="size-4 text-brand-red" />
          <div>
            <p className="text-16 font-medium text-foreground">邀请好友</p>
            <p className="mt-1 text-12 text-faint">成功态示例 · 动态数据</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-pill bg-brand-green-soft px-2 py-1 text-12 font-medium text-brand-green">
          <CheckCircle2 className="size-3" /> 活动开启 · 分享信息已加载
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: "邀请链接访问", value: "24 次", Icon: Link2 },
          { label: "已关联好友", value: "5 人", Icon: Users },
          { label: "累计邀请奖励", value: "380 经费", Icon: CheckCircle2 },
        ].map(({ label, value, Icon }) => (
          <div
            key={label}
            className="rounded-8 border border-border bg-surface-1 p-3"
          >
            <div className="flex items-center gap-2 text-12 text-faint">
              <Icon className="size-3" /> {label}
            </div>
            <p className="mt-2 text-18 font-medium tabular-nums text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          {[
            { label: "8 位专属邀请码", value: INVITE_CODE },
            {
              label: "邀请落地链接",
              value: `scholay.com/i/${INVITE_CODE}`,
            },
          ].map((row) => (
            <div key={row.label}>
              <p className="mb-2 text-12 text-faint">{row.label}</p>
              <div className="flex gap-2">
                <div className="flex h-control-lg min-w-0 flex-1 items-center truncate rounded-8 border border-border bg-surface-1 px-3 font-mono text-12 text-subtle">
                  {row.value}
                </div>
                <span className="inline-flex h-control-lg items-center gap-1 rounded-8 border border-border px-3 text-12 text-subtle">
                  <Copy className="size-3" /> 复制
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex size-32 flex-col items-center justify-center rounded-8 border border-border bg-surface-1 text-center text-faint">
          <QrCode className="size-10" />
          <span className="mt-2 text-12">同一落地链接</span>
        </div>
      </div>

      <p className="mt-4 border-t border-border pt-3 text-12 leading-paragraph text-muted-foreground">
        页面还会分别处理活动未开启、活动加载失败和分享信息加载失败；奖励统计只在当期奖励开启或历史累计大于零时出现。
      </p>
    </div>
  );
}
