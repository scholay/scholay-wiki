import { Loader2, MessagesSquare } from 'lucide-react';
import { SidebarSection } from '@/shared/components/sidebar';
import { cn } from '@/shared/lib/utils';
import { computeSessionTitle } from '@/shared/lib/agent-session-title';
import type { PrismConversation } from '../../api/prism';

/**
 * Prism 侧栏「会话历史」区(大纲/配图下方)—— 一项目多条对话共享同一份论文,这里切换。
 *
 * 与 claw/smart-search 的 AgentSessionList 视觉一致,但更轻:只「列 + 切换」——
 *   · 新对话在顶栏(醒目);改名/删除本 feature 暂不做(对话历史一律保留);
 *   · 活动对话高亮(active),标题生成中显示 spinner(computeSessionTitle,与另两个 agent 同源)。
 * 数据由 PrismWorkspaceV2 拉取(useProjectConversations)传入 —— 侧栏纯展示,不自持状态。
 */
export function PrismConversationList({
  conversations,
  activeSessionId,
  onSwitch,
}: {
  conversations: PrismConversation[];
  activeSessionId: string | null;
  onSwitch: (sessionId: string) => void;
}) {
  return (
    <SidebarSection id="prism-conversations" label="会话历史" bordered>
      {conversations.length === 0 ? (
        <p className="px-4 py-1 text-12 text-faint">还没有对话,发送第一句话即可开始</p>
      ) : (
        <div className="flex flex-col">
          {conversations.map((c) => (
            <ConversationRow
              key={c.sessionId}
              conv={c}
              active={c.sessionId === activeSessionId}
              onClick={() => {
                if (c.sessionId !== activeSessionId) onSwitch(c.sessionId);
              }}
            />
          ))}
        </div>
      )}
    </SidebarSection>
  );
}

function ConversationRow({
  conv,
  active,
  onClick,
}: {
  conv: PrismConversation;
  active: boolean;
  onClick: () => void;
}) {
  const { displayTitle, loading } = computeSessionTitle(conv.title, conv.createdAt, conv.messageCount, active);
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-2 px-4 cursor-pointer transition-colors max-sm:h-11',
        active ? 'bg-surface-2' : 'hover:bg-surface-1',
      )}
      onClick={onClick}
    >
      <MessagesSquare className={cn('size-3.5 shrink-0', active ? 'text-brand-green' : 'text-faint')} />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-14 flex items-center gap-1.5',
            active ? 'text-foreground font-medium' : 'text-subtle',
            loading && 'italic text-faint',
          )}
          title={displayTitle}
        >
          {loading && <Loader2 className="size-3 shrink-0 animate-spin" />}
          <span className="truncate">{displayTitle}</span>
        </div>
      </div>
    </div>
  );
}
