import type { ReactNode } from 'react';
import { Coins, Crown, Gauge, Gem, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBillingSnapshot, type ViewerTier } from '@/shared/api/membership';
import { isPhoneDevice } from '@/shared/lib/device';
import { monthDay, resetInfo } from '@/shared/lib/quota-display';
import { quotaNavigate } from '@/shared/lib/quota-events';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
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
  return n.toFixed(2);
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
  const reset = token ? resetInfo(token) : null;
  const passes = data?.resetPasses ?? 0;
  const lots = data?.resetPassLots ?? [];
  const passHint =
    lots.length > 0
      ? lots
          .map((lot) => `${lot.count} 张 · ${monthDay(lot.expires_at)}前`)
          .join('\n')
      : passes > 0 && data?.resetPassExpiry
        ? `${passes} 张 · ${monthDay(data.resetPassExpiry)}前`
        : undefined;
  const quotaHint = reset
    ? token?.unlimited
      ? reset.hint
      : reset.notStarted
        ? reset.hint
        : `${reset.rel}。${reset.hint}`
    : undefined;

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
            hint={quotaHint}
            value={
              !token ? (
                '—'
              ) : token.unlimited ? (
                '不限'
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <QuotaTube remaining={remaining} />
                  <span>{reset && reset.count > 0 ? reset.count : '—'}</span>
                </span>
              )
            }
          />
          <AssetRow
            icon={Ticket}
            label="刷新券"
            hint={passHint}
            value={String(passes)}
          />
        </>
      )}
    </button>
  );
}

function QuotaTube({ remaining }: { remaining: number }) {
  const pct = Math.min(100, Math.max(0, remaining));
  return (
    <span
      aria-hidden
      className="relative h-1.5 w-10 overflow-hidden rounded-pill bg-surface-3"
    >
      <span
        className="absolute inset-y-0 left-0 rounded-pill bg-brand-green"
        style={{ width: `${pct}%` }}
      />
    </span>
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
  value: ReactNode;
  hint?: string;
  valueClassName?: string;
}) {
  const valueEl = (
    <span
      className={cn(
        'min-w-0 truncate font-semibold tabular-nums text-foreground',
        valueClassName,
      )}
    >
      {value}
    </span>
  );

  return (
    <span className="flex items-center justify-between gap-3 text-2xs">
      <span className="inline-flex items-center gap-1 text-faint">
        <Icon className="size-3 shrink-0" strokeWidth={2} />
        {label}
      </span>
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className="inline-flex min-w-0 cursor-default items-center"
            >
              {valueEl}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="max-w-[16rem] whitespace-pre-line"
          >
            {hint}
          </TooltipContent>
        </Tooltip>
      ) : (
        valueEl
      )}
    </span>
  );
}
