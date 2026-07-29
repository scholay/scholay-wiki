/** Screen-space 8-way facing (y grows downward). */

export const RHINO_DIRS = [
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
] as const;

export type RhinoDir = (typeof RHINO_DIRS)[number];

const DIR_SET = new Set<string>(RHINO_DIRS);

export function isRhinoDir(v: string): v is RhinoDir {
  return DIR_SET.has(v);
}

/** atan2(dy, dx) → dir. east=+x, south=+y. */
export function angleToDir(angleRad: number): RhinoDir {
  const tau = Math.PI * 2;
  const a = ((angleRad % tau) + tau) % tau;
  const sector = Math.round(a / (Math.PI / 4)) % 8;
  return RHINO_DIRS[sector];
}

export function dirToAngle(dir: RhinoDir): number {
  return (RHINO_DIRS.indexOf(dir) * Math.PI) / 4;
}

function angleDelta(a: number, b: number): number {
  const tau = Math.PI * 2;
  let d = ((a - b) % tau) + tau;
  d %= tau;
  if (d > Math.PI) d -= tau;
  return Math.abs(d);
}

/**
 * Sticky 8-way facing.
 * 旧实现要求偏离当前朝向中心 ≥30°,导致「正西→西北」要拖得很斜才切,
 * 左/左上体感会粘在 west。改为:仍在本扇区(+少量防抖)则保持,越界即切。
 */
export function resolveFacingDir(
  current: RhinoDir,
  vx: number,
  vy: number,
  opts?: { minSpeed?: number; /** 越出扇区后再多要求的防抖角,默认 3° */ hysteresisDeg?: number },
): RhinoDir {
  const minSpeed = opts?.minSpeed ?? 40;
  const hysteresisRad = ((opts?.hysteresisDeg ?? 3) * Math.PI) / 180;
  const speed = Math.hypot(vx, vy);
  if (speed < minSpeed) return current;
  const angle = Math.atan2(vy, vx);
  const candidate = angleToDir(angle);
  if (candidate === current) return current;
  // 每扇区半宽 22.5°;越出半宽+防抖才换向
  const leaveAt = Math.PI / 8 + hysteresisRad;
  if (angleDelta(angle, dirToAngle(current)) < leaveAt) return current;
  return candidate;
}

/** EMA + hysteresis gait from screen speed (px/s). */
export type RhinoGait = 'idle' | 'walk' | 'run';

export interface GaitThresholds {
  walkEnter: number;
  walkExit: number;
  runEnter: number;
  runExit: number;
}

/** 屏幕 px/s。跑阈值略抬:寻常拖多为走,再快一点才进跑。 */
export const DEFAULT_GAIT_THRESHOLDS: GaitThresholds = {
  walkEnter: 50,
  walkExit: 26,
  runEnter: 145,
  runExit: 100,
};

export function resolveGait(
  current: RhinoGait,
  speedPxS: number,
  t: GaitThresholds = DEFAULT_GAIT_THRESHOLDS,
): RhinoGait {
  if (current === 'run') {
    if (speedPxS < t.walkExit) return 'idle';
    if (speedPxS < t.runExit) return 'walk';
    return 'run';
  }
  if (current === 'walk') {
    if (speedPxS >= t.runEnter) return 'run';
    if (speedPxS < t.walkExit) return 'idle';
    return 'walk';
  }
  // idle
  if (speedPxS >= t.runEnter) return 'run';
  if (speedPxS >= t.walkEnter) return 'walk';
  return 'idle';
}

/** Short-window velocity from recent pointer samples. */
export function velocityFromSamples(
  samples: ReadonlyArray<{ t: number; x: number; y: number }>,
  windowMs = 90,
): { vx: number; vy: number; speed: number; peak: number } {
  if (samples.length < 2) return { vx: 0, vy: 0, speed: 0, peak: 0 };
  const latest = samples[samples.length - 1];
  const t0 = latest.t - windowMs;
  let oldest = samples[0];
  let oldestIdx = 0;
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    oldest = samples[i];
    oldestIdx = i;
    if (samples[i].t <= t0) break;
  }
  const dt = Math.max(1, latest.t - oldest.t) / 1000;
  const vx = (latest.x - oldest.x) / dt;
  const vy = (latest.y - oldest.y) / dt;
  // 相邻样本峰值 —— 甩动瞬间不被整窗平均抹平
  let peak = 0;
  for (let i = Math.max(1, oldestIdx + 1); i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const dti = Math.max(1, b.t - a.t) / 1000;
    peak = Math.max(peak, Math.hypot(b.x - a.x, b.y - a.y) / dti);
  }
  return { vx, vy, speed: Math.hypot(vx, vy), peak };
}
