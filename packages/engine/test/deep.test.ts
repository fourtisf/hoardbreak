/**
 * The deep gold.
 *
 * Siphoning was one flat rate over a twelve-tile rectangle, so where you stood
 * on the hoard did not matter — walk in, stop, wait. The coins directly under
 * the wyrm now pay a good deal more per second and wake it faster still, which
 * turns standing on the gold into a position you choose rather than a state you
 * enter. The trade is meant to be slightly bad on paper: it only pays off if
 * you can get out before the bill arrives.
 */
import { describe, expect, it } from 'vitest';
import {
  MODS,
  T,
  TUNING,
  createRun,
  dailySeed,
  step,
  type InputFrame,
  type RunMeta,
  type RunState,
  type Unit,
} from '../src/headless.js';

const IDLE: InputFrame = { mx: 0, my: 0, mm: 0, commands: [] };

const meta = (): RunMeta => ({
  depth: 1,
  uid: 2,
  crew: [{ tid: 1, name: 'Rats', kind: 'picklock', xp: 0 }],
  lost: [],
  items: { smoke: 0, lull: 0, trap: 0 },
  up: { dmg: 0, hp: 0, inc: 0 },
});

const mk = (): RunState => {
  const date = '2026-08-11';
  return createRun({ seed: dailySeed(date, 1), depth: 1, mod: MODS[4]!, meta: meta(), date });
};

/** Put the only thief on the hoard, either under the wyrm or out on the rim. */
const stand = (s: RunState, where: 'deep' | 'rim'): void => {
  const u = s.units[0] as Unit;
  if (where === 'deep') {
    u.x = s.dragon.x;
    u.y = s.dragon.y;
  } else {
    // the far corner of the hoard rectangle, comfortably outside the ring
    u.x = (s.hoard.x1 + 0.5) * T;
    u.y = (s.hoard.y1 + 0.5) * T;
    expect(Math.hypot(u.x - s.dragon.x, u.y - s.dragon.y)).toBeGreaterThan(TUNING.DEEP_R * T);
  }
};

/** Siphon for `secs` from one spot and report what it earned and what it cost. */
const siphon = (where: 'deep' | 'rim', secs = 3): { gold: number; wake: number } => {
  const s = mk();
  // the guards would rather fight than let a test measure anything
  s.guards.length = 0;
  const loot0 = s.loot;
  const wake0 = s.wake;
  for (let i = 0; i < secs * 60; i++) {
    stand(s, where);
    step(s, IDLE);
  }
  return { gold: s.loot - loot0, wake: s.wake - wake0 };
};

describe('where you stand on the hoard', () => {
  it('pays substantially more under the wyrm than out on the rim', () => {
    const rim = siphon('rim');
    const deep = siphon('deep');
    expect(deep.gold / rim.gold).toBeGreaterThan(2);
    expect(deep.gold / rim.gold).toBeLessThan(2.5);
  });

  it('wakes it faster than it pays, so greed is a gamble and not a strategy', () => {
    const rim = siphon('rim');
    const deep = siphon('deep');
    const payRatio = deep.gold / rim.gold;
    const wakeRatio = deep.wake / rim.wake;
    // the whole design rests on this inequality
    expect(wakeRatio).toBeGreaterThan(payRatio);
  });

  it('leaves the rim exactly as it always was', () => {
    // a flat crew on flat gold has to earn the prototype's rate, or every
    // number the game has ever shown a player quietly changed meaning
    const rim = siphon('rim', 2);
    expect(rim.gold).toBeCloseTo(TUNING.SIPHON_RATE * 2, 0);
  });

  it('says so, once, the first time somebody digs there', () => {
    const s = mk();
    s.guards.length = 0;
    const said: string[] = [];
    for (let i = 0; i < 180; i++) {
      stand(s, 'deep');
      step(s, IDLE);
      said.push(...s.out.feed.map((f) => f.msg));
      s.out.feed.length = 0;
    }
    expect(said.filter((m) => m.includes('under the wyrm'))).toHaveLength(1);
  });

  it('stays quiet for a crew that never leaves the rim', () => {
    const s = mk();
    s.guards.length = 0;
    const said: string[] = [];
    for (let i = 0; i < 180; i++) {
      stand(s, 'rim');
      step(s, IDLE);
      said.push(...s.out.feed.map((f) => f.msg));
      s.out.feed.length = 0;
    }
    expect(said.filter((m) => m.includes('under the wyrm'))).toHaveLength(0);
  });

  /**
   * The check that decides whether this is a mechanic or a trap.
   *
   * Play both lines to the same stopping point — "leave when the wyrm is nearly
   * up" — and neither may win on both axes. Deep has to bank its gold faster in
   * real seconds (which is what buys you a way past the guards at the door),
   * and the rim has to end up with more of it (which is what makes patience a
   * real option). If one side won both, there would be nothing to decide.
   */
  it('gives the greedy line speed and the patient line total, and neither both', () => {
    const play = (where: 'deep' | 'rim'): { gold: number; secs: number } => {
      const s = mk();
      s.guards.length = 0;
      let ticks = 0;
      while (s.wake < 90 && ticks < 60 * 120) {
        stand(s, where);
        step(s, IDLE);
        ticks++;
      }
      return { gold: s.loot, secs: ticks / 60 };
    };
    const deep = play('deep');
    const rim = play('rim');
    expect(deep.secs).toBeLessThan(rim.secs);
    expect(rim.gold).toBeGreaterThan(deep.gold);
  });

  it('drains the pool faster, so the door seals sooner too', () => {
    const mkDrain = (where: 'deep' | 'rim'): number => {
      const s = mk();
      s.guards.length = 0;
      for (let i = 0; i < 180; i++) {
        stand(s, where);
        step(s, IDLE);
      }
      return s.hoard.pool0 - s.hoard.pool;
    };
    expect(mkDrain('deep')).toBeGreaterThan(mkDrain('rim') * 2);
  });
});
