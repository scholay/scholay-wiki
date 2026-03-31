import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

export interface ConfirmOptions {
  type?: ToastType;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
}

export interface ConfirmDialogState {
  type: ToastType;
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
  showCancel: boolean;
}

interface ToastStore {
  toasts: Toast[];
  confirmDialog: ConfirmDialogState | null;

  addToast: (type: ToastType, message: string, duration?: number) => string;
  removeToast: (id: string) => void;

  showToast: (message: string, type?: ToastType, duration?: number) => string;
  showSuccess: (message: string, duration?: number) => string;
  showError: (message: string, duration?: number) => string;
  showWarning: (message: string, duration?: number) => string;
  showInfo: (message: string, duration?: number) => string;

  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (result: boolean) => void;
}

let nextId = 0;

// Module-level resolver for the confirm dialog Promise.
let _confirmResolver: ((value: boolean) => void) | null = null;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  confirmDialog: null,

  addToast: (type, message, duration = 5000) => {
    const id = String(++nextId);
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration + 400);
    }
    return id;
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  showToast: (message, type = 'info', duration = 5000) => {
    return get().addToast(type, message, duration);
  },

  showSuccess: (message, duration = 5000) => get().addToast('success', message, duration),
  showError: (message, duration = 5000) => get().addToast('error', message, duration),
  showWarning: (message, duration = 5000) => get().addToast('warning', message, duration),
  showInfo: (message, duration = 5000) => get().addToast('info', message, duration),

  showConfirm: (options) => {
    return new Promise<boolean>((resolve) => {
      _confirmResolver = resolve;
      set({
        confirmDialog: {
          type: options.type || 'info',
          title: options.title,
          message: options.message,
          confirmText: options.confirmText || '确认',
          cancelText: options.cancelText || '取消',
          showCancel: options.showCancel !== false,
        },
      });
    });
  },

  resolveConfirm: (result) => {
    if (_confirmResolver) {
      _confirmResolver(result);
      _confirmResolver = null;
    }
    set({ confirmDialog: null });
  },
}));

// ---------------------------------------------------------------------------
// Convenience "confirm" namespace – callable outside React.
// ---------------------------------------------------------------------------
export const confirm = {
  show: (options: ConfirmOptions) => useToastStore.getState().showConfirm(options),
  info: (message: string, options: Partial<ConfirmOptions> = {}) =>
    useToastStore.getState().showConfirm({ type: 'info', message, ...options }),
  warning: (message: string, options: Partial<ConfirmOptions> = {}) =>
    useToastStore.getState().showConfirm({ type: 'warning', message, ...options }),
  error: (message: string, options: Partial<ConfirmOptions> = {}) =>
    useToastStore.getState().showConfirm({ type: 'error', message, ...options }),
  success: (message: string, options: Partial<ConfirmOptions> = {}) =>
    useToastStore.getState().showConfirm({ type: 'success', message, ...options }),
  delete: (message = '确定要删除吗？此操作不可撤销。') =>
    useToastStore.getState().showConfirm({
      type: 'warning',
      title: '删除确认',
      message,
      confirmText: '删除',
      cancelText: '取消',
    }),
};
