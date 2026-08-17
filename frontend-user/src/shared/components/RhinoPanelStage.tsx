import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * 展开面板舞台：主内容区（可选底栏）。
 * 小犀牛挂在对话框外侧，不占舞台空间。
 */
export function RhinoPanelStage({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}
