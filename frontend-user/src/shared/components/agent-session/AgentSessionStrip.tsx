import { useMemo, useState } from 'react';
import {
  ChevronDown,
  Loader2,
  MoreVertical,
  Pencil,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/shared/lib/utils';
import type { AgentSessionApi, AgentSessionItem } from '@/shared/api/agent-sessions';
import { computeSessionTitle } from '@/shared/lib/agent-session-title';
import { AgentRenameDialog, AgentDeleteDialog } from './AgentSessionDialogs';

export interface AgentSessionStripProps {
  api: AgentSessionApi;
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onNewConversation: () => void;
  newConversationDisabled?: boolean;
  newConversationTitle?: string;
  emptyHint?: string;
  loggedOutHint?: string;
}

/** 会话下拉选框 —— 右侧常驻「新对话」 */
export function AgentSessionStrip({
  api,
  activeSessionId,
  onActivate,
  onNewConversation,
  newConversationDisabled = false,
  newConversationTitle = '开始新对话',
  emptyHint = '还没有会话, 发送第一句话即可开始',
  loggedOutHint = '登录后可见历史会话',
}: AgentSessionStripProps) {
  const token = useAuthStore((s) => s.token);
  const { data: sessions, isLoading } = api.useSessions();
  const activateSession = api.useActivateSession();
  const [renameTarget, setRenameTarget] = useState<AgentSessionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentSessionItem | null>(null);

  const activeSession = sessions?.find((s) => s.sessionId === activeSessionId);

  const options = useMemo(() => {
    if (!sessions?.length) return [];
    return sessions.map((session) => {
      const active = session.sessionId === activeSessionId;
      const { displayTitle, loading } = computeSessionTitle(
        session.title,
        session.createdAt,
        session.messageCount,
        active,
      );
      return { session, label: loading ? `${displayTitle}…` : displayTitle };
    });
  }, [sessions, activeSessionId]);

  const handleSelectChange = async (sessionId: string) => {
    if (!sessionId || sessionId === activeSessionId) return;
    const item = sessions?.find((s) => s.sessionId === sessionId);
    if (!item) return;
    try {
      await activateSession.mutateAsync(sessionId);
      onActivate(sessionId);
    } catch (err) {
      toast.error((err as Error).message || '切换会话失败');
    }
  };

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <div className="relative min-w-0 flex-1">
          {!token ? (
            <span className="inline-flex h-7 w-full items-center text-2xs text-faint">
              {loggedOutHint}
            </span>
          ) : isLoading ? (
            <span className="inline-flex h-7 w-full items-center gap-1.5 text-2xs text-faint">
              <Loader2 className="size-3 animate-spin" />
              加载会话…
            </span>
          ) : !sessions || sessions.length === 0 ? (
            <span className="inline-flex h-7 w-full items-center text-2xs text-faint">
              {emptyHint}
            </span>
          ) : (
            <>
              <select
                value={activeSessionId ?? ''}
                onChange={(e) => handleSelectChange(e.target.value)}
                aria-label="会话历史"
                className={cn(
                  'h-7 w-full min-w-0 appearance-none truncate rounded-sm border border-border bg-background',
                  'pl-2 pr-7 text-xs font-semibold text-foreground outline-none',
                  'transition-colors hover:border-border-strong focus:border-foreground focus:ring-2 focus:ring-ring/20',
                  !activeSessionId && 'text-subtle',
                )}
              >
                <option value="" disabled={!!activeSessionId}>
                  新对话
                </option>
                {options.map(({ session, label }) => (
                  <option key={session.sessionId} value={session.sessionId}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-faint"
                aria-hidden
              />
            </>
          )}
        </div>

        {activeSession && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm border border-border text-subtle transition-colors hover:bg-surface-1 hover:text-foreground"
                aria-label="会话操作"
              >
                <MoreVertical className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onClick={() => setRenameTarget(activeSession)}>
                <Pencil className="size-3.5" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleteTarget(activeSession)}
                className="text-brand-red focus:text-brand-red"
              >
                <Trash2 className="size-3.5" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <button
          type="button"
          onClick={onNewConversation}
          disabled={newConversationDisabled}
          title={newConversationTitle}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill border border-border-button px-2.5 text-xs font-medium text-subtle transition-colors hover:bg-surface-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SquarePen className="size-3.5" strokeWidth={2} />
          新对话
        </button>
      </div>

      <AgentRenameDialog api={api} target={renameTarget} onClose={() => setRenameTarget(null)} />
      <AgentDeleteDialog
        api={api}
        target={deleteTarget}
        activeSessionId={activeSessionId}
        onClose={() => setDeleteTarget(null)}
        onActiveDeleted={() => {
          const next = sessions?.find((x) => x.sessionId !== deleteTarget?.sessionId);
          if (next) onActivate(next.sessionId);
          else onNewConversation();
        }}
      />
    </>
  );
}
