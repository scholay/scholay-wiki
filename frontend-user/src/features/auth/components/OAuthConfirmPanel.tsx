import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui';
import { ProviderLogo } from '@/shared/components/ProviderLogo';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePublicConfig } from '../api/public-config';
import { InvitationCodeField } from './InvitationCodeField';
import { PROVIDER_META, proceedOAuth } from './oauth-flow';

/**
 * 选中第三方后的中心确认区:放大当前方式,邀请码整套组件仍可填/验/取消,
 * 点「前往授权」才跳转。底部 OAuthRow 当选项卡切换,不在这里藏起来。
 */
export function OAuthConfirmPanel() {
  const provider = useAuthDialog((s) => s.pendingOAuth);
  const { data: config } = usePublicConfig();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (!provider) return null;

  const meta = PROVIDER_META[provider];

  const confirm = async () => {
    setBusy(true);
    try {
      await proceedOAuth(provider, {
        queryClient,
        googleClientId: config?.google_client_id,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex size-16 items-center justify-center rounded-16 border border-border bg-surface-card text-foreground">
        <ProviderLogo provider={provider} className="size-8" />
      </div>
      <p className="mt-3 text-16 font-medium text-foreground">{meta.label}</p>
      <p className="mt-1 text-center text-12 text-muted-foreground">
        授权完成后即可登录或注册
      </p>

      <div className="mt-5 w-full">
        <InvitationCodeField />
      </div>

      <Button
        type="button"
        className="mt-5 h-10 w-full"
        disabled={busy}
        onClick={() => void confirm()}
      >
        {busy && <Loader2 className="animate-spin" />}
        前往{meta.label}授权
      </Button>
    </div>
  );
}
