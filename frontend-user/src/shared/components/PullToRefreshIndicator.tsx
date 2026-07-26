import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * 下拉刷新指示器 —— 放在「relative 滚动容器」内最上方,absolute 定位,随 pull 渐显下移。
 * 配合 usePullToRefresh(pull / refreshing)。不位移列表内容,避免与 embla 回弹冲突。
 */
export function PullToRefreshIndicator({
  pull,
  refreshing,
}: {
  pull: number;
  refreshing: boolean;
}) {
  if (pull <= 0 && !refreshing) return null;
  const opacity = refreshing ? 1 : Math.min(pull / 50, 1);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-raised flex justify-center"
      style={{ transform: `translateY(${Math.max(pull - 28, 4)}px)`, opacity }}
    >
      <div className="flex size-8 items-center justify-center rounded-pill border border-border bg-surface-card">
        <Loader2
          className={cn('size-4 text-muted-foreground', refreshing && 'animate-spin')}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </div>
    </div>
  );
}
