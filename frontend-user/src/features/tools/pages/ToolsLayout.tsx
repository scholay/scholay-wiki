import { Outlet } from 'react-router-dom';
import { Compass, Filter } from 'lucide-react';
import { SidebarLayout } from '@/shared/components/sidebar';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { ToolsSidebar } from '../components/ToolsSidebar';

/**
 * 功能广场壳 —— 侧栏挂一次,目录页/详情页用 <Outlet/> 切换主区。
 * 这样在「目录 ↔ 详情」之间跳转时侧栏不重挂,顶部横向菜单也不会再次"刷新"
 * (SidebarHeaderNav 的 scrollIntoView 只在真的换菜单时才触发)。
 */
export function ToolsLayout() {
  // 折叠态 Rail 两个冗余入口:功能广场(快捷 section)+ 筛选器(filters section),
  // 点击对应 chip 会展开侧栏并让该 section 闪烁高亮 —— 与文献搜索一致。
  useRegisterSidebarRail([
    { id: 'tools', label: '功能广场', icon: Compass, sectionId: 'tools' },
    { id: 'filters', label: '筛选器', icon: Filter, sectionId: 'filters' },
  ]);

  return (
    <SidebarLayout sidebar={<ToolsSidebar />}>
      <Outlet />
    </SidebarLayout>
  );
}
