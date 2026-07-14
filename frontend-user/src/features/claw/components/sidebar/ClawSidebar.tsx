import {
  Sidebar,
  SidebarAuthFooter,
  SidebarCollapseButton,
  SidebarContent,
  SidebarHeaderNav,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';
import { ClawSessionList } from './ClawSessionList';
import { ClawSkillPanel } from './ClawSkillPanel';

/**
 * 智能助手 Sidebar — 复用 SidebarLayout 框架, 跟 SearchSidebar 同型。
 *
 * 两段 (自上而下):
 *   1. 技能面板 (ClawSkillPanel)
 *   2. 会话历史 (ClawSessionList, claw 私有)
 *
 * 模型选择器已移至 composer 左下角(P2 模型目录化,三 feature 统一 shared ModelSelector,
 * Cursor 同位;服务端 pinned_model 真源,旧 sidebar 下拉 + localStorage 旁路已删)。
 */
export interface ClawSidebarProps {
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  /** 删光全部会话时回退到"新对话空白态"用 (= ClawPage.handleNewConversation)。 */
  onNewConversation: () => void;
}

export function ClawSidebar({
  activeSessionId,
  onActivate,
  onNewConversation,
}: ClawSidebarProps) {
  const toggleSidebar = useSidebar((s) => s.toggle);

  return (
    <Sidebar>
      <SidebarHeaderNav />
      <SidebarContent>
        <ClawSkillPanel onNewConversation={onNewConversation} />
        <ClawSessionList
          activeSessionId={activeSessionId}
          onActivate={onActivate}
          onNewConversation={onNewConversation}
        />
      </SidebarContent>
      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}
