import { RHINO_DIRS, type RhinoDir } from './rhino-direction';

/** Scholay rhino clips — frames under /public/mascot/rhino/ */

/** run-se-v3 只有四斜向 */
export const RUN_DIRS = [
  'north-east',
  'north-west',
  'south-east',
  'south-west',
] as const;

export type RhinoRunDir = (typeof RUN_DIRS)[number];

export type RhinoClipId =
  | 'pet-idle'
  | 'pet-wave'
  | 'pet-jump'
  | 'pet-wait'
  | 'pet-sigh'
  | 'pet-run'
  | 'sleep-e'
  | 'confused-s'
  | 'nod-s'
  | 'back-review'
  | 'typing'
  | 'wave-s'
  | 'idle-s'
  | 'sit-to-stand-s'
  | 'lie-to-sit-s'
  | 'sit-hold'
  | `loco-${RhinoDir}`
  | `run-${RhinoRunDir}`
  | `idle-${RhinoDir}`
  | `face-${RhinoDir}`;

export interface RhinoClipMeta {
  count: number;
  fps: number;
  loop: boolean;
  /** Directory under /mascot/rhino/ for frame_XXX.png sequences */
  dir?: string;
  /** Explicit file list (static face stills / hold poses) */
  files?: string[];
}

/**
 * 站立待机池(循环)——失焦 / 每 30s 随机。
 * sleep-e 留给躺姿,不进站立池。
 */
export const IDLE_LOOP_CLIPS: readonly RhinoClipId[] = [
  'pet-idle',
  'pet-wait',
  'idle-s',
  'idle-east',
  'idle-south-east',
  'confused-s',
  'back-review',
  'typing',
] as const;

/** 一次性待机表情:播完后回落到随机循环 idle */
export const IDLE_ONCE_CLIPS: readonly RhinoClipId[] = [
  'pet-sigh',
  'pet-wave',
  'nod-s',
  'wave-s',
] as const;

/** 站立时可随机的待机态 */
export const IDLE_AMBIENCE_CLIPS: readonly RhinoClipId[] = [
  ...IDLE_LOOP_CLIPS,
  ...IDLE_ONCE_CLIPS,
] as const;

const IDLE_DIRS: RhinoDir[] = ['east', 'south', 'south-east'];

function buildClips(): Record<RhinoClipId, RhinoClipMeta> {
  const clips = {
    'pet-idle': { count: 7, fps: 7, loop: true, dir: 'pet-idle' },
    'pet-wave': { count: 5, fps: 10, loop: false, dir: 'pet-wave' },
    'pet-jump': { count: 7, fps: 11, loop: false, dir: 'pet-jump' },
    'pet-wait': { count: 7, fps: 8, loop: true, dir: 'pet-wait' },
    'pet-sigh': { count: 9, fps: 8, loop: false, dir: 'pet-sigh' },
    'pet-run': { count: 9, fps: 12, loop: true, dir: 'pet-run' },
    'sleep-e': { count: 7, fps: 6, loop: true, dir: 'sleep-e' },
    'confused-s': { count: 7, fps: 9, loop: true, dir: 'confused-s' },
    'nod-s': { count: 7, fps: 10, loop: false, dir: 'nod-s' },
    'back-review': { count: 7, fps: 9, loop: true, dir: 'back-review' },
    typing: { count: 7, fps: 12, loop: true, dir: 'typing' },
    'wave-s': { count: 7, fps: 10, loop: false, dir: 'wave-s' },
    'idle-s': { count: 7, fps: 8, loop: true, dir: 'idle-s' },
    // frame0=坐, frame8=站; 倒放 = 站→坐
    'sit-to-stand-s': {
      count: 9,
      fps: 10,
      loop: false,
      dir: 'sit-to-stand-s',
    },
    // frame0=躺, frame8=坐; 倒放 = 坐→躺
    'lie-to-sit-s': {
      count: 9,
      fps: 10,
      loop: false,
      dir: 'lie-to-sit-s',
    },
    // 坐姿定格(sit-to-stand 首帧)
    'sit-hold': {
      count: 1,
      fps: 1,
      loop: true,
      files: ['/mascot/rhino/sit-to-stand-s/frame_000.png'],
    },
  } as Record<RhinoClipId, RhinoClipMeta>;

  for (const d of RHINO_DIRS) {
    clips[`loco-${d}`] = {
      count: 9,
      fps: 8,
      loop: true,
      dir: `loco/${d}`,
    };
    clips[`face-${d}`] = {
      count: 1,
      fps: 1,
      loop: true,
      files: [`/mascot/rhino/face/${d}.png`],
    };
  }
  for (const d of RUN_DIRS) {
    clips[`run-${d}`] = {
      count: 9,
      fps: 14,
      loop: true,
      dir: `run/${d}`,
    };
  }
  for (const d of IDLE_DIRS) {
    clips[`idle-${d}`] = {
      count: 7,
      fps: 7,
      loop: true,
      dir: `idle/${d}`,
    };
  }
  return clips;
}

