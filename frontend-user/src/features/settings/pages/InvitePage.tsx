// 邀请好友 —— 设置区独立页(SettingsLayout 左侧 nav,与「账户资产」同级入口)。
// 数据:GET /user/invite(get-or-create,首次进入本页即生成唯一邀请码)
//     + GET /user/invite/registrations(我邀请的用户,name 已在后端脱敏)。
// 卡片风格对齐 components/account-assets-card.tsx(rounded-16 border bg-surface-card)。
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Coins, Copy, Link2, MousePointerClick, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { INVITE_METHOD_LABEL, useInvite, useInvitedUsers } from '../api/invite';

export function InvitePage() {
  const { data, isLoading, isError } = useInvite();

  const onCopy = async () => {
    if (!data) return;
    // copyToClipboard = navigator.clipboard 优先 + execCommand 兜底,不抛异常
    const ok = await copyToClipboard(data.url);
    if (ok) toast.success('邀请链接已复制');
    else toast.error('复制失败,请手动选中链接复制');
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-16 border border-border bg-surface-card p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-14 font-medium text-foreground">邀请好友</h3>
          {data && <span className="text-12 text-faint">邀请码 {data.code}</span>}
        </div>

        {isLoading ? (
          <p className="text-12 text-faint">加载中…</p>
        ) : isError || !data ? (
          <p className="text-12 text-faint">邀请信息加载失败,请刷新重试。</p>
        ) : (
          <>
            {/* 链接行:左侧只读展示(select-all 便于复制兜底失败时手动全选),右侧复制按钮 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-8 border border-border bg-surface-1 px-3">
                <Link2 className="size-4 shrink-0 text-faint" />
                <span className="select-all truncate text-12 text-subtle">{data.url}</span>
              </div>
              <Button size="sm" onClick={onCopy} className="h-9 gap-1 px-3">
                <Copy className="size-4" />
                复制链接
              </Button>
            </div>

            {/* 统计:打开 / 注册(+ 活动开启时的累计奖励)。reward_per_invite=0 = 活动未开,不提奖励 */}
            <div className={cn('mt-4 grid grid-cols-1 gap-3', data.reward_per_invite > 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
              <StatBlock icon={MousePointerClick} label="链接被打开" value={data.open_count} unit="次" />
              <StatBlock icon={UserPlus} label="成功注册" value={data.registered_count} unit="人" />
              {data.reward_per_invite > 0 && (
                <StatBlock icon={Coins} label="累计奖励" value={data.reward_total} unit="经费" />
              )}
            </div>

            <p className="mt-4 text-12 leading-paragraph text-muted-foreground">
              {data.reward_per_invite > 0 ? (
                <>
                  每成功邀请 1 位好友注册,你将获得{' '}
                  <span className="font-medium text-foreground">{data.reward_per_invite}</span> 经费奖励。
                </>
              ) : (
                '好友通过你的链接注册后自动关联。'
              )}
            </p>
          </>
        )}
      </section>

      <InvitedList />
    </div>
  );
}

/** 我邀请的用户 —— name 已由后端脱敏(al***@gmail.com / 张**),前端无明文。 */
function InvitedList() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading } = useInvitedUsers(page, pageSize);
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-16 border border-border bg-surface-card p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-14 font-medium text-foreground">
          <Users className="size-4 text-faint" />
          我邀请的用户
        </h3>
        {total > 0 && <span className="text-12 text-faint">共 {total} 人</span>}
      </div>

      {isLoading ? (
        <p className="text-12 text-faint">加载中…</p>
      ) : items.length === 0 ? (
        <p className="text-12 leading-paragraph text-muted-foreground">
          还没有人通过你的链接注册。把上面的邀请链接分享给好友吧。
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {items.map((u, i) => (
              <li
                key={`${u.name}-${u.created_at}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-border-hairline py-2 last:border-0"
              >
                <span className="min-w-0 truncate text-14 text-subtle">{u.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-12 text-faint">
                  <span className="rounded-pill bg-surface-2 px-2 py-1">
                    {INVITE_METHOD_LABEL[u.method] ?? u.method}
                  </span>
                  {u.created_at.slice(0, 10)}
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
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="rounded-12 border border-border-hairline bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-12 text-faint">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="mt-2 text-24 font-medium tabular-nums text-foreground">
        {value}
        <span className="ml-1 text-12 font-normal text-faint">{unit}</span>
      </p>
    </div>
  );
}

export default InvitePage;
