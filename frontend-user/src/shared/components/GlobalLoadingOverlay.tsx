import { createPortal } from 'react-dom';
import { usePageLoading } from '@/stores/page-loading.store';
import { RhinoRunLoader } from './RhinoRunLoader';

/**
 * 全站唯一 loading 蒙层。半透明遮罩 + 牛犀犀跑步。
 * 由 page-loading store 的引用计数开关,局部刷新叠多层也只画这一层。
 */
export function GlobalLoadingOverlay() {
  const count = usePageLoading((s) => s.count);
  if (count <= 0 || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="正在加载"
      className="fixed inset-0 z-modal overflow-hidden"
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-2" />
      <div className="relative flex h-full w-full items-center justify-center">
        <RhinoRunLoader />
      </div>
    </div>,
    document.body,
  );
}
