/**
 * Tap versus drag.
 *
 * On a phone, ordering the crew somewhere used to fire on *pointerdown*, so the
 * beginning of any drag that started on the lair — including a thumb reaching
 * for the joystick and missing it — flung four people at whatever tile the
 * finger first touched. That is a control bug you feel and cannot name, so it is
 * pinned here rather than left to a human noticing it again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput } from '../src/input.js';
import { T } from '../src/defs.js';

type Handler = (e: unknown) => void;

/** A canvas that records its listeners so a test can fire at them directly. */
function stubCanvas(): { el: HTMLCanvasElement; fire: (type: string, e: Record<string, unknown>) => void } {
  const on = new Map<string, Handler[]>();
  const el = {
    addEventListener: (t: string, h: Handler) => on.set(t, [...(on.get(t) ?? []), h]),
    removeEventListener: (t: string, h: Handler) => on.set(t, (on.get(t) ?? []).filter((x) => x !== h)),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 768, height: 528 }),
  } as unknown as HTMLCanvasElement;
  return {
    el,
    fire: (t, e) => (on.get(t) ?? []).forEach((h) => h({ preventDefault() {}, pointerType: 'touch', ...e })),
  };
}

beforeEach(() => {
  // createInput binds window keys and reads the clock; neither exists in node
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('performance', { now: () => Date.now() });
});

describe('tap to send the crew', () => {
  it('orders a move when a finger lands and lifts in the same place', () => {
    const c = stubCanvas();
    const input = createInput({ canvas: c.el });
    c.fire('pointerdown', { pointerId: 1, clientX: 240, clientY: 120 });
    c.fire('pointerup', { pointerId: 1, clientX: 242, clientY: 121 });
    expect(input.read().commands).toEqual([{ c: 'move', x: (242 / T) | 0, y: (121 / T) | 0 }]);
  });

  it('orders nothing when the finger travels — that was a drag, not an order', () => {
    const c = stubCanvas();
    const input = createInput({ canvas: c.el });
    c.fire('pointerdown', { pointerId: 1, clientX: 240, clientY: 120 });
    c.fire('pointerup', { pointerId: 1, clientX: 360, clientY: 210 });
    expect(input.read().commands).toEqual([]);
  });

  it('orders nothing when the press is cancelled by the browser', () => {
    const c = stubCanvas();
    const input = createInput({ canvas: c.el });
    c.fire('pointerdown', { pointerId: 1, clientX: 240, clientY: 120 });
    c.fire('pointercancel', { pointerId: 1 });
    c.fire('pointerup', { pointerId: 1, clientX: 240, clientY: 120 });
    expect(input.read().commands).toEqual([]);
  });

  it('ignores the lift of a finger it never saw land', () => {
    const c = stubCanvas();
    const input = createInput({ canvas: c.el });
    c.fire('pointerup', { pointerId: 9, clientX: 300, clientY: 300 });
    expect(input.read().commands).toEqual([]);
  });

  it('stays quiet while the game is paused', () => {
    const c = stubCanvas();
    const input = createInput({ canvas: c.el, enabled: () => false });
    c.fire('pointerdown', { pointerId: 1, clientX: 240, clientY: 120 });
    c.fire('pointerup', { pointerId: 1, clientX: 240, clientY: 120 });
    expect(input.read().commands).toEqual([]);
  });

  it('scales the tap through the canvas rect, so a shrunk canvas still aims true', () => {
    const on = new Map<string, Handler[]>();
    const el = {
      addEventListener: (t: string, h: Handler) => on.set(t, [...(on.get(t) ?? []), h]),
      removeEventListener: () => {},
      // half-size canvas: a tap at 100,100 on screen is 200,200 in lair space
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 384, height: 264 }),
    } as unknown as HTMLCanvasElement;
    const fire = (t: string, e: Record<string, unknown>): void =>
      (on.get(t) ?? []).forEach((h) => h({ preventDefault() {}, pointerType: 'touch', ...e }));
    const input = createInput({ canvas: el });
    fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    fire('pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(input.read().commands).toEqual([{ c: 'move', x: (200 / T) | 0, y: (200 / T) | 0 }]);
  });

  it('hands commands over once, then forgets them', () => {
    const c = stubCanvas();
    const input = createInput({ canvas: c.el });
    c.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    c.fire('pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(input.read().commands).toHaveLength(1);
    expect(input.read().commands).toHaveLength(0);
  });
});

describe('ordering one thief', () => {
  it('tags the tap with whoever was picked', () => {
    const c = stubCanvas();
    const input = createInput({ canvas: c.el });
    input.setSolo(7);
    c.fire('pointerdown', { pointerId: 1, clientX: 240, clientY: 120 });
    c.fire('pointerup', { pointerId: 1, clientX: 240, clientY: 120 });
    expect(input.read().commands).toEqual([{ c: 'move', x: 10, y: 5, tid: 7 }]);
  });

  it('hands the pointer back to the crew after one order', () => {
    const c = stubCanvas();
    const input = createInput({ canvas: c.el });
    input.setSolo(7);
    c.fire('pointerdown', { pointerId: 1, clientX: 240, clientY: 120 });
    c.fire('pointerup', { pointerId: 1, clientX: 240, clientY: 120 });
    input.read();
    c.fire('pointerdown', { pointerId: 2, clientX: 240, clientY: 120 });
    c.fire('pointerup', { pointerId: 2, clientX: 240, clientY: 120 });
    // no tid this time: a targeting mode you can forget is a mode that loses runs
    expect(input.read().commands).toEqual([{ c: 'move', x: 10, y: 5 }]);
  });

  it('is cleared by picking nobody', () => {
    const c = stubCanvas();
    const input = createInput({ canvas: c.el });
    input.setSolo(7);
    input.setSolo(null);
    c.fire('pointerdown', { pointerId: 1, clientX: 240, clientY: 120 });
    c.fire('pointerup', { pointerId: 1, clientX: 240, clientY: 120 });
    expect(input.read().commands).toEqual([{ c: 'move', x: 10, y: 5 }]);
  });
});
