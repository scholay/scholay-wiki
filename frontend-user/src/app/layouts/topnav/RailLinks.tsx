import { PanelLeftOpen } from 'lucide-react';
import { useSidebar } from '@/stores/sidebar.store';
import { cn } from '@/shared/lib/utils';

/**
 * 当前页 sidebar 的顶栏快捷 chip。
 * 桌面收起已改为左侧常驻窄轨,有 panel 时不再重复展示 chip(避免双入口)。
 * 仅在极端无窄轨场景保留(理论上 hasPanel 页面都会走 SidebarLayout)。
 */
export function RailLinks() {
  const items = useSidebar((s) => s.rail);
  const expanded = useSidebar((s) => s.expanded);
  const hasPanel = useSidebar((s) => s.hasPanel);
  const setExpanded = useSidebar((s) => s.setExpanded);
  const flashSection = useSidebar((s) => s.flashSection);

  // 有侧栏页面:窄轨已常驻,顶栏 chip 隐藏。
  if (hasPanel || expanded || items.length === 0) return null;

  return (
    <nav
      className={cn(
        'flex min-w-0 items-center gap-1 px-1.5',
        'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
      role="toolbar"
      aria-label="侧栏快捷入口"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            setExpanded(true);
            if (item.sectionId) flashSection(item.sectionId);
          }}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm transition-colors',
            'border border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground',
          )}
        >
          <PanelLeftOpen className="size-3 shrink-0 text-faint" />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
