import { Gift, UserPlus, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { http } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { usePromoEligible } from '@/shared/api/promo';
import { usePromoStore } from '@/stores/promo.store';
import { cn } from '@/shared/lib/utils';

/**
 * 顶部导航「限时活动」统一入口 —— 所有限时活动收进一个菜单(owner 拍板 2026-07-31:
 * 「限时领取会员」与「邀请有奖」同属限时活动,不做并排双按钮)。
 *
 * 当前收纳两个活动,各自独立开关:
 *   - 限时领取会员:promo_config 后台开关(usePromoEligible),点击开 PromoModal;
 *   - 邀请有奖:billing_config.invite_reward_credits > 0(公开 /billing/plans 下发)
 *     且已登录(落点 /settings/invite 有登录闸),点击进邀请页。
 * 全部关闭 → 按钮整个消失。以后加新活动往 items 里加一行即可。
 *
 * 视觉沿用原 PromoNavButton:品牌红描边 + 礼物图标 + 脉冲点(活动期适度吸睛)。
 * `className` 供调用方控显隐(< 1200px 由 CompactNavMenu 承接同款入口)。
 * app/layouts 不 import features(方向铁律),plans 走 inline useQuery
 * (与 usePlans 同 queryKey ['billing','plans'],共享缓存)。
 */
export function ActivityNavMenu({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { visible: promoVisible } = usePromoEligible();
  const openPromo = usePromoStore((s) => s.openPromo);
  const { data } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async () =>
      (await http.get<{ data: { invite_reward_credits: number } }>('/billing/plans')).data.data,
    staleTime: 60_000,
  });
  const inviteReward = data?.invite_reward_credits ?? 0;
  const inviteVisible = inviteReward > 0 && !!getAuthToken();

  const items: { key: string; icon: typeof Gift; title: string; sub: string; onSelect: () => void }[] = [];
  if (promoVisible) {
    items.push({
      key: 'promo',
      icon: Gift,
      title: '限时领取会员',
      sub: '扫码添加客服,免费领取会员权益',
      onSelect: () => openPromo('manual'),
    });
  }
  if (inviteVisible) {
    items.push({
      key: 'invite',
      icon: UserPlus,
      title: '邀请有奖',
      sub: `每成功邀请 1 位好友注册,得 ${inviteReward} 经费`,
      onSelect: () => navigate('/settings/invite'),
    });
  }
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'gap-2 border-brand-red/40 text-brand-red hover:bg-brand-red/5 hover:text-brand-red',
            className
          )}
        >
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-pill bg-brand-red/60" />
            <span className="relative inline-flex size-1.5 rounded-pill bg-brand-red" />
          </span>
          <Gift className="size-3.5" strokeWidth={2.2} />
          限时活动
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1">
        {items.map((it) => (
          <DropdownMenuItem
            key={it.key}
            onSelect={it.onSelect}
            className="flex cursor-pointer items-start gap-2 rounded-8 px-2 py-2"
          >
            <it.icon className="mt-1 size-4 shrink-0 text-brand-red" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-12 font-medium text-foreground">{it.title}</span>
              <span className="text-12 leading-paragraph text-faint">{it.sub}</span>
            </span>
            <ChevronRight className="mt-1 size-3.5 shrink-0 text-faint" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
