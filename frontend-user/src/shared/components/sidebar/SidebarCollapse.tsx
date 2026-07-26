import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SidebarCollapseButtonProps {
  collapsed?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * 底部 "‹ 收起" 按钮 —— 对齐 .pen `RWrX6` h-30(我们用 h-8 = 32)。
 * 文字 11/normal #999(text-xs text-faint)。
 */
export function SidebarCollapseButton({
  collapsed,
  onClick,
  className,
}: SidebarCollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 flex items-center justify-center gap-1.5 border-t border-border-soft shrink-0',
        'text-xs text-faint hover:bg-surface-1 hover:text-foreground transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {collapsed ? (
        <ChevronRight className="size-3" />
      ) : (
        <ChevronLeft className="size-3" />
      )}
      <span>{collapsed ? '展开' : '收起'}</span>
    </button>
  );
}
