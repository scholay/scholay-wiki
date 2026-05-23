import { useCallback } from 'react';
import { toast } from 'sonner';
import { toApiError } from '@/shared/lib/http';

/**
 * Admin 页面统一的"调用 + toast"封装。
 *
 *   const apiToast = useApiToast();
 *   await apiToast(create.mutateAsync(form), { success: '已创建', failure: '创建失败' });
 *
 * 失败时优先使用后端的 message,fallback 到调用者给的 failure 文案。
 * 比原来散落各页的 try/catch 节省 5+ 行/调用,且错误信息真实可读。
 */
export function useApiToast() {
  return useCallback(
    async <T>(
      promise: Promise<T>,
      opts: { success?: string; failure?: string }
    ): Promise<T | null> => {
      try {
        const result = await promise;
        if (opts.success) toast.success(opts.success);
        return result;
      } catch (err) {
        const api = toApiError(err);
        // 后端真实 message 比"操作失败"更有用 —— 例如 "邮箱已存在"、"配额不足"
        const msg = api.message && api.message !== '未知错误' ? api.message : opts.failure || '操作失败';
        toast.error(msg);
        return null;
      }
    },
    []
  );
}
