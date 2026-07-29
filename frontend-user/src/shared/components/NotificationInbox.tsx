import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useDeleteNotification,
  useMarkAllRead,
  useMarkRead,
  useNotificationList,
  useUnreadCount,
  type UserMessage,
} from '@/shared/api/notifications';
import { RhinoSplitPane } from '@/shared/components/RhinoSplitPane';
import { isValidAppPath } from '@/shared/lib/route-validation';
import { cn } from '@/shared/lib/utils';

/**
 * 通知列表本体 —— 顶栏 Popover 与小犀牛对话框共用。
 * embedded：牛犀犀分栏（左全部/未读，右列表）。
 */
export function NotificationInbox({
  onItemNavigate,
  className,
  /** 嵌在小犀牛对话框时用左右分栏，并隐藏重复标题 */
  embedded,
}: {
  onItemNavigate?: () => void;
  className?: string;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const unreadQ = useUnreadCount();
  const unread = unreadQ.data ?? 0;

  if (embedded) {
    return (
      <RhinoSplitPane
        className={className}
        menu={[
          { id: 'all', label: '全部' },
          {
            id: 'unread',
            label: '未读',
            badge:
              unread > 0 ? (
                <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-pill bg-brand-red px-1 text-2xs font-bold tabular-nums text-background">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : undefined,
          },
        ]}
        activeId={tab}
        onSelect={(id) => setTab(id as 'all' | 'unread')}
      >
        <div className="flex h-full min-h-0 flex-col">
          <NotificationMarkAllBar unread={unread} />
          <NotificationList
            tab={tab}
            onItemNavigate={() => onItemNavigate?.()}
          />
        </div>
      </RhinoSplitPane>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <header className="flex h-9 shrink-0 items-center border-b border-border-soft px-3">
        <span className="text-sm font-bold text-foreground">通知</span>
      </header>
      <NotificationTabs tab={tab} onChange={setTab} unread={unread} />
      <NotificationList
        tab={tab}
        onItemNavigate={() => onItemNavigate?.()}
      />
    </div>
  );
}

function NotificationMarkAllBar({ unread }: { unread: number }) {
  const markAll = useMarkAllRead();
  return (
    <div className="flex shrink-0 items-center justify-end border-b border-border-soft px-2.5 py-1.5">
      <button
        type="button"
        onClick={() => markAll.mutate()}
        disabled={unread === 0 || markAll.isPending}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs transition-colors',
          unread === 0 || markAll.isPending
            ? 'cursor-not-allowed text-faint'
            : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground',
        )}
      >
        <CheckCheck className="size-3" strokeWidth={2.5} />
        全部已读
      </button>
    </div>
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
  const markAll = useMarkAllRead();
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border-soft px-3">
      <TabButton active={tab === 'all'} onClick={() => onChange('all')}>
        全部
      </TabButton>
      <TabButton active={tab === 'unread'} onClick={() => onChange('unread')}>
        未读
        {unread > 0 && (
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand-red px-1 text-2xs font-bold tabular-nums text-background">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </TabButton>
      <button
        type="button"
        onClick={() => markAll.mutate()}
        disabled={unread === 0 || markAll.isPending}
        className={cn(
          'ml-auto inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs transition-colors',
          unread === 0 || markAll.isPending
            ? 'cursor-not-allowed text-faint'
            : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground',
        )}
      >
        <CheckCheck className="size-3" strokeWidth={2.5} />
        全部已读
      </button>
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
        'relative inline-flex h-8 items-center px-3 text-xs font-bold transition-colors',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute bottom-px left-2 right-2 h-0.5 rounded-pill bg-brand-red"
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
    [tab],
  );
  const listQ = useNotificationList(filter);

  const items = useMemo<UserMessage[]>(() => {
    if (!listQ.data) return [];
    return listQ.data.pages.flatMap((p) => p.list);
  }, [listQ.data]);

  if (listQ.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="size-4 animate-spin text-faint" />
      </div>
    );
  }

  if (listQ.error) {
    return (
      <div className="flex flex-1 items-center justify-center py-12 text-xs text-brand-red">
        通知加载失败,请稍后再试
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
        <Inbox className="size-8 text-faint" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">
          {tab === 'unread' ? '没有未读通知' : '还没有通知'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
      <ul>
        {items.map((m) => (
          <NotificationItem key={m.id} item={m} onNavigate={onItemNavigate} />
        ))}
      </ul>
      {listQ.hasNextPage && (
        <div className="border-t border-border-soft px-3 py-2.5">
          <button
            type="button"
            onClick={() => listQ.fetchNextPage()}
            disabled={listQ.isFetchingNextPage}
            className="inline-flex h-7 w-full items-center justify-center rounded-sm text-xs text-muted-foreground transition-colors hover:bg-surface-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
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
        if (!isValidAppPath(item.link_url)) {
          toast.warning('该通知中的链接已失效', {
            description: `路径 ${item.link_url} 可能指向已下线或迁移的页面。`,
          });
          return;
        }
        navigate(item.link_url);
      } else {
        window.open(item.link_url, '_blank', 'noopener,noreferrer');
      }
      onNavigate();
    }
  };

  return (
    <li
      className={cn(
        'group relative flex flex-col gap-1 border-b border-border-soft px-3 py-3 transition-colors',
        !item.is_read && 'bg-danger-soft/40',
      )}
    >
      <button type="button" onClick={handleClick} className="w-full text-left">
        <div className="flex items-start gap-2">
          {!item.is_read && (
            <span
              aria-hidden
              className="mt-1.5 inline-block size-1.5 shrink-0 rounded-pill bg-brand-red"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-bold text-foreground">
              {item.title}
            </p>
            <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-subtle">
              {item.content}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-2xs text-faint">
              <span>{formatRelativeTime(item.created_at)}</span>
              {item.link_text && (
                <span className="font-bold text-brand-red">
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
        className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-foreground group-hover:opacity-100"
        aria-label="删除"
        title="删除"
      >
        ×
      </button>
    </li>
  );
}

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
  return d.toLocaleDateString('zh-CN');
}
