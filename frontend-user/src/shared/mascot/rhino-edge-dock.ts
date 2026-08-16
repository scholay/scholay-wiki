/** Left/right edge dock geometry + persist for the hidden peek. */

export const RHINO_POS_KEY = 'scholay.rhino-assistant.pos';
export const RHINO_EDGE_Y_KEY = 'scholay.rhino-assistant.edge-y';
export const RHINO_EDGE_SIDE_KEY = 'scholay.rhino-assistant.edge-side';

export type RhinoEdgeSide = 'left' | 'right';

/** Standing peek display height (px). Width follows the 288×484 source. */
export const EDGE_HEIGHT_PX = 68;
export const EDGE_WIDTH_PX = Math.round((EDGE_HEIGHT_PX * 288) / 484);
/** Resting peek — most of the figure; only a thin strip tucks off-screen. */
export const EDGE_PEEK_PX = 32;
export const EDGE_HIT_PAD_X = 28;
export const EDGE_HIT_PAD_Y = 20;
export const EDGE_HIT_W = EDGE_WIDTH_PX + EDGE_HIT_PAD_X;
export const EDGE_HIT_H = EDGE_HEIGHT_PX + EDGE_HIT_PAD_Y * 2;

/** A short inward tug is enough — the standing art never leaves the edge. */
export const PULL_OUT_PX = 16;
/** Against a side clamp (within slack) → auto-dock on release. */
export const SNAP_EDGE_SLACK_PX = 16;
/** Dock run speed (px/s) — high enough to play the run clip, not a walk. */
export const DOCK_RUN_PX_S = 280;
/** Menu hide: dash into the top-right nav chip. */
export const NAV_HIDE_PX_S = 560;
/** Leave a gap from the clamp so emerge does not instantly re-dock. */
export const EMERGE_INSET_PX = 104;

export function clampEdgeTop(top: number, hitH = EDGE_HIT_H): number {
  if (typeof window === 'undefined') return top;
  const max = Math.max(8, window.innerHeight - hitH - 8);
  return Math.min(max, Math.max(8, top));
}

export function defaultEdgeTop(hitH = EDGE_HIT_H): number {
  if (typeof window === 'undefined') return 240;
  return clampEdgeTop(Math.round(window.innerHeight * 0.38), hitH);
}

export function loadEdgeTop(hitH = EDGE_HIT_H): number {
  try {
    const raw = localStorage.getItem(RHINO_EDGE_Y_KEY);
    if (raw == null) return defaultEdgeTop(hitH);
    const n = Number(raw);
    if (!Number.isFinite(n)) return defaultEdgeTop(hitH);
    return clampEdgeTop(n, hitH);
  } catch {
    return defaultEdgeTop(hitH);
  }
}

export function persistEdgeTop(top: number): void {
  try {
    localStorage.setItem(RHINO_EDGE_Y_KEY, String(Math.round(top)));
  } catch {
    /* ignore */
  }
}

export function loadEdgeSide(): RhinoEdgeSide {
  try {
    return localStorage.getItem(RHINO_EDGE_SIDE_KEY) === 'left'
      ? 'left'
      : 'right';
  } catch {
    return 'right';
  }
}

export function persistEdgeSide(side: RhinoEdgeSide): void {
  try {
    localStorage.setItem(RHINO_EDGE_SIDE_KEY, side);
  } catch {
    /* ignore */
  }
}

export function persistFloatingPos(pos: { x: number; y: number }): void {
  try {
    localStorage.setItem(RHINO_POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

export function edgeTopFromFloatingY(
  floatingY: number,
  spritePx: number,
  hitH = EDGE_HIT_H,
): number {
  return clampEdgeTop(floatingY + (spritePx - hitH) / 2, hitH);
}

export function floatingYFromEdgeTop(
  edgeTop: number,
  spritePx: number,
  hitH = EDGE_HIT_H,
): number {
  return edgeTop + (hitH - spritePx) / 2;
}

/** Resting float pos inside the viewport, aligned with the peek. */
export function restPosFromEdgeTop(
  edgeTop: number,
  spritePx: number,
  margin: number,
  side: RhinoEdgeSide = loadEdgeSide(),
): { x: number; y: number } {
  const y = floatingYFromEdgeTop(edgeTop, spritePx);
  if (typeof window === 'undefined') {
    return { x: side === 'left' ? margin : 24, y };
  }
  if (side === 'left') {
    return { x: margin + EMERGE_INSET_PX, y };
  }
  return {
    x: Math.max(
      margin,
      window.innerWidth - spritePx - margin - EMERGE_INSET_PX,
    ),
    y,
  };
}

export function nearestEdge(
  x: number,
  spritePx: number,
): RhinoEdgeSide {
  if (typeof window === 'undefined') return 'right';
  return x + spritePx / 2 < window.innerWidth / 2 ? 'left' : 'right';
}

export function isAgainstLeftEdge(x: number, margin: number): boolean {
  return x <= margin + SNAP_EDGE_SLACK_PX;
}

export function isAgainstRightEdge(
  x: number,
  spritePx: number,
  margin: number,
): boolean {
  if (typeof window === 'undefined') return false;
  const maxX = Math.max(margin, window.innerWidth - spritePx - margin);
  return x >= maxX - SNAP_EDGE_SLACK_PX;
}
