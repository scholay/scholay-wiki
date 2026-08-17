import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import {
  consumeInvitationCode,
  peekInvitationCode,
} from '@/shared/lib/auth-invitation';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useInviteCandidate } from '@/stores/invite.store';
import type { AuthResponse } from '../types';
import { handleAuthSuccess } from '../api/auth';

/**
 * Google Sign-In (GIS)。确认层点「前往 Google 授权」后再 initialize + prompt。
 * 邀请码取 dialog / 候选 / sessionStorage,随 id_token 一并提交。
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (resp: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            opts: {
              type?: 'icon' | 'standard';
              size?: 'small' | 'medium' | 'large';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
            },
          ) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

let gisPromise: Promise<void> | null = null;
function loadGISScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('failed to load Google Identity Services'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function resolveInvitationCode(): string | undefined {
  const fromStore = useAuthDialog.getState().invitationCode.trim();
  const fromCandidate = useInviteCandidate.getState().candidate?.code?.trim();
  return fromStore || fromCandidate || peekInvitationCode() || undefined;
}

export async function startGoogleSignIn(
  qc: QueryClient,
  clientId: string,
): Promise<void> {
  await loadGISScript();
  if (!window.google?.accounts?.id) {
    throw new Error('Google Identity Services unavailable');
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async (resp) => {
      try {
        const invitation_code = resolveInvitationCode();
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/google/id-token-login',
          { id_token: resp.credential, invitation_code },
        );
        consumeInvitationCode();
        handleAuthSuccess(qc, data.data, {
          usedInvitationCode: !!invitation_code,
        });
        toast.success('登录成功');
      } catch (err) {
        toast.error(toApiError(err).message || 'Google 登录失败,请稍后重试');
      }
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  window.google.accounts.id.prompt();
}
