/**
 * The camera (v0.3).
 *
 * The lair is a fixed 768×528 surface and every screen used to show all of it,
 * scaled to fit. On a 390px phone that is 49.5% — an 11.9px tile, a 7px thief,
 * and unit names rendered at under 4px. The layout work around it can only ever
 * move that letterbox about; the lair itself is width-bound and cannot grow.
 *
 * So on a narrow screen the view stops trying to show everything and shows a
 * window instead, kept on the crew. The trade is real and deliberate: a phone
 * player loses the overview and gains a game they can see. A desktop, where the
 * whole lair is already legible, keeps the whole lair.
 *
 * Everything here is pure arithmetic on numbers the caller supplies — no DOM,
 * no canvas, no clock — because both the renderer and the input layer have to
 * agree on it exactly, and a disagreement means taps land somewhere other than
 * where the player pointed.
 */
import { H, T, W } from './defs.js';

export interface View {
  /** world units → CSS pixels */
  k: number;
  /** world coordinate at the left edge of the canvas */
  ox: number;
  /** world coordinate at the top edge of the canvas */
  oy: number;
}

/** The whole lair, scaled to fit — what every screen used to get. */
export const wholeLair = (cssW: number, cssH: number): View => {
  const k = Math.min(cssW / W, cssH / H);
  return { k, ox: (W - cssW / k) / 2, oy: (H - cssH / k) / 2 };
};

/**
 * How much of the lair to show when following, in tiles across.
 *
 * 19 rather than 32: a tile lands near 20 CSS px on a 390px screen, which is
 * where the 8px in-world labels become readable and a tap target stops being
 * smaller than the tap slop. Wider and it is not worth the crop; narrower and
 * the player cannot see a guard coming.
 */
export const FOLLOW_TILES = 19;

/**
 * A window on the lair, centred on `fx, fy`, clamped so it never shows outside.
 *
 * Clamping rather than letting the edge scroll past is what keeps the lair
 * feeling like a place with walls: a camera that drifts into black at the edges
 * reads as a bug every single time.
 */
export function followView(cssW: number, cssH: number, fx: number, fy: number): View {
  // scale so FOLLOW_TILES fit across, but never show more than the lair has,
  // and never zoom out past fitting the whole thing
  const k = Math.max(cssW / W, cssH / H, cssW / (FOLLOW_TILES * T));
  const vw = cssW / k;
  const vh = cssH / k;
  const ox = vw >= W ? (W - vw) / 2 : Math.min(Math.max(fx - vw / 2, 0), W - vw);
  const oy = vh >= H ? (H - vh) / 2 : Math.min(Math.max(fy - vh / 2, 0), H - vh);
  return { k, ox, oy };
}

/**
 * Is this canvas big enough to read the whole lair at once?
 *
 * The question is about pixels per tile, not about phones: a small window on a
 * desktop deserves the same help, and a tablet held sideways does not need it.
 */
export const MIN_READABLE_TILE = 16;
export const needsFollowing = (cssW: number, cssH: number): boolean =>
  Math.min(cssW / W, cssH / H) * T < MIN_READABLE_TILE;

/** What the renderer and the input layer both ask for, from one place. */
export function viewFor(cssW: number, cssH: number, fx: number, fy: number): View {
  if (cssW <= 0 || cssH <= 0) return { k: 1, ox: 0, oy: 0 };
  return needsFollowing(cssW, cssH) ? followView(cssW, cssH, fx, fy) : wholeLair(cssW, cssH);
}

/** Where the camera wants to be: the middle of whoever is still alive. */
export function crewFocus(units: readonly { x: number; y: number }[]): { x: number; y: number } {
  if (!units.length) return { x: W / 2, y: H / 2 };
  let x = 0;
  let y = 0;
  for (const u of units) {
    x += u.x;
    y += u.y;
  }
  return { x: x / units.length, y: y / units.length };
}
