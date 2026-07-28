import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { computeSessionTitle } from '@/shared/lib/agent-session-title';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';
import { useSmartSearchSessions, smartSearchSessions } from '../../api/smart-search';

/** 智能搜索 hero 输入框下方 —— 最近会话快捷入口(点选即切换 activeSessionId)。 */
export function SmartSearchSessionDock() {
  const activeSessionId = useSmartSearchSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSmartSearchSessionStore((s) => s.setActiveSessionId);
  const { data: sessions, isLoading } = useSmartSearchSessions();
  const activateSession = smartSearchSessions.useActivateSession();

  const handleActivate = async (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    try {
      await activateSession.mutateAsync(sessionId);
      setActiveSessionId(sessionId);
    } catch (err) {
      toast.error((err as Error).message || '切换会话失败');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-1 text-xs text-faint">
        <Loader2 className="size-3.5 animate-spin" />
        加载会话历史…
      </div>
    );
  }

  if (!sessions?.length) return null;

  return (
    <div className="max-h-52 overflow-y-auto rounded-xl border border-border/70 bg-background/75 backdrop-blur-sm">
      {sessions.map((session) => {
        const active = session.sessionId === activeSessionId;
        const { displayTitle, loading } = computeSessionTitle(
          session.title,
          session.createdAt,
          session.messageCount,
          active,
        );

        return (
          <button
            key={session.sessionId}
            type="button"
            onClick={() => handleActivate(session.sessionId)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors',
              'border-b border-border/50 last:border-b-0',
              active ? 'bg-surface-2' : 'hover:bg-surface-1',
            )}
          >
            {loading && <Loader2 className="size-3 shrink-0 animate-spin text-faint" />}
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                active ? 'font-semibold text-foreground' : 'text-subtle',
                loading && 'italic text-faint',
              )}
              title={displayTitle}
            >
              {displayTitle}
            </span>
          </button>
        );
      })}
    </div>
  );
}
