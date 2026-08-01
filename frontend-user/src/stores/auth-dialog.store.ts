import { create } from 'zustand';
import {
  persistInvitationCode,
  peekInvitationCode,
  peekInvitationLocked,
  verifyInvitationCode,
} from '@/shared/lib/auth-invitation';

/**
 * 这两个枚举与鉴权弹窗状态深度耦合,定义在 store 自身,
 * features/auth 通过类型 re-export 复用,避免 stores → features 反向依赖。
 */
export type AccountType = 'email' | 'phone';
// wechat-qr —— 同一个 Dialog 内"原地切换"成微信扫码视图,顶部有返回键回到 login。
// 不另起 Dialog,避免双层嵌套关闭路径混乱。
export type AuthMode = 'login' | 'register' | 'forgot' | 'wechat-qr';

interface AuthDialogState {
  open: boolean;
  mode: AuthMode;
  /** 调用方可以预设 email/phone tab,默认 email */
  initialAccountType: AccountType;
  /** 可选邀请码 —— 仅注册流程使用;第三方从注册页发起时会带到 OAuth callback */
  invitationCode: string;
  /**
   * 来自邀请链接且已校验通过 → 字段锁定展示「已填写」,
   * 需调用 unlockInvitation 才能清空重填。
   */
  invitationLocked: boolean;
  openDialog: (mode?: AuthMode, opts?: { accountType?: AccountType }) => void;
  setMode: (mode: AuthMode) => void;
  setInvitationCode: (code: string) => void;
  /** 邀请链接落地：写入码并锁定；校验失败返回 false */
  applyInvitationFromLink: (code: string) => { ok: boolean; message?: string };
  /** 用户主动取消锁定，清空后可重新手填 */
  unlockInvitation: () => void;
  /** 从 sessionStorage 回填（含锁定态） */
  hydrateInvitation: () => void;
  close: () => void;
}

function shouldClearInvitation(mode: AuthMode): boolean {
  // wechat-qr 可能从注册页切入,需保留邀请码供扫码 callback 使用
  return mode === 'login' || mode === 'forgot';
}

/**
 * 全局鉴权弹窗的开关 — 任何组件都可以触发:
 *   useAuthDialog.getState().openDialog('register')
 */
export const useAuthDialog = create<AuthDialogState>((set, get) => ({
  open: false,
  mode: 'login',
  initialAccountType: 'email',
  invitationCode: '',
  invitationLocked: false,
  openDialog: (mode = 'login', opts) => {
    if (shouldClearInvitation(mode) && !get().invitationLocked) {
      persistInvitationCode(null);
      set({
        open: true,
        mode,
        initialAccountType: opts?.accountType ?? 'email',
        invitationCode: '',
        invitationLocked: false,
      });
      return;
    }
    set({
      open: true,
      mode,
      initialAccountType: opts?.accountType ?? 'email',
    });
  },
  setMode: (mode) => {
    if (shouldClearInvitation(mode) && !get().invitationLocked) {
      persistInvitationCode(null);
      set({ mode, invitationCode: '', invitationLocked: false });
      return;
    }
    set({ mode });
  },
  setInvitationCode: (code) => {
    // 锁定态不允许外部静默改码（只能 unlock）
    if (get().invitationLocked) return;
    set({ invitationCode: code });
  },
  applyInvitationFromLink: (code) => {
    const result = verifyInvitationCode(code);
    if (!result.ok) return result;
    const normalized = code.trim().toUpperCase();
    persistInvitationCode(normalized, { locked: true });
    set({
      invitationCode: normalized,
      invitationLocked: true,
    });
    return { ok: true };
  },
  unlockInvitation: () => {
    persistInvitationCode(null);
    set({ invitationCode: '', invitationLocked: false });
  },
  hydrateInvitation: () => {
    const code = peekInvitationCode();
    if (!code) return;
    const locked = peekInvitationLocked();
    set({
      invitationCode: code,
      invitationLocked: locked,
    });
  },
  // 关弹窗:锁定邀请码保留(链接态跨开关弹窗不丢);
  // 手填码只清内存,sessionStorage 留给 OAuth 整页跳转 callback。
  close: () =>
    set((s) => ({
      open: false,
      ...(s.invitationLocked ? {} : { invitationCode: '' }),
    })),
}));
