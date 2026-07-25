import { AgentSessionList } from '@/shared/components/agent-session/AgentSessionList';
import { clawSessions } from '../../api/session';

/**
 * 智能助手侧边栏 — 会话历史列表区域。
 *
 * 会话列表 UI(行 / 标题 loading / 重命名删除弹窗 / 切换 / 删光兜底)已收口到 shared
 * AgentSessionList(与 smart-search 共用),本组件只做 claw 端点/文案的薄绑定。
 * 「+新对话」按钮不在这里(统一走顶部 header),onNewConversation 仅删光兜底用。
 */
export interface ClawSessionListProps {
  activeSessionId: string | null;
  /** 用户点了某条 session → 父组件: setActiveSessionId(newId) */
  onActivate: (sessionId: string) => void;
  /** 删光全部会话时回退到"新对话空白态"用 (= ClawPage.handleNewConversation)。 */
  onNewConversation: () => void;
  /** 会话 CRUD api(默认 claw;制作PPT 传 boltslidesSessions)。 */
  api?: typeof clawSessions;
  sectionId?: string;
  emptyHint?: string;
}

export function ClawSessionList({
  activeSessionId,
  onActivate,
  onNewConversation,
  api = clawSessions,
  sectionId = 'claw-sessions',
  emptyHint = '还没有会话, 在右侧输入第一句话即可开始',
}: ClawSessionListProps) {
  return (
    <AgentSessionList
      api={api}
      activeSessionId={activeSessionId}
      onActivate={onActivate}
      onNewConversation={onNewConversation}
      sectionId={sectionId}
      emptyHint={emptyHint}
    />
  );
}
