import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';
import { cn } from '@/shared/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui/tooltip';

/** Idle frame used as the docked chip icon */
const DOCK_FRAME = '/mascot/rhino/pet-idle/frame_000.png';

/**
 * 牛犀犀收纳到顶栏后的入口 —— 点一下放出悬浮态。
 * 仅在 `hidden === true` 时渲染（由调用方或内部均可；内部自判更稳）。
 */
export function RhinoDockChip({ className }: { className?: string }) {
  const hidden = useRhinoAssistant((s) => s.hidden);
  const show = useRhinoAssistant((s) => s.show);

  if (!hidden) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`放出${RHINO_NAME}`}
          onClick={() => show()}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2',
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
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">放出{RHINO_NAME}</TooltipContent>
    </Tooltip>
  );
}
