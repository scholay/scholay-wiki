import type { RhinoDir } from './rhino-direction';

/**
 * Sitting pose rotation ring — design assets RH-0071 … RH-0078 (one PNG per direction).
 * Catalog mapping (sitting-on-the-groun rotations):
 *   0071=north 0072=ne 0073=east 0074=se 0075=south 0076=sw 0077=west 0078=nw
 */
export const RH_SIT_ASSET_IDS = [
  'RH-0071',
  'RH-0072',
  'RH-0073',
  'RH-0074',
  'RH-0075',
  'RH-0076',
  'RH-0077',
  'RH-0078',
] as const;

/** Nest / sit-hold idle facing — RH-0077 (west). */
export const SIT_BASELINE_DIR: RhinoDir = 'west';

/** Teleport spin: RH-0075→76→77→78→71→72→73→74→75 */
export const SIT_ROTATE_DIRS: readonly RhinoDir[] = [
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
] as const;

/** Built from SIT_ROTATE_DIRS via scripts/build-sit-rotate-gif.py */
export const SIT_ROTATE_GIF = '/mascot/rhino/sit-rotate.gif';

export function sitClip(dir: RhinoDir): `sit-${RhinoDir}` {
  return `sit-${dir}`;
}

export function sitFrameUrl(dir: RhinoDir): string {
  return `/mascot/rhino/sit/${dir}.png`;
}

/** Frame URLs stepped in spin order (matches sit-rotate.gif). */
export const SIT_ROTATE_FRAME_URLS: readonly string[] = SIT_ROTATE_DIRS.map(
  (d) => sitFrameUrl(d),
);

/**
 * Pick spin frame for teleport progress.
 * One full 75→…→74→75 cycle per teleport; cycles can stack if TELEPORT_CYCLES > 1.
 */
export function sitRotateFrameAtProgress(
  progress: number,
  cycles = 1,
): string {
  const steps = SIT_ROTATE_DIRS.length - 1;
  const idx = Math.min(
    steps,
    Math.floor(Math.min(1, Math.max(0, progress)) * cycles * steps),
  );
  return sitFrameUrl(SIT_ROTATE_DIRS[idx] ?? SIT_BASELINE_DIR);
}

/** Nest on the right half → face inward (baseline west); left half → east. */
export function sitDirForNest(onRightHalf: boolean): RhinoDir {
  return onRightHalf ? SIT_BASELINE_DIR : 'east';
}
