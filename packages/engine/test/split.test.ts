/**
 * Splitting the crew.
 *
 * Before this, one tap moved everybody, so a roster of five classes played as
 * one blob and the differences between them barely mattered. A posting given to
 * one thief has to stick — including through a crew order arriving later — or
 * "hold this corridor" is a suggestion rather than an order.
 */
import { describe, expect, it } from 'vitest';
import { MODS, T, createRun, dailySeed, step, type InputFrame, type RunMeta, type RunState, type Unit } from '../src/headless.js';

const IDLE: InputFrame = { mx: 0, my: 0, mm: 0, commands: [] };

const meta = (): RunMeta => ({
  depth: 1,
  uid: 4,
  crew: [
    { tid: 1, name: 'Rats', kind: 'picklock', xp: 0 },
    { tid: 2, name: 'Wick', kind: 'picklock', xp: 0 },
    { tid: 3, name: 'Sable', kind: 'hexer', xp: 0 },
  ],
  lost: [],
  items: { smoke: 0, lull: 0, trap: 0 },
  up: { dmg: 0, hp: 0, inc: 0 },
});

const mk = (): RunState => {
  const date = '2026-08-11';
  return createRun({ seed: dailySeed(date, 1), depth: 1, mod: MODS[0]!, meta: meta(), date });
};
const run = (s: RunState, secs: number): void => {
  for (let i = 0; i < secs * 60; i++) step(s, IDLE);
};
const tile = (u: Unit): [number, number] => [(u.x / T) | 0, (u.y / T) | 0];
const by = (s: RunState, tid: number): Unit => s.units.find((u) => u.tid === tid) as Unit;

describe('posting one thief', () => {
  it('moves only them, and leaves the rest where they were', () => {
    const s = mk();
    const others = s.units.filter((u) => u.tid !== 2).map((u) => tile(u));
    step(s, { ...IDLE, commands: [{ c: 'move', x: 5, y: 19, tid: 2 }] });
    run(s, 4);
    expect(tile(by(s, 2))).toEqual([5, 19]);
    // the others drifted at most a tile on their leash, not across the room
    s.units
      .filter((u) => u.tid !== 2)
      .forEach((u, i) => {
        const [ox, oy] = others[i] as [number, number];
        expect(Math.hypot(tile(u)[0] - ox, tile(u)[1] - oy)).toBeLessThan(3);
      });
  });

  it('holds the post rather than drifting back to the crew', () => {
    const s = mk();
    step(s, { ...IDLE, commands: [{ c: 'move', x: 5, y: 19, tid: 2 }] });
    run(s, 4);
    const parked = tile(by(s, 2));
    run(s, 6);
    expect(tile(by(s, 2))).toEqual(parked);
  });

  it('outranks a crew order given while they are already posted', () => {
    const s = mk();
    step(s, { ...IDLE, commands: [{ c: 'move', x: 5, y: 19, tid: 2 }] });
    run(s, 4);
    // the rest are sent somewhere else; the posted thief must not follow
    step(s, { ...IDLE, commands: [{ c: 'move', x: 2, y: 16 }] });
    run(s, 3);
    expect(tile(by(s, 2))).not.toEqual([2, 16]);
  });

  it('is released only by an explicit recall', () => {
    const s = mk();
    step(s, { ...IDLE, commands: [{ c: 'move', x: 5, y: 19, tid: 2 }] });
    run(s, 4);
    expect(by(s, 2).ord).not.toBeNull();
    // a crew order does not sweep them up…
    step(s, { ...IDLE, commands: [{ c: 'move', x: 2, y: 16 }] });
    expect(by(s, 2).ord).not.toBeNull();
    // …but calling them back does
    step(s, { ...IDLE, commands: [{ c: 'recall', tid: 2 }] });
    expect(by(s, 2).ord).toBeNull();
  });

  it('lets a recalled thief rejoin the crew', () => {
    const s = mk();
    step(s, { ...IDLE, commands: [{ c: 'move', x: 5, y: 19, tid: 2 }] });
    run(s, 4);
    step(s, { ...IDLE, commands: [{ c: 'recall', tid: 2 }] });
    step(s, { ...IDLE, commands: [{ c: 'move', x: 3, y: 16 }] });
    run(s, 5);
    const [x, y] = tile(by(s, 2));
    expect(Math.hypot(x - 3, y - 16)).toBeLessThan(3);
  });

  it('ignores an order aimed at a thief who is not in the lair', () => {
    const s = mk();
    const before = s.units.map(tile);
    step(s, { ...IDLE, commands: [{ c: 'move', x: 5, y: 19, tid: 999 }] });
    run(s, 2);
    expect(s.units.map(tile)).toEqual(before);
  });

  it('refuses to post anyone inside solid rock', () => {
    const s = mk();
    // find a wall
    let wall: [number, number] | null = null;
    for (let y = 0; y < 22 && !wall; y++) for (let x = 0; x < 32; x++) if (!s.grid[y * 32 + x]) { wall = [x, y]; break; }
    expect(wall).not.toBeNull();
    step(s, { ...IDLE, commands: [{ c: 'move', x: wall![0], y: wall![1], tid: 2 }] });
    expect(by(s, 2).ord).toBeNull();
  });
});
