import { useState } from 'react';
import { Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { SidebarSection } from '@/shared/components/sidebar';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/shared/lib/utils';
import {
  useActivateClawSession,
  useClawSessions,
  useDeleteClawSession,
  useRenameClawSession,
  type ClawSessionItem,
} from '../../api/session';

/**
 * 智能助手侧边栏 — 会话历史列表区域。
 *
 * 职责:
 *   - 列出当前用户的全部 claw session (按 last_accessed_at DESC)
 *   - 顶部 "+ 新对话" 按钮: lazy 语义, 调 onNewConversation 切到本地空白态 (不建后端 session)
 *   - 每行支持: 点击 → activate; hover/点 ⋮ → 重命名 / 删除
 *   - 当前 active 项视觉高亮
 *
 * 父组件传入 activeSessionId 控制高亮 + onActivate 用于切换。
 * 标题为空时显示 "新会话" + sessionId 短串作降级 ID 提示。
 */
export interface ClawSessionListProps {
  activeSessionId: string | null;
  /** 用户点了某条 session → 父组件: setActiveSessionId(newId) + invalidate */
  onActivate: (sessionId: string) => void;
  /** 删光全部会话时回退到"新对话空白态"用 (= ClawPage.handleNewConversation)。
      会话历史区不再放"新对话"按钮 (统一走顶部 header 的那个), 这里仅删光兜底用。 */
  onNewConversation: () => void;
}

export function ClawSessionList({
  activeSessionId,
  onActivate,
  onNewConversation,
}: ClawSessionListProps) {
  const token = useAuthStore((s) => s.token);
  const { data: sessions, isLoading } = useClawSessions();
  const activateSession = useActivateClawSession();
  const [renameTarget, setRenameTarget] = useState<ClawSessionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClawSessionItem | null>(null);

  const handleActivate = async (item: ClawSessionItem) => {
    if (item.sessionId === activeSessionId) return;
    try {
      await activateSession.mutateAsync(item.sessionId);
      onActivate(item.sessionId);
    } catch (err) {
      toast.error((err as Error).message || '切换会话失败');
    }
  };

  return (
    <SidebarSection id="claw-sessions" label="会话历史" prominent>
      {!token ? (
        <div className="px-4 py-3 text-2xs text-faint">登录后可见历史会话</div>
      ) : isLoading ? (
        <div className="px-4 py-3 text-2xs text-faint">加载中…</div>
      ) : !sessions || sessions.length === 0 ? (
        <div className="px-4 py-3 text-2xs text-faint">
          还没有会话, 在右侧输入第一句话即可开始
        </div>
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

      <RenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} />
      <DeleteDialog
        target={deleteTarget}
        activeSessionId={activeSessionId}
        onClose={() => setDeleteTarget(null)}
        // 删除当前活跃的会话 → 切到列表里下一条; 没有更多了 → 切到空白新对话态。
        onActiveDeleted={() => {
          const next = sessions?.find((x) => x.sessionId !== deleteTarget?.sessionId);
          if (next) onActivate(next.sessionId);
          else onNewConversation(); // 全删光 → 回到新对话空白页 (不再自动建会话)
        }}
      />
    </SidebarSection>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────

// agent 默认 title (英文 "Untitled Session" / 中文兜底) — 视作 "标题还没生成完",
// 应当显示 loading 而不是把这个原文塞给用户看。
// agent 通常在用户首条 user_message 之后异步起 title gen, 几秒内会通过 WS
// session_title_updated 事件推回真实 title; 我们再 invalidate sessions list 拉新。
const PLACEHOLDER_TITLES = new Set(['', 'Untitled Session', '新会话']);

function isTitleStillLoading(title: string): boolean {
  return PLACEHOLDER_TITLES.has(title.trim());
}

function SessionRow({
  session,
  active,
  onActivate,
  onRename,
  onDelete,
}: {
  session: ClawSessionItem;
  active: boolean;
  onActivate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  // 标题加载态判定:
  //   - 有真实 title → 直接显示
  //   - title 还是占位 (空 / "Untitled Session") 且 (有消息 || 当前活跃) → "生成标题中…"
  //     · 当前活跃: lazy 创建后第一条消息刚发出, messageCount 可能还没刷到 > 0,
  //       但这条就是用户正在对话的会话, 标题必然在生成中 → 立刻显示 loading 而不是 "新对话"
  //     · 有消息: 兜底任何"有内容但 title 没回来"的会话
  // lazy 创建后不会再有"空壳 session", 所以不必担心 loading 永久卡住。
  const rawTitle = session.title?.trim() ?? '';
  const loading =
    isTitleStillLoading(rawTitle) && (session.messageCount > 0 || active);
  const displayTitle = loading ? '生成标题中…' : rawTitle || '新对话';

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-colors',
        active ? 'bg-surface-2' : 'hover:bg-surface-1',
      )}
      onClick={onActivate}
    >
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'truncate text-sm flex items-center gap-1.5',
            active ? 'text-foreground font-semibold' : 'text-subtle',
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
            className="inline-flex size-6 items-center justify-center rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-foreground data-[state=open]:opacity-100"
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

// ─── Rename dialog ─────────────────────────────────────────────────────

function RenameDialog({
  target,
  onClose,
}: {
  target: ClawSessionItem | null;
  onClose: () => void;
}) {
  const rename = useRenameClawSession();
  const [title, setTitle] = useState('');

  // target 变化时同步初始值; 通过 key={target?.sessionId} 让 Input 重置
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) {
          setTitle('');
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md" key={target?.sessionId}>
        <DialogHeader>
          <DialogTitle>重命名会话</DialogTitle>
          <DialogDescription>
            标题会同步到 agent 端, 不影响会话内容。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="claw-rename-title">新标题</Label>
          <Input
            id="claw-rename-title"
            autoFocus
            defaultValue={target?.title ?? ''}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如: 论文方法学讨论"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!title.trim() || rename.isPending}
            onClick={async () => {
              if (!target) return;
              try {
                await rename.mutateAsync({
                  sessionId: target.sessionId,
                  title: title.trim(),
                });
                toast.success('已重命名');
                onClose();
              } catch (err) {
                toast.error((err as Error).message || '重命名失败');
              }
            }}
          >
            {rename.isPending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete dialog ─────────────────────────────────────────────────────

function DeleteDialog({
  target,
  activeSessionId,
  onClose,
  onActiveDeleted,
}: {
  target: ClawSessionItem | null;
  activeSessionId: string | null;
  onClose: () => void;
  onActiveDeleted: () => void;
}) {
  const del = useDeleteClawSession();
  const isActive = !!target && target.sessionId === activeSessionId;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>确定删除这个会话?</DialogTitle>
          <DialogDescription>
            会话 <span className="font-mono text-foreground">"{target?.title?.trim() || '新会话'}"</span> 将被永久删除, 包括 agent
            端的全部消息历史。{isActive && <strong>这是你当前的会话, 删除后会切到列表中的下一条 (或新建一条)。</strong>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              if (!target) return;
              try {
                await del.mutateAsync(target.sessionId);
                if (isActive) onActiveDeleted();
                toast.success('已删除');
                onClose();
              } catch (err) {
                toast.error((err as Error).message || '删除失败');
              }
            }}
          >
            {del.isPending ? '删除中…' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
