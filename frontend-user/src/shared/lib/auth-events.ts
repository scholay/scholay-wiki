import { readInviteCode } from '@/shared/lib/invite-code';

export const AUTH_SUCCESS_EVENT = 'scholay:auth-success';

export interface AuthSuccessEventDetail {
  isNewUser: boolean;
  userId: number;
  /** 仅用于 OAuth merge 的目标账号身份校验，不消费邀请候选或导航。 */
  suppressInviteFlow?: boolean;
}

export function notifyAuthSuccess(detail: AuthSuccessEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AuthSuccessEventDetail>(AUTH_SUCCESS_EVENT, { detail }));
}

/**
 * OAuth 回调页的默认落点。老账号携带候选码时必须进设置页
 * 主动确认，不能被回调页的延迟“回首页”覆盖。
 */
export function authSuccessLandingPath(isNewUser?: boolean): string {
  if (isNewUser !== true && readInviteCode()) return '/settings/invite?bind=1';
  return '/';
}
