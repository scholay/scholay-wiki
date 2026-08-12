import { Coins, Copy, Link2, QrCode, Users } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

const INVITE_CODE = "KQ9M2RT7";
const INVITE_URL = `https://scholay.com/?invite=${INVITE_CODE}`;

/**
 * 邀请推广成功态 · 纯样式 fixture。
 * 视觉来源：product-mock features/settings/components/InvitePromoPanel.tsx。
 * 业务事实按 current GET /user/invite 校正：open_count / registered_count / reward_total，链接契约为 /?invite=。
 */
export function WikiEmbedInviteShare() {
  return (
    <div
      className="flex w-full max-w-3xl flex-col gap-4"
      aria-hidden
      data-wiki-fixture="invite-share"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: "邀请链接访问",
            value: "24",
            suffix: "次",
            hint: "邀请链接累计打开",
            Icon: Link2,
          },
          {
            label: "已关联好友",
            value: "5",
            suffix: "人",
            hint: "通过你的邀请完成关联",
            Icon: Users,
          },
          {
            label: "累计邀请奖励",
            value: "380",
            suffix: "经费",
            hint: "邀请带来的累计奖励",
            Icon: Coins,
          },
        ].map(({ label, value, suffix, hint, Icon }) => (
          <div
            key={label}
            className="rounded-12 border border-border bg-surface-card p-4"
          >
            <div className="flex items-center gap-2 text-12 font-medium text-faint">
              <Icon className="size-3.5" />
              {label}
            </div>
            <p className="mt-2 text-24 font-medium tabular-nums text-foreground">
              {value}
              <span className="ml-1 text-14 font-normal text-muted-foreground">
                {suffix}
              </span>
            </p>
            <p className="mt-1 text-12 text-faint">{hint}</p>
          </div>
        ))}
      </div>

      <section
        className="rounded-12 border border-border bg-surface-card"
        style={{ padding: 20 }}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-14 font-medium text-foreground">
            <QrCode className="size-4 text-brand-red" />
            我的推广
          </h3>
          <span className="text-12 text-faint">分享给好友注册即可累计奖励</span>
        </div>

        <div
          className="grid grid-cols-1 lg:grid-cols-[1fr_auto]"
          style={{ gap: 20 }}
        >
          <div className="flex flex-col gap-3">
            <ShareRow label="邀请码" value={INVITE_CODE} mono />
            <ShareRow label="邀请链接" value={INVITE_URL} />
          </div>

          <div className="flex flex-col items-center gap-2 rounded-12 border border-border-soft bg-surface-1 p-3">
            <QRCodeCanvas
              value={INVITE_URL}
              size={132}
              level="M"
              marginSize={1}
              className="rounded-4 bg-on-dark p-1"
            />
            <span className="inline-flex items-center gap-1 text-12 text-muted-foreground">
              <Copy className="size-3" />
              复制链接（含二维码落地）
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ShareRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <span className="text-12 font-medium text-faint">{label}</span>
      <div className="flex items-center gap-2">
        <div
          className={`flex h-10 min-w-0 flex-1 items-center truncate rounded-12 border border-border bg-surface-1 px-3 text-14 text-foreground ${mono ? "font-mono tracking-code" : ""}`}
        >
          {value}
        </div>
        <span className="inline-flex h-10 shrink-0 items-center gap-1 rounded-pill border border-border-control-emphasis bg-surface-card px-3 text-14 font-medium text-foreground">
          <Copy className="size-3.5" />
          复制
        </span>
      </div>
    </div>
  );
}
