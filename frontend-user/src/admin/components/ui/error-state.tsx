import * as React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

/**
 * ErrorState — 请求/操作失败时的占位 + 重试按钮
 */

interface ErrorStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = '加载失败',
  description = '请稍后重试,或检查网络连接',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="rounded-full bg-destructive/10 p-3 text-destructive">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="h-4 w-4" />
          重试
        </Button>
      )}
    </div>
  );
}
