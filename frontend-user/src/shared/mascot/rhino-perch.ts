/** In-page rhino perch — page title nests, else an invisible corner fallback. */

import { useRhinoAssistant } from '@/stores/rhino-assistant.store';

/** First-load run into the nest — a short dash, quicker than the edge dock. */
export const PERCH_RUN_PX_S = 540;
/** Last beat: slip behind the nest from below. */
export const PERCH_DIVE_PX_S = 380;
export const PERCH_PULL_OUT_PX = 14;

/** Homepage card enter — dive in slowly, dash right, fold back to sit. */
export const HOME_CARD_ENTER_PX_S = 150;
export const HOME_CARD_SLIDE_PX_S = 360;
export const HOME_CARD_DOCK_PX_S = 160;
export const HOME_CARD_SEGMENT_MIN_MS = 280;

/** Global fallback nest in AppShell (bottom-right). */
export const CORNER_PERCH_ID = 'scholay.corner-nest';

/** Homepage marketing-card nest — cinematic under-card enter. */
export const HOME_CARD_PERCH_ID = 'scholay.home-claw-card-nest';

/** Marks the home card so the enter path can read its box. */
export const HOME_CARD_TUNNEL_ATTR = 'data-rhino-home-card';

export const PERCH_PRIORITY_PAGE = 10;
export const PERCH_PRIORITY_CORNER = 1;

export type RhinoPos = { x: number; y: number };

type PerchEntry = {
  id: string;
  el: HTMLElement;
  priority: number;
};

const targets = new Map<string, PerchEntry>();
const lastRects = new Map<string, DOMRect>();
const perchListeners = new Set<() => void>();

function notifyPerchListeners() {
  for (const fn of perchListeners) fn();
}

export function subscribeActivePerch(listener: () => void): () => void {
  perchListeners.add(listener);
  return () => {
    perchListeners.delete(listener);
  };
}

function isConnectedEntry(entry: PerchEntry): boolean {
  return entry.el.isConnected;
}

function sortedConnectedTargets(): PerchEntry[] {
  return [...targets.values()]
    .filter(isConnectedEntry)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

/** Highest-priority connected nest wins. */
export function getActivePerchId(): string | null {
  return sortedConnectedTargets()[0]?.id ?? null;
}

export function getPerchPriority(id: string): number {
  return targets.get(id)?.priority ?? PERCH_PRIORITY_PAGE;
}

export function hasPageRhinoPerch(): boolean {
  return sortedConnectedTargets().some((t) => t.priority >= PERCH_PRIORITY_PAGE);
}

export function hasRhinoPerch(): boolean {
  return sortedConnectedTargets().length > 0;
}

/** Dedicated hide state: mascot is in a nest (not the screen edge). */
export function isRhinoNested(s: {
  hidden: boolean;
  hideKind: string;
}): boolean {
  return s.hidden && s.hideKind === 'perch';
}

export function isRhinoNestedAt(
  id: string,
  s: { hidden: boolean; hideKind: string },
): boolean {
  return isRhinoNested(s) && getActivePerchId() === id;
}

/**
 * Title nests stay snap-only. Homepage card nest plays the under-card enter.
 * Corner 归位 may auto-home until the user leaves.
 */
export function shouldAutoDockToPerch(perchDismissed: boolean): boolean {
  if (perchDismissed) return false;
  if (hasPageRhinoPerch()) {
    return getActivePerchId() === HOME_CARD_PERCH_ID;
  }
  return hasRhinoPerch();
}

export function getHomeCardRect(): DOMRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(`[${HOME_CARD_TUNNEL_ATTR}]`);
  if (!(el instanceof HTMLElement) || !el.isConnected) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  return rect;
}

/** Homepage spawn: stand just above the card, then run in. */
export function homeCardStartPos(card: DOMRect, spritePx: number): RhinoPos {
  return {
    x: card.left + card.width / 2 - spritePx / 2,
    y: card.top - spritePx * 0.42,
  };
}

/**
 * Home enter from wherever the mascot is:
 * dive into the card at the current x → run right → fold back to the nest.
 */
export function homeCardEnterWaypoints(
  card: DOMRect,
  nest: DOMRect,
  spritePx: number,
  from: RhinoPos,
): {
  under: RhinoPos;
  emerge: RhinoPos;
  dock: RhinoPos;
} {
  const minX = card.left + 8;
  const maxX = Math.max(minX, card.right - spritePx - 8);
  const underX = Math.min(maxX, Math.max(minX, from.x));
  const underY = card.top + card.height * 0.42 - spritePx / 2;
  const emergeY = nest.top + nest.height * 0.32 - spritePx / 2;
  return {
    under: { x: underX, y: underY },
    emerge: {
      x: card.right - spritePx * 0.18,
      y: emergeY,
    },
    dock: perchDockPos(nest, spritePx),
  };
}

