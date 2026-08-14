import { useMemo, useState } from 'react';
import { differenceInCalendarDays, isToday, isYesterday } from 'date-fns';
import { Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/shared/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/shared/lib/utils';
import { primeMobileKeyboard } from '@/shared/lib/ios-keyboard';
import { computeSessionTitle } from '@/shared/lib/agent-session-title';
import { relativeTimeZh } from '@/shared/lib/relative-time';
import { useClawSessions, type ClawSessionItem } from '../../api/session';
import { ClawRenameDialog, ClawDeleteDialog } from '../sidebar/ClawSessionDialogs';

/**
 * 移动端「历史对话」抽屉 —— 形态对齐主流聊天助手(ChatGPT / DeepSeek / Claude):
 * 顶部一个「新对话」按钮 + 下面按日期分组(今天 / 昨天 / 近 7 天 / 更早)的会话列表,
 * 每条点开即切换、长按右侧 ⋮ 可重命名 / 删除。左侧滑入(Sheet side="left")。
 *
 * 复用桌面侧边栏同一套数据 hook(useClawSessions)、标题 loading 判定(computeSessionTitle)与
 * 重命名 / 删除弹窗(ClawSessionDialogs),不重复造轮子;切换 / 新对话仍由页面(MobileClawPage)
 * 通过 onActivate / onNewConversation 处理(保持与原有 conv.handleActivateSession 行为一致)。
 */
const GROUP_ORDER = ['今天', '昨天', '近 7 天', '更早'] as const;

function bucketOf(s: ClawSessionItem): (typeof GROUP_ORDER)[number] {
  const d = new Date(s.lastAccessedAt);
  if (Number.isNaN(d.getTime())) return '更早';
  if (isToday(d)) return '今天';
  if (isYesterday(d)) return '昨天';
  if (differenceInCalendarDays(new Date(), d) <= 7) return '近 7 天';
  return '更早';
}

export function MobileClawDrawer({
  open,
  onOpenChange,
  activeSessionId,
  onActivate,
  onNewConversation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSessionId: string | null;
  /** 点某条历史 → 切换并关抽屉(页面调 conv.handleActivateSession + 关闭)。 */
  onActivate: (sessionId: string) => void;
  /** 点「新对话」→ 切到空白态并关抽屉。 */
  onNewConversation: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const { data: sessions, isLoading } = useClawSessions();
  const [renameTarget, setRenameTarget] = useState<ClawSessionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClawSessionItem | null>(null);

  const groups = useMemo(() => {
    if (!sessions) return [];
    const buckets = new Map<string, ClawSessionItem[]>();
    for (const s of sessions) {
      const key = bucketOf(s);
      const arr = buckets.get(key);
      if (arr) arr.push(s);
      else buckets.set(key, [s]);
    }
    return GROUP_ORDER.map((label) => ({ label, items: buckets.get(label) ?? [] })).filter(
      (g) => g.items.length > 0
    );
  }, [sessions]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* 左侧抽屉:宽度 86vw 封顶 sm(主流聊天助手抽屉宽度,token 无对应档位) */}
      <SheetContent side="left" className="w-80 max-w-[86vw] gap-0 p-0">
        <SheetTitle className="sr-only">历史对话</SheetTitle>

        <div className="flex h-full flex-col">
          {/* 会话列表(按日期分组)—— 新建对话走页面右上角的悬浮按钮,抽屉只管历史。
              pt-5 给右上角的关闭 X 让位。 */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-5">
            {!token ? (
              <p className="px-2 py-10 text-center text-12 text-faint">登录后可见历史会话</p>
            ) : isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="size-4 animate-spin text-faint" />
              </div>
            ) : groups.length === 0 ? (
              <p className="px-2 py-10 text-center text-12 text-faint">
                还没有会话,发出第一条消息试试
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.label} className="mb-1">
                  <p className="px-3 pb-1 pt-3 text-12 font-medium text-faint">{g.label}</p>
                  {g.items.map((s) => (
                    <SessionRow
                      key={s.sessionId}
                      session={s}
                      active={s.sessionId === activeSessionId}
                      onActivate={() => onActivate(s.sessionId)}
                      onRename={() => setRenameTarget(s)}
                      onDelete={() => setDeleteTarget(s)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <ClawRenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} />
        <ClawDeleteDialog
          target={deleteTarget}
          activeSessionId={activeSessionId}
          onClose={() => setDeleteTarget(null)}
          // 删的是当前会话 → 切到下一条;没有了 → 回到新对话空白态。
          onActiveDeleted={() => {
            const next = sessions?.find((x) => x.sessionId !== deleteTarget?.sessionId);
            if (next) onActivate(next.sessionId);
            else onNewConversation();
          }}
        />
      </SheetContent>
    </Sheet>
  );
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
  const { displayTitle: text, loading } = computeSessionTitle(
    session.title,
    session.createdAt,
    session.messageCount,
    active,
  );
  const lastAccessed = relativeTimeZh(session.lastAccessedAt);
  const meta = [
    `${session.messageCount} 条消息`,
    lastAccessed ? `最近访问 ${lastAccessed}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-8 px-3 py-2.5 transition-colors',
        active ? 'bg-surface-2' : 'active:bg-surface-1'
      )}
      onClick={onActivate}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'flex min-w-0 items-center gap-1.5 truncate text-14',
            active ? 'font-medium text-foreground' : 'text-subtle',
            loading && 'italic text-faint'
          )}
        >
          {loading && <Loader2 className="size-3 shrink-0 animate-spin" />}
          <span className="truncate">{text}</span>
        </span>
        <span className="truncate text-12 font-normal text-faint">{meta}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-8 text-faint active:bg-surface-2"
            aria-label="更多操作"
          >
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-32"
          // 关闭下拉时阻止 Radix 把焦点弹回 ⋮ 触发按钮(非输入框)——否则在 iOS 上会把刚打开的
          // 重命名弹窗输入框的软键盘抢掉。让重命名弹窗的 autoFocus 独占焦点。(对删除项无害:删除弹窗无输入)
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              primeMobileKeyboard(); // 重命名弹窗的输入框 autoFocus 在弹窗挂载后,先唤起键盘
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
