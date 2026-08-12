/**
 * The camera.
 *
 * Two things have to agree on it exactly: the renderer, which draws the frame,
 * and the input layer, which maps a tap back to a tile. A disagreement of a few
 * pixels is a game that quietly ignores where you pointed — so the round trip
 * is pinned here rather than left to two call sites staying in step.
 */
import { describe, expect, it } from 'vitest';
import {
  FOLLOW_TILES,
  H,
  MIN_READABLE_TILE,
  T,
  W,
  crewFocus,
  followView,
  needsFollowing,
  viewFor,
  wholeLair,
  type View,
} from '../src/headless.js';

/** screen → world, exactly as `input.ts` does it. */
const toWorld = (v: View, sx: number, sy: number): [number, number] => [v.ox + sx / v.k, v.oy + sy / v.k];
/** world → screen, exactly as the renderer's transform does it. */
const toScreen = (v: View, wx: number, wy: number): [number, number] => [(wx - v.ox) * v.k, (wy - v.oy) * v.k];

describe('a screen big enough for the whole lair', () => {
  it('shows all of it, as it always did', () => {
    const v = viewFor(1024, 704, 100, 100);
    expect(v.ox).toBe(0);
    expect(v.oy).toBe(0);
    expect(v.k).toBeCloseTo(1024 / W, 6);
  });

  it('letterboxes rather than stretching, whichever way the box is wrong', () => {
    for (const [cw, ch] of [
      [1200, 704],
      [1024, 900],
    ]) {
      const v = wholeLair(cw, ch);
      // the whole lair is inside the visible window on both axes
      expect(v.ox).toBeLessThanOrEqual(0.001);
      expect(v.oy).toBeLessThanOrEqual(0.001);
      expect(v.ox + cw / v.k).toBeGreaterThanOrEqual(W - 0.001);
      expect(v.oy + ch / v.k).toBeGreaterThanOrEqual(H - 0.001);
    }
  });

  it('does not follow anybody — the overview is the point', () => {
    const a = viewFor(1024, 704, 0, 0);
    const b = viewFor(1024, 704, W, H);
    expect(b).toEqual(a);
  });
});

describe('a screen too small to read', () => {
  it('is decided on pixels per tile, not on being a phone', () => {
    // a 390px-wide phone: 11.9px tiles
    expect(needsFollowing(382, 336)).toBe(true);
    // a desktop window: 30px tiles
    expect(needsFollowing(954, 775)).toBe(false);
    // the threshold itself
    expect(needsFollowing((MIN_READABLE_TILE / T) * W + 1, H * 4)).toBe(false);
  });

  it('zooms until a tile is worth looking at', () => {
    const v = viewFor(382, 336, 300, 300);
    expect(v.k * T).toBeGreaterThan(MIN_READABLE_TILE);
    expect(v.k * T).toBeCloseTo(382 / FOLLOW_TILES, 1);
  });

  it('keeps the crew in the middle of it', () => {
    const v = followView(382, 336, 400, 300);
    const [sx, sy] = toScreen(v, 400, 300);
    expect(sx).toBeCloseTo(382 / 2, 1);
    expect(sy).toBeCloseTo(336 / 2, 1);
  });

  it('never shows the void outside the lair', () => {
    // walk the focus into every corner and past it
    for (const [fx, fy] of [
      [-500, -500],
      [0, 0],
      [W, H],
      [W + 900, H + 900],
      [W / 2, H / 2],
    ]) {
      const v = followView(382, 336, fx, fy);
      expect(v.ox).toBeGreaterThanOrEqual(-0.001);
      expect(v.oy).toBeGreaterThanOrEqual(-0.001);
      expect(v.ox + 382 / v.k).toBeLessThanOrEqual(W + 0.001);
      expect(v.oy + 336 / v.k).toBeLessThanOrEqual(H + 0.001);
    }
  });

  it('falls back to fitting rather than cropping when an axis cannot take it', () => {
    // a box far wider than the lair's aspect: following would crop vertically,
    // so the scale has to come up to cover instead of showing nothing
    const v = followView(2000, 200, W / 2, H / 2);
    expect(v.oy).toBeGreaterThanOrEqual(-0.001);
    expect(v.oy + 200 / v.k).toBeLessThanOrEqual(H + 0.001);
  });
});

describe('what the renderer draws and what a tap means', () => {
  it('round-trips, on every screen the game runs on', () => {
    for (const [cw, ch] of [
      [382, 336],
      [502, 342],
      [954, 775],
      [1400, 900],
      [320, 240],
    ]) {
      const v = viewFor(cw, ch, 500, 260);
      for (const [sx, sy] of [
        [0, 0],
        [cw / 2, ch / 2],
        [cw, ch],
        [17, 233],
      ]) {
        const [wx, wy] = toWorld(v, sx, sy);
        const [bx, by] = toScreen(v, wx, wy);
        expect(bx).toBeCloseTo(sx, 6);
        expect(by).toBeCloseTo(sy, 6);
      }
    }
  });

  it('puts a tap on the crew onto the crew’s own tile', () => {
    const focus = { x: 500, y: 260 };
    const v = viewFor(382, 336, focus.x, focus.y);
    // the middle of the canvas is where the camera centred the crew
    const [wx, wy] = toWorld(v, 382 / 2, 336 / 2);
    expect(((wx / T) | 0)).toBe((focus.x / T) | 0);
    expect(((wy / T) | 0)).toBe((focus.y / T) | 0);
  });
});

describe('where the camera looks', () => {
  it('is the middle of whoever is still alive', () => {
    expect(crewFocus([{ x: 100, y: 200 }, { x: 300, y: 400 }])).toEqual({ x: 200, y: 300 });
  });

  it('holds the middle of the lair when there is nobody left', () => {
    expect(crewFocus([])).toEqual({ x: W / 2, y: H / 2 });
  });
});

describe('a canvas with no size yet', () => {
  it('returns something usable instead of dividing by zero', () => {
    for (const [cw, ch] of [
      [0, 0],
      [0, 500],
      [500, 0],
    ]) {
      const v = viewFor(cw, ch, 100, 100);
      expect(Number.isFinite(v.k)).toBe(true);
      expect(v.k).toBeGreaterThan(0);
      expect(Number.isFinite(v.ox)).toBe(true);
      expect(Number.isFinite(v.oy)).toBe(true);
    }
  });
});