export type HomeEnterClip = 'none' | 'bottom' | 'right' | 'inside';

/** Front sprite: below-card remainder, or only the part inside the card. */
export function homeCardFrontClip(
  clip: Exclude<HomeEnterClip, 'none'>,
  card: DOMRect,
  pos: RhinoPos,
  spritePx: number,
): string {
  // Fold-back: only the part already inside the card (normal color).
  if (clip === 'inside') {
    return homeCardGhostClip(card, pos, spritePx) ?? 'inset(100%)';
  }
  // Bursting out the right: never show the mascot outside the card.
  if (clip === 'right') {
    return 'inset(100%)';
  }
  const cut = card.bottom - pos.y;
  if (cut <= 0) return 'none';
  if (cut >= spritePx) return 'inset(100% 0 0 0)';
  return `inset(${cut}px 0 0 0)`;
}

/** Ghost sprite: only the part overlapping the card (seen through the fill). */
export function homeCardGhostClip(
  card: DOMRect,
  pos: RhinoPos,
  spritePx: number,
): string | null {
  const top = Math.max(0, card.top - pos.y);
  const right = Math.max(0, pos.x + spritePx - card.right);
  const bottom = Math.max(0, pos.y + spritePx - card.bottom);
  const left = Math.max(0, card.left - pos.x);
  if (top >= spritePx || left >= spritePx || right >= spritePx || bottom >= spritePx) {
    return null;
  }
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 16px)`;
}

/**
 * Front sprite while dragging: keep only the part still outside the card.
 * The overlapping hole is punched out so the gray ghost can sit there.
 */
export function homeCardOutsideClip(
  card: DOMRect,
  pos: RhinoPos,
  spritePx: number,
): string | undefined {
  const t = Math.max(0, card.top - pos.y);
  const r = Math.max(0, pos.x + spritePx - card.right);
  const b = Math.max(0, pos.y + spritePx - card.bottom);
  const l = Math.max(0, card.left - pos.x);
  if (t >= spritePx || l >= spritePx || r >= spritePx || b >= spritePx) {
    return undefined;
  }
  if (t <= 0 && l <= 0 && r <= 0 && b <= 0) {
    return 'inset(100%)';
  }
  const x1 = l;
  const y1 = t;
  const x2 = spritePx - r;
  const y2 = spritePx - b;
  return `polygon(evenodd, 0px 0px, ${spritePx}px 0px, ${spritePx}px ${spritePx}px, 0px ${spritePx}px, 0px 0px, ${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px)`;
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

export function syncRhinoPerchPresent() {
  useRhinoAssistant.getState().setPerchPresent(hasRhinoPerch());
}

export function registerRhinoPerch(
  id: string,
  el: HTMLElement,
  priority = PERCH_PRIORITY_PAGE,
): void {
  targets.set(id, { id, el, priority });
  lastRects.set(id, el.getBoundingClientRect());
  syncRhinoPerchPresent();
  notifyPerchListeners();
}

export function unregisterRhinoPerch(id: string): void {
  const entry = targets.get(id);
  if (!entry) return;
  if (entry.el.isConnected) {
    lastRects.set(id, entry.el.getBoundingClientRect());
  }
  targets.delete(id);
  syncRhinoPerchPresent();
  notifyPerchListeners();
}

function rectForEntry(entry: PerchEntry): DOMRect | null {
  if (!entry.el.isConnected || typeof window === 'undefined') return null;
  const rect = entry.el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const onScreen =
    rect.right > 16 &&
    rect.left < vw - 16 &&
    rect.bottom > 16 &&
    rect.top < vh - 16;
  if (!onScreen) return null;
  lastRects.set(entry.id, rect);
  return rect;
}

export function getRhinoPerchRect(id?: string | null): DOMRect | null {
  const targetId = id ?? getActivePerchId();
  if (!targetId) return null;
  const entry = targets.get(targetId);
  if (entry?.el.isConnected) {
    return rectForEntry(entry) ?? lastRects.get(targetId) ?? null;
  }
  return lastRects.get(targetId) ?? null;
}

/** Live nest for drag-near snap. Page and corner nests both accept a drop. */
export function getLiveRhinoPerchRect(_opts?: {
  perchDismissed?: boolean;
}): DOMRect | null {
  const active = sortedConnectedTargets()[0];
  if (!active) return null;
  return rectForEntry(active);
}

/**
 * Sit pose lives in the lower half of the 256 canvas (foot pad 46).
 * Lift so the body sits on the hex instead of hanging below it.
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
