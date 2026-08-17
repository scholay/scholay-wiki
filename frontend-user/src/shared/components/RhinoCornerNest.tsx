import { useMatch } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { RhinoLogoNest } from '@/shared/components/RhinoLogoNest';
import { RHINO_DISPLAY_PX } from '@/shared/mascot/rhino-display-size';
import {
  CORNER_PERCH_ID,
  PERCH_PRIORITY_CORNER,
  isRhinoNestedAt,
} from '@/shared/mascot/rhino-perch';
import { cn } from '@/shared/lib/utils';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';

/** Vacant corner pad — only hinted while the mascot is held / dragged. */
function RhinoCornerWell() {
  const dragActive = useRhinoAssistant((s) => s.dragActive);
  const reduce = !!useReducedMotion();

  if (!dragActive) return <span className="block size-full" aria-hidden />;

  return (
    <span className="relative block size-full" aria-hidden>
      <motion.span
        className="absolute inset-[16%] rounded-pill border-2 border-dashed border-brand-amber bg-brand-amber/20"
        animate={reduce ? { scale: 1 } : { scale: [1, 1.06, 1] }}
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
        }
      />
    </span>
  );
}

/**
 * Bottom-right 归位 nest for every page except homepage.
 * Homepage keeps only the marketing-card nest.
 */
export function RhinoCornerNest() {
  const isHome = !!useMatch({ path: '/', end: true });
  const hidden = useRhinoAssistant((s) => s.hidden);
  const hideKind = useRhinoAssistant((s) => s.hideKind);
  const nestedAtCorner = isRhinoNestedAt(CORNER_PERCH_ID, { hidden, hideKind });
  const dragActive = useRhinoAssistant((s) => s.dragActive);

  if (isHome) return null;

  return (
    <div
      className="pointer-events-none fixed z-[55] bottom-[max(3rem,calc(var(--safe-bottom,0px)+1.5rem))] right-12"
      aria-hidden={!nestedAtCorner && !dragActive}
    >
      <RhinoLogoNest
        playOnceKey={CORNER_PERCH_ID}
        priority={PERCH_PRIORITY_CORNER}
        faceLeft
        className={cn(
          nestedAtCorner ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        style={{ width: RHINO_DISPLAY_PX, height: RHINO_DISPLAY_PX }}
      >
        <RhinoCornerWell />
      </RhinoLogoNest>
    </div>
  );
}
