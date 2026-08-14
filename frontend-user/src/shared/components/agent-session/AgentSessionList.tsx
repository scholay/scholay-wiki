import { useState } from 'react';
import { Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarSection } from '@/shared/components/sidebar';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/shared/lib/utils';
import type { AgentSessionApi, AgentSessionItem } from '@/shared/api/agent-sessions';
import { computeSessionTitle } from '@/shared/lib/agent-session-title';
import { AgentRenameDialog, AgentDeleteDialog } from './AgentSessionDialogs';

/**
 * agent 侧边栏「会话历史」列表区 —— claw / smart-search 共用(此前 claw 私有,现收口到 shared)。
 *
 * 职责:
 *   - 列出当前用户在本 feature 的全部 session(按 last_accessed_at DESC)
 *   - 每行:点击 → activate;hover/点 ⋮ → 重命名 / 删除
 *   - 当前 active 项视觉高亮;标题生成中显示 spinner(见 computeSessionTitle)
 *
 * feature 差异全部经 `api`(makeAgentSessionApi 产出)与 `sectionId`/`label` 注入;
 * 「+新对话」按钮不在这里(统一走各 feature 顶部 header),onNewConversation 仅删光兜底用。
 */
export interface AgentSessionListProps {
  api: AgentSessionApi;
  activeSessionId: string | null;
  /** 用户点了某条 session → 父组件: setActiveSessionId(newId) */
  onActivate: (sessionId: string) => void;
  /** 删光全部会话时回退到「新对话空白态」用。 */
  onNewConversation: () => void;
  /** SidebarSection 的 id(feature 唯一,如 'claw-sessions' / 'smart-search-sessions')。 */
  sectionId: string;
  label?: string;
  emptyHint?: string;
  loggedOutHint?: string;
}

export function AgentSessionList({
  api,
  activeSessionId,
  onActivate,
  onNewConversation,
  sectionId,
  label = '会话历史',
  emptyHint = '还没有会话, 发送第一句话即可开始',
  loggedOutHint = '登录后可见历史会话',
}: AgentSessionListProps) {
  const token = useAuthStore((s) => s.token);
  const { data: sessions, isLoading } = api.useSessions();
  const activateSession = api.useActivateSession();
  const [renameTarget, setRenameTarget] = useState<AgentSessionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentSessionItem | null>(null);

  const handleActivate = async (item: AgentSessionItem) => {
    if (item.sessionId === activeSessionId) return;
    try {
      await activateSession.mutateAsync(item.sessionId);
      onActivate(item.sessionId);
    } catch (err) {
      toast.error((err as Error).message || '切换会话失败');
    }
  };

  return (
    <SidebarSection id={sectionId} label={label} prominent>
      {!token ? (
        <div className="px-4 py-3 text-12 text-faint">{loggedOutHint}</div>
      ) : isLoading ? (
        <div className="px-4 py-3 text-12 text-faint">加载中…</div>
      ) : !sessions || sessions.length === 0 ? (
        <div className="px-4 py-3 text-12 text-faint">{emptyHint}</div>
      ) : (
        <div className="flex flex-col">
          {sessions.map((s) => (
            <SessionRow
              key={s.sessionId}
              session={s}
              active={s.sessionId === activeSessionId}
              onActivate={() => handleActivate(s)}
              onRename={() => setRenameTarget(s)}
              onDelete={() => setDeleteTarget(s)}
            />
          ))}
        </div>
      )}

      <AgentRenameDialog api={api} target={renameTarget} onClose={() => setRenameTarget(null)} />
      <AgentDeleteDialog
        api={api}
        target={deleteTarget}
        activeSessionId={activeSessionId}
        onClose={() => setDeleteTarget(null)}
        // 删除当前活跃的会话 → 切到列表里下一条; 没有更多了 → 切到空白新对话态。
        onActiveDeleted={() => {
          const next = sessions?.find((x) => x.sessionId !== deleteTarget?.sessionId);
          if (next) onActivate(next.sessionId);
          else onNewConversation();
        }}
      />
    </SidebarSection>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────

function SessionRow({
  session,
  active,
  onActivate,
  onRename,
  onDelete,
}: {
  session: AgentSessionItem;
  active: boolean;
  onActivate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { displayTitle, loading } = computeSessionTitle(
    session.title,
    session.createdAt,
    session.messageCount,
    active,
  );

  return (
    <div
      className={cn(
        'group flex h-8 items-center gap-2 px-4 cursor-pointer transition-colors max-sm:h-11',
        active ? 'bg-surface-2' : 'hover:bg-surface-1',
      )}
      onClick={onActivate}
    >
      <div className="flex-1 min-w-0">
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-6 items-center justify-center rounded-4 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-foreground data-[state=open]:opacity-100"
            aria-label="更多操作"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
          >
            <Pencil className="size-3.5" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-brand-red focus:text-brand-red"
          >
            <Trash2 className="size-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
