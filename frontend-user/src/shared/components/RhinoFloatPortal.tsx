import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/utils';

export type RhinoFloatSide = 'top' | 'bottom' | 'left' | 'right';

/** Shared chrome for the hover menu and proactive speech bubbles. */
export const RHINO_FLOAT_CHROME_CLS = cn(
  'rounded-xl border border-border/80 bg-background/95 p-0.5',
  'shadow-md backdrop-blur-sm',
);

const GAP = 8;
const VIEW_PAD = 8;
const FALLBACK = { w: 200, h: 120 };

function pickSide(
  preferred: RhinoFloatSide,
  space: Record<RhinoFloatSide, number>,
  needMain: number,
  needCross: number,
): RhinoFloatSide {
  if (preferred === 'top' || preferred === 'bottom') {
    const other = preferred === 'top' ? 'bottom' : 'top';
    if (space[preferred] >= needMain) return preferred;
    if (space[other] >= needMain) return other;
    return space[other] > space[preferred] ? other : preferred;
  }
  const other = preferred === 'left' ? 'right' : 'left';
  if (space[preferred] >= needCross) return preferred;
  if (space[other] >= needCross) return other;
  return space[other] > space[preferred] ? other : preferred;
}

/**
 * Viewport-aware portal next to a rhino (nest sprite or floating hitbox).
 * Flips to the opposite side when the preferred side would overflow.
 */
export function RhinoFloatPortal({
  open,
  portalAnchor,
  portalSide = 'top',
  fallbackSize = FALLBACK,
  anchorPoint,
  children,
}: {
  open: boolean;
  portalAnchor?: RefObject<HTMLElement | null>;
  portalSide?: RhinoFloatSide;
  fallbackSize?: { w: number; h: number };
  /** Place once at this viewport point (click / cursor). Does not track after that. */
  anchorPoint?: { x: number; y: number };
  children: ReactNode;
}) {
  const localAnchorRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [fixed, setFixed] = useState<{
    x: number;
    y: number;
    side: RhinoFloatSide;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setFixed(null);
      return;
    }
    let live = true;
    let tries = 0;

    const placeAt = (r: {
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    }) => {
      if (!live) return;
      const box = boxRef.current;
      const mw = box?.offsetWidth || fallbackSize.w;
      const mh = box?.offsetHeight || fallbackSize.h;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const space: Record<RhinoFloatSide, number> = {
        top: r.top - GAP,
        bottom: vh - r.bottom - GAP,
        left: r.left - GAP,
        right: vw - r.right - GAP,
      };
      const side = pickSide(portalSide, space, mh, mw);

      let x: number;
      let y: number;
      if (side === 'left') {
        x = r.left - GAP;
        y = r.top + r.height / 2;
      } else if (side === 'right') {
        x = r.right + GAP;
        y = r.top + r.height / 2;
      } else if (side === 'bottom') {
        x = r.left + r.width / 2;
        y = r.bottom + GAP;
      } else {
        x = r.left + r.width / 2;
        y = r.top - GAP;
      }

      if (side === 'top' || side === 'bottom') {
        const half = mw / 2;
        x = Math.min(vw - VIEW_PAD - half, Math.max(VIEW_PAD + half, x));
      } else {
        const half = mh / 2;
        y = Math.min(vh - VIEW_PAD - half, Math.max(VIEW_PAD + half, y));
      }
      setFixed({ x, y, side });
    };

    const place = () => {
      if (!live) return;
      if (anchorPoint) {
        placeAt({
          left: anchorPoint.x,
          right: anchorPoint.x,
          top: anchorPoint.y,
          bottom: anchorPoint.y,
          width: 0,
          height: 0,
        });
        return;
      }
      const el = portalAnchor?.current ?? localAnchorRef.current;
      if (!el) {
        if (tries < 12) {
          tries += 1;
          requestAnimationFrame(place);
        }
        return;
      }
      placeAt(el.getBoundingClientRect());
    };

    place();
    const raf = requestAnimationFrame(place);
    const box = boxRef.current;
    const ro = box ? new ResizeObserver(place) : null;
    if (box) ro?.observe(box);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [
    anchorPoint?.x,
    anchorPoint?.y,
    fallbackSize.h,
    fallbackSize.w,
    open,
    portalAnchor,
    portalSide,
  ]);

  const side = fixed?.side ?? portalSide;
  const portal =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <div
            className={cn(
              'pointer-events-none fixed z-[70] flex justify-center',
              (side === 'top' || side === 'bottom') && '-translate-x-1/2',
              side === 'top' && '-translate-y-full',
              (side === 'left' || side === 'right') && '-translate-y-1/2',
              side === 'left' && '-translate-x-full',
            )}
            style={
              fixed
                ? { left: fixed.x, top: fixed.y }
                : { left: 0, top: 0, visibility: 'hidden' }
            }
          >
            <div ref={boxRef} className="pointer-events-auto">
              {children}
            </div>
          </div>,
          document.body,
        );

  return (
    <>
      {portalAnchor ? null : (
        <span
          ref={localAnchorRef}
          className="pointer-events-none absolute inset-0"
          aria-hidden
        />
      )}
      {portal}
    </>
  );
}
