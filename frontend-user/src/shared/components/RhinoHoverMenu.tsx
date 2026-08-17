import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, Bell, CircleHelp, EyeOff, Headphones, LayoutGrid, MessageCircle } from 'lucide-react';
import { useUnreadCount } from '@/shared/api/notifications';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { cn } from '@/shared/lib/utils';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useAuthStatus } from '@/stores/auth.store';
import { usePendingAction } from '@/stores/pending-action.store';
import type { RhinoPanelMode } from '@/stores/rhino-assistant.store';
import {
  RHINO_FLOAT_CHROME_CLS,
  RhinoFloatPortal,
  type RhinoFloatSide,
} from './RhinoFloatPortal';
import { RhinoMenuAssets } from './RhinoMenuAssets';

/** Hover open with a short leave delay; coarse pointers keep the menu up. */
export function useRhinoHoverOpen(enabled: boolean) {
  const [hovered, setHovered] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const leaveTimer = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  return {
    open: enabled && (hovered || coarse),
    onEnter: () => {
      if (!enabled) return;
      window.clearTimeout(leaveTimer.current);
      setHovered(true);
    },
    onLeave: () => {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(() => setHovered(false), 220);
    },
  };
}

export function RhinoUnreadBadge({
  count,
  compact,
  className,
}: {
  count: number;
  compact?: boolean;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute z-10 inline-flex items-center justify-center',
        'rounded-pill bg-brand-red font-bold tabular-nums text-background shadow-sm',
        // Sprites keep ~19% empty pad around the character; pin to the cap, not the canvas corner.
        'right-[18%] top-[15%] translate-x-1/4 -translate-y-1/4',
        compact
          ? 'h-3.5 min-w-3.5 px-1 text-[9px] leading-none'
          : 'h-5 min-w-5 px-1.5 text-2xs leading-none',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

const ITEM_CLS = cn(
  'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2',
  'text-2xs font-semibold text-foreground transition-colors',
  'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
);

/**
 * Hover menu shared by the floating mascot and the in-page nest.
 * Always portals; flips to the opposite side when the preferred side
 * would overflow the viewport.
 */
export function RhinoHoverMenu({
  open,
  onSelect,
  onHide,
  portalAnchor,
  portalSide = 'top',
  onPointerEnter,
  onPointerLeave,
}: {
  open: boolean;
  onSelect: (mode: RhinoPanelMode) => void;
  /** 省略则不渲染「隐藏」项(如已收进导航条的 chip 菜单)。 */
  onHide?: () => void;
  portalAnchor?: RefObject<HTMLElement | null>;
  /** Portal 菜单相对锚点的方位;顶栏 chip 用 bottom,左右缘 peek 用 left/right。 */
  portalSide?: RhinoFloatSide;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { authenticated } = useAuthStatus();
  const openAuth = useAuthDialog((s) => s.openDialog);
  const unreadQ = useUnreadCount(authenticated);
  const unread = authenticated ? (unreadQ.data ?? 0) : 0;
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!open) setDraft('');
  }, [open]);

  const sendDraft = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    const to = `/claw?feature=claw&q=${encodeURIComponent(text)}`;
    setDraft('');
    if (!authenticated) {
      usePendingAction.getState().set({ type: 'navigate', to });
      openAuth('login');
      return;
    }
    navigate(to);
  }, [authenticated, draft, navigate, openAuth]);

  return (
    <RhinoFloatPortal
      open={open}
      portalAnchor={portalAnchor}
      portalSide={portalSide}
      fallbackSize={{ w: 200, h: 186 }}
    >
    <AnimatePresence>
      {open ? (
        <motion.div
          key="rhino-menu-row"
          role="menu"
          aria-label={`${RHINO_NAME}菜单`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          className={cn(
            'flex flex-col gap-0.5 whitespace-nowrap',
            RHINO_FLOAT_CHROME_CLS,
          )}
        >
          <RhinoMenuAssets />
          <div className="flex items-center justify-center gap-0.5">
            {(
              [
                { id: 'chat' as const, label: '闲聊', icon: MessageCircle },
                { id: 'features' as const, label: '功能', icon: LayoutGrid },
                { id: 'help' as const, label: '帮助', icon: CircleHelp },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(item.id);
                  }}
                  className={ITEM_CLS}
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={2} />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-0.5 border-t border-border/50 pt-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onSelect('feedback');
              }}
              className={ITEM_CLS}
            >
              <Headphones className="size-3.5 shrink-0" strokeWidth={2} />
              反馈
            </button>
            {authenticated ? (
              <button
                type="button"
                role="menuitem"
                aria-label={unread > 0 ? `通知，${unread} 条未读` : '通知'}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect('notifications');
                }}
                className={ITEM_CLS}
              >
                <span className="relative inline-flex shrink-0">
                  <Bell className="size-3.5 shrink-0" strokeWidth={2} />
                  {unread > 0 ? (
                    <span
                      aria-hidden
                      className="absolute -right-px -top-px size-2 rounded-pill bg-brand-red"
                    />
                  ) : null}
                </span>
                通知
              </button>
            ) : null}
            {onHide ? (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onHide();
                }}
                className={ITEM_CLS}
              >
                <EyeOff className="size-3.5 shrink-0" strokeWidth={2} />
                隐藏
              </button>
            ) : null}
          </div>
          <form
            className="flex w-full items-center gap-0.5 border-t border-border/50 p-0.5"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              sendDraft();
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="发给智能助手…"
              aria-label="发给智能助手"
              className={cn(
                'h-7 min-w-0 flex-1 rounded-8 bg-surface-1 px-2',
                'text-12 text-foreground outline-none placeholder:text-faint',
                'focus-visible:ring-2 focus-visible:ring-ring/30',
              )}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="发送到智能助手"
              className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-8',
                'text-foreground transition-colors hover:bg-muted',
                'disabled:pointer-events-none disabled:opacity-40',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              )}
            >
              <ArrowUp className="size-3.5" strokeWidth={2.5} />
            </button>
          </form>
        </motion.div>
      ) : null}
    </AnimatePresence>
    </RhinoFloatPortal>
  );
}
