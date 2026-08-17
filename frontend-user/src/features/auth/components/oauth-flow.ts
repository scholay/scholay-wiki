import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { persistInvitationCode, peekInvitationCode } from '@/shared/lib/auth-invitation';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useInviteCandidate } from '@/stores/invite.store';
import { type EnabledProvider } from '../api/public-config';
import { startGoogleSignIn } from './GoogleSignInButton';

export const PROVIDER_META: Record<
  EnabledProvider,
  {
    label: string;
    urlPath?: string;
  }
> = {
  github: { label: 'GitHub', urlPath: '/user/github/login-url' },
  google: { label: 'Google' },
  wechat: { label: '微信' },
  apple: { label: 'Apple', urlPath: '/user/apple/login-url' },
  orcid: { label: 'ORCID', urlPath: '/user/orcid/login-url' },
  microsoft: { label: 'Microsoft', urlPath: '/user/microsoft/login-url' },
  discourse: { label: '恩特学术社区', urlPath: '/user/discourse/login-url' },
};

export function persistInviteForOAuth() {
  const fromDialog = useAuthDialog.getState().invitationCode.trim();
  const fromCandidate = useInviteCandidate.getState().candidate?.code?.trim();
  persistInvitationCode(fromDialog || fromCandidate || peekInvitationCode());
}

export async function proceedOAuth(
  provider: EnabledProvider,
  ctx: { queryClient: QueryClient; googleClientId?: string },
): Promise<void> {
  persistInviteForOAuth();

  if (provider === 'wechat') {
    useAuthDialog.getState().setMode('wechat-qr');
    return;
  }
  if (provider === 'google') {
    if (!ctx.googleClientId) {
      toast.error('Google 登录暂未开通,请稍后再试或选择其他登录方式');
      return;
    }
    try {
      await startGoogleSignIn(ctx.queryClient, ctx.googleClientId);
    } catch (err) {
      toast.error(
        toApiError(err).message || 'Google 登录暂未开通,请稍后再试或选择其他登录方式',
      );
    }
    return;
  }

  const meta = PROVIDER_META[provider];
  if (!meta.urlPath) return;
  try {
    const { data } = await http.get<{ data: { url?: string } }>(meta.urlPath);
    const url = data.data?.url;
    if (!url) {
      toast.error(`${meta.label} 登录暂未开通,请稍后再试或选择其他登录方式`);
      return;
    }
    window.location.href = url;
  } catch (err) {
    toast.error(
      toApiError(err).message ||
        `${meta.label} 登录暂未开通,请稍后再试或选择其他登录方式`,
    );
  }
}
