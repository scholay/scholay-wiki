import {
  Sidebar,
  SidebarAuthFooter,
  SidebarCollapseButton,
  SidebarContent,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';
import { UnifiedSessionList } from './UnifiedSessionList';

/**
 * 智能助手 / 制作PPT 共用的侧边栏 —— 复用 SidebarLayout 框架,单段:统一会话历史
 * (UnifiedSessionList 合并 claw + boltslides,PPT 会话带小图标)。
 *
 * 取代旧的 ClawSidebar(单 feature 列表):PPT 不再是并列 tab,两 feature 的历史放一起。
 * 模型选择器在 composer 左下角(P2 目录化),技能入口在 composer 底栏,侧栏不重复展示。
 */
export function UnifiedSidebar({
  activeSessionId,
  onSelect,
  onNewConversation,
}: {
  activeSessionId: string | null;
  onSelect: (sessionId: string, feature: 'claw' | 'boltslides' | 'sci_draw') => void;
  onNewConversation: () => void;
}) {
  const toggleSidebar = useSidebar((s) => s.toggle);

  return (
    <Sidebar>
      <SidebarContent>
        <UnifiedSessionList
          activeSessionId={activeSessionId}
          onSelect={onSelect}
          onNewConversation={onNewConversation}
        />
      </SidebarContent>
      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}
