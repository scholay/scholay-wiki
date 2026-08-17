import { useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { IconButton } from '@/shared/components/IconButton';
import { NotificationInbox } from '@/shared/components/NotificationInbox';
import { useUnreadCount } from '@/shared/api/notifications';
import { cn } from '@/shared/lib/utils';

/**
 * 顶栏通知铃铛 + Popover 列表。
 * 列表本体见 [[NotificationInbox]]（小犀牛对话框复用）。
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unreadQ = useUnreadCount();
  const unread = unreadQ.data ?? 0;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <div className="relative inline-flex">
          <IconButton tooltip="通知" className="rounded-lg bg-surface-2">
            <Bell />
          </IconButton>
          {unread > 0 && (
            <span
              aria-label={`${unread} 条未读`}
              className={cn(
                'pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center',
                'rounded-pill bg-brand-red px-1 text-2xs font-bold tabular-nums text-background shadow-sm',
              )}
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
          className="z-50 flex max-h-[calc(100vh-120px)] w-[380px] flex-col rounded-md border border-border bg-background shadow-lg"
        >
          <NotificationInbox onItemNavigate={() => setOpen(false)} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
