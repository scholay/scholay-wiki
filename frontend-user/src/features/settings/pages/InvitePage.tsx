// 邀请好友 —— 设置区独立页(SettingsLayout 左侧 nav,与「账户资产」同级入口)。
// 数据:GET /user/invite(get-or-create,首次进入本页即生成唯一邀请码)
//     + GET /user/invite/registrations(邀请记录,name 已在后端脱敏)。
// 卡片风格对齐 components/account-assets-card.tsx(rounded-16 border bg-surface-card)。
import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Users } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { InviteShareMethods } from "@/shared/components/invite/InviteShareMethods";
import { InviteRewardPoster } from "@/shared/components/invite/InviteRewardPoster";
import {
  INVITE_METHOD_LABEL,
  INVITE_SOURCE_LABEL,
  useInvite,
  useInvitedUsers,
} from "../api/invite";
import { useInviteCampaign } from "@/shared/api/invite-campaign";
import { InviteBindingCard } from "../components/InviteBindingCard";

export function InvitePage() {
  const campaignQ = useInviteCampaign();
  const campaignOn = campaignQ.data?.enabled === true;
  const inviterRewardOn =
    (campaignQ.data?.inviter_registration_credits ?? 0) > 0 ||
    (campaignQ.data?.first_purchase_rebate_bps ?? 0) > 0;
  const { data, isLoading } = useInvite(campaignOn);
  const showRewardStat = inviterRewardOn || (data?.reward_total ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      {campaignQ.isLoading && !campaignQ.data ? (
        <section className="rounded-16 border border-border bg-surface-card p-6 text-12 text-faint">
          加载邀请活动…
        </section>
      ) : !campaignQ.data ? (
        <section className="rounded-16 border border-border bg-surface-card p-6">
          <p className="text-14 font-medium text-foreground">
            邀请活动加载失败
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => void campaignQ.refetch()}
          >
            重试
          </Button>
        </section>
      ) : !campaignOn ? (
        <section className="rounded-16 border border-border bg-surface-card p-6">
          <h3 className="text-14 font-medium text-foreground">
            邀请活动暂未开启
          </h3>
          <p className="mt-1 text-12 text-muted-foreground">
            活动开启后，你可在这里关联邀请人并生成专属邀请链接。
          </p>
        </section>
      ) : (
        <>
          <InviteBindingCard />
          <section className="rounded-16 border border-border bg-surface-card p-6">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
              <h2 className="text-16 font-medium text-foreground">邀请好友</h2>
              {campaignQ.data.code_help_url && (
                <a
                  href={campaignQ.data.code_help_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-12 text-faint hover:text-foreground hover:underline"
                >
                  了解更多
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <InviteRewardPoster />

            {isLoading ? (
              <p className="mt-4 text-12 text-faint">加载中…</p>
            ) : !data ? (
              <p className="mt-4 text-12 text-faint">
                邀请信息加载失败,请刷新重试。
              </p>
            ) : (
              <>
                <InviteShareMethods
                  code={data.code}
                  url={data.url}
                  className="mt-4"
                />

                <div
                  className={cn(
                    "mt-4 grid grid-cols-1 divide-y divide-border-hairline overflow-hidden rounded-12 border border-border-hairline bg-surface-1 sm:divide-x sm:divide-y-0",
                    showRewardStat ? "sm:grid-cols-3" : "sm:grid-cols-2",
                  )}
                >
                  <StatBlock
                    label="邀请链接访问"
                    value={data.open_count}
                    unit="次"
                  />
                  <StatBlock
                    label="已关联好友"
                    value={data.registered_count}
                    unit="人"
                  />
                  {showRewardStat && (
                    <StatBlock
                      label="累计邀请奖励"
                      value={data.reward_total}
                      unit="经费"
                    />
                  )}
                </div>
              </>
            )}
          </section>

          <InvitedList enabled={campaignOn} />
        </>
      )}
    </div>
  );
}

/** 邀请记录 —— name 已由后端脱敏(al***@gmail.com / 张**),前端无明文。 */
function InvitedList({ enabled }: { enabled: boolean }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading } = useInvitedUsers(page, pageSize, enabled);
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-16 border border-border bg-surface-card p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-14 font-medium text-foreground">
          <Users className="size-4 text-faint" />
          邀请记录
        </h3>
        {total > 0 && <span className="text-12 text-faint">共 {total} 人</span>}
      </div>

      {isLoading ? (
        <p className="text-12 text-faint">加载中…</p>
      ) : items.length === 0 ? (
        <p className="text-12 leading-paragraph text-muted-foreground">
          还没有邀请记录。把链接、邀请码或二维码分享给好友吧。
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {items.map((u, i) => (
              <li
                key={`${u.name}-${u.created_at}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-border-hairline py-2 last:border-0"
              >
                <span className="min-w-0 truncate text-14 text-subtle">
                  {u.name}
                </span>
                <span className="flex max-w-[72%] flex-wrap items-center justify-end gap-2 text-12 text-faint">
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
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-12 tabular-nums text-faint">
                {page} / {pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StatBlock({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="min-w-0 p-3">
      <p className="text-12 text-faint">{label}</p>
      <p className="mt-1 text-20 font-medium tabular-nums text-foreground">
        {value}
        <span className="ml-1 text-12 font-normal text-faint">{unit}</span>
      </p>
    </div>
  );
}

export default InvitePage;
