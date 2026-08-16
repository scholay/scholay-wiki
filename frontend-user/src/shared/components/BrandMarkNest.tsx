import {
  BrandLogo,
  brandLogoMarkSize,
  type BrandLogoProps,
} from '@/shared/components/BrandLogo';
import { RhinoLogoNest } from '@/shared/components/RhinoLogoNest';
import { isRhinoNested } from '@/shared/mascot/rhino-perch';
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
};

/**
 * Site lockup stays BrandLogo. Nest is an absolute overlay on the hex
 * and must not change gap, alignment, or wordmark position.
 */
export function BrandMarkNest({
  playOnceKey,
  size = 'xl',
  height,
  className,
  markOnly = false,
  well = false,
  wellClassName,
}: BrandMarkNestProps) {
  const occupied = useRhinoAssistant(isRhinoNested);
  const mark = brandLogoMarkSize(size, height);
  const logo = (
    <BrandLogo
      size={size}
      height={height}
      variant={markOnly ? 'mark' : 'full'}
      className={className}
      markClassName={occupied ? 'opacity-0' : undefined}
    />
  );

  const body = (
    <span className="relative inline-flex overflow-visible">
      {logo}
      {/* 空巢常驻(不再随 perchDismissed 卸载):拉出后不自动吸回,
          但巢仍注册在场,拖近松手才能吸附归位。 */}
      <span
        className="pointer-events-none absolute left-0 top-1/2 z-[61] -translate-y-1/2 overflow-visible"
        style={{ width: mark.width, height: mark.height }}
      >
        <RhinoLogoNest playOnceKey={playOnceKey} className="size-full">
          <span className="block size-full" />
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
