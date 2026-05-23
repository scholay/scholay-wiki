import { create } from 'zustand';

/**
 * 这两个枚举与鉴权弹窗状态深度耦合,定义在 store 自身,
 * features/auth 通过类型 re-export 复用,避免 stores → features 反向依赖。
 */
export type AccountType = 'email' | 'phone';
export type AuthMode = 'login' | 'register' | 'forgot';

interface AuthDialogState {
  open: boolean;
  mode: AuthMode;
  /** 调用方可以预设 email/phone tab,默认 email */
  initialAccountType: AccountType;
  openDialog: (mode?: AuthMode, opts?: { accountType?: AccountType }) => void;
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
  openDialog: (mode = 'login', opts) =>
    set({
      open: true,
      mode,
      initialAccountType: opts?.accountType ?? 'email',
    }),
  setMode: (mode) => set({ mode }),
  close: () => set({ open: false }),
}));
