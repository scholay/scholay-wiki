import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { RHINO_CLIPS, rhinoFrameUrls } from '@/shared/mascot/rhino-clips';
import { RHINO_DISPLAY_PX } from '@/shared/mascot/rhino-display-size';
import { cn } from '@/shared/lib/utils';

/** 与悬浮牛犀犀同一套斜向跑,默认朝镜头右前方。 */
const RUN_CLIP = 'run-south-east' as const;
const RUN_URLS = rhinoFrameUrls(RUN_CLIP);
const RUN_FRAME_MS = 1000 / RHINO_CLIPS[RUN_CLIP].fps;
const SPOKE_ANGLES = [0, 30, 60, 90, 120, 150] as const;

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
 * 全站 loading:牛犀犀站在仓鼠轮下边内径上原地跑。
 * 轮盘外圈弧表示不确定进度,辐条随跑步转动。
 */
export function RhinoRunLoader({
  label = '正在加载',
  className,
}: {
  label?: string;
  className?: string;
}) {
  const frameSrc = useRhinoRunFrame();

  return (
    <div role="status" aria-label={label} className={cn('rhino-run-loader', className)}>
      <svg className="rhino-run-loader__wheel" viewBox="0 0 200 200" aria-hidden>
        <g className="rhino-run-loader__spokes animate-rhino-wheel-spin">
          {SPOKE_ANGLES.map((deg) => (
            <line
              key={deg}
              className="rhino-run-loader__spoke"
              x1="100"
              y1="32"
              x2="100"
              y2="168"
              transform={`rotate(${deg} 100 100)`}
            />
          ))}
          <circle className="rhino-run-loader__hub" cx="100" cy="100" r="10" />
          <circle className="rhino-run-loader__rim-inner" cx="100" cy="100" r="68" />
        </g>
        <circle
          className="rhino-run-loader__track"
          cx="100"
          cy="100"
          r="88"
          pathLength={100}
        />
        <circle
          className="rhino-run-loader__progress animate-rhino-wheel-progress"
          cx="100"
          cy="100"
          r="88"
          pathLength={100}
        />
      </svg>
      <img
        src={frameSrc}
        alt=""
        draggable={false}
        width={RHINO_DISPLAY_PX}
        height={RHINO_DISPLAY_PX}
        className="rhino-run-loader__sprite"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
