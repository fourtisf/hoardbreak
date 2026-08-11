/**
 * The lockdown.
 *
 * Siphoning used to be a waiting room: stand on the gold, watch a bar fill,
 * leave when the bar said so. Nothing in the lair reacted to how much you had
 * taken, so "one more second" was free and the only real decision was made once,
 * at the start. Past half the hoard the guards now stop chasing whoever is
 * nearest and go stand on the only way out, which puts a price on the second
 * half and makes the way home the problem.
 */
import { describe, expect, it } from 'vitest';
import {
  MODS,
  T,
  TC,
  TUNING,
  createRun,
  dailySeed,
  step,
  type Guard,
  type InputFrame,
  type RunMeta,
  type RunState,
  type Unit,
} from '../src/headless.js';

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
/**
 * The same, but nobody dies.
 *
 * A crew standing still next to the door is dead inside ten seconds, and a
 * finished run freezes the guards where they stood — which would make a test
 * about where guards walk actually a test about how fast thieves die.
 */
const runAlive = (s: RunState, secs: number): void => {
  for (let i = 0; i < secs * 60; i++) {
    step(s, IDLE);
    for (const u of s.units) u.hp = u.max;
  }
};
/** Empty the hoard down to `frac` of its starting pool without moving anybody. */
const drain = (s: RunState, frac: number): void => {
  s.hoard.pool = s.hoard.pool0 * frac;
};
/**
 * Park the crew on the gold, as far from the door as the lair gets.
 *
 * With thieves standing next to the entrance a guard that arrives immediately
 * switches to fighting them, so "did it walk to the door" and "did it stop to
 * swing" become the same measurement. Out of reach, only one of them can happen.
 */
const stashCrewOnTheGold = (s: RunState): void => {
  for (const u of s.units) {
    u.x = (s.hoard.x0 + 1.5) * T;
    u.y = (s.hoard.y0 + 1.5) * T;
    u.path = null;
    u.ptile = -1;
  }
};
/** How far a guard is from the nearest exit tile, in tiles. */
const toExit = (s: RunState, g: Guard): number => {
  let best = 1e9;
  for (const tix of s.exitTiles) {
    best = Math.min(best, Math.hypot(g.x / T - (tix % TC) - 0.5, g.y / T - ((tix / TC) | 0) - 0.5));
  }
  return best;
};

describe('half the hoard', () => {
  it('does not seal the door while most of the gold is still there', () => {
    const s = mk();
    drain(s, 0.9);
    run(s, 1);
    expect(s.sealed).toBe(false);
  });

  it('seals it the moment the pool crosses the line', () => {
    const s = mk();
    expect(s.sealed).toBe(false);
    drain(s, 1 - TUNING.SEAL_AT - 0.01);
    step(s, IDLE);
    expect(s.sealed).toBe(true);
  });

  it('announces itself — a rule the player cannot see is not a rule', () => {
    const s = mk();
    drain(s, 0.2);
    step(s, IDLE);
    expect(s.banner?.t1).toBe('THE DOOR IS HELD');
    expect(s.out.feed.some((f) => f.msg.includes('turns for the entrance'))).toBe(true);
  });

  it('fires exactly once, however long the run goes on', () => {
    const s = mk();
    drain(s, 0.2);
    run(s, 4);
    expect(s.out.feed.filter((f) => f.msg.includes('turns for the entrance'))).toHaveLength(1);
  });

  it('wakes every guard, alert or not', () => {
    const s = mk();
    expect(s.guards.some((g) => !g.alert)).toBe(true);
    drain(s, 0.2);
    step(s, IDLE);
    expect(s.guards.every((g) => g.alert)).toBe(true);
  });

  it('costs the run its clean sheet — a hoard that size is missed', () => {
    const s = mk();
    expect(s.everSpotted).toBe(false);
    drain(s, 0.2);
    step(s, IDLE);
    // GHOST now means leaving before you took half, which is a different and
    // harder run than "stay forever and never get seen"
    expect(s.everSpotted).toBe(true);
  });
});

describe('guards under lockdown', () => {
  it('close on the exit from the far side of the lair', () => {
    const s = mk();
    drain(s, 0.2);
    stashCrewOnTheGold(s);
    // guards a long way from the door AND out of reach of the crew, so walking
    // to the entrance is the only thing the seal could make them do
    const far = s.guards.filter(
      (g) => toExit(s, g) > 8 && Math.hypot(g.x - (s.units[0] as Unit).x, g.y - (s.units[0] as Unit).y) > 8 * T,
    );
    expect(far.length).toBeGreaterThan(0);
    runAlive(s, 40);
    // BFS through a winding lair can lead away before it leads home, so this
    // asks where they ended up, not that every step was toward the door
    far.forEach((g) => expect(toExit(s, g)).toBeLessThan(4));
  });

  it('spread across the strip rather than stacking on one tile', () => {
    const s = mk();
    drain(s, 0.2);
    stashCrewOnTheGold(s);
    runAlive(s, 40);
    const parked = s.guards.filter((g) => toExit(s, g) < 3);
    expect(parked.length).toBeGreaterThan(1);
    const tiles = new Set(parked.map((g) => `${(g.x / T) | 0},${(g.y / T) | 0}`));
    expect(tiles.size).toBeGreaterThan(1);
  });

  it('still swings at anyone who walks into reach', () => {
    const s = mk();
    drain(s, 0.2);
    step(s, IDLE);
    const g = s.guards[0] as Guard;
    // put the crew in the guard's face; it must fight rather than march past
    for (const u of s.units) {
      u.x = g.x + T * 0.6;
      u.y = g.y;
    }
    const hp = s.units.map((u) => u.hp);
    run(s, 2);
    expect(s.units.some((u, i) => u.hp < (hp[i] as number))).toBe(true);
  });

  it('leaves a lair nobody has robbed alone', () => {
    const s = mk();
    const before = s.guards.map((g) => toExit(s, g));
    run(s, 6);
    // untouched hoard, crew standing still: nothing should be converging
    expect(s.sealed).toBe(false);
    const after = s.guards.map((g) => toExit(s, g));
    expect(after.filter((d, i) => d < (before[i] as number) - 1)).toHaveLength(0);
  });
});
