import { useEffect, useState } from 'react';
import { Gift, QrCode, RefreshCw, UserPlus, type LucideIcon } from 'lucide-react';
import { IconButton } from '@/shared/components/IconButton';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { useInviteFilled } from '@/features/auth/hooks/useInviteFilled';
import {
  useClaimInvite,
  type ClaimInviteScene,
} from '@/stores/claim-invite.store';

const SLIDES: {
  scene: ClaimInviteScene;
  label: string;
  icon: LucideIcon;
  className: string;
}[] = [
  {
    scene: 'fill',
    label: '填写邀请码',
    icon: Gift,
    className:
      'border-brand-green/40 text-brand-green hover:bg-brand-green/5 hover:text-brand-green',
  },
  {
    scene: 'promote',
    label: '推广有好礼',
    icon: UserPlus,
    className:
      'border-brand-red/40 text-brand-red hover:bg-brand-red/5 hover:text-brand-red',
  },
  {
    scene: 'get',
    label: '获取邀请码',
    icon: QrCode,
    className:
      'border-border-control-emphasis text-foreground hover:bg-surface-2',
  },
];

const PROMOTE_SLIDES = SLIDES.filter((item) => item.scene === 'promote');
const ROTATE_MS = 5000;

/**
 * 顶栏靠右邀请入口。未填码时三态 5s 轮播；已填码只留「推广有好礼」。
 */
export function ClaimInviteNavButton() {
  const { campaignEnabled, ready, filled } = useInviteFilled();
  const dialogOpen = useClaimInvite((s) => s.open);
  const dialogScene = useClaimInvite((s) => s.scene);
  const openClaim = useClaimInvite((s) => s.openClaim);
  const slides = filled ? PROMOTE_SLIDES : SLIDES;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [rotationEpoch, setRotationEpoch] = useState(0);
  const current = slides[index % slides.length] ?? slides[0];
  const canRotate = slides.length > 1;

  const advance = () => {
    setIndex((prev) => (prev + 1) % slides.length);
    setRotationEpoch((epoch) => epoch + 1);
  };

  useEffect(() => {
    setIndex(0);
  }, [filled]);

  useEffect(() => {
    if (!dialogOpen) return;
    const next = slides.findIndex((item) => item.scene === dialogScene);
    if (next >= 0) setIndex(next);
  }, [dialogOpen, dialogScene, slides]);

  useEffect(() => {
    if (dialogOpen || hovered || !canRotate) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [canRotate, dialogOpen, hovered, rotationEpoch, slides.length]);

  if (!campaignEnabled || !ready || !current) return null;

  const Icon = current.icon;

  return (
    <div
      className="flex items-center gap-0.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => openClaim(current.scene)}
        aria-label={current.label}
        className={cn('min-w-[7.5rem] gap-1.5', current.className)}
      >
        <Icon className="size-3.5" strokeWidth={2.2} />
        {current.label}
      </Button>
      {canRotate && (
        <IconButton
          size="sm"
          tooltip="切换活动"
          aria-label="切换活动"
          onClick={advance}
        >
          <RefreshCw strokeWidth={2.2} />
        </IconButton>
      )}
    </div>
  );
}
