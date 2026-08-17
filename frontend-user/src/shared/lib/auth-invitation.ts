/**
 * 邀请码跨 OAuth 整页跳转 / 邀请链接落地 的 sessionStorage 约定。
 *
 * - 普通手填：只存 code
 * - 邀请链接：code + locked=1（已预填并通过校验，需用户主动取消才能改）
 */

export const AUTH_INVITATION_CODE_KEY = 'scholay.auth.invitation_code';
export const AUTH_INVITATION_LOCKED_KEY = 'scholay.auth.invitation_locked';

/** Mock / 演示用：链接落地时视为「校验通过」的邀请码 */
export const MOCK_VALID_INVITE_CODES = [
  'SCHOLAY2026',
  'WELCOME',
  'INVITE-DEMO',
] as const;

export type PersistInvitationOptions = {
  /** 来自邀请链接且已校验通过 → 表单锁定，需手动取消 */
  locked?: boolean;
};

export function persistInvitationCode(
  code: string | undefined | null,
  opts: PersistInvitationOptions = {},
) {
  if (typeof window === 'undefined') return;
  const trimmed = (code ?? '').trim();
  if (!trimmed) {
    sessionStorage.removeItem(AUTH_INVITATION_CODE_KEY);
    sessionStorage.removeItem(AUTH_INVITATION_LOCKED_KEY);
    return;
  }
  sessionStorage.setItem(AUTH_INVITATION_CODE_KEY, trimmed);
  if (opts.locked) {
    sessionStorage.setItem(AUTH_INVITATION_LOCKED_KEY, '1');
  } else {
    sessionStorage.removeItem(AUTH_INVITATION_LOCKED_KEY);
  }
}

export function consumeInvitationCode(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = sessionStorage.getItem(AUTH_INVITATION_CODE_KEY)?.trim();
  sessionStorage.removeItem(AUTH_INVITATION_CODE_KEY);
  sessionStorage.removeItem(AUTH_INVITATION_LOCKED_KEY);
  return v || undefined;
}

export function peekInvitationCode(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return sessionStorage.getItem(AUTH_INVITATION_CODE_KEY)?.trim() || undefined;
}

export function peekInvitationLocked(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(AUTH_INVITATION_LOCKED_KEY) === '1';
}

/** 从 URL 读取邀请码（?invite= / ?invitation_code=），不改 history */
export function readInvitationCodeFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
): string | undefined {
  const params = new URLSearchParams(search);
  const raw = params.get('invite') ?? params.get('invitation_code');
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

/** 从地址栏去掉 invite / invitation_code，避免刷新重复消费 */
export function stripInvitationParamsFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('invite') && !url.searchParams.has('invitation_code')) {
    return;
  }
  url.searchParams.delete('invite');
  url.searchParams.delete('invitation_code');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

/**
 * Mock 侧「邀请码校验」——设计分支无真实后端时用白名单。
 * 生产若接真 API，可换成请求 `/user/invitation/verify`。
 */
export function verifyInvitationCode(code: string): {
  ok: boolean;
  message?: string;
} {
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, message: '邀请码不能为空' };
  }
  if (trimmed.length < 4 || trimmed.length > 32) {
    return { ok: false, message: '邀请码无效或已失效' };
  }
  const upper = trimmed.toUpperCase();
  const allowed = MOCK_VALID_INVITE_CODES.map((c) => c.toUpperCase());
  if (!allowed.includes(upper)) {
    return { ok: false, message: '邀请码无效或已失效' };
  }
  return { ok: true };
}
