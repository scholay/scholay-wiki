import { type ReactNode } from 'react';
import { type LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** CTA 按钮 / 链接 — 不传则不渲染 */
  action?: ReactNode;
  /** 紧凑模式 — 列表内嵌入时用 */
  dense?: boolean;
  className?: string;
}

/**
 * 空状态 — 列表无数据 / 搜索无结果 / 文件夹空文献集时统一展示。
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  dense,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        dense ? 'py-10 px-4 gap-2' : 'py-20 px-6 gap-3',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-pill bg-surface-2 text-faint',
          dense ? 'h-10 w-10' : 'h-12 w-12'
        )}
      >
        <Icon className={dense ? 'size-5' : 'size-6'} />
      </div>
      <h3
        className={cn(
          'font-medium text-foreground',
          dense ? 'text-sm' : 'text-base'
        )}
      >
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
