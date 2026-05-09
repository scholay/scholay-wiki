import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * EmptyState — 列表/区块为空时的友好占位
 *
 * 用法:
 *   <EmptyState title="暂无数据" description="尝试调整搜索条件" action={<Button>...</Button>} />
 */

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title = '暂无数据',
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="rounded-full bg-muted/50 p-3 text-muted-foreground">
        {icon || <Inbox className="h-6 w-6" />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
