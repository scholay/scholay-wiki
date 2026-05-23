import { PanelLeftOpen } from 'lucide-react';
import { useSidebar } from '@/stores/sidebar.store';
import { cn } from '@/shared/lib/utils';

/**
 * 当前页 sidebar 的"收起态"快捷入口 — 紧贴 Logo 后面那一组 chip。
 * 数据由各 feature 通过 `useRegisterSidebarRail([...])` 注入。
 *
 * 交互(对照 .pen `VOrfF` sidebarLinks):
 *   - 全部 chip **同一种样式**(不再有 isActive 红色高亮)
 *   - 点击 = 展开 sidebar + 让 sidebar 中对应 SectionId 的段闪一下高亮边框
 *   - 用 <button> 而不是 NavLink,因为点击不再"跳路由",只是"打开+定位"
 *
 * Sidebar expanded 态下不渲染(避免与左侧面板重复展示)。
 */
export function RailLinks() {
  const items = useSidebar((s) => s.rail);
  const expanded = useSidebar((s) => s.expanded);
  const setExpanded = useSidebar((s) => s.setExpanded);
  const flashSection = useSidebar((s) => s.flashSection);

  if (expanded || items.length === 0) return null;

  return (
    // overflow-x-auto + scrollbar-hide:rail 多到挤压时内部横滚,
    // 不影响外层 TopNav 的居中布局(由 TopNav 的 grid + min-w-0 保证)
    <nav
      className={cn(
        'flex items-center gap-1 px-1.5 min-w-0',
        'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
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
            'inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-sm shrink-0 transition-colors',
            'border border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground'
          )}
        >
          <PanelLeftOpen className="size-3 shrink-0 text-faint" />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
