import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Bell, CheckCheck, Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton } from '@/shared/components/IconButton';
import {
  useDeleteNotification,
  useMarkAllRead,
  useMarkRead,
  useNotificationList,
  useUnreadCount,
  type UserMessage,
} from '@/shared/api/notifications';
import { isValidAppPath } from '@/shared/lib/route-validation';
import { cn } from '@/shared/lib/utils';

/**
 * 顶栏通知铃铛 + Popover 列表。
 *
 * 仅在登录态下挂载(由 UserSection 判定)。
 *
 * Popover 内容:
 *   - 顶部:标题 + 「全部已读」按钮(有未读时显示)
 *   - tabs:全部 / 未读
 *   - 列表:每条通知 title + content + 时间;未读项左侧红点 + 浅红底
 *   - 点击单条:标记已读 + (有 link_url 时) 关闭弹层并 navigate
 *   - 底部:加载更多 / 已加载完
 *
 * 未读数来自 [[useUnreadCount]],WebSocket 推送会即时更新缓存
 * (见 [[useNotificationSocket]])。
 */

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const unreadQ = useUnreadCount();
  const unread = unreadQ.data ?? 0;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <div className="relative inline-flex">
          <IconButton tooltip="通知" className="rounded-8 bg-surface-2">
            <Bell />
          </IconButton>
          {unread > 0 && (
            <span
              aria-label={`${unread} 条未读`}
              className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center px-1 rounded-pill bg-brand-red text-background text-2xs font-bold tabular-nums pointer-events-none"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          className="z-popover w-[380px] max-h-[calc(100vh-120px)] flex flex-col rounded-12 border border-border bg-surface-card"
        >
          <NotificationHeader unread={unread} />
          <NotificationTabs tab={tab} onChange={setTab} unread={unread} />
          <NotificationList tab={tab} onItemNavigate={() => setOpen(false)} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ===========================================================================

function NotificationHeader({ unread }: { unread: number }) {
  const markAll = useMarkAllRead();
  return (
    <header className="flex items-center justify-between gap-2 h-10 px-3 border-b border-border-soft shrink-0">
      <span className="text-sm font-bold text-foreground">通知</span>
      <button
        type="button"
        onClick={() => markAll.mutate()}
        disabled={unread === 0 || markAll.isPending}
        className={cn(
          'inline-flex items-center gap-1 h-7 px-2 rounded-8 text-xs transition-colors',
          unread === 0 || markAll.isPending
            ? 'text-faint cursor-not-allowed'
            : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
        )}
      >
        <CheckCheck className="size-3" strokeWidth={2.5} />
        全部已读
      </button>
    </header>
  );
}

function NotificationTabs({
  tab,
  onChange,
  unread,
}: {
  tab: 'all' | 'unread';
  onChange: (t: 'all' | 'unread') => void;
  unread: number;
}) {
  return (
    <div className="flex items-center gap-1 px-3 border-b border-border-soft shrink-0">
      <TabButton active={tab === 'all'} onClick={() => onChange('all')}>
        全部
      </TabButton>
      <TabButton active={tab === 'unread'} onClick={() => onChange('unread')}>
        未读
        {unread > 0 && (
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center px-1 rounded-pill bg-brand-red text-background text-2xs font-bold tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center h-8 px-3 text-xs font-bold transition-colors',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute left-2 right-2 -bottom-px h-0.5 bg-brand-red rounded-pill"
        />
      )}
    </button>
  );
}

function NotificationList({
  tab,
  onItemNavigate,
}: {
  tab: 'all' | 'unread';
  onItemNavigate: () => void;
}) {
  const filter = useMemo(
    () => (tab === 'unread' ? { is_read: false } : {}),
    [tab]
  );
  const listQ = useNotificationList(filter);

  const items = useMemo<UserMessage[]>(() => {
    if (!listQ.data) return [];
    return listQ.data.pages.flatMap((p) => p.list);
  }, [listQ.data]);

  if (listQ.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Loader2 className="size-4 animate-spin text-faint" />
      </div>
    );
  }

  if (listQ.error) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 text-xs text-brand-red">
        通知加载失败,请稍后再试
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 text-center gap-2">
        <Inbox className="size-8 text-faint" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">
          {tab === 'unread' ? '没有未读通知' : '还没有通知'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <ul>
        {items.map((m) => (
          <NotificationItem key={m.id} item={m} onNavigate={onItemNavigate} />
        ))}
      </ul>
      {listQ.hasNextPage && (
        <div className="px-3 py-2.5 border-t border-border-soft">
          <button
            type="button"
            onClick={() => listQ.fetchNextPage()}
            disabled={listQ.isFetchingNextPage}
            className="w-full inline-flex items-center justify-center h-7 rounded-8 text-xs text-muted-foreground hover:bg-surface-1 hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {listQ.isFetchingNextPage ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              '加载更多'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  item,
  onNavigate,
}: {
  item: UserMessage;
  onNavigate: () => void;
}) {
  const markRead = useMarkRead();
  const remove = useDeleteNotification();
  const navigate = useNavigate();

  const handleClick = () => {
    if (!item.is_read) markRead.mutate(item.id);
    if (item.link_url) {
      if (item.link_url.startsWith('/')) {
        // 站内链接 —— 先用白名单兜底校验。运营写好的通知可能指向已下线的页面,
        // 直接 navigate 会让用户落到 404,体验差。先验一次,失败给可解释的提示。
        if (!isValidAppPath(item.link_url)) {
          toast.warning('该通知中的链接已失效', {
            description: `路径 ${item.link_url} 可能指向已下线或迁移的页面。`,
          });
          return;
        }
        navigate(item.link_url);
      } else {
        // 外链直接新窗口打开;外链的存活性不归本端管,交给浏览器自身的错误提示。
        window.open(item.link_url, '_blank', 'noopener,noreferrer');
      }
      onNavigate();
    }
  };

  return (
    <li
      className={cn(
        'group relative flex flex-col gap-1 px-3 py-3 border-b border-border-soft transition-colors',
        !item.is_read && 'bg-danger-soft/40'
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        className="text-left w-full"
      >
        <div className="flex items-start gap-2">
          {!item.is_read && (
            <span
              aria-hidden
              className="mt-1.5 inline-block size-1.5 rounded-pill bg-brand-red shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground line-clamp-1">
              {item.title}
            </p>
            <p className="mt-0.5 text-xs text-subtle line-clamp-3 leading-paragraph">
              {item.content}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-2xs text-faint">
              <span>{formatRelativeTime(item.created_at)}</span>
              {item.link_text && (
                <span className="text-brand-red font-bold">
                  {item.link_text} →
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          remove.mutate(item.id);
        }}
        className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-4 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-foreground transition-opacity"
        aria-label="删除"
        title="删除"
      >
        ×
      </button>
    </li>
  );
}

// ===========================================================================
// 简易相对时间格式化 —— 几小时内显示"x 分钟前",更早显示日期
// ===========================================================================

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return '';
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} 天前`;
  // 7 天以上显示日期
  return d.toLocaleDateString('zh-CN');
}
