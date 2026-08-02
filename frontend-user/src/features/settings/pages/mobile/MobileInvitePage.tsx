// 移动端「邀请好友」(/m/me/invite)—— 与 PC InvitePage 共用数据 hooks(api/invite.ts):
// 邀请链接复制 + 打开/注册统计 + 我邀请的用户(name 已在后端脱敏)。
import { useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { INVITE_METHOD_LABEL, useInvite, useInvitedUsers } from '../../api/invite';
import { usePlans } from '../../api/membership';
import { MeSubpageShell } from '../../components/mobile/MeSubpageShell';

export function MobileInvitePage() {
  return (
    <MeSubpageShell title="邀请好友">
      <InviteBody />
    </MeSubpageShell>
  );
}

function InviteBody() {
  const { data, isLoading } = useInvite();
  // 活动开关:reward_per_invite=0 = 未开,不提奖励(不给假承诺)
  const rewardOn = (data?.reward_per_invite ?? 0) > 0;
  const { data: plansData } = usePlans();
  const dailyCap = plansData?.invite_reward_daily_cap ?? 0;

  const onCopy = async () => {
    if (!data) return;
    const ok = await copyToClipboard(data.url);
    if (ok) toast.success('邀请链接已复制');
    else toast.error('复制失败,请手动选中链接复制');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-4 animate-spin text-faint" />
      </div>
    );
  }
  if (!data) {
    return <p className="p-4 text-12 text-faint">邀请信息加载失败,请下拉刷新重试。</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* 链接卡 */}
      <section className="rounded-16 border border-border bg-surface-card p-4">
        <p className="text-12 text-faint">我的邀请链接 · 邀请码 {data.code}</p>
        <p className="mt-2 select-all break-all text-12 text-subtle">{data.url}</p>
        <button
          type="button"
          onClick={onCopy}
          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-8 bg-foreground text-12 font-medium text-on-brand active:opacity-80"
        >
          <Copy className="size-4" />
          复制邀请链接
        </button>
        <p className="mt-3 text-12 leading-paragraph text-muted-foreground">
          {rewardOn ? (
            <>
              每成功邀请 1 位好友注册,你将获得{' '}
              <span className="font-medium text-foreground">{data.reward_per_invite}</span> 经费奖励。
            </>
          ) : (
            '好友通过你的链接注册后自动关联。'
          )}
        </p>
      </section>

      {/* 如何参与:三步玩法(活动开启时第三步讲奖励;规则行正向措辞「次日继续」) */}
      <section className="rounded-16 border border-border bg-surface-card p-4">
        <p className="text-12 font-medium text-faint">如何参与</p>
        <ol className="mt-2 flex flex-col gap-2">
          {(
            [
              ['1', '复制专属邀请链接,分享给同门好友'],
              ['2', '好友通过链接注册 Scholay,自动与你关联'],
              rewardOn ? ['3', '经费自动到账,并有站内信提醒'] : ['3', '在下方查看通过邀请注册的好友'],
            ] as ReadonlyArray<readonly [string, string]>
          ).map(([n, t]) => (
            <li key={n} className="flex items-center gap-2 text-12 text-subtle">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-pill bg-surface-2 tabular-nums text-faint">
                {n}
              </span>
              {t}
            </li>
          ))}
        </ol>
        {rewardOn && dailyCap > 0 && (
          <p className="mt-2 text-12 text-faint">每日最多计入 {dailyCap} 位好友的奖励,次日继续。</p>
        )}
      </section>

      {/* 统计卡 —— 活动开启时加「累计奖励」变三列,未开保持两列 */}
      <section className={cn('grid gap-3', rewardOn ? 'grid-cols-3' : 'grid-cols-2')}>
        {(
          [
            ['链接被打开', data.open_count, '次'],
            ['成功注册', data.registered_count, '人'],
            ...(rewardOn ? [['累计奖励', data.reward_total, '经费'] as const] : []),
          ] as ReadonlyArray<readonly [string, number, string]>
        ).map(([label, value, unit]) => (
          <div key={label} className="rounded-16 border border-border bg-surface-card p-4">
            <p className="text-12 text-faint">{label}</p>
            <p className="mt-1 text-20 font-medium tabular-nums text-foreground">
              {value}
              <span className="ml-1 text-12 font-normal text-faint">{unit}</span>
            </p>
          </div>
        ))}
      </section>

      <InvitedList />
    </div>
  );
}

/** 我邀请的用户 —— name 已由后端脱敏,前端无明文。 */
function InvitedList() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading } = useInvitedUsers(page, pageSize);
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-16 border border-border bg-surface-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-12 font-medium text-foreground">我邀请的用户</p>
        {total > 0 && <span className="text-12 text-faint">共 {total} 人</span>}
      </div>

      {isLoading ? (
        <p className="mt-3 text-12 text-faint">加载中…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-12 leading-paragraph text-muted-foreground">
          还没有人通过你的链接注册。
        </p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col">
            {items.map((u, i) => (
              <li
                key={`${u.name}-${u.created_at}-${i}`}
                className="flex items-center justify-between gap-2 border-b border-border-hairline py-2 last:border-0"
              >
                <span className="min-w-0 truncate text-12 text-subtle">{u.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-12 text-faint">
                  {u.rewarded_credits > 0 && (
                    <span className="font-medium tabular-nums text-brand-green">+{u.rewarded_credits}</span>
                  )}
                  <span className="rounded-pill bg-surface-2 px-2 py-1">
                    {INVITE_METHOD_LABEL[u.method] ?? u.method}
                  </span>
                  {u.created_at.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-4">
              {(
                [
                  ['上一页', page <= 1, -1],
                  ['下一页', page >= pages, 1],
                ] as const
              ).map(([label, disabled, dir]) => (
                <button
                  key={label}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPage((p) => p + dir)}
                  className={cn(
                    'rounded-pill border border-border px-3 py-1 text-12',
                    disabled ? 'text-faint opacity-50' : 'text-subtle active:bg-surface-2'
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
