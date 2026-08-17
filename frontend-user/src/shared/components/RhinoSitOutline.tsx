import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RHINO_CANVAS_PX, RHINO_DISPLAY_PX } from '@/shared/mascot/rhino-display-size';
import {
  SIT_OUTLINE_SRC,
  sitOutlinePath,
} from '@/shared/mascot/rhino-sit-outline';
import { cn } from '@/shared/lib/utils';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';

/**
 * Vacant nest mark — dashed sit-hold silhouette.
 * While the mascot is dragged, the snap area tints and breathes.
 */
export function RhinoSitOutline({
  faceLeft,
  className,
}: {
  faceLeft?: boolean;
  className?: string;
}) {
  const [d, setD] = useState('');
  const dragActive = useRhinoAssistant((s) => s.dragActive);
  const reduce = !!useReducedMotion();

  useEffect(() => {
    let live = true;
    void sitOutlinePath(SIT_OUTLINE_SRC).then((path) => {
      if (live) setD(path);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${RHINO_CANVAS_PX} ${RHINO_CANVAS_PX}`}
      width={RHINO_DISPLAY_PX}
      height={RHINO_DISPLAY_PX}
      fill="none"
      aria-hidden
      className={cn(
        'pointer-events-none origin-center',
        dragActive ? 'text-brand-amber' : 'text-faint',
        className,
      )}
      animate={
        dragActive && !reduce
          ? {
              scaleX: faceLeft ? [-1, -1.05, -1] : [1, 1.05, 1],
              scaleY: [1, 1.05, 1],
            }
          : { scaleX: faceLeft ? -1 : 1, scaleY: 1 }
      }
      transition={
        dragActive && !reduce
          ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {d ? (
        <>
          <path
            d={d}
            fill="currentColor"
            className={dragActive ? 'opacity-20' : 'opacity-0'}
          />
          <path
            d={d}
            stroke="currentColor"
            strokeWidth={dragActive ? 2.8 : 2.2}
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
    </motion.svg>
  );
}
