import { UserPlus } from 'lucide-react';
import { useInviteCampaign } from '@/shared/api/invite-campaign';
import { cn } from '@/shared/lib/utils';
import { useInviteEntry } from '@/stores/invite-entry.store';

interface InviteNavButtonProps {
  className?: string;
  /** 营销页极窄屏仅保留 36px 图标，sm 起恢复 Pen 完整按钮。 */
  collapseBelowSm?: boolean;
}

/**
 * 全站顶栏独立的“邀请有礼”入口。活动开关只读 campaign；
 * 两种登录态都先进全局邀请弹窗，不在顶栏复制分支逻辑。
 */
export function InviteNavButton({ className, collapseBelowSm = false }: InviteNavButtonProps) {
  const campaignQ = useInviteCampaign();
  const openInvite = useInviteEntry((state) => state.openInvite);

  if (!campaignQ.data?.enabled) return null;

  return (
    <button
      type="button"
      onClick={openInvite}
      aria-label="邀请有礼"
      className={cn(
        'inline-flex h-9 min-w-[116px] shrink-0 items-center justify-center gap-2 rounded-pill border border-brand-red bg-brand-red px-3 text-14 font-medium text-on-brand shadow-raised transition-colors hover:bg-brand-red/90',
        collapseBelowSm && 'min-w-9 px-0 sm:min-w-[116px] sm:px-3',
        className,
      )}
    >
      <UserPlus className="size-4 shrink-0" strokeWidth={2} />
      <span className={cn(collapseBelowSm && 'hidden sm:inline')}>邀请有礼</span>
    </button>
  );
}