export const RHINO_CLIPS = buildClips();

export function hasDirectionalIdle(dir: RhinoDir): boolean {
  return IDLE_DIRS.includes(dir);
}

export function locoClip(dir: RhinoDir): RhinoClipId {
  return `loco-${dir}`;
}

/**
 * 跑只有 NE/NW/SE/SW。正东/西/南/北按速度分量靠到最近斜向,
 * 避免 180° 镜像硬翻。
 */
export function toRunDir(dir: RhinoDir, vx: number, vy: number): RhinoRunDir {
  switch (dir) {
    case 'north-east':
    case 'north-west':
    case 'south-east':
    case 'south-west':
      return dir;
    case 'east':
      return vy >= 0 ? 'south-east' : 'north-east';
    case 'west':
      return vy >= 0 ? 'south-west' : 'north-west';
    case 'south':
      return vx >= 0 ? 'south-east' : 'south-west';
    case 'north':
      return vx >= 0 ? 'north-east' : 'north-west';
    default:
      return 'south-east';
  }
}

export function runClip(dir: RhinoDir, vx: number, vy: number): RhinoClipId {
  return `run-${toRunDir(dir, vx, vy)}`;
}

export function restClip(dir: RhinoDir): RhinoClipId {
  return hasDirectionalIdle(dir) ? `idle-${dir}` : `face-${dir}`;
}

export function isIdleOnceClip(id: RhinoClipId): boolean {
  return (IDLE_ONCE_CLIPS as readonly string[]).includes(id);
}

export function isIdleLoopClip(id: RhinoClipId): boolean {
  return (IDLE_LOOP_CLIPS as readonly string[]).includes(id);
}

/** 随机挑一个待机态;尽量避开当前 */
export function pickRandomIdle(avoid?: RhinoClipId | null): RhinoClipId {
  const pool =
    avoid && IDLE_AMBIENCE_CLIPS.length > 1
      ? IDLE_AMBIENCE_CLIPS.filter((c) => c !== avoid)
      : IDLE_AMBIENCE_CLIPS;
  return pool[Math.floor(Math.random() * pool.length)] ?? 'pet-idle';
}

export function pickRandomIdleLoop(avoid?: RhinoClipId | null): RhinoClipId {
  const pool =
    avoid && IDLE_LOOP_CLIPS.length > 1
      ? IDLE_LOOP_CLIPS.filter((c) => c !== avoid)
      : IDLE_LOOP_CLIPS;
  return pool[Math.floor(Math.random() * pool.length)] ?? 'pet-idle';
}

export function rhinoFrameUrls(clipId: RhinoClipId): string[] {
  const clip = RHINO_CLIPS[clipId];
  if (!clip) throw new Error(`Unknown clip: ${clipId}`);
  if (clip.files) return [...clip.files];
  const dir = clip.dir ?? clipId;
  return Array.from({ length: clip.count }, (_, i) => {
    const name = `frame_${String(i).padStart(3, '0')}.png`;
    return `/mascot/rhino/${dir}/${name}`;
  });
}

/** 走:固定帧速;跑:仍随速度略加快。 */
export function locoFps(gait: 'walk' | 'run', speedPxS: number): number {
  if (gait === 'walk') return 7;
  return Math.min(18, Math.max(12, 12 + (speedPxS - 145) / 100));
}
