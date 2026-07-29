import { PanelLeft, PanelLeftClose } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useSidebar } from '@/stores/sidebar.store';

interface SidebarCollapseButtonProps {
  collapsed?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * 侧栏顶部展开/收起 —— 面板图标（左竖条圆角矩形），贴在滚动区上方。
 * 窄轨显示 PanelLeft（展开）；展开态显示 PanelLeftClose（收起）。
 */
export function SidebarCollapseButton({
  collapsed: collapsedProp,
  onClick,
  className,
}: SidebarCollapseButtonProps) {
  const expanded = useSidebar((s) => s.expanded);
  const toggle = useSidebar((s) => s.toggle);
  const collapsed = collapsedProp ?? !expanded;
  const handleClick = onClick ?? toggle;
  const Icon = collapsed ? PanelLeft : PanelLeftClose;

  return (
    <div
      className={cn(
        'flex shrink-0 items-center border-b border-border-soft',
        collapsed ? 'justify-center px-1 py-2' : 'justify-start px-3 py-2',
        className,
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        title={collapsed ? '展开侧栏' : '收起侧栏'}
        aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md text-subtle',
          'transition-colors hover:bg-surface-2 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
