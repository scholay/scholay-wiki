import {
  Sidebar,
  SidebarAuthFooter,
  SidebarCollapseButton,
  SidebarContent,
  SidebarHeaderNav,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';
import type { ClientMessage } from '../../api/types';
import { ClawModelSelector } from './ClawModelSelector';
import { ClawSessionList } from './ClawSessionList';

/**
 * 智能助手 Sidebar — 复用 SidebarLayout 框架, 跟 SearchSidebar 同型。
 *
 * 两段 (自上而下):
 *   1. 当前会话的模型 (ClawModelSelector, 切 model 走 WS set_runtime_config)
 *   2. 会话历史 (ClawSessionList, claw 私有)
 *
 * 不带"文献集" / "筛选器" — 文献集快捷入口在智能助手里是冗余 (已移除), 筛选器是搜索特有。
 */
export interface ClawSidebarProps {
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  /** 删光全部会话时回退到"新对话空白态"用 (= ClawPage.handleNewConversation)。 */
  onNewConversation: () => void;
  /** 给 ModelSelector 用 — 用户切 model 时, 通过这个发 WS set_runtime_config。
      ClawPage 把 useClawSocket.send 透下来即可。不传则只更新 localStorage,
      下次 WS 重连才生效 (UX 较差, 业务方应当传)。 */
  onSendToSocket?: (msg: ClientMessage) => void;
}

export function ClawSidebar({
  activeSessionId,
  onActivate,
  onNewConversation,
  onSendToSocket,
}: ClawSidebarProps) {
  const toggleSidebar = useSidebar((s) => s.toggle);

  return (
    <Sidebar>
      <SidebarHeaderNav />
      <SidebarContent>
        <ClawModelSelector
          sessionId={activeSessionId}
          onSend={onSendToSocket}
        />
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
