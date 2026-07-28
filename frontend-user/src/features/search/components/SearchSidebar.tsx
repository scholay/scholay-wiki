import {
  Sidebar,
  SidebarContent,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';
import { WorkspacePanel } from './workspace/WorkspacePanel';

/** 搜索结果页侧栏 —— 工作区(暂存 + 文献集文件夹) */
export function SearchSidebar() {
  const toggleSidebar = useSidebar((s) => s.toggle);

  return (
    <Sidebar>
      <SidebarContent>
        <WorkspacePanel variant="sidebar" />
      </SidebarContent>

      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}
