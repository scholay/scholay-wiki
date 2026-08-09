// 移动端「邀请好友」(/m/me/invite)—— 与 PC InvitePage 共用数据 hooks(api/invite.ts):
// 邀请链接复制 + 关联/奖励统计 + 邀请记录(name 已在后端脱敏)。
import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { InviteShareMethods } from "@/shared/components/invite/InviteShareMethods";
import { InviteRewardPoster } from "@/shared/components/invite/InviteRewardPoster";
import {
  INVITE_METHOD_LABEL,
  INVITE_SOURCE_LABEL,
  useInvite,
  useInvitedUsers,
} from "../../api/invite";
import { MeSubpageShell } from "../../components/mobile/MeSubpageShell";
import { useInviteCampaign } from "@/shared/api/invite-campaign";
import { InviteBindingCard } from "../../components/InviteBindingCard";

export function MobileInvitePage() {
  return (
    <MeSubpageShell title="邀请好友">
      <InviteBody />
    </MeSubpageShell>
  );
}

function InviteBody() {
  const campaignQ = useInviteCampaign();
  const campaignOn = campaignQ.data?.enabled === true;
  const { data, isLoading, refetch } = useInvite(campaignOn);
  const campaign = campaignQ.data;
  const showRewardStat =
    (!!campaign &&
      (campaign.inviter_registration_credits > 0 ||
        campaign.first_purchase_rebate_bps > 0)) ||
    (data?.reward_total ?? 0) > 0;

  if (campaignQ.isLoading && !campaign) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-4 animate-spin text-faint" />
      </div>
    );
  }
  if (!campaign) {
    return (
      <div className="p-4">
        <p className="text-12 text-faint">邀请活动加载失败。</p>
        <button
          type="button"
          onClick={() => void campaignQ.refetch()}
          className="mt-3 h-9 rounded-8 border border-border px-4 text-12"
        >
          重试
        </button>
      </div>
    );
  }
  if (!campaignOn) {
    return (
      <div className="p-3">
        <section className="rounded-16 border border-border bg-surface-card p-4">
          <p className="text-14 font-medium text-foreground">
            邀请活动暂未开启
          </p>
          <p className="mt-1 text-12 text-faint">
            活动开启后，可在这里关联邀请人并邀请好友。
          </p>
        </section>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <InviteBindingCard />
      {isLoading ? (
        <section className="flex items-center justify-center rounded-16 border border-border bg-surface-card py-8">
          <Loader2 className="size-4 animate-spin text-faint" />
        </section>
      ) : !data ? (
        <section className="rounded-16 border border-border bg-surface-card p-4">
          <p className="text-14 font-medium text-foreground">
            邀请好友信息加载失败
          </p>
          <p className="mt-1 text-12 text-faint">
            你仍可在上方关联邀请人；稍后重试再生成邀请链接。
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 h-9 rounded-8 border border-border px-4 text-12 text-subtle"
          >
            重试
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-16 border border-border bg-surface-card p-4">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
              <p className="text-16 font-medium text-foreground">邀请好友</p>
              {campaign.code_help_url && (
                <a
                  href={campaign.code_help_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-12 text-faint"
                >
                  了解更多
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <InviteRewardPoster />
            <InviteShareMethods
              code={data.code}
              url={data.url}
              className="mt-3"
            />
          </section>

          {/* 统计卡 —— 活动开启时加「累计奖励」变三列,未开保持两列 */}
          <section className="grid grid-cols-2 gap-3">
            {(
              [
                ["邀请链接访问", data.open_count, "次"],
                ["已关联好友", data.registered_count, "人"],
                ...(showRewardStat
                  ? [["累计邀请奖励", data.reward_total, "经费"] as const]
                  : []),
              ] as ReadonlyArray<readonly [string, number, string]>
            ).map(([label, value, unit]) => (
              <div
                key={label}
                className={cn(
                  "min-w-0 rounded-16 border border-border bg-surface-card p-4",
                  label === "累计邀请奖励" && "col-span-2",
                )}
              >
                <p className="text-12 text-faint">{label}</p>
                <p className="mt-1 text-20 font-medium tabular-nums text-foreground">
                  {value}
                  <span className="ml-1 text-12 font-normal text-faint">
                    {unit}
                  </span>
                </p>
              </div>
            ))}
          </section>

          <InvitedList enabled={campaignOn} />
        </>
      )}
    </div>
  );
}

/** 邀请记录 —— name 已由后端脱敏,前端无明文。 */
function InvitedList({ enabled }: { enabled: boolean }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading } = useInvitedUsers(page, pageSize, enabled);
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-16 border border-border bg-surface-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-12 font-medium text-foreground">邀请记录</p>
        {total > 0 && <span className="text-12 text-faint">共 {total} 人</span>}
      </div>

      {isLoading ? (
        <p className="mt-3 text-12 text-faint">加载中…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-12 leading-paragraph text-muted-foreground">
          还没有邀请记录。把链接、邀请码或二维码分享给好友吧。
        </p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col">
            {items.map((u, i) => (
              <li
                key={`${u.name}-${u.created_at}-${i}`}
                className="flex items-center justify-between gap-2 border-b border-border-hairline py-2 last:border-0"
              >
                <span className="min-w-0 truncate text-12 text-subtle">
                  {u.name}
                </span>
                <span className="flex max-w-[76%] flex-wrap items-center justify-end gap-1.5 text-12 text-faint">
                  {(u.inviter_registration_credits ?? u.rewarded_credits) >
                    0 && (
                    <span className="font-medium tabular-nums text-brand-green">
                      +{u.inviter_registration_credits ?? u.rewarded_credits}{" "}
                      注册礼
                    </span>
                  )}
                  {(u.first_purchase_rebate_credits ?? 0) > 0 && (
                    <span className="font-medium tabular-nums text-brand-green">
                      +{u.first_purchase_rebate_credits} 首单返利
                    </span>
                  )}
                  {u.source && (
                    <span className="rounded-pill bg-surface-2 px-2 py-1">
                      {INVITE_SOURCE_LABEL[u.source] ?? u.source}
                    </span>
                  )}
                  <span className="rounded-pill bg-surface-2 px-2 py-1">
                    {INVITE_METHOD_LABEL[u.method] ?? u.method}
                  </span>
                  {(u.bound_at || u.created_at).slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-4">
              {(
                [
                  ["上一页", page <= 1, -1],
                  ["下一页", page >= pages, 1],
                ] as const
              ).map(([label, disabled, dir]) => (
                <button
                  key={label}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPage((p) => p + dir)}
                  className={cn(
                    "rounded-pill border border-border px-3 py-1 text-12",
                    disabled
                      ? "text-faint opacity-50"
                      : "text-subtle active:bg-surface-2",
                  )}
                >
                  {label}
                </button>
              ))}
              <span className="text-12 tabular-nums text-faint">
                {page} / {pages}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
