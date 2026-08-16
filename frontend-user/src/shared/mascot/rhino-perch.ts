/** In-page rhino perch (logo peek) — one nest the mascot can walk into. */

/** First-load run into the nest — a short dash, quicker than the edge dock. */
export const PERCH_RUN_PX_S = 540;
/** Last beat: slip behind the nest from below. */
export const PERCH_DIVE_PX_S = 380;
export const PERCH_PULL_OUT_PX = 14;

export type RhinoPos = { x: number; y: number };

type PerchTarget = {
  id: string;
  el: HTMLElement;
};

let target: PerchTarget | null = null;
let lastRect: DOMRect | null = null;

/** Dedicated hide state: mascot is in the in-page nest (not the screen edge). */
export function isRhinoNested(s: {
  hidden: boolean;
  hideKind: string;
}): boolean {
  return s.hidden && s.hideKind === 'perch';
}

/** Release the drag within this reach of the nest → run in and dock. */
export const PERCH_SNAP_SLACK_PX = 56;

/** Sprite center within the nest rect (padded by slack) counts as "near". */
export function isNearRhinoPerch(
  pos: RhinoPos,
  spritePx: number,
  rect: DOMRect,
  slack = PERCH_SNAP_SLACK_PX,
): boolean {
  const cx = pos.x + spritePx / 2;
  const cy = pos.y + spritePx / 2;
  return (
    cx >= rect.left - slack &&
    cx <= rect.right + slack &&
    cy >= rect.top - slack &&
    cy <= rect.bottom + slack
  );
}

export function registerRhinoPerch(id: string, el: HTMLElement): void {
  target = { id, el };
  lastRect = el.getBoundingClientRect();
}

export function unregisterRhinoPerch(id: string): void {
  if (target?.id !== id) return;
  if (target.el.isConnected) {
    lastRect = target.el.getBoundingClientRect();
  }
  target = null;
}

export function hasRhinoPerch(): boolean {
  return Boolean(target?.el.isConnected);
}

export function getRhinoPerchRect(): DOMRect | null {
  if (target?.el.isConnected) {
    lastRect = target.el.getBoundingClientRect();
    return lastRect;
  }
  return lastRect;
}

/** Live nest only — never a stale rect from a previous page. */
export function getLiveRhinoPerchRect(): DOMRect | null {
  if (!target?.el.isConnected || typeof window === 'undefined') return null;
  const rect = target.el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const onScreen =
    rect.right > 16 &&
    rect.left < vw - 16 &&
    rect.bottom > 16 &&
    rect.top < vh - 16;
  if (!onScreen) return null;
  lastRect = rect;
  return rect;
}

/**
 * Sit pose lives in the lower half of the 256 canvas (foot pad 46).
 * Lift so the body sits on the hex instead of hanging below it.
 * Smart-search handoff also uses a size-24 items-end well; this lift is extra.
 */
export const NEST_SIT_LIFT_PX = 22;

/** Sprite top-left so the floating mascot lands on the logo nest. */
export function perchDockPos(rect: DOMRect, spritePx: number): RhinoPos {
  return {
    x: rect.left + rect.width / 2 - spritePx / 2,
    y: rect.top + rect.height / 2 - spritePx / 2 - NEST_SIT_LIFT_PX,
  };
}

/** Stand just below the hole, still in front of the nest. */
export function perchApproachPos(rect: DOMRect, spritePx: number): RhinoPos {
  return {
    x: rect.left + rect.width / 2 - spritePx / 2,
    y: rect.bottom - spritePx * 0.2,
  };
}

/** Deeper into the hole from below — used after dropping behind the nest layer. */
export function perchDivePos(rect: DOMRect, spritePx: number): RhinoPos {
  return {
    x: rect.left + rect.width / 2 - spritePx / 2,
    y: rect.top + rect.height - spritePx * 0.92,
  };
}

/** Rest beside the nest after being pulled out. */
export function perchEmergeRest(
  rect: DOMRect,
  spritePx: number,
  margin: number,
): RhinoPos {
  if (typeof window === 'undefined') {
    return perchDockPos(rect, spritePx);
  }
  const maxX = Math.max(margin, window.innerWidth - spritePx - margin);
  const maxY = Math.max(margin, window.innerHeight - spritePx - margin);
  return {
    x: Math.min(maxX, Math.max(margin, rect.right + 12)),
    y: Math.min(maxY, Math.max(margin, rect.top + rect.height - spritePx * 0.55)),
  };
}

