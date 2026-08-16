import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { RHINO_CLIPS, rhinoFrameUrls } from '@/shared/mascot/rhino-clips';
import { cn } from '@/shared/lib/utils';

const RUN_URLS = rhinoFrameUrls('pet-run');
const RUN_FRAME_MS = 1000 / RHINO_CLIPS['pet-run'].fps;

function useRhinoRunFrame() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % RUN_URLS.length);
    }, RUN_FRAME_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  return RUN_URLS[index] ?? RUN_URLS[0];
}

/**
 * Full-site loading animation — colorful pet-run clip + orbit arc.
 * Frames come from `/mascot/rhino/pet-run`, same sequence as the floating rhino.
 */
export function RhinoRunLoader({
  size = 'default',
  label = '正在加载',
  className,
}: {
  size?: 'compact' | 'default' | 'full';
  label?: string;
  className?: string;
}) {
  const frameSrc = useRhinoRunFrame();

  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        'rhino-run-loader text-foreground',
        size === 'compact' && 'rhino-run-loader--compact',
        size === 'full' && 'rhino-run-loader--full',
        className,
      )}
    >
      <svg className="rhino-run-loader__orbit" viewBox="0 0 200 200" aria-hidden>
        <circle
          className="rhino-run-loader__orbit-track"
          cx="100"
          cy="100"
          r="94"
          pathLength={100}
        />
        <circle
          className="rhino-run-loader__orbit-arc animate-rhino-orbit"
          cx="100"
          cy="100"
          r="94"
          pathLength={100}
        />
      </svg>
      <div className="rhino-run-loader__runner" aria-hidden>
        <img
          src={frameSrc}
          alt=""
          draggable={false}
          className="rhino-run-loader__sprite"
        />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
