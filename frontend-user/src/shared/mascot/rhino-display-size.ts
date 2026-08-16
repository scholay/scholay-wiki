/**
 * Rhino sprite display — assets are pre-normalized to 256×256
 * (content height ≈162, foot pad =46). No runtime bbox / per-clip scaling.
 *
 * Re-normalize new clips with:
 *   python scripts/normalize-rhino-sprites.py
 */

/** Source canvas edge (px) after normalize pipeline */
export const RHINO_CANVAS_PX = 256;

/** Collapsed floating mascot CSS edge (px) */
export const RHINO_DISPLAY_PX = 144;

/** Expanded panel — mascot parked outside dialog (px) */
export const RHINO_PANEL_SPRITE_PX = 112;
