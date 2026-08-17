import { Gift } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { usePromoEligible } from '@/shared/api/promo';
import { usePromoStore } from '@/stores/promo.store';

/**
 * 顶部导航「限时领取会员」快捷按钮 —— 仅在推广开启且当前用户非付费会员时出现,
 * 点击打开全局推广弹窗(PromoModal 挂在 providers)。文案/二维码由后台配置驱动。
 *
 * 视觉:品牌红描边 + 礼物图标 + 轻微脉冲点,推广期适度吸睛但不喧宾夺主。
 */
export function PromoNavButton() {
  const { visible } = usePromoEligible();
  const openPromo = usePromoStore((s) => s.openPromo);

  if (!visible) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => openPromo('manual')}
      className="gap-1.5 border-brand-red/40 text-brand-red hover:bg-brand-red/5 hover:text-brand-red"
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-pill bg-brand-red/60" />
        <span className="relative inline-flex size-1.5 rounded-pill bg-brand-red" />
      </span>
      <Gift className="size-3.5" strokeWidth={2.2} />
      限时领取会员
    </Button>
  );
}
