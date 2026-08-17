import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { usePageLoadingClaim } from '@/stores/page-loading.store';

interface LoadingStateProps {
  /** 单行文字提示,默认 "加载中…" */
  label?: string;
  /** 紧凑模式 — 嵌入小区域时用 */
  dense?: boolean;
  className?: string;
}

/**
 * 加载态。dense = 小区域转圈;默认登记全站蒙层(半透明遮罩 + 牛犀犀跑步),
 * 不在局部再画一层,避免刷新时叠出多只犀牛。
 */
export const LoadingState = forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ label = '加载中…', dense, className }, ref) => {
    if (dense) {
      return (
        <div
          ref={ref}
          className={cn(
            'flex items-center justify-center gap-2 py-6 text-12 text-muted-foreground',
            className,
          )}
        >
          <Loader2 className="size-4 animate-spin" />
          <span>{label}</span>
        </div>
      );
    }
    return <PageLoadingSlot ref={ref} label={label} className={className} />;
  }
);
LoadingState.displayName = 'LoadingState';

const PageLoadingSlot = forwardRef<
  HTMLDivElement,
  { label: string; className?: string }
>(({ label, className }, ref) => {
  usePageLoadingClaim();
  return (
    <div
      ref={ref}
      role="status"
      aria-label={label}
      className={cn('min-h-32', className)}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
});
PageLoadingSlot.displayName = 'PageLoadingSlot';

interface ListSkeletonProps {
  rows?: number;
  withTrailing?: boolean;
  className?: string;
}

/**
 * 列表行骨架 — 多行通用占位,可控制行数和是否带 trailing。
 */
export const ListSkeleton = forwardRef<HTMLDivElement, ListSkeletonProps>(
  ({ rows = 6, withTrailing = true, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col divide-y divide-border-soft', className)}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-4 w-4 rounded-4" />
            <Skeleton className="h-4 flex-1 max-w-72" />
            {withTrailing && <Skeleton className="h-3 w-12" />}
          </div>
        ))}
      </div>
    );
  }
);
ListSkeleton.displayName = 'ListSkeleton';
