import { useRef } from 'react';
import { useUnreadCount } from '@/shared/api/notifications';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { persistEdgeSide } from '@/shared/mascot/rhino-edge-dock';
import { cn } from '@/shared/lib/utils';
import { useAuthStatus } from '@/stores/auth.store';
import {
  useRhinoAssistant,
  type RhinoPanelMode,
} from '@/stores/rhino-assistant.store';
import {
  RhinoHoverMenu,
  RhinoUnreadBadge,
  useRhinoHoverOpen,
} from './RhinoHoverMenu';

/** Idle frame used as the docked chip icon */
const DOCK_FRAME = '/mascot/rhino/pet-idle/frame_000.png';

/**
 * 牛犀犀「隐藏」后的落点 —— 右上角导航条 chip。
 * hover 出与浮点态同款的 hover 菜单(选模式=释放并直开该面板);
 * 点击 chip 本体 = 直接释放(从右缘跳回上次的悬浮位)。
 */
export function RhinoNavChip({ className }: { className?: string }) {
  const hidden = useRhinoAssistant((s) => s.hidden);
  const hideKind = useRhinoAssistant((s) => s.hideKind);
  const showFromEdge = useRhinoAssistant((s) => s.showFromEdge);
  const docked = hidden && hideKind === 'nav';
  const hover = useRhinoHoverOpen(docked);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { authenticated } = useAuthStatus();
  const unreadQ = useUnreadCount(authenticated);
  const unread = authenticated ? (unreadQ.data ?? 0) : 0;

  if (!docked) return null;

  const release = (panel?: RhinoPanelMode) => {
    // Chip lives top-right — emerge back in from the right edge.
    persistEdgeSide('right');
    showFromEdge(panel);
  };

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={hover.onEnter}
      onPointerLeave={hover.onLeave}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={`放出${RHINO_NAME}`}
        title={`放出${RHINO_NAME}`}
        onClick={() => release()}
        className={cn(
          'relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2',
          'transition-colors hover:bg-surface-3',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          className,
        )}
      >
        <img
          src={DOCK_FRAME}
          alt=""
          draggable={false}
          width={28}
          height={28}
          className="size-7 object-contain drop-shadow-sm"
        />
        <RhinoUnreadBadge count={hover.open ? 0 : unread} compact />
      </button>
      <RhinoHoverMenu
        open={hover.open}
        onSelect={(mode) => release(mode)}
        portalAnchor={btnRef}
        portalSide="bottom"
        onPointerEnter={hover.onEnter}
        onPointerLeave={hover.onLeave}
      />
    </span>
  );
}
