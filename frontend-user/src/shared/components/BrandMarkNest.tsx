import {
  BrandLogo,
  brandLogoMarkSize,
  type BrandLogoProps,
} from '@/shared/components/BrandLogo';
import { RhinoLogoNest } from '@/shared/components/RhinoLogoNest';
import { RhinoSitOutline } from '@/shared/components/RhinoSitOutline';
import { RHINO_DISPLAY_PX } from '@/shared/mascot/rhino-display-size';
import { isRhinoNestedAt } from '@/shared/mascot/rhino-perch';
import { cn } from '@/shared/lib/utils';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';

type BrandMarkNestProps = {
  playOnceKey: string;
  size?: BrandLogoProps['size'];
  height?: number;
  className?: string;
  /** Hex only — used by compact nest wells, not the site lockup. */
  markOnly?: boolean;
  /** Optional pad around a mark-only well. Never wrap the hex+SCHOLAY lockup. */
  well?: boolean;
  wellClassName?: string;
  /** Keep the nest slot; do not paint the hex / lockup. */
  hideMark?: boolean;
  /** Do not show the dashed sit-outline, even while dragging. */
  hideOutline?: boolean;
};

/**
 * Page nest over the site lockup. Vacant chrome stays the logo (invisible nest).
 * Drag-near snap only — no auto-home. Outline appears while dragging.
 */
export function BrandMarkNest({
  playOnceKey,
  size = 'xl',
  height,
  className,
  markOnly = false,
  well = false,
  wellClassName,
  hideMark = false,
  hideOutline = false,
}: BrandMarkNestProps) {
  const occupied = useRhinoAssistant((s) => isRhinoNestedAt(playOnceKey, s));
  const dragActive = useRhinoAssistant((s) => s.dragActive);
  const mark = brandLogoMarkSize(size, height);

  const body = (
    <span className={cn('relative inline-flex overflow-visible', className)}>
      {hideMark ? (
        <span
          className="shrink-0"
          style={{ width: mark.width, height: mark.height }}
          aria-hidden
        />
      ) : (
        <BrandLogo
          size={size}
          height={height}
          variant={markOnly ? 'mark' : 'full'}
          markClassName={occupied ? 'opacity-0' : undefined}
        />
      )}
      <span
        className="pointer-events-none absolute left-0 top-1/2 z-[61] flex -translate-y-1/2 items-center justify-center overflow-visible"
        style={{ width: mark.width, height: mark.height }}
      >
        <RhinoLogoNest
          playOnceKey={playOnceKey}
          className="overflow-visible"
          style={{ width: RHINO_DISPLAY_PX, height: RHINO_DISPLAY_PX }}
        >
          {dragActive && !hideOutline ? (
            <RhinoSitOutline />
          ) : (
            <span className="block size-full" aria-hidden />
          )}
        </RhinoLogoNest>
      </span>
    </span>
  );

  if (well && markOnly) {
    return (
      <span
        className={cn(
          'relative inline-flex size-24 shrink-0 items-center justify-center overflow-visible',
          wellClassName,
        )}
      >
        {body}
      </span>
    );
  }

  return body;
}
