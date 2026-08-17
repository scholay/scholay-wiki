import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Feature 空态居中壳 —— 外层吃满父级高度,
 * 内层用 margin:auto 把整块内容垂直+水平居中。
 * 内容比视口高时 margin 收成 0,从顶部起滚。
 */
export function CenteredLanding({
  children,
  className,
  contentClassName = 'max-w-[640px]',
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-background',
        className,
      )}
    >
      <div
        className={cn(
          'm-auto flex w-full flex-col items-center px-6 py-8',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
