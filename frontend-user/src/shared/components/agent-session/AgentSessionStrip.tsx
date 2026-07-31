import { useMemo, useState, type ReactNode } from 'react';
import {
  History,
  Loader2,
  Pencil,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
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
  /**
   * bar   = 主区顶部吸顶整行(默认,对话进行中)
   * stack = 与输入框同宽贴上方(空态 hero 成组居中)
   * dock  = 旧兼容
   */
  placement?: 'bar' | 'stack' | 'dock';
  /**
   * true(默认)=完整会话管理:历史入口、时间、重命名/删除(智能助手)。
   * false=精简条:仅标题 + trailingSlot + 新对话(智能搜索;记录与助手不互通)。
   */
  sessionControls?: boolean;
  /** 右侧操作前额外插槽(如智能搜索:模型选择 + 上下文水位 + 跳转助手)。 */
  trailingSlot?: ReactNode;
  className?: string;
}

/** 会话条 —— 左历史入口 + 当前会话时间/标题;默认主区顶部吸顶独占一行。 */
export function AgentSessionStrip({
  api,
  activeSessionId,
  onActivate,
  onNewConversation,
  newConversationDisabled = false,
  newConversationTitle = '开始新对话',
  emptyHint = '还没有会话, 发送第一句话即可开始',
  loggedOutHint = '登录后可见历史会话',
  placement = 'bar',
  sessionControls = true,
  trailingSlot,
  className,
}: AgentSessionStripProps) {
  const token = useAuthStore((s) => s.token);
  const { data: sessions, isLoading } = api.useSessions();
  const activateSession = api.useActivateSession();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AgentSessionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentSessionItem | null>(null);

  const activeSession = sessions?.find((s) => s.sessionId === activeSessionId);

  const currentLabel = useMemo(() => {
    if (!activeSession) {
      return { time: '', title: '新对话', loading: false };
    }
    const { displayTitle, loading } = computeSessionTitle(
      activeSession.title,
      activeSession.createdAt,
      activeSession.messageCount,
      true,
    );
    const stamp =
      activeSession.agentModifiedAt ||
      activeSession.lastAccessedAt ||
      activeSession.createdAt;
    return {
      time: formatSessionTime(stamp),
      title: loading ? `${displayTitle}…` : displayTitle,
      loading,
    };
  }, [activeSession]);

  const handleActivate = async (sessionId: string) => {
    if (!sessionId || sessionId === activeSessionId) {
      setHistoryOpen(false);
      return;
    }
    try {
      await activateSession.mutateAsync(sessionId);
      onActivate(sessionId);
      setHistoryOpen(false);
    } catch (err) {
      toast.error((err as Error).message || '切换会话失败');
    }
  };

  const dock = placement === 'dock';
  const stack = placement === 'stack';
  const historyCount = sessions?.length ?? 0;

  return (
    <>
      <div
        className={cn(
          dock
            ? 'flex h-9 w-full items-center gap-2'
            : stack
              ? // 空态:不吸顶,宽度跟父级(与输入框同宽)
                'w-full shrink-0'
              : // 对话中:外层透明吸顶,描边落在内层内容宽上
                'sticky top-0 z-20 w-full shrink-0 px-4 pt-2.5 pb-1.5',
          className,
        )}
      >
        <div
          className={cn(
            'relative flex items-center',
            dock && 'h-9 w-full',
            (stack || !dock) &&
              cn(
                'h-10 w-full gap-1 rounded-xl px-2',
                'border border-border bg-background shadow-sm',
                !stack && 'mx-auto max-w-2xl',
              ),
          )}
        >
          {/* 左:历史入口 + 更新时间(智能搜索精简条不展示,记录与助手不互通) */}
          {sessionControls ? (
            <div className="relative z-10 flex shrink-0 items-center gap-2">
              <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`会话历史，共 ${historyCount} 条`}
                    title={`会话历史（${historyCount}）`}
                    disabled={!token}
                    className={cn(
                      'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-subtle transition-colors',
                      'hover:bg-surface-2 hover:text-foreground',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      historyOpen
                        ? 'bg-surface-2 text-foreground'
                        : 'bg-surface-1/80',
                    )}
                  >
                    <History className="size-3.5 shrink-0" strokeWidth={2} />
                    <span className="min-w-[1ch] text-xs font-semibold tabular-nums text-foreground">
                      {isLoading ? '…' : historyCount}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="w-[min(360px,calc(100vw-32px))] overflow-hidden border border-border p-0 shadow-lg"
                >
                  <header className="flex h-10 items-center border-b border-border-soft px-3">
                    <span className="text-xs font-bold text-foreground">会话历史</span>
                  </header>
                  {!token ? (
                    <div className="px-3 py-6 text-center text-xs text-faint">
                      {loggedOutHint}
                    </div>
                  ) : isLoading ? (
                    <div className="flex items-center justify-center gap-1.5 px-3 py-6 text-xs text-faint">
                      <Loader2 className="size-3.5 animate-spin" />
                      加载会话…
                    </div>
                  ) : !sessions || sessions.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-faint">
                      {emptyHint}
                    </div>
                  ) : (
                    <ul className="max-h-[min(50vh,320px)] overflow-y-auto py-1">
                      {sessions.map((session) => {
                        const active = session.sessionId === activeSessionId;
                        const { displayTitle, loading } = computeSessionTitle(
                          session.title,
                          session.createdAt,
                          session.messageCount,
                          active,
                        );
                        const stamp =
                          session.agentModifiedAt ||
                          session.lastAccessedAt ||
                          session.createdAt;
                        return (
                          <li key={session.sessionId}>
                            <button
                              type="button"
                              onClick={() => handleActivate(session.sessionId)}
                              className={cn(
                                'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                                active ? 'bg-surface-1' : 'hover:bg-surface-1',
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                                {loading ? `${displayTitle}…` : displayTitle}
                              </span>
                              <span className="shrink-0 text-2xs text-faint">
                                {formatSessionTime(stamp)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
              {token && !isLoading && currentLabel.time && (
                <span className="shrink-0 text-xs tabular-nums text-faint">
                  {currentLabel.time}
                </span>
              )}
            </div>
          ) : (
            <div className="relative z-10 w-1 shrink-0" aria-hidden />
          )}

          {/* 中:标题绝对居中 */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center justify-center',
              trailingSlot || !sessionControls ? 'px-40' : 'px-28',
            )}
          >
            {!token ? (
              <span className="text-2xs text-faint">{loggedOutHint}</span>
            ) : sessionControls && isLoading ? (
              <span className="inline-flex items-center gap-1.5 text-2xs text-faint">
                <Loader2 className="size-3 animate-spin" />
                加载会话…
              </span>
            ) : (
              <span
                className={cn(
                  'min-w-0 max-w-full truncate text-center text-sm font-semibold text-foreground',
                  currentLabel.loading && 'text-subtle',
                  !activeSessionId && 'font-medium text-subtle',
                )}
                aria-label={`当前会话 ${currentLabel.title}`}
                title={currentLabel.title}
              >
                {currentLabel.title}
              </span>
            )}
          </div>

          {/* 右:trailingSlot → (可选)重命名/删除 → 新对话 */}
          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-0.5">
            {trailingSlot ? (
              <div className="mr-0.5 flex shrink-0 items-center gap-1.5">{trailingSlot}</div>
            ) : null}
            {sessionControls && activeSession ? (
              <>
                <button
                  type="button"
                  onClick={() => setRenameTarget(activeSession)}
                  title="重命名"
                  aria-label="重命名会话"
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <Pencil className="size-3.5" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(activeSession)}
                  title="删除"
                  aria-label="删除会话"
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-2 hover:text-brand-red"
                >
                  <Trash2 className="size-3.5" strokeWidth={2} />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onNewConversation}
              disabled={newConversationDisabled}
              title={newConversationTitle}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-2.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SquarePen className="size-3.5" strokeWidth={2} />
              新对话
            </button>
          </div>
        </div>
      </div>

      {sessionControls ? (
        <>
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
      ) : null}
    </>
  );
}

/** 会话更新时间:月-日 时:分,例如 `7-29 14:40`。 */
function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}
