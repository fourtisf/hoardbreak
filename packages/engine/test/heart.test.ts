/**
 * The Heart of the hoard — the wake climax (v0.4).
 *
 * For the whole back half of a run the wyrm waking was an ending: the loot
 * stopped growing and the only move left was to walk to the door. Now waking it
 * bares the Heart it slept on, and taking it is a real fork — the banked loot
 * doubles, but the wyrm enrages and the roof starts coming down. These checks
 * pin the fork's terms: when it can be taken, what it pays, what it costs, and
 * that a run which never touches it plays exactly as it did before.
 */
import { describe, expect, it } from 'vitest';
import {
  T,
  TUNING,
  extractReady,
  heartPos,
  inZone,
  maxLootFor,
  step,
  type InputFrame,
  type RunState,
  type Unit,
} from '../src/headless.js';
import { mkRun, place, solo } from './helpers.js';

const IDLE: InputFrame = { mx: 0, my: 0, mm: 0, commands: [] };
const seize = (): InputFrame => ({ mx: 0, my: 0, mm: 0, commands: [{ c: 'seize' }] });

/** Drive the wake meter to the top and let the dragon actually wake. */
function wake(s: RunState): void {
  s.wake = TUNING.WAKE_MAX;
  step(s, IDLE);
  expect(s.dragon.awake).toBe(true);
}

/** Stand the (single) thief on the bare Heart at the centre of the bed.
 *  The bed is also the hoard, so the pool is emptied to keep siphoning — a
 *  separate mechanic — from perturbing the exact-loot checks. */
function onHeart(s: RunState): void {
  const p = heartPos(s);
  const u = s.units[0] as Unit;
  u.x = p.x;
  u.y = p.y;
  u.px = p.x;
  u.py = p.y;
  s.hoard.pool = 0;
}

describe('the Heart is only there once the wyrm is up', () => {
  it('is untouchable while it sleeps', () => {
    const s = mkRun();
    solo(s);
    expect(s.heartState).toBe('none');
    onHeart(s);
    step(s, seize());
    expect(s.heartState).toBe('none');
    expect(s.dragon.enraged).toBe(false);
  });

  it('lies bare the moment it wakes', () => {
    const s = mkRun();
    solo(s);
    wake(s);
    expect(s.heartState).toBe('exposed');
  });
});

describe('seizing it', () => {
  it('doubles the loot banked so far', () => {
    const s = mkRun();
    solo(s);
    s.loot = 4000;
    wake(s);
    onHeart(s);
    step(s, seize());
    expect(s.heartState).toBe('taken');
    expect(s.loot).toBe(8000);
  });

  it('enrages the wyrm and starts the collapse', () => {
    const s = mkRun();
    solo(s);
    s.loot = 1000;
    wake(s);
    onHeart(s);
    step(s, seize());
    expect(s.dragon.enraged).toBe(true);
    expect(s.collapseT).toBeGreaterThan(0);
    expect(s.collapseT).toBeLessThanOrEqual(TUNING.COLLAPSE_TIME);
  });

  it('cannot be taken twice — the second SEIZE is a no-op', () => {
    const s = mkRun();
    solo(s);
    s.loot = 500;
    wake(s);
    onHeart(s);
    step(s, seize());
    const banked = s.loot;
    step(s, seize());
    expect(s.loot).toBe(banked);
  });

  it('sends the crew for it when they are not standing on it yet', () => {
    const s = mkRun();
    solo(s);
    wake(s);
    // thief parked far from the bed
    place(s.units[0] as Unit, 5, 17);
    step(s, seize());
    // not taken yet, but armed and ordered toward the Heart
    expect(s.heartState).toBe('exposed');
    expect(s.heartArmed).toBe(true);
    expect(s.cmd).not.toBeNull();
  });
});

describe('the collapse', () => {
  it('ends the run when the timer runs out', () => {
    const s = mkRun();
    solo(s);
    s.loot = 1000;
    wake(s);
    onHeart(s);
    step(s, seize());
    // run the clock past the collapse, keeping the thief off the exit
    for (let i = 0; i < Math.ceil(TUNING.COLLAPSE_TIME * 60) + 5 && !s.over; i++) step(s, IDLE);
    expect(s.over).toBe(true);
  });

  it('gets the doubled loot out for whoever reached the door', () => {
    const s = mkRun();
    solo(s);
    s.loot = 2000;
    wake(s);
    onHeart(s);
    step(s, seize());
    expect(s.loot).toBe(4000);
    // walk the thief onto an exit tile and let the roof fall
    const ex = s.exitTiles[0] as number;
    place(s.units[0] as Unit, ex % 32, (ex / 32) | 0);
    expect(inZone(s, s.units[0] as Unit)).toBe(true);
    for (let i = 0; i < Math.ceil(TUNING.COLLAPSE_TIME * 60) + 5 && !s.over; i++) {
      place(s.units[0] as Unit, ex % 32, (ex / 32) | 0);
      step(s, IDLE);
    }
    expect(s.result?.success).toBe(true);
    expect(s.result?.heartTaken).toBe(true);
    expect(s.result?.loot).toBe(4000);
  });

  it('can still be escaped by pressing EXTRACT at the door', () => {
    const s = mkRun();
    solo(s);
    s.loot = 1500;
    wake(s);
    onHeart(s);
    step(s, seize());
    const ex = s.exitTiles[0] as number;
    place(s.units[0] as Unit, ex % 32, (ex / 32) | 0);
    expect(extractReady(s)).toBeGreaterThan(0);
    step(s, { mx: 0, my: 0, mm: 0, commands: [{ c: 'extract' }] });
    expect(s.result?.success).toBe(true);
    expect(s.result?.heartTaken).toBe(true);
  });
});

describe('a run that never touches the Heart', () => {
  it('reports heartTaken:false and leaves the loot alone', () => {
    const s = mkRun();
    solo(s);
    s.loot = 777;
    wake(s);
    const ex = s.exitTiles[0] as number;
    place(s.units[0] as Unit, ex % 32, (ex / 32) | 0);
    step(s, { mx: 0, my: 0, mm: 0, commands: [{ c: 'extract' }] });
    expect(s.result?.heartTaken).toBe(false);
    expect(s.result?.loot).toBe(777);
  });
});

describe('the loot ceiling', () => {
  it('allows for the whole take being doubled by the Heart', () => {
    const s = mkRun({ depth: 3 });
    // without the multiplier the ceiling would reject an honest heart run
    const piles = s.piles.reduce((a, p) => a + p.amt, 0);
    const naive = piles + s.hoard.pool0; // a lower bound on the pre-heart take
    expect(maxLootFor(s)).toBeGreaterThan(naive * TUNING.HEART_MUL);
  });
});
