import { useCallback } from 'react';
import { toast } from 'sonner';
import { toApiError } from '@/shared/lib/http';

/**
 * 全局统一的"API 调用 + toast 反馈"封装。
 *
 * 用法 A — 包 promise:
 *   const apiToast = useApiToast();
 *   await apiToast(create.mutateAsync(form), { success: '已创建', failure: '创建失败' });
 *
 * 用法 B — 给 react-query mutation 的 onError 当现成 handler:
 *   const apiToast = useApiToast();
 *   useMutation({ onError: apiToast.onError('保存失败') })
 *
 * 失败时优先使用后端的 message,fallback 到调用者给的 failure 文案。
 * 比原来散落各页 `onError: (err) => toast.error((err as Error).message)` 这种重复代码
 * 节省 5+ 行/调用, 错误信息更真实 (后端 "邮箱已存在" / "配额不足" 比 "操作失败" 有用)。
 *
 * Source of truth: 这个文件是 shared/。features/admin/hooks/useApiToast.ts 已 deprecate,
 * 仅作 re-export 不再独立维护。
 */
export interface ApiToast {
  <T>(
    promise: Promise<T>,
    opts: { success?: string; failure?: string },
  ): Promise<T | null>;
  /** react-query onError 工厂: const onError = apiToast.onError('保存失败') */
  onError: (failure?: string) => (err: unknown) => void;
  /** 直接 toast 一个 error (上层只能拿到 err, 不需要包 promise 时用) */
  show: (err: unknown, failure?: string) => void;
}

function pickErrorMessage(err: unknown, failure?: string): string {
  const api = toApiError(err);
  if (api.message && api.message !== '未知错误') return api.message;
  return failure || '操作失败';
}

export function useApiToast(): ApiToast {
  const run = useCallback(
    async <T>(
      promise: Promise<T>,
      opts: { success?: string; failure?: string },
    ): Promise<T | null> => {
      try {
        const result = await promise;
        if (opts.success) toast.success(opts.success);
        return result;
      } catch (err) {
        toast.error(pickErrorMessage(err, opts.failure));
        return null;
      }
    },
    [],
  );

  const onError = useCallback(
    (failure?: string) => (err: unknown) => {
      toast.error(pickErrorMessage(err, failure));
    },
    [],
  );

  const show = useCallback((err: unknown, failure?: string) => {
    toast.error(pickErrorMessage(err, failure));
  }, []);

  // 让函数对象同时挂上 onError / show 工厂方法
  const fn = run as ApiToast;
  fn.onError = onError;
  fn.show = show;
  return fn;
}
