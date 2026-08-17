import {
  Sidebar,
  SidebarContent,
} from '@/shared/components/sidebar';
import { WorkspacePanel } from './workspace/WorkspacePanel';

/** 搜索结果页侧栏 —— 工作区(暂存 + 文献集文件夹);收起为图标+数字窄轨。 */
export function SearchSidebar() {
  return (
    <Sidebar>
      <SidebarContent>
        <WorkspacePanel variant="sidebar" />
      </SidebarContent>
    </Sidebar>
  );
}
