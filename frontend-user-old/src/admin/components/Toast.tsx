/**
 * Toast — 旧 API 的 thin wrapper,内部统一走 sonner
 *
 * 历史:
 *   13 个 settings Tab + 多个 v2 页面(共 18 处)都用 `import { showToast } from './Toast'`,
 *   API 形如 showToast(msg, 'success'). 全量替换成本高,这里把它做成 sonner 的薄壳:
 *     showToast('xxx', 'success')  →  toast.success('xxx')
 *
 * 视觉、动画、堆叠、可关闭统一由 sonner 接管(<Toaster /> 在 AdminRoot 已挂载),
 * 老的 Toast.css 已删除,无需 default export 的渲染组件。
 */

import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export const showToast = (
  message: string,
  type: ToastType = 'success',
  duration: number = 3000,
): void => {
  const opts = { duration };
  switch (type) {
    case 'success':
      toast.success(message, opts);
      break;
    case 'error':
      toast.error(message, opts);
      break;
    case 'warning':
      toast.warning(message, opts);
      break;
    case 'info':
    default:
      toast(message, opts);
      break;
  }
};

// 兼容旧的 default export(AdminRoot 之前 import 默认导出并渲染 <Toast />)。
// 现在渲染由 <SonnerToaster /> 接管,这里返回 null。
const Toast = (): null => null;
export default Toast;
