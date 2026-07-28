import { Outlet, useLocation } from 'react-router-dom';
import { Compass, Filter } from 'lucide-react';
import { SidebarLayout } from '@/shared/components/sidebar';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { ToolsSidebar } from '../components/ToolsSidebar';
import { PlazaHeader } from '../components/PlazaHeader';

/**
 * 功能广场壳 —— 侧栏挂一次,目录页/详情页用 <Outlet/> 切换主区。
 * 这样在「目录 ↔ 详情」之间跳转时侧栏不重挂,避免重复初始化筛选状态。
 */
export function ToolsLayout() {
  // 折叠态 Rail 两个冗余入口:功能广场(快捷 section)+ 筛选器(filters section),
  // 点击对应 chip 会展开侧栏并让该 section 闪烁高亮 —— 与文献搜索一致。
  useRegisterSidebarRail([
    { id: 'tools', label: '功能广场', icon: Compass, sectionId: 'tools' },
    { id: 'filters', label: '筛选器', icon: Filter, sectionId: 'filters' },
  ]);

  // 列表段(全网工具 / 社区技能)才挂共享头部;工具详情页 /tools/:slug 走裸 Outlet(自带布局)。
  const { pathname } = useLocation();
  const isList = pathname === '/tools' || pathname === '/tools/skills';

  return (
    <SidebarLayout sidebar={<ToolsSidebar />}>
      {isList ? (
        // 共享头部(分段 tab + 搜索 + 排序)常驻,切段只换下方内容 → 顶部交互统一。
        <div className="flex h-full min-h-0 flex-col bg-surface-1">
          <PlazaHeader />
          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </SidebarLayout>
  );
}
