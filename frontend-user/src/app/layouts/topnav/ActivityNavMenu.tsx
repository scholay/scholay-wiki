import { useEffect, useState } from 'react';
import { Gift, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { usePromoEligible } from '@/shared/api/promo';
import { usePromoStore } from '@/stores/promo.store';
import { cn } from '@/shared/lib/utils';

/**
 * 顶部导航「限时活动」只承接会员推广。邀请活动已按 Pen
 * 规范拆为独立的 InviteNavButton，两者开关与落点互不干扰。
 *
 * 视觉沿用原 PromoNavButton:品牌红描边 + 礼物图标 + 脉冲点(活动期适度吸睛)。
 * `className` 供调用方控显隐(< 1200px 由 CompactNavMenu 承接同款入口)。
 */
export function ActivityNavMenu({
  className,
  active = true,
}: {
  className?: string;
  active?: boolean;
}) {
  const { visible: promoVisible } = usePromoEligible();
  const openPromo = usePromoStore((s) => s.openPromo);
  const [open, setOpen] = useState(false);

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
  // 活动开关/会员等级或响应式断点变化时，不能在 open 态
  // 直接卸载 modal DropdownMenu。先受控关闭，下一帧再返回 null。
  useEffect(() => {
    if (!active || items.length === 0) setOpen(false);
  }, [active, items.length]);

  if (items.length === 0 && !open) return null;

  return (
    <DropdownMenu open={active && items.length > 0 && open} onOpenChange={setOpen}>
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
