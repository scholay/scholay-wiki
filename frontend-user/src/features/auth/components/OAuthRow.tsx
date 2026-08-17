import { ProviderLogo } from '@/shared/components/ProviderLogo';
import { cn } from '@/shared/lib/utils';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import {
  useEnabledProviders,
  type EnabledProvider,
} from '../api/public-config';
import { PROVIDER_META } from './oauth-flow';

/**
 * 第三方登录按钮组。点击只选中,不立刻跳转:
 * AuthDialog / 移动壳切到 OAuthConfirmPanel,确认并(可选)填写邀请码后再跳转。
 */
export function OAuthRow({
  exclude,
}: {
  exclude?: EnabledProvider[];
} = {}) {
  const allProviders = useEnabledProviders();
  const providers = exclude
    ? allProviders.filter((p) => !exclude.includes(p))
    : allProviders;
  const pendingOAuth = useAuthDialog((s) => s.pendingOAuth);
  const setPendingOAuth = useAuthDialog((s) => s.setPendingOAuth);

  if (providers.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {providers.map((p) => {
        const meta = PROVIDER_META[p];
        const selected = pendingOAuth === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => setPendingOAuth(p)}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-8 border text-subtle transition-colors',
              selected
                ? 'border-foreground bg-surface-2 text-foreground'
                : 'border-border hover:bg-surface-2 hover:text-foreground',
            )}
            title={meta.label}
            aria-label={`使用 ${meta.label} 登录`}
            aria-pressed={selected}
          >
            <ProviderLogo provider={p} className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
