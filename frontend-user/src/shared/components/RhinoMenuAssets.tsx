import { Coins, Crown, Gauge, Gem, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBillingSnapshot, type ViewerTier } from '@/shared/api/membership';
import { isPhoneDevice } from '@/shared/lib/device';
import { monthDay, resetInfo } from '@/shared/lib/quota-display';
import { quotaNavigate } from '@/shared/lib/quota-events';
import { cn } from '@/shared/lib/utils';
import { useIsAuthenticated } from '@/stores/auth.store';

const TIER_LABEL: Record<ViewerTier, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
};
const TIER_BADGE_CLS: Record<ViewerTier, string> = {
  free: 'bg-brand-green/12 text-brand-green',
  pro: 'bg-brand-amber/10 text-brand-amber',
  max: 'bg-brand-red/10 text-brand-red',
};

function formatCredit(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * 牛犀犀悬停菜单里的账户快照：会员身份、经费、额度、刷新券。
 * 未登录不渲染。点整块进账户资产页。
 */
export function RhinoMenuAssets() {
  const authed = useIsAuthenticated();
  const navigate = useNavigate();
  const { data, isLoading } = useBillingSnapshot();

  if (!authed) return null;

  const openAssets = () => {
    if (isPhoneDevice()) quotaNavigate('/m/me');
    else navigate('/settings/membership');
  };

  const tier = data?.tier ?? 'free';
  const TierIcon = tier === 'max' ? Crown : tier === 'pro' ? Gem : null;
  const yearly = data?.cycle === 'yearly' && tier !== 'free';
  const token = data?.token;
  const remaining =
    !token || token.unlimited || !token.window_started_at
      ? 100
      : Math.max(0, Math.round(100 - token.percent));
  const quotaLine = !token
    ? '—'
    : token.unlimited
      ? '额度不限'
      : `${remaining}% · ${resetInfo(token).rel}`;
  const passes = data?.resetPasses ?? 0;
  const passExpiry = data?.resetPassExpiry
    ? ` · ${monthDay(data.resetPassExpiry)}前`
    : '';

  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        openAssets();
      }}
      className={cn(
        'flex w-full min-w-[11.5rem] flex-col gap-0.5 whitespace-normal rounded-lg px-2 py-1.5 text-left',
        'border-b border-border/50 mb-0.5',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
      )}
    >
      {isLoading && !data ? (
        <span className="text-2xs text-faint">加载账户…</span>
      ) : (
        <>
          <AssetRow
            icon={TierIcon ?? Coins}
            label="会员身份"
            value={`${yearly ? '年费 ' : ''}${TIER_LABEL[tier]}`}
            valueClassName={cn(
              'rounded-pill px-1.5 py-px',
              TIER_BADGE_CLS[tier],
            )}
          />
          <AssetRow
            icon={Coins}
            label="科研经费"
            value={formatCredit(data?.creditTotal ?? 0)}
          />
          <AssetRow
            icon={Gauge}
            label="额度剩余"
            value={quotaLine}
            hint={token && !token.unlimited ? resetInfo(token).hint : undefined}
          />
          <AssetRow
            icon={Ticket}
            label="刷新券"
            value={passes > 0 ? `${passes} 张${passExpiry}` : '暂无'}
          />
        </>
      )}
    </button>
  );
}

function AssetRow({
  icon: Icon,
  label,
  value,
  hint,
  valueClassName,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <span className="flex items-center justify-between gap-3 text-2xs" title={hint}>
      <span className="inline-flex items-center gap-1 text-faint">
        <Icon className="size-3 shrink-0" strokeWidth={2} />
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 truncate font-semibold tabular-nums text-foreground',
          valueClassName,
        )}
      >
        {value}
      </span>
    </span>
  );
}
