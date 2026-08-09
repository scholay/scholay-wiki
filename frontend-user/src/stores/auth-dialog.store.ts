import { create } from 'zustand';

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
  /** OAuth 合并中的目标账号登录只用于完成身份校验，不能打断 callback 页。 */
  suppressInviteFlow: boolean;
  openDialog: (
    mode?: AuthMode,
    opts?: { accountType?: AccountType; suppressInviteFlow?: boolean },
  ) => void;
  setMode: (mode: AuthMode) => void;
  close: () => void;
}

/**
 * 全局鉴权弹窗的开关 — 任何组件都可以触发:
 *   useAuthDialog.getState().openDialog('register')
 */
export const useAuthDialog = create<AuthDialogState>((set) => ({
  open: false,
  mode: 'login',
  initialAccountType: 'email',
  suppressInviteFlow: false,
  openDialog: (mode = 'login', opts) =>
    set({
      open: true,
      mode,
      initialAccountType: opts?.accountType ?? 'email',
      suppressInviteFlow: opts?.suppressInviteFlow ?? false,
    }),
  setMode: (mode) => set({ mode }),
  // suppression 是一次性的：目标账号登录成功后立即复位，
  // 后续 confirm-merge 自己的 auth success 仍要进入正常邀请流。
  close: () => set({ open: false, suppressInviteFlow: false }),
}));
